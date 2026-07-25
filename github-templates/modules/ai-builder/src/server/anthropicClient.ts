// Minimal Anthropic Messages API client. Round-7.
//
// Why a hand-rolled fetch wrapper instead of the SDK:
//   - The plugin is install-linked; bundling `@anthropic-ai/sdk` here
//     would force the SDK on every plugin's dependency tree.
//   - We need a single tight surface (POST /messages) with prompt
//     caching + streaming control + injectable fetchImpl for smoke
//     tests. The SDK's wider surface isn't worth the cost.
//
// Prompt caching is enabled by setting `cache_control: { type: "ephemeral" }`
// on the system block. The Messages API returns
// `usage.cache_creation_input_tokens` + `usage.cache_read_input_tokens`
// the pipeline accumulates into the per-generation cost.
//
// **Reference**: docs.anthropic.com/en/api/messages — payload shape
// matches the Messages API v1 contract.

import type { ModelId, CacheUsage } from "../lib/domain";

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface CreateMessageInput {
  model: ModelId;
  apiKey: string;
  // System prompt — pass an array of blocks to opt into prompt
  // caching on the static portion (we always cache the block-library
  // section since it's huge + reused across every generation).
  system: AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  maxTokens: number;
  temperature?: number;
  // For non-streaming use. Streaming is handled separately to keep
  // the smoke test simple.
  stream?: false;
  // Optional override — smoke tests inject a mocked fetch.
  fetchImpl?: typeof fetch;
  // Optional override — caller can switch the API base URL (defaults
  // to https://api.anthropic.com).
  baseUrl?: string;
}

export interface CreateMessageResult {
  id: string;
  modelId: ModelId;
  // Concatenated text from every text block in `content`.
  text: string;
  stopReason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | (string & {});
  usage: CacheUsage;
}

export interface AnthropicErrorEnvelope {
  type: "error";
  error: { type: string; message: string };
}

interface AnthropicMessageResponse {
  id: string;
  model: ModelId;
  content: Array<{ type: "text"; text: string } | { type: string }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export async function createMessage(input: CreateMessageInput): Promise<CreateMessageResult> {
  if (!input.apiKey) {
    throw new Error("Anthropic API key not configured. Set install.config.anthropicApiKey.");
  }
  const fetchFn = input.fetchImpl ?? fetch;
  const url = `${input.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
  const body = {
    model: input.model,
    max_tokens: input.maxTokens,
    temperature: input.temperature ?? 0.6,
    system: input.system,
    messages: input.messages,
  };
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      // Prompt caching is a generally-available feature on the
      // Messages API. No beta header needed for ephemeral caching as
      // of model 4-x. (Per docs.anthropic.com.)
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `status ${res.status}`;
    try {
      const err = await res.json() as AnthropicErrorEnvelope;
      if (err.error?.message) message = err.error.message;
    } catch { /* fall through */ }
    throw new AnthropicCallError(message, res.status);
  }
  const data = await res.json() as AnthropicMessageResponse;
  const text = data.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map(b => b.text)
    .join("");
  const usage: CacheUsage = {
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    ...(data.usage.cache_creation_input_tokens !== undefined ? { cacheCreationInputTokens: data.usage.cache_creation_input_tokens } : {}),
    ...(data.usage.cache_read_input_tokens !== undefined ? { cacheReadInputTokens: data.usage.cache_read_input_tokens } : {}),
  };
  return {
    id: data.id,
    modelId: data.model,
    text,
    stopReason: data.stop_reason,
    usage,
  };
}

export class AnthropicCallError extends Error {
  override name = "AnthropicCallError";
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

// ─── Streaming ──────────────────────────────────────────────────────────────
// R8 — SSE streaming variant. Anthropic's SSE protocol emits frames like:
//   event: message_start
//   data: {"type":"message_start", ...}
//   event: content_block_delta
//   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}
//   event: message_delta
//   data: {"type":"message_delta","usage":{"output_tokens":…}}
//   event: message_stop
//   data: {"type":"message_stop"}
// We forward each text delta via callback + return a final result with the
// accumulated text + usage. The smoke test injects fetchImpl returning a
// hand-built ReadableStream so we never hit the network.

export interface StreamMessageInput extends Omit<CreateMessageInput, "stream"> {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

export async function streamMessage(input: StreamMessageInput): Promise<CreateMessageResult> {
  if (!input.apiKey) throw new Error("Anthropic API key not configured. Set install.config.anthropicApiKey.");
  const fetchFn = input.fetchImpl ?? fetch;
  const url = `${input.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
  const body = {
    model: input.model,
    max_tokens: input.maxTokens,
    temperature: input.temperature ?? 0.6,
    system: input.system,
    messages: input.messages,
    stream: true,
  };
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "accept": "text/event-stream",
    },
    body: JSON.stringify(body),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (!res.ok || !res.body) {
    let message = `status ${res.status}`;
    try {
      const err = await res.json() as AnthropicErrorEnvelope;
      if (err.error?.message) message = err.error.message;
    } catch { /* fall through */ }
    throw new AnthropicCallError(message, res.status);
  }

  let id = "";
  let modelId: ModelId = input.model;
  let stopReason = "end_turn";
  const usage: CacheUsage = { inputTokens: 0, outputTokens: 0 };
  let text = "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are separated by blank lines. Process any complete ones.
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = frame.split("\n").find(l => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload) continue;
      try {
        const event = JSON.parse(payload) as {
          type: string;
          message?: { id?: string; model?: string; usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } };
          delta?: { type?: string; text?: string; stop_reason?: string };
          usage?: { output_tokens?: number };
        };
        if (event.type === "message_start" && event.message) {
          if (event.message.id) id = event.message.id;
          if (event.message.model) modelId = event.message.model as ModelId;
          if (event.message.usage) {
            usage.inputTokens = event.message.usage.input_tokens ?? 0;
            if (event.message.usage.cache_creation_input_tokens !== undefined) {
              usage.cacheCreationInputTokens = event.message.usage.cache_creation_input_tokens;
            }
            if (event.message.usage.cache_read_input_tokens !== undefined) {
              usage.cacheReadInputTokens = event.message.usage.cache_read_input_tokens;
            }
          }
        } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
          text += event.delta.text;
          input.onDelta?.(event.delta.text);
        } else if (event.type === "message_delta") {
          if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
          if (event.usage?.output_tokens !== undefined) usage.outputTokens = event.usage.output_tokens;
        }
      } catch { /* ignore malformed frame */ }
    }
  }

  return { id, modelId, text, stopReason, usage };
}
