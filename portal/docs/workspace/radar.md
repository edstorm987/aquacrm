# Chapter — Radar (omega dossier)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

Verified from source. Radar is the monitoring spine: a **2,064-rule catalogue**
plus sentinels, evidence history, memory, and a policy engine, resolving into
health / evidence-confidence / readiness — three *separate* axes — and into
resolvable actions with a strict in-app / off-system / judgement contract.

> **The core contract (CLAUDE.md, enforced in code):** *missing evidence is a
> visible blind spot, never a healthy pass.* A `blind` check is not a `pass`; a
> `learning` check is not a `pass`; and the watchdog escalates **any** blind
> check to a command-level incident (zero tolerance).

## 1. The evaluation pipeline (one sweep)
> **Sweep scheduler (radar upgrade Stage 1, shipped 2026-08-19).**
> `lib/server/radarSweeps.ts` now names the sweep *types* — `pulse` (the live
> `buildBusinessIssueRadar` read), `deep` (synthetic canaries), `infra`
> (**shipped Stage 4** — `runRadarInfraSweep` probes primary + external DBs via
> `databaseStorageHealth()`, writes `radarInfraHealth`, read by the Pulse as
> `infra`-scope checks), `evidence` (memory + vault rollup), `compliance` (slow
> daily) — each with cost/cadence/persists/performsIo metadata, and provides the
> orchestration the scan route + `cron/inbox` used to inline:
> `runRadarFullSweep` (POST scan: force Deep, rebuild Pulse, reconcile, roll up
> evidence, invalidate) and `runRadarScheduledSweep` (cron, per active agency,
> unforced Deep). It is a thin wrapper over the builders below — **no behaviour
> change yet**; Stage 2 wires check `tier` to the scheduler. See
> [plans/radar-upgrade.md](../development/plans/radar-upgrade.md) Part A.

Orchestrated by `lib/server/businessIssueRadar.ts` (`buildBusinessIssueRadar`,
30s coalesced cache). In order:
1. `buildRadarObservations(...)` → `applyRadarEvidenceBaselines(...)` — the raw numeric signals (~150 hand-written observations; every catalogue family back-filled with a blind placeholder so there are **no silent gaps**).
2. `buildRadarEvidenceLayer(...)` — the **history** layer (4 checks/family + anomalies + digest).
3. `buildRadarCheckMatrix(...)` — the **kpi** catalogue matrix (the 2,064-rule core).
4. `buildRadarCorrelationIssues(...)` — compound-risk issues.
5. `buildSourceSentinelChecks` (8/source), `buildPropertySentinelChecks` (12/property), `buildSyntheticCanaryChecks` (12/live property).
6. `buildRadarWatchdogChecks` — 16 self-checks that audit all the above.
7. Per-domain `coverage:{domain}-check-blindness` critical issues.
8. `applyAdaptiveRadarPolicy(...)` — gates/tunes every check by the tenant's policy; builds conclusions + incidents; computes health/confidence/readiness. **Run twice** — once, then again after `buildRadarMemoryDigest` folds memory issues back in.

`scope` on a check: `kpi | source | property | synthetic | history | watchdog`.
It writes nothing itself — the scan **route** persists (see §8).

## 2. The catalogue — 2,064 rules (`lib/radarRuleCatalog.ts`)
A **cartesian product**, not a hand-list: **172 signal families × 12 lenses =
2,064 rules**. Rule id = `radar:{domain}:{familyId}:{lensId}`.

> **Check classification (radar upgrade Stage 2, shipped 2026-08-19).**
> `lib/radarClassification.ts` tags every rule + built check with two additive
> axes (no id/count change): **tier** — `instant` (in-state, Pulse) / `probe`
> (network/DB, Deep/Infra) / `rollup` (retained history, Evidence), scope-driven
> and wired to the scheduler (`RADAR_TIER_TO_SWEEP`); and **dataDependency** —
> `in-state` / `derived` / `external`, so a blind check reads as "external dep
> down" vs. "not yet instrumented". The 2,064 kpi-scope rules are all `instant`;
> history-leaning lenses (trend/anomaly/baseline/forecast/volatility) flag
> `derived`. Checks carry the fields in the serialized radar for UI filtering.

