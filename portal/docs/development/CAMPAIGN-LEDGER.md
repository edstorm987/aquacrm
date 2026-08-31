# Campaign ledger — every documented to-do, verified against source

*Generated 2026-08-30 from a 131-agent triage: one independent read-only investigator
per open item across `todo.md`, `checklist.md`, the LOOP-PROGRESS queue and the named
open issues, each required to cite file:line. **Source code was the authority; the lists
were treated as claims.** This ledger is the deduplicated result and the campaign plan.*

## Verdict counts

| Verdict | Count | Meaning |
| --- | --- | --- |
| unblocked-code | 50 | open, implementable now — no credential, live service or product decision needed |
| partially-done | 40 | some shipped; concrete code work remains (the residue is named per item) |
| needs-live-env-or-browser | 13 | code half done/trivial; honest proof needs a live server or browser walk |
| blocked-on-ed | 11 | needs Ed: a credential, an account, wording, or a decision |
| already-done | 12 | verified complete in source — the list never absorbed it |
| risky-needs-decision | 5 | implementable but architecturally significant; Ed should choose |
| **total** | **131** | |

## Already done — check these off

The lists drifted. These are verified complete in current source:

- **todo:682** — � P0: make session revocation real everywhere. resolveFreshSessionUser() centrally enforces existence/sessionRev/role/membership on every authenticated read; behavioural old-cookie matrix (scripts/smoke-session-revocation.test.ts) passes 16/16 in this triage, external-AI explo
- **todo:860** — � Isolate the showcase fixture. GET /showcase is seed-once (ensurePublicShowcaseWorkspace, never reset) in its own data realm; only reset path targets the private owner slug behind auth; regression pins that the public route can never reset. Residue is doc drift
- **todo:952** — Command Centre nav link → Aqua Tags. 'Aqua tags' shipped 2026-08-20 as a registered sidebar nav item to /portal/agency/fulfilment?view=tags, reachable three additional ways under Ed-approved IA v2 (Operations hub card, quick-search, Fulfilment tab strip). Tick todo.m
- **todo:958** — � `fulfilment` / `fulfillment` three-spelling split. One Fulfilment nav entry, plugin nav re-pointed, legacy Phases item filtered, all two-L URLs redirect-stub to the canonical surface — pinned by smoke-nav-audit. Full one-spelling physical consolidation remains an optional separate
- **todo:959** — Two contacts systems. Canonical pick made and enforced 2026-08-25 (issue #90): agency/contacts Person is canonical; leads-pipeline/contacts deliberately retained as the plugin's import rolodex. Only the checkbox at todo.md:959 and its mirror need ticki
- **todo:961** — Dead code. adapters.ts has two real importers (appConfigAdapter.ts:10, smoke-editor-adapters.test.ts); the agency/sops redirect was repointed to /portal/agency/sop-library, is referenced by nav/proxy/walkers and pinned by smoke-audit-regress
- **todo:969** — `.env.example` missing 3 Supabase creds. Issue #4 fixed 2026-08-27: all three Supabase vars in .env.example, closed by construction via smoke-env-example-completeness (derives required list from productionReadiness.ts); ran 5/5 in this checkout. Stale copies in todo.md:9
- **checklist:1605** — Merge to `main` (Ed's call. PR #3 merged work/2026-08-20-parallel-session into main on 2026-08-23 (commit 8392cca, ancestor of origin/main); main has advanced multiple commits past it. Strike the stale checklist line at next grooming.
- **loop-queue:1** — Scouting journey Stage 1. Scouting Stage 1 shipped in commit 7917318: protected Call/Email buttons, server contactability gate + atomic attempt logging, quota rings/streak on CommandCalendarEntry; 14/14 dedicated smoke tests pass now. Auto-increment delibe
- **loop-queue:2** — Inbox premium messaging pass. Inbox premium messaging pass landed in the 2026-08-30 push (commit 7917318; CLOUD-RESUME.md:31): two-pane redesign in _UnifiedInboxWorkspace + _MasterInbox chip row; sub-12px pin correctly dropped. Adjacent 'inbox URL resync'/'wat

## Implementation waves

Waves are ordered by value and risk; every item inside a wave touches disjoint files so
the work can run in parallel. The full canonical suite is the gate between waves.

### Wave 1 — Money & truthfulness P0s

Highest-value real bugs and false-success claims: send stamped 'sent' on failed delivery (668, leads-pipeline commercial files), unreviewable contracts acceptable + fake 'contract sent' logs (663, closeDeal/portal files), Stripe port that lies available (501, memberships foundation), dispute event double-emit (857, agency-finance), the destructive silent-failure read paths incl. the blank contact editor (600, per checklist:1485's plan — app-wide read files untouched by others this wave), client roles routed into the internal workspace against Ed's recorded decision (390, auth files), and the one-line Kanbans double-render (loop-queue:3). All file-disjoint; the leads-pipeline module smoke suite is touched only by 668 this wave.

- **todo:668** (medium, commerce-payments) — � Respect commercial email delivery results  
  Fully open and exactly as claimed: CommercialService.sendUnlocked() stamps invoice/agreement "sent"+sentAt and logs commercial.sent from any resolved adapter result without ever reading `delivered` (commercial.ts:204-237), and resumePaymentSideEffects() does not even capture the send result before s
- **todo:663** (large, commerce-payments) — � Make Close the deal issue a reviewable, truthfully delivered contract  
  Still fully open and accurate: closeDealForClient creates the contract directly with status:"sent" with body optional (title-only possible), the close-deal route never invokes any email delivery yet logs "contract sent + invoice issued", both close forms collect no terms/document, and the customer p
- **todo:501** (large, commerce-payments) — � Finish the paid Memberships foundation adapter  
  Every claim is still true in source: the runtime foundation's stripeFor() unconditionally returns a throwing NOOP stub, so isStripeAvailable() is a false positive, paid Silver/Gold seed failures are silently swallowed leaving only free Bronze, and the healthcheck reports ok:true from row counts with
- **todo:857** (small, commerce-payments) — � Make Stripe refund/dispute event handling durably idempotent  
  The core shipped 2026-08-26 under issue #119: refund and dispute records are durably idempotent across processes via provider-id-derived record ids (not the process-local set, which survives only as a warm-process cache), cumulative Stripe amount_refunded converges to the missing delta, activity is 
- **todo:600** (x-large, other) — � Stop read failures becoming “none,” stale or “clear”  
  Issue #57 is still fully open: nearly every named read path still converts a rejected read into truthful-looking empty/default data, including the destructive blank contact editor and the zero-outstanding/"Operations clear" finance path. No availability-state work has shipped since the 2026-08-26 au
- **todo:390** (medium, auth-recovery) — � Finish role-aware account and portal recovery navigation  
  Agency-staff Account/Permissions are fixed (#92) and the 27 Aug Phase 18 work made the ProfileMenu and /portal index role-aware for the client-portal audience, but the Account back-link and guidance still send client/freelancer roles to /portal/agency, the portal 404 remains hardcoded to "Agency das
- **loop-queue:3** (small, journey-crm) — Journey Kanbans tab + custom boards  
  The Journey Kanbans tab and custom boards shipped in commit 7917318: the desk component with manage-gated create/delete, the DESKS entry and render branch, the boards/cards APIs with the custom-only wall, the real drag-drop CustomBoardWorkspace for custom boards, and data-testid="pipeline-columns" p

### Wave 2 — Durable delivery & concurrency

Second tier of truthfulness/data-safety: honest campaign delivery (99 — takes the leads-pipeline suite after 668 lands), upload lifecycle registry + compensation + batch-cap honesty (656, upload routes + privateUploadStorage), real affiliates Stripe Connect port + capability gating (506, foundation adapters — after 501 released _crossPluginPorts), cross-instance CAS for marketing records (104), CompanyProfile 409 concurrency + review lock (770 — sole company.ts/types.ts toucher this wave), and the revisitable install-help extraction (394, customer setup/support files). Disjoint files throughout.

- **todo:99** (large, marketing-campaigns) — � Make campaign delivery truthful  
  Fully open and exactly as claimed: CampaignService.send() only enqueues outbox rows, stamps leads contacted and finalises status "sent" without ever invoking DeliveryService, no worker drains the queue, and CampaignsPage auto-enables email-sender then reports Boolean(install.enabled) as readiness. T
- **todo:656** (large, uploads-media) — � Make all private uploads/deletes transactional and retryable  
  Fully open, nothing shipped: all nine private-upload routes still write storage before the owning record with no compensation, the four record-delete paths still swallow provider errors and report success, staged inbox/expense/campaign objects have no record or expiry, and the product-workspace batc
- **todo:506** (medium, commerce-payments) — � Wire Affiliate Stripe Connect or stop offering it  
  Still open and accurate: the live foundation registration (src/built-ins/runtime/foundation-adapters/affiliatesFoundation.ts:18-25) supplies six ports but never stripeConnect, so onboarding/refresh/webhook/transfer all 422 while the customer CTA renders unconditionally and the admin transfer button 
- **todo:104** (medium, marketing-campaigns) — � Make Marketing asset/profile persistence concurrency-safe  
  The headline defect is fixed: Channels/Funnels assets and Customer profiles no longer replace whole arrays — they persist as independent by-id rows with tombstoned deletes and legacy-array merge, mutations serialize per agency+collection, and all three mounted editors send the updatedAt they opened 
- **todo:770** (large, radar-command) — � Version Battle Table writes and retain completed review history  
  Still fully open: every Battle Table station and the Company workspace PUT a whole CompanyProfile that the server merges last-write-wins with a fresh Date.now() updatedAt and no version compare, and Quarterly Review "Lock review" is reversible — any edit of a completed review silently flips it back 
- **todo:394** (medium, auth-recovery) — � Keep customer installation help revisitable  
  Fully open: the install scene still promises "it is in your portal under Support" (src/app/setup/_CustomerSetup.tsx:256) while SupportView (src/app/portal/customer/_CustomerPortalViews.tsx:1514-1544) offers only request/email/phone/WhatsApp and no install help exists anywhere under /portal/customer;

### Wave 3 — Contract integrity & dependency safety

Integrity gates: acceptance bound to immutable sent versions (672 — commercial.ts/domain.ts free after waves 1-2), graph-aware capital-plan validation (763 — company.ts free after 770), SOP delete dependants preview (757, decision-free wiring only), plan/affiliate delete inventory wiring into DELETE/confirmation (751, wiring only — policy stays with Ed), plugin-health persistence + Radar honesty (641), Sentry/observability mount + readiness honesty (386), shared voice-recorder helper with compensation (441, inbox), and email-sender vault/config unification (635 — sole pluginSecretConfig/catalog toucher this wave). Pairwise disjoint.

- **todo:672** (large, commerce-payments) — � Make commercial proposals immutable once sent/accepted  
  Fully open: acceptance is still not bound to an immutable sent version. accept() sets accepted unconditionally with no sent-state check, save() replaces line items/totals/cadence/agreement text while preserving accepted status, acceptedAt and the old Stripe Checkout id/URL, the public token is minte
- **todo:763** (large, governance-compliance) — � Enforce Company capital/governance register invariants  
  Issue #65 is fully open and the claim is accurate in current source: updateCompanyProfile() still pushes the nested capital plan through independent shape/range cleaners with no unique-id enforcement, no reference resolution (owner/class/approval/document), no paid-within-declared or allocation-reco
- **todo:757** (medium, cleanup-dedup) — � Make SOP retirement dependency-safe  
  The decision-free prerequisite shipped 2026-08-27: a dependency inventory (src/engines/sop/server/sopDependencies.ts) covers all nine SOP reference sites across seven owning types (four nested), pinned by smoke-sop-dependencies (6/6). But nothing consumes it yet: deleteSopRecord is still literally `
- **todo:751** (medium, commerce-payments) — � Make Membership/Affiliate retirement dependency-safe  
  The measurement prerequisite shipped 2026-08-27: dependency inventories for both modules exist and are test-proven (planDependencyInventory reporting billableSubscribers/wouldBecomeUnreachable; affiliateDependencyInventory reporting hasFinancialDependants/activeReferralCodes), but nothing consumes t
- **todo:641** (medium, plugins-platform) — � Run and persist plugin healthchecks  
  The "no caller" half is fixed: /api/portal/plugins/health (built 2026-08-28) runs every enabled install's healthcheck with a 5s timeout, converts throw/timeout into an unhealthy row, treats no-hook as supported:false, and is displayed via src/lib/chrome/pluginHealth.ts in DevConsolePanel — all test-
- **todo:386** (large, other) — � Mount and prove real application observability  
  Fully open: observability.ts and requestLog.ts still have zero production callers, @sentry/nextjs is absent from package.json and node_modules, productionReadiness marks monitoring ready from a DSN env string alone, error.tsx claims "We've logged the issue" after only console.error, and the green sm
- **todo:441** (large, inbox-comms) — � Harden voice and call recording across browser formats and failures  
  Open and unchanged: all four recorder sites still hardcode the WebM fallback without testing it or MP4/browser-default, every produced file is named .webm regardless of the actual recorder MIME, voice-note constructor failures are still reported as "Microphone access was not granted" while leaking t
- **todo:635** (medium, inbox-comms) — � Build the missing Email Sender setup flow  
  The backend half has shipped since the item was written — truthful no-send provider (#34 resolved), a real SMTP driver alongside Postmark, a complete role-gated provider/identity/test/webhook API layer with honest unconfigured/error/active readiness states, and a generic PluginSettingsPanel now moun

### Wave 4 — Honest surfaces & platform wiring

Remaining correctness with lower blast radius: installment invoice-id dedupe + exact remainder (677 — last leads-pipeline slot), legal-register delete guard (777 — company.ts/_CapitalOwnershipWorkspace free after 763), governance company scoping (783), PluginSettingsPanel mounting for the three read-only client-scoped modules (715), the editor dead-endpoint repointing/gating lanes A (68), Infra-probe hoist + failure isolation (383, cron/radar files), byte-range media (437 — privateUploadStorage free after 656), and provision/publish/deploy idempotency (651 — types.ts/storage.ts free after 770). Disjoint within the wave.

- **todo:677** (medium, commerce-payments) — � Make Stripe installment completion exact and retryable  
  The "cancellation failure ignored while webhook returns success" leg is fixed: the final-installment cancel_at_period_end call is now response-checked and answers 502/503 on failure with a stable idempotency key, so Stripe redelivers and retries. Still open: the stop condition counts any payment wit
- **todo:777** (medium, governance-compliance) — � Make legal-document retirement dependency-safe  
  Fully open and verified in source: mounted legal-register Delete removes only the register row with no dependant inventory (Finance obligations keep linkedLegalDocumentId, governance decisions keep documentId), the confirmation names only doc+file, and provider-file deletion errors are suppressed. T
- **todo:783** (medium, governance-compliance) — � Make Governance scope truthful across every view  
  Still open and accurate: buildGovernanceSnapshot scopes only the compliance posture and HIPAA flag by the selected company, while legal register rows, declarations, sub-processor agreement flags and erasure clients stay agency-wide, and a failed scope reload leaves the old company's snapshot labelle
- **todo:715** (medium, plugins-platform) — � Finish or remove manifest plugin settings  
  The item's central claims are stale: since the 2026-08-24 audit the agency Settings hub now mounts the generic PluginSettingsPanel for all four agency-scoped settings modules (Finance, HR, Marketing, Email Sender) via a cog-per-workspace ModulesPane, ecommerce mounts it client-scoped, and the 25 dea
- **todo:68** (large, website-editor) — � Repair the website-editor API contract before calling the editor  
  The honesty/coverage layer shipped (2026-08-28 audit): a module-aware route-table ratchet test resolves every literal editor fetch against the real route tables and pins 31 known-dead endpoints, and the Funnels creator is labelled and disabled via a featureBackends gap registry. But the contract its
- **todo:383** (medium, radar-command) — � Make Radar scheduling match its taxonomy  
  Open and implementable now. The daily cron/inbox loop still reruns the app-wide Infra probe inside every per-agency runRadarScheduledSweep call, an Infra failure still aborts that tenant's evidence rollup (no retry until the next day), the Evidence sweep still declares an hourly cadence while actual
- **todo:437** (medium, uploads-media) — � Add provider-aware byte ranges to private media delivery  
  Open and untouched: all three private-media content routes (inbox attachments, call recordings, SOP media) ignore the Range header, always answer 200 with the full object, and the local/Supabase paths (plus inbox Vercel path) fully buffer it; no 206/416/Content-Range/Accept-Ranges code exists anywhe
- **todo:651** (large, website-editor) — � Make project provision, GitHub publish and Vercel deploy retry-safe  
  Fully open and accurately described: provision commits a local git repo before the client record is durable (retry mints a -2 sibling via uniqueProjectPath), publish creates the GitHub repo before remote/push/save (retry collides), deploy creates the Vercel deployment before its id is recorded (retr

### Wave 5 — Accessibility & PWA

The a11y block shares one wave by design: modal focus-trap primitive + sweep (397), tablist/menu/listbox keyboard models (412), accessible-name bundle (417), and PWA icons/install-prompt (430). 397/412/417 overlap a few workspace files (_ActionsWorkspace, company panels) — assign one coordinating agent or sequence those three internally. checklist:1240 (Playwright browser matrix) rides along on fully new files and gives the a11y work its future automated gate. 430 touches _CustomerSetup after wave 2's 394 has landed.

- **todo:397** (x-large, a11y) — � Standardise true modals on an accessible keyboard contract  
  Fully open and has drifted worse: 57 TSX files now declare aria-modal="true" but only 3 use the existing useFocusTrap hook, leaving 54 untrapped modal files (the todo says 47), and only 6 of the untrapped files even mention Escape. The hook and a proven exemplar (ConfirmDialog: trap + deliberate ini
- **todo:412** (large, a11y) — � Standardise tabs, menus and listboxes or remove their specialised roles  
  One named slice of issues #138 shipped via the settings restructure: the Settings tablist (whose aria-controls pointed at nonexistent settings-pane-* ids) was replaced 2026-08-30 with an honest nav rail (aria-current buttons) plus a native grouped select, i.e. the "remove the misleading roles" remed
- **todo:417** (medium, a11y) — � Give icon actions and published-form fields stable accessible names  
  Two slices are shipped beyond what the todo records: the shared avatar input is named "Upload profile photo" (pinned by a test) and the Development reveal/copy-password buttons now carry per-resource aria-labels with a role="alert" error. Everything else in the bundle is still open in source: Team a
- **todo:430** (medium, other) — � Ship a Chromium-installable customer manifest  
  Fully open and accurately described: public/ has no 512px icon (only 32/180/192), manifest.webmanifest declares 192/180/32 with the transparent 192 reused as "maskable", the smoke test asserts only standalone/start_url/the word "maskable", and InstallStep calls prompt.prompt() without awaiting userC
- **checklist:1240** (large, a11y) — P2  
  The claim's diagnosis is still accurate — smoke-ux.mjs puts 375/768/1280 only in a User-Agent string and does server-HTML substring checks — but two of the bundle's three parts shipped: the script is explicitly reframed/retained as markup smoke, and the one concrete defect the manual browser pass fo

### Wave 6 — Website-editor honesty & small fixes

Editor/product truthfulness on disjoint files: block honesty + dead /api/contact default (77 — block files free after wave 5's 417 touched the form blocks), hydration-stable ShareButtons/Breadcrumb via ElementContext (433), war-room pulse tied to persisted CommandKpi targets + todo tick (940), radar probe-staleness surface (#170 — radarSweeps free after 383/641), clone-from-remote for the preview stack (#19, code half only), shared activity vocabulary + Updates-tab adoption (960), and the lead-archive fault-injection test (746, one test file).

- **todo:77** (large, website-editor) — � Stop publishing dead interactive blocks  
  The "label/remove until the backend exists" half of issue #29 shipped and is ratcheted: all nine dead native blocks (contact/forms/booking/newsletter/theme/blog x2/product-search/donation) are in BLOCK_BACKEND_GAPS, the palette refuses to add them, templates no longer seed them, an action-less form 
- **todo:433** (small, website-editor) — � Remove render-time `window` from published current-page blocks  
  Fully open: both published blocks still branch on `typeof window` during render — ShareButtonsBlock encodes an empty share target on the server when `url` is blank, and auto BreadcrumbBlock server-renders null then builds a full nav from window.location.pathname on the client, a hydration divergence
- **todo:940** (small, radar-command) — Battle Table overhaul → live war-room  
  The war-room reframe is SHIPPED and test-pinned: _battleWarRoom.ts implements the pure model (buildBattlefield/buildWarRoomDecisions/buildWarRoomPulse etc.), _BattleTableWorkspace.tsx makes "warroom" the default section with the three zones and the 10 planning sections demoted to drill-in stations (
- **issue:#170** (medium, radar-command) — #170 Radar probe cron is daily so evidence can be 24h stale with no surface saying so  
  Issue #170 is still OPEN and accurately described: vercel.json schedules /api/cron/radar-probes daily (15 6 * * *), the exact schedule is pinned by smoke-radar-sweeps, and no Radar surface states probe-evidence age — infra checks stamp themselves with the Pulse's `now` and ignore the snapshot's real
- **issue:#19** (medium, website-editor) — #19 Dev Workspace  
  The item's claim is accurate but understates what already shipped: issue #19's source/regression half is RESOLVED (dirty-buffer/abort/discard guards, stale-preview state machine, editor chain 154/154), and phase 17 has since landed isolated per-project worktrees plus fingerprinted dependency-install
- **todo:960** (small, inbox-comms) — Two inbox surfaces  
  Confirmed in source: the two surfaces are NOT redundant pages — agency/inbox is the merged Master Inbox command surface (Needs-you/Inbox/Updates, 2026-08-30 inbox merge) while agency/activity-inbox is a standalone read-only system-history log, and they deliberately cross-link with test pins. But the
- **todo:746** (small, journey-crm) — � Make lead archival recoverable and card-safe  
  Issue #62 shipped 2026-08-27: archive/restore/purge are three honest verbs — archive keeps the row, index and identity pointers while removing the pipeline card and remembering its column; restore re-creates the card in the column it left; purge is the old hard delete, gated behind archive-first — v

### Wave 7 — Hygiene sweeps & governance build-out

Cleanup/consistency kept separate from feature waves: the 403-vs-404 tenancy-first sweep (#168 — MUST land as its own isolated PR with a full suite run, per the issue; its ~30 api/tenants files touch nothing else in this wave), personInteractions rename (962), remaining read-path mutation removals (1842), single capability-policy module deriving proxy/nav/page gates (1593), tenant-scoped production readiness (1961), global-error.tsx (427 — smoke-observability free after 386), the governance KNOW build-out slices: breach register, consent/ROPA, IP register (941 — governance files free after 783), and static-export renderer parity (85 — pageTemplates free after 77).

- **issue:#168** (medium, cleanup-dedup) — #168 28 routes answer 403 where the house convention is 404  
  Still open and unchanged since it was recorded on 2026-08-27: the element gate (requireCurrentClientWorkspaceElementAccess) throws AuthError 403 on a cross-tenant/nonexistent client id (ceiling-denied → hidden → 403), and roughly 28-33 route files still call that gate BEFORE their own getClientForAg
- **todo:962** (medium, cleanup-dedup) — The rest  
  The bundle has substantially drifted: the "empty preview placeholders" claim is dead (both are real authenticated routes), the twin-filename hazard was resolved 2026-08-20 via Service-suffix renames (one straggler: personInteractions), and email-sender drivers are real implementations (only sendgrid
- **checklist:1842** (medium, other) — Read paths perform hidden writes and expensive work. A TypeScript  
  The checklist text is stale 2026-08-24 prose (28 GETs / 26 renders). Since then the inventory was rebuilt as a source-derived, declared-and-ruled guard (smoke:read-path-mutations, verified passing 16/16 today, unruled backlog pinned at zero), and the biggest writes were removed: team-channel creatio
- **checklist:1593** (medium, governance-compliance) — P1  
  The checklist text is stale: the concrete Team Chat break is fixed — src/proxy.ts now allowlists 14 staff API roots (not five) including /api/portal/team-chat, plus three delegated staff agency-page roots, and the team-chat route's agency-staff access therefore runs; TeamChat's response-ordering rac
- **checklist:1961** (large, governance-compliance) — Env-only audit. Every setting that needs a redeploy to change cannot  
  The checklist's core claim is stale: the env-only audit list DOES exist — docs/workspace/env-and-sellability.md is a full baseline inventory (17 vars with no in-app path, fix shapes, work order), and two of its five day-one env leaks are since fixed (transactional email send gate, enquiry notificati
- **todo:427** (small, other) — � Mount the actual root-level error fallback  
  Open and verified in source: src/app/error.tsx exists as the route-segment boundary (mislabelled "top-level"/GlobalError in its own header), but no src/app/global-error.tsx exists, so Next 16 serves its builtin fallback for root-layout/App Router failures. Writing the global-error.tsx contract file 
- **todo:941** (x-large, governance-compliance) — Operations / System surface  
  The Operations/KNOW surface exists and is much further along than the todo claims: a Governance workspace (commit 4943737, 2026-08-20) sits in the Operations sidebar panel with six views (Posture, Legal register, DPO/erasure, Subject requests, Sub-processors, Security), backed by the honesty-enforce
- **todo:85** (medium, website-editor) — � Repair website export before offering it as a backup or migration  
  Two of the three legs are fixed in committed source (main 25eae14, 2026-08-29): the export handler is now registered at /api/portal/website-editor/export and the Customise button calls it (resolving siteId via the real /sites route) instead of the absent /api/admin/export-code; contact-form blocks n

### Wave 8 — Flagship feature builds

Large product builds each owning a distinct area: element-engine P5 widening then P6 assistant composition (1945, engines/editor/elements), Command Centre regrouping + progressive disclosure (loop-queue:4 — Stage 0 asks Ed if the lost design doc survives, but the staged build itself is unblocked; owns _CommandIntelligenceWorkspace/_BattleTableWorkspace this wave), website demo Stage 1 behind a flag (loop-queue:6, (website) routes), and the unblocked You-Deserve-It phases (944 — sole types.ts/storage.ts extender this wave; 941 landed in wave 7). Ordered after bug waves; four x-large/large items keeps merge risk low.

- **checklist:1945** (x-large, website-editor) — Engine widening + assistant proposals (P5, P6). ~5 days. After this an  
  Genuinely open, and correctly ordered after the shipped P1-P3 foundation. The shared element registry exists and the portal palette is derived from it, but the widening is unfinished (two live block registries, three styles-to-CSS mappers, the "stage" surface has zero consumers) and no assistant com
- **loop-queue:4** (x-large, radar-command) — Command Centre regrouping + progressive disclosure  
  Not started: no regrouping/progressive-disclosure code exists (CommandPanelShell appears only in docs, never in src; the station nav is still the flat 4-station layout; no updates.md entry). Both judge flags check out against source — the attention-protection strings are real pinned contracts and th
- **loop-queue:6** (medium, marketing-campaigns) — Website demo Stage 1  
  Nothing of Website demo Stage 1 exists yet: there is no /for-agencies route, no terms/privacy page shell, no demo-gate form, and no gating flag anywhere in src. The item was scoped precisely so the build does NOT wait on Ed — Q5 says "build proceeds behind a flag" and only the gate going live needs 
- **todo:944** (x-large, journey-crm) — "You Deserve It" upgrade  
  The bones the item describes are real and one connective-tissue slice — gift cost → approval-gated finance expense — shipped 2026-08-19 and is pinned by a smoke test; everything else (meaningful dates, real deserve indicators, multi-supplier trips, supplier ordering, why-ledger, client-workspace pan

### Wave 9 — Polish, plain-English & docs reconciliation

Final polish and bookkeeping once the code waves have settled (so docs sweeps record the true final state): shared InfoTip + per-surface plain-English pass (loop-queue:5 — touches _CommandIntelligenceWorkspace/_MasterInbox after waves 6-8 finish with them), perf re-measure + docs accuracy sweep + demo-PII compliance check (loop-queue:7), plan backfill/archiving (1982), and the checklist:673 truth-up (its AI/service-principal fragment stays parked pending Ed's confirmation). lq7/1982/673 all edit checklist.md — coordinate or sequence those doc edits within the wave.

- **loop-queue:5** (x-large, other) — Info icons / plain-English pass app-wide  
  The app-wide info-icons / plain-English pass has not started as a systematic effort: no shared info-icon/tooltip component exists anywhere in portal/src (no InfoTip/InfoIcon/Explainer in portal/src/components/ui/, which holds only CollapsibleSection, ConfirmDialog, EmptyState, ErrorBoundary, Loading
- **loop-queue:7** (large, governance-compliance) — Performance re-measure + docs accuracy sweep + data-compliance check (demo PII → governanc  
  All three bundled concerns are still open and none is recorded as done anywhere: perf numbers newer than pre-27-Aug do not exist, no docs accuracy sweep is logged after the 2026-08-30 shipping wave, and the demo-PII-vs-erasure compliance check has never been performed — and it has real substance, si
- **checklist:1982** (small, docs-only) — Backfill phase ticks on 14 shipped plans reading `0/N`, then archive  
  The item's premise has largely drifted: parser fixes already shipped (Format B "Phasing" and Format C bold-phase parsing in devTeamTasks.ts) recovered several plans that falsely read 0/N (e.g. radar-upgrade now 7/7), and of the 15 top-level plans that still parse to 0/N today, only two are shipped b
- **checklist:673** (small, governance-compliance) — Application-wide parity. Classify the remaining module catch-all, freelancer-job  
  Five of the six clauses shipped on 2026-08-27 and verify in source today: the module catch-all is classified and enforced, freelancer-job/task/task-template client associations are classified and gated, the three competing HR/freelancer routes converged onto staff.people, and named alternative autho

## Blocked ledger — needs Ed, a live environment, or a decision

| Item | What it is | What it needs |
| --- | --- | --- |
| todo:90 | � Retire or finish the legacy Website Editor admin islands | Ed's per-surface decision: retire vs unify for the browser-local Sites registry, Sections, Popup, Customise, and Page Detail (option b measured at ~20 sync fns / 27 call sites / 3,297-line SitesPage). |
| todo:646 | � Make Build custom portal reach a real service | Ed's backend-direction pick before any code: (a) promote the complete-but-unwired github-templates/modules/portal-export into a runtime plugin, (b) re-point the wizard at clientProjectProvisioner, or  |
| checklist:1951 | Wizard engine. Generalise the 711-line Aqua Tag setup into steps/UI/ | Ed's call on the wizard-engine cluster: sequencing vs the other ~5-day engine projects (explicit 'do not start P6 first' warnings, overlap with stages-hold-elements), and the product/safety decision o |
| issue:#174 | #174 revoking an identity LAST grant returns them to un-migrated legacy access so revocati | Ed's pick among the three recorded options for last-grant revocation falling back to legacy manage: (1) warning on revoke, (2) sticky persisted governed marker (identified safe default, but forecloses |
| todo:942 | Advisor omega upgrade | Ed's Advisor 'omega' vision: the #1 missing capability, whether to keep the read-only + human-accept safety contract, and one flagship upgrade vs several. Plan doc is deliberately empty until he answe |
| todo:953 | Meta / Instagram inbox | Ed to create the real Meta Developer app and enter App ID / App Secret / verify token via the built Connect-now surface on an HTTPS deployment, then the live OAuth + webhook walk. Code is complete and |
| todo:968 | Aqua Tag form-capture consent | Ed's compliance decision (DPO/solicitor-class): legitimate interest for form-capture field values vs gating capture on consent. Related issue #3 inherits the same call. Implementation either way is sm |
| todo:971 | Ed's GitHub credentials for the Dev Editor publish walk | Ed's real GitHub credentials entered via the editor Settings GitHubConnectPanel, then a browser walk of save → diff → commit → PR → merge on a throwaway branch, recorded in dev-editor-finish phase 17. |
| checklist:1610 | Walk the onboarding chain once, on your own data: client → connection | Ed personally, in a real browser on his own data: create client → connection link → sign in → confirm code → see portal (dev code bypass 00000 available; real delivery needs a connected sender). No co |
| checklist:1614 | Stripe live-account walkthrough: `stripe@22.5.0` is now installed; the | Ed's real Stripe keys (secret + webhook signing secret) entered via the Finance settings panel, then live Checkout + signed HTTPS webhook walk on a deployed endpoint. |
| checklist:1620 | Meta Developer app + real HTTPS OAuth/webhook walk. No `META_*` values | Ed's Meta Developer app (App ID, App Secret, verify token) entered via the encrypted connections panel, then the live HTTPS OAuth connect + webhook verification walk. |
| checklist:1622 | Deployment env verification. Local presence is proven for session, | Ed's Vercel account: confirm session/vault/Supabase/Resend/Stripe/OpenAI env names for Production, add CRON_SECRET, then run npm run smoke:post-deploy against the live deployment. Optional small harde |
| checklist:1625 | Apply the pending Supabase migrations before production rollout, | Live Supabase/Postgres credentials (DATABASE_URL or linked supabase CLI) plus Ed's production-rollout go-ahead to apply the 22 pending migrations, then run the DATABASE_URL-gated cross-process test. |
| checklist:1629 | DPO sign-off on the erasure retention schedule. | Ed to engage a DPO/solicitor to rule on the retention schedule (which categories are RETAIN, legal-hold time-box — DPO pack Q1). Follow-on code (expiry/purge for the RETAIN set) unblocks only after th |
| checklist:1947 | Stages hold elements | Ed reserved this build for himself ('I want to personally build the client portal states'). Needs his stage/element design (the 'stunning standard') and an ordering go-ahead vs P5/P6. Mechanical plumb |
| checklist:1984 | Re-enter the Aqua Tag routing config production lost (master site key, | Ed to re-enter unrecoverable production routing data (master tag site mapping, per-site source-to-client routing, site configs, enquiry contact details) in the deployed instance. Wrinkle to tell him:  |
| todo:402 | � Make the Command Centre wait announce itself | Real-browser accessibility-tree/screen-reader walk of the /portal/agency loading transition (announce once, clean removal, focus continuity). Fold into the issue #137 browser matrix (built in wave 5 v |
| todo:584 | � Finish Notepad autosave browser acceptance | Live authenticated browser walk on :3032 notepad: route change + tab exit with dirty drafts (beforeunload + keepalive), offline/refused save → Retry, reload convergence. Then tick checklist:1463 / tod |
| todo:589 | � Finish phase-transition browser acceptance | Quiet live lane (sandbox:fork) + browser walk of a phase transition through all three mounted controls with one forced retryable incomplete, confirming saved details and convergent retry. The 2026-08- |
| todo:624 | � Mounted-accept the settled utility actions | Mounted browser walk with forced fetch/clipboard rejection across Task Templates, Development toolkit, Search Console, and Copy Tag; requires the dev server actually serving (recorded blocker: :3032 a |
| todo:985 | � Free a server + verify the critical flows for real | (1) Live server + browser walks: seeded connect-code journey, enquiry inbox arrival, Aqua Tags detect against Ed's real tagged domain; (2) Ed's open decision on writing one labelled test enquiry to li |
| checklist:666 | Release browser gate. Complete the real two-user/two-project/two-environment | Live env + real browser with two concurrent authenticated users driving the full access-manager journey, stale-session replay, exact-client positive journey, and edit/AI/diff/reload/PR + preview failu |
| checklist:1924 | Full browser authoring round trip | Live browser acceptance of the full authoring round trip (select → exact words → patch → diff/save → tests → draft branch → publish/PR/merge + failure recovery, Librarian, throttle); publish/PR/merge  |
| checklist:1929 | Unsaved-work and project-prefill browser matrix | Headed browser on a sandbox:fork lane: type real dirty state and exercise every destructive transition, proving window.confirm fires before state destruction and cancel preserves work. Acceptance only |
| issue:#162 | #162 in-pane repeat navigation HMR stall. | Interactive browser session against a production build (npm run build + start, no HMR) to walk repeat in-place navigation of /portal/dev-workspace routes and close the phase-18 acceptance gap. Harness |

## Duplicate map

The same work appears in more than one list 39 times. Canonical id first:

- **todo:68** ⟵ checklist:1311 — Same website-editor dead-endpoint contract repair (Split tab gating, promote stub, PublishModal/SitesPage legacy routes, image-variations gating).
- **todo:77** ⟵ checklist:1323 — Same dead-native-blocks / Membership-Affiliate-Donation block honesty bundle; 1323 adds the blockRegistry /api/contact default kill — fold into todo:77 scope.
- **todo:85** ⟵ checklist:1333 — Same static-export renderer parity work (hero/cta/testimonials/product-grid, first-party template fidelity test, stale r033 pin).
- **todo:90** ⟵ checklist:1340 — Same localStorage-backed Sites/Sections/Popup/Customise/PageDetail bundle. Verdicts conflict: 1340 says the Sites slice is unblocked (server /sites CRUD exists 
- **todo:99** ⟵ checklist:1351 — Same campaign-send honest-delivery fix (enqueue-only send stamped as sent; readiness = Boolean(install.enabled)).
- **todo:383** ⟵ checklist:1227 — Same radar sweep fix: hoist Infra probe out of per-agency loop, failure isolation, cadence honesty, call-count tests.
- **todo:397** ⟵ checklist:1231 — Same modal focus-trap sweep (shared dialog primitive + migrate ~51-54 untrapped aria-modal files + sweep test).
- **todo:412** ⟵ checklist:1245 — Same tablist/menu/listbox keyboard-model work; 1245 confirms the Settings aria-controls sub-defect dissolved in the 08-30 restructure — strike that slice from d
- **todo:417** ⟵ checklist:1250 — Same accessible-name bundle (published form blocks, Command Intelligence ids, run-history row, icon-only buttons).
- **todo:427** ⟵ checklist:1262 — Same missing src/app/global-error.tsx + mislabelled error.tsx header + smoke pins.
- **todo:430** ⟵ checklist:1266 — Same PWA 512px/maskable icons + manifest + InstallStep userChoice/one-use-prompt handling; 1266 notes sharp is available for icon generation.
- **todo:433** ⟵ checklist:1271 — Same ShareButtons/Breadcrumb hydration divergence; prefer 1271's fix path (currentUrl/currentPath on ElementContext, already plumbed to every block).
- **todo:437** ⟵ checklist:1276 — Same Range/206/416 support for the three private-media content routes via one shared helper with provider adapters.
- **todo:441** ⟵ checklist:1281 — Same shared recorder helper: MIME negotiation, extension-from-actual-mime, error taxonomy, compensation on the recorded-call path.
- **todo:501** ⟵ checklist:1358 — Same memberships real StripePort over installed SDK + isStripeAvailable/seed/healthcheck honesty; 1358 details the installConfigWithSecrets wiring.
- **todo:506** ⟵ checklist:1364 — Same affiliates StripeConnectPort adapter + capability gating of CTA/payout controls; live test-mode round trip stays an Ed acceptance gap.
- **todo:584** ⟵ checklist:1463 — Same notepad autosave item — code shipped, only the forced-failure browser walk remains (both needs-live-env).
- **todo:589** ⟵ checklist:1470 — Same fulfilment phase-transition item — code shipped and green, only the mounted three-control browser walk remains.
- **todo:600** ⟵ checklist:1485 — Same issue #57 availability-state campaign; 1485 has the richer plan (checkedJsonRead sibling, destructive paths first) — use it as the spec.
- **todo:624** ⟵ checklist:1522 — Same issue #61 forced-rejection acceptance — code done 5/5, only the mounted browser walk remains.
- **todo:635** ⟵ checklist:1538 — Same email-sender setup-flow work: postmark catalog entry, apiKey secretVault field, vault-routed ProviderService, editable Settings, real verifyDomain.
- **todo:641** ⟵ checklist:1545 — Same plugin-health persistence + Radar honesty work (runner/panel half already shipped in both).
- **todo:646** ⟵ checklist:1551 — Same portal-export wizard fork; 1551 adds that a complete unwired implementation sits in github-templates/modules/portal-export. Both risky-needs-decision — led
- **todo:651** ⟵ checklist:1557 — Same provision/publish/deploy idempotency work (durable operation record, milestone states, reuse-on-retry, fault-injected tests).
- **todo:656** ⟵ checklist:1563 — Same upload-lifecycle registry: state records before provider calls, compensation on delete, staged-object expiry, batch-cap honesty.
- **todo:663** ⟵ checklist:1572 — Same close-deal gate: refuse status:sent without reviewable terms, terms field in both forms, reuse canonical delivery path, acceptance gate.
- **todo:668** ⟵ checklist:1578 — Same commercial send delivered:false truthfulness fix (delivery state on pack/payment, no sent-stamp on failure, retry surface).
- **todo:672** ⟵ checklist:1583 — Same acceptance-version-binding work (version/hash on CommercialPack, sent-gated accept, post-acceptance edit rules, stale Checkout invalidation).
- **todo:677** ⟵ checklist:1588 — Same installment-webhook residue: dedupe by subscription invoice ids, exact remainder allocation, persisted cancellation state, behavioural webhook test.
- **todo:715** ⟵ checklist:1667 — Same PluginSettingsPanel mounting for affiliates/memberships/client-crm + surface-less modules + email-sender split-default.
- **todo:751** ⟵ checklist:1737 — Same plan/affiliate delete-dependency work. Inventories shipped; wiring the preview into DELETE/confirmation is unblocked code; the refuse-vs-purge policy itsel
- **todo:757** ⟵ checklist:1745 — Same SOP-delete work: wire the shipped inventory into a dependants read + confirmation surface (decision-free); the retirement policy stays Ed's (issue #176).
- **todo:763** ⟵ checklist:1752 — Same graph-aware capital-plan validation (unique ids, reference resolution, arithmetic invariants, vote cap, dangling-link guard).
- **todo:770** ⟵ checklist:1761 — Same CompanyProfile optimistic-concurrency (409 on stale updatedAt) + quarterly-review lock immutability.
- **todo:777** ⟵ checklist:1770 — Same legal-register delete guard: dependency inventory mirroring sopDependencies, 409/refuse or archive path, honest file-deletion errors.
- **todo:783** ⟵ checklist:1778 — Same governance company-scoping fix (recordBelongsToCompany on legal rows/declarations/sub-processors/erasure clients + stale-scope handling).
- **todo:857** ⟵ checklist:1863 — Same last sliver of #119: emit disputed event only on creation, report deduped on redelivery, pin with a fresh-seen-set test.
- **todo:402** ⟵ checklist:1236 — Same loading-skeleton live-region item. Code half fully shipped (PortalViewportLoading) — 1236's checkbox can be ticked; only the AT/announcement browser proof 
- **todo:746** ⟵ checklist:1729 — Same lead archive/restore/purge work — shipped and browser-accepted per 1729; the only residue is todo:746's forced-partial-failure test in smoke-lead-archive.t


---

## Bookkeeping — what was ticked, and what was deliberately not

Updated 2026-08-30 after wave 3.

### Ticked in the trackers

Twelve items were found by triage to be **already shipped and never struck
through**. These are now `- [x]` in their own file, because source proves them
done — no code was written for them in this campaign:

`todo.md` 682 (central session revocation), 860 (showcase fixture seeded once,
not reset), 952 (Aqua Tags nav entry), 958 (the fulfilment spelling split's
user-facing half), 959 (canonical contacts pick, enforced in source), 961 (the
`adapters.ts` "dead code" line — it is NOT dead; two real importers), 969
(the three Supabase creds in `.env.example`).

`checklist.md` 1236 (Command Centre loading status), 1605 (merge to `main` —
PR #3 merged on 2026-08-23), 1729 (lead archive is reversible since #62).

`LOOP-PROGRESS.md` queue entries 2 and 3 (Scouting Stage 1, inbox premium
messaging) — both shipped in `7917318`; entry 4's residual double-render was
fixed in wave 1.

### NOT ticked, on purpose

Every item this campaign actually wrote code for is left **unticked**, even
where the implementation is complete and test-pinned. Almost all of them
returned `partially-implemented` for the same two honest reasons:

1. **Browser acceptance is unrun.** This container has no display, so the
   viewport/keyboard/AT walks the items demand (and that `docs/development/tests.md`
   records as the closing step) cannot be performed. Code-complete is not
   browser-accepted, and this repo's own evidence labels forbid conflating them.
2. **A policy or credential is Ed's.** `todo:751`/`757` retirement policy,
   `todo:501`/`506` live Stripe test-mode round trips, `todo:99` durable-worker
   vs synchronous-send product split, `todo:104` database-native version
   constraint (needs `DATABASE_URL`), `todo:386` `@sentry/nextjs` install.

Ticking those boxes would claim the closing evidence exists. It does not.
The per-wave commit messages name exactly what shipped; this ledger names what
each item still owes. Both are more useful than a tick.

### Still open on the trackers after this campaign

`todo:600` (issue #57) is a bundle of roughly fifteen families; eleven are
closed, four are named as untouched in the wave 2 journal and the issue should
stay open. `todo:656`'s staged-object lifecycle/expiry is unbuilt. `todo:386`
has four named open pieces. These are progress, not completion.

---

## Browser-matrix baseline — 2026-08-31, first real run

`npm run browser:matrix` (built in wave 5, `scripts/browser-matrix.mjs`) was run
for the first time against a live dev server: real Chromium 141, 13 pages × 17
viewports, **1,326 checks**. It drives actual layout, focus, axe and the console
— unlike `smoke-ux.mjs`, whose "viewport" was a substring in a User-Agent header.

**Verdict: RED. 352 failing checks.**

| category | failing |
| --- | --- |
| focus (a stop with no visible indicator) | 203 |
| axe (serious/critical) | 85 |
| console errors | 44 |
| failed network requests | 17 |
| horizontal overflow | 3 |

This is a **baseline, not a regression signal** — the gate did not exist before
this wave, so nothing had ever measured these. The failures are overwhelmingly
app-wide rather than anything wave 5 touched: the single most common one,
`button[Working as Owner]` with no focus indicator, is a global chrome control
that appears on nearly every page. Wave 5's own subject — modal focus traps —
is **not exercised at all** by this run, which walks pages without opening
dialogs.

Real defects it surfaced that are NOT accessibility issues:

- `/portal/account` answers **500 from `/api/portal/mfa/enrol`**, twice, on every
  viewport. Multi-factor enrolment is broken.
- `/portal/agency` logs a **React hydration mismatch** — server and client
  markup disagree, and React says it will not patch it up.
- Three genuine **horizontal-overflow** failures, which the house browser rule
  forbids outright.
- A **critical `button-name`** violation on `/` at mobile portrait: a button with
  no accessible name, which is precisely what `todo:417` set out to eliminate.

None of this is fixed here. It is measured, recorded and repeatable, which is
the thing that did not exist before. The follow-up work is its own campaign.

---

## The test harness has two large holes — both pre-existing, both verified

Found while gating waves 4–6, and worth more attention than anything in the
to-do list, because they decide how much every other green result is worth.

### 1. The whole website-editor smoke gate does not run

`npm run smoke:website-editor` fails at import for **every one of its 25+
suites**:

```
src/built-ins/modules/website-editor/src/lib/ids.ts:8
export { makeId, slugify } from "@/engines/editor/elements/ids";
SyntaxError: The requested module '@/engines/editor/elements/ids'
             does not provide an export named 'makeId'
```

**Verified pre-existing**, not campaign-caused: reproduced in a throwaway
worktree at HEAD (`e6307dd`) *and* at the pre-campaign base (`5f0876e`), with
the identical error. The website editor has been shipping with its entire
dedicated gate silently red.

### 2. No built-in plugin's HTTP handlers can be tested at all

Any `@/…` named import from inside a plugin directory resolves to a module
exposing only `default`: the plugin's own `package.json` declares
`"type": "module"` while portal's root declares none, so tsx treats portal
`.ts` files as CJS and ESM named-export linking fails. This is the same root
cause, and it is what the 31 baseline failures are.

The consequence is not "31 tests are red". It is that **every behavioural test
of a plugin's API layer is disabled** — a handler can be rewritten and no test
in the repo will object. Wave 4's `todo:677` hit this directly: its webhook
behaviour had to be moved into the service layer to be testable at all.

### Why this matters more than it looks

Both holes are invisible in the headline number. The canonical suite reports
~5,600 passing, and that is true — but it is passing over a surface that
excludes the website editor's own gate and every plugin HTTP handler. A green
run is weaker evidence than it appears, and no amount of new tests inside those
areas will change that until the module resolution is fixed.

**Recommended next action, ahead of remaining to-do items:** fix the CJS/ESM
boundary (align `type` across the plugin and root manifests, or route the
shared imports through a build-condition-aware entry), then re-run both gates
and see what was hiding behind them.

---

## Browser matrix, run 2 — 2026-08-31, after wave 8

Re-run because wave 8's Command Centre work edits the portal pages the matrix
walks. **It caught a real defect that no unit test could see**, and the fix is
proven by the same measurement.

| category | baseline | wave 8, before fix | wave 8, after fix |
| --- | --- | --- | --- |
| focus | 203 | 204 | 204 |
| axe | 85 | 85 | 85 |
| console | 44 | **188** | 44 |
| network | 17 | **187** | 17 |
| overflow | 3 | 3 | 3 |

### The defect: a broken Edge bundle answering 404 for healthy routes

`src/instrumentation.ts` (added wave 3, `todo:386`) statically imported
`observabilityCapability`, which resolves the optional Sentry package using
`node:module` and `node:path`. Next loads `instrumentation.ts` in **both** the
Node and the Edge runtime, so those Node builtins were pulled into the Edge
instrumentation bundle, which then failed to compile.

A broken edge bundle does not announce itself. It answers **404 for routes that
are completely healthy in source** — the matrix found `/api/portal/chrome/layout`
plus both telephony endpoints 404ing on *every* viewport, which is what took
console from 44 to 188 and network from 17 to 187.

Nothing else caught this. `tsc` was clean, the 5,758-test canonical suite was
clean, and `npm run build` exited 0 — the Edge failure surfaces only as a
warning during build and as a 404 at runtime.

Fixed with Next's documented pattern: the capability probe is now loaded behind
`process.env.NEXT_RUNTIME === "nodejs"`, so it is never bundled for Edge. On
Edge the boot breadcrumb still records, with capability reported as
`unknown-on-edge` rather than guessed. Verified by measurement — the route went
404 → 401 (its correct no-session answer), and the two categories returned to
baseline exactly.

**This is also the leading suspect for the Vercel failure on `cff860d`.** Not
proven: Vercel's logs are unreachable from here, and the local build succeeds
either way. Wave 8's deployment is the test.

### One net-new focus failure, named

`/login` at mobile-landscape now reports `button[Working as Owner]` with no
visible focus indicator, where the baseline run had all 12 stops clean. It is
the same global chrome control already failing across the app, now reaching one
more breakpoint — not a new class of defect.

### The highest-leverage accessibility fix, quantified

Five global chrome controls account for the overwhelming majority of all 204
focus failures:

| control | failing stops |
| --- | --- |
| `button[Working as Owner]` | 130 |
| `button[Open navigation menu]` | 69 |
| `button[Use dark mode]` | 51 |
| `a[Back to website]` | 40 |
| `a[Team settings]` | 34 |

These are a handful of components, not a hundred screens. Giving them visible
focus indicators would clear most of the focus column in one pass — by far the
best accessibility return available, and now measurable rather than guessed at.
