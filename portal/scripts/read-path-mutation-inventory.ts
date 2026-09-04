// The classification issue #21 asks for — reads that can write, and the ruling
// on each.
//
// The issue's remaining instruction is: *"the rest of the 28-GET/26-render-path
// inventory still needs classification and removal or deliberate mutation
// semantics."* The list itself lived in a paragraph of prose written on
// 2026-08-24, and prose cannot notice when the code moves under it.
//
// So the entries below are DECLARED, and `smoke-read-path-mutations` re-derives
// them from source and refuses to pass unless the two match. That makes three
// different things fail loudly instead of silently:
//
//   • a NEW read path that can write — it is not declared;
//   • a path whose CAUSE changed — a different finding wearing the same name;
//   • a path that was FIXED — the declaration is now stale and says so.
//
// ── Ruled by CAUSE, not by path ───────────────────────────────────────────
//
// Eight surfaces reach `ensureDefaultAgencyProducts`. Ruling on each separately
// would be eight copies of one decision, and they would drift. The decision
// belongs to the function that writes; the entry list only records which reads
// arrive at it.
//
// ── The distinction that turned out to matter most ────────────────────────
//
// Almost every open entry here is an IDEMPOTENT FIRST-TOUCH SEEDER — an
// `ensure…` that creates a record if it is missing and returns the existing one
// for ever after. That is not "every page load writes"; it is "the first page
// load that reaches this writes, once". Worth being exact about, because the
// two have very different fixes and only one of them is urgent:
//
//   • on the file backend a single write rewrites the whole state blob, so that
//     first request pays for all of it — the slow-navigation half of #21;
//   • a GET that writes cannot be served from a read replica, cached, retried
//     blindly, or run against a read-only store;
//   • and a read that fails *because it tried to write* fails for a reason
//     nothing in the request explains.
//
// ── What has been closed ──────────────────────────────────────────────────
//
// `listPeopleChannels` used to call `ensureTeamChannel`, so READING the chat
// created the Team channel — and the Radar reaches that from the agency LAYOUT.
// Fixed 2026-08-27: the team channel has a deterministic per-agency id, a read
// gets it unsaved, and the first POST persists it under the same id. The chain
// did not vanish from this file, because one hop further along it reaches
// `releaseExpiredParks`; that is the next thing to rule on, and it is a much
// smaller write.
//
// 2026-08-31 closed three more, all on the same pattern:
//
//   • `ensureProductPortalTemplate` came off THREE renders (a product's page,
//     Fulfilment, and both Portal Studio routes). `productPortalTemplateForRead`
//     builds the template a first touch WOULD create and returns it unsaved,
//     with the same deterministic record and seed-version ids the first real
//     write will persist — so an unsaved template is not a different template.
//     The studio's master came off the same way: `getClientPortalTemplate`
//     already answered with an unsaved Stunning Standard.
//   • `getPipelineBySlug` no longer runs the legacy column migration. It is a
//     pure function now, applied in memory on read and persisted by `addCard`,
//     `moveCard` and `seedDefaultPipelines` — which were already writing.
//     `listCards` reads through the SAME map, or a card left in a retired
//     column would vanish from a board that no longer has that column.
//   • `GET /api/portal/automations` no longer awaits `processAutomationSweep`,
//     so LISTING automations can no longer execute one and email a customer.
//     That is the write the Marketing render lost on 2026-08-27; it survived
//     here because the analyser only inspects GET-ONLY routes and this file
//     also exports POST. Nothing in the derived list below can show that, so
//     `smoke-read-path-mutations` pins it against the route's source instead.
//
// Two of the three re-resolved rather than disappearing, which is the guard
// working: Fulfilment now shows `ensureAgencyMasterSiteKey` and the pipelines
// board shows `installPlugin` — both real writes the removed findings were
// standing in front of.

