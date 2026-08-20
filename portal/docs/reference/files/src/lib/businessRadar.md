# `src/lib/radar/businessRadar.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (47)

- `type AdvisorDomain`
- `type BusinessIssueSeverity`
- `type BusinessSignalStatus`
- `type AdvisorCoverageStatus`
- `type RadarCheckStatus`
- `type RadarCheckScope`
- `type RadarCheckTier`
- `type RadarDataDependency`
- `type RadarFindingGroup`
- `type RadarEntityType`
- `type RadarCoverageEntityType`
- `type RadarCoverageState`
- `interface RadarCoverageManifestEntry (6 members)`
- `interface RadarCoverageManifest (6 members)`
- `type RadarInfraBackend`
- `type RadarInfraProbeStatus`
- `interface RadarInfraDatabaseHealth (8 members)`
- `interface RadarInfraStorageHealth (4 members)`
- `interface RadarInfraHealthSnapshot (4 members)`
- `type RadarRuleLens`
- `interface BusinessRadarIssue (10 members)`
- `interface RadarEntityReference (4 members)`
- `interface BusinessMetricSignal (11 members)`
- `interface AdvisorCoverageSource (7 members)`
- `interface BusinessRadarCheck (28 members)`
- `interface ClientRadarPackSummary (11 members)`
- `interface ClientRadarSnapshot (13 members)`
- `interface RadarDomainSummary (16 members)`
- `interface BusinessRadarIncident (4 members)`
- `interface RadarFindingGroupSummary (6 members)`
- `interface BusinessRadarConclusion (6 members)`
- `interface BusinessRadarAdaptiveState (11 members)`
- `interface SpeedToLeadRadar (12 members)`
- `interface RadarMemoryPoint (5 members)`
- `interface RadarMemoryDigest (19 members)`
- `interface RadarEvidenceMovement (8 members)`
- `interface RadarEvidenceDigest (9 members)`
- `interface RadarEvidenceSeriesSummary (16 members)`
- `interface RadarEvidenceInspectionIndex (5 members)`
- `interface RadarEvidenceSeriesInspection (2 members)`
- `type RadarSourceDatasetStatus`
- `interface RadarSourceDatasetSummary (11 members)`
- `interface RadarSourceDataIndex (6 members)`
- `interface RadarSourceDatasetInspection (5 members)`
- `interface BusinessIssueRadar (16 members)`
- `type AdvisorRadarDigest`
- `radarDigest(radar: BusinessIssueRadar): AdvisorRadarDigest`

## Depends on (2)

- [`src/lib/intelligence/commercialLifecycle.ts`](./commercialLifecycle.md)
- [`src/server/types.ts`](../server/types.md)

## Used by (59)

