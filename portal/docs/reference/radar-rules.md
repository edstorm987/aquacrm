# Radar rule reference — every rule (all 2064)

← Back to [the reference index](00-index.md) · [the Radar dossier](../workspace/radar.md)

The complete enumeration of the Radar catalogue: **172 signal families × 12 lenses = 2064 rules**. Generated from `src/engines/data/radar/radarRuleCatalog.ts` by `scripts/generate-radar-rules-reference.ts` — re-run after editing the catalogue.

Rule id = `radar:{domain}:{family}:{lens}`. Each family below lists all 12 of its lens rules; the [Radar dossier](../workspace/radar.md) explains how each lens actually evaluates (the shared logic is identical across families).

## The 12 lenses (applied to every family)

| Lens | Checks |
|---|---|
| `connection` | Confirms the source is connected and observable. |
| `freshness` | Detects stale, delayed, or silent reporting. |
| `threshold` | Checks the current value against its operating guardrail. |
| `trend` | Compares the current period with the preceding period. |
| `anomaly` | Finds unusual jumps, drops, and pattern breaks. |
| `integrity` | Checks sample quality, completeness, and internal consistency. |
| `continuity` | Proves the signal is reporting without an unexplained monitoring gap. |
| `baseline` | Confirms enough historical context exists to distinguish normal from abnormal. |
| `confidence` | Grades whether the sample is large and trustworthy enough for a decision. |
| `forecast` | Projects whether current momentum is moving toward or away from the guardrail. |
| `volatility` | Detects unstable movement that can hide inside an acceptable current value. |
| `resilience` | Checks whether the result remains observable when a source becomes stale or degraded. |

---

## `company` — 18 families (216 rules)

### Overall company health — `overall-health`
Combined health across income, clients, pipeline, and operations.

| Rule id | Lens |
|---|---|
| `radar:company:overall-health:connection` | Connection |
| `radar:company:overall-health:freshness` | Freshness |
| `radar:company:overall-health:threshold` | Threshold |
| `radar:company:overall-health:trend` | Trend |
| `radar:company:overall-health:anomaly` | Anomaly |
| `radar:company:overall-health:integrity` | Integrity |
| `radar:company:overall-health:continuity` | Continuity |
| `radar:company:overall-health:baseline` | Baseline |
| `radar:company:overall-health:confidence` | Confidence |
| `radar:company:overall-health:forecast` | Forecast |
| `radar:company:overall-health:volatility` | Volatility |
| `radar:company:overall-health:resilience` | Resilience |

### Income health — `income-health`
Revenue pace against the current monthly target.

| Rule id | Lens |
|---|---|
| `radar:company:income-health:connection` | Connection |
| `radar:company:income-health:freshness` | Freshness |
| `radar:company:income-health:threshold` | Threshold |
| `radar:company:income-health:trend` | Trend |
| `radar:company:income-health:anomaly` | Anomaly |
| `radar:company:income-health:integrity` | Integrity |
| `radar:company:income-health:continuity` | Continuity |
| `radar:company:income-health:baseline` | Baseline |
| `radar:company:income-health:confidence` | Confidence |
| `radar:company:income-health:forecast` | Forecast |
| `radar:company:income-health:volatility` | Volatility |
| `radar:company:income-health:resilience` | Resilience |

### Client portfolio health — `client-health`
Share of active clients operating without an attention flag.

| Rule id | Lens |
|---|---|
| `radar:company:client-health:connection` | Connection |
| `radar:company:client-health:freshness` | Freshness |
| `radar:company:client-health:threshold` | Threshold |
| `radar:company:client-health:trend` | Trend |
| `radar:company:client-health:anomaly` | Anomaly |
| `radar:company:client-health:integrity` | Integrity |
| `radar:company:client-health:continuity` | Continuity |
| `radar:company:client-health:baseline` | Baseline |
| `radar:company:client-health:confidence` | Confidence |
| `radar:company:client-health:forecast` | Forecast |
| `radar:company:client-health:volatility` | Volatility |
| `radar:company:client-health:resilience` | Resilience |

### Pipeline health — `pipeline-health`
Commercial pipeline coverage against the revenue gap.

| Rule id | Lens |
|---|---|
| `radar:company:pipeline-health:connection` | Connection |
| `radar:company:pipeline-health:freshness` | Freshness |
| `radar:company:pipeline-health:threshold` | Threshold |
| `radar:company:pipeline-health:trend` | Trend |
| `radar:company:pipeline-health:anomaly` | Anomaly |
| `radar:company:pipeline-health:integrity` | Integrity |
| `radar:company:pipeline-health:continuity` | Continuity |
| `radar:company:pipeline-health:baseline` | Baseline |
| `radar:company:pipeline-health:confidence` | Confidence |
| `radar:company:pipeline-health:forecast` | Forecast |
| `radar:company:pipeline-health:volatility` | Volatility |
| `radar:company:pipeline-health:resilience` | Resilience |

### Operating health — `operations-health`
Open and overdue work pressure across the company.

| Rule id | Lens |
|---|---|
| `radar:company:operations-health:connection` | Connection |
| `radar:company:operations-health:freshness` | Freshness |
| `radar:company:operations-health:threshold` | Threshold |
| `radar:company:operations-health:trend` | Trend |
| `radar:company:operations-health:anomaly` | Anomaly |
| `radar:company:operations-health:integrity` | Integrity |
| `radar:company:operations-health:continuity` | Continuity |
| `radar:company:operations-health:baseline` | Baseline |
| `radar:company:operations-health:confidence` | Confidence |
| `radar:company:operations-health:forecast` | Forecast |
| `radar:company:operations-health:volatility` | Volatility |
| `radar:company:operations-health:resilience` | Resilience |

### Revenue target progress — `revenue-target`
Actual monthly revenue relative to the configured target.

| Rule id | Lens |
|---|---|
| `radar:company:revenue-target:connection` | Connection |
| `radar:company:revenue-target:freshness` | Freshness |
| `radar:company:revenue-target:threshold` | Threshold |
| `radar:company:revenue-target:trend` | Trend |
| `radar:company:revenue-target:anomaly` | Anomaly |
| `radar:company:revenue-target:integrity` | Integrity |
| `radar:company:revenue-target:continuity` | Continuity |
| `radar:company:revenue-target:baseline` | Baseline |
| `radar:company:revenue-target:confidence` | Confidence |
| `radar:company:revenue-target:forecast` | Forecast |
| `radar:company:revenue-target:volatility` | Volatility |
| `radar:company:revenue-target:resilience` | Resilience |

### Revenue gap — `revenue-gap`
Remaining money required to reach the monthly plan.

| Rule id | Lens |
|---|---|
| `radar:company:revenue-gap:connection` | Connection |
| `radar:company:revenue-gap:freshness` | Freshness |
| `radar:company:revenue-gap:threshold` | Threshold |
| `radar:company:revenue-gap:trend` | Trend |
| `radar:company:revenue-gap:anomaly` | Anomaly |
| `radar:company:revenue-gap:integrity` | Integrity |
| `radar:company:revenue-gap:continuity` | Continuity |
| `radar:company:revenue-gap:baseline` | Baseline |
| `radar:company:revenue-gap:confidence` | Confidence |
| `radar:company:revenue-gap:forecast` | Forecast |
| `radar:company:revenue-gap:volatility` | Volatility |
| `radar:company:revenue-gap:resilience` | Resilience |

### Business objectives — `objectives`
Current strategic objectives and their freshness.

| Rule id | Lens |
|---|---|
| `radar:company:objectives:connection` | Connection |
| `radar:company:objectives:freshness` | Freshness |
| `radar:company:objectives:threshold` | Threshold |
| `radar:company:objectives:trend` | Trend |
| `radar:company:objectives:anomaly` | Anomaly |
| `radar:company:objectives:integrity` | Integrity |
| `radar:company:objectives:continuity` | Continuity |
| `radar:company:objectives:baseline` | Baseline |
| `radar:company:objectives:confidence` | Confidence |
| `radar:company:objectives:forecast` | Forecast |
| `radar:company:objectives:volatility` | Volatility |
| `radar:company:objectives:resilience` | Resilience |

### Business plans — `plans`
Active plans, owners, timelines, and review state.

| Rule id | Lens |
|---|---|
| `radar:company:plans:connection` | Connection |
| `radar:company:plans:freshness` | Freshness |
| `radar:company:plans:threshold` | Threshold |
| `radar:company:plans:trend` | Trend |
| `radar:company:plans:anomaly` | Anomaly |
| `radar:company:plans:integrity` | Integrity |
| `radar:company:plans:continuity` | Continuity |
| `radar:company:plans:baseline` | Baseline |
| `radar:company:plans:confidence` | Confidence |
| `radar:company:plans:forecast` | Forecast |
| `radar:company:plans:volatility` | Volatility |
| `radar:company:plans:resilience` | Resilience |

### Company capacity — `capacity`
Available operating hours relative to committed delivery demand.

| Rule id | Lens |
|---|---|
| `radar:company:capacity:connection` | Connection |
| `radar:company:capacity:freshness` | Freshness |
| `radar:company:capacity:threshold` | Threshold |
| `radar:company:capacity:trend` | Trend |
| `radar:company:capacity:anomaly` | Anomaly |
| `radar:company:capacity:integrity` | Integrity |
| `radar:company:capacity:continuity` | Continuity |
| `radar:company:capacity:baseline` | Baseline |
| `radar:company:capacity:confidence` | Confidence |
| `radar:company:capacity:forecast` | Forecast |
| `radar:company:capacity:volatility` | Volatility |
| `radar:company:capacity:resilience` | Resilience |

### Trading company coverage — `trading-companies`
Operating records across every configured company and brand.

| Rule id | Lens |
|---|---|
| `radar:company:trading-companies:connection` | Connection |
| `radar:company:trading-companies:freshness` | Freshness |
| `radar:company:trading-companies:threshold` | Threshold |
| `radar:company:trading-companies:trend` | Trend |
| `radar:company:trading-companies:anomaly` | Anomaly |
| `radar:company:trading-companies:integrity` | Integrity |
| `radar:company:trading-companies:continuity` | Continuity |
| `radar:company:trading-companies:baseline` | Baseline |
| `radar:company:trading-companies:confidence` | Confidence |
| `radar:company:trading-companies:forecast` | Forecast |
| `radar:company:trading-companies:volatility` | Volatility |
| `radar:company:trading-companies:resilience` | Resilience |

### Company direction profile — `direction-profile`
Mission, vision, values, targets, and executive review freshness.

| Rule id | Lens |
|---|---|
| `radar:company:direction-profile:connection` | Connection |
| `radar:company:direction-profile:freshness` | Freshness |
| `radar:company:direction-profile:threshold` | Threshold |
| `radar:company:direction-profile:trend` | Trend |
| `radar:company:direction-profile:anomaly` | Anomaly |
| `radar:company:direction-profile:integrity` | Integrity |
| `radar:company:direction-profile:continuity` | Continuity |
| `radar:company:direction-profile:baseline` | Baseline |
| `radar:company:direction-profile:confidence` | Confidence |
| `radar:company:direction-profile:forecast` | Forecast |
| `radar:company:direction-profile:volatility` | Volatility |
| `radar:company:direction-profile:resilience` | Resilience |

### Ownership register — `ownership-register`
Active shareholders, issued shares, share classes, and voting control.

| Rule id | Lens |
|---|---|
| `radar:company:ownership-register:connection` | Connection |
| `radar:company:ownership-register:freshness` | Freshness |
| `radar:company:ownership-register:threshold` | Threshold |
| `radar:company:ownership-register:trend` | Trend |
| `radar:company:ownership-register:anomaly` | Anomaly |
| `radar:company:ownership-register:integrity` | Integrity |
| `radar:company:ownership-register:continuity` | Continuity |
| `radar:company:ownership-register:baseline` | Baseline |
| `radar:company:ownership-register:confidence` | Confidence |
| `radar:company:ownership-register:forecast` | Forecast |
| `radar:company:ownership-register:volatility` | Volatility |
| `radar:company:ownership-register:resilience` | Resilience |

### Share issue authority — `share-authority`
Issued shares remaining within the authorised amount for every class.

| Rule id | Lens |
|---|---|
| `radar:company:share-authority:connection` | Connection |
| `radar:company:share-authority:freshness` | Freshness |
| `radar:company:share-authority:threshold` | Threshold |
| `radar:company:share-authority:trend` | Trend |
| `radar:company:share-authority:anomaly` | Anomaly |
| `radar:company:share-authority:integrity` | Integrity |
| `radar:company:share-authority:continuity` | Continuity |
| `radar:company:share-authority:baseline` | Baseline |
| `radar:company:share-authority:confidence` | Confidence |
| `radar:company:share-authority:forecast` | Forecast |
| `radar:company:share-authority:volatility` | Volatility |
| `radar:company:share-authority:resilience` | Resilience |

### Capital movement ledger — `capital-ledger`
Contributions, loans, transfers, repayments, issues, and buybacks retained.

| Rule id | Lens |
|---|---|
| `radar:company:capital-ledger:connection` | Connection |
| `radar:company:capital-ledger:freshness` | Freshness |
| `radar:company:capital-ledger:threshold` | Threshold |
| `radar:company:capital-ledger:trend` | Trend |
| `radar:company:capital-ledger:anomaly` | Anomaly |
| `radar:company:capital-ledger:integrity` | Integrity |
| `radar:company:capital-ledger:continuity` | Continuity |
| `radar:company:capital-ledger:baseline` | Baseline |
| `radar:company:capital-ledger:confidence` | Confidence |
| `radar:company:capital-ledger:forecast` | Forecast |
| `radar:company:capital-ledger:volatility` | Volatility |
| `radar:company:capital-ledger:resilience` | Resilience |

### Investment valuation freshness — `investment-valuations`
Company-held investments carrying a current valuation date.

| Rule id | Lens |
|---|---|
| `radar:company:investment-valuations:connection` | Connection |
| `radar:company:investment-valuations:freshness` | Freshness |
| `radar:company:investment-valuations:threshold` | Threshold |
| `radar:company:investment-valuations:trend` | Trend |
| `radar:company:investment-valuations:anomaly` | Anomaly |
| `radar:company:investment-valuations:integrity` | Integrity |
| `radar:company:investment-valuations:continuity` | Continuity |
| `radar:company:investment-valuations:baseline` | Baseline |
| `radar:company:investment-valuations:confidence` | Confidence |
| `radar:company:investment-valuations:forecast` | Forecast |
| `radar:company:investment-valuations:volatility` | Volatility |
| `radar:company:investment-valuations:resilience` | Resilience |

### Dividend obligations — `dividend-obligations`
Declared distributions paid within their retained due dates.

| Rule id | Lens |
|---|---|
| `radar:company:dividend-obligations:connection` | Connection |
| `radar:company:dividend-obligations:freshness` | Freshness |
| `radar:company:dividend-obligations:threshold` | Threshold |
| `radar:company:dividend-obligations:trend` | Trend |
| `radar:company:dividend-obligations:anomaly` | Anomaly |
| `radar:company:dividend-obligations:integrity` | Integrity |
| `radar:company:dividend-obligations:continuity` | Continuity |
| `radar:company:dividend-obligations:baseline` | Baseline |
| `radar:company:dividend-obligations:confidence` | Confidence |
| `radar:company:dividend-obligations:forecast` | Forecast |
| `radar:company:dividend-obligations:volatility` | Volatility |
| `radar:company:dividend-obligations:resilience` | Resilience |

### Capital governance evidence — `capital-governance`
Completed capital movements and distributions linked to an approval decision.

| Rule id | Lens |
|---|---|
| `radar:company:capital-governance:connection` | Connection |
| `radar:company:capital-governance:freshness` | Freshness |
| `radar:company:capital-governance:threshold` | Threshold |
| `radar:company:capital-governance:trend` | Trend |
| `radar:company:capital-governance:anomaly` | Anomaly |
| `radar:company:capital-governance:integrity` | Integrity |
| `radar:company:capital-governance:continuity` | Continuity |
| `radar:company:capital-governance:baseline` | Baseline |
| `radar:company:capital-governance:confidence` | Confidence |
| `radar:company:capital-governance:forecast` | Forecast |
| `radar:company:capital-governance:volatility` | Volatility |
| `radar:company:capital-governance:resilience` | Resilience |

## `sales` — 13 families (156 rules)

### Enquiries in 24 hours — `enquiries-24h`
New commercial enquiries received in the last day.

| Rule id | Lens |
|---|---|
| `radar:sales:enquiries-24h:connection` | Connection |
| `radar:sales:enquiries-24h:freshness` | Freshness |
| `radar:sales:enquiries-24h:threshold` | Threshold |
| `radar:sales:enquiries-24h:trend` | Trend |
| `radar:sales:enquiries-24h:anomaly` | Anomaly |
| `radar:sales:enquiries-24h:integrity` | Integrity |
| `radar:sales:enquiries-24h:continuity` | Continuity |
| `radar:sales:enquiries-24h:baseline` | Baseline |
| `radar:sales:enquiries-24h:confidence` | Confidence |
| `radar:sales:enquiries-24h:forecast` | Forecast |
| `radar:sales:enquiries-24h:volatility` | Volatility |
| `radar:sales:enquiries-24h:resilience` | Resilience |

### Enquiries in 7 days — `enquiries-7d`
Current weekly inbound enquiry volume.

| Rule id | Lens |
|---|---|
| `radar:sales:enquiries-7d:connection` | Connection |
| `radar:sales:enquiries-7d:freshness` | Freshness |
| `radar:sales:enquiries-7d:threshold` | Threshold |
| `radar:sales:enquiries-7d:trend` | Trend |
| `radar:sales:enquiries-7d:anomaly` | Anomaly |
| `radar:sales:enquiries-7d:integrity` | Integrity |
| `radar:sales:enquiries-7d:continuity` | Continuity |
| `radar:sales:enquiries-7d:baseline` | Baseline |
| `radar:sales:enquiries-7d:confidence` | Confidence |
| `radar:sales:enquiries-7d:forecast` | Forecast |
| `radar:sales:enquiries-7d:volatility` | Volatility |
| `radar:sales:enquiries-7d:resilience` | Resilience |

### Enquiries in 30 days — `enquiries-30d`
Rolling monthly inbound enquiry volume.

| Rule id | Lens |
|---|---|
| `radar:sales:enquiries-30d:connection` | Connection |
| `radar:sales:enquiries-30d:freshness` | Freshness |
| `radar:sales:enquiries-30d:threshold` | Threshold |
| `radar:sales:enquiries-30d:trend` | Trend |
| `radar:sales:enquiries-30d:anomaly` | Anomaly |
| `radar:sales:enquiries-30d:integrity` | Integrity |
| `radar:sales:enquiries-30d:continuity` | Continuity |
| `radar:sales:enquiries-30d:baseline` | Baseline |
| `radar:sales:enquiries-30d:confidence` | Confidence |
| `radar:sales:enquiries-30d:forecast` | Forecast |
| `radar:sales:enquiries-30d:volatility` | Volatility |
| `radar:sales:enquiries-30d:resilience` | Resilience |