/** What KIND of write it is — the thing being ruled on. */
export type MutationCategory =
  /** The GET *is* the effect: an OAuth return, an email verification, a token exchange. */
  | "callback"
  /** A scheduled sweep exposed over HTTP because that is how the scheduler calls it. */
  | "cron"
  /** A record written *about the read itself* — an audit trail, a last-used stamp. */
  | "audit"
  /** An idempotent `ensure…` that creates a missing record during a read. */
  | "seeding"
  /** A migration or sweep that runs as a side effect of rendering. */
  | "sweep-on-read"
  /** Installing or enabling a module during ordinary navigation. */
  | "provisioning"
  /** Not yet ruled on. Allowed to shrink; the test refuses to let it grow. */
  | "unruled";

export interface CauseRuling {
  category: MutationCategory;
  /** `deliberate` = this is what it is supposed to do. `open` = issue #21's work. */
  verdict: "deliberate" | "open";
  note: string;
}

/**
 * Functions that MENTION a writer without calling one.
 *
 * A static pass cannot tell `register({ activity: activityPort })` from
 * `activityPort.logActivity(…)`, nor a factory that RETURNS a handle whose
 * `set` writes from one that writes now. Both patterns are load-bearing here,
 * and left alone they carried a write claim up through a dozen callers: the
 * Radar, the company-health snapshot, the whole customer portal, the public
 * proposal page and the agency LAYOUT were all "writes" because a foundation
 * adapter three levels down hands a logging port to a plugin registry.
 *
 * Suppressing the hand-over itself is narrow and checkable. It is also much
 * safer than suppressing the callers, because everything downstream is then
 * RE-DERIVED — and that is not theoretical: with these six removed, the Radar
 * chain did not disappear. It re-resolved onto `ensureTeamChannel`, a real
 * write the foundation-adapter noise had been hiding.
 *
 * Every entry owes a justification, and the test requires one.
 */
export const PASS_THROUGH: Record<string, string> = {
  "src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation.ts#ensureAgencyFinanceFoundationRegistered":
    "Sets a module flag and hands port objects to the plugin registry. Registering a logging port is not logging.",
  "src/built-ins/runtime/foundation-adapters/ecommerceFoundation.ts#ensureEcommerceFoundationRegistered":
    "Same shape: a `registered` flag and a bundle of ports passed by reference.",
  "src/built-ins/runtime/foundation-adapters/publicFunnelFoundation.ts#ensurePublicFunnelFoundationRegistered":
    "Same shape. This one mattered most — it made a PUBLIC route look like a writer.",
  "src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts#ensureLeadsPipelineFoundationRegistered":
    "Same shape. It was why the public proposal page appeared in the inventory at all.",
  "src/lib/server/pluginStorage.ts#makePluginStorage":
    "Returns a storage handle. The `mutate()` sits inside the handle's `set`, which the factory never calls — obtaining a handle writes nothing.",
  "src/lib/server/editing/appConfigAdapter.ts#appConfigEditAdapter":
    "Builds an edit adapter whose apply step writes. Building it is not applying it.",
};

/**
 * One ruling per writing function the reads arrive at.
 *
 * `Direct` in a note means the function calls `mutate()` in its own body, so
 * the write is certain rather than inferred through the call graph.
 */
