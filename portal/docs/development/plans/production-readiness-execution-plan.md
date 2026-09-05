# Production-readiness execution plan (audit-derived, 2026-09-05)

> Synthesized from the 6-dimension production-readiness audit (dead-code, jargon,
> responsive/a11y, unconnected-features, config-onboarding, TODO-triage), deduplicated
> and safety-ranked: **highest value × lowest risk × not-blocked-on-Ed first**. Paths
> relative to `portal/`. Every "verify" ends with `npm run typecheck && npm run smoke:all`.
> Progress is tracked in [`../OVERNIGHT-RUN-2026-09-05.md`](../OVERNIGHT-RUN-2026-09-05.md);
> Ed-blocked items in [`../BLOCKERS-FOR-ED.md`](../BLOCKERS-FOR-ED.md).
>
> **Note on issue numbers:** the a11y items the run calls #122/#123/#124 are the TODO's
> *own* labels (touch-targets / topbar-hydration / low-opacity), NOT `issues.md` numbers
> (which are unrelated Stripe/membership items). Track a11y items by description.

## TONIGHT — safe to execute autonomously

### Wire-or-retire (pure quarantine, zero external refs)
- **W1** Quarantine `src/built-ins/modules/website-editor/src/components/editor/FormPickerModal.tsx` (0 importers; imports non-existent `@aqua/plugin-forms`, calls dead `/api/portal/forms/forms`).
- **W2** Remove dead `parseSourceStamp` export from `src/engines/editor/server/sourceStamp.ts:33` (0 importers; siblings stay).
- **W3** Quarantine dead `NOOP_PORTAL_VARIANT_PORT` (`fulfillment/src/server/starterVariant.ts` + re-export `index.ts:22`) and fix the stale "no-op shim until T3 ships" comments (`clients.ts:165`) — the real `portalVariantAdapter` is live.
- **W4** Remove dead sidebar label key `"agency-finance"` (`src/lib/chrome/sidebarLayout.ts:58`) — filtered by `canonicalMainIds`, never renders.
- **W5** Quarantine dead a11y primitive `src/lib/a11y/useArrowNav.ts` (0 callers; `useMenuKeys` stays with 12).
- **W6** *(isolated — deliberately turns suite red)* Fix `scripts/smoke-website-editor-dead-ui-calls.test.ts` to catch the `fetchImpl ?? fetch` idiom + widen beyond website-editor. Land alone; triage newly-caught dead calls.

### UI production pass (contrast / touch / focus)
- **U1** Raise sub-AA contrast on functional/safety text — `ExternalAiConnectionPanel.tsx` (:481 live-secret warning `emerald-950/50`→solid `emerald-900`, :471 `/60`→`/80` ✅done, :476 `/70`→solid, :387 amber-900/75→/90); `_ActionsWorkspace.tsx` (:742 emerald-950/65→solid; metadata floors :754/:842/:929/:837/:841 → `text-black/55` floor for ≤ text-xs); `NotificationCentreButton.tsx` (:160 black/40→/55, :90 /60→/70, :167 emerald-50/55→opaque); website-editor editor components (EditorFunnelStage/PagePickerToolbar/EditorTopBar/TemplateGallery — cream/30–/55 → /70). Darker/opaque only, no layout change. **Verify browser at 1280×800 + dark theme (editor).**
- **U2** *(medium risk — reflow at 375px)* Dense controls to 44×44 — `_ActionsWorkspace.tsx` (:1206/1207 prev/next/add, :948, toolbar, chips), `_NotepadWorkspace.tsx` (:409/419/420/456/457/414), `_PhaseCardActions.tsx` (:60-66/117-122), `NotificationCentreButton.tsx` (:198/202/228/240). **Verify browser at 375×812, 390×844, 812×375 — check no h-overflow in the notification panel.**
- **U3** Add a light-mode `:focus-within` ring on universal search wrapper (mirror dark rule `globals.css:1324`) — the `!important` outline removal at :1315 leaves no visible focus.

### Jargon → plain
- **J1** Plain-language radar correlation/coverage causes — `radarCorrelations.ts:103` ("The commercial engine…" → plain), :26/39/71/83 (telemetry/instrumentation/ingestion → plain); `radarCoverageRegistry.ts:54/57`. **Precondition:** confirm `smoke-marketing-intelligence.test.ts:261` does NOT assert the literal "commercial engine" string first.
- **J2** Wrap `{issue.domain}` in `domainLabel()` — `AssistantWorkspace.tsx:619` (helper at `_radarShared.ts:20`). Confirm no test pins raw value.
- **J3** *(optional)* Tuck raw IDs in `RadarInspectionWorkspace.tsx` behind a "Technical details" disclosure (debug inspector — low value).

### Config / onboarding (doc-truth + honest-label)
- **C1** Remove inert "Staff & HR" agency-settings door (`settingsModules.ts:56`) — its only field `canStaffEdit` is unwired; *wiring* it is an Ed security decision.
- **C2** Fix stale/contradicting comments — `settingsModules.ts:25` (drop `leads-pipeline` from "deliberately absent"), `agency-hr/.../SettingsPage.tsx:1-3` (header claims an editor it doesn't render).
- **C3** Retire the permanently-empty customer Bookings route (`src/app/portal/customer/bookings/page.tsx`) — always renders the "not available yet" card.
- **C4** *(verification-only)* Walk the onboarding chain on a `sandbox:fork` lane with dev code `00000` — no secret. Closes the never-walked gap.

### Mounted-browser acceptance batch (code resolved, only local isolated-production walk remains — NOT Ed-blocked)
Radar-Phase-2: #183, #136 (AT-announcement not automatable → done-pending-manual), #143, #152. TODO sweep: #140 (date-only, pure-local first), then #135/#138/#139 (focus/roles/names), #46/#47 (large, proven pattern), #61/#65/#66/#68/#121/#126/#133/#134/#144/#149/#150/#36/#39/#41/#71/#73/#142, #64 (repair dangling rows + accept), #88. Tick-without-work: #147 (already browser-proven). Precondition: #55 needs the broken client-list route fixed first.

## DEFER — needs Ed, or risky/large (do NOT close tonight)
- **Ed decision:** "Dev Editor Engine" → "Website Editor" rename (deliberate 2026-08-20; raise, don't silently change). Security-shaped unwired settings (`canStaffEdit`, `redirectAfterCapture`, `issueSessionCookie`). Wire-or-retire products (Forms/Reservations/Themes/Donation/Funnels/Split-tests) → build-module-or-retire.
- **Ed secret/provider:** all 11 live-integration "passed" tests, `PORTAL_VAULT_ENCRYPTION_KEY` in prod, Meta/Stripe/Calendar/email(Postmark/SMTP)/MCP; live-DB constraint items (#18/#38/#57/#80–85/#87/#132/#25/#54/#120). **HAZARD:** provider "test" calls only stay off-network under Sandbox Mode — confirm `isSandboxDataRealm()` before any local provider flow.
- **Large:** systemic sub-11px text raise (212 files — surgical only, not global); the ~14 vague no-number legacy stubs (trace source per-item); a `npx knip` run for cross-module orphans the website-editor ratchet can't see.

## Couldn't-verify flags (carried in)
- `smoke-marketing-intelligence.test.ts:261` — confirm no literal "commercial engine" assertion before J1.
- Topbar hydration (TODO:123) — render path looks clean; reproduce on `/portal/dev-team` before editing (→ deferred).
- `smoke:all` was NOT run by the audit — run green before AND after each quarantine/edit batch.
- `portalVariantAdapter` registered + calls T3, but an actual starter-variant apply wasn't executed — verify in the C4 walk.