### Form enquiries — `form-enquiries`
Commercial messages submitted through website forms.

| Rule id | Lens |
|---|---|
| `radar:sales:form-enquiries:connection` | Connection |
| `radar:sales:form-enquiries:freshness` | Freshness |
| `radar:sales:form-enquiries:threshold` | Threshold |
| `radar:sales:form-enquiries:trend` | Trend |
| `radar:sales:form-enquiries:anomaly` | Anomaly |
| `radar:sales:form-enquiries:integrity` | Integrity |
| `radar:sales:form-enquiries:continuity` | Continuity |
| `radar:sales:form-enquiries:baseline` | Baseline |
| `radar:sales:form-enquiries:confidence` | Confidence |
| `radar:sales:form-enquiries:forecast` | Forecast |
| `radar:sales:form-enquiries:volatility` | Volatility |
| `radar:sales:form-enquiries:resilience` | Resilience |

### Chatbot enquiries — `chatbot-enquiries`
Commercial conversations initiated through chatbot routes.

| Rule id | Lens |
|---|---|
| `radar:sales:chatbot-enquiries:connection` | Connection |
| `radar:sales:chatbot-enquiries:freshness` | Freshness |
| `radar:sales:chatbot-enquiries:threshold` | Threshold |
| `radar:sales:chatbot-enquiries:trend` | Trend |
| `radar:sales:chatbot-enquiries:anomaly` | Anomaly |
| `radar:sales:chatbot-enquiries:integrity` | Integrity |
| `radar:sales:chatbot-enquiries:continuity` | Continuity |
| `radar:sales:chatbot-enquiries:baseline` | Baseline |
| `radar:sales:chatbot-enquiries:confidence` | Confidence |
| `radar:sales:chatbot-enquiries:forecast` | Forecast |
| `radar:sales:chatbot-enquiries:volatility` | Volatility |
| `radar:sales:chatbot-enquiries:resilience` | Resilience |

### Urgent enquiries — `urgent-enquiries`
Open enquiries whose content or priority requires immediate action.

| Rule id | Lens |
|---|---|
| `radar:sales:urgent-enquiries:connection` | Connection |
| `radar:sales:urgent-enquiries:freshness` | Freshness |
| `radar:sales:urgent-enquiries:threshold` | Threshold |
| `radar:sales:urgent-enquiries:trend` | Trend |
| `radar:sales:urgent-enquiries:anomaly` | Anomaly |
| `radar:sales:urgent-enquiries:integrity` | Integrity |
| `radar:sales:urgent-enquiries:continuity` | Continuity |
| `radar:sales:urgent-enquiries:baseline` | Baseline |
| `radar:sales:urgent-enquiries:confidence` | Confidence |
| `radar:sales:urgent-enquiries:forecast` | Forecast |
| `radar:sales:urgent-enquiries:volatility` | Volatility |
| `radar:sales:urgent-enquiries:resilience` | Resilience |

### Median speed to lead — `median-response`
Typical time from enquiry submission to first response.

| Rule id | Lens |
|---|---|
| `radar:sales:median-response:connection` | Connection |
| `radar:sales:median-response:freshness` | Freshness |
| `radar:sales:median-response:threshold` | Threshold |
| `radar:sales:median-response:trend` | Trend |
| `radar:sales:median-response:anomaly` | Anomaly |
| `radar:sales:median-response:integrity` | Integrity |
| `radar:sales:median-response:continuity` | Continuity |
| `radar:sales:median-response:baseline` | Baseline |
| `radar:sales:median-response:confidence` | Confidence |
| `radar:sales:median-response:forecast` | Forecast |
| `radar:sales:median-response:volatility` | Volatility |
| `radar:sales:median-response:resilience` | Resilience |

### P90 speed to lead — `p90-response`
Slow-end lead response performance.

| Rule id | Lens |
|---|---|
| `radar:sales:p90-response:connection` | Connection |
| `radar:sales:p90-response:freshness` | Freshness |
| `radar:sales:p90-response:threshold` | Threshold |
| `radar:sales:p90-response:trend` | Trend |
| `radar:sales:p90-response:anomaly` | Anomaly |
| `radar:sales:p90-response:integrity` | Integrity |
| `radar:sales:p90-response:continuity` | Continuity |
| `radar:sales:p90-response:baseline` | Baseline |
| `radar:sales:p90-response:confidence` | Confidence |
| `radar:sales:p90-response:forecast` | Forecast |
| `radar:sales:p90-response:volatility` | Volatility |
| `radar:sales:p90-response:resilience` | Resilience |

### Leads awaiting response — `awaiting-response`
Open enquiries without a recorded first response.

| Rule id | Lens |
|---|---|
| `radar:sales:awaiting-response:connection` | Connection |
| `radar:sales:awaiting-response:freshness` | Freshness |
| `radar:sales:awaiting-response:threshold` | Threshold |
| `radar:sales:awaiting-response:trend` | Trend |
| `radar:sales:awaiting-response:anomaly` | Anomaly |
| `radar:sales:awaiting-response:integrity` | Integrity |
| `radar:sales:awaiting-response:continuity` | Continuity |
| `radar:sales:awaiting-response:baseline` | Baseline |
| `radar:sales:awaiting-response:confidence` | Confidence |
| `radar:sales:awaiting-response:forecast` | Forecast |
| `radar:sales:awaiting-response:volatility` | Volatility |
| `radar:sales:awaiting-response:resilience` | Resilience |

### Lead response breaches — `target-breaches`
Enquiries outside the configured response target.

| Rule id | Lens |
|---|---|
| `radar:sales:target-breaches:connection` | Connection |
| `radar:sales:target-breaches:freshness` | Freshness |
| `radar:sales:target-breaches:threshold` | Threshold |
| `radar:sales:target-breaches:trend` | Trend |
| `radar:sales:target-breaches:anomaly` | Anomaly |
| `radar:sales:target-breaches:integrity` | Integrity |
| `radar:sales:target-breaches:continuity` | Continuity |
| `radar:sales:target-breaches:baseline` | Baseline |
| `radar:sales:target-breaches:confidence` | Confidence |
| `radar:sales:target-breaches:forecast` | Forecast |
| `radar:sales:target-breaches:volatility` | Volatility |
| `radar:sales:target-breaches:resilience` | Resilience |

### Pipeline lead volume — `pipeline-leads`
Lead records currently available to the sales pipeline.

| Rule id | Lens |
|---|---|
| `radar:sales:pipeline-leads:connection` | Connection |
| `radar:sales:pipeline-leads:freshness` | Freshness |
| `radar:sales:pipeline-leads:threshold` | Threshold |
| `radar:sales:pipeline-leads:trend` | Trend |
| `radar:sales:pipeline-leads:anomaly` | Anomaly |
| `radar:sales:pipeline-leads:integrity` | Integrity |
| `radar:sales:pipeline-leads:continuity` | Continuity |
| `radar:sales:pipeline-leads:baseline` | Baseline |
| `radar:sales:pipeline-leads:confidence` | Confidence |
| `radar:sales:pipeline-leads:forecast` | Forecast |
| `radar:sales:pipeline-leads:volatility` | Volatility |
| `radar:sales:pipeline-leads:resilience` | Resilience |

### Enquiry-to-contact linkage — `enquiry-linkage`
Inbound enquiries linked to a lead or contact record.

| Rule id | Lens |
|---|---|
| `radar:sales:enquiry-linkage:connection` | Connection |
| `radar:sales:enquiry-linkage:freshness` | Freshness |
| `radar:sales:enquiry-linkage:threshold` | Threshold |
| `radar:sales:enquiry-linkage:trend` | Trend |
| `radar:sales:enquiry-linkage:anomaly` | Anomaly |
| `radar:sales:enquiry-linkage:integrity` | Integrity |
| `radar:sales:enquiry-linkage:continuity` | Continuity |
| `radar:sales:enquiry-linkage:baseline` | Baseline |
| `radar:sales:enquiry-linkage:confidence` | Confidence |
| `radar:sales:enquiry-linkage:forecast` | Forecast |
| `radar:sales:enquiry-linkage:volatility` | Volatility |
| `radar:sales:enquiry-linkage:resilience` | Resilience |

### Enquiry routing coverage — `enquiry-routing`
Tagged website sources pointing their enquiries at a specific client or company rather than the agency catch-all.

| Rule id | Lens |
|---|---|
| `radar:sales:enquiry-routing:connection` | Connection |
| `radar:sales:enquiry-routing:freshness` | Freshness |
| `radar:sales:enquiry-routing:threshold` | Threshold |
| `radar:sales:enquiry-routing:trend` | Trend |
| `radar:sales:enquiry-routing:anomaly` | Anomaly |
| `radar:sales:enquiry-routing:integrity` | Integrity |
| `radar:sales:enquiry-routing:continuity` | Continuity |
| `radar:sales:enquiry-routing:baseline` | Baseline |
| `radar:sales:enquiry-routing:confidence` | Confidence |
| `radar:sales:enquiry-routing:forecast` | Forecast |
| `radar:sales:enquiry-routing:volatility` | Volatility |
| `radar:sales:enquiry-routing:resilience` | Resilience |

## `inbox` — 12 families (144 rules)

### Conversation volume — `conversation-volume`
Social and direct message conversations in the master inbox.

| Rule id | Lens |
|---|---|
| `radar:inbox:conversation-volume:connection` | Connection |
| `radar:inbox:conversation-volume:freshness` | Freshness |
| `radar:inbox:conversation-volume:threshold` | Threshold |
| `radar:inbox:conversation-volume:trend` | Trend |
| `radar:inbox:conversation-volume:anomaly` | Anomaly |
| `radar:inbox:conversation-volume:integrity` | Integrity |
| `radar:inbox:conversation-volume:continuity` | Continuity |
| `radar:inbox:conversation-volume:baseline` | Baseline |
| `radar:inbox:conversation-volume:confidence` | Confidence |
| `radar:inbox:conversation-volume:forecast` | Forecast |
| `radar:inbox:conversation-volume:volatility` | Volatility |
| `radar:inbox:conversation-volume:resilience` | Resilience |

### Open conversations — `open-conversations`
Inbox conversations still requiring resolution.

| Rule id | Lens |
|---|---|
| `radar:inbox:open-conversations:connection` | Connection |
| `radar:inbox:open-conversations:freshness` | Freshness |
| `radar:inbox:open-conversations:threshold` | Threshold |
| `radar:inbox:open-conversations:trend` | Trend |
| `radar:inbox:open-conversations:anomaly` | Anomaly |
| `radar:inbox:open-conversations:integrity` | Integrity |
| `radar:inbox:open-conversations:continuity` | Continuity |
| `radar:inbox:open-conversations:baseline` | Baseline |
| `radar:inbox:open-conversations:confidence` | Confidence |
| `radar:inbox:open-conversations:forecast` | Forecast |
| `radar:inbox:open-conversations:volatility` | Volatility |
| `radar:inbox:open-conversations:resilience` | Resilience |

### Unread messages — `unread-messages`
Unread inbound messages across connected channels.

| Rule id | Lens |
|---|---|
| `radar:inbox:unread-messages:connection` | Connection |
| `radar:inbox:unread-messages:freshness` | Freshness |
| `radar:inbox:unread-messages:threshold` | Threshold |
| `radar:inbox:unread-messages:trend` | Trend |
| `radar:inbox:unread-messages:anomaly` | Anomaly |
| `radar:inbox:unread-messages:integrity` | Integrity |
| `radar:inbox:unread-messages:continuity` | Continuity |
| `radar:inbox:unread-messages:baseline` | Baseline |
| `radar:inbox:unread-messages:confidence` | Confidence |
| `radar:inbox:unread-messages:forecast` | Forecast |
| `radar:inbox:unread-messages:volatility` | Volatility |
| `radar:inbox:unread-messages:resilience` | Resilience |

### Response overdue — `response-overdue`
Conversations whose response due time has passed.

| Rule id | Lens |
|---|---|
| `radar:inbox:response-overdue:connection` | Connection |
| `radar:inbox:response-overdue:freshness` | Freshness |
| `radar:inbox:response-overdue:threshold` | Threshold |
| `radar:inbox:response-overdue:trend` | Trend |
| `radar:inbox:response-overdue:anomaly` | Anomaly |
| `radar:inbox:response-overdue:integrity` | Integrity |
| `radar:inbox:response-overdue:continuity` | Continuity |
| `radar:inbox:response-overdue:baseline` | Baseline |
| `radar:inbox:response-overdue:confidence` | Confidence |
| `radar:inbox:response-overdue:forecast` | Forecast |
| `radar:inbox:response-overdue:volatility` | Volatility |
| `radar:inbox:response-overdue:resilience` | Resilience |

### Unassigned conversations — `unassigned-conversations`
Open conversations without a clear owner.

| Rule id | Lens |
|---|---|
| `radar:inbox:unassigned-conversations:connection` | Connection |
| `radar:inbox:unassigned-conversations:freshness` | Freshness |
| `radar:inbox:unassigned-conversations:threshold` | Threshold |
| `radar:inbox:unassigned-conversations:trend` | Trend |
| `radar:inbox:unassigned-conversations:anomaly` | Anomaly |
| `radar:inbox:unassigned-conversations:integrity` | Integrity |
| `radar:inbox:unassigned-conversations:continuity` | Continuity |
| `radar:inbox:unassigned-conversations:baseline` | Baseline |
| `radar:inbox:unassigned-conversations:confidence` | Confidence |
| `radar:inbox:unassigned-conversations:forecast` | Forecast |
| `radar:inbox:unassigned-conversations:volatility` | Volatility |
| `radar:inbox:unassigned-conversations:resilience` | Resilience |

### Failed outbound messages — `failed-messages`
Messages that failed to send or deliver.

| Rule id | Lens |
|---|---|
| `radar:inbox:failed-messages:connection` | Connection |
| `radar:inbox:failed-messages:freshness` | Freshness |
| `radar:inbox:failed-messages:threshold` | Threshold |
| `radar:inbox:failed-messages:trend` | Trend |
| `radar:inbox:failed-messages:anomaly` | Anomaly |
| `radar:inbox:failed-messages:integrity` | Integrity |
| `radar:inbox:failed-messages:continuity` | Continuity |
| `radar:inbox:failed-messages:baseline` | Baseline |
| `radar:inbox:failed-messages:confidence` | Confidence |
| `radar:inbox:failed-messages:forecast` | Forecast |
| `radar:inbox:failed-messages:volatility` | Volatility |
| `radar:inbox:failed-messages:resilience` | Resilience |

### Channel connections — `channel-connections`
Instagram and Facebook channel connection coverage.

| Rule id | Lens |
|---|---|
| `radar:inbox:channel-connections:connection` | Connection |
| `radar:inbox:channel-connections:freshness` | Freshness |
| `radar:inbox:channel-connections:threshold` | Threshold |
| `radar:inbox:channel-connections:trend` | Trend |
| `radar:inbox:channel-connections:anomaly` | Anomaly |
| `radar:inbox:channel-connections:integrity` | Integrity |
| `radar:inbox:channel-connections:continuity` | Continuity |
| `radar:inbox:channel-connections:baseline` | Baseline |
| `radar:inbox:channel-connections:confidence` | Confidence |
| `radar:inbox:channel-connections:forecast` | Forecast |
| `radar:inbox:channel-connections:volatility` | Volatility |
| `radar:inbox:channel-connections:resilience` | Resilience |

### Connection errors — `connection-errors`
Channels reporting connection or authentication problems.

| Rule id | Lens |
|---|---|
| `radar:inbox:connection-errors:connection` | Connection |
| `radar:inbox:connection-errors:freshness` | Freshness |
| `radar:inbox:connection-errors:threshold` | Threshold |
| `radar:inbox:connection-errors:trend` | Trend |
| `radar:inbox:connection-errors:anomaly` | Anomaly |
| `radar:inbox:connection-errors:integrity` | Integrity |
| `radar:inbox:connection-errors:continuity` | Continuity |
| `radar:inbox:connection-errors:baseline` | Baseline |
| `radar:inbox:connection-errors:confidence` | Confidence |
| `radar:inbox:connection-errors:forecast` | Forecast |
| `radar:inbox:connection-errors:volatility` | Volatility |
| `radar:inbox:connection-errors:resilience` | Resilience |

### Webhook health — `webhook-health`
Subscription and inbound webhook activity.

| Rule id | Lens |
|---|---|
| `radar:inbox:webhook-health:connection` | Connection |
| `radar:inbox:webhook-health:freshness` | Freshness |
| `radar:inbox:webhook-health:threshold` | Threshold |
| `radar:inbox:webhook-health:trend` | Trend |
| `radar:inbox:webhook-health:anomaly` | Anomaly |
| `radar:inbox:webhook-health:integrity` | Integrity |
| `radar:inbox:webhook-health:continuity` | Continuity |
| `radar:inbox:webhook-health:baseline` | Baseline |
| `radar:inbox:webhook-health:confidence` | Confidence |
| `radar:inbox:webhook-health:forecast` | Forecast |
| `radar:inbox:webhook-health:volatility` | Volatility |
| `radar:inbox:webhook-health:resilience` | Resilience |

### Inbox sync freshness — `sync-freshness`
Age of the latest successful sync or webhook.

| Rule id | Lens |
|---|---|
| `radar:inbox:sync-freshness:connection` | Connection |
| `radar:inbox:sync-freshness:freshness` | Freshness |
| `radar:inbox:sync-freshness:threshold` | Threshold |
| `radar:inbox:sync-freshness:trend` | Trend |
| `radar:inbox:sync-freshness:anomaly` | Anomaly |
| `radar:inbox:sync-freshness:integrity` | Integrity |
| `radar:inbox:sync-freshness:continuity` | Continuity |
| `radar:inbox:sync-freshness:baseline` | Baseline |
| `radar:inbox:sync-freshness:confidence` | Confidence |
| `radar:inbox:sync-freshness:forecast` | Forecast |
| `radar:inbox:sync-freshness:volatility` | Volatility |
| `radar:inbox:sync-freshness:resilience` | Resilience |

### Support demand — `support-demand`
Open support enquiries and portal support requests.

| Rule id | Lens |
|---|---|
| `radar:inbox:support-demand:connection` | Connection |
| `radar:inbox:support-demand:freshness` | Freshness |
| `radar:inbox:support-demand:threshold` | Threshold |
| `radar:inbox:support-demand:trend` | Trend |
| `radar:inbox:support-demand:anomaly` | Anomaly |
| `radar:inbox:support-demand:integrity` | Integrity |
| `radar:inbox:support-demand:continuity` | Continuity |
| `radar:inbox:support-demand:baseline` | Baseline |
| `radar:inbox:support-demand:confidence` | Confidence |
| `radar:inbox:support-demand:forecast` | Forecast |
| `radar:inbox:support-demand:volatility` | Volatility |
| `radar:inbox:support-demand:resilience` | Resilience |

