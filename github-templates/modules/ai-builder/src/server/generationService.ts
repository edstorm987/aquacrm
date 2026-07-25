// GenerationService — Round-7 core. Builds the system prompt from the
// block library, calls Anthropic, parses + validates the response,
// retries once on validation failure with a sharper hint.
//
// Storage layout under `t/{agencyId}/{clientId|_agency}/ai-builder/`:
//   - `generations/<id>`            — full record
//   - `generations-index/<id>`      — `(createdAt|id)` for desc-sort scans
//   - `metrics/cache-hits`          — `{ count }` accumulator (smoke checks)
//   - `metrics/cost-cents`          — running total
//
// The metric counters are intentionally simple — round-7 rolls up
// per-day in a future analytics polish; for now smoke just asserts
// the cache-hit counter increments when the prompt is reused.

import type { PluginCtx, PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import {
  computeCostCents,
  DEFAULT_CONFIG,
  monthKeyForDate,
  nextMonthResetIso,
  type AiBuilderConfig,
  type BlockTreeNode,
  type CacheUsage,
  type Generation,
  type ModelId,
  type MonthlyUsage,
} from "../lib/domain";
import {
  listBlockSchemas,
  validateBlockTree,
  type BlockSchemaEntry,
  type ValidationError,
} from "../lib/blockSchema";
import {
  createMessage,
  streamMessage,
  AnthropicCallError,
  type AnthropicSystemBlock,
} from "./anthropicClient";

export interface GenerateInput {
  prompt: string;
  contextHints?: string;
  // Optional override — caller can pin the model (operator picks
  // "harder generation" → Sonnet 4.6).
  modelOverride?: ModelId;
  // Optional injection point for smoke tests — when provided, the
  // service bypasses the Anthropic HTTP call and returns this raw
  // text directly. The validator + cost path still run as normal.
  fakeRawResponse?: string;
  fakeUsage?: CacheUsage;
  // Smoke / SSR fetch override.
  fetchImpl?: typeof fetch;
}

export interface GenerateStreamInput {
  prompt: string;
  contextHints?: string;
  modelOverride?: ModelId;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
}

export interface GenerationServiceDeps {
  agencyId: AgencyId;
  clientId?: ClientId;
  actor: UserId;
  storage: PluginStorage;
  config: AiBuilderConfig;
}

export class GenerationService {
  constructor(private readonly deps: GenerationServiceDeps) {}

  async generate(input: GenerateInput): Promise<Generation> {
    const startedAt = Date.now();
    const id = makeId("gen");
    const config = { ...DEFAULT_CONFIG, ...this.deps.config };
    const initialModel = input.modelOverride ?? config.defaultModel ?? DEFAULT_CONFIG.defaultModel!;

    let record: Generation = {
      id,
      agencyId: this.deps.agencyId,
      ...(this.deps.clientId ? { clientId: this.deps.clientId } : {}),
      prompt: input.prompt,
      ...(input.contextHints ? { contextHints: input.contextHints } : {}),
      blockTree: null,
      modelId: initialModel,
      costCents: 0,
      status: "queued",
      createdBy: this.deps.actor,
      createdAt: startedAt,
      retryCount: 0,
    };

    // R9 ceiling check — token ceiling consults the same monthly
    // usage roll-up the image service writes to. Over budget → return
    // a synthetic "rejected" record with kind=ceiling-reached so the UI
    // can surface a friendly banner without a separate error path.
    const ceilingHit = await this.checkTokenCeiling(config);
    if (ceilingHit) {
      record = { ...record, status: "rejected", validationError: `ceiling-reached: ${ceilingHit.reason}; resets ${ceilingHit.resetsOn}`, completedAt: Date.now() };
      await this.persist(record);
      return record;
    }

    try {
      record = await this.runOnce(record, input, initialModel, undefined);
      // First attempt rejected on validation? Retry once with the
      // fallback model + the validation errors fed back into the
      // prompt as a hint.
      if (record.status === "rejected" && config.fallbackModel && config.fallbackModel !== initialModel) {
        const retryHint = `Previous attempt failed schema validation:\n${record.validationError ?? "(no detail)"}\nReturn ONLY a JSON array of block nodes matching the schema.`;
        record = await this.runOnce(
          { ...record, retryCount: (record.retryCount ?? 0) + 1, status: "queued", validationError: undefined },
          input,
          config.fallbackModel,
          retryHint,
        );
      }
    } catch (e) {
      record = {
        ...record,
        status: "failed",
        validationError: e instanceof Error ? e.message : String(e),
        completedAt: Date.now(),
      };
    }

    await this.persist(record);
    return record;
  }

  // ─── R9: ceilings + usage ──────────────────────────────────────────────
  async checkTokenCeiling(config: AiBuilderConfig): Promise<{ reason: string; resetsOn: string } | null> {
    const ceiling = config.monthlyTokenCeiling ?? DEFAULT_CONFIG.monthlyTokenCeiling!;
    const u = await this.usageThisMonth();
    if (u.tokens >= ceiling) {
      return { reason: `tokens used ${u.tokens} >= ceiling ${ceiling}`, resetsOn: nextMonthResetIso() };
    }
    return null;
  }

  async usageThisMonth(): Promise<MonthlyUsage> {
    const monthKey = monthKeyForDate();
    const cur = await this.deps.storage.get<MonthlyUsage>(this.usageKey(monthKey));
    return cur ?? { monthKey, tokens: 0, images: 0 };
  }

  async bumpUsageTokens(by: number): Promise<void> {
    const cur = await this.usageThisMonth();
    await this.deps.storage.set(this.usageKey(cur.monthKey), {
      monthKey: cur.monthKey,
      tokens: cur.tokens + by,
      images: cur.images,
    });
  }

  private usageKey(monthKey: string): string {
    return `${this.tenantPrefix}/metrics/usage/${monthKey}`;
  }

  // ─── Streaming (R8) ────────────────────────────────────────────────────
  // generateStream — same pipeline as generate(), but emits incremental
  // text deltas via onDelta as they arrive from Anthropic. The final
  // record is persisted + returned the same way. No fallback-model retry
  // on the streaming path: streaming is for the live editor preview;
  // operators can hit Generate again or fall through to the non-stream
  // endpoint for the retry path. Smoke injects fetchImpl so we never hit
  // the network.
  async generateStream(
    input: GenerateStreamInput,
  ): Promise<Generation> {
    const startedAt = Date.now();
    const id = makeId("gen");
    const config = { ...DEFAULT_CONFIG, ...this.deps.config };
    const model = input.modelOverride ?? config.defaultModel ?? DEFAULT_CONFIG.defaultModel!;

    let record: Generation = {
      id,
      agencyId: this.deps.agencyId,
      ...(this.deps.clientId ? { clientId: this.deps.clientId } : {}),
      prompt: input.prompt,
      ...(input.contextHints ? { contextHints: input.contextHints } : {}),
      blockTree: null,
      modelId: model,
      costCents: 0,
      status: "queued",
      createdBy: this.deps.actor,
      createdAt: startedAt,
      retryCount: 0,
    };

    const ceilingHit = await this.checkTokenCeiling(config);
    if (ceilingHit) {
      record = { ...record, status: "rejected", validationError: `ceiling-reached: ${ceilingHit.reason}; resets ${ceilingHit.resetsOn}`, completedAt: Date.now() };
      await this.persist(record);
      return record;
    }

    const schemas = listBlockSchemas();
    const system = buildSystemPrompt(schemas, config.cacheSystemPrompt !== false);
    const userMessage = buildUserMessage(input.prompt, input.contextHints, undefined);

    let raw = "";
    let usage: CacheUsage = { inputTokens: 0, outputTokens: 0 };
    try {
      const apiKey = config.anthropicApiKey ?? "";
      const result = await streamMessage({
        model,
        apiKey,
        system,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens!,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.onDelta ? { onDelta: input.onDelta } : {}),
      });
      raw = result.text;
      usage = result.usage;
    } catch (e) {
      if (e instanceof AnthropicCallError) {
        record = { ...record, status: "failed", validationError: e.message, completedAt: Date.now() };
      } else {
        record = { ...record, status: "failed", validationError: e instanceof Error ? e.message : String(e), completedAt: Date.now() };
      }
      await this.persist(record);
      return record;
    }

    if ((usage.cacheReadInputTokens ?? 0) > 0) await this.bumpMetric("cache-hits", 1);
    const cost = computeCostCents(model, usage);
    await this.bumpMetric("cost-cents", cost);
    // R9 — same per-month token roll-up the non-stream path uses.
    await this.bumpUsageTokens(usage.inputTokens + usage.outputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0));

    const parsed = parseBlockTreeFromText(raw);
    if (!parsed.ok) {
      record = { ...record, rawResponse: raw, status: "rejected", validationError: parsed.error, usage, costCents: cost, completedAt: Date.now() };
      await this.persist(record);
      return record;
    }
    const validation = validateBlockTree(parsed.tree);
    if (!validation.ok) {
      record = { ...record, rawResponse: raw, status: "rejected", validationError: summariseErrors(validation.errors), usage, costCents: cost, completedAt: Date.now() };
      await this.persist(record);
      return record;
    }
    record = { ...record, blockTree: parsed.tree, rawResponse: raw, status: "completed", usage, costCents: cost, completedAt: Date.now() };
    await this.persist(record);
    return record;
  }

  // ─── List + lookup ──────────────────────────────────────────────────────

  async list(limit = 50): Promise<Generation[]> {
    const indexKeys = await this.deps.storage.list(this.indexKey(""));
    const recent = indexKeys
      .map(k => k.replace(this.indexKey(""), ""))
      .sort((a, b) => b.localeCompare(a))     // descending by `(createdAt|id)`
      .slice(0, limit);
    const out: Generation[] = [];
    for (const idLine of recent) {
      const id = idLine.split("|")[1] ?? "";
      if (!id) continue;
      const record = await this.deps.storage.get<Generation>(this.recordKey(id));
      if (record) out.push(record);
    }
    return out;
  }

  async get(id: string): Promise<Generation | undefined> {
    return this.deps.storage.get<Generation>(this.recordKey(id));
  }

  async metrics(): Promise<{ cacheHits: number; costCentsTotal: number }> {
    const cacheHits = (await this.deps.storage.get<{ count: number }>(this.metricKey("cache-hits")))?.count ?? 0;
    const costCentsTotal = (await this.deps.storage.get<{ count: number }>(this.metricKey("cost-cents")))?.count ?? 0;
    return { cacheHits, costCentsTotal };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async runOnce(
    record: Generation,
    input: GenerateInput,
    model: ModelId,
    extraHint: string | undefined,
  ): Promise<Generation> {
    const config = { ...DEFAULT_CONFIG, ...this.deps.config };
    const schemas = listBlockSchemas();
    const system = buildSystemPrompt(schemas, config.cacheSystemPrompt !== false);
    const userMessage = buildUserMessage(input.prompt, input.contextHints, extraHint);

    let raw: string;
    let usage: CacheUsage;
    if (input.fakeRawResponse !== undefined) {
      raw = input.fakeRawResponse;
      usage = input.fakeUsage ?? { inputTokens: 0, outputTokens: 0 };
    } else {
      try {
        const apiKey = config.anthropicApiKey ?? "";
        const result = await createMessage({
          model,
          apiKey,
          system,
          messages: [{ role: "user", content: userMessage }],
          maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens!,
          ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        });
        raw = result.text;
        usage = result.usage;
      } catch (e) {
        if (e instanceof AnthropicCallError) {
          return {
            ...record,
            modelId: model,
            status: "failed",
            validationError: e.message,
            completedAt: Date.now(),
          };
        }
        throw e;
      }
    }

    // Bump the cache-hit counter when the cache_read_input_tokens > 0.
    if ((usage.cacheReadInputTokens ?? 0) > 0) {
      await this.bumpMetric("cache-hits", 1);
    }

    const cost = computeCostCents(model, usage);
    await this.bumpMetric("cost-cents", cost);
    // R9 — roll into the per-month token counter that the ceiling consults.
    await this.bumpUsageTokens(usage.inputTokens + usage.outputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0));

    const parsed = parseBlockTreeFromText(raw);
    if (!parsed.ok) {
      return {
        ...record,
        modelId: model,
        rawResponse: raw,
        status: "rejected",
        validationError: parsed.error,
        usage,
        costCents: (record.costCents ?? 0) + cost,
        completedAt: Date.now(),
      };
    }

    const validation = validateBlockTree(parsed.tree);
    if (!validation.ok) {
      return {
        ...record,
        modelId: model,
        rawResponse: raw,
        status: "rejected",
        validationError: summariseErrors(validation.errors),
        usage,
        costCents: (record.costCents ?? 0) + cost,
        completedAt: Date.now(),
      };
    }

    return {
      ...record,
      modelId: model,
      blockTree: parsed.tree,
      rawResponse: raw,
      status: "completed",
      usage,
      costCents: (record.costCents ?? 0) + cost,
      completedAt: Date.now(),
    };
  }

  private async persist(record: Generation): Promise<void> {
    await this.deps.storage.set(this.recordKey(record.id), record);
    await this.deps.storage.set(this.indexKey(`${record.createdAt}|${record.id}`), { id: record.id });
  }

  private async bumpMetric(name: string, by: number): Promise<void> {
    const cur = (await this.deps.storage.get<{ count: number }>(this.metricKey(name)))?.count ?? 0;
    await this.deps.storage.set(this.metricKey(name), { count: cur + by });
  }

  private get tenantPrefix(): string {
    return `t/${this.deps.agencyId}/${this.deps.clientId ?? "_agency"}/ai-builder`;
  }
  private recordKey(id: string): string  { return `${this.tenantPrefix}/generations/${id}`; }
  private indexKey(suffix: string): string { return `${this.tenantPrefix}/generations-index/${suffix}`; }
  private metricKey(name: string): string  { return `${this.tenantPrefix}/metrics/${name}`; }
}

