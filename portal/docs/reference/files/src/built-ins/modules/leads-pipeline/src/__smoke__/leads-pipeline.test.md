# `src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Self-contained smoke for the leads-pipeline plugin.  Runs an in-memory foundation (storage / activity / events / pipeline / emailEnqueue stubs), exercises: - Lead upsert + idempotent merge - CSV parser column variants (Email/email/E-mail, Phone/Mobile/Tel, Company/Organisation, Tags, Source, Notes) - CSV import idempotent re-import - CSV import skip-on-missing-email - AudienceFilter resolution (tag, source, notContactedSince, pipelineColumn) - Campaign create + send happy path (uses stub EmailEnqueuePort, asserts one enqueue per resolved lead + sentCount stamped) - Campaign send fails when no EmailEnqueuePort wired - public-funnel.lead.captured subscriber → Lead row created - Lead → Contact promotion via pipelines.card.moved → toColumn "Won" - Lead promotion is idempotent - LeadCard projection shape  Run: `npm run smoke` from the plugin folder.

_No exported symbols (side-effect / internal module)._

## Depends on (8)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/leads-pipeline/src/server/csv.ts`](../server/csv.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/leads-pipeline/src/server/leads.ts`](../server/leads.md)
- [`src/built-ins/modules/leads-pipeline/src/server/ports.ts`](../server/ports.md)
- [`src/built-ins/modules/leads-pipeline/src/server/subscribers.ts`](../server/subscribers.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