### Enquiry notification delivery — `notification-delivery`
Delivery state of internal lead notifications.

| Rule id | Lens |
|---|---|
| `radar:inbox:notification-delivery:connection` | Connection |
| `radar:inbox:notification-delivery:freshness` | Freshness |
| `radar:inbox:notification-delivery:threshold` | Threshold |
| `radar:inbox:notification-delivery:trend` | Trend |
| `radar:inbox:notification-delivery:anomaly` | Anomaly |
| `radar:inbox:notification-delivery:integrity` | Integrity |
| `radar:inbox:notification-delivery:continuity` | Continuity |
| `radar:inbox:notification-delivery:baseline` | Baseline |
| `radar:inbox:notification-delivery:confidence` | Confidence |
| `radar:inbox:notification-delivery:forecast` | Forecast |
| `radar:inbox:notification-delivery:volatility` | Volatility |
| `radar:inbox:notification-delivery:resilience` | Resilience |

## `clients` — 12 families (144 rules)

### Active clients — `active-clients`
Current active client portfolio size.

| Rule id | Lens |
|---|---|
| `radar:clients:active-clients:connection` | Connection |
| `radar:clients:active-clients:freshness` | Freshness |
| `radar:clients:active-clients:threshold` | Threshold |
| `radar:clients:active-clients:trend` | Trend |
| `radar:clients:active-clients:anomaly` | Anomaly |
| `radar:clients:active-clients:integrity` | Integrity |
| `radar:clients:active-clients:continuity` | Continuity |
| `radar:clients:active-clients:baseline` | Baseline |
| `radar:clients:active-clients:confidence` | Confidence |
| `radar:clients:active-clients:forecast` | Forecast |
| `radar:clients:active-clients:volatility` | Volatility |
| `radar:clients:active-clients:resilience` | Resilience |

### Clients needing attention — `attention-clients`
Clients with service, contact, delivery, or system concerns.

| Rule id | Lens |
|---|---|
| `radar:clients:attention-clients:connection` | Connection |
| `radar:clients:attention-clients:freshness` | Freshness |
| `radar:clients:attention-clients:threshold` | Threshold |
| `radar:clients:attention-clients:trend` | Trend |
| `radar:clients:attention-clients:anomaly` | Anomaly |
| `radar:clients:attention-clients:integrity` | Integrity |
| `radar:clients:attention-clients:continuity` | Continuity |
| `radar:clients:attention-clients:baseline` | Baseline |
| `radar:clients:attention-clients:confidence` | Confidence |
| `radar:clients:attention-clients:forecast` | Forecast |
| `radar:clients:attention-clients:volatility` | Volatility |
| `radar:clients:attention-clients:resilience` | Resilience |

### Client owner coverage — `owner-coverage`
Active clients with a responsible account email recorded.

| Rule id | Lens |
|---|---|
| `radar:clients:owner-coverage:connection` | Connection |
| `radar:clients:owner-coverage:freshness` | Freshness |
| `radar:clients:owner-coverage:threshold` | Threshold |
| `radar:clients:owner-coverage:trend` | Trend |
| `radar:clients:owner-coverage:anomaly` | Anomaly |
| `radar:clients:owner-coverage:integrity` | Integrity |
| `radar:clients:owner-coverage:continuity` | Continuity |
| `radar:clients:owner-coverage:baseline` | Baseline |
| `radar:clients:owner-coverage:confidence` | Confidence |
| `radar:clients:owner-coverage:forecast` | Forecast |
| `radar:clients:owner-coverage:volatility` | Volatility |
| `radar:clients:owner-coverage:resilience` | Resilience |

### Client contact freshness — `contact-freshness`
Time since the last recorded client contact.

| Rule id | Lens |
|---|---|
| `radar:clients:contact-freshness:connection` | Connection |
| `radar:clients:contact-freshness:freshness` | Freshness |
| `radar:clients:contact-freshness:threshold` | Threshold |
| `radar:clients:contact-freshness:trend` | Trend |
| `radar:clients:contact-freshness:anomaly` | Anomaly |
| `radar:clients:contact-freshness:integrity` | Integrity |
| `radar:clients:contact-freshness:continuity` | Continuity |
| `radar:clients:contact-freshness:baseline` | Baseline |
| `radar:clients:contact-freshness:confidence` | Confidence |
| `radar:clients:contact-freshness:forecast` | Forecast |
| `radar:clients:contact-freshness:volatility` | Volatility |
| `radar:clients:contact-freshness:resilience` | Resilience |

### Client telemetry coverage — `telemetry-coverage`
Active clients whose digital properties report live telemetry.

| Rule id | Lens |
|---|---|
| `radar:clients:telemetry-coverage:connection` | Connection |
| `radar:clients:telemetry-coverage:freshness` | Freshness |
| `radar:clients:telemetry-coverage:threshold` | Threshold |
| `radar:clients:telemetry-coverage:trend` | Trend |
| `radar:clients:telemetry-coverage:anomaly` | Anomaly |
| `radar:clients:telemetry-coverage:integrity` | Integrity |
| `radar:clients:telemetry-coverage:continuity` | Continuity |
| `radar:clients:telemetry-coverage:baseline` | Baseline |
| `radar:clients:telemetry-coverage:confidence` | Confidence |
| `radar:clients:telemetry-coverage:forecast` | Forecast |
| `radar:clients:telemetry-coverage:volatility` | Volatility |
| `radar:clients:telemetry-coverage:resilience` | Resilience |

### Client telemetry freshness — `telemetry-freshness`
Age of the latest client property event.

| Rule id | Lens |
|---|---|
| `radar:clients:telemetry-freshness:connection` | Connection |
| `radar:clients:telemetry-freshness:freshness` | Freshness |
| `radar:clients:telemetry-freshness:threshold` | Threshold |
| `radar:clients:telemetry-freshness:trend` | Trend |
| `radar:clients:telemetry-freshness:anomaly` | Anomaly |
| `radar:clients:telemetry-freshness:integrity` | Integrity |
| `radar:clients:telemetry-freshness:continuity` | Continuity |
| `radar:clients:telemetry-freshness:baseline` | Baseline |
| `radar:clients:telemetry-freshness:confidence` | Confidence |
| `radar:clients:telemetry-freshness:forecast` | Forecast |
| `radar:clients:telemetry-freshness:volatility` | Volatility |
| `radar:clients:telemetry-freshness:resilience` | Resilience |

### Client production errors — `production-errors`
Live errors recorded across client properties.

| Rule id | Lens |
|---|---|
| `radar:clients:production-errors:connection` | Connection |
| `radar:clients:production-errors:freshness` | Freshness |
| `radar:clients:production-errors:threshold` | Threshold |
| `radar:clients:production-errors:trend` | Trend |
| `radar:clients:production-errors:anomaly` | Anomaly |
| `radar:clients:production-errors:integrity` | Integrity |
| `radar:clients:production-errors:continuity` | Continuity |
| `radar:clients:production-errors:baseline` | Baseline |
| `radar:clients:production-errors:confidence` | Confidence |
| `radar:clients:production-errors:forecast` | Forecast |
| `radar:clients:production-errors:volatility` | Volatility |
| `radar:clients:production-errors:resilience` | Resilience |

### Open client requests — `open-requests`
Client requests that still need action.

| Rule id | Lens |
|---|---|
| `radar:clients:open-requests:connection` | Connection |
| `radar:clients:open-requests:freshness` | Freshness |
| `radar:clients:open-requests:threshold` | Threshold |
| `radar:clients:open-requests:trend` | Trend |
| `radar:clients:open-requests:anomaly` | Anomaly |
| `radar:clients:open-requests:integrity` | Integrity |
| `radar:clients:open-requests:continuity` | Continuity |
| `radar:clients:open-requests:baseline` | Baseline |
| `radar:clients:open-requests:confidence` | Confidence |
| `radar:clients:open-requests:forecast` | Forecast |
| `radar:clients:open-requests:volatility` | Volatility |
| `radar:clients:open-requests:resilience` | Resilience |

### Blocked milestones — `blocked-milestones`
Client outcomes blocked from progressing.

| Rule id | Lens |
|---|---|
| `radar:clients:blocked-milestones:connection` | Connection |
| `radar:clients:blocked-milestones:freshness` | Freshness |
| `radar:clients:blocked-milestones:threshold` | Threshold |
| `radar:clients:blocked-milestones:trend` | Trend |
| `radar:clients:blocked-milestones:anomaly` | Anomaly |
| `radar:clients:blocked-milestones:integrity` | Integrity |
| `radar:clients:blocked-milestones:continuity` | Continuity |
| `radar:clients:blocked-milestones:baseline` | Baseline |
| `radar:clients:blocked-milestones:confidence` | Confidence |
| `radar:clients:blocked-milestones:forecast` | Forecast |
| `radar:clients:blocked-milestones:volatility` | Volatility |
| `radar:clients:blocked-milestones:resilience` | Resilience |

### Client product coverage — `product-coverage`
Active clients with at least one product or service assigned.

| Rule id | Lens |
|---|---|
| `radar:clients:product-coverage:connection` | Connection |
| `radar:clients:product-coverage:freshness` | Freshness |
| `radar:clients:product-coverage:threshold` | Threshold |
| `radar:clients:product-coverage:trend` | Trend |
| `radar:clients:product-coverage:anomaly` | Anomaly |
| `radar:clients:product-coverage:integrity` | Integrity |
| `radar:clients:product-coverage:continuity` | Continuity |
| `radar:clients:product-coverage:baseline` | Baseline |
| `radar:clients:product-coverage:confidence` | Confidence |
| `radar:clients:product-coverage:forecast` | Forecast |
| `radar:clients:product-coverage:volatility` | Volatility |
| `radar:clients:product-coverage:resilience` | Resilience |

### Client source attribution — `source-attribution`
Client records retaining their original lead source.

| Rule id | Lens |
|---|---|
| `radar:clients:source-attribution:connection` | Connection |
| `radar:clients:source-attribution:freshness` | Freshness |
| `radar:clients:source-attribution:threshold` | Threshold |
| `radar:clients:source-attribution:trend` | Trend |
| `radar:clients:source-attribution:anomaly` | Anomaly |
| `radar:clients:source-attribution:integrity` | Integrity |
| `radar:clients:source-attribution:continuity` | Continuity |
| `radar:clients:source-attribution:baseline` | Baseline |
| `radar:clients:source-attribution:confidence` | Confidence |
| `radar:clients:source-attribution:forecast` | Forecast |
| `radar:clients:source-attribution:volatility` | Volatility |
| `radar:clients:source-attribution:resilience` | Resilience |

### Retention state — `retention-state`
Archived and churned clients relative to the active portfolio.

| Rule id | Lens |
|---|---|
| `radar:clients:retention-state:connection` | Connection |
| `radar:clients:retention-state:freshness` | Freshness |
| `radar:clients:retention-state:threshold` | Threshold |
| `radar:clients:retention-state:trend` | Trend |
| `radar:clients:retention-state:anomaly` | Anomaly |
| `radar:clients:retention-state:integrity` | Integrity |
| `radar:clients:retention-state:continuity` | Continuity |
| `radar:clients:retention-state:baseline` | Baseline |
| `radar:clients:retention-state:confidence` | Confidence |
| `radar:clients:retention-state:forecast` | Forecast |
| `radar:clients:retention-state:volatility` | Volatility |
| `radar:clients:retention-state:resilience` | Resilience |

## `finance` — 12 families (144 rules)

### Monthly revenue — `monthly-revenue`
Recorded income in the current reporting month.

| Rule id | Lens |
|---|---|
| `radar:finance:monthly-revenue:connection` | Connection |
| `radar:finance:monthly-revenue:freshness` | Freshness |
| `radar:finance:monthly-revenue:threshold` | Threshold |
| `radar:finance:monthly-revenue:trend` | Trend |
| `radar:finance:monthly-revenue:anomaly` | Anomaly |
| `radar:finance:monthly-revenue:integrity` | Integrity |
| `radar:finance:monthly-revenue:continuity` | Continuity |
| `radar:finance:monthly-revenue:baseline` | Baseline |
| `radar:finance:monthly-revenue:confidence` | Confidence |
| `radar:finance:monthly-revenue:forecast` | Forecast |
| `radar:finance:monthly-revenue:volatility` | Volatility |
| `radar:finance:monthly-revenue:resilience` | Resilience |

### Monthly recurring revenue — `mrr`
Current recurring revenue baseline.

| Rule id | Lens |
|---|---|
| `radar:finance:mrr:connection` | Connection |
| `radar:finance:mrr:freshness` | Freshness |
| `radar:finance:mrr:threshold` | Threshold |
| `radar:finance:mrr:trend` | Trend |
| `radar:finance:mrr:anomaly` | Anomaly |
| `radar:finance:mrr:integrity` | Integrity |
| `radar:finance:mrr:continuity` | Continuity |
| `radar:finance:mrr:baseline` | Baseline |
| `radar:finance:mrr:confidence` | Confidence |
| `radar:finance:mrr:forecast` | Forecast |
| `radar:finance:mrr:volatility` | Volatility |
| `radar:finance:mrr:resilience` | Resilience |

### Revenue target progress — `target-progress`
Income pace against the monthly company target.

| Rule id | Lens |
|---|---|
| `radar:finance:target-progress:connection` | Connection |
| `radar:finance:target-progress:freshness` | Freshness |
| `radar:finance:target-progress:threshold` | Threshold |
| `radar:finance:target-progress:trend` | Trend |
| `radar:finance:target-progress:anomaly` | Anomaly |
| `radar:finance:target-progress:integrity` | Integrity |
| `radar:finance:target-progress:continuity` | Continuity |
| `radar:finance:target-progress:baseline` | Baseline |
| `radar:finance:target-progress:confidence` | Confidence |
| `radar:finance:target-progress:forecast` | Forecast |
| `radar:finance:target-progress:volatility` | Volatility |
| `radar:finance:target-progress:resilience` | Resilience |

### Revenue and cash gap — `cash-gap`
Outstanding amount required to reach plan.

| Rule id | Lens |
|---|---|
| `radar:finance:cash-gap:connection` | Connection |
| `radar:finance:cash-gap:freshness` | Freshness |
| `radar:finance:cash-gap:threshold` | Threshold |
| `radar:finance:cash-gap:trend` | Trend |
| `radar:finance:cash-gap:anomaly` | Anomaly |
| `radar:finance:cash-gap:integrity` | Integrity |
| `radar:finance:cash-gap:continuity` | Continuity |
| `radar:finance:cash-gap:baseline` | Baseline |
| `radar:finance:cash-gap:confidence` | Confidence |
| `radar:finance:cash-gap:forecast` | Forecast |
| `radar:finance:cash-gap:volatility` | Volatility |
| `radar:finance:cash-gap:resilience` | Resilience |

### Overdue invoices — `overdue-invoices`
Invoices whose payment deadline has passed.

| Rule id | Lens |
|---|---|
| `radar:finance:overdue-invoices:connection` | Connection |
| `radar:finance:overdue-invoices:freshness` | Freshness |
| `radar:finance:overdue-invoices:threshold` | Threshold |
| `radar:finance:overdue-invoices:trend` | Trend |
| `radar:finance:overdue-invoices:anomaly` | Anomaly |
| `radar:finance:overdue-invoices:integrity` | Integrity |
| `radar:finance:overdue-invoices:continuity` | Continuity |
| `radar:finance:overdue-invoices:baseline` | Baseline |
| `radar:finance:overdue-invoices:confidence` | Confidence |
| `radar:finance:overdue-invoices:forecast` | Forecast |
| `radar:finance:overdue-invoices:volatility` | Volatility |
| `radar:finance:overdue-invoices:resilience` | Resilience |

### Budget pressure — `budget-pressure`
Pots nearing or exceeding funded limits.

| Rule id | Lens |
|---|---|
| `radar:finance:budget-pressure:connection` | Connection |
| `radar:finance:budget-pressure:freshness` | Freshness |
| `radar:finance:budget-pressure:threshold` | Threshold |
| `radar:finance:budget-pressure:trend` | Trend |
| `radar:finance:budget-pressure:anomaly` | Anomaly |
| `radar:finance:budget-pressure:integrity` | Integrity |
| `radar:finance:budget-pressure:continuity` | Continuity |
| `radar:finance:budget-pressure:baseline` | Baseline |
| `radar:finance:budget-pressure:confidence` | Confidence |
| `radar:finance:budget-pressure:forecast` | Forecast |
| `radar:finance:budget-pressure:volatility` | Volatility |
| `radar:finance:budget-pressure:resilience` | Resilience |

### Finance obligations — `obligations`
Tax, audit, insurance, filing, and renewal deadlines.

| Rule id | Lens |
|---|---|
| `radar:finance:obligations:connection` | Connection |
| `radar:finance:obligations:freshness` | Freshness |
| `radar:finance:obligations:threshold` | Threshold |
| `radar:finance:obligations:trend` | Trend |
| `radar:finance:obligations:anomaly` | Anomaly |
| `radar:finance:obligations:integrity` | Integrity |
| `radar:finance:obligations:continuity` | Continuity |
| `radar:finance:obligations:baseline` | Baseline |
| `radar:finance:obligations:confidence` | Confidence |
| `radar:finance:obligations:forecast` | Forecast |
| `radar:finance:obligations:volatility` | Volatility |
| `radar:finance:obligations:resilience` | Resilience |

### People payments — `people-payments`
Salary, bonus, freelancer, and contractor payment readiness.

| Rule id | Lens |
|---|---|
| `radar:finance:people-payments:connection` | Connection |
| `radar:finance:people-payments:freshness` | Freshness |
| `radar:finance:people-payments:threshold` | Threshold |
| `radar:finance:people-payments:trend` | Trend |
| `radar:finance:people-payments:anomaly` | Anomaly |
| `radar:finance:people-payments:integrity` | Integrity |
| `radar:finance:people-payments:continuity` | Continuity |
| `radar:finance:people-payments:baseline` | Baseline |
| `radar:finance:people-payments:confidence` | Confidence |
| `radar:finance:people-payments:forecast` | Forecast |
| `radar:finance:people-payments:volatility` | Volatility |
| `radar:finance:people-payments:resilience` | Resilience |

### Expense evidence — `expense-evidence`
Paid costs backed by receipts or supporting records.