export const CAUSE_RULINGS: Record<string, CauseRuling> = {
  // ── Flagged, and correctly — but it cannot write ────────────────────────
  // Renamed from `runOne` on 2026-08-30 when the asking moved out of the route
  // into `lib/server/plugins/pluginHealthRunner.ts`, so the radar sweep could
  // run the same hooks on a cadence and PERSIST the answers. The persisting
  // half deliberately did NOT come back here: `runPluginHealthSweep` is the
  // writer and the route still calls only `runInstallHealthcheck`, which is why
  // this stays a read path with one ruling rather than becoming a real write.
  runInstallHealthcheck: {
    category: "audit", verdict: "deliberate",
    note:
      "The plugin-health route (2026-08-28; runner extracted 2026-08-30). It "
      + "invokes a MODULE's own "
      + "`healthcheck`, and `makeCtx` hands every hook that module's real "
      + "read/write storage — so the analyser is right that a write is reachable "
      + "from a GET, and a silent exemption would be indistinguishable from a "
      + "missed finding. It is nonetheless closed: the hook is handed "
      + "`readOnlyPluginStorage(...)`, whose set/del/setIfAbsent/runExclusive "
      + "REJECT rather than write, so a module that tries becomes one unhealthy "
      + "row naming itself instead of mutating on a read. Structural, not "
      + "conventional — the same answer `retention.ts` gives by keeping "
      + "`findExpired` away from `mutate`. If that wrapper is ever removed, this "
      + "ruling is what will look wrong. Not direct: no `mutate()` in its body.",
  },

  markClientFormNoticeSeen: {
    category: "callback", verdict: "deliberate",
    note:
      "Opening a client's enquiry marks it read. The read IS the event, so a "
      + "separate POST would only exist to confirm what the GET already proved, "
      + "and a badge cleared by a second call is a badge that eventually "
      + "disagrees with what was actually seen. One timestamp, written only on a "
      + "successful read and only when unset — a failed fetch must never clear "
      + "the badge, or an enquiry nobody saw disappears. Direct.",
  },

  // ── The GET is the effect ───────────────────────────────────────────────
  createUser: {
    category: "callback", verdict: "deliberate",
    note: "Magic-link verification. The link IS the sign-up; a GET that created nothing would be a broken email. Direct.",
  },
  bootstrapAgency: {
    category: "callback", verdict: "deliberate",
    note: "Google OAuth return for a first sign-in. The callback exists in order to create the tenant. Direct.",
  },
  markEmailVerified: {
    category: "callback", verdict: "deliberate",
    note: "The verification link's whole job, and it can only ever arrive as a GET. Direct.",
  },
  connectGoogleCalendarAccount: {
    category: "callback", verdict: "deliberate",
    note: "OAuth return — the provider chooses the method, and it is a GET. Direct.",
  },
  logActivity: {
    category: "callback", verdict: "deliberate",
    note: "Meta's OAuth return records the connection it has just made. Direct.",
  },
  clientUser: {
    category: "callback", verdict: "deliberate",
    note: "`/api/v1/embed/consume` is a single-use token exchange; consuming the token is the entire point of the call.",
  },

  // ── Scheduled work behind an HTTP door ──────────────────────────────────
  processInboxWebhookQueue: {
    category: "cron", verdict: "deliberate",
    note: "`/api/cron/inbox` — the scheduler calls it with GET. Gated as a cron route, not reachable as an ordinary user read.",
  },
  runRadarInfraSweep: {
    category: "cron", verdict: "deliberate",
    note: "`/api/cron/radar-probes`, and since 2026-08-30 `/api/cron/inbox` too — the app-wide Infra probe moved OUT of the per-agency `runRadarScheduledSweep` and up into the tick, so both crons now call it directly, once each (issues #131). Direct in both. See #170 — Ed's open decision there is the CADENCE, not the write.",
  },
  purgeDeliveredOutbox: {
    category: "cron", verdict: "deliberate",
    note:
      "`/api/internal/sweep?outbox=purge-delivered` — a founder-gated, opt-in "
      + "one-time cleanup added 2026-09-04 for the historic `person.updated` "
      + "outbox flood (delivered events are retained receipts with no pending "
      + "work; the flood had grown to ~40% of the state blob). It is the FIRST "
      + "writer the analyser reaches on this route, so it stands in for the "
      + "route's other deliberate write, `processAutomationSweep` — the "
      + "scheduler's automation tick, still called on every request and still "
      + "pinned by the \"scheduler still owns the sweep\" test. Both are "
      + "deliberate writes behind the same internal `agency-owner` gate; the "
      + "purge is self-flushing so it never leaves an un-flushable patch behind. "
      + "Direct. (See `automationWorkspaceData` for `processAutomationSweep` "
      + "reached from a page render, which is NOT deliberate.)",
  },

  // ── Writes about the read ───────────────────────────────────────────────
  authenticateExternalAssistant: {
    category: "audit", verdict: "deliberate",
    note: "Stamps the external API key's last-used time on all five v1 READS. Kept: a key nobody can tell is live is worse than one write per request — but it does mean the external API cannot be served without writing.",
  },

  // ── Idempotent first-touch seeders ─────────────────────────────────────
  cachedCandidates: {
    category: "sweep-on-read", verdict: "open",
    note: "`/api/portal/search` builds its candidates from `listOperationalAlerts` and so reaches `releaseExpiredParks`. Exposed on 2026-08-27 when `ensureDefaultAgencyProducts` was taken off this route — it was behind that one. Same root as the other expired-park entries.",
  },
  listClientsNeedingAttention: {
    category: "sweep-on-read", verdict: "open",
    note: "The agency home reaches `buildClientRadarFleet` → `listOperationalAlerts` → `releaseExpiredParks`. Same root; exposed by the products removal.",
  },
  buildClientRadar: {
    category: "sweep-on-read", verdict: "open",
    note: "A client's own page reaches the same fleet radar and therefore the same expired-park release. Same root.",
  },
  clearIdentityResolutionReviews: {
    category: "sweep-on-read", verdict: "deliberate",
    note: "Read 2026-08-27: the call is behind `if (session.isDemo && !session.publicShowcase)`, so it only ever runs for a DEMO session and only against the demo fixture. #21 named it (\"the demo Inbox clears identity reviews\") without that qualifier. Demo housekeeping, not a live-data write — a real session never reaches it, and a showcase visitor is excluded explicitly.",
  },
  ensureAgencyMasterSiteKey: {
    category: "seeding", verdict: "open",
    note:
      "Fulfilment's Tags control tower mints the agency's master tag key while "
      + "rendering. Exposed on 2026-08-31 when the portal-template seeder came "
      + "off this page — it was behind that one, the third time this guard has "
      + "re-resolved a chain onto a real write the previous finding was hiding. "
      + "Already half-ruled in source: it runs ONLY for `view === \"tags\"` and "
      + "ONLY at Use level, because `getAgencyMasterSiteKey` exists expressly to "
      + "read the durable key without creating one during a View-only request. "
      + "Left open rather than fixed, because the read-repair pattern the other "
      + "seeders used does NOT apply here: the key routes real form submissions "
      + "into the inbox, so it must be unguessable — it cannot be derived "
      + "deterministically from the agency id, and an unsaved one would hand out "
      + "a snippet that answers to nothing. Closing it means a 'generate master "
      + "tag' ACTION instead of a render, which is a UI decision, not a "
      + "refactor.",
  },
  listOperationalAlerts: {
    category: "sweep-on-read", verdict: "open",
    note: "Now reaches `listExternalAssistantActionProposals` → `releaseExpiredParks`, which returns parked assistant proposals to pending at their due time. Guarded by `if (!expired.length) return`, so it writes only when something has actually expired — a bounded lazy expiry, unlike the team-channel creation this chain used to hit (fixed 2026-08-27). Whether a park should release when nobody is looking is a product question, so it is left rather than moved unilaterally.",
  },
  resolutionEvidenceFor: {
    category: "sweep-on-read", verdict: "open",
    note: "`/api/portal/attention/plan` reaches `listOperationalAlertsForResolution` through the generic evidence builder, so reading the records behind an alert can release expired proposal parks. Same root as that cause.",
  },
  getCachedBusinessIssueRadar: {
    category: "sweep-on-read", verdict: "open",
    note: "The Radar build reaches `listOperationalAlerts`. This is the chain the foundation-adapter noise was hiding; the team-channel write it used to reach is fixed, and the expired-park release is what remains. #21 notes the Radar cache is only 30 seconds.",
  },
  RadarQuickLookControl: {
    category: "sweep-on-read", verdict: "open",
    note: "Mounted by the AGENCY LAYOUT, so the Radar chain above sits on ordinary agency navigation — the widest blast radius in the inventory. Its `lightweight` branch avoids it; the default branch does not.",
  },
  AgencyActionsPage: {
    category: "sweep-on-read", verdict: "open",
    note: "The Calendar page mounts it, and it reaches the same Radar chain. Same root as `getCachedBusinessIssueRadar`.",
  },
  staffCapacitySnapshot: {
    category: "sweep-on-read", verdict: "open",
    note: "The People page's capacity snapshot reaches the Radar chain, and through it the expired-park release. Same root.",
  },
 ApiSection: {
    category: "sweep-on-read", verdict: "open",
    note: "Dev Team → Tools mounts the API section, whose MCP negotiate path builds the advisor context and so reaches `listOperationalAlerts`. Same root; the longest chain here at seven hops.",
  },

  // ── The two that are not seeding ───────────────────────────────────────
  installPlugin: {
    category: "provisioning", verdict: "deliberate",
    note: "The agency catch-all, Marketing and (since 2026-08-31, once the legacy column migration came off its read) the pipelines board activate a built-in tool when an OWNER OR MANAGER navigates to it — read 2026-08-27 and it is intentional, not an accident: both sites gate on the role, both only touch tools this app already ships, and the catch-all's own comment explains the friendly path (the sidebar wires entries optimistically and this surface closes the gap). Ruled deliberate rather than rewritten, because making activation an explicit confirm step is a product decision and Ed has not asked for one. → the open question for him is whether clicking a sidebar entry SHOULD silently install, or should say 'turn this on?' first.",
  },

};