> **Every one of the 2,064 rules is enumerated** in
> **[`docs/reference/radar-rules.md`](../reference/radar-rules.md)** — generated
> from the catalogue (`scripts/generate-radar-rules-reference.ts`, re-runnable).
> This chapter explains the *generators* (the 172 families + how each of the 12
> lenses evaluates); that reference lists every resolved rule id. Together they
> are the complete picture — look a specific rule up there, understand the
> mechanism here.

### The 12 lenses (what each proves)
| Lens | Proves |
|---|---|
| connection | the source is connected and observable |
| freshness | not stale/delayed/silent |
| threshold | current value vs its operating guardrail |
| trend | current period vs preceding period |
| anomaly | unusual jumps/drops/pattern breaks |
| integrity | sample quality, completeness, consistency |
| continuity | reporting without an unexplained gap |
| baseline | enough history to tell normal from abnormal |
| confidence | sample large/trustworthy enough to decide |
| forecast | momentum moving toward or away from the guardrail |
| volatility | unstable movement hidden inside an OK value |
| resilience | stays observable when a source degrades |

### The 172 families, by domain (the subjects the lenses apply to)
- **company (18):** overall-health, income-health, client-health, pipeline-health, operations-health, revenue-target, revenue-gap, objectives, plans, capacity, trading-companies, direction-profile, ownership-register, share-authority, capital-ledger, investment-valuations, dividend-obligations, capital-governance.
- **sales (13):** enquiries-24h/-7d/-30d, form-enquiries, chatbot-enquiries, urgent-enquiries, median-response, p90-response, awaiting-response, target-breaches, pipeline-leads, enquiry-linkage, **enquiry-routing** (Aqua-Tag routing coverage — tagged sites pointing at a specific client/company vs the agency catch-all; aqua-tag plan Phase 5).
- **inbox (12):** conversation-volume, open-conversations, unread-messages, response-overdue, unassigned-conversations, failed-messages, channel-connections, connection-errors, webhook-health, sync-freshness, support-demand, notification-delivery.
- **clients (12):** active-clients, attention-clients, owner-coverage, contact-freshness, telemetry-coverage, telemetry-freshness, production-errors, open-requests, blocked-milestones, product-coverage, source-attribution, retention-state.
- **finance (12):** monthly-revenue, mrr, target-progress, cash-gap, overdue-invoices, budget-pressure, obligations, people-payments, expense-evidence, recurring-costs, currency-coverage, finance-records.
- **delivery (12):** fulfilment-pipelines, delivery-cards, stalled-cards, milestones, blocked-milestones, overdue-milestones, product-assignments, pending-approvals, open-requests, deliverables, portal-readiness, delivery-alerts.
- **marketing (12):** traffic-24h/-7d, traffic-change, traffic-surges, traffic-drops, form-submissions, conversions, conversion-rate, campaign-attribution, unattributed-leads, search-visibility, campaign-records.
- **operations (12):** open-tasks, overdue-tasks, urgent-tasks, unassigned-tasks, in-progress-tasks, due-soon, task-completion, activity-volume, activity-freshness, active-automations, automation-failures, automation-coverage.
- **compliance (12):** legal-register, expired-records, due-records, action-required, insurance, contracts, contract-acceptance, tax-records, policy-coverage, audit-readiness, compliance-freshness, obligation-coverage.
- **development (13):** property-coverage, tag-coverage, tag-freshness, heartbeat-health, production-errors, error-rate, load-performance, slow-properties, deployments, release-errors, monitoring-silence, telemetry-integrity, **injection-coverage** (Aqua-Tag tools configured per site; aqua-tag plan Phase 5).
- **team (31):** team-size, owner/staff/freelancer-coverage, task-ownership, workload-balance, capacity-plan/-pressure/-growth/-sales/-client-success/-delivery/-operations/-finance/-systems, hiring-trigger, people-payments, objective-ownership, role-integrity, candidate-backlog, employee-portal-coverage, onboarding-readiness/-age, leave-decisions/-entitlement, shift-coverage, training-overdue/-completion, workspace-composition, commission-governance, employment-terms.
- **systems (13):** installed-modules, module-data, module-health, integration-coverage, integration-failures, data-freshness, automation-health, custom-ai-register, telemetry-ingestion, inbox-ingestion, storage-activity, blind-spot-control, portal-connections.