| Rule id | Lens |
|---|---|
| `radar:finance:expense-evidence:connection` | Connection |
| `radar:finance:expense-evidence:freshness` | Freshness |
| `radar:finance:expense-evidence:threshold` | Threshold |
| `radar:finance:expense-evidence:trend` | Trend |
| `radar:finance:expense-evidence:anomaly` | Anomaly |
| `radar:finance:expense-evidence:integrity` | Integrity |
| `radar:finance:expense-evidence:continuity` | Continuity |
| `radar:finance:expense-evidence:baseline` | Baseline |
| `radar:finance:expense-evidence:confidence` | Confidence |
| `radar:finance:expense-evidence:forecast` | Forecast |
| `radar:finance:expense-evidence:volatility` | Volatility |
| `radar:finance:expense-evidence:resilience` | Resilience |

### Recurring costs — `recurring-costs`
Scheduled expenses due or overdue.

| Rule id | Lens |
|---|---|
| `radar:finance:recurring-costs:connection` | Connection |
| `radar:finance:recurring-costs:freshness` | Freshness |
| `radar:finance:recurring-costs:threshold` | Threshold |
| `radar:finance:recurring-costs:trend` | Trend |
| `radar:finance:recurring-costs:anomaly` | Anomaly |
| `radar:finance:recurring-costs:integrity` | Integrity |
| `radar:finance:recurring-costs:continuity` | Continuity |
| `radar:finance:recurring-costs:baseline` | Baseline |
| `radar:finance:recurring-costs:confidence` | Confidence |
| `radar:finance:recurring-costs:forecast` | Forecast |
| `radar:finance:recurring-costs:volatility` | Volatility |
| `radar:finance:recurring-costs:resilience` | Resilience |

### Currency coverage — `currency-coverage`
Reporting currency and international transaction readiness.

| Rule id | Lens |
|---|---|
| `radar:finance:currency-coverage:connection` | Connection |
| `radar:finance:currency-coverage:freshness` | Freshness |
| `radar:finance:currency-coverage:threshold` | Threshold |
| `radar:finance:currency-coverage:trend` | Trend |
| `radar:finance:currency-coverage:anomaly` | Anomaly |
| `radar:finance:currency-coverage:integrity` | Integrity |
| `radar:finance:currency-coverage:continuity` | Continuity |
| `radar:finance:currency-coverage:baseline` | Baseline |
| `radar:finance:currency-coverage:confidence` | Confidence |
| `radar:finance:currency-coverage:forecast` | Forecast |
| `radar:finance:currency-coverage:volatility` | Volatility |
| `radar:finance:currency-coverage:resilience` | Resilience |

### Finance record coverage — `finance-records`
Connected invoices, expenses, budgets, and planning records.

| Rule id | Lens |
|---|---|
| `radar:finance:finance-records:connection` | Connection |
| `radar:finance:finance-records:freshness` | Freshness |
| `radar:finance:finance-records:threshold` | Threshold |
| `radar:finance:finance-records:trend` | Trend |
| `radar:finance:finance-records:anomaly` | Anomaly |
| `radar:finance:finance-records:integrity` | Integrity |
| `radar:finance:finance-records:continuity` | Continuity |
| `radar:finance:finance-records:baseline` | Baseline |
| `radar:finance:finance-records:confidence` | Confidence |
| `radar:finance:finance-records:forecast` | Forecast |
| `radar:finance:finance-records:volatility` | Volatility |
| `radar:finance:finance-records:resilience` | Resilience |

## `delivery` — 12 families (144 rules)

### Fulfilment pipelines — `fulfilment-pipelines`
Configured delivery pipelines and stages.

| Rule id | Lens |
|---|---|
| `radar:delivery:fulfilment-pipelines:connection` | Connection |
| `radar:delivery:fulfilment-pipelines:freshness` | Freshness |
| `radar:delivery:fulfilment-pipelines:threshold` | Threshold |
| `radar:delivery:fulfilment-pipelines:trend` | Trend |
| `radar:delivery:fulfilment-pipelines:anomaly` | Anomaly |
| `radar:delivery:fulfilment-pipelines:integrity` | Integrity |
| `radar:delivery:fulfilment-pipelines:continuity` | Continuity |
| `radar:delivery:fulfilment-pipelines:baseline` | Baseline |
| `radar:delivery:fulfilment-pipelines:confidence` | Confidence |
| `radar:delivery:fulfilment-pipelines:forecast` | Forecast |
| `radar:delivery:fulfilment-pipelines:volatility` | Volatility |
| `radar:delivery:fulfilment-pipelines:resilience` | Resilience |

### Delivery work in flight — `delivery-cards`
Cards currently moving through fulfilment pipelines.

| Rule id | Lens |
|---|---|
| `radar:delivery:delivery-cards:connection` | Connection |
| `radar:delivery:delivery-cards:freshness` | Freshness |
| `radar:delivery:delivery-cards:threshold` | Threshold |
| `radar:delivery:delivery-cards:trend` | Trend |
| `radar:delivery:delivery-cards:anomaly` | Anomaly |
| `radar:delivery:delivery-cards:integrity` | Integrity |
| `radar:delivery:delivery-cards:continuity` | Continuity |
| `radar:delivery:delivery-cards:baseline` | Baseline |
| `radar:delivery:delivery-cards:confidence` | Confidence |
| `radar:delivery:delivery-cards:forecast` | Forecast |
| `radar:delivery:delivery-cards:volatility` | Volatility |
| `radar:delivery:delivery-cards:resilience` | Resilience |

### Stalled delivery work — `stalled-cards`
Delivery cards with no recent movement.

| Rule id | Lens |
|---|---|
| `radar:delivery:stalled-cards:connection` | Connection |
| `radar:delivery:stalled-cards:freshness` | Freshness |
| `radar:delivery:stalled-cards:threshold` | Threshold |
| `radar:delivery:stalled-cards:trend` | Trend |
| `radar:delivery:stalled-cards:anomaly` | Anomaly |
| `radar:delivery:stalled-cards:integrity` | Integrity |
| `radar:delivery:stalled-cards:continuity` | Continuity |
| `radar:delivery:stalled-cards:baseline` | Baseline |
| `radar:delivery:stalled-cards:confidence` | Confidence |
| `radar:delivery:stalled-cards:forecast` | Forecast |
| `radar:delivery:stalled-cards:volatility` | Volatility |
| `radar:delivery:stalled-cards:resilience` | Resilience |

### Client milestones — `milestones`
Tracked delivery and outcome milestones.

| Rule id | Lens |
|---|---|
| `radar:delivery:milestones:connection` | Connection |
| `radar:delivery:milestones:freshness` | Freshness |
| `radar:delivery:milestones:threshold` | Threshold |
| `radar:delivery:milestones:trend` | Trend |
| `radar:delivery:milestones:anomaly` | Anomaly |
| `radar:delivery:milestones:integrity` | Integrity |
| `radar:delivery:milestones:continuity` | Continuity |
| `radar:delivery:milestones:baseline` | Baseline |
| `radar:delivery:milestones:confidence` | Confidence |
| `radar:delivery:milestones:forecast` | Forecast |
| `radar:delivery:milestones:volatility` | Volatility |
| `radar:delivery:milestones:resilience` | Resilience |

### Blocked delivery milestones — `blocked-milestones`
Milestones explicitly marked as blocked.

| Rule id | Lens |
|---|---|
| `radar:delivery:blocked-milestones:connection` | Connection |
| `radar:delivery:blocked-milestones:freshness` | Freshness |
| `radar:delivery:blocked-milestones:threshold` | Threshold |
| `radar:delivery:blocked-milestones:trend` | Trend |
| `radar:delivery:blocked-milestones:anomaly` | Anomaly |
| `radar:delivery:blocked-milestones:integrity` | Integrity |
| `radar:delivery:blocked-milestones:continuity` | Continuity |
| `radar:delivery:blocked-milestones:baseline` | Baseline |
| `radar:delivery:blocked-milestones:confidence` | Confidence |
| `radar:delivery:blocked-milestones:forecast` | Forecast |
| `radar:delivery:blocked-milestones:volatility` | Volatility |
| `radar:delivery:blocked-milestones:resilience` | Resilience |

### Overdue delivery milestones — `overdue-milestones`
Incomplete milestones beyond their target date.

| Rule id | Lens |
|---|---|
| `radar:delivery:overdue-milestones:connection` | Connection |
| `radar:delivery:overdue-milestones:freshness` | Freshness |
| `radar:delivery:overdue-milestones:threshold` | Threshold |
| `radar:delivery:overdue-milestones:trend` | Trend |
| `radar:delivery:overdue-milestones:anomaly` | Anomaly |
| `radar:delivery:overdue-milestones:integrity` | Integrity |
| `radar:delivery:overdue-milestones:continuity` | Continuity |
| `radar:delivery:overdue-milestones:baseline` | Baseline |
| `radar:delivery:overdue-milestones:confidence` | Confidence |
| `radar:delivery:overdue-milestones:forecast` | Forecast |
| `radar:delivery:overdue-milestones:volatility` | Volatility |
| `radar:delivery:overdue-milestones:resilience` | Resilience |

### Product assignments — `product-assignments`
Products attached to active client workspaces.

| Rule id | Lens |
|---|---|
| `radar:delivery:product-assignments:connection` | Connection |
| `radar:delivery:product-assignments:freshness` | Freshness |
| `radar:delivery:product-assignments:threshold` | Threshold |
| `radar:delivery:product-assignments:trend` | Trend |
| `radar:delivery:product-assignments:anomaly` | Anomaly |
| `radar:delivery:product-assignments:integrity` | Integrity |
| `radar:delivery:product-assignments:continuity` | Continuity |
| `radar:delivery:product-assignments:baseline` | Baseline |
| `radar:delivery:product-assignments:confidence` | Confidence |
| `radar:delivery:product-assignments:forecast` | Forecast |
| `radar:delivery:product-assignments:volatility` | Volatility |
| `radar:delivery:product-assignments:resilience` | Resilience |

### Pending approvals — `pending-approvals`
Client approvals still awaiting a decision.

| Rule id | Lens |
|---|---|
| `radar:delivery:pending-approvals:connection` | Connection |
| `radar:delivery:pending-approvals:freshness` | Freshness |
| `radar:delivery:pending-approvals:threshold` | Threshold |
| `radar:delivery:pending-approvals:trend` | Trend |
| `radar:delivery:pending-approvals:anomaly` | Anomaly |
| `radar:delivery:pending-approvals:integrity` | Integrity |
| `radar:delivery:pending-approvals:continuity` | Continuity |
| `radar:delivery:pending-approvals:baseline` | Baseline |
| `radar:delivery:pending-approvals:confidence` | Confidence |
| `radar:delivery:pending-approvals:forecast` | Forecast |
| `radar:delivery:pending-approvals:volatility` | Volatility |
| `radar:delivery:pending-approvals:resilience` | Resilience |

### Delivery requests — `open-requests`
Open delivery and change requests from clients.

| Rule id | Lens |
|---|---|
| `radar:delivery:open-requests:connection` | Connection |
| `radar:delivery:open-requests:freshness` | Freshness |
| `radar:delivery:open-requests:threshold` | Threshold |
| `radar:delivery:open-requests:trend` | Trend |
| `radar:delivery:open-requests:anomaly` | Anomaly |
| `radar:delivery:open-requests:integrity` | Integrity |
| `radar:delivery:open-requests:continuity` | Continuity |
| `radar:delivery:open-requests:baseline` | Baseline |
| `radar:delivery:open-requests:confidence` | Confidence |
| `radar:delivery:open-requests:forecast` | Forecast |
| `radar:delivery:open-requests:volatility` | Volatility |
| `radar:delivery:open-requests:resilience` | Resilience |

### Deliverable coverage — `deliverables`
Files and final outputs recorded for active client work.

| Rule id | Lens |
|---|---|
| `radar:delivery:deliverables:connection` | Connection |
| `radar:delivery:deliverables:freshness` | Freshness |
| `radar:delivery:deliverables:threshold` | Threshold |
| `radar:delivery:deliverables:trend` | Trend |
| `radar:delivery:deliverables:anomaly` | Anomaly |
| `radar:delivery:deliverables:integrity` | Integrity |
| `radar:delivery:deliverables:continuity` | Continuity |
| `radar:delivery:deliverables:baseline` | Baseline |
| `radar:delivery:deliverables:confidence` | Confidence |
| `radar:delivery:deliverables:forecast` | Forecast |
| `radar:delivery:deliverables:volatility` | Volatility |
| `radar:delivery:deliverables:resilience` | Resilience |

### Portal readiness — `portal-readiness`
Prepared client portals and access delivery state.

| Rule id | Lens |
|---|---|
| `radar:delivery:portal-readiness:connection` | Connection |
| `radar:delivery:portal-readiness:freshness` | Freshness |
| `radar:delivery:portal-readiness:threshold` | Threshold |
| `radar:delivery:portal-readiness:trend` | Trend |
| `radar:delivery:portal-readiness:anomaly` | Anomaly |
| `radar:delivery:portal-readiness:integrity` | Integrity |
| `radar:delivery:portal-readiness:continuity` | Continuity |
| `radar:delivery:portal-readiness:baseline` | Baseline |
| `radar:delivery:portal-readiness:confidence` | Confidence |
| `radar:delivery:portal-readiness:forecast` | Forecast |
| `radar:delivery:portal-readiness:volatility` | Volatility |
| `radar:delivery:portal-readiness:resilience` | Resilience |

### Delivery alerts — `delivery-alerts`
Operational delivery issues requiring intervention.

| Rule id | Lens |
|---|---|
| `radar:delivery:delivery-alerts:connection` | Connection |
| `radar:delivery:delivery-alerts:freshness` | Freshness |
| `radar:delivery:delivery-alerts:threshold` | Threshold |
| `radar:delivery:delivery-alerts:trend` | Trend |
| `radar:delivery:delivery-alerts:anomaly` | Anomaly |
| `radar:delivery:delivery-alerts:integrity` | Integrity |
| `radar:delivery:delivery-alerts:continuity` | Continuity |
| `radar:delivery:delivery-alerts:baseline` | Baseline |
| `radar:delivery:delivery-alerts:confidence` | Confidence |
| `radar:delivery:delivery-alerts:forecast` | Forecast |
| `radar:delivery:delivery-alerts:volatility` | Volatility |
| `radar:delivery:delivery-alerts:resilience` | Resilience |

## `marketing` — 12 families (144 rules)

### Website traffic in 24 hours — `traffic-24h`
Pageview activity across agency and client properties.

| Rule id | Lens |
|---|---|
| `radar:marketing:traffic-24h:connection` | Connection |
| `radar:marketing:traffic-24h:freshness` | Freshness |
| `radar:marketing:traffic-24h:threshold` | Threshold |
| `radar:marketing:traffic-24h:trend` | Trend |
| `radar:marketing:traffic-24h:anomaly` | Anomaly |
| `radar:marketing:traffic-24h:integrity` | Integrity |
| `radar:marketing:traffic-24h:continuity` | Continuity |
| `radar:marketing:traffic-24h:baseline` | Baseline |
| `radar:marketing:traffic-24h:confidence` | Confidence |
| `radar:marketing:traffic-24h:forecast` | Forecast |
| `radar:marketing:traffic-24h:volatility` | Volatility |
| `radar:marketing:traffic-24h:resilience` | Resilience |

### Website traffic in 7 days — `traffic-7d`
Current weekly traffic across monitored properties.

| Rule id | Lens |
|---|---|
| `radar:marketing:traffic-7d:connection` | Connection |
| `radar:marketing:traffic-7d:freshness` | Freshness |
| `radar:marketing:traffic-7d:threshold` | Threshold |
| `radar:marketing:traffic-7d:trend` | Trend |
| `radar:marketing:traffic-7d:anomaly` | Anomaly |
| `radar:marketing:traffic-7d:integrity` | Integrity |
| `radar:marketing:traffic-7d:continuity` | Continuity |
| `radar:marketing:traffic-7d:baseline` | Baseline |
| `radar:marketing:traffic-7d:confidence` | Confidence |
| `radar:marketing:traffic-7d:forecast` | Forecast |
| `radar:marketing:traffic-7d:volatility` | Volatility |
| `radar:marketing:traffic-7d:resilience` | Resilience |

### Traffic movement — `traffic-change`
Current traffic compared with the previous period.

| Rule id | Lens |
|---|---|
| `radar:marketing:traffic-change:connection` | Connection |
| `radar:marketing:traffic-change:freshness` | Freshness |
| `radar:marketing:traffic-change:threshold` | Threshold |
| `radar:marketing:traffic-change:trend` | Trend |
| `radar:marketing:traffic-change:anomaly` | Anomaly |
| `radar:marketing:traffic-change:integrity` | Integrity |
| `radar:marketing:traffic-change:continuity` | Continuity |
| `radar:marketing:traffic-change:baseline` | Baseline |
| `radar:marketing:traffic-change:confidence` | Confidence |
| `radar:marketing:traffic-change:forecast` | Forecast |
| `radar:marketing:traffic-change:volatility` | Volatility |
| `radar:marketing:traffic-change:resilience` | Resilience |

### Traffic surges — `traffic-surges`
Properties with unusually strong traffic growth.

| Rule id | Lens |
|---|---|
| `radar:marketing:traffic-surges:connection` | Connection |
| `radar:marketing:traffic-surges:freshness` | Freshness |
| `radar:marketing:traffic-surges:threshold` | Threshold |
| `radar:marketing:traffic-surges:trend` | Trend |
| `radar:marketing:traffic-surges:anomaly` | Anomaly |
| `radar:marketing:traffic-surges:integrity` | Integrity |
| `radar:marketing:traffic-surges:continuity` | Continuity |
| `radar:marketing:traffic-surges:baseline` | Baseline |
| `radar:marketing:traffic-surges:confidence` | Confidence |
| `radar:marketing:traffic-surges:forecast` | Forecast |
| `radar:marketing:traffic-surges:volatility` | Volatility |
| `radar:marketing:traffic-surges:resilience` | Resilience |

### Traffic drops — `traffic-drops`
Properties with material traffic decline or silence.

| Rule id | Lens |
|---|---|
| `radar:marketing:traffic-drops:connection` | Connection |
| `radar:marketing:traffic-drops:freshness` | Freshness |
| `radar:marketing:traffic-drops:threshold` | Threshold |
| `radar:marketing:traffic-drops:trend` | Trend |
| `radar:marketing:traffic-drops:anomaly` | Anomaly |
| `radar:marketing:traffic-drops:integrity` | Integrity |
| `radar:marketing:traffic-drops:continuity` | Continuity |
| `radar:marketing:traffic-drops:baseline` | Baseline |
| `radar:marketing:traffic-drops:confidence` | Confidence |
| `radar:marketing:traffic-drops:forecast` | Forecast |
| `radar:marketing:traffic-drops:volatility` | Volatility |
| `radar:marketing:traffic-drops:resilience` | Resilience |

### Form submissions — `form-submissions`
Every tracked website form submission.