// ─── Container builder ──────────────────────────────────────────────────────

export function buildContainer(ctx: PluginCtx): { generations: GenerationService } {
  const config = (ctx.install.config as AiBuilderConfig | undefined) ?? {};
  const deps: GenerationServiceDeps = {
    agencyId: ctx.agencyId,
    ...(ctx.clientId ? { clientId: ctx.clientId } : {}),
    actor: ctx.actor,
    storage: ctx.storage,
    config,
  };
  return { generations: new GenerationService(deps) };
}

// ─── Prompt builders + parser ───────────────────────────────────────────────

const SYSTEM_PREAMBLE = `You are the AI page-builder for the Aqua portal's website-editor plugin.
Your job is to translate a one-line operator description into a valid Block tree the editor can render.

Rules:
- Output ONLY a JSON array of block nodes. No prose, no markdown fences.
- Every block has { id, type, props?, children? }. id is a short unique slug.
- Use ONLY the block types listed in the schema below.
- Container blocks (section/row/column/grid) wrap content; leaf blocks set props per the schema.
- Set sensible defaults for required props if the operator didn't specify.
- Keep the tree shallow (≤ 4 levels). Wrap top-level content in a section.
- For commerce blocks (requiresPlugin: ecommerce), only include them if the prompt mentions products / cart / checkout / pricing / store.

Block library schema follows.
`;