> `RADAR_CHECKS_PER_DOMAIN = 144` is a **nominal floor** (asserted, never
> shrinks below), *not* the real per-domain count (company 216, team 372,
> systems 156…). The check engine throws at load if it drops below 140.

## 3. The check engine (`lib/radarCheckEngine.ts`) — lens logic
`buildRadarCheckMatrix` maps **every** rule through `evaluateRadarRule`.
**Pre-lens gates (the blind-spot contract):** no observation → **`blind`**
("explicit instrumentation gap, not a healthy result"); observation but not
connected → **`blind`** ("cannot prove health"). Status enum:
`pass | critical | warning | watch | blind | learning | inactive`.

| Lens | Status logic (verified) |
|---|---|
| connection | always `pass` once connected (substantive proof is in the sentinels) |
| freshness | age > `freshnessMs×2`→critical; > `freshnessMs` (dflt 48h)→warning; else pass |
| threshold | passthrough of the observation's precomputed status (healthy→pass, unknown→watch) |
| integrity | non-finite/`integrity:false`→warning; sample 0/null→watch; else pass |
| continuity | age > cadence×4→critical; ×2→warning; ×1→watch; else pass |
| baseline | finite `previous`→pass; else watch |
| confidence | sample ≥ required (dflt 5, neutral 1)→pass; structurally unsound→warning; else watch |
| resilience | integrity false / stale→warning; >1 source→pass; else watch |
| trend | %Δ adverse & mag≥75→critical; ≥35→warning; mag≥50→watch; else pass |
| forecast | from status; keeps critical/warning if guardrail already breached with no baseline |
| volatility | enough volume & mag≥200→warning; ≥75→watch; else pass |
| anomaly | enough volume & adverse & mag≥100→warning; ≥100→watch; else pass |

**Domain math — three separate ratios** (`summarizeRadarChecks`):
`coveragePercent = connected/applicable` (blind subtracted — a blind check is
**not** covered); `assurancePercent = assured/applicable`;
`confidencePercent = (assured + watch×0.6 + learning×0.25)/applicable`;
`readinessPercent = sourceReadiness×0.65 + checkConfidence×0.35`.

## 4. The three-way distinction (health ≠ confidence ≠ readiness)
Enforced structurally so one family can be simultaneously healthy-value,
low-confidence, and a readiness gap — three checks, three axes, never collapsed:
- **HEALTH** — `companyHealth` → `metric:company-health` → `healthScore = companyHealth×0.7 + incidentHealth×0.3` (incidentHealth = `100 − critical×18 − warning×7 − watch×2`).
- **CONFIDENCE** — the `confidence`/`baseline`/`integrity` lenses + `confidencePercent`, computed as a *separate number*.
- **READINESS** — the `blind` status itself (excluded from assured, subtracted from coverage), `learning`, `readinessPercent`, the watchdog **`zero-blindness`** guardrail (any blind → critical), and per-domain blindness issues.

## 5. Policy engine (`lib/radarPolicyEngine.ts`)
`resolveRadarPolicy` merges `default → domain → family → check` (most specific
wins). Defaults: state `learning`, activation `on-first-activity`, warning
tolerance **15%**, critical **max(warn,30)%**, minimumSampleSize **12**,
learningPeriod **30d**. `applyAdaptiveRadarPolicy` per check: applies a
configured numeric target (threshold lens → breach%→critical/warning/watch);
marks **always-on** checks (domains systems/compliance, scopes synthetic/
watchdog, or ids matching `security|breach|payment|invoice|cash|tax|legal|
contract|payroll|backup|canary…`) that bypass all suppression; marks `inactive`
(paused/seasonal/manual) or `learning` (insufficient sample/time) — but
`isAuthoritativeFailure` (a critical/warning on a targeted threshold) is **never**
suppressed. **Conclusions:** `commercial-engine-not-established` (critical),
`pipeline-below-revenue-plan`, `marketing-demand-not-measurable`,
`lead-clock-not-started`, `domains-calibrating`. **Incidents** group issues by
`{domain}:{category}` (coverage/evidence/compound-risk/lead-response/health/
reliability). **Above that (radar upgrade Stage 5)** every incident also carries
a top-level `group` — one of six "what kind of problem" buckets
**Infrastructure / Commercial / Compliance / Delivery / Reliability / People**
(`radarFindingGroup`, in `lib/radarClassification.ts`: Reliability + Infra are
cross-domain overrides, then domain defaults). The radar exposes `findingGroups`
(per-bucket incident/critical/warning/watch counts) for the operator's
at-a-glance view (`FindingGroupBar` in the Command Centre).

