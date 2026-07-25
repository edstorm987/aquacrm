// Public server-side surface for `@aqua/plugin-ai-builder/server`.
//
// Foundation imports `buildContainer(ctx)` to dispatch admin actions;
// other plugins import `setBlockSchemaPort` to register their block
// catalogue (the editor's website-editor plugin is the typical caller
// — it implements `BlockSchemaPort` and calls
// `setBlockSchemaPort(impl)` once at boot).

export { buildContainer, GenerationService } from "./generationService";
export { createMessage, AnthropicCallError } from "./anthropicClient";
export type { CreateMessageInput, CreateMessageResult } from "./anthropicClient";
export { setBlockSchemaPort, getBlockSchemaPort } from "../lib/blockSchema";
export type { BlockSchemaPort, BlockSchemaEntry, BlockFieldSchema } from "../lib/blockSchema";
export type {
  Generation,
  GenerationStatus,
  ModelId,
  AiBuilderConfig,
  BlockTreeNode,
  CacheUsage,
} from "../lib/domain";
export {
  DEFAULT_CONFIG,
  computeCostCents,
  MODEL_PRICING_CENTS_PER_M_TOKENS,
} from "../lib/domain";
