# `src/app/portal/clients/[clientId]/layout.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Per-client layout. The chrome's brand kit comes from the client (not the agency), so a client-side admin sees the portal painted as their own; an agency-side admin previewing the same path sees the same paint (which is the point — the portal looks like Felicia's, regardless of who's signed in).

## Exports (1)

- `default async ClientLayout({ children, params, }: { children: ReactNode; params: Promise<{ clientId: string }>; })`

## Depends on (26)

- [`src/built-ins/runtime/_pageScope.ts`](../../../../built-ins/runtime/_pageScope.md)
- [`src/components/chrome/AdvisorDrawerControl.tsx`](../../../../components/chrome/AdvisorDrawerControl.md)
- [`src/components/chrome/ClientRadarQuickLookControl.tsx`](../../../../components/chrome/ClientRadarQuickLookControl.md)
- [`src/components/chrome/NotificationAttentionProvider.tsx`](../../../../components/chrome/NotificationAttentionProvider.md)
- [`src/components/chrome/NotificationCentreButton.tsx`](../../../../components/chrome/NotificationCentreButton.md)
- [`src/components/chrome/PortalRouteCanvas.tsx`](../../../../components/chrome/PortalRouteCanvas.md)
- [`src/components/chrome/Sidebar.tsx`](../../../../components/chrome/Sidebar.md)
- [`src/components/chrome/ThemeInjector.tsx`](../../../../components/chrome/ThemeInjector.md)
- [`src/components/chrome/Topbar.tsx`](../../../../components/chrome/Topbar.md)
- [`src/components/chrome/WelcomeGate.tsx`](../../../../components/chrome/WelcomeGate.md)
- [`src/components/ui/ErrorBoundary.tsx`](../../../../components/ui/ErrorBoundary.md)
- [`src/lib/clients/clientWorkspace.ts`](../../../../lib/clients/clientWorkspace.md)
- [`src/lib/products/productAssignments.ts`](../../../../lib/products/productAssignments.md)
- [`src/lib/server/auth/auth.ts`](../../../../lib/server/auth/auth.md)
- [`src/lib/server/clients/clientPortalProvider.ts`](../../../../lib/server/clients/clientPortalProvider.md)
- [`src/lib/server/dev/devDocs.ts`](../../../../lib/server/dev/devDocs.md)
- [`src/lib/server/devIconPreference.ts`](../../../../lib/server/devIconPreference.md)
- [`src/lib/server/inbox/operationalAlertPreferences.ts`](../../../../lib/server/inbox/operationalAlertPreferences.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../../../../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/portal/previewPhase.ts`](../../../../lib/server/portal/previewPhase.md)
- [`src/server/agencyProducts.ts`](../../../../server/agencyProducts.md)
- [`src/server/phaseTokens.ts`](../../../../server/phaseTokens.md)
- [`src/server/phases.ts`](../../../../server/phases.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../server/tenants.md)
- [`src/server/users.ts`](../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