## 6. Correlations & sentinels
**Correlations** (`lib/radarCorrelations.ts`) — **22 static** compound-risk rules
(fire only when *all* evidence predicates match), e.g. `demand-response-pressure`
(sales, critical: enquiries-7d>0 & awaiting-response>0), `traffic-conversion-leak`,
`client-delivery-pressure`, `cancellation-health-risk`, `release-regression` —
plus **2 dynamic** cluster detectors (`{domain}-risk-cluster` at ≥4 firing
families; `whole-business-risk-cascade` at ≥3 clustered domains).

**Sentinels** (`lib/radarSentinels.ts`): **source** (8/source — connection/
freshness/threshold/integrity/continuity/baseline/confidence/resilience),
**property** (12/telemetry property — dev+marketing lenses over traffic/errors/
load), **watchdog** (16 self-checks incl. `catalog-floor ≥1728`, `unique-check-ids`,
`domain-floor ≥144`, `timestamp-integrity`, and **`zero-blindness` → critical on
any blind check**; **radar upgrade Stage 6** adds a 17th, **`coverage-gaps`**,
when a coverage manifest is supplied — it proves every monitorable entity
resolves to a detector pack). **Coverage seeding (Stage 6):**
`lib/radarCoverageRegistry.ts` declares a detector-pack template per entity type
(client/product/property/integration/portal-connection/trading-company) + a
generic fallback; `resolveRadarCoverage()` builds `radar.coverageManifest`, and
`lib/server/radarSeeding.ts` invalidates the Pulse cache on entity-creation
events so new coverage registers immediately (calibrating). **Synthetic canaries** (`radarSyntheticChecks.ts`, 12/live
property): DNS/reachability, HTTP status, latency, redirects, HTML, `<title>`,
forms, security headers (6: HSTS/CSP/X-Frame/nosniff/referrer/permissions), TLS
expiry, Aqua-tag marker.

## 7. Server runtime modules (`lib/server/`)
- `radarObservations.ts` — ~150 observations; fills every family (no gaps).
- `radarEvidenceVault.ts` — durable KPI time-series: 5-min buckets (cap 288) + hourly rollups (cap 720); MAD-based `deviationScore = 0.6745·|current−baseline|/mad`; baseline-ready needs ≥12 points **and** ≥30-day span. `recordRadarEvidence` writes; series resolve by id **or** sourceId (fixes ~1,505 orphaned series).
- `radarMemory.ts` — temporal continuity: new/worsening/recovered/recurring, `flappingSources` (≥3 state changes/24h), deltas, 48-pt history; `recordRadarSweep` writes, prunes recovered after 90 days.
- `radarSourceInspection.ts` — the read-only "audit room": ~25 datasets, secrets redacted, founder-only for public enquiries, 15s cache.
- `radarSyntheticProbes.ts` — SSRF-safe canaries (concurrency 4, 12s deadline, ≤128KB HTML, TLS + header checks); writes `radarSyntheticProbes`.
- `radarTelemetry.ts` — Aqua-Tag property snapshot (24h/7d/prev-7d pageviews/forms/conversions/errors); stateless.

## 8. How a scan runs end-to-end (`POST /api/portal/advisor/radar`)
`runFullRadarScan()`: `ensureHydrated` → `requireRole(owner/manager)` →
`runAgencySyntheticProbes(force)` (**writes** probes) → `buildBusinessIssueRadar`
(reads everything incl. fresh probes) → `reconcileAgencyTasksWithRadar` →
`recordRadarSweep` (**writes** memory) → `recordRadarEvidence` (**writes**
evidence) → invalidate cache → flush. `GET` = read-only rebuild; `PATCH` edits
`advisor.radarPolicy`. The three state collections
(`radarSyntheticProbes`/`radarMemory`/`radarEvidence`) are read during build,
written only by those three functions.

