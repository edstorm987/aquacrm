// Domain types for @aqua/plugin-ai-builder. Round-7.

import type { AgencyId, ClientId, UserId } from "./tenancy";

export type GenerationStatus =
  | "queued"
  | "streaming"
  | "completed"
  | "failed"
  | "rejected"; // schema-validation rejected the model output

export type ModelId =
  | "claude-haiku-4-5-20251001"
  | "claude-haiku-4-5"
  | "claude-sonnet-4-6"
  | "claude-opus-4-7"
  | (string & {});

// Block tree shape mirrors the website-editor's `Block`. We don't
// import directly (cross-plugin source coupling); the editor's type
// is the canonical one, ours is structural-only for storage + IPC.
export interface BlockTreeNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  children?: BlockTreeNode[];
}

export interface CacheUsage {
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Generation {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  prompt: string;
  contextHints?: string;
  // The validated tree the operator can insert. Null while the
  // generation is still streaming or has failed validation.
  blockTree: BlockTreeNode[] | null;
  // Raw text response for debugging.
  rawResponse?: string;
  modelId: ModelId;
  // Token + cost accounting. costCents is computed from per-model
  // pricing (Haiku 4.5: $1/M input, $5/M output; Sonnet 4.6: $3/M
  // input, $15/M output — divided by 1000 gives mTokens, ×100 → cents).
  costCents: number;
  usage?: CacheUsage;
  status: GenerationStatus;
  // The operator who triggered the generation.
  createdBy: UserId;
  createdAt: number;
  completedAt?: number;
  // When the schema validator rejected the model output, this is the
  // first error message (used by the UI to surface "regenerate" hints).
  validationError?: string;
  // Number of retry attempts spent producing this generation. The
  // pipeline auto-retries once on schema-validation failures with a
  // sharper system-prompt note about the issue.
  retryCount?: number;
}

// Per-install settings. The Anthropic API key lives in `install.config`
// — never in env. Mirrors T2's per-install Stripe pattern.
export interface AiBuilderConfig {
  anthropicApiKey?: string;
  defaultModel?: ModelId;
  fallbackModel?: ModelId;
  // Prompt-caching toggle — operator can disable for debugging.
  cacheSystemPrompt?: boolean;
  // Hard ceiling on tokens per generation. v1 default 4096 output tokens.
  maxTokens?: number;
  // R9 — image generation provider. "stub" returns picsum placeholders;
  // "openai" calls OpenAI gpt-image-1 (foundation injects the port).
  imageProvider?: "stub" | "openai";
  openaiApiKey?: string;
  // R9 — per-agency monthly cost ceilings. Both consult the same
  // `metrics/usage/<YYYY-MM>` counter; over-ceiling → handler returns
  // {ok:false, error:"ceiling-reached", resetsOn:<ISO>}.
  monthlyTokenCeiling?: number;
  monthlyImageCeiling?: number;
}

// R9 — usage roll-up for the current ISO month (YYYY-MM). Stored
// under `metrics/usage/<key>` so a new month auto-rolls a fresh
// counter — old months are kept for historical lookup. The settings
// `currentMonthUsage` projection is just `usage(now())`.
export interface MonthlyUsage {
  monthKey: string;   // "2026-05"
  tokens: number;
  images: number;
}

export const DEFAULT_CONFIG: AiBuilderConfig = {
  anthropicApiKey: undefined,
  defaultModel: "claude-haiku-4-5-20251001",
  fallbackModel: "claude-sonnet-4-6",
  cacheSystemPrompt: true,
  maxTokens: 4096,
  imageProvider: "stub",
  monthlyTokenCeiling: 10_000_000,
  monthlyImageCeiling: 200,
};

export function monthKeyForDate(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function nextMonthResetIso(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const next = new Date(Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1, 0, 0, 0));
  return next.toISOString();
}

// Per-model pricing (cents per 1M tokens). Used by the cost-cents
// accumulator. Conservative defaults — operator can override per
// install if Anthropic ships a price change between rounds.
export const MODEL_PRICING_CENTS_PER_M_TOKENS: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  "claude-haiku-4-5-20251001": { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 },
  "claude-haiku-4-5":          { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 },
  "claude-sonnet-4-6":         { input: 300, output: 1500, cacheRead: 30, cacheWrite: 375 },
  "claude-opus-4-7":           { input: 1500, output: 7500, cacheRead: 150, cacheWrite: 1875 },
};

export function computeCostCents(modelId: ModelId, usage: CacheUsage | undefined): number {
  if (!usage) return 0;
  const pricing = MODEL_PRICING_CENTS_PER_M_TOKENS[modelId] ?? MODEL_PRICING_CENTS_PER_M_TOKENS["claude-haiku-4-5-20251001"]!;
  // Convert per-million-tokens cents → per-token; floats for accuracy
  // until the final total is rounded to a whole cent.
  const cacheReadRate = pricing.cacheRead ?? pricing.input;
  const cacheWriteRate = pricing.cacheWrite ?? pricing.input;
  const cacheReadCost = (usage.cacheReadInputTokens ?? 0) * cacheReadRate / 1_000_000;
  const cacheWriteCost = (usage.cacheCreationInputTokens ?? 0) * cacheWriteRate / 1_000_000;
  const inputCost = usage.inputTokens * pricing.input / 1_000_000;
  const outputCost = usage.outputTokens * pricing.output / 1_000_000;
  return Math.round(cacheReadCost + cacheWriteCost + inputCost + outputCost);
}
