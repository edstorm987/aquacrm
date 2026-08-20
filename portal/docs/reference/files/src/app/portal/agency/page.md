# `src/app/portal/agency/page.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Ed's home — /portal/agency.  T1 R034 — Pipelines hub. The single "Clients grid" retired; this page now lists every pipeline (fulfilment / leads / sales / custom) as a clickable card. Each card → /portal/agency/pipelines/<slug>. Default landing for the foundation team is fulfilment; the kanban plugin (T2 R+1) renders the actual board behind each pipeline.  Why a hub instead of redirect: Ed wants the dashboard tiles + activity feed + KPIs visible above the pipelines so the agency owner gets a glance at status before diving into a board.

## Exports (1)

- `default async AgencyHome()`

## Depends on (44)

- [`src/app/portal/agency/_BattleTableWorkspace.tsx`](./_BattleTableWorkspace.md)
- [`src/app/portal/agency/_BrandPortfolioInstrument.tsx`](./_BrandPortfolioInstrument.md)
- [`src/app/portal/agency/_CommandDeckPopup.tsx`](./_CommandDeckPopup.md)
- [`src/app/portal/agency/_DashboardCommandCenter.tsx`](./_DashboardCommandCenter.md)
- [`src/app/portal/agency/_DevTeamStation.tsx`](./_DevTeamStation.md)
- [`src/app/portal/agency/_DynamicRadarConsole.tsx`](./_DynamicRadarConsole.md)
- [`src/app/portal/agency/_NewClientButton.tsx`](./_NewClientButton.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](./actions/_ActionsPage.md)
- [`src/app/portal/agency/assistant/AssistantWorkspace.tsx`](./assistant/AssistantWorkspace.md)
- [`src/lib/brandPortfolio.ts`](../../../lib/brandPortfolio.md)
- [`src/lib/businessRadar.ts`](../../../lib/businessRadar.md)
- [`src/lib/businessRecommendedActions.ts`](../../../lib/businessRecommendedActions.md)
- [`src/lib/companyHealth.ts`](../../../lib/companyHealth.md)
- [`src/lib/formatDateTime.ts`](../../../lib/formatDateTime.md)
- [`src/lib/hiringCapacity.ts`](../../../lib/hiringCapacity.md)
- [`src/lib/internalWorkspace.ts`](../../../lib/internalWorkspace.md)
- [`src/lib/server/assistantBusinessContext.ts`](../../../lib/server/assistantBusinessContext.md)
- [`src/lib/server/assistantStore.ts`](../../../lib/server/assistantStore.md)
- [`src/lib/server/auth.ts`](../../../lib/server/auth.md)
- [`src/lib/server/brandPortfolio.ts`](../../../lib/server/brandPortfolio.md)
- [`src/lib/server/businessIssueRadar.ts`](../../../lib/server/businessIssueRadar.md)
- [`src/lib/server/clientAttention.ts`](../../../lib/server/clientAttention.md)
- [`src/lib/server/commandIntelligence.ts`](../../../lib/server/commandIntelligence.md)
- [`src/lib/server/companyHealthSnapshot.ts`](../../../lib/server/companyHealthSnapshot.md)
- [`src/lib/server/devDocs.ts`](../../../lib/server/devDocs.md)
- [`src/lib/server/devTeamBoard.ts`](../../../lib/server/devTeamBoard.md)
- [`src/lib/server/googleCalendar.ts`](../../../lib/server/googleCalendar.md)
- [`src/lib/server/openaiAssistant.ts`](../../../lib/server/openaiAssistant.md)
- [`src/lib/server/operationalAlerts.ts`](../../../lib/server/operationalAlerts.md)
- [`src/lib/server/radarEvidenceVault.ts`](../../../lib/server/radarEvidenceVault.md)
- [`src/server/agencyProducts.ts`](../../../server/agencyProducts.md)
- [`src/server/agencySettings.ts`](../../../server/agencySettings.md)
- [`src/server/commandCalendar.ts`](../../../server/commandCalendar.md)
- [`src/server/company.ts`](../../../server/company.md)
- [`src/server/dashboardPlanning.ts`](../../../server/dashboardPlanning.md)
- [`src/server/legalDocuments.ts`](../../../server/legalDocuments.md)
- [`src/server/people.ts`](../../../server/people.md)
- [`src/server/pipelines.ts`](../../../server/pipelines.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tasks.ts`](../../../server/tasks.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/tradingCompanies.ts`](../../../server/tradingCompanies.md)
- [`src/server/types.ts`](../../../server/types.md)
- [`src/server/users.ts`](../../../server/users.md)

## Used by (1)

- [`src/app/portal/agency/command-center/page.tsx`](./command-center/page.md)

