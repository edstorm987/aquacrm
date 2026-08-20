# `src/built-ins/modules/website-editor/src/lib/webhookBlock.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R043 — Webhook block + form submission dispatcher.  `webhook-target` is a non-rendering block descriptor whose props describe an outbound webhook endpoint. Form blocks reference it by id via `submitTo: { kind: "webhook", id }`; the form-submission handler resolves the target and POSTs the payload (optionally signed via HMAC). Submission outcomes feed the integrations plugin's webhook log (R016) once wired.  This module is a pure helper layer. The host (foundation routes + forms plugin) imports the resolver + dispatcher; UI work (the "Submit to" dropdown in the editor) is a follow-up.

## Exports (13)

- `WEBHOOK_TARGET_TYPE`
- `interface WebhookTargetProps (5 members)`
- `interface WebhookTarget (2 members)`
- `type FormSubmitTo`
- `isValidSubmitTo(s: unknown): s is FormSubmitTo`
- `collectWebhookTargets(tree: BlockTreeJSON): WebhookTarget[]`
- `findWebhookTarget(tree: BlockTreeJSON, id: string): WebhookTarget | undefined`
- `interface DispatchInput (4 members)`
- `interface DispatchResult (5 members)`
- `SIGNATURE_HEADER`
- `TIMESTAMP_HEADER`
- `async dispatchWebhook(input: DispatchInput): Promise<DispatchResult>`
- `resolveFormSubmission(tree: BlockTreeJSON, submitTo: FormSubmitTo | undefined): WebhookTarget | "internal" | null`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/r043-webhook-block.test.ts`](../__smoke__/r043-webhook-block.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r047-form-submission-host-route.test.ts`](../__smoke__/r047-form-submission-host-route.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/formSubmissionHost.ts`](../api/handlers/formSubmissionHost.md)