| Rule id | Lens |
|---|---|
| `radar:marketing:form-submissions:connection` | Connection |
| `radar:marketing:form-submissions:freshness` | Freshness |
| `radar:marketing:form-submissions:threshold` | Threshold |
| `radar:marketing:form-submissions:trend` | Trend |
| `radar:marketing:form-submissions:anomaly` | Anomaly |
| `radar:marketing:form-submissions:integrity` | Integrity |
| `radar:marketing:form-submissions:continuity` | Continuity |
| `radar:marketing:form-submissions:baseline` | Baseline |
| `radar:marketing:form-submissions:confidence` | Confidence |
| `radar:marketing:form-submissions:forecast` | Forecast |
| `radar:marketing:form-submissions:volatility` | Volatility |
| `radar:marketing:form-submissions:resilience` | Resilience |

### Tracked conversions — `conversions`
Conversion events across agency and client journeys.

| Rule id | Lens |
|---|---|
| `radar:marketing:conversions:connection` | Connection |
| `radar:marketing:conversions:freshness` | Freshness |
| `radar:marketing:conversions:threshold` | Threshold |
| `radar:marketing:conversions:trend` | Trend |
| `radar:marketing:conversions:anomaly` | Anomaly |
| `radar:marketing:conversions:integrity` | Integrity |
| `radar:marketing:conversions:continuity` | Continuity |
| `radar:marketing:conversions:baseline` | Baseline |
| `radar:marketing:conversions:confidence` | Confidence |
| `radar:marketing:conversions:forecast` | Forecast |
| `radar:marketing:conversions:volatility` | Volatility |
| `radar:marketing:conversions:resilience` | Resilience |

### Website conversion rate — `conversion-rate`
Conversions as a share of tracked pageviews.

| Rule id | Lens |
|---|---|
| `radar:marketing:conversion-rate:connection` | Connection |
| `radar:marketing:conversion-rate:freshness` | Freshness |
| `radar:marketing:conversion-rate:threshold` | Threshold |
| `radar:marketing:conversion-rate:trend` | Trend |
| `radar:marketing:conversion-rate:anomaly` | Anomaly |
| `radar:marketing:conversion-rate:integrity` | Integrity |
| `radar:marketing:conversion-rate:continuity` | Continuity |
| `radar:marketing:conversion-rate:baseline` | Baseline |
| `radar:marketing:conversion-rate:confidence` | Confidence |
| `radar:marketing:conversion-rate:forecast` | Forecast |
| `radar:marketing:conversion-rate:volatility` | Volatility |
| `radar:marketing:conversion-rate:resilience` | Resilience |

### Campaign attribution — `campaign-attribution`
Enquiries retaining campaign or referral context.

| Rule id | Lens |
|---|---|
| `radar:marketing:campaign-attribution:connection` | Connection |
| `radar:marketing:campaign-attribution:freshness` | Freshness |
| `radar:marketing:campaign-attribution:threshold` | Threshold |
| `radar:marketing:campaign-attribution:trend` | Trend |
| `radar:marketing:campaign-attribution:anomaly` | Anomaly |
| `radar:marketing:campaign-attribution:integrity` | Integrity |
| `radar:marketing:campaign-attribution:continuity` | Continuity |
| `radar:marketing:campaign-attribution:baseline` | Baseline |
| `radar:marketing:campaign-attribution:confidence` | Confidence |
| `radar:marketing:campaign-attribution:forecast` | Forecast |
| `radar:marketing:campaign-attribution:volatility` | Volatility |
| `radar:marketing:campaign-attribution:resilience` | Resilience |

### Unattributed leads — `unattributed-leads`
Inbound demand without a usable source or campaign.

| Rule id | Lens |
|---|---|
| `radar:marketing:unattributed-leads:connection` | Connection |
| `radar:marketing:unattributed-leads:freshness` | Freshness |
| `radar:marketing:unattributed-leads:threshold` | Threshold |
| `radar:marketing:unattributed-leads:trend` | Trend |
| `radar:marketing:unattributed-leads:anomaly` | Anomaly |
| `radar:marketing:unattributed-leads:integrity` | Integrity |
| `radar:marketing:unattributed-leads:continuity` | Continuity |
| `radar:marketing:unattributed-leads:baseline` | Baseline |
| `radar:marketing:unattributed-leads:confidence` | Confidence |
| `radar:marketing:unattributed-leads:forecast` | Forecast |
| `radar:marketing:unattributed-leads:volatility` | Volatility |
| `radar:marketing:unattributed-leads:resilience` | Resilience |

### Search visibility — `search-visibility`
Search impressions and clicks from connected properties.

| Rule id | Lens |
|---|---|
| `radar:marketing:search-visibility:connection` | Connection |
| `radar:marketing:search-visibility:freshness` | Freshness |
| `radar:marketing:search-visibility:threshold` | Threshold |
| `radar:marketing:search-visibility:trend` | Trend |
| `radar:marketing:search-visibility:anomaly` | Anomaly |
| `radar:marketing:search-visibility:integrity` | Integrity |
| `radar:marketing:search-visibility:continuity` | Continuity |
| `radar:marketing:search-visibility:baseline` | Baseline |
| `radar:marketing:search-visibility:confidence` | Confidence |
| `radar:marketing:search-visibility:forecast` | Forecast |
| `radar:marketing:search-visibility:volatility` | Volatility |
| `radar:marketing:search-visibility:resilience` | Resilience |

### Campaign record coverage — `campaign-records`
Configured campaigns, channels, budgets, and owners.

| Rule id | Lens |
|---|---|
| `radar:marketing:campaign-records:connection` | Connection |
| `radar:marketing:campaign-records:freshness` | Freshness |
| `radar:marketing:campaign-records:threshold` | Threshold |
| `radar:marketing:campaign-records:trend` | Trend |
| `radar:marketing:campaign-records:anomaly` | Anomaly |
| `radar:marketing:campaign-records:integrity` | Integrity |
| `radar:marketing:campaign-records:continuity` | Continuity |
| `radar:marketing:campaign-records:baseline` | Baseline |
| `radar:marketing:campaign-records:confidence` | Confidence |
| `radar:marketing:campaign-records:forecast` | Forecast |
| `radar:marketing:campaign-records:volatility` | Volatility |
| `radar:marketing:campaign-records:resilience` | Resilience |

## `operations` — 12 families (144 rules)

### Open tasks — `open-tasks`
Outstanding work across the operating system.

| Rule id | Lens |
|---|---|
| `radar:operations:open-tasks:connection` | Connection |
| `radar:operations:open-tasks:freshness` | Freshness |
| `radar:operations:open-tasks:threshold` | Threshold |
| `radar:operations:open-tasks:trend` | Trend |
| `radar:operations:open-tasks:anomaly` | Anomaly |
| `radar:operations:open-tasks:integrity` | Integrity |
| `radar:operations:open-tasks:continuity` | Continuity |
| `radar:operations:open-tasks:baseline` | Baseline |
| `radar:operations:open-tasks:confidence` | Confidence |
| `radar:operations:open-tasks:forecast` | Forecast |
| `radar:operations:open-tasks:volatility` | Volatility |
| `radar:operations:open-tasks:resilience` | Resilience |

### Overdue tasks — `overdue-tasks`
Tasks beyond their due date.

| Rule id | Lens |
|---|---|
| `radar:operations:overdue-tasks:connection` | Connection |
| `radar:operations:overdue-tasks:freshness` | Freshness |
| `radar:operations:overdue-tasks:threshold` | Threshold |
| `radar:operations:overdue-tasks:trend` | Trend |
| `radar:operations:overdue-tasks:anomaly` | Anomaly |
| `radar:operations:overdue-tasks:integrity` | Integrity |
| `radar:operations:overdue-tasks:continuity` | Continuity |
| `radar:operations:overdue-tasks:baseline` | Baseline |
| `radar:operations:overdue-tasks:confidence` | Confidence |
| `radar:operations:overdue-tasks:forecast` | Forecast |
| `radar:operations:overdue-tasks:volatility` | Volatility |
| `radar:operations:overdue-tasks:resilience` | Resilience |

### Urgent tasks — `urgent-tasks`
Open tasks marked urgent.

| Rule id | Lens |
|---|---|
| `radar:operations:urgent-tasks:connection` | Connection |
| `radar:operations:urgent-tasks:freshness` | Freshness |
| `radar:operations:urgent-tasks:threshold` | Threshold |
| `radar:operations:urgent-tasks:trend` | Trend |
| `radar:operations:urgent-tasks:anomaly` | Anomaly |
| `radar:operations:urgent-tasks:integrity` | Integrity |
| `radar:operations:urgent-tasks:continuity` | Continuity |
| `radar:operations:urgent-tasks:baseline` | Baseline |
| `radar:operations:urgent-tasks:confidence` | Confidence |
| `radar:operations:urgent-tasks:forecast` | Forecast |
| `radar:operations:urgent-tasks:volatility` | Volatility |
| `radar:operations:urgent-tasks:resilience` | Resilience |

### Unassigned tasks — `unassigned-tasks`
Open work without a responsible owner.

| Rule id | Lens |
|---|---|
| `radar:operations:unassigned-tasks:connection` | Connection |
| `radar:operations:unassigned-tasks:freshness` | Freshness |
| `radar:operations:unassigned-tasks:threshold` | Threshold |
| `radar:operations:unassigned-tasks:trend` | Trend |
| `radar:operations:unassigned-tasks:anomaly` | Anomaly |
| `radar:operations:unassigned-tasks:integrity` | Integrity |
| `radar:operations:unassigned-tasks:continuity` | Continuity |
| `radar:operations:unassigned-tasks:baseline` | Baseline |
| `radar:operations:unassigned-tasks:confidence` | Confidence |
| `radar:operations:unassigned-tasks:forecast` | Forecast |
| `radar:operations:unassigned-tasks:volatility` | Volatility |
| `radar:operations:unassigned-tasks:resilience` | Resilience |

### Work in progress — `in-progress-tasks`
Tasks actively being worked.

| Rule id | Lens |
|---|---|
| `radar:operations:in-progress-tasks:connection` | Connection |
| `radar:operations:in-progress-tasks:freshness` | Freshness |
| `radar:operations:in-progress-tasks:threshold` | Threshold |
| `radar:operations:in-progress-tasks:trend` | Trend |
| `radar:operations:in-progress-tasks:anomaly` | Anomaly |
| `radar:operations:in-progress-tasks:integrity` | Integrity |
| `radar:operations:in-progress-tasks:continuity` | Continuity |
| `radar:operations:in-progress-tasks:baseline` | Baseline |
| `radar:operations:in-progress-tasks:confidence` | Confidence |
| `radar:operations:in-progress-tasks:forecast` | Forecast |
| `radar:operations:in-progress-tasks:volatility` | Volatility |
| `radar:operations:in-progress-tasks:resilience` | Resilience |

### Tasks due soon — `due-soon`
Work due within the next 24 hours.

| Rule id | Lens |
|---|---|
| `radar:operations:due-soon:connection` | Connection |
| `radar:operations:due-soon:freshness` | Freshness |
| `radar:operations:due-soon:threshold` | Threshold |
| `radar:operations:due-soon:trend` | Trend |
| `radar:operations:due-soon:anomaly` | Anomaly |
| `radar:operations:due-soon:integrity` | Integrity |
| `radar:operations:due-soon:continuity` | Continuity |
| `radar:operations:due-soon:baseline` | Baseline |
| `radar:operations:due-soon:confidence` | Confidence |
| `radar:operations:due-soon:forecast` | Forecast |
| `radar:operations:due-soon:volatility` | Volatility |
| `radar:operations:due-soon:resilience` | Resilience |

### Task completion — `task-completion`
Work completed during the current week.

| Rule id | Lens |
|---|---|
| `radar:operations:task-completion:connection` | Connection |
| `radar:operations:task-completion:freshness` | Freshness |
| `radar:operations:task-completion:threshold` | Threshold |
| `radar:operations:task-completion:trend` | Trend |
| `radar:operations:task-completion:anomaly` | Anomaly |
| `radar:operations:task-completion:integrity` | Integrity |
| `radar:operations:task-completion:continuity` | Continuity |
| `radar:operations:task-completion:baseline` | Baseline |
| `radar:operations:task-completion:confidence` | Confidence |
| `radar:operations:task-completion:forecast` | Forecast |
| `radar:operations:task-completion:volatility` | Volatility |
| `radar:operations:task-completion:resilience` | Resilience |

### Workspace activity — `activity-volume`
Recorded actions across the business.

| Rule id | Lens |
|---|---|
| `radar:operations:activity-volume:connection` | Connection |
| `radar:operations:activity-volume:freshness` | Freshness |
| `radar:operations:activity-volume:threshold` | Threshold |
| `radar:operations:activity-volume:trend` | Trend |
| `radar:operations:activity-volume:anomaly` | Anomaly |
| `radar:operations:activity-volume:integrity` | Integrity |
| `radar:operations:activity-volume:continuity` | Continuity |
| `radar:operations:activity-volume:baseline` | Baseline |
| `radar:operations:activity-volume:confidence` | Confidence |
| `radar:operations:activity-volume:forecast` | Forecast |
| `radar:operations:activity-volume:volatility` | Volatility |
| `radar:operations:activity-volume:resilience` | Resilience |

### Activity freshness — `activity-freshness`
Time since the latest workspace event.

| Rule id | Lens |
|---|---|
| `radar:operations:activity-freshness:connection` | Connection |
| `radar:operations:activity-freshness:freshness` | Freshness |
| `radar:operations:activity-freshness:threshold` | Threshold |
| `radar:operations:activity-freshness:trend` | Trend |
| `radar:operations:activity-freshness:anomaly` | Anomaly |
| `radar:operations:activity-freshness:integrity` | Integrity |
| `radar:operations:activity-freshness:continuity` | Continuity |
| `radar:operations:activity-freshness:baseline` | Baseline |
| `radar:operations:activity-freshness:confidence` | Confidence |
| `radar:operations:activity-freshness:forecast` | Forecast |
| `radar:operations:activity-freshness:volatility` | Volatility |
| `radar:operations:activity-freshness:resilience` | Resilience |

### Active automations — `active-automations`
Enabled workflows performing internal work.

| Rule id | Lens |
|---|---|
| `radar:operations:active-automations:connection` | Connection |
| `radar:operations:active-automations:freshness` | Freshness |
| `radar:operations:active-automations:threshold` | Threshold |
| `radar:operations:active-automations:trend` | Trend |
| `radar:operations:active-automations:anomaly` | Anomaly |
| `radar:operations:active-automations:integrity` | Integrity |
| `radar:operations:active-automations:continuity` | Continuity |
| `radar:operations:active-automations:baseline` | Baseline |
| `radar:operations:active-automations:confidence` | Confidence |
| `radar:operations:active-automations:forecast` | Forecast |
| `radar:operations:active-automations:volatility` | Volatility |
| `radar:operations:active-automations:resilience` | Resilience |

### Automation failures — `automation-failures`
Failed workflow executions and outcomes.

| Rule id | Lens |
|---|---|
| `radar:operations:automation-failures:connection` | Connection |
| `radar:operations:automation-failures:freshness` | Freshness |
| `radar:operations:automation-failures:threshold` | Threshold |
| `radar:operations:automation-failures:trend` | Trend |
| `radar:operations:automation-failures:anomaly` | Anomaly |
| `radar:operations:automation-failures:integrity` | Integrity |
| `radar:operations:automation-failures:continuity` | Continuity |
| `radar:operations:automation-failures:baseline` | Baseline |
| `radar:operations:automation-failures:confidence` | Confidence |
| `radar:operations:automation-failures:forecast` | Forecast |
| `radar:operations:automation-failures:volatility` | Volatility |
| `radar:operations:automation-failures:resilience` | Resilience |

### Automation coverage — `automation-coverage`
Core workflows with an active automation or manual control.

| Rule id | Lens |
|---|---|
| `radar:operations:automation-coverage:connection` | Connection |
| `radar:operations:automation-coverage:freshness` | Freshness |
| `radar:operations:automation-coverage:threshold` | Threshold |
| `radar:operations:automation-coverage:trend` | Trend |
| `radar:operations:automation-coverage:anomaly` | Anomaly |
| `radar:operations:automation-coverage:integrity` | Integrity |
| `radar:operations:automation-coverage:continuity` | Continuity |
| `radar:operations:automation-coverage:baseline` | Baseline |
| `radar:operations:automation-coverage:confidence` | Confidence |
| `radar:operations:automation-coverage:forecast` | Forecast |
| `radar:operations:automation-coverage:volatility` | Volatility |
| `radar:operations:automation-coverage:resilience` | Resilience |

## `compliance` — 12 families (144 rules)

### Legal register — `legal-register`
Legal and compliance records held by the company.

| Rule id | Lens |
|---|---|
| `radar:compliance:legal-register:connection` | Connection |
| `radar:compliance:legal-register:freshness` | Freshness |
| `radar:compliance:legal-register:threshold` | Threshold |
| `radar:compliance:legal-register:trend` | Trend |
| `radar:compliance:legal-register:anomaly` | Anomaly |
| `radar:compliance:legal-register:integrity` | Integrity |
| `radar:compliance:legal-register:continuity` | Continuity |
| `radar:compliance:legal-register:baseline` | Baseline |
| `radar:compliance:legal-register:confidence` | Confidence |
| `radar:compliance:legal-register:forecast` | Forecast |
| `radar:compliance:legal-register:volatility` | Volatility |
| `radar:compliance:legal-register:resilience` | Resilience |

### Expired legal records — `expired-records`
Documents and cover already beyond expiry.

| Rule id | Lens |
|---|---|
| `radar:compliance:expired-records:connection` | Connection |
| `radar:compliance:expired-records:freshness` | Freshness |
| `radar:compliance:expired-records:threshold` | Threshold |
| `radar:compliance:expired-records:trend` | Trend |
| `radar:compliance:expired-records:anomaly` | Anomaly |
| `radar:compliance:expired-records:integrity` | Integrity |
| `radar:compliance:expired-records:continuity` | Continuity |
| `radar:compliance:expired-records:baseline` | Baseline |
| `radar:compliance:expired-records:confidence` | Confidence |
| `radar:compliance:expired-records:forecast` | Forecast |
| `radar:compliance:expired-records:volatility` | Volatility |
| `radar:compliance:expired-records:resilience` | Resilience |

### Legal deadlines — `due-records`
Records expiring or due within 30 days.

| Rule id | Lens |
|---|---|
| `radar:compliance:due-records:connection` | Connection |
| `radar:compliance:due-records:freshness` | Freshness |
| `radar:compliance:due-records:threshold` | Threshold |
| `radar:compliance:due-records:trend` | Trend |
| `radar:compliance:due-records:anomaly` | Anomaly |
| `radar:compliance:due-records:integrity` | Integrity |
| `radar:compliance:due-records:continuity` | Continuity |
| `radar:compliance:due-records:baseline` | Baseline |
| `radar:compliance:due-records:confidence` | Confidence |
| `radar:compliance:due-records:forecast` | Forecast |
| `radar:compliance:due-records:volatility` | Volatility |
| `radar:compliance:due-records:resilience` | Resilience |

