# `src/lib/intelligence/operationalAttention.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (10)

- `type OperationalAlertSeverity`
- `type OperationalAlertCategory`
- `interface OperationalAlert (13 members)`
- `type OperationalAlertViewState`
- `interface OperationalAlertView (5 members)`
- `type OperationalAlertAction`
- `destinationForOperationalAlert(alert: OperationalAlert): string`
- `operationalAlertMatchesHref(alert: OperationalAlert, targetHref: string): boolean`
- `operationalAlertMatchesHrefPrefix(alert: OperationalAlert, targetHref: string): boolean`
- `operationalAlertBelongsToClient(alert: OperationalAlert, clientId: string): boolean`

## Depends on (2)

- [`src/lib/inbox/resolutionContext.ts`](./inbox/resolutionContext.md)
- [`src/lib/inbox/resolutionExplain.ts`](./inbox/resolutionExplain.md)

## Used by (20)

- [`scripts/attention-protection.test.ts`](../../scripts/attention-protection.test.md)
- [`scripts/inbox-attention-thread.test.ts`](../../scripts/inbox-attention-thread.test.md)
- [`scripts/smoke-alert-classification.test.ts`](../../scripts/smoke-alert-classification.test.md)
- [`scripts/smoke-fulfilment-development-merge.test.ts`](../../scripts/smoke-fulfilment-development-merge.test.md)
- [`scripts/smoke-operational-notifications.test.ts`](../../scripts/smoke-operational-notifications.test.md)
- [`scripts/smoke-resolution-app-wide.test.ts`](../../scripts/smoke-resolution-app-wide.test.md)
- [`src/app/api/portal/notifications/route.ts`](../app/api/portal/notifications/route.md)
- [`src/app/portal/agency/inbox/_MasterInbox.tsx`](../app/portal/agency/inbox/_MasterInbox.md)
- [`src/components/chrome/NotificationAttentionProvider.tsx`](../components/chrome/NotificationAttentionProvider.md)
- [`src/components/chrome/NotificationCentreButton.tsx`](../components/chrome/NotificationCentreButton.md)
- [`src/components/chrome/SidebarNavLink.tsx`](../components/chrome/SidebarNavLink.md)
- [`src/lib/intelligence/attentionProtection.ts`](./attentionProtection.md)
- [`src/lib/intelligence/businessRecommendedActions.ts`](./businessRecommendedActions.md)
- [`src/lib/inbox/attentionResolution.ts`](./inbox/attentionResolution.md)
- [`src/lib/inbox/attentionThread.ts`](./inbox/attentionThread.md)
- [`src/lib/inbox/resolutionFocus.ts`](./inbox/resolutionFocus.md)
- [`src/lib/server/assistants/externalAdvisorContext.ts`](./server/externalAdvisorContext.md)
- [`src/lib/server/inbox/operationalAlertPreferences.ts`](./server/operationalAlertPreferences.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](./server/operationalAlerts.md)
- [`src/lib/server/sidebarAttention.ts`](./server/sidebarAttention.md)