export function buildSystemPrompt(schemas: BlockSchemaEntry[], cache: boolean): AnthropicSystemBlock[] {
  // The static catalogue lives in its own block so prompt caching
  // hits on it across calls. The preamble is also static; we keep it
  // in the same block so the cache key is "the whole system prompt"
  // — the model only sees one cached chunk.
  const text = `${SYSTEM_PREAMBLE}\n\n${renderSchemaSection(schemas)}`;
  const block: AnthropicSystemBlock = { type: "text", text };
  if (cache) block.cache_control = { type: "ephemeral" };
  return [block];
}

function renderSchemaSection(schemas: BlockSchemaEntry[]): string {
  // Stable order: by category, then by type. Keeps the cache key
  // deterministic across invocations.
  const sorted = [...schemas].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.type.localeCompare(b.type);
  });
  const lines = sorted.map(b => {
    const fields = b.fields
      .map(f => `${f.key}:${f.type}${f.options ? `=[${f.options.map(o => o.value).join("|")}]` : ""}${f.default !== undefined ? `?${JSON.stringify(f.default)}` : ""}`)
      .join(", ");
    const tags: string[] = [];
    if (b.isContainer) tags.push("container");
    if (b.requiresPlugin) tags.push(`requires:${b.requiresPlugin}`);
    const tagSuffix = tags.length > 0 ? ` [${tags.join(",")}]` : "";
    return `- ${b.type} (${b.category}${tagSuffix}): ${fields || "(no fields)"}`;
  });
  return `BLOCK SCHEMA (${schemas.length} types):\n${lines.join("\n")}`;
}

export function buildUserMessage(prompt: string, hints: string | undefined, retryHint: string | undefined): string {
  const parts: string[] = [];
  parts.push(`Operator description:\n${prompt}`);
  if (hints) parts.push(`\nContext hints:\n${hints}`);
  if (retryHint) parts.push(`\n${retryHint}`);
  parts.push("\nReturn the JSON array now.");
  return parts.join("\n");
}

export interface ParseResult {
  ok: boolean;
  tree: BlockTreeNode[];
  error?: string;
}

export function parseBlockTreeFromText(raw: string): ParseResult {
  // Trim markdown code fences if the model returned them.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      return { ok: false, tree: [], error: "Response is not a JSON array." };
    }
    return { ok: true, tree: parsed as BlockTreeNode[] };
  } catch (e) {
    return {
      ok: false,
      tree: [],
      error: `Couldn't parse JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function summariseErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return "Validation failed without details.";
  if (errors.length === 1) return `${errors[0]!.path}: ${errors[0]!.message}`;
  return `${errors.length} errors. First: ${errors[0]!.path}: ${errors[0]!.message}`;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