### Compliance action required — `action-required`
Legal records explicitly requiring action.

| Rule id | Lens |
|---|---|
| `radar:compliance:action-required:connection` | Connection |
| `radar:compliance:action-required:freshness` | Freshness |
| `radar:compliance:action-required:threshold` | Threshold |
| `radar:compliance:action-required:trend` | Trend |
| `radar:compliance:action-required:anomaly` | Anomaly |
| `radar:compliance:action-required:integrity` | Integrity |
| `radar:compliance:action-required:continuity` | Continuity |
| `radar:compliance:action-required:baseline` | Baseline |
| `radar:compliance:action-required:confidence` | Confidence |
| `radar:compliance:action-required:forecast` | Forecast |
| `radar:compliance:action-required:volatility` | Volatility |
| `radar:compliance:action-required:resilience` | Resilience |

### Insurance coverage — `insurance`
Current insurance policies and renewal visibility.

| Rule id | Lens |
|---|---|
| `radar:compliance:insurance:connection` | Connection |
| `radar:compliance:insurance:freshness` | Freshness |
| `radar:compliance:insurance:threshold` | Threshold |
| `radar:compliance:insurance:trend` | Trend |
| `radar:compliance:insurance:anomaly` | Anomaly |
| `radar:compliance:insurance:integrity` | Integrity |
| `radar:compliance:insurance:continuity` | Continuity |
| `radar:compliance:insurance:baseline` | Baseline |
| `radar:compliance:insurance:confidence` | Confidence |
| `radar:compliance:insurance:forecast` | Forecast |
| `radar:compliance:insurance:volatility` | Volatility |
| `radar:compliance:insurance:resilience` | Resilience |

### Contract coverage — `contracts`
Client and supplier agreements with recorded status.

| Rule id | Lens |
|---|---|
| `radar:compliance:contracts:connection` | Connection |
| `radar:compliance:contracts:freshness` | Freshness |
| `radar:compliance:contracts:threshold` | Threshold |
| `radar:compliance:contracts:trend` | Trend |
| `radar:compliance:contracts:anomaly` | Anomaly |
| `radar:compliance:contracts:integrity` | Integrity |
| `radar:compliance:contracts:continuity` | Continuity |
| `radar:compliance:contracts:baseline` | Baseline |
| `radar:compliance:contracts:confidence` | Confidence |
| `radar:compliance:contracts:forecast` | Forecast |
| `radar:compliance:contracts:volatility` | Volatility |
| `radar:compliance:contracts:resilience` | Resilience |

### Contract acceptance — `contract-acceptance`
Issued agreements awaiting acceptance.

| Rule id | Lens |
|---|---|
| `radar:compliance:contract-acceptance:connection` | Connection |
| `radar:compliance:contract-acceptance:freshness` | Freshness |
| `radar:compliance:contract-acceptance:threshold` | Threshold |
| `radar:compliance:contract-acceptance:trend` | Trend |
| `radar:compliance:contract-acceptance:anomaly` | Anomaly |
| `radar:compliance:contract-acceptance:integrity` | Integrity |
| `radar:compliance:contract-acceptance:continuity` | Continuity |
| `radar:compliance:contract-acceptance:baseline` | Baseline |
| `radar:compliance:contract-acceptance:confidence` | Confidence |
| `radar:compliance:contract-acceptance:forecast` | Forecast |
| `radar:compliance:contract-acceptance:volatility` | Volatility |
| `radar:compliance:contract-acceptance:resilience` | Resilience |

### Tax and HMRC records — `tax-records`
Tax registrations, filings, and supporting documents.

| Rule id | Lens |
|---|---|
| `radar:compliance:tax-records:connection` | Connection |
| `radar:compliance:tax-records:freshness` | Freshness |
| `radar:compliance:tax-records:threshold` | Threshold |
| `radar:compliance:tax-records:trend` | Trend |
| `radar:compliance:tax-records:anomaly` | Anomaly |
| `radar:compliance:tax-records:integrity` | Integrity |
| `radar:compliance:tax-records:continuity` | Continuity |
| `radar:compliance:tax-records:baseline` | Baseline |
| `radar:compliance:tax-records:confidence` | Confidence |
| `radar:compliance:tax-records:forecast` | Forecast |
| `radar:compliance:tax-records:volatility` | Volatility |
| `radar:compliance:tax-records:resilience` | Resilience |

### Policy coverage — `policy-coverage`
Current internal and public policy documents.

| Rule id | Lens |
|---|---|
| `radar:compliance:policy-coverage:connection` | Connection |
| `radar:compliance:policy-coverage:freshness` | Freshness |
| `radar:compliance:policy-coverage:threshold` | Threshold |
| `radar:compliance:policy-coverage:trend` | Trend |
| `radar:compliance:policy-coverage:anomaly` | Anomaly |
| `radar:compliance:policy-coverage:integrity` | Integrity |
| `radar:compliance:policy-coverage:continuity` | Continuity |
| `radar:compliance:policy-coverage:baseline` | Baseline |
| `radar:compliance:policy-coverage:confidence` | Confidence |
| `radar:compliance:policy-coverage:forecast` | Forecast |
| `radar:compliance:policy-coverage:volatility` | Volatility |
| `radar:compliance:policy-coverage:resilience` | Resilience |

### Audit readiness — `audit-readiness`
Evidence, deadlines, and records required for review.

| Rule id | Lens |
|---|---|
| `radar:compliance:audit-readiness:connection` | Connection |
| `radar:compliance:audit-readiness:freshness` | Freshness |
| `radar:compliance:audit-readiness:threshold` | Threshold |
| `radar:compliance:audit-readiness:trend` | Trend |
| `radar:compliance:audit-readiness:anomaly` | Anomaly |
| `radar:compliance:audit-readiness:integrity` | Integrity |
| `radar:compliance:audit-readiness:continuity` | Continuity |
| `radar:compliance:audit-readiness:baseline` | Baseline |
| `radar:compliance:audit-readiness:confidence` | Confidence |
| `radar:compliance:audit-readiness:forecast` | Forecast |
| `radar:compliance:audit-readiness:volatility` | Volatility |
| `radar:compliance:audit-readiness:resilience` | Resilience |

### Compliance review freshness — `compliance-freshness`
Age of the latest legal register review.

| Rule id | Lens |
|---|---|
| `radar:compliance:compliance-freshness:connection` | Connection |
| `radar:compliance:compliance-freshness:freshness` | Freshness |
| `radar:compliance:compliance-freshness:threshold` | Threshold |
| `radar:compliance:compliance-freshness:trend` | Trend |
| `radar:compliance:compliance-freshness:anomaly` | Anomaly |
| `radar:compliance:compliance-freshness:integrity` | Integrity |
| `radar:compliance:compliance-freshness:continuity` | Continuity |
| `radar:compliance:compliance-freshness:baseline` | Baseline |
| `radar:compliance:compliance-freshness:confidence` | Confidence |
| `radar:compliance:compliance-freshness:forecast` | Forecast |
| `radar:compliance:compliance-freshness:volatility` | Volatility |
| `radar:compliance:compliance-freshness:resilience` | Resilience |

### Obligation coverage — `obligation-coverage`
Finance and legal obligations captured before they fall due.

| Rule id | Lens |
|---|---|
| `radar:compliance:obligation-coverage:connection` | Connection |
| `radar:compliance:obligation-coverage:freshness` | Freshness |
| `radar:compliance:obligation-coverage:threshold` | Threshold |
| `radar:compliance:obligation-coverage:trend` | Trend |
| `radar:compliance:obligation-coverage:anomaly` | Anomaly |
| `radar:compliance:obligation-coverage:integrity` | Integrity |
| `radar:compliance:obligation-coverage:continuity` | Continuity |
| `radar:compliance:obligation-coverage:baseline` | Baseline |
| `radar:compliance:obligation-coverage:confidence` | Confidence |
| `radar:compliance:obligation-coverage:forecast` | Forecast |
| `radar:compliance:obligation-coverage:volatility` | Volatility |
| `radar:compliance:obligation-coverage:resilience` | Resilience |

## `development` — 13 families (156 rules)

### Digital property coverage — `property-coverage`
Agency and client websites, portals, and software properties.

| Rule id | Lens |
|---|---|
| `radar:development:property-coverage:connection` | Connection |
| `radar:development:property-coverage:freshness` | Freshness |
| `radar:development:property-coverage:threshold` | Threshold |
| `radar:development:property-coverage:trend` | Trend |
| `radar:development:property-coverage:anomaly` | Anomaly |
| `radar:development:property-coverage:integrity` | Integrity |
| `radar:development:property-coverage:continuity` | Continuity |
| `radar:development:property-coverage:baseline` | Baseline |
| `radar:development:property-coverage:confidence` | Confidence |
| `radar:development:property-coverage:forecast` | Forecast |
| `radar:development:property-coverage:volatility` | Volatility |
| `radar:development:property-coverage:resilience` | Resilience |

### Aqua Tag coverage — `tag-coverage`
Properties with an installed and reporting telemetry tag.

| Rule id | Lens |
|---|---|
| `radar:development:tag-coverage:connection` | Connection |
| `radar:development:tag-coverage:freshness` | Freshness |
| `radar:development:tag-coverage:threshold` | Threshold |
| `radar:development:tag-coverage:trend` | Trend |
| `radar:development:tag-coverage:anomaly` | Anomaly |
| `radar:development:tag-coverage:integrity` | Integrity |
| `radar:development:tag-coverage:continuity` | Continuity |
| `radar:development:tag-coverage:baseline` | Baseline |
| `radar:development:tag-coverage:confidence` | Confidence |
| `radar:development:tag-coverage:forecast` | Forecast |
| `radar:development:tag-coverage:volatility` | Volatility |
| `radar:development:tag-coverage:resilience` | Resilience |

### Aqua Tag freshness — `tag-freshness`
Age of the latest event from every connected property.

| Rule id | Lens |
|---|---|
| `radar:development:tag-freshness:connection` | Connection |
| `radar:development:tag-freshness:freshness` | Freshness |
| `radar:development:tag-freshness:threshold` | Threshold |
| `radar:development:tag-freshness:trend` | Trend |
| `radar:development:tag-freshness:anomaly` | Anomaly |
| `radar:development:tag-freshness:integrity` | Integrity |
| `radar:development:tag-freshness:continuity` | Continuity |
| `radar:development:tag-freshness:baseline` | Baseline |
| `radar:development:tag-freshness:confidence` | Confidence |
| `radar:development:tag-freshness:forecast` | Forecast |
| `radar:development:tag-freshness:volatility` | Volatility |
| `radar:development:tag-freshness:resilience` | Resilience |

### Server heartbeat health — `heartbeat-health`
Expected heartbeat events from live properties.

| Rule id | Lens |
|---|---|
| `radar:development:heartbeat-health:connection` | Connection |
| `radar:development:heartbeat-health:freshness` | Freshness |
| `radar:development:heartbeat-health:threshold` | Threshold |
| `radar:development:heartbeat-health:trend` | Trend |
| `radar:development:heartbeat-health:anomaly` | Anomaly |
| `radar:development:heartbeat-health:integrity` | Integrity |
| `radar:development:heartbeat-health:continuity` | Continuity |
| `radar:development:heartbeat-health:baseline` | Baseline |
| `radar:development:heartbeat-health:confidence` | Confidence |
| `radar:development:heartbeat-health:forecast` | Forecast |
| `radar:development:heartbeat-health:volatility` | Volatility |
| `radar:development:heartbeat-health:resilience` | Resilience |

### Production errors — `production-errors`
Runtime errors recorded in live environments.

| Rule id | Lens |
|---|---|
| `radar:development:production-errors:connection` | Connection |
| `radar:development:production-errors:freshness` | Freshness |
| `radar:development:production-errors:threshold` | Threshold |
| `radar:development:production-errors:trend` | Trend |
| `radar:development:production-errors:anomaly` | Anomaly |
| `radar:development:production-errors:integrity` | Integrity |
| `radar:development:production-errors:continuity` | Continuity |
| `radar:development:production-errors:baseline` | Baseline |
| `radar:development:production-errors:confidence` | Confidence |
| `radar:development:production-errors:forecast` | Forecast |
| `radar:development:production-errors:volatility` | Volatility |
| `radar:development:production-errors:resilience` | Resilience |

### Error rate — `error-rate`
Errors relative to tracked traffic volume.

| Rule id | Lens |
|---|---|
| `radar:development:error-rate:connection` | Connection |
| `radar:development:error-rate:freshness` | Freshness |
| `radar:development:error-rate:threshold` | Threshold |
| `radar:development:error-rate:trend` | Trend |
| `radar:development:error-rate:anomaly` | Anomaly |
| `radar:development:error-rate:integrity` | Integrity |
| `radar:development:error-rate:continuity` | Continuity |
| `radar:development:error-rate:baseline` | Baseline |
| `radar:development:error-rate:confidence` | Confidence |
| `radar:development:error-rate:forecast` | Forecast |
| `radar:development:error-rate:volatility` | Volatility |
| `radar:development:error-rate:resilience` | Resilience |

### Page load performance — `load-performance`
Average tracked load time across properties.

| Rule id | Lens |
|---|---|
| `radar:development:load-performance:connection` | Connection |
| `radar:development:load-performance:freshness` | Freshness |
| `radar:development:load-performance:threshold` | Threshold |
| `radar:development:load-performance:trend` | Trend |
| `radar:development:load-performance:anomaly` | Anomaly |
| `radar:development:load-performance:integrity` | Integrity |
| `radar:development:load-performance:continuity` | Continuity |
| `radar:development:load-performance:baseline` | Baseline |
| `radar:development:load-performance:confidence` | Confidence |
| `radar:development:load-performance:forecast` | Forecast |
| `radar:development:load-performance:volatility` | Volatility |
| `radar:development:load-performance:resilience` | Resilience |

### Slow properties — `slow-properties`
Properties exceeding the page-load guardrail.

| Rule id | Lens |
|---|---|
| `radar:development:slow-properties:connection` | Connection |
| `radar:development:slow-properties:freshness` | Freshness |
| `radar:development:slow-properties:threshold` | Threshold |
| `radar:development:slow-properties:trend` | Trend |
| `radar:development:slow-properties:anomaly` | Anomaly |
| `radar:development:slow-properties:integrity` | Integrity |
| `radar:development:slow-properties:continuity` | Continuity |
| `radar:development:slow-properties:baseline` | Baseline |
| `radar:development:slow-properties:confidence` | Confidence |
| `radar:development:slow-properties:forecast` | Forecast |
| `radar:development:slow-properties:volatility` | Volatility |
| `radar:development:slow-properties:resilience` | Resilience |

### Deployment activity — `deployments`
Production deployment events in the last 30 days.

| Rule id | Lens |
|---|---|
| `radar:development:deployments:connection` | Connection |
| `radar:development:deployments:freshness` | Freshness |
| `radar:development:deployments:threshold` | Threshold |
| `radar:development:deployments:trend` | Trend |
| `radar:development:deployments:anomaly` | Anomaly |
| `radar:development:deployments:integrity` | Integrity |
| `radar:development:deployments:continuity` | Continuity |
| `radar:development:deployments:baseline` | Baseline |
| `radar:development:deployments:confidence` | Confidence |
| `radar:development:deployments:forecast` | Forecast |
| `radar:development:deployments:volatility` | Volatility |
| `radar:development:deployments:resilience` | Resilience |

### Release-linked errors — `release-errors`
Errors correlated with a release or deployment.

| Rule id | Lens |
|---|---|
| `radar:development:release-errors:connection` | Connection |
| `radar:development:release-errors:freshness` | Freshness |
| `radar:development:release-errors:threshold` | Threshold |
| `radar:development:release-errors:trend` | Trend |
| `radar:development:release-errors:anomaly` | Anomaly |
| `radar:development:release-errors:integrity` | Integrity |
| `radar:development:release-errors:continuity` | Continuity |
| `radar:development:release-errors:baseline` | Baseline |
| `radar:development:release-errors:confidence` | Confidence |
| `radar:development:release-errors:forecast` | Forecast |
| `radar:development:release-errors:volatility` | Volatility |
| `radar:development:release-errors:resilience` | Resilience |

### Monitoring silence — `monitoring-silence`
Live properties that have stopped reporting.

| Rule id | Lens |
|---|---|
| `radar:development:monitoring-silence:connection` | Connection |
| `radar:development:monitoring-silence:freshness` | Freshness |
| `radar:development:monitoring-silence:threshold` | Threshold |
| `radar:development:monitoring-silence:trend` | Trend |
| `radar:development:monitoring-silence:anomaly` | Anomaly |
| `radar:development:monitoring-silence:integrity` | Integrity |
| `radar:development:monitoring-silence:continuity` | Continuity |
| `radar:development:monitoring-silence:baseline` | Baseline |
| `radar:development:monitoring-silence:confidence` | Confidence |
| `radar:development:monitoring-silence:forecast` | Forecast |
| `radar:development:monitoring-silence:volatility` | Volatility |
| `radar:development:monitoring-silence:resilience` | Resilience |

### Telemetry integrity — `telemetry-integrity`
Valid event shapes, timestamps, sessions, and property linkage.

| Rule id | Lens |
|---|---|
| `radar:development:telemetry-integrity:connection` | Connection |
| `radar:development:telemetry-integrity:freshness` | Freshness |
| `radar:development:telemetry-integrity:threshold` | Threshold |
| `radar:development:telemetry-integrity:trend` | Trend |
| `radar:development:telemetry-integrity:anomaly` | Anomaly |
| `radar:development:telemetry-integrity:integrity` | Integrity |
| `radar:development:telemetry-integrity:continuity` | Continuity |
| `radar:development:telemetry-integrity:baseline` | Baseline |
| `radar:development:telemetry-integrity:confidence` | Confidence |
| `radar:development:telemetry-integrity:forecast` | Forecast |
| `radar:development:telemetry-integrity:volatility` | Volatility |
| `radar:development:telemetry-integrity:resilience` | Resilience |

### Tag injection coverage — `injection-coverage`
Tagged sites configured to inject third-party tools (analytics, pixels, verification) through the Aqua Tag.

| Rule id | Lens |
|---|---|
| `radar:development:injection-coverage:connection` | Connection |
| `radar:development:injection-coverage:freshness` | Freshness |
| `radar:development:injection-coverage:threshold` | Threshold |
| `radar:development:injection-coverage:trend` | Trend |
| `radar:development:injection-coverage:anomaly` | Anomaly |
| `radar:development:injection-coverage:integrity` | Integrity |
| `radar:development:injection-coverage:continuity` | Continuity |
| `radar:development:injection-coverage:baseline` | Baseline |
| `radar:development:injection-coverage:confidence` | Confidence |
| `radar:development:injection-coverage:forecast` | Forecast |
| `radar:development:injection-coverage:volatility` | Volatility |
| `radar:development:injection-coverage:resilience` | Resilience |