/** Where an entry is, and what it reaches. */
export interface DeclaredEntry {
  path: string;
  cause: string;
}

export const DECLARED_READ_ROUTES: DeclaredEntry[] = [
  { path: "/api/auth/magic/verify", cause: "createUser" },
  { path: "/api/auth/oauth/google/callback", cause: "bootstrapAgency" },
  { path: "/api/auth/verify-email", cause: "markEmailVerified" },
  { path: "/api/cron/inbox", cause: "processInboxWebhookQueue" },
  { path: "/api/cron/radar-probes", cause: "runRadarInfraSweep" },
  // `/api/internal/sweep` reaches TWO deliberate writes: the routine
  // `processAutomationSweep` (the scheduler's automation tick) and, since the
  // 2026-09-04 outbox-flood cleanup, an opt-in `purgeDeliveredOutbox` behind
  // `?outbox=purge-delivered`. The analyser reports the FIRST writer reached in
  // source order, and the purge call now precedes the sweep, so `purgeDeliveredOutbox`
  // is the representative cause. Both are ruled deliberate under that one entry;
  // the automation sweep stays pinned by the "scheduler still owns the sweep" test.
  { path: "/api/internal/sweep", cause: "purgeDeliveredOutbox" },
  { path: "/api/portal/attention/plan", cause: "resolutionEvidenceFor" },
  { path: "/api/portal/calendar/google/callback", cause: "connectGoogleCalendarAccount" },
  // Opening an enquiry marks it seen. A GET that writes, deliberately: the
  // alternative is a second round trip whose only job is to say "yes, I really
  // did look at it", and a badge that clears on a separate call is a badge that
  // eventually disagrees with what was read. Bounded — it writes one timestamp,
  // only on a SUCCESSFUL read, and only if it was not already set.
  { path: "/api/portal/client-forms/[noticeId]", cause: "markClientFormNoticeSeen" },
  // Added 2026-08-28 with the plugin-health route. The analyser is RIGHT to
  // flag it: `runInstallHealthcheck` invokes a module's own `healthcheck`, which is
  // third-party-ish code, and `makeCtx` hands every hook the module's real
  // read/write storage — so on the face of it, polling health could write.
  //
  // **It cannot.** The hook is handed `readOnlyPluginStorage(...)`, whose
  // `set`/`del`/`setIfAbsent`/`runExclusive` reject rather than write. A module
  // that tries becomes one unhealthy row naming itself, instead of quietly
  // mutating on a GET. This is the same answer `retention.ts` gives by keeping
  // `findExpired` away from `mutate`, made structural rather than conventional.
  //
  // The entry stays because the analyser sees the CALL, not the wrapper, and a
  // silent exemption would be indistinguishable from a missed finding. If the
  // wrapper is ever removed, this declaration is the thing that looks wrong.
  { path: "/api/portal/plugins/health", cause: "runInstallHealthcheck" },
  { path: "/api/portal/inbox/meta/callback", cause: "logActivity" },
  { path: "/api/portal/search", cause: "cachedCandidates" },
  { path: "/api/v1/advisor/context", cause: "authenticateExternalAssistant" },
  { path: "/api/v1/assistant/context", cause: "authenticateExternalAssistant" },
  { path: "/api/v1/embed/consume", cause: "clientUser" },
  { path: "/api/v1/export", cause: "authenticateExternalAssistant" },
  { path: "/api/v1/records", cause: "authenticateExternalAssistant" },
  { path: "/api/v1/records/[recordId]", cause: "authenticateExternalAssistant" },
];

