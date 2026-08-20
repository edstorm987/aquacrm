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
- [`src/lib/brands/brandPortfolio.ts`](../../../lib/brands/brandPortfolio.md)
- [`src/lib/intelligence/businessRecommendedActions.ts`](../../../lib/intelligence/businessRecommendedActions.md)
- [`src/lib/performance/companyHealth.ts`](../../../lib/performance/companyHealth.md)
- [`src/lib/performance/hiringCapacity.ts`](../../../lib/performance/hiringCapacity.md)
- [`src/lib/radar/businessRadar.ts`](../../../lib/radar/businessRadar.md)
- [`src/lib/server/assistants/assistantBusinessContext.ts`](../../../lib/server/assistants/assistantBusinessContext.md)
- [`src/lib/server/assistants/assistantStore.ts`](../../../lib/server/assistants/assistantStore.md)
- [`src/lib/server/assistants/openaiAssistant.ts`](../../../lib/server/assistants/openaiAssistant.md)
- [`src/lib/server/auth/auth.ts`](../../../lib/server/auth/auth.md)
- [`src/lib/server/brandPortfolioService.ts`](../../../lib/server/brandPortfolioService.md)
- [`src/lib/server/clients/clientAttention.ts`](../../../lib/server/clients/clientAttention.md)
- [`src/lib/server/commandIntelligenceService.ts`](../../../lib/server/commandIntelligenceService.md)
- [`src/lib/server/dev/devDocs.ts`](../../../lib/server/dev/devDocs.md)
- [`src/lib/server/dev/devTeamBoard.ts`](../../../lib/server/dev/devTeamBoard.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../../../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/integrations/googleCalendar.ts`](../../../lib/server/integrations/googleCalendar.md)
- [`src/lib/server/kpi/companyHealthSnapshot.ts`](../../../lib/server/kpi/companyHealthSnapshot.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../../../lib/server/radar/businessIssueRadar.md)
- [`src/lib/server/radar/radarEvidenceVault.ts`](../../../lib/server/radar/radarEvidenceVault.md)
- [`src/lib/shared/formatDateTime.ts`](../../../lib/shared/formatDateTime.md)
- [`src/lib/shared/internalWorkspace.ts`](../../../lib/shared/internalWorkspace.md)
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

