# `scripts/smoke-email-sender-foundation.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 smoke — email-sender foundation registration (closes ch#161 Gap #3). Run via `npm run smoke:email-sender-foundation` (tsx --test).  Surface (≥6): - `_registry.ts` imports `@aqua/plugin-email-sender` manifest. - `_registry.ts` lists `emailSenderManifest` in PLUGINS array. - `_registry.ts` side-effect imports `emailSenderFoundation` BEFORE `leadsPipelineFoundation`. - `next.config.ts` transpilePackages registers the plugin. - `package.json` workspace deps register the plugin. - Side-effect import of the adapter file binds the foundation — `isFoundationRegistered()` returns true on the same module graph. - `emailEnqueuePort` no longer throws "foundation pending" when invoked against a fresh agency with the email-sender install seeded; it lands the message on a stub driver via the registered container (real Postmark requires API keys; stubs land in the plugin's `emails` queue and surface via `emails.list({})`).

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