- [`scripts/smoke-business-radar.test.ts`](../../scripts/smoke-business-radar.test.md)
- [`scripts/smoke-command-recommendations.test.ts`](../../scripts/smoke-command-recommendations.test.md)
- [`scripts/smoke-external-assistant-proposals.test.ts`](../../scripts/smoke-external-assistant-proposals.test.md)
- [`scripts/smoke-kpi-registry.test.ts`](../../scripts/smoke-kpi-registry.test.md)
- [`scripts/smoke-radar-actionable.test.ts`](../../scripts/smoke-radar-actionable.test.md)
- [`scripts/smoke-radar-classification.test.ts`](../../scripts/smoke-radar-classification.test.md)
- [`scripts/smoke-radar-finding-groups.test.ts`](../../scripts/smoke-radar-finding-groups.test.md)
- [`scripts/smoke-radar-golden-sweep.test.ts`](../../scripts/smoke-radar-golden-sweep.test.md)
- [`scripts/smoke-radar-infra-health.test.ts`](../../scripts/smoke-radar-infra-health.test.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/portal/agency/_DashboardCommandCenter.tsx`](../app/portal/agency/_DashboardCommandCenter.md)
- [`src/app/portal/agency/_DayBriefingPanel.tsx`](../app/portal/agency/_DayBriefingPanel.md)
- [`src/app/portal/agency/_DayCommandSensorPanel.tsx`](../app/portal/agency/_DayCommandSensorPanel.md)
- [`src/app/portal/agency/_DynamicRadarConsole.tsx`](../app/portal/agency/_DynamicRadarConsole.md)
- [`src/app/portal/agency/_FindingGroupBar.tsx`](../app/portal/agency/_FindingGroupBar.md)
- [`src/app/portal/agency/_InfraHealthPanel.tsx`](../app/portal/agency/_InfraHealthPanel.md)
- [`src/app/portal/agency/_RadarPolicyPanel.tsx`](../app/portal/agency/_RadarPolicyPanel.md)
- [`src/app/portal/agency/assistant/AssistantWorkspace.tsx`](../app/portal/agency/assistant/AssistantWorkspace.md)
- [`src/app/portal/agency/assistant/page.tsx`](../app/portal/agency/assistant/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/radar/RadarInspectionWorkspace.tsx`](../app/portal/agency/radar/RadarInspectionWorkspace.md)
- [`src/app/portal/clients/[clientId]/_ClientRadarPanel.tsx`](../app/portal/clients/[clientId]/_ClientRadarPanel.md)
- [`src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx`](../app/portal/clients/[clientId]/_ClientSpineOverview.md)
- [`src/components/chrome/AdvisorDrawerControl.tsx`](../components/chrome/AdvisorDrawerControl.md)
- [`src/components/chrome/ClientRadarQuickLookButton.tsx`](../components/chrome/ClientRadarQuickLookButton.md)
- [`src/components/chrome/GlobalAdvisorDrawer.tsx`](../components/chrome/GlobalAdvisorDrawer.md)
- [`src/components/chrome/RadarQuickLookButton.tsx`](../components/chrome/RadarQuickLookButton.md)
- [`src/components/chrome/RadarQuickLookControl.tsx`](../components/chrome/RadarQuickLookControl.md)
- [`src/lib/advisor/advisorActions.ts`](./advisorActions.md)
- [`src/lib/advisor/advisorSkills.ts`](./advisorSkills.md)
- [`src/lib/intelligence/businessRecommendedActions.ts`](./businessRecommendedActions.md)
- [`src/lib/radar/clientRadar.ts`](./clientRadar.md)
- [`src/lib/intelligence/commandIntelligence.ts`](./commandIntelligence.md)
- [`src/lib/intelligence/commercialLifecycle.ts`](./commercialLifecycle.md)
- [`src/lib/performance/kpiRegistry.ts`](./kpiRegistry.md)
- [`src/lib/radar/radarCheckEngine.ts`](./radarCheckEngine.md)
- [`src/lib/radar/radarClassification.ts`](./radarClassification.md)
- [`src/lib/radar/radarCorrelations.ts`](./radarCorrelations.md)
- [`src/lib/radar/radarCoverageRegistry.ts`](./radarCoverageRegistry.md)
- [`src/lib/radar/radarInfraChecks.ts`](./radarInfraChecks.md)
- [`src/lib/radar/radarPolicyEngine.ts`](./radarPolicyEngine.md)
- [`src/lib/radar/radarRuleCatalog.ts`](./radarRuleCatalog.md)
- [`src/lib/radar/radarSentinels.ts`](./radarSentinels.md)
- [`src/lib/radar/radarSyntheticChecks.ts`](./radarSyntheticChecks.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](./server/businessIssueRadar.md)
- [`src/lib/server/radar/clientRadarService.ts`](./server/clientRadar.md)
- [`src/lib/server/commandIntelligenceService.ts`](./server/commandIntelligence.md)
- [`src/lib/server/databaseStorageHealth.ts`](./server/databaseStorageHealth.md)
- [`src/lib/server/assistants/externalAdvisorContext.ts`](./server/externalAdvisorContext.md)
- [`src/lib/server/marketingIntelligence.ts`](./server/marketingIntelligence.md)
- [`src/lib/server/assistants/openaiAssistant.ts`](./server/openaiAssistant.md)
- [`src/lib/server/radar/radarEvidenceVault.ts`](./server/radarEvidenceVault.md)
- [`src/lib/server/radar/radarMemory.ts`](./server/radarMemory.md)
- [`src/lib/server/radar/radarObservations.ts`](./server/radarObservations.md)
- [`src/lib/server/radar/radarSourceInspection.ts`](./server/radarSourceInspection.md)
- [`src/lib/server/radar/radarSweeps.ts`](./server/radarSweeps.md)
- [`src/lib/server/radar/radarTelemetry.ts`](./server/radarTelemetry.md)
- [`src/server/staffCapacity.ts`](../server/staffCapacity.md)
- [`src/server/tasks.ts`](../server/tasks.md)