## 9. Operational alerts → tasks
`lib/server/operationalAlerts.ts` `listOperationalAlerts` emits `OperationalAlert`s
(id families `people:`, `compliance-*:`, `task:`, `contact:`, `invoice:`,
`enquiry:`, `outage:`, `finance:*`, `development:*`, …) gated by notification
settings; thresholds in `OPERATIONAL_ALERT_THRESHOLDS` (clientContact 14d,
contractAcceptance 7d, portalAccess 3d, staleMonitoring 2d). Radar folds every
alert into its issue set (`issueFromOperationalAlert`), and findings become
**tasks** via `reconcileAgencyTasksWithRadar` — which **reopens a done task** if
its source condition returns (`task.reopened_by_radar`). Attention window
(`attentionProtection.ts`): load `clear/steady/elevated/overload`, focusLimit 5,
`DEFERRALS_BEFORE_PROMOTION = 3` (parked-3× work bumps one tier). Preferences
(`operationalAlertPreferences.ts`): `read/unread/park/dismiss`; deferrals count on
**park** only; a `persistentUntilResolved` dismiss stays as a non-attention row.
Off-system completion logged in `server/completedActions.ts` (idempotent within
60s). Sidebar counts via `sidebarAttention.ts`.

## 10. ⭐ The resolvable action-type model (verified)
Defined in `lib/inbox/resolutionExplain.ts`:
`type ResolutionKind = "in-app" | "off-system" | "judgement"`. Resolved by
`resolutionKindOf(alert)` (the alert's own declared `kind`/`clearsWhen` wins,
else the `CLEARS_WHEN` prefix table, else radar/incident fallback → `judgement`).

| Kind | Meaning | Clearance | Primary control |
|---|---|---|---|
| `in-app` | a control on a screen resolves it | carries `clearsWhen`; the control clears it | **Resolve** |
| `off-system` | the real work happens elsewhere (a call, a renewal, a payment); Aqua records the outcome | `clearsWhen` = the observable outcome | **Mark done** |
| `judgement` | no fix, only a business decision; clears because the business changed | **no `clearsWhen`** (deliberately absent) | **Evidence** (primary); Dismiss |

**Enforcement:** `components/attention/AttentionControls.tsx:71` —
`const canResolve = kind === "in-app"`. The Resolve button renders **only** for
`in-app`. `judgement` makes Evidence the primary (black) action; `off-system`
shows Mark-done. Unknown/`radar:`/`incident:` families default to `judgement`
(never an optimistic Resolve pointing nowhere).

**Family → kind → clears-when** (the `CLEARS_WHEN` table): *in-app* —
`enquiry-classification:`, `person-organisation:`, `finance:budget-`,
`external-proposal:`, `task:`, `request:`, `enquiry:`, `website-message:`,
`calendar-reminder:`, `compliance-action:`, `client-marketing-approvals:`,
`finance:expense-*`, `people:`. *off-system* — `invoice:`, `payment-plan:`,
`contract-awaiting:`, `compliance-expired:/-reminder:/-due:`, `portal-access:`,
`contact:`, `meeting:`, `prospect-follow-up:`, `campaign-budget:/-target:`,
`outage:`, `development:errors:/monitoring-stale`, `client-marketing-access:/
-budget:/-no-leads`, `finance:overdue-invoices/obligations-*/people-payments-due`.
*judgement* — `radar:`, `recommended-radar:`, `incident:`, unknown families.
Multi-step resolution plans (`resolutionPlans.ts`) exist for classification,
contracts, payment-plans, portal-access, enquiries — each step's `done` derived
live, never stored.

**Actionable proposals (radar upgrade Stage 7).** `AdvisorActionSuggestion` now
carries the resolution model — `kind` (via `resolutionKindOf`), `expectedOutcome`
(the clearance condition), concrete `steps` (via `stepsFor`, so one finding can
become several tasks), a `suggestedOwner` and its Stage-5 `group`.
`buildBusinessRecommendedActions` **widens** judgement findings that have a real
fix (coverage/source/readiness + infra/reliability/compliance/delivery incidents)
to `off-system` with a clearance; genuine judgement calls keep their kind but
still carry steps — never a dead end. Accepting one mints a fully-formed task
(the human-acceptance contract is unchanged), and completing it clears the
finding (which `reconcileAgencyTasksWithRadar` already verifies).

## 11. The Radar tests — verified inventory ("what's legit in there")
Run under `npx tsx --test scripts/*.test.ts`. `audit-*.ts` are read-only
diagnostics (tables, not assertions).

