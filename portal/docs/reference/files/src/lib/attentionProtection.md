# `src/lib/intelligence/attentionProtection.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (13)

- `type AttentionLoadLevel`
- `type AttentionReserveGroup`
- `type ProtectedAttentionWindow`
- `type OperationalAttentionReserveGroup`
- `type OperationalAttentionWindow`
- `ATTENTION_PROTECTION_STORAGE_KEY`
- `ATTENTION_PROTECTION_EVENT`
- `DEFERRALS_BEFORE_PROMOTION`
- `promoteForDeferrals(rank: number, deferrals?: number): number`
- `buildProtectedAttentionWindow<T>(items: readonly T[], options: { groupKey: (item: T) => string; urgencyRank: (item: T) => number; focusLimit?: number; protectionThreshold?: number; enabled?: boolean; }): ProtectedAttentionWindow<T>`
- `attentionProtectionEnabled(): boolean`
- `setAttentionProtectionEnabled(enabled: boolean): void`
- `buildOperationalAttentionWindow(alerts: readonly OperationalAlertView[], options: { enabled?: boolean } = {}): OperationalAttentionWindow`

## Depends on (1)

- [`src/lib/intelligence/operationalAttention.ts`](./operationalAttention.md)

## Used by (5)

- [`scripts/attention-protection.test.ts`](../../scripts/attention-protection.test.md)
- [`scripts/smoke-attention-protection.test.ts`](../../scripts/smoke-attention-protection.test.md)
- [`src/app/portal/agency/_DashboardCommandCenter.tsx`](../app/portal/agency/_DashboardCommandCenter.md)
- [`src/app/portal/agency/actions/_ActionsWorkspace.tsx`](../app/portal/agency/actions/_ActionsWorkspace.md)
- [`src/components/chrome/NotificationAttentionProvider.tsx`](../components/chrome/NotificationAttentionProvider.md)