## `team` — 31 families (372 rules)

### Team size — `team-size`
Active users with access to the workspace.

| Rule id | Lens |
|---|---|
| `radar:team:team-size:connection` | Connection |
| `radar:team:team-size:freshness` | Freshness |
| `radar:team:team-size:threshold` | Threshold |
| `radar:team:team-size:trend` | Trend |
| `radar:team:team-size:anomaly` | Anomaly |
| `radar:team:team-size:integrity` | Integrity |
| `radar:team:team-size:continuity` | Continuity |
| `radar:team:team-size:baseline` | Baseline |
| `radar:team:team-size:confidence` | Confidence |
| `radar:team:team-size:forecast` | Forecast |
| `radar:team:team-size:volatility` | Volatility |
| `radar:team:team-size:resilience` | Resilience |

### Leadership coverage — `owner-coverage`
Agency owner and manager role coverage.

| Rule id | Lens |
|---|---|
| `radar:team:owner-coverage:connection` | Connection |
| `radar:team:owner-coverage:freshness` | Freshness |
| `radar:team:owner-coverage:threshold` | Threshold |
| `radar:team:owner-coverage:trend` | Trend |
| `radar:team:owner-coverage:anomaly` | Anomaly |
| `radar:team:owner-coverage:integrity` | Integrity |
| `radar:team:owner-coverage:continuity` | Continuity |
| `radar:team:owner-coverage:baseline` | Baseline |
| `radar:team:owner-coverage:confidence` | Confidence |
| `radar:team:owner-coverage:forecast` | Forecast |
| `radar:team:owner-coverage:volatility` | Volatility |
| `radar:team:owner-coverage:resilience` | Resilience |

### Staff coverage — `staff-coverage`
Operational staff available for assigned work.

| Rule id | Lens |
|---|---|
| `radar:team:staff-coverage:connection` | Connection |
| `radar:team:staff-coverage:freshness` | Freshness |
| `radar:team:staff-coverage:threshold` | Threshold |
| `radar:team:staff-coverage:trend` | Trend |
| `radar:team:staff-coverage:anomaly` | Anomaly |
| `radar:team:staff-coverage:integrity` | Integrity |
| `radar:team:staff-coverage:continuity` | Continuity |
| `radar:team:staff-coverage:baseline` | Baseline |
| `radar:team:staff-coverage:confidence` | Confidence |
| `radar:team:staff-coverage:forecast` | Forecast |
| `radar:team:staff-coverage:volatility` | Volatility |
| `radar:team:staff-coverage:resilience` | Resilience |

### Freelancer coverage — `freelancer-coverage`
External talent and contractor records.

| Rule id | Lens |
|---|---|
| `radar:team:freelancer-coverage:connection` | Connection |
| `radar:team:freelancer-coverage:freshness` | Freshness |
| `radar:team:freelancer-coverage:threshold` | Threshold |
| `radar:team:freelancer-coverage:trend` | Trend |
| `radar:team:freelancer-coverage:anomaly` | Anomaly |
| `radar:team:freelancer-coverage:integrity` | Integrity |
| `radar:team:freelancer-coverage:continuity` | Continuity |
| `radar:team:freelancer-coverage:baseline` | Baseline |
| `radar:team:freelancer-coverage:confidence` | Confidence |
| `radar:team:freelancer-coverage:forecast` | Forecast |
| `radar:team:freelancer-coverage:volatility` | Volatility |
| `radar:team:freelancer-coverage:resilience` | Resilience |

### Task ownership — `task-ownership`
Open work assigned to a responsible person.

| Rule id | Lens |
|---|---|
| `radar:team:task-ownership:connection` | Connection |
| `radar:team:task-ownership:freshness` | Freshness |
| `radar:team:task-ownership:threshold` | Threshold |
| `radar:team:task-ownership:trend` | Trend |
| `radar:team:task-ownership:anomaly` | Anomaly |
| `radar:team:task-ownership:integrity` | Integrity |
| `radar:team:task-ownership:continuity` | Continuity |
| `radar:team:task-ownership:baseline` | Baseline |
| `radar:team:task-ownership:confidence` | Confidence |
| `radar:team:task-ownership:forecast` | Forecast |
| `radar:team:task-ownership:volatility` | Volatility |
| `radar:team:task-ownership:resilience` | Resilience |

### Workload balance — `workload-balance`
Open tasks distributed across the available team.

| Rule id | Lens |
|---|---|
| `radar:team:workload-balance:connection` | Connection |
| `radar:team:workload-balance:freshness` | Freshness |
| `radar:team:workload-balance:threshold` | Threshold |
| `radar:team:workload-balance:trend` | Trend |
| `radar:team:workload-balance:anomaly` | Anomaly |
| `radar:team:workload-balance:integrity` | Integrity |
| `radar:team:workload-balance:continuity` | Continuity |
| `radar:team:workload-balance:baseline` | Baseline |
| `radar:team:workload-balance:confidence` | Confidence |
| `radar:team:workload-balance:forecast` | Forecast |
| `radar:team:workload-balance:volatility` | Volatility |
| `radar:team:workload-balance:resilience` | Resilience |

### Capacity plan — `capacity-plan`
Configured weekly hours and delivery assumptions.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-plan:connection` | Connection |
| `radar:team:capacity-plan:freshness` | Freshness |
| `radar:team:capacity-plan:threshold` | Threshold |
| `radar:team:capacity-plan:trend` | Trend |
| `radar:team:capacity-plan:anomaly` | Anomaly |
| `radar:team:capacity-plan:integrity` | Integrity |
| `radar:team:capacity-plan:continuity` | Continuity |
| `radar:team:capacity-plan:baseline` | Baseline |
| `radar:team:capacity-plan:confidence` | Confidence |
| `radar:team:capacity-plan:forecast` | Forecast |
| `radar:team:capacity-plan:volatility` | Volatility |
| `radar:team:capacity-plan:resilience` | Resilience |

### Capacity pressure — `capacity-pressure`
Committed work relative to available hours.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-pressure:connection` | Connection |
| `radar:team:capacity-pressure:freshness` | Freshness |
| `radar:team:capacity-pressure:threshold` | Threshold |
| `radar:team:capacity-pressure:trend` | Trend |
| `radar:team:capacity-pressure:anomaly` | Anomaly |
| `radar:team:capacity-pressure:integrity` | Integrity |
| `radar:team:capacity-pressure:continuity` | Continuity |
| `radar:team:capacity-pressure:baseline` | Baseline |
| `radar:team:capacity-pressure:confidence` | Confidence |
| `radar:team:capacity-pressure:forecast` | Forecast |
| `radar:team:capacity-pressure:volatility` | Volatility |
| `radar:team:capacity-pressure:resilience` | Resilience |

### Hiring trigger — `hiring-trigger`
Capacity utilisation against the hiring threshold.

| Rule id | Lens |
|---|---|
| `radar:team:hiring-trigger:connection` | Connection |
| `radar:team:hiring-trigger:freshness` | Freshness |
| `radar:team:hiring-trigger:threshold` | Threshold |
| `radar:team:hiring-trigger:trend` | Trend |
| `radar:team:hiring-trigger:anomaly` | Anomaly |
| `radar:team:hiring-trigger:integrity` | Integrity |
| `radar:team:hiring-trigger:continuity` | Continuity |
| `radar:team:hiring-trigger:baseline` | Baseline |
| `radar:team:hiring-trigger:confidence` | Confidence |
| `radar:team:hiring-trigger:forecast` | Forecast |
| `radar:team:hiring-trigger:volatility` | Volatility |
| `radar:team:hiring-trigger:resilience` | Resilience |

### Growth capacity — `capacity-growth`
Growth and marketing demand against its configured people allocation.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-growth:connection` | Connection |
| `radar:team:capacity-growth:freshness` | Freshness |
| `radar:team:capacity-growth:threshold` | Threshold |
| `radar:team:capacity-growth:trend` | Trend |
| `radar:team:capacity-growth:anomaly` | Anomaly |
| `radar:team:capacity-growth:integrity` | Integrity |
| `radar:team:capacity-growth:continuity` | Continuity |
| `radar:team:capacity-growth:baseline` | Baseline |
| `radar:team:capacity-growth:confidence` | Confidence |
| `radar:team:capacity-growth:forecast` | Forecast |
| `radar:team:capacity-growth:volatility` | Volatility |
| `radar:team:capacity-growth:resilience` | Resilience |

### Sales capacity — `capacity-sales`
Acquisition demand, follow-up and meeting load against sales capacity.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-sales:connection` | Connection |
| `radar:team:capacity-sales:freshness` | Freshness |
| `radar:team:capacity-sales:threshold` | Threshold |
| `radar:team:capacity-sales:trend` | Trend |
| `radar:team:capacity-sales:anomaly` | Anomaly |
| `radar:team:capacity-sales:integrity` | Integrity |
| `radar:team:capacity-sales:continuity` | Continuity |
| `radar:team:capacity-sales:baseline` | Baseline |
| `radar:team:capacity-sales:confidence` | Confidence |
| `radar:team:capacity-sales:forecast` | Forecast |
| `radar:team:capacity-sales:volatility` | Volatility |
| `radar:team:capacity-sales:resilience` | Resilience |

### Client success capacity — `capacity-client-success`
Relationship, support and retention demand against available care capacity.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-client-success:connection` | Connection |
| `radar:team:capacity-client-success:freshness` | Freshness |
| `radar:team:capacity-client-success:threshold` | Threshold |
| `radar:team:capacity-client-success:trend` | Trend |
| `radar:team:capacity-client-success:anomaly` | Anomaly |
| `radar:team:capacity-client-success:integrity` | Integrity |
| `radar:team:capacity-client-success:continuity` | Continuity |
| `radar:team:capacity-client-success:baseline` | Baseline |
| `radar:team:capacity-client-success:confidence` | Confidence |
| `radar:team:capacity-client-success:forecast` | Forecast |
| `radar:team:capacity-client-success:volatility` | Volatility |
| `radar:team:capacity-client-success:resilience` | Resilience |

### Delivery capacity — `capacity-delivery`
Committed fulfilment demand against available delivery hours.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-delivery:connection` | Connection |
| `radar:team:capacity-delivery:freshness` | Freshness |
| `radar:team:capacity-delivery:threshold` | Threshold |
| `radar:team:capacity-delivery:trend` | Trend |
| `radar:team:capacity-delivery:anomaly` | Anomaly |
| `radar:team:capacity-delivery:integrity` | Integrity |
| `radar:team:capacity-delivery:continuity` | Continuity |
| `radar:team:capacity-delivery:baseline` | Baseline |
| `radar:team:capacity-delivery:confidence` | Confidence |
| `radar:team:capacity-delivery:forecast` | Forecast |
| `radar:team:capacity-delivery:volatility` | Volatility |
| `radar:team:capacity-delivery:resilience` | Resilience |

### Operations capacity — `capacity-operations`
Coordination, administration and quality demand against operating capacity.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-operations:connection` | Connection |
| `radar:team:capacity-operations:freshness` | Freshness |
| `radar:team:capacity-operations:threshold` | Threshold |
| `radar:team:capacity-operations:trend` | Trend |
| `radar:team:capacity-operations:anomaly` | Anomaly |
| `radar:team:capacity-operations:integrity` | Integrity |
| `radar:team:capacity-operations:continuity` | Continuity |
| `radar:team:capacity-operations:baseline` | Baseline |
| `radar:team:capacity-operations:confidence` | Confidence |
| `radar:team:capacity-operations:forecast` | Forecast |
| `radar:team:capacity-operations:volatility` | Volatility |
| `radar:team:capacity-operations:resilience` | Resilience |

### Finance capacity — `capacity-finance`
Finance, reporting and compliance demand against specialist capacity.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-finance:connection` | Connection |
| `radar:team:capacity-finance:freshness` | Freshness |
| `radar:team:capacity-finance:threshold` | Threshold |
| `radar:team:capacity-finance:trend` | Trend |
| `radar:team:capacity-finance:anomaly` | Anomaly |
| `radar:team:capacity-finance:integrity` | Integrity |
| `radar:team:capacity-finance:continuity` | Continuity |
| `radar:team:capacity-finance:baseline` | Baseline |
| `radar:team:capacity-finance:confidence` | Confidence |
| `radar:team:capacity-finance:forecast` | Forecast |
| `radar:team:capacity-finance:volatility` | Volatility |
| `radar:team:capacity-finance:resilience` | Resilience |

### Systems capacity — `capacity-systems`
Technical, automation and development demand against specialist capacity.

| Rule id | Lens |
|---|---|
| `radar:team:capacity-systems:connection` | Connection |
| `radar:team:capacity-systems:freshness` | Freshness |
| `radar:team:capacity-systems:threshold` | Threshold |
| `radar:team:capacity-systems:trend` | Trend |
| `radar:team:capacity-systems:anomaly` | Anomaly |
| `radar:team:capacity-systems:integrity` | Integrity |
| `radar:team:capacity-systems:continuity` | Continuity |
| `radar:team:capacity-systems:baseline` | Baseline |
| `radar:team:capacity-systems:confidence` | Confidence |
| `radar:team:capacity-systems:forecast` | Forecast |
| `radar:team:capacity-systems:volatility` | Volatility |
| `radar:team:capacity-systems:resilience` | Resilience |

### People payment readiness — `people-payments`
Salary, bonus, freelancer, and contractor payment coverage.

| Rule id | Lens |
|---|---|
| `radar:team:people-payments:connection` | Connection |
| `radar:team:people-payments:freshness` | Freshness |
| `radar:team:people-payments:threshold` | Threshold |
| `radar:team:people-payments:trend` | Trend |
| `radar:team:people-payments:anomaly` | Anomaly |
| `radar:team:people-payments:integrity` | Integrity |
| `radar:team:people-payments:continuity` | Continuity |
| `radar:team:people-payments:baseline` | Baseline |
| `radar:team:people-payments:confidence` | Confidence |
| `radar:team:people-payments:forecast` | Forecast |
| `radar:team:people-payments:volatility` | Volatility |
| `radar:team:people-payments:resilience` | Resilience |

### Objective ownership — `objective-ownership`
Strategic objectives assigned to accountable people.

| Rule id | Lens |
|---|---|
| `radar:team:objective-ownership:connection` | Connection |
| `radar:team:objective-ownership:freshness` | Freshness |
| `radar:team:objective-ownership:threshold` | Threshold |
| `radar:team:objective-ownership:trend` | Trend |
| `radar:team:objective-ownership:anomaly` | Anomaly |
| `radar:team:objective-ownership:integrity` | Integrity |
| `radar:team:objective-ownership:continuity` | Continuity |
| `radar:team:objective-ownership:baseline` | Baseline |
| `radar:team:objective-ownership:confidence` | Confidence |
| `radar:team:objective-ownership:forecast` | Forecast |
| `radar:team:objective-ownership:volatility` | Volatility |
| `radar:team:objective-ownership:resilience` | Resilience |

### Role and access integrity — `role-integrity`
People with complete, appropriate workspace roles.

| Rule id | Lens |
|---|---|
| `radar:team:role-integrity:connection` | Connection |
| `radar:team:role-integrity:freshness` | Freshness |
| `radar:team:role-integrity:threshold` | Threshold |
| `radar:team:role-integrity:trend` | Trend |
| `radar:team:role-integrity:anomaly` | Anomaly |
| `radar:team:role-integrity:integrity` | Integrity |
| `radar:team:role-integrity:continuity` | Continuity |
| `radar:team:role-integrity:baseline` | Baseline |
| `radar:team:role-integrity:confidence` | Confidence |
| `radar:team:role-integrity:forecast` | Forecast |
| `radar:team:role-integrity:volatility` | Volatility |
| `radar:team:role-integrity:resilience` | Resilience |

### Candidate review backlog — `candidate-backlog`
Applications waiting beyond the hiring review guardrail.

| Rule id | Lens |
|---|---|
| `radar:team:candidate-backlog:connection` | Connection |
| `radar:team:candidate-backlog:freshness` | Freshness |
| `radar:team:candidate-backlog:threshold` | Threshold |
| `radar:team:candidate-backlog:trend` | Trend |
| `radar:team:candidate-backlog:anomaly` | Anomaly |
| `radar:team:candidate-backlog:integrity` | Integrity |
| `radar:team:candidate-backlog:continuity` | Continuity |
| `radar:team:candidate-backlog:baseline` | Baseline |
| `radar:team:candidate-backlog:confidence` | Confidence |
| `radar:team:candidate-backlog:forecast` | Forecast |
| `radar:team:candidate-backlog:volatility` | Volatility |
| `radar:team:candidate-backlog:resilience` | Resilience |

### Employee portal coverage — `employee-portal-coverage`
Active people linked to an authenticated employee workspace.

| Rule id | Lens |
|---|---|
| `radar:team:employee-portal-coverage:connection` | Connection |
| `radar:team:employee-portal-coverage:freshness` | Freshness |
| `radar:team:employee-portal-coverage:threshold` | Threshold |
| `radar:team:employee-portal-coverage:trend` | Trend |
| `radar:team:employee-portal-coverage:anomaly` | Anomaly |
| `radar:team:employee-portal-coverage:integrity` | Integrity |
| `radar:team:employee-portal-coverage:continuity` | Continuity |
| `radar:team:employee-portal-coverage:baseline` | Baseline |
| `radar:team:employee-portal-coverage:confidence` | Confidence |
| `radar:team:employee-portal-coverage:forecast` | Forecast |
| `radar:team:employee-portal-coverage:volatility` | Volatility |
| `radar:team:employee-portal-coverage:resilience` | Resilience |

### Onboarding readiness — `onboarding-readiness`
Required onboarding work completed by company and employee.

| Rule id | Lens |
|---|---|
| `radar:team:onboarding-readiness:connection` | Connection |
| `radar:team:onboarding-readiness:freshness` | Freshness |
| `radar:team:onboarding-readiness:threshold` | Threshold |
| `radar:team:onboarding-readiness:trend` | Trend |
| `radar:team:onboarding-readiness:anomaly` | Anomaly |
| `radar:team:onboarding-readiness:integrity` | Integrity |
| `radar:team:onboarding-readiness:continuity` | Continuity |
| `radar:team:onboarding-readiness:baseline` | Baseline |
| `radar:team:onboarding-readiness:confidence` | Confidence |
| `radar:team:onboarding-readiness:forecast` | Forecast |
| `radar:team:onboarding-readiness:volatility` | Volatility |
| `radar:team:onboarding-readiness:resilience` | Resilience |