export const DECLARED_RENDERS: DeclaredEntry[] = [
  { path: "src/app/portal/agency/[...rest]/page.tsx", cause: "installPlugin" },
  { path: "src/app/portal/agency/assistant/page.tsx", cause: "getCachedBusinessIssueRadar" },
  // 2026-09-03: `/portal/agency/actions` is a real destination again (it renders
  // the same component the Calendar declares below) rather than a redirect.
  { path: "src/app/portal/agency/actions/page.tsx", cause: "AgencyActionsPage" },
  { path: "src/app/portal/agency/calendar/page.tsx", cause: "AgencyActionsPage" },
  { path: "src/app/portal/agency/fulfilment/page.tsx", cause: "ensureAgencyMasterSiteKey" },
  { path: "src/app/portal/agency/inbox/page.tsx", cause: "listOperationalAlerts" },
  { path: "src/app/portal/agency/layout.tsx", cause: "RadarQuickLookControl" },
  { path: "src/app/portal/agency/marketing/page.tsx", cause: "installPlugin" },
  { path: "src/app/portal/agency/page.tsx", cause: "listClientsNeedingAttention" },
  { path: "src/app/portal/agency/people/page.tsx", cause: "staffCapacitySnapshot" },
  // Was `getPipelineBySlug` until 2026-08-31. The legacy column migration came
  // off the read, and the board's OTHER write — the plugin activation the
  // catch-all and Marketing also do — is what it now resolves onto. Same
  // `installPlugin` ruling, and the same open question for Ed.
  { path: "src/app/portal/agency/pipelines/[slug]/page.tsx", cause: "installPlugin" },
  { path: "src/app/portal/clients/[clientId]/layout.tsx", cause: "listOperationalAlerts" },
  { path: "src/app/portal/clients/[clientId]/page.tsx", cause: "buildClientRadar" },
  { path: "src/app/portal/clients/page.tsx", cause: "clearIdentityResolutionReviews" },
  { path: "src/app/portal/dev-team/tools/page.tsx", cause: "ApiSection" },
];

/**
 * How many causes are still unruled.
 *
 * Pinned so the number can only go DOWN, and the test refuses a pin higher than
 * the truth. It reached zero on 2026-08-27; the constant stays rather than
 * being deleted, so that a future unruled cause has to move it back up
 * deliberately, in a diff somebody reads.
 */
export const UNRULED_CAUSE_CEILING = 0;