| File | Asserts (verified from the test body) |
|---|---|
| `smoke-business-radar.test.ts` (20 tests) | configurable speed-to-lead guardrails; coverage per install + blind-spots issue; **12 domains × 144** checks / 12 lenses; missing observations → all-blind (0% coverage, never a false pass); correlations; sentinel packs; SSRF-safe canaries; memory/recovery/flapping; evidence-vault retention; policy keeps safety checks alive when paused; a 52-blind incident keeps **exactly** 52 ids (no 40-cap truncation) |
| `smoke-radar-sweeps.test.ts` *(upgrade Stage 1–2)* | the sweep scheduler taxonomy (pulse/deep/infra/evidence/compliance) + cost/io metadata; scan route + cron delegate to `runRadarFullSweep`/`runRadarScheduledSweep`; each sweep declares its `tiers` and `RADAR_TIER_TO_SWEEP` is total |
| `smoke-radar-classification.test.ts` *(upgrade Stage 2)* | **behavioural**: every scope → valid tier; `classifyRadarCheck` resolves both axes; **all 2,064** catalogue rules carry a correct tier+dataDependency (history-leaning lenses → `derived`) |
| `smoke-radar-golden-sweep.test.ts` *(upgrade Stage 3)* | **runs the real `buildBusinessIssueRadar`** on a seeded agency fixture: 2,064 catalogue intact, 2,959 total checks, status partition covers every check, every check classified, zero-blindness for an uninstrumented agency, deterministic for a fixed clock |
| `smoke-radar-sweep-isolation.test.ts` *(upgrade Stage 3)* | the Pulse does **zero network I/O** and writes none of the radar state collections; the Deep sweep is probe-scoped (writes nothing without live targets); only a scheduled sweep persists memory + evidence + infra |
| `smoke-radar-infra-health.test.ts` *(upgrade Stage 4)* | `buildInfraHealthChecks` maps connected→pass / slow→warning / down→critical / untested→inactive (never a fake pass); external targets get their own checks; storage shown "not available in-app"; `databaseStorageHealth()` probes the memory backend honestly (untested); `runRadarInfraSweep` persists `radarInfraHealth`; Command Centre panel wired to `radar.infra`; `healthz/full` reuses the promoted probe |
| `smoke-client-radar.test.ts` | client radar starts `learning`; per-product/property detector packs with exact `entity`; a missed instalment → critical finance check (£600 outstanding); **check ids never shared between client workspaces** |
| `smoke-commercial-lifecycle-radar.test.ts` | lifecycle stays `learning` with no cohorts; joins sources→conversion/churn; radar + advisor + command centre share one snapshot |
| `smoke-radar-kpi-scorecard.test.ts` | first-class KPI scorecard (Actual/Target/Variance/Movement) with inspect+evidence links |
| `smoke-radar-summary-drilldowns.test.ts` | every headline metric is clickable + explains its calc; memory/evidence/cohort/scanner rows open their exact evidence |
| `smoke-radar-inspection.test.ts` | evidence inspection exposes index + full series **without agency leakage** |
| `smoke-radar-source-inspection.test.ts` | source records tenant-scoped, owner/manager-only, **credentials redacted** before display/export |
| `smoke-topbar-radar.test.ts` | topbar quick-look uses live radar; offers a real full scan |
| `attention-protection.test.ts` / `smoke-attention-protection.test.ts` | overload exposes 5 severity-first items; retains unresolved read, excludes parked; clearing a focus auto-promotes reserve; one window feeds notifications+sidebar+Actions+Day |
| `smoke-attention-controls.test.ts` | Actions uses the shared `AttentionControls`; resolve/remind/dismiss on both inbox+Actions; row drops only after server confirm; Evidence lands on the exact record |
| `smoke-alert-classification.test.ts` | every alert leaves the stamper with a `kind`+`focus`; a check's own declaration beats the table; unrecognised ids still classified |
| `smoke-every-action-classified.test.ts` | ≥40 families; **every** family classified + has clearance + focus; **never marks can't-do-in-Aqua work as `in-app`**; no-fix → judgement; real-control → in-app |
| `smoke-resolution-explain.test.ts` | every family states clearance; unknown stays silent; stats translated (zero-baseline/tiny-number cautions); radar patterns classified `judgement`, not a task |
| `smoke-resolution-context.test.ts` / `-app-wide.test.ts` / `-spotlight.test.ts` | resolution context travels in the URL not memory; multi-step points at first unfinished step; every focus has a screen to land on |
| `smoke-evidence-card.test.ts` / `-completeness.test.ts` / `-steps.test.ts` | records expand in place; generic fallback shows why/how-old/what-clears + "dealt with before"; off-system done needs source+title, records+clears only after server confirm; every family gets ≥1 concrete instruction step |
| `smoke-radar-evidence.test.ts` | radar item recognised under all 3 id forms; plots retained history; median reference line; survives flat series; **controls follow the kind** (Resolve only in-app, Evidence primary judgement, Mark-done off-system) |
| `smoke-action-sources.test.ts` | 4 task sources + combined; **Radar/Advisor/CRM suggestions require acceptance before task creation**; external-AI proposals stay approval-gated |
| `company-health.test.ts` | weak company → income 20/clients 50/pipeline 20/operations 60/**overall 34**; complete active brand → 100; missing records stay visible (no invented healthy score) |
| `client-aqua-health.test.ts` | `learning` (score null, confidence 0) with no evidence; overdue-payment risk surfaced; current-contact + paid + accepted → strong 100 |
| `audit-alert-families.ts` (diagnostic) | read-only sweep: tabulates every family's kind/focus/clearance/steps/evidence, flagging any with no focus, nothing-to-do, or in-app-without-clearance |
| `audit-judgement-evidence.ts` (diagnostic) | read-only: runs real radar, checks each issue has graphable evidence + a plain reading |

## 12a. Real DB/storage health (radar upgrade Stage 4)
`systems:storage-activity` was mislabeled (it counts activity rows, not storage).
It's **relabelled** honestly (family kept — the 2,064 is intact) and **real**
infra health now rides the **`infra` scope** (not the catalogue): the Infra
sweep's `databaseStorageHealth()` probes primary + external DBs (reachability,
latency, key-table row counts) and `buildInfraHealthChecks` turns the snapshot
into checks (down→critical, untested→inactive). Bucket bytes are honestly "not
available in-app" (service-role limit). See §1 sweep note and the plan Part D.

## 12. Stubs / things to flag (verified)
- Watchdog **`correlation-engine`** check is a **hardcoded `pass`** (nominal execution marker — the one genuine placeholder-style check).
- Catalogue **`connection` lens** is trivially `pass` once connected (real proof is in the sentinels).
- **Correlation-only families** (`stale-open-leads`, `lost-decision-rate`, `source-conversion-spread`, `source-churn-spread`, `pending-cancellations`, `source-concentration`, `lead-source-attribution`) exist for correlation but have **no** 12-lens catalogue pack — intentional, but a mismatch when auditing "why does this family have no checks?"
- No `TODO`/`not-implemented` markers in any of the nine engine files.
- ⚠ **PRODUCTION PREREQUISITE — the radar-probes cron does not fire by default.**
  `vercel.json` schedules `/api/cron/radar-probes` at `*/10 * * * *`, and it is real and
  shipped — but in production it only runs when **`CRON_SECRET` is set** *and* the Vercel
  plan permits **sub-daily** crons (Hobby is daily-only). Unset either and the probes are
  silently never collected, so every probe-tier signal stays empty with no error anywhere.
  Lifted here 2026-08-21 from the radar handoffs when they were archived — it was the only
  live home this fact had, and `plans/radar-upgrade.md` still lists probe cadence as an open
  question, which reads as "the cron does not exist" to anyone working from live docs.
- ⚠ **Current scheduler mismatch (issue #131):** Evidence declares an hourly cadence but
  is only rolled up by manual full scan or daily `cron/inbox`. That daily route calls
  `runRadarScheduledSweep()` per agency, and the helper reruns the app-wide Infra probe inside
  each call; an Infra failure also prevents that tenant's evidence sample. The dedicated
  ten-minute probe cron already models the intended shape correctly (Infra once, Deep per
  agency), but the daily evidence path does not.

_See the [KPI dossier](kpi-intelligence.md) for the metrics that ride Radar's
evidence vault, and the [Advisor dossier](advisor.md) for how findings become
recommendations._
