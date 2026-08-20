# `src/built-ins/modules/website-editor/src/api/handlers/formSubmissionHost.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R047 — Form submission host route + webhook dispatch wiring.  Public POST endpoint for form-block submissions. Resolves the form's `submitTo` configuration, dispatches to the right backend:  - "internal" → persist to forms-plugin storage (stub today; T2 forms plugin owns the actual persistence schema). - "webhook"  → dispatchWebhook(target, payload) via R043 helper. - null (target deleted / invalid) → fall back to internal so submissions don't drop on the floor; surface the issue in the webhook log so the operator notices.  Webhook outcomes are logged to a per-tenant ringbuffer that mirrors R016 integrations plugin's shape so the operator's existing `WebhooksPage` renders these entries unchanged once foundation wires the storage key.

## Exports (7)

- `interface FormWebhookLogEntry (7 members)`
- `async readFormWebhookLog(storage: PluginStorage, agencyId: string, clientId: string): Promise<FormWebhookLogEntry[]>`
- `interface InternalSubmission (7 members)`
- `interface FormSubmitInput (4 members)`
- `async handleFormSubmit(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleListFormWebhookLog(_req: Request, ctx: PluginCtx): Promise<Response>`
- `async listAllWebhookTargets(ctx: PluginCtx, agencyId: string, clientId: string): Promise<Array<{ pageId: string; pageSlug: string; targetId: string; label: string; url: string }>>`

## Depends on (6)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/webhookBlock.ts`](../../lib/webhookBlock.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](../../server/sites.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r047-form-submission-host-route.test.ts`](../../__smoke__/r047-form-submission-host-route.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

