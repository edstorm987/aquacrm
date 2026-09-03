# Product roadmap — after the 3 September 2026 release baseline

**Status:** proposed, not started. Nothing here begins until the release baseline in
[`production-readiness-roadmap-2026-09-03.md`](production-readiness-roadmap-2026-09-03.md)
is preserved in a known-good commit and Ed has cleared the blockers that need him.
Each item names the surfaces it touches so a worker can scope a lane without
re-exploring, and each says what already exists so it is repurposed rather than
duplicated (`docs/workspace/hazards-and-duplication.md` rule).

---

## 1. Personal versus business Command Centre

**Today:** one Command Centre (`/portal/agency`) with stations; the personal slice lives on
`/portal/agency/my-radar` and the personal calendar, gated by `staff.overview` and
`workspace.calendar`. The business slice is the radar-inspector station and Department
workload, gated by the composite Business Radar capability.

**Outcome:** a person opens *their* command centre (actions, calendar, goals, wellbeing,
pace) and, when their seat allows, switches to the *business* command centre (portfolio
KPIs, Business Radar, workload) — two views, one shell, no duplicated pages.

- Phase A — extract the personal panels of `_DashboardCommandCenter` into a
  `PersonalCommandCentre` station reusing `PersonalRadarPanel`; keep `/my-radar` as its
  address.
- Phase B — make the business/personal choice a topbar context (beside "Working as") and
  remember it per user in the chrome layout record.
- Phase C — a manager whose seat hides Business Overview lands on the personal view
  without a redirect notice.

## 2. Personal versus business Radar

**Today:** split at the access layer (`personalRadarAccess.ts`), with separate topbar
quick looks; the personal Radar has actions, goals, wellbeing and pace; Business Radar
scans every department, client and dataset.

- Phase A — evidence age and confidence on the personal Radar (the same three-way
  health/evidence/readiness contract Business Radar already carries; issue #170's
  freshness decision applies to both).
- Phase B — personal quotas (`PersonalMetricDay`) surfaced as goals with a daily/weekly
  toggle; the Calendar's "target" type feeds them.
- Phase C — a department lens on Business Radar that reads the same
  `DEPARTMENT_PROFILES` the seats use, so "what my department sees" and "what my
  department is responsible for" agree.

## 3. Semantic KPI and insight definitions

**Today:** `semanticRegistry.ts` and the data engines carry KPI identities (Phase 0 of the
data migration plan); KPI copy is still authored per panel.

- Phase A — one definition record per KPI (name, formula, unit, source dataset, freshness
  rule, owner) rendered from the registry in the KPI intelligence dossier.
- Phase B — every KPI tile links to its definition and to the evidence rows it was
  computed from (the Radar inspector already does this for checks).
- Phase C — insight templates ("X changed because Y") generated from definitions, with
  human acceptance before they become Advisor proposals (non-negotiable contract).

## 4. Redesigned data interfaces

**Today:** lists and tables are per-module components; custom fields exist for clients,
tasks and calendar items with three different editors.

- Phase A — one `RecordTable` and one `RecordForm` primitive with the shared keyboard,
  focus and checked-mutation contracts already pinned (#47, #135, #138).
- Phase B — adopt them in Actions, Calendar, People and Fulfilment first (the four surfaces
  the release gate already walks), measured by the same gate.
- Phase C — saved views per user in the chrome layout record.

## 5. Configurable desktop topbars, equivalent to the mobile nesting system

**Today:** `TOPBAR_CONTROL_IDS`, topbar pins and the "arrange which controls sit on the
bar" flow exist; the mobile overflow nests controls; desktop shows a fixed order.

- Phase A — the desktop bar reads the same pinned/nested arrangement the mobile drawer
  uses, with an overflow menu on narrow desktops.
- Phase B — per-workspace defaults (agency, team, client, customer) authored in Settings.
- Phase C — keyboard model for the overflow (menu roles) and the release gate's
  popover contract for every quick look.

## 6. Per-workspace and per-role navigation and element configuration

**Today:** sidebar assembly is actor-resolved (`agencyBasePanels.ts`) from element
capabilities; the AquaOasis override narrows the visible set in code.

- Phase A — move the override into a stored per-workspace navigation profile editable from
  Settings, seeded from the current code default.
- Phase B — per-role defaults keyed to reusable role templates (the department profiles
  become the first presets).
- Phase C — the Tools directory and search read the same profile, so nothing reachable is
  unlisted and nothing hidden is advertised (the existing `capabilitySearchHrefs` rule).

## 7. User overrides, enforced items and permission-request workflows

**Today:** the access kernel supports requests/approval/denial/cancellation/revocation;
the chrome layout record holds personal arrangement; `#174` (last-grant widening) is open.

- Phase A — mark navigation items as *enforced* (cannot be hidden by the user) or
  *optional* in the workspace profile; personal overrides apply only to optional items.
- Phase B — "Request access" from a hidden-element notice (the
  `notice=staff-overview-required` page) that files an access request through the
  existing kernel and shows its state.
- Phase C — resolve #174 with Ed, then make revocation narrow-by-default.

## 8. Incremental user-requested UI and UX refinements

Small, measurable, each proven by the release gate before merge:

- 44×44 targets on the calendar toolbar, phase cards, inbox chips and notepad tabs.
- Read the internal workspace label from the agency record.
- The Dev Editor's SEO-field prompts and phone drawer draft retention (recorded by the
  editor gate).
- The remaining low-opacity small text in the External AI connection panel.

---

Every phase above ships with: a focused smoke, an entry in `updates.md`, a row in
`TODO.md`, and a release-gate story where a mounted surface changes.
