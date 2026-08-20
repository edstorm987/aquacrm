# `scripts/smoke-leads-pipeline-foundation-glue.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R037 smoke — leads-pipeline foundation glue. Run via `npm run smoke:leads-pipeline-foundation-glue` (tsx --test).  Surface (≥10): - ActivityCategory union includes "leads". - Chip styling map resolves "leads" without throwing. - CATEGORY_FILTER_ORDER includes "leads". - `_registry.ts` lists `@aqua/plugin-leads-pipeline` import + manifest entry. - Foundation adapter side-effect import is wired in `_registry.ts`. - `next.config.ts` transpilePackages registers the plugin. - `package.json` workspace deps register the plugin. - `pipelinePort.addLeadCard` lands on the leads pipeline's "New" column. - `pipelinePort.leadIdsInColumn` reverse-resolves cards by column label. - `pipelinePort.columnLabelForLead` returns the current column label. - `pipelines.ts` `moveCard` emits `pipelines.card.moved` payload. - `EVENT_SUBSCRIPTIONS` array exported from the plugin includes both events. - `emailEnqueuePort.enqueue` forwards triggeredByPlugin + externalRef (verified by source inspection — runtime requires email-sender, a foundation-pending dependency).

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