### Leave decision time — `leave-decisions`
Leave requests waiting for a retained manager decision.

| Rule id | Lens |
|---|---|
| `radar:team:leave-decisions:connection` | Connection |
| `radar:team:leave-decisions:freshness` | Freshness |
| `radar:team:leave-decisions:threshold` | Threshold |
| `radar:team:leave-decisions:trend` | Trend |
| `radar:team:leave-decisions:anomaly` | Anomaly |
| `radar:team:leave-decisions:integrity` | Integrity |
| `radar:team:leave-decisions:continuity` | Continuity |
| `radar:team:leave-decisions:baseline` | Baseline |
| `radar:team:leave-decisions:confidence` | Confidence |
| `radar:team:leave-decisions:forecast` | Forecast |
| `radar:team:leave-decisions:volatility` | Volatility |
| `radar:team:leave-decisions:resilience` | Resilience |

### Leave entitlement coverage — `leave-entitlement`
Employees with an appropriate retained allowance.

| Rule id | Lens |
|---|---|
| `radar:team:leave-entitlement:connection` | Connection |
| `radar:team:leave-entitlement:freshness` | Freshness |
| `radar:team:leave-entitlement:threshold` | Threshold |
| `radar:team:leave-entitlement:trend` | Trend |
| `radar:team:leave-entitlement:anomaly` | Anomaly |
| `radar:team:leave-entitlement:integrity` | Integrity |
| `radar:team:leave-entitlement:continuity` | Continuity |
| `radar:team:leave-entitlement:baseline` | Baseline |
| `radar:team:leave-entitlement:confidence` | Confidence |
| `radar:team:leave-entitlement:forecast` | Forecast |
| `radar:team:leave-entitlement:volatility` | Volatility |
| `radar:team:leave-entitlement:resilience` | Resilience |

### Shift coverage — `shift-coverage`
Published assignments with valid times and owners.

| Rule id | Lens |
|---|---|
| `radar:team:shift-coverage:connection` | Connection |
| `radar:team:shift-coverage:freshness` | Freshness |
| `radar:team:shift-coverage:threshold` | Threshold |
| `radar:team:shift-coverage:trend` | Trend |
| `radar:team:shift-coverage:anomaly` | Anomaly |
| `radar:team:shift-coverage:integrity` | Integrity |
| `radar:team:shift-coverage:continuity` | Continuity |
| `radar:team:shift-coverage:baseline` | Baseline |
| `radar:team:shift-coverage:confidence` | Confidence |
| `radar:team:shift-coverage:forecast` | Forecast |
| `radar:team:shift-coverage:volatility` | Volatility |
| `radar:team:shift-coverage:resilience` | Resilience |

### Training overdue — `training-overdue`
Required training beyond its retained due date.

| Rule id | Lens |
|---|---|
| `radar:team:training-overdue:connection` | Connection |
| `radar:team:training-overdue:freshness` | Freshness |
| `radar:team:training-overdue:threshold` | Threshold |
| `radar:team:training-overdue:trend` | Trend |
| `radar:team:training-overdue:anomaly` | Anomaly |
| `radar:team:training-overdue:integrity` | Integrity |
| `radar:team:training-overdue:continuity` | Continuity |
| `radar:team:training-overdue:baseline` | Baseline |
| `radar:team:training-overdue:confidence` | Confidence |
| `radar:team:training-overdue:forecast` | Forecast |
| `radar:team:training-overdue:volatility` | Volatility |
| `radar:team:training-overdue:resilience` | Resilience |

### Training completion — `training-completion`
Assigned development work completed with evidence.

| Rule id | Lens |
|---|---|
| `radar:team:training-completion:connection` | Connection |
| `radar:team:training-completion:freshness` | Freshness |
| `radar:team:training-completion:threshold` | Threshold |
| `radar:team:training-completion:trend` | Trend |
| `radar:team:training-completion:anomaly` | Anomaly |
| `radar:team:training-completion:integrity` | Integrity |
| `radar:team:training-completion:continuity` | Continuity |
| `radar:team:training-completion:baseline` | Baseline |
| `radar:team:training-completion:confidence` | Confidence |
| `radar:team:training-completion:forecast` | Forecast |
| `radar:team:training-completion:volatility` | Volatility |
| `radar:team:training-completion:resilience` | Resilience |

### Workspace composition — `workspace-composition`
Every active employee has an explicit scoped station set.

| Rule id | Lens |
|---|---|
| `radar:team:workspace-composition:connection` | Connection |
| `radar:team:workspace-composition:freshness` | Freshness |
| `radar:team:workspace-composition:threshold` | Threshold |
| `radar:team:workspace-composition:trend` | Trend |
| `radar:team:workspace-composition:anomaly` | Anomaly |
| `radar:team:workspace-composition:integrity` | Integrity |
| `radar:team:workspace-composition:continuity` | Continuity |
| `radar:team:workspace-composition:baseline` | Baseline |
| `radar:team:workspace-composition:confidence` | Confidence |
| `radar:team:workspace-composition:forecast` | Forecast |
| `radar:team:workspace-composition:volatility` | Volatility |
| `radar:team:workspace-composition:resilience` | Resilience |

### Commission governance — `commission-governance`
Active commission rules with valid rates, cadence and dates.

| Rule id | Lens |
|---|---|
| `radar:team:commission-governance:connection` | Connection |
| `radar:team:commission-governance:freshness` | Freshness |
| `radar:team:commission-governance:threshold` | Threshold |
| `radar:team:commission-governance:trend` | Trend |
| `radar:team:commission-governance:anomaly` | Anomaly |
| `radar:team:commission-governance:integrity` | Integrity |
| `radar:team:commission-governance:continuity` | Continuity |
| `radar:team:commission-governance:baseline` | Baseline |
| `radar:team:commission-governance:confidence` | Confidence |
| `radar:team:commission-governance:forecast` | Forecast |
| `radar:team:commission-governance:volatility` | Volatility |
| `radar:team:commission-governance:resilience` | Resilience |

### Employment terms — `employment-terms`
Active people with retained title, type, hours, pay basis and start date.

| Rule id | Lens |
|---|---|
| `radar:team:employment-terms:connection` | Connection |
| `radar:team:employment-terms:freshness` | Freshness |
| `radar:team:employment-terms:threshold` | Threshold |
| `radar:team:employment-terms:trend` | Trend |
| `radar:team:employment-terms:anomaly` | Anomaly |
| `radar:team:employment-terms:integrity` | Integrity |
| `radar:team:employment-terms:continuity` | Continuity |
| `radar:team:employment-terms:baseline` | Baseline |
| `radar:team:employment-terms:confidence` | Confidence |
| `radar:team:employment-terms:forecast` | Forecast |
| `radar:team:employment-terms:volatility` | Volatility |
| `radar:team:employment-terms:resilience` | Resilience |

### Onboarding age — `onboarding-age`
Preboarding records moving through required steps without stalling.

| Rule id | Lens |
|---|---|
| `radar:team:onboarding-age:connection` | Connection |
| `radar:team:onboarding-age:freshness` | Freshness |
| `radar:team:onboarding-age:threshold` | Threshold |
| `radar:team:onboarding-age:trend` | Trend |
| `radar:team:onboarding-age:anomaly` | Anomaly |
| `radar:team:onboarding-age:integrity` | Integrity |
| `radar:team:onboarding-age:continuity` | Continuity |
| `radar:team:onboarding-age:baseline` | Baseline |
| `radar:team:onboarding-age:confidence` | Confidence |
| `radar:team:onboarding-age:forecast` | Forecast |
| `radar:team:onboarding-age:volatility` | Volatility |
| `radar:team:onboarding-age:resilience` | Resilience |

## `systems` — 13 families (156 rules)

### Installed modules — `installed-modules`
Enabled AquaCRM modules included in monitoring.

| Rule id | Lens |
|---|---|
| `radar:systems:installed-modules:connection` | Connection |
| `radar:systems:installed-modules:freshness` | Freshness |
| `radar:systems:installed-modules:threshold` | Threshold |
| `radar:systems:installed-modules:trend` | Trend |
| `radar:systems:installed-modules:anomaly` | Anomaly |
| `radar:systems:installed-modules:integrity` | Integrity |
| `radar:systems:installed-modules:continuity` | Continuity |
| `radar:systems:installed-modules:baseline` | Baseline |
| `radar:systems:installed-modules:confidence` | Confidence |
| `radar:systems:installed-modules:forecast` | Forecast |
| `radar:systems:installed-modules:volatility` | Volatility |
| `radar:systems:installed-modules:resilience` | Resilience |

### Module data coverage — `module-data`
Enabled modules with readable records.

| Rule id | Lens |
|---|---|
| `radar:systems:module-data:connection` | Connection |
| `radar:systems:module-data:freshness` | Freshness |
| `radar:systems:module-data:threshold` | Threshold |
| `radar:systems:module-data:trend` | Trend |
| `radar:systems:module-data:anomaly` | Anomaly |
| `radar:systems:module-data:integrity` | Integrity |
| `radar:systems:module-data:continuity` | Continuity |
| `radar:systems:module-data:baseline` | Baseline |
| `radar:systems:module-data:confidence` | Confidence |
| `radar:systems:module-data:forecast` | Forecast |
| `radar:systems:module-data:volatility` | Volatility |
| `radar:systems:module-data:resilience` | Resilience |

### Module health checks — `module-health`
Recent health state for every enabled module.

| Rule id | Lens |
|---|---|
| `radar:systems:module-health:connection` | Connection |
| `radar:systems:module-health:freshness` | Freshness |
| `radar:systems:module-health:threshold` | Threshold |
| `radar:systems:module-health:trend` | Trend |
| `radar:systems:module-health:anomaly` | Anomaly |
| `radar:systems:module-health:integrity` | Integrity |
| `radar:systems:module-health:continuity` | Continuity |
| `radar:systems:module-health:baseline` | Baseline |
| `radar:systems:module-health:confidence` | Confidence |
| `radar:systems:module-health:forecast` | Forecast |
| `radar:systems:module-health:volatility` | Volatility |
| `radar:systems:module-health:resilience` | Resilience |

### Integration coverage — `integration-coverage`
Connected external systems and providers.

| Rule id | Lens |
|---|---|
| `radar:systems:integration-coverage:connection` | Connection |
| `radar:systems:integration-coverage:freshness` | Freshness |
| `radar:systems:integration-coverage:threshold` | Threshold |
| `radar:systems:integration-coverage:trend` | Trend |
| `radar:systems:integration-coverage:anomaly` | Anomaly |
| `radar:systems:integration-coverage:integrity` | Integrity |
| `radar:systems:integration-coverage:continuity` | Continuity |
| `radar:systems:integration-coverage:baseline` | Baseline |
| `radar:systems:integration-coverage:confidence` | Confidence |
| `radar:systems:integration-coverage:forecast` | Forecast |
| `radar:systems:integration-coverage:volatility` | Volatility |
| `radar:systems:integration-coverage:resilience` | Resilience |

### Integration failures — `integration-failures`
Connections whose latest test failed.

| Rule id | Lens |
|---|---|
| `radar:systems:integration-failures:connection` | Connection |
| `radar:systems:integration-failures:freshness` | Freshness |
| `radar:systems:integration-failures:threshold` | Threshold |
| `radar:systems:integration-failures:trend` | Trend |
| `radar:systems:integration-failures:anomaly` | Anomaly |
| `radar:systems:integration-failures:integrity` | Integrity |
| `radar:systems:integration-failures:continuity` | Continuity |
| `radar:systems:integration-failures:baseline` | Baseline |
| `radar:systems:integration-failures:confidence` | Confidence |
| `radar:systems:integration-failures:forecast` | Forecast |
| `radar:systems:integration-failures:volatility` | Volatility |
| `radar:systems:integration-failures:resilience` | Resilience |

### Business data freshness — `data-freshness`
Age of the latest recorded workspace change.

| Rule id | Lens |
|---|---|
| `radar:systems:data-freshness:connection` | Connection |
| `radar:systems:data-freshness:freshness` | Freshness |
| `radar:systems:data-freshness:threshold` | Threshold |
| `radar:systems:data-freshness:trend` | Trend |
| `radar:systems:data-freshness:anomaly` | Anomaly |
| `radar:systems:data-freshness:integrity` | Integrity |
| `radar:systems:data-freshness:continuity` | Continuity |
| `radar:systems:data-freshness:baseline` | Baseline |
| `radar:systems:data-freshness:confidence` | Confidence |
| `radar:systems:data-freshness:forecast` | Forecast |
| `radar:systems:data-freshness:volatility` | Volatility |
| `radar:systems:data-freshness:resilience` | Resilience |

### Automation engine health — `automation-health`
Workflow execution and failure state.

| Rule id | Lens |
|---|---|
| `radar:systems:automation-health:connection` | Connection |
| `radar:systems:automation-health:freshness` | Freshness |
| `radar:systems:automation-health:threshold` | Threshold |
| `radar:systems:automation-health:trend` | Trend |
| `radar:systems:automation-health:anomaly` | Anomaly |
| `radar:systems:automation-health:integrity` | Integrity |
| `radar:systems:automation-health:continuity` | Continuity |
| `radar:systems:automation-health:baseline` | Baseline |
| `radar:systems:automation-health:confidence` | Confidence |
| `radar:systems:automation-health:forecast` | Forecast |
| `radar:systems:automation-health:volatility` | Volatility |
| `radar:systems:automation-health:resilience` | Resilience |

### Custom AI register — `custom-ai-register`
Recorded specialist AI systems and access links.

| Rule id | Lens |
|---|---|
| `radar:systems:custom-ai-register:connection` | Connection |
| `radar:systems:custom-ai-register:freshness` | Freshness |
| `radar:systems:custom-ai-register:threshold` | Threshold |
| `radar:systems:custom-ai-register:trend` | Trend |
| `radar:systems:custom-ai-register:anomaly` | Anomaly |
| `radar:systems:custom-ai-register:integrity` | Integrity |
| `radar:systems:custom-ai-register:continuity` | Continuity |
| `radar:systems:custom-ai-register:baseline` | Baseline |
| `radar:systems:custom-ai-register:confidence` | Confidence |
| `radar:systems:custom-ai-register:forecast` | Forecast |
| `radar:systems:custom-ai-register:volatility` | Volatility |
| `radar:systems:custom-ai-register:resilience` | Resilience |

### Telemetry ingestion — `telemetry-ingestion`
Event collection across monitored properties.

| Rule id | Lens |
|---|---|
| `radar:systems:telemetry-ingestion:connection` | Connection |
| `radar:systems:telemetry-ingestion:freshness` | Freshness |
| `radar:systems:telemetry-ingestion:threshold` | Threshold |
| `radar:systems:telemetry-ingestion:trend` | Trend |
| `radar:systems:telemetry-ingestion:anomaly` | Anomaly |
| `radar:systems:telemetry-ingestion:integrity` | Integrity |
| `radar:systems:telemetry-ingestion:continuity` | Continuity |
| `radar:systems:telemetry-ingestion:baseline` | Baseline |
| `radar:systems:telemetry-ingestion:confidence` | Confidence |
| `radar:systems:telemetry-ingestion:forecast` | Forecast |
| `radar:systems:telemetry-ingestion:volatility` | Volatility |
| `radar:systems:telemetry-ingestion:resilience` | Resilience |

### Inbox ingestion — `inbox-ingestion`
Webhook and message ingestion from connected channels.

| Rule id | Lens |
|---|---|
| `radar:systems:inbox-ingestion:connection` | Connection |
| `radar:systems:inbox-ingestion:freshness` | Freshness |
| `radar:systems:inbox-ingestion:threshold` | Threshold |
| `radar:systems:inbox-ingestion:trend` | Trend |
| `radar:systems:inbox-ingestion:anomaly` | Anomaly |
| `radar:systems:inbox-ingestion:integrity` | Integrity |
| `radar:systems:inbox-ingestion:continuity` | Continuity |
| `radar:systems:inbox-ingestion:baseline` | Baseline |
| `radar:systems:inbox-ingestion:confidence` | Confidence |
| `radar:systems:inbox-ingestion:forecast` | Forecast |
| `radar:systems:inbox-ingestion:volatility` | Volatility |
| `radar:systems:inbox-ingestion:resilience` | Resilience |

### Persistence activity — `storage-activity`
Durable business records and recent writes.

| Rule id | Lens |
|---|---|
| `radar:systems:storage-activity:connection` | Connection |
| `radar:systems:storage-activity:freshness` | Freshness |
| `radar:systems:storage-activity:threshold` | Threshold |
| `radar:systems:storage-activity:trend` | Trend |
| `radar:systems:storage-activity:anomaly` | Anomaly |
| `radar:systems:storage-activity:integrity` | Integrity |
| `radar:systems:storage-activity:continuity` | Continuity |
| `radar:systems:storage-activity:baseline` | Baseline |
| `radar:systems:storage-activity:confidence` | Confidence |
| `radar:systems:storage-activity:forecast` | Forecast |
| `radar:systems:storage-activity:volatility` | Volatility |
| `radar:systems:storage-activity:resilience` | Resilience |

### Blind spot control — `blind-spot-control`
Sources that are disconnected, unavailable, or uninstrumented.

| Rule id | Lens |
|---|---|
| `radar:systems:blind-spot-control:connection` | Connection |
| `radar:systems:blind-spot-control:freshness` | Freshness |
| `radar:systems:blind-spot-control:threshold` | Threshold |
| `radar:systems:blind-spot-control:trend` | Trend |
| `radar:systems:blind-spot-control:anomaly` | Anomaly |
| `radar:systems:blind-spot-control:integrity` | Integrity |
| `radar:systems:blind-spot-control:continuity` | Continuity |
| `radar:systems:blind-spot-control:baseline` | Baseline |
| `radar:systems:blind-spot-control:confidence` | Confidence |
| `radar:systems:blind-spot-control:forecast` | Forecast |
| `radar:systems:blind-spot-control:volatility` | Volatility |
| `radar:systems:blind-spot-control:resilience` | Resilience |

### Portal connections — `portal-connections`
Client software linked into their portals, and whether it still reports.

| Rule id | Lens |
|---|---|
| `radar:systems:portal-connections:connection` | Connection |
| `radar:systems:portal-connections:freshness` | Freshness |
| `radar:systems:portal-connections:threshold` | Threshold |
| `radar:systems:portal-connections:trend` | Trend |
| `radar:systems:portal-connections:anomaly` | Anomaly |
| `radar:systems:portal-connections:integrity` | Integrity |
| `radar:systems:portal-connections:continuity` | Continuity |
| `radar:systems:portal-connections:baseline` | Baseline |
| `radar:systems:portal-connections:confidence` | Confidence |
| `radar:systems:portal-connections:forecast` | Forecast |
| `radar:systems:portal-connections:volatility` | Volatility |
| `radar:systems:portal-connections:resilience` | Resilience |

