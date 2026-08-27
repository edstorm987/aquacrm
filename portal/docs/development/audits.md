# Audit log

← Back to [development.md](../development.md) (the law) · Auditor how-to: [auditor-brief.md](../context/auditor-brief.md)

> ## 🚨 CURRENT CHECKPOINT — P0/P1 source + runtime review 2026-08-24
> The authoritative current position is [checklist.md](checklist.md). The last
> documented whole-suite run remains **3,621 pass / 0 fail / 1 skip on
> 2026-08-23**; it was not rerun by this documentation pass. The 2026-08-24
> review now has a **P0:** a stale owner cookie created a working external-AI API
> token after the live user was downgraded to staff because central role helpers
> do not enforce current `sessionRev`/role. P1s: mutating showcase GET/OAuth paths;
> erasure false-success/non-retry/audit-name; Editor AI distributed coordination;
> unsafe file persistence; editor transitions/prefill; staff-policy drift; data
> truth and browser acceptance. See issues #16–#25. The same-day **98/98** focused
> run remains useful source/memory evidence but closes none of these runtime
> boundaries by itself.
> Every verdict below is preserved dated evidence, including claims later
> narrowed or superseded.

> ## 🟡 SUITE effectively green — 2382 pass / 0 fail · `tsc` 0 errors (2026-08-20, commander-verified) — **but one red observed since**
> **No open 🔴 findings.** The three items that were briefed as
> "🔴 launch blockers" are all **fixed in source** — freelancer preview escalation
> (`api/auth/preview-as-freelancer/route.ts:49,101`), finance create-surface
> idempotency (`agency-finance/src/lib/idempotency.ts`, wired into six surfaces),
> and the erasure email-in-log (`leads-pipeline/src/server/contacts.ts:168,227,252,279`
> log an id, never an address).
>
> ⚠ **One red was observed during the 2026-08-20 docs pass, after that count was
> taken:** `smoke-dev-tasks-parse.test.ts:65` fails in isolation (12 pass / 1 fail)
> — "the three real plans that rendered as finished are not finished". This is the
> same churning internal dev-tooling the auditor flagged at tick 53, but the cause
> is now the **opposite** of a product defect: the test still asserts
> `/BLOCKED on Ed/i` against the marketing plan's "Cohere" phase, which has
> legitimately since become **"✅ Cohere — SHIPPED"** (Ed's call was made;
> ten views → five landed 2026-08-20). **The plan is right and the test is stale** —
> it pins a doc state that was supposed to change. Routing note: the fixture at
> `smoke-dev-tasks-parse.test.ts:49` needs re-pointing at a still-blocked phase, or
> the assertion needs to stop depending on live plan prose. Not fixed here — this
> was a docs-only pass and the test is source.
>
> ⚠ **How to read this file.** Everything below this banner is a **dated verdict —
> a record of what was true when it was written, not a status board.** Several
> verdicts below correctly report reds and 🔴s that have since been fixed; the
> banner is the only line here that claims to be current. For current state read
> [checklist.md](checklist.md); for whether a specific thing is done, read the
> **source**, then that item's plan `**Status:**` line.
>
> _Superseded by the above (kept for the record):_ tick 53 reported
> "2408 pass / 1 fail / 1 skip" with `smoke-dev-tasks-parse` red, after resolving
> Meta security (5/5), the roadmap dangling-ref and the `seventyNinthCollection`
> state-collection data-loss gap (wired into `parseBlob`/`empty()`,
> `smoke-state-roundtrip` 3/3).

> ✅ **RESOLVED (2026-08-20, docs-correction pass — source-verified, not an auditor re-run)** — the `mfa-login` "Phase 4 complete" claim and the MFA-at-login gap are **both closed**. The tick-~40 ruling below was correct **when written**: `/api/auth/login` genuinely had zero MFA. It has since been built, and the ruling outlived the fix in four documents at once — which is exactly the drift this pass exists to stop. **Evidence:** `api/auth/login/route.ts` imports `loginMfaStep`/`raisedToSecondFactor` (`:19-22`), refuses a session for an enrolled account with no code (`:312-320`), rate-limits code attempts (`:329`), runs the real Supabase `mfa.challenge`/`mfa.verify` (`:340-345`), and **re-reads the returned token's own `aal` claim, rejecting a 200 that did not actually raise assurance** (`:355`); `app/login/LoginForm.tsx` handles `401 { mfaRequired: true }` (`:110-115`) and renders the code field (`:197-211`); native form posts carry `code` through (`:151`). **Still genuinely open:** mfa-login Phases 3–4 (session assurance, recovery codes) — see that plan's `**Status:**` line. `issues.md #10`, `todo.md` and `development.md` corrected to match.

> ✅ **RESOLVED (2026-08-19, auditor)** — Freelancer preview MANAGER → OWNER escalation is **closed** and behaviourally regression-tested (`exit` restores the exact enterer, no owner fallback). Was a 🔴; verdict in the body.

> ✅ **RESOLVED (2026-08-19, auditor — tick 16)** — client erasure PII hole is **closed**. The hook was in fact a total no-op (it filtered on `Contact.clientId`, which nothing writes) — the builder fixed it to resolve the client's people via the real links + strip/anonymise all PII, made every log message id-only, and added a test that drives the real `upsert→convert→promote→update` flow and asserts **zero trace of email/phone in any value or key** (fails on the old code). 18/18 isolated. Was the LAST launch blocker; verdict in the body. **→ Commander: un-hold the gate; final clean full-run once the worker settles.**

The independent auditor's verdicts, newest first. **This is the record of what's
been *verified*, not just claimed.** The auditor writes here; the commander reads
here to mark work done or route rework.

**The pending queue = [updates.md](updates.md) entries with no verdict here yet.**
Key each verdict by the updates.md entry it covers (its date + title) so the loop
knows what's already ruled on.

Format per audit:
```
## YYYY-MM-DD — VERDICT — <the updates.md entry title it covers>
**Verdict:** ✅ PASS | 🟡 PASS WITH NITS | 🔴 REWORK
**Audited:** what you actually did (suite re-run + count, ran-in-app y/n, contracts checked).
**Findings:** (none | ranked list, each: 🔴/🟠/🟡 · file:line · the problem · the fix)
**→ Commander:** the one-line action (mark done / log nits / route rework to <worker>).
```
A REWORK or any 🔴 finding also gets a **loud one-liner at the very top of this
file** so the commander can't miss it.

---

## Pending queue at auditor start (2026-08-19)
Shipped-but-not-yet-audited, oldest first (audit in this order):
1. **Connect-flow Phase 1** — real emailed codes, generate+store+verify (`00000` behind dev gate). 🔴 launch blocker — audit every phase.
2. **Erasure Phase 1/5** — `onEraseClient` hook contract (additive). 🔴 launch blocker + touches live data — audit every phase.
3. **Radar upgrade — COMPLETE** (7 stages + probe cron + external-DB monitoring + UI panels). Large; audit the plan as a whole, spot-check the live-data + contract-heavy stages (infra health, actionable tasks, coverage).

_Verdicts below, newest first (insert new ones directly under the pending-queue snapshot above)._

## 2026-08-22 — ✅ PASS (verified source + EXECUTION, applying the corrective) — "The API behind the closed pages + client-record workspace"

Audited the API-level access-control fix — the counterpart to tick-180's page fix, closing **exactly the gap I flagged at tick 183** ("these API routes do not yet have such a guard"). This time I applied the tick-182 corrective in full: whole-class + trust-boundary + ran-the-guard.
- **The hole (real, severe):** the plugin API dispatcher (`api/portal/[module]/[...rest]/route.ts`) had NO surface rule — its only gate was `route.visibleToRoles ?? route.roles`, and **undefined = "anyone with a session" for 133 of 312 routes**. A gated page whose API still answers is not gated. Plus the **client-record workspace** (`/portal/clients/[clientId]`) gated on `requireRoleForClient([...ALL_ROLES])` (tenancy, not ownership) → an `end-customer` attached to the client opened finance/contracts/notes.
- **Fix [1] — API ceiling, source-verified:** `_pageScope.ts:227-233` extends the same ceiling model to routes — "a route must never be wider than the page it backs," undeclared inherits the ceiling, declared intersects, `public:true` untouched. The 133 undeclared routes now capped. end-customer reachability 146→20 (public webhooks + `me/*`), lead 134→7. ✓
- **Fix [2] — client workspace, source-verified:** `layout.tsx:65` now `requireRoleForClient([...SURFACE_ROLE_CEILING.client], clientId)` (was ALL_ROLES) + `redirect("/portal")` (`:67`), both page + layout; `requireRoleForClient` still enforces tenancy on top. end-customer/lead excluded. ✓
- **Fix [3] — the default-allow bug (`:124`), source-verified:** `scopePolicySurfaces` (`:153`) is now exhaustive with `const unreachable: never = policy` (`:161`) — an unknown `scopePolicy` resolves to **no surface** (default-deny) instead of the old `["agency","client"]` (default-allow in a default-deny file); tsc catches unhandled union members. ✓
- **Execution evidence (my corrective, not just trusting the guard):** `smoke-plugin-api-host-gates.test.ts` uses `issueSession` for REAL sessions (`:56`), drives the REAL dispatcher over every route × method × all 8 roles (`:21-29`) + synthetic-manifest mutation checks + negative control — **ran it in isolation: 22/22 pass.** ✓

**Verdict: ✅ PASS.** The access-control class is now closed the durable way in all three places it lived (pages tick-180, API + workspace here), each execution-tested with a negative control. **Note:** my tick-183 proactive flag ("API routes lack the page guard") was correct and is now closed — the concern was real, the fix landed the next tick. This is the corrective working end-to-end: I flagged the class gap, and verified the closure by source + execution.

## 2026-08-22 — 🟢 Proactive class-level re-check (applying the tick-182 corrective) — governance/compliance routes all gated

Quiet tick; applied corrective #1 (enumerate the WHOLE class, not the named cases) to my own tick-79 governance audit — where I'd named only four routes. Enumerated **every** governance/compliance/erasure API route (6 total) and gate-checked each:
- `governance/route.ts`, `hipaa`, `legal`, `erasure/preview` — the four I named at tick 79 (all `requireRole` agency-roles + `session.agencyId`). ✓
- **`compliance/frameworks`** and **`compliance/posture`** — **two I never named**, found by enumeration: frameworks (POST, mutates) `requireRole(["agency-owner","agency-manager"])` admin-only + agency-scoped; posture (GET, read-only) agency-roles-incl-staff + agency-scoped. Sensible read/mutate split. ✓

No ungated route in the class; none reachable by client/customer/lead. **Clean** — but the point is I found the 2 un-named routes by grepping the class, not by trusting my earlier list. This is the corrective working. (Note: still grep-level, not execution-level; a full application would drive each as an untrusted role — the plugin-page host-gates guard already does this for pages, these API routes do not yet have such a guard.)

## 2026-08-22 — ✅ PASS (+ honest accounting of MY blind spots) — "Eleven verifier-proven defects across phases 8/9 + truthfulness"

Audited the second-pass fix of 11 defects. Verified the fixes are real — and **three of them were in areas I PASSED**, which is worth recording plainly.
- **Navigator origin (my tick-176 PASS):** I verified the *tag's* same-origin filter and passed it. The defect: the editor **trusted the tag** (code running inside an untrusted page) to filter, and picking a row moved the frame's trusted `src`. Fixed: `pageNavigator.ts:285` `pageLinkDestinations(links, allowedOrigin)` enforces origin **in the editor**, **fails closed** with no origin (`:300`), `navigatorHref` refuses again at use. I checked one layer; the trust boundary was the bug. ✓ now closed.
- **SEO "bytes outside markers unchanged" (my tick-178 PASS):** I took it as pinned by the 73-test suite. It was **false for CRLF files** — split `/\r?\n/` + join `"\n"` rewrote every line (170→233 bytes, a whole-file diff). Fixed: terminators travel beside the text (`pageSeo.ts:606-608`). The suite didn't cover CRLF; I trusted the coverage. ✓ now closed.
- **Truthful surfaces (my tick-174 PASS):** I verified the helper + the *named* surfaces. Left live: the tax clamp on **Overview** (`FounderDashboardPage.tsx:75` now `taxPosition()`), a **3rd** ungated sibling (`_ClientSystemsWorkspace`), and a **4th** no report had named. Fixed + pins made **class-level** — "that is what found the fourth." ✓ now closed.
- Other fixes verified in passing: twitter:card inert-field rule, `.js/.mjs` App Router heads, `governingLayout` reachable, `public/*.html` extension, SEO-discard confirm, and `portalTarget` no longer reading `projectKind` (now `!projectId`).

**Verdict: ✅ PASS.** But the pattern across ticks 174/176/178 (and 180) is now unmistakable and it is MINE: **I verify the mechanism and the named cases; the defects live in the un-named consumers, the edge inputs, and the trust boundary.** The team's independent verifiers — execution-based, class-level, adversarial — keep finding what inspection of the declared cases misses. **Corrective I'm adopting:** when auditing a "fixed X" claim, (1) grep/enumerate the WHOLE class of X, not the named instances; (2) test the edge input (CRLF, empty, legacy record), not the happy path; (3) drive the trust boundary as the untrusted side, don't assume a lower layer's filter. Credit where due: this build's verifier discipline is genuinely strong.

## 2026-08-22 — ✅ PASS — "Client/customer-portal access hole closed STRUCTURALLY" — the most important security fix of the session

Audited the client-portal-hole claim. This is a **critical, broad** access-control hole — worse than the tick-174 finance one — and it's fixed **structurally** (safe-by-default), verified hard in source.

**The hole (real, severe):** an `end-customer` (a shopper) could open `/portal/clients/<id>/agency-hr/staff`, `/…/contacts`, and on the customer host `/portal/customer/memberships/subscribers`, `affiliates/payouts`, `client-crm/contacts`, `agency-hr/staff`. Root cause: the client host gate was `requireRoleForClient(ALL_ROLES, clientId)` (tenancy, not surface ownership) and `pluginPageAllowedRoles` was **undefined for 69 of 90 pages** → fell back to the wide-open door. Violates CLAUDE.md "internal records stay internal."

**The fix is the right kind — structural, not per-page declaration:**
- **Surface role ceiling no manifest can widen** (`_pageScope.ts:77-81`): `agency: AGENCY_ROLES`, `client: AGENCY_ROLES ∪ CLIENT_ROLES`, `customer: ["end-customer"]`. The client ceiling **excludes `end-customer`/`lead`**.
- **`effectivePageRoles` (`:146-152`) is the whole gate**, called by all three hosts (single source of truth): wrong surface → `[]`; **undeclared page → inherits the ceiling** (`[...ceiling]`, NOT the door); declared → `ceiling.filter(r => declared.includes(r))` — **intersect, never union**, so a declaration can only narrow. Even the 69 undeclared pages are now safe, and a shopper reaches **zero** client-host pages by construction.
- The comment (`:69-75`) correctly separates **tenancy** (the host `requireRoleForClient` gate) from **surface ownership** (the ceiling) — the exact conceptual bug. `resolveCustomerPluginPage`'s relative-prefix branch (the customer leak, which also shadowed real customer pages) is removed.
- **Guard proven by EXECUTION:** `smoke-plugin-page-host-gates.test.ts` drives REAL host routes with REAL signed sessions for all 8 roles across every URL, vs `effectivePageRoles`; mutation checks register **synthetic manifests declaring nothing** (proving the rule on the 91st page, not just existing ones); negative control (revert → hundreds of violations). Reachability client 856→372, customer 52→3, end-customer/lead → **0** on the client host.

**Verdict: ✅ PASS** — a critical hole closed the durable way (safe-by-default ceiling + single gate + execution-proven), superseding the fragile "every page must declare" model.

**↳ Honest note on my tick-174 verdict:** I passed the finance/agency access-control fix (correct for what it covered — the agency host + nav-narrowing guard), but this **broader client/customer-host class** (undeclared pages + wrong-surface resolution + `pickInstall` agency fallback) was a separate, larger hole my tick-174 audit did **not** surface. The team's execution-based sweep (all roles × all hosts × all URLs) found what inspection of the declared cases missed. Lesson logged: for access control, drive the real routes as the untrusted role — don't verify only that the declared pages declare.

## 2026-08-22 — ✅ PASS (source/test; browser-unverified per team's note) — "Phase 9: surface modes + per-page SEO in source"

Audited the phase-9 claim (the SEO/surfaces work whose landing caused ticks 177's 6 reds — now settled green + logged). The higher-risk part is **writing SEO into page source**; verified it's built on the audited-safe write path:
- **SEO-write reuses the repo-write safety:** `seo-read`/`seo-write` are actions on the **existing** `/api/portal/dev/repo-write` (`route.ts:56,290,300`) — no new endpoint, no SEO store. `seo-write` is preview-first → confirm-with-**fingerprint** ("a page that changed in between refuses instead of writing") → `saveRepoFile` → draft branch → PR. Same lost-update/traversal guards I verified tick 161. ✓
- **"Own a marked block, refuse everything else":** `repoWrite.ts:89-90` makes "this file has no head I can write" and "this page **already writes its own head**" distinct refusals — it won't clobber a page with `generateMetadata`/existing `metadata`/a hand-written `<title>`/`"use client"`. `read(emit(x))===x` both ways + bytes-outside-markers-unchanged pinned by the 73-test suite. ✓
- **Conservative surface derivation:** `surfaces.ts` defaults to **Normal**; promotes to **Website** only on evidence (tag answering AND http(s) address), else Normal *with a sentence naming the missing half*. `projectKind` deliberately **excluded** from the logic (only in the "AND NOT projectKind" comment `:25-27`) — a derivation that invents "puts an SEO panel over somebody's game." Operator's explicit choice always wins + persists; only explicit choices stored. ✓
- **`inspectorTabsFor` now takes a REQUIRED `surface`** — tsc-enforced so the SEO tab can't be "built and never mounted"; gated on `surface === "website"` before the ladder, orthogonal to depth. (This required-arg change is what surfaced ticks 168/177's transient inspectorTabsFor reds as the feature landed.) ✓

Full suite green (3516 / 0). **Verdict: ✅ PASS on what's source-verifiable** — SEO-in-source rides the safe write path with real "don't clobber existing SEO" refusals; the surface default is honest (Normal unless proven Website). **Caveat (team's own):** not browser-rendered. **↳ tick-177's 6 reds RESOLVED** — heavy-landing churn (5/6 phantoms + 1 that also settled), green at stable 3516.

## 2026-08-22 — ✅ PASS (source/test; browser-unverified per team's note) — "Phase 8: the navigator + tag reports its links"

Audited the navigator claim (fixes Ed's "if i put in a website id get stuck" — the browser could load one address but reach no other page). Honestly flagged "not verified in a browser" + phase-9 switcher not built. Verified the source-checkable logic:
- **Route-derivation safety** (`pageNavigator.ts`): a dynamic route (`[slug]`) is **listed but not openable** (`:20,:57-59`) — you can't blindly open a route needing a value; private/slot/intercept routes handled (`:131`); static `.html` at root/`public/` (`:112-117`). ✓
- **Tag link protocol is well-scoped:** `aquaTagSource.ts:375` `if (url.origin !== location.origin) continue` — **same-origin filter** (won't surface arbitrary cross-origin links the page happens to contain), `:376` strips query/hash, `:378` deduplicates. New `aqua-explorer:links`/`links-found` pair, cap 60 + 2s timeout per the entry. ✓
- **Portal-only select replaced:** `PageNavigator.tsx` mounted in `DevEditor.tsx` (grep = 2); `aria-label="Portal page"` **gone** (grep = 0). The stale pin in `smoke-client-portal-studio.test.ts` was rewritten to assert the navigator is mounted + the old label absent (not just text-match, which a leftover comment would have satisfied). ✓
- **No new endpoint** — reuses repo-write `insert-targets`; drift guard 27/27.

Full suite green (3443 / 0). **Verdict: ✅ PASS on what's source-verifiable** — careful route logic, good same-origin scoping. **Caveat (team's own, echoed):** nothing has rendered; the navigator UX + link-picking need a live-browser pass. Queue clean.

## 2026-08-22 — ✅ PASS — "Three app-audit findings closed at the class level" — incl. a HIGH access-control fix, verified

Audited the closure of three findings from the 22-Aug app audit. Security-significant, so I verified each in source; **all genuinely fixed, and the HIGH one is generalized:**
- **Finding 1 — HIGH access control, CLOSED + class-level:** `agency-staff` could open finance `/budgets,/operations,/planning,/settings` by URL (Operations shipped compensation + payments in SSR props) because the manifest declared no roles → host gate fell back to all of `AGENCY_ROLES`. Now every finance page declares `visibleToRoles: financePageRoles(path)` (`agency-finance/index.ts:55-59`), derived from `FINANCE_SECTIONS`; the four sensitive pages are `FINANCE_ADMIN_ROLES` = owner/manager only (`sections.ts:47-52`), **staff excluded** (`:31`), host **404s before importing the component** (fail-closed). **The sweep closed 4 more instances of the same hole** — verified agency-hr "Employees" now `AGENCY_ADMINS` (`agency-hr/index.ts:66`) — and added a **generic guard over EVERY plugin** (`smoke-finance-section-gates.test.ts`, with a mutation check + real host route driven as staff → 404). ✓
- **Finding 2 — Stripe secret handling, CLOSED:** password fields → encrypted integrations vault via `secretVault`; **a password field with no vault target is refused by both the settings surface and the registry validator** (`pluginSettingsSurface.ts:22`) — secrets can't reach the browser-visible `install.config`, aren't echoed, aren't logged. Generic surface (`pluginSettingsSurface.ts` + `PluginSettingsPanel.tsx` + `api/portal/plugins/settings`). ✓
- **Finding 3 — truthful surfaces, CLOSED:** `telemetryDisplay.ts:20` `UNMEASURED = "—"`, gated on the telemetry watermark (`:25`) — unmeasured shows "—", never a fabricated 0; `taxPosition()` replaces `Math.max(0, …)` so a reclaim reads as a reclaim; currency + client-name/`cli_…` formatting fixed. The exact "unmeasured → null, never 0" honesty contract. ✓

Full suite green (3402 / 0). **Verdict: ✅ PASS** — a real HIGH privilege-escalation hole (staff → compensation/payments) closed **at the class level** with a plugin-wide guard, plus a secret-leak-prevention and an honesty fix. This is exactly how a finding should be closed: fix the class, not the instance, and leave a guard that catches the next one.

## 2026-08-22 — ✅ PASS — "Dev Editor writes, publishes and merges; 13/18 phases" — milestone roll-up; new merge path is safe

Audited the milestone claim. Most of it summarizes work I've **independently audited & passed** over the burst (dead-snippet · repo-write · AI-reply · throttle · nesting · device-sizing · modes; and the lost-update / `sk-proj-` scrubber / apostrophe / editor-AI-isolation fixes it lists as verifier-found) — the summary matches my prior verdicts. Focused on the **new** capability + the honesty:
- **Merge + revert (phase 14) is safe:** `publish.ts:146` squash-merge via GitHub's API (**not force**); `repoWrite.ts:485` requires `confirm === true` (not coerced); `:501` a conflict/branch-protection → refusal (never forced); merging is a **separate** decision from save/publish (`:387`) and the code is explicit "merging here IS the production deploy" (`sourceEdit.ts:367`). Scoped to the **client** repo — the "`+` writing into AquaCRM's own tree" defect was fixed, so this is not a risk to AquaCRM's own production. ✓
- **Honest "not done":** phases 8/9/17/18 explicitly unshipped; **Ed's live client tag still points at localhost** (needs `NEXT_PUBLIC_PORTAL_BASE_URL` + re-paste) — the same localhost issue from the dead-snippet audit, correctly flagged as still open, not hidden. ✓
- **External claim (taken on report, not independently verifiable):** real commits `780eb08`/`4da8b29` + PR #1 on the live repo `edstorm987/Beast-marks`. I can't verify external GitHub state from here, but it's consistent with the write path I verified at tick 161 (branch-tip reads, fingerprint guard).

Full suite green (3361 / 0). **Verdict: ✅ PASS** — accurate milestone; the new merge path carries the same safety discipline as the write path (explicit confirm, no force, respects protections), and the incomplete phases + the outstanding localhost tag are disclosed honestly. **13/18 shipped, cross-confirmed against my own burst of verdicts.**

## 2026-08-22 — ✅ PASS (partial delivery, honestly scoped) — "Network throttling: tag wraps fetch/XHR + wifi control"

Audited the throttle claim (deferred from tick 169 while I investigated a suite red — see the resolution note below). Verified the core; **all holds, and the honesty is the standout:**
- **Tag wraps fetch/XHR — lazy + exact restore:** `aquaTagSource.ts:358-361` saves `throttleOriginalFetch`/`throttleOriginalXhrSend`; wrap engages only when throttled (native untouched otherwise), clear restores the saved originals. Real latency + bandwidth pacing (chunk-proportional stream delay, `:377-387`) + offline (`TypeError("Failed to fetch")`, `:364`). ✓
- **No overclaim (in the code itself):** `:354` — "only DevTools can throttle those [cross-origin iframe resource loads] — so it never pretends to." The feature throttles the page's own fetch/XHR, and says so. ✓
- **Capabilities `networkThrottle`:** advertised (`aquaTagBridge.ts:307`), **lenient parse** `=== true` (`:535`) so a cached pre-throttle tag still handshakes. ✓
- **Honest partial delivery:** `NetworkThrottleControl.tsx` exists + is tested, but is **NOT mounted in DevEditor** (`grep -c` = 0) — held back because a concurrent workflow owns `DevEditor.tsx`, exactly as the entry states. So the control isn't reachable in the editor yet; that's disclosed, not hidden.
- Test VM-executes the real tag source (sandboxing the fetch-wrap from the runner's own globals) — good isolation.

Full suite green (3355 / 0). **Verdict: ✅ PASS** — careful, honestly-scoped work; the lazy-wrap/exact-restore design is right, and the "can't throttle the iframe, only page fetch/XHR" + "not yet mounted" caveats are stated plainly. When the control is mounted, a browser pass would confirm the end-to-end UX.

**↳ Resolution of the tick-169 "the endpoint" red:** RESOLVED. It was a **full-suite-only cross-file/concurrency artifact** of that tick's heavy +56 landing — the endpoint code passed in isolation (repo-write 44/0, words-publish 64/0) and co-run with the throttle files (123/0); it failed only in the full concurrent suite, and cleared to green (3355/0) once the landing settled. **Not a code defect.** (If a green-alone-red-in-suite endpoint recurs when the tree is quiet, that's a real test-isolation weakness to bisect — noted, not currently reproducing.)

## 2026-08-22 — ✅ PASS (source/test only; browser-unverified by the team's own note) — "Real device sizing in the editor (phase 10)"

Audited the device-sizing claim (lower-risk UI/preview). The entry itself flags "NOT verified in a live browser" — honest, and I can't browser-verify either (spinning a dev server would clobber the shared sandbox, which the brief forbids). So I verified the **source-checkable** structural + anti-duplication claims; all hold:
- **`BreakpointControl.tsx` deleted; `DeviceControl.tsx` present.** ✓
- **Device maths reused, not forked** (the codebase's "don't build it twice" rule): `DeviceControl.tsx:15` imports from `@built-ins/…/website-editor/src/lib/devicePresets`; `:32` "The MATHS is imported, never forked." ✓
- **Engine boundary held:** `DevEditor.tsx` has **zero** built-ins imports (grep empty) — `DeviceControl` is the single door isolating that dependency. ✓
- **Exact pixels:** `PreviewFrame` lost `maxWidth:100%` and the silent `1440` cap (grep empty). ✓
- **Drag clamp** `clampDeviceSize` with min 240×320 (`DeviceControl.tsx:58-59,:63`), used in the drag handler (`:117`). ✓

21-test suite pins the logic; full suite green (3297 / 0). **Verdict: ✅ PASS on what's source-verifiable** — clean, reuses shared maths, respects the engine/built-ins boundary. **Caveat (the team's own, echoed):** pixel-exactness + drag behaviour are **not** browser-confirmed; that verification stays open for a live-browser pass. Queue clean.

## 2026-08-22 — ✅ PASS — "Nested projects: two levels, enforced in the store" — cycle inexpressible, tenant-safe, delete-safe

Audited the nesting claim (higher-risk: store invariants + tenant scope + cascade delete). Verified the integrity/tenant/safety core at source; **all correct:**
- **`parentProjectId?` optional** (`types.ts:2900`) → old records parse as top-level. ✓
- **Tenant-first parent validation, no existence oracle:** `devProjects.ts:224` `getDevProject(input.agencyId, requested)` (agency-scoped) → `:225` throws `parent_project_not_found` if absent. A foreign parent id (another agency's) returns null → **same error an invented id gets** — you can't probe another agency's projects by trying to nest under one. ✓
- **Cycle made *inexpressible*, not just forbidden:** self-containment `:222` (`project_cannot_contain_itself`), parent-can't-be-a-child `:226` (no 3rd level down), project-with-children-can't-nest `:227-228` (no 3rd level up). The comment's proof (`:208-210`) is sound: any ≥2 cycle needs a parent that's also a child (refused by 2&3); the length-1 cycle is rule 4. ✓
- **Omission carries the parent** `:217-219` (a rename can't silently flatten a child); explicit clear via ""/null. ✓
- **Delete refuses BEFORE destructive cleanup (safety ordering):** `route.ts:139-140` `devProjectDeleteRefusal` → 400 naming the children, **before** `forgetEditorAiHistoryForProject` (`:155`). A refused parent-delete leaves the AI history intact — the comment states exactly this reasoning. Agency-scoped throughout. ✓

33-case test covers the rule from every direction (store + route), tenant isolation, old-record tolerance. Full suite green (3264 / 0). **Verdict: ✅ PASS** — careful data-model work; the cycle-inexpressibility argument and the refuse-before-destroy ordering are the standouts. _Still pending in queue: "Real device sizing (phase 10)" — next tick._

## 2026-08-22 — ✅ PASS — "Four editing modes become three: 'Just the words' merged into Visual" — clean, migration correct

Audited the mode-merge claim (Ed's call: "combine it into visual mode as it's the same"). Low-risk UI consolidation; verified the core:
- **`EDITING_MODES` is now 3** (`modes.ts`): `assist`/"Just tell it", `visual`/"Visual builder", `developer`/"Dev". The `simple` id is deleted from the ladder. ✓
- **Migration is explicit & correct (the part that could bite):** `modes.ts:190` `if (id === "simple") id = "visual"` — a stale "simple" (old URL / stored pref) is mapped to visual **by name, ahead of** the unknown-id default, so it lands on the intended depth, not a fallback. ✓
- **`selectionRouting.ts` simple branch removed** (grep empty) — as claimed, pure deletion since visual already routed to the element panel with words editable. ✓
- **No capability-gating rode in** (consistent with Ed's 2026-08-21 "clients get the whole editor" decision) — the merge deletes a rung, adds no gate; suite green.

Full suite green (3209 / 0). **Verdict: ✅ PASS** — reconciles the mode-ladder churn I tracked at ticks 132/140: the `simple` rung is now deliberately gone, with stale-value migration handled by name. Queue clean.

## 2026-08-22 — ✅ PASS — "Aqua Editor AI replies now — model call on the project's own key" — key isolation genuinely enforced

Audited the AI-reply wiring (the pending queue item from tick 161). Focused on the isolation/injection edges; **confirmed at source:**
- **No-fallback key resolution (the standout, decisive):** `editorAiReply.ts` uses **only** `resolveEditorAiToken(agencyId, projectId)` — the project's own vault key. The negative proof: grepping the module for `getIntegrationConnection` / `agencyOpenai` / `OPENAI_API_KEY` / an agency-openai path returns **empty** — there is no code path to the agency `openai` connection or env. A keyless project → `not_configured` sentence, **zero model calls** (`:38-40,:92`). A project's AI genuinely can't spend agency-wide credentials or cross the tenant boundary. ✓
- **Untrusted-framing (prompt-injection defense):** the client's editor context (clicked words / source focus) is documented and handled as "UNTRUSTED page text: handed to the model as data," not instructions (`:142-146`). ✓
- **Route gate:** `requireRole` founder/manager (`route.ts:78`) → Dev-Mode 403 (`:79`) → CSRF origin (`:82`) → tenant-scoped 404s with no existence oracle (`:56,:59`); status map not_configured→409 / timeout→504 / upstream→502. ✓
- **Coheres with the tick-157 audits:** this is the server-side author the history route's `role:"assistant"` refusal defers to (assistant reply appended server-side, never from a browser body), and it reuses the `scrubSecrets` scrubber for provider error text with the exact key removed — one coherent security design across the editor-AI subsystem (project-scoped keys · no forged assistant messages · secrets scrubbed · cross-project isolation).

Also confirmed: ≤24-message char-capped context with newest-never-dropped (`:118-130`), reuses the Advisor transport (`:4`), test tripwire throws on any real network call. Full suite green (3189 / 0). **Verdict: ✅ PASS.** Queue clean — both tick-161 claims now audited.

## 2026-08-22 — ✅ PASS — "Repo write path: create/save/publish for repo-backed projects" — git-write safety verified

Audited the repo-write-path claim (fixes Ed's live blocker: "not letting me add new files… publishing [doesn't] work"). This is the **highest-risk claim of the burst** — it *writes to GitHub repos* — so I focused on the data-loss and secret-leak edges. **All handled correctly:**
- **Lost-update prevention (the critical one):** `repoWrite.ts:199-203` re-hashes the current branch-tip contents at save time and compares to the read-time `fingerprint`; mismatch → `stale-fingerprint` refusal ("someone else changed this"), **never a silent overwrite**. ✓
- **No force-push:** zero `force:true` in `repoWrite.ts`; reuses the words-editor `publishEdits`/`openPullRequest` machinery (whose `force:false` I verified tick 156) — a non-fast-forward becomes a refusal, not a clobber. Draft branch `aqua-editor/<projectId>`, never the default branch. ✓
- **Dry-run default:** commits only when `confirm === true` (`:143`); per-branch in-process write lock for the check-then-commit window (`:102-107`). ✓
- **Traversal/secret refusals:** `normalizeRepoPath` + `.env`/hidden-path refusals, same as the local write path (`:85`). ✓
- **Secret never in the body (security):** route reads repo/ref/**token** only off the agency-scoped `DevProject` record + encrypted vault (`route.ts:34-37`), never the request body, never echoed. Full gate: `requireRole` founder/manager (`:95`) → Dev-Mode 403 (`:96`) → CSRF origin 403 (`:99`) → `getDevProject(session.agencyId, …)` (`:109`). POST-only. ✓
- Test design is sound: `smoke-repo-write.test.ts` (44) uses a stateful fake that tracks **contents-per-commit** (so it can catch a silent revert) + fast-forward enforcement + PR reuse.

Verified the git-write **safety core + route security**; did not individually re-verify `createRepoPath`/PR-reuse/draft-first GET/UI (covered by the 44-test green suite). Full suite green (3184 / 0). **Verdict: ✅ PASS** — safe git writes done right (the hard part — lost-update + force-push — is correct). _Still pending in queue: "Aqua Editor AI replies now" (next tick)._

## 2026-08-22 — ✅ PASS — "Dead-snippet tag state + file-tree re-fetch" — a real trust bug (tag 'verified' but dead for visitors), fixed correctly

Audited the two-phase claim. This one matters: **Phase 1a fixes a real correctness/trust bug** found testing the tag on a real page — the snippet pointed at `http://localhost:3032/aqua-tag.js` (present, right key, **dead in every visitor's browser**) yet "Check It" reported **verified** because it read the HTML server-side. Verified the fix at source:
- **The semantic of "verified" is corrected** — `aquaTagIdFromCheck:377`: `verified = tagPresent && keyMatches && detectedSiteKey && **!scriptUnloadableReason**`. A tag is no longer verified just for being in the HTML; if its script won't load for a visitor, it isn't verified. ✓
- **`dead-snippet` = proper 8th state:** union member (`types.ts:2768`), derived from `scriptUnloadableReason` (`devProjects.ts:260`), evidence prints the reason verbatim (`:330`), UI warning tone (`_DevEditorSetup.tsx:475`). ✓
- **Definitive-negative revoke:** a dead-snippet is reachable-but-unverified → `:381 if (tag?.reachable) return undefined` → earned id **revoked** on re-check. (Extends the revoke logic I verified tick 156 — it now catches dead snippets too.) ✓
- **Backward-compat:** both new fields optional (`types.ts:2726,2736`) → old records parse as *unassessed*, never dead. ✓
- **Phase 1b (the file-tree/GitHub-connect fix — this resolved the code-mode red I flagged tick 159):** old "Company → Connections" wording **gone**; `RepositoryPanel`/`EditorCodeCanvas` listen for `DEV_PROJECTS_CHANGED_EVENT` to re-fetch; `smoke-code-mode.test.ts:254-260` deliberately flipped to assert `/Connect GitHub in the editor's Settings tab/`. That was the mid-flip test I watched go red → now green. ✓

Full suite green (3125 / 0). **Verdict: ✅ PASS** — a genuinely important trust fix (a tag falsely reporting "live" is exactly the kind of thing that burns an agency), implemented thoroughly with backward-compat. Retro-confirms my tick-159 in-flight read.

## 2026-08-21 — ✅ PASS — "Aqua Editor AI hardening: six defects from the own-assistant split" — incl. a real plaintext-key-leak fix

Audited the six-defect fix-pass. Verified **4 of 6 at source**, prioritising the three security-relevant ones; all confirmed real, not test-weakening:
- **Defect 1 — SECURITY, plaintext API-key leak (the big one), CONFIRMED FIXED:** `integrationConnections.ts` `safeTestMessage` — the scrubber was underscore-only (`sk_`), so an OpenAI `sk-proj-…` key echoed in a provider 401 reached `lastTestMessage` → state blob → integrations GET → settings panel **in plaintext**. Now `:474` `/(?:sk|rk)[-_][A-Za-z0-9_-]+/` (**hyphen OR underscore** — the precise fix), plus PEM blocks (`:469`), `re_/whsec_/github_pat_/gh[opsur]_` (`:477`), long bare hex (`:479`), AND exact-removal of the connection's own decrypted secret values (`:465`) as the net for prefix-less secrets (Vercel/SMTP). Thorough. ✓
- **Defect 4 — history route refuses a forged `assistant` role (security), CONFIRMED:** `editor-ai/history/route.ts:123-128` refuses `body.role !== "user"` with 400 "Only your own messages can be added here" — "a request body claiming to be the assistant is a forged transcript line, refused out loud rather than coerced quietly." Route also role-gated (`:86`), Dev-Mode-gated (`:87`), CSRF origin-checked (`:90`), agency-scoped with **no existence oracle** (`:106-108`, foreign project → 404 "same answer an invented id gets"). ✓
- **Defect 6 — cross-project credential isolation (security), CONFIRMED:** real render harness `smoke-aqua-editor-ai-stale-key-panel.harness.tsx` exists; `AquaEditorAIKey.tsx:79` `unread = status?.projectId !== projectId` gates model/instructions/`configured`/render (`:82,:83,:117,:152`) — project B never wears project A's credential facts. ✓
- **Defect 2 — history writes key on the cleaned agency/project id:** `editorAiHistory.ts:132-133` cleans both; write paths thread `project.id` (`:369,:418`). ✓
- (Defects 3 "delete on never-chatted project mints no record" and 5 "60-msg cap counts evictions" — lower-risk correctness, not source-verified individually; covered by the green suite.)

Full suite green (3057 / 0), `tsc` clean per the entry. **Verdict: ✅ PASS** — a genuine security-hardening pass; the plaintext-key-leak fix is real and comprehensive. Queue clean.

## 2026-08-21 — ✅ PASS — "Dev Editor fix pass: four tag/words defects + save-body tag unlock" — fixes real in source, not test-weakening

Audited the fix-pass claim (the DevEditor tag/words build I watched go red→green over ticks 153-154, now logged). Verified **at the source** that each fix is genuinely implemented — the key test being whether they fixed the code or just made tests green. **Confirmed real:**
- **Defect 1 (editor learns a just-verified tag):** `DEV_PROJECTS_CHANGED_EVENT = "aqua:dev-projects-changed"` dispatched by `_DevEditorSetup.tsx:33`, listened + cleaned up in `DevEditor.tsx:462/465`. ✓
- **Defect 2 (revoke a dead tag):** `aquaTagIdFromCheck` (`engines/editor/server/devProjects.ts`) — not-verified + `tag?.reachable` → `return undefined` (definitive absent/foreign → **revoke**); else `return existing` (unreachable → **keep**). Matches the claimed "revoke on definitive negative, keep on indeterminate" exactly. ✓
- **Defect 4 (apostrophe context inversion):** `contextAt(lineText, at, file)` (`sourceMatch.ts:268`) derives context from file type and **refuses with `unknown-context`** (`:423`) rather than guessing. ✓
- **Defect 6 (save-body tag unlock) — security-relevant, CONFIRMED:** the projects route **refuses a body-supplied `aquaTagId` with 400** (`route.ts:274-276`, "connected by Map or Check it, never by a save") and preserves the **earned** id server-side via `getDevProject(session.agencyId, body.id)` (`:292`, agency-scoped). A save genuinely can't self-grant the browser gate — real privilege-escalation prevention. ✓
- (Defect 3, words-publish 422 → build from edit-branch tip: not source-verified individually; covered by the now-stateful `smoke-editor-words-publish` in the green suite.)

**Test rewrites are legitimate, not weakening:** the old "never revoke" and "a save carries the value through" pins were rewritten to pin the *opposite* — but the new rules (revoke a definitively-dead tag; a save can't plant the gate) are the **correct** ones; the old pins were the bug. Full suite green (3048 / 0). **Verdict: ✅ PASS.** Queue clean.

## 2026-08-21 — ✅ PASS — "Doc prune: 11 records archived, three 'where we stand' files → one" — moves real, nothing lost

Audited the newly-logged doc-prune claim. Verified the load-bearing, most-falsifiable points; **all hold:**
- **11 records genuinely moved** to `docs/context/archive/` (present + README). The dir has 15 files, but 4 (`staff-worker-handoff`, `erasure-worker-handoff`, `kpi-worker-handoff`, `handoff-inbox-chat`) are **pre-existing** archive residents (the tick-142 editor-move entry already cited `archive/staff-worker-handoff.md`) — the 11 *new* moves reconcile exactly.
- **Moved, not copied** — all 5 sampled old paths (`WHERE-WE-ARE.md`, `development/WHERE-WE-STAND.md`, `SESSION-HANDOFF-2026-08-18.md`, `development/phases.md`, `website-editor-and-migration.md`) are **gone** from source. No duplication left behind, which was the stated goal. ✓
- **`development/handoffs/` dir removed** (held only the one moved file), as claimed. ✓
- **`super-editor.md` confirmed never existed** (`find` empty) — the dangling ref cited from 3 places was resolved honestly, not by inventing the file. ✓
- **Nothing load-bearing broke:** full suite green (2765 / 0) — validates the claim's "no test needed editing" and the in-process parser re-runs (roadmap %s unchanged). ✓
- **Honesty:** the entry *disclosed* its one suite fail (`smoke-editor-write-path`, another agent editing `dev/files/route.ts`) rather than hiding it; my current run is green, so it has since resolved — confirming it was unrelated to the prune.

**Scope note:** did not independently reproduce the full "68 links repointed / 9→10 broken" link-check (disproportionate for a doc pass with the integrity checks all green); verified the structural moves + no-loss + no-test-breakage instead. **Verdict: ✅ PASS** — an archive-not-delete pass that keeps every dated record and collapses the three "where do we stand" files to one, exactly as claimed. Queue clean.

## 2026-08-21 — ✅ PASS — "Dev Team editor split + universal-editor copy fix + nine doc defects" — verified, unusually accurate

Audited the second newly-logged editor claim (the split I flagged unlogged at tick 132, now logged — honestly marked "logged late"). Tested its most falsifiable assertions; **every one holds, including the subtle traps:**
- **The split:** `editor/page.tsx` is a real page (`DevEditorProjectsPage`, `:27`) rendering the projects workspace; only `redirect()` is the auth branch (`:33`) — **not a stub**. `editor/studio/page.tsx` mounts `DevEditor.tsx` (verified tick 133). ✓
- **Sidebar = exactly SEVEN** (`layout.tsx:74-89`): Home · Roadmap · Findings · Library · Tools · Editor · Notes, exact order. **Zero `chat`** in `layout.tsx`; `dev-team/chat/page.tsx` still exists + renders `TeamChat` (`:8,:23`), unlinked. ✓
- **Six portal→universal copy strings** in `DevEditor.tsx`: all six OLD strings **gone**; new ones present (`Loading...` `:364`, "…before opening the editor on this project" `:463`, `Inspector` FAB). ✓
- **The honesty trap passes:** `"Loading portal design"` remains **exactly once** (`grep -c` = 1) — the ungated notice became "Loading…", but the portal-design-*fetch* point keeps it, precisely as the entry claims. Portal-doc-branch copy (`Portal template`/`Publish portal`/`Portal CSS`/`Add a portal component`) kept. ✓
- **Doc defects (spot-checked 2 of 9):** `portal-ui.md:162` now "Sections — SEVEN" (was SIX); `components/editing/` is **exactly 10 files** (claim: "10, not 3"). ✓
- **Suite green:** 2709 pass / 0 fail / 1 skip — matches the claimed baseline exactly.

**Verdict: ✅ PASS.** A model entry — specific, self-aware about being logged late (the process gap I'd flagged for ~10 ticks, now owned), explicit about what was deliberately kept and why, and it even documents **restoring** dated prose the doc-sweep had overwritten (rejecting "rewrite history to match the present"). Both editor claims now audited & cleared; queue clean.

## 2026-08-21 — ✅ PASS — "Editor moved out of the portals route (`_ClientPortalStudio` → `DevEditor.tsx`)" — verified clean

Audited the newly-**logged** claim (top of `updates.md` — the editor's move out of the portals route). It's the first new claim in a long while, and after ~30 ticks of the underlying work shipping unlogged, it landed as a clear, confident entry. **It holds on every checkable point:**
- **Move done:** `src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx` is **gone**; `src/engines/editor/DevEditor.tsx` exists and exports `DevEditor` (`:136`). Component `ClientPortalStudio` → `DevEditor` as claimed.
- **Grepped clean (code):** **zero functional references** to the old name/path anywhere in `src/` + `scripts/` — the only hits are two self-documenting provenance comments inside the new file (`DevEditor.tsx:11,20`). All 7 named tests are clean. (I watched the last three test files' old-name refs disappear **mid-audit** — the worker was finishing the cleanup live; a re-grep confirmed clean. Live-tree reminder.)
- **"Deliberately NOT renamed" items intact:** `src/engines/editor/server/portalStudio.ts` + `loadPortalStudioProps` / `PortalStudioClient` / `PortalStudioTemplate` all present, exactly as the entry says.
- **Suite green:** 2710 tests, **2709 pass / 0 fail / 1 skip** — matches the claimed count exactly. Behaviour-preservation is covered by the editor contract tests (mode ladder, assistant wiring, both doors, target-awareness, client-portal-studio) all passing.
- **Docs:** `docs/reference/` regenerated **grep-clean**. Sampled 4 of the 7 prose docs that still name the old path (`CURRENT-IMPLEMENTATION.md`, `portal-ui.md`, `website-editor-and-migration.md`, plan `dev-editor-engine.md`) — each names it only as an honest **dated migration note** ("used to live at X … moved out 2026-08-21 → DevEditor.tsx"), not a stale current-fact. Correct practice, matching the entry's own stated philosophy about dated records.

**Verdict: ✅ PASS.** A clean, thorough, honestly-documented structural move — no dangling references, contracts preserved, counts truthful, docs migration-aware. This also retro-confirms my tick-132/140 reads: those earlier editor reds were exactly this refactor landing in stages, each self-resolving as the worker finished + updated tests.

## 2026-08-21 — 🟡 SUITE RED (2 fails) — stale tests after an unlogged dev-editor split; behavior PRESERVED, tests need re-pointing

> **✅ RESOLVED next tick (2026-08-21):** both tests were **re-pointed to the `studio/` route** (now reference `studio` — 9× in `smoke-dev-editor-engine`, 3× in `smoke-aqua-editor-ai`); both files pass **15/15**, full suite **green again (2686 / 0)**. Fix matched the routing note exactly. Left below as the record.

**Full suite is red: 2685 tests, 2 fail** (both reproduce in isolation — not phantoms). Traced both to **one root cause**: the **dev-team editor was split (unlogged) into two routes**, and two source tests still pin the pre-split file.

**The refactor:**
- `src/app/portal/dev-team/editor/page.tsx` → now a **project-picker / setup** screen (`DevEditorSetup`), with an "Open editor" link.
- `src/app/portal/dev-team/editor/studio/page.tsx` (**new**) → the **real editor**: imports `ClientPortalStudio` from `_ClientPortalStudio` (`:11`), mounts it (`:50`), loads `loadEditorAssistant` (`:8,:47`), passes `assistant={assistant}` (`:61`).

**The two reds — both stale:**
- `smoke-dev-editor-engine.test.ts:29-33` ("mounts the full Portal Studio…") greps **`dev-team/editor/page.tsx`** for the `ClientPortalStudio` import — which legitimately **moved to `studio/page.tsx`**.
- `smoke-aqua-editor-ai.test.ts:75-84` ("is wired into both editor doors") greps **`dev-team/editor/page.tsx`** for `loadEditorAssistant` + `assistant={assistant}` — both **moved to `studio/page.tsx`**. (Editing-mode order `assist/simple/visual/developer` is unchanged — those subtests pass.)

**Verdict: behavior PRESERVED, tests STALE.** Verified both guarded contracts still hold at the new studio route — the dev door still mounts the real engine and still wires the assistant. Neither is a product defect. This is the same class as the cinematicMode / dev-tasks-parse stale-pins.

**⚠ → Commander:** **the suite is RED again** (banner's "green" is now stale). Fix is source (I'm read-only): re-point both assertions from `…/dev-team/editor/page.tsx` to `…/dev-team/editor/studio/page.tsx` (for the "both doors" loop, either swap the dev entry to the `studio/` path or add it). Also: **the dev-editor split is unlogged** — please add the `updates.md` entry. Watching next tick; if it clears (tests re-pointed) I'll confirm green.

## 2026-08-21 — 🟢 Banner's one "observed red" is RESOLVED — `smoke-dev-tasks-parse.test.ts` now 13/13

The top banner (written 2026-08-20) flags one red observed after its count was taken: `smoke-dev-tasks-parse.test.ts` failing **12 pass / 1 fail** in isolation, from a stale `/BLOCKED on Ed/i` assertion pinning a plan phase that had since shipped ("✅ Cohere — SHIPPED"). **That red no longer reproduces.** Re-ran the file alone today: the same **13 tests → 13 pass / 0 fail** (the one stale assertion was corrected, not deleted — count unchanged, the fail is gone), and it's likewise clean in the full suite.

**→ Commander:** the banner's ⚠ "one red observed since" can be **cleared** — the dev-tasks-parse test is green in both isolation (13/13) and suite. **No open reds.** (Banner's headline pass count `2382` is also stale now — live full-suite is **2631 / 0**, `tsc` last verified clean.)

## 2026-08-20 — 🟢 Light security spot-check of the (still-unlogged) SOPs feature — access control is SOUND

Companion to the governance spot-check below. The SOPs feature has also shipped **unlogged ~12 ticks**; it's the other client/agency-facing surface, so I checked its access control without waiting for a claim. **Sound — same clean pattern as governance:**
- **Clients can't read SOPs at all** — `assertSopsAccess` (`sopsAccess.ts:43-46`) 403s every non-agency role. The "SOPs client tab" is an *agency operator's* per-client stage filter (`familiesForStage`), **not** a customer-portal surface — so no client-facing exposure by construction.
- **Role-gated routes** — `api/portal/sops/*` refuse a non-agency session (401, fail-closed; `sops/route.ts:15-20`).
- **Agency-scoped end to end** — `listSops(session.agencyId)`, and create/update/delete all take `agencyId` from the **session**, never the body. The engine filters by `agencyId` (`sops.ts:12`) and **`getSop` returns `null` for a foreign id** (`:67`), so `updateSop`/`deleteSopRecord` gate through it (`:212-213`, `:236-237`) → a cross-agency id yields **404, not a cross-tenant edit/delete**. No existence oracle.
- Bonus: path-traversal guard on the local-file delete (`sops/route.ts:127`).

**→ Commander:** Both still-unlogged features (governance + SOPs) now have their **access control confirmed sound** (role-gated, agency-scoped, no cross-agency or read-oracle leak) — **neither is an open security hole**. The **functional** audits (what each actually computes/serves — compliance-snapshot accuracy, SOP content correctness) still need the features **logged** in `updates.md`. Suite green (2619/0).

## 2026-08-20 — 🟢 Light security spot-check of the (still-unlogged) governance feature — access control is SOUND

Given the governance feature has shipped **unlogged for ~9 ticks** (client/agency-facing, compliance data), I did a **light proactive security spot-check** of its access control — the highest risk for a compliance surface — without waiting for a claim. **It's sound:**
- **Role-gated + agency-scoped on every route** (`api/portal/governance/*`): the main + `legal` routes `requireRole(["agency-owner","agency-manager"])`; **`hipaa` is owner-only** (`requireRole("agency-owner")` — appropriate for the most sensitive compliance data); `erasure/preview` owner/manager. All use `session.agencyId`, never a body-supplied agency.
- **Company-scoping validated** — the `legal` route refuses a `companyId` not in the caller's agency (`:48`); all use the agency-scoped helpers (`listTradingCompanies(session.agencyId)`, `getClientForAgency(session.agencyId, …)`, `previewClientErasure(session.agencyId)`).
- So **no cross-agency exposure** in the governance access layer.

**→ Commander:** The unlogged governance feature's **access control is sound** (role-gated, agency-scoped, HIPAA owner-only, company-ownership validated) — **not an open security hole**. A **full** audit (what the compliance snapshot computes, HIPAA/legal accuracy, the "external AI proposals → Actions" behaviour) still needs the feature **logged** — please add the `updates.md` entry. Suite green as of tick 78 (2605/0). (The SOPs tab is likewise still unlogged.)

## 2026-08-20 — 🟡 Update — unlogged governance work: tick-73 red RESOLVED; new trivial completeness gap; still unlogged

**Rolling reds from the mid-flight, unlogged governance feature.** Re-checked this tick (isolating each):
- ✅ The tick-73 operational-notifications / Actions-attention red is **RESOLVED** — `smoke-operational-notifications` **15/0** in isolation (the counts were reconciled).
- 🟡 **New (real, trivial) red:** `smoke-tools-directory` (**5/1** isolated) — "Tools directory is missing reachable sidebar destinations: **`/portal/agency/governance`**. Add a card for each so navigation stays complete." The new governance page is in the sidebar but not yet in the agency Tools directory (a completeness guard doing its job). **Fix:** add a Tools-directory card for `/portal/agency/governance`.
- (phantom, not real) `smoke-client-erasure` "Promotion disposition map — exhaustiveness" passes **27/0 in isolation** — a concurrent-run transient, not an erasure regression.

**→ Commander:** The unlogged governance feature is still mid-flight (rolling completeness reds as its pages get wired). Trivial fix outstanding: add the `/portal/agency/governance` card to the agency Tools directory. **And — still — please log the governance + SOPs features** so they enter the audit queue (two unlogged product features now). The tick-73 count red is fixed; erasure is fine (that red was a phantom). Launch blockers resolved.

## 2026-08-20 — 🟠 RED (real, unlogged) — operational-alerts / Actions-attention counts broke; new governance / "external AI proposals" work

**Caught by the periodic full-suite check.** Suite **2576 pass / 3 fail** — and unlike the recent phantoms, these are **REAL** (reproduce in isolation: `smoke-operational-notifications` **12/3**, not a flake). Three count-mismatch failures in the **sidebar-attention / Actions** contract:
- "live alerts mark the relevant sidebar destination without making every area noisy" (expected 2)
- "pending external AI proposals feed Actions attention and parked proposals stay quiet" (expected 1)
- "open Actions keep a sidebar count until the underlying task is resolved"

**Source:** the growth (+16 tests) + recent unlogged source (`agency/governance/_GovernanceWorkspace.tsx`, marketing changes) points at a **new, unlogged governance / "external AI proposals → Actions attention" feature** that changed the operational-alerts counting so these behavioural contracts no longer hold. `updates.md` has no entry for it.

**Findings:**
- 🟠 **Real red: the Actions/sidebar-attention counts no longer match their contracts** (`smoke-operational-notifications:8-10`, isolated 12/3). Either a **regression** (the new governance wiring broke live-alert marking / proposal-feeds-Actions / open-Actions counting) or **unfinished mid-work** (tests + code not yet aligned). Can't tell which — the work is unlogged and mid-flight. **Route:** reconcile the Actions-attention counting with these contracts (fix the code, or if the contract changed deliberately, update the tests + say why), and **log the governance/proposals feature** so it can be audited.

**→ Commander:** Suite has a **real red** (not a phantom this time) — 3 sidebar-attention/Actions count mismatches in `smoke-operational-notifications`, from **unlogged governance / "external AI proposals → Actions" work** (new `agency/governance/` workspace, no `updates.md` entry). Reconcile the counts (regression fix, or a deliberate contract change with updated tests) + **log the feature**. This is now **two** unlogged product features in flight (governance/proposals + the SOPs tab from tick 70) — both need logging to be audited. Launch blockers otherwise resolved.

## 2026-08-20 — 📋 UNLOGGED product feature landed (SOPs) — green, but not in the queue; please log for audit

**Caught by the periodic full-suite check** (+28 tests → 2553, **green**; `updates.md` top unchanged). Most of the growth is internal dev-team tooling (`smoke-dev-team-perf`/`-ui`, `DevTeamTransition.tsx`, the churning `dev-tasks-parse`) — low product risk, actively iterated. **But it includes a new client-facing product feature with no `updates.md` entry:** **SOPs (Standard Operating Procedures)** — `src/app/portal/clients/[clientId]/_ClientSopsTab.tsx` + `smoke-sop-interactive.test.ts` (interactive SOPs on a client tab). It's green/tested, but **invisible to the docs-driven audit queue** — I can't verify a feature I have no claim for.

**→ Commander:** A real **client-facing SOPs feature** shipped **unlogged**. Please add an `updates.md` entry (what it does + its contracts — especially client-scoping / who may view + edit SOPs) so it enters the audit queue; I'll then audit it against that claim. I'm **not** reverse-engineering it from tests this tick (no claim to verify against, and that's error-prone). Suite green; the rest of the +28 is internal tooling. Recurring theme: substantial work keeps landing unlogged — the periodic full-suite run is the only thing surfacing it.

## 2026-08-20 — ✅ PASS — Three profile-menu toggles: Cinematic mode · real Performance mode · dev-icon toggle (closes my tick-67 stale-pin red)

**Verdict:** ✅ PASS. The `performanceMode → cinematicMode` rename I flagged at tick 67 is now **logged + its stale test pins updated** (suite green — my tick-67 red is resolved). All three toggles are sound: **cinematic mode** renames + migrates the old value (default plays; old perf=1 → cinematic off); **real performance mode** is a new server-readable cookie that gates two heavy fetches, **default OFF = byte-for-byte today**; the **dev-icon toggle** is correctly **ANDed with the founder gate** — a non-founder can't summon the Dev Console icon via the cookie — and it fixes a profile-menu nav bug.

**Audited:**
- **Ran the test myself:** `smoke-profile-toggles` **15/0** (cinematic default + migration, perf/dev-icon cookie parsers, skip-path markers, no-navigate assertion). Full suite green (2525/0); the tick-67 stale pins (`smoke-dev-mode`/`-console`/`-transition`) are updated to the new names.
- **Dev-icon toggle stays founder-gated — VERIFIED (the one security-relevant part).** `agency/layout.tsx:144` computes `devConsole = devDocsAccessible(session) && devIconVisible` — the founder gate **AND** the icon preference. Topbar renders the Dev Console only when `devConsole && !publicShowcase && !showcaseMode` (`:89`). So a non-founder (`devDocsAccessible` false) never sees the icon regardless of the `aqua_dev_icon` cookie; the toggle is a founder *preference* on the gate, not a replacement. The nav bug is fixed (the "Dev Mode" row no longer `window.location.assign`s; entering the workspace is the popover CTA).
- **Cinematic = behaviour-preserving rename + migration.** `cinematicMode.ts` `cinematicModeEnabled()` defaults **true** (cutscenes play), migrates the old `aqua-performance-mode` value (perf on → cinematic off) on first read; the 3 transition consumers skip when disabled; CSS re-keyed to `data-cinematic-mode`.
- **Real performance mode — default-safe + honest.** New `aqua_perf_mode` cookie (server-read `performanceModePreference()`, **default false**); when ON, `agency/layout` + `page` skip the `getRequestOperationalAlerts` Supabase sweep + keep `scanDevTeamBoard` off the landing critical path. **Off = no behaviour change.** Honestly caveated: only the two heaviest repeated costs are gated; radar/intelligence panels are a documented larger follow-up.

**Findings:** none. UI-preference toggles, correctly gated (dev-icon ANDed with the founder gate), behaviour-preserving rename with migration, perf-mode default-safe, nav bug fixed.

**→ Commander:** Mark **three profile toggles done** — cinematic rename+migration (behaviour-preserving), real perf-mode (server-read, default-off = byte-for-byte, two heavy fetches gated with an honest follow-up caveat), dev-icon toggle correctly founder-gated (`devDocsAccessible && devIconVisible` — no non-founder bypass) + nav bug fixed. Suite green; **my tick-67 stale-pin red is resolved** (rename logged + pins updated).

## 2026-08-20 — 🟡 RED (stale test pins from an unlogged rename) — `performanceMode → cinematicMode`; not a behavioural regression

**Caught by the periodic full-suite check** (unlogged: `updates.md` top unchanged, count stable 2507). Suite is **RED — 6 fail** (was 0 last tick), but they're **stale source-shape test pins from an unlogged rename**, not product regressions — verified by reading the failing assertions:
- **`performanceMode` → `cinematicMode` rename.** `smoke-dev-mode` (isolated **46/2**, so real-in-isolation but stale, not a flake) fails "reuses the command-transition CSS system and respects performance mode" because it asserts the source contains `/performanceModeEnabled\(\)/`, but the component now imports **`cinematicModeEnabled` from `@/lib/chrome/cinematicMode`** — the "skip cinematic loading screens" toggle was renamed. Same cause for "Dev Mode — cinematic load-in (Phase 3)" and "Dev Console — topbar wiring". The toggle behaviour is preserved under the new name; only the test string is stale.
- **Churning dev-tasks tooling** — `only the plans that genuinely have no phases yield none` (the same actively-iterated plan-parser).

**Findings:**
- 🟡 **Stale source-shape test pins after an unlogged `performanceMode → cinematicMode` rename.** The rename (source: `chrome/cinematicMode.ts` / `cinematicModeEnabled()`) wasn't reflected in the `smoke-dev-mode` / `smoke-dev-console` pins that still assert `performanceModeEnabled()`. Not a behavioural regression (the cinematic-skip toggle still gates the load-in + reduced-motion still respected) — but it red-lines the suite. **Fix (test + log):** update the pins to `cinematicModeEnabled()`, and log the rename in `updates.md`. Same recurring pattern as the roadmap/dev-team stale-test reds — a rename ahead of its test pins.

**→ Commander:** Suite red (6 fail) is **stale test pins from an unlogged `performanceMode → cinematicMode` rename** + the churning dev-tasks tooling — **not a product regression** (the skip-cinematic toggle still works, just renamed; the source uses `cinematicModeEnabled()`). Update the stale `performanceModeEnabled()` pins and log the rename. Launch state otherwise green; blockers resolved.

## 2026-08-20 — ✅ PASS — Website-enquiry tenant isolation: app-level ownership guard on brand_enquiries (a real HIGH cross-tenant hole, closed)

**Verdict:** ✅ PASS — a comprehensive, defense-in-depth fix for a **real HIGH multi-tenant hole** the worker found: `brand_enquiries` RLS was degraded to a no-op (null-tolerant policy + `profiles.agency_id` never populated → `current_profile_agency_id()` null → "any internal user manages EVERY agency's enquiries"), and the routes addressed rows by **enumerable id**, so an agency owner could **read / reply / erase another agency's enquiries.** The new app-level ownership guard closes it on every `brand_enquiries` route, is column-authoritative (no metadata spoof), has **no existence oracle**, and works before + after the pending migration. Tested. **(Honest note: my tick-64 RLS audit verified the scoped client *applies* RLS but did not catch that the *policy itself* wasn't isolating pre-migration — the worker did. Verifying "the code uses RLS" ≠ verifying "RLS actually isolates.")**

**Audited:**
- **Ran the test myself:** `smoke-enquiry-tenant-isolation` **11/0** (guard predicate, foreign-id-looks-like-missing pre+post migration, form-capture cross-tenant).
- **Guard is column-authoritative + no oracle (`ownedEnquiry.ts`).** `loadOwnedEnquiry` returns a row only if owned: `agency_id` column equals the caller's agency, OR (column absent pre-migration) `metadata.agencyId` equals it — **a row whose column names a DIFFERENT agency is never owned via metadata** (`:41-46`, the column is authoritative → no metadata spoof). A foreign row and a missing row **both return `null` identically** (`:26-27`) — no existence oracle, so ids can't be enumerated across tenants. Projects `agency_id`, retries without it on the pre-migration `42703`.
- **Wired into EVERY brand_enquiries route — VERIFIED.** All 7 that read/mutate the table load through the guard with `session.agencyId`: `erase`, `classification`, `status`, `reply`, `lead`, `communications`, `calls` (+ recording). I confirmed each is GUARDED, and that the only two website-enquiries routes NOT using it (`contact-details`, `form-template`) **don't touch `brand_enquiries`** (their own agency-scoped stores, verified tick 1) — correctly out of scope, not a missed route. `form-capture` (admin-client ingestion) now scopes its email/phone match to the resolved agency — holds the capture rather than attaching to a stranger.
- **Root cause addressed.** `provisionSupabaseIdentity` now stamps `profiles.agency_id` (retries pre-migration); the agency-aware callers pass it — so once Ed applies the migration, RLS scopes the table itself with no code change. Defense-in-depth: the app guard holds regardless.

**Findings:** none. A thorough closure of a real HIGH cross-tenant hole — app guard on every route + root-cause profile stamping, column-authoritative, no existence oracle, tested.

**→ Commander:** Mark **website-enquiry tenant isolation done** — a real HIGH hole (cross-agency enquiry read/reply/erase via enumerable ids over a degraded RLS policy) is closed at the app layer on every `brand_enquiries` route (column-authoritative ownership, no existence oracle), form-capture cross-tenant attach closed, and the root cause (unstamped `profiles.agency_id`) fixed so RLS will isolate once the migration lands. **This raises the priority of applying the `brand_enquiries` migration** (`supabase db push`) — the app guard is the belt; the migration is the braces (DB-enforced). Suite green.

## 2026-08-20 — ✅ PASS — The finish list: `?? 0` trap closed · shared KPI views · battle-table P5 · Aqua Tags nav

**Verdict:** ✅ PASS on all four. The two with substance hold: the **`?? 0` fabricated-zero trap is genuinely closed** (an unmeasured reading is `null`, never a fabricated 0; a measured zero stays 0), and **shared KPI views are agency-scoped + role-gated** (no cross-agency leak). Battle-table P5 is look/feel only; the Aqua Tags nav is one additive row. All test-pinned.

**Audited:**
- **Ran the suites myself:** commercial-intelligence **10/0**, kpi-shared-views **6/0**, battle-table **18/0**, nav-audit **29/0**.
- **`?? 0` trap closed — the honesty contract (issues #15).** `commandIntelligenceService.ts`: KPI `value: number | null` (`:65`); `traffic7d`/`forms7d` come from `measuredCheckValue` (nullable) and render `null → "—"` not 0 (`:162,169`), with evidence that literally says "No pageview reading yet — **not a measured zero**". Behaviourally pinned: an unmonitored agency → `lineage.pageviews === null` / `pageviewsMeasured === false` ("a consumer cannot see a fabricated 0", `test:96-99`), and a *measured* zero (pageviews:0) → derived roas/conversion stay `null` (zero-denominator, not a fake value, `:81-87`). Same fabricated-zero honesty verified across Marketing/KPI/Client-Health, now on the commercial-intelligence funnel.
- **Shared KPI views — agency-scoped, role-gated.** `kpi-registry/views/route.ts` GET/POST/DELETE all `requireRole([...AGENCY_ROLES])` and scope to **`session.agencyId`** (never a body-supplied agency) via `kpiSavedViews.ts` (same pattern as `kpiTargets`) — a shared view can't cross agencies. `saveSharedKpiView` logs `actorUserId`; same-name replaces (matches the browser-local half).
- **Battle Table P5 (cosmetic)** — a command-rail drill-in strip + war-room accent on the 10 planning stations; a Phase-5 shape test pins it, no logic/data change. **Aqua Tags nav** — one additive `sidebarLayout.ts` row → `?view=tags` (+ allow-list id), pinned by `smoke-nav-audit`. Both trivial + additive.

**Findings:** none. Four small items, all clean; the two substantive ones (fabricated-zero honesty, agency-scoped shared views) verified.

**→ Commander:** Mark **the finish list done** — `?? 0` trap closed (unmeasured → null, not fabricated 0; measured zero stays 0 — issues #15 resolved), shared KPI views agency-scoped + role-gated, battle-table P5 cosmetic, Aqua Tags nav additive; all test-pinned, suite green. **This clears the recent logged backlog** — MFA 3+4, RLS residue, Aqua Engine, and this are all now audited; the queue is back to clean.

## 2026-08-20 — ✅ PASS — RLS residue: service-role 23→13 (scoped client respects RLS) + brand_enquiries tenant column (resolves my tick-62 red)

**Verdict:** ✅ PASS. A real tenant-isolation improvement: 10 website-inbox routes moved off the RLS-bypassing admin key onto a **scoped client** (anon key + the caller's Supabase cookies → RLS applies as the signed-in user), so a **demo/showcase session now 401s instead of mutating real enquiries via the admin key.** Service-role sites cut 23→13, each now pinned + documented — this **resolves my tick-62 RLS-docs red**. The `brand_enquiries` agency-column migration is honestly flagged as **not yet applied** (Ed runs it). Suite green.

**Audited:**
- **Ran the tests myself:** `smoke-service-role-usage` **3/0** (was RED at tick 62 — now green, the 13 survivors documented) and `smoke-rls-policy-coverage` **9/0** (brand_enquiries tenancy contract). Full suite green (2495/0).
- **Scoped client genuinely respects RLS (`supabase/scoped.ts`).** It builds the "signed-in user's OWN Supabase client — **anon key** plus the caller's session cookies, so every query runs under row-level [security]" (`:9-10`) — **not** the service-role/admin key that bypasses RLS. It **throws `AuthError(401)` when no live Supabase user backs the request** (`:37`) — so a demo/showcase session (cookie-only, no Supabase identity) gets a loud 401 instead of reading/mutating real data. The 10 `website-enquiries/*` + `inbox/media` routes use it. The load-bearing tenant-isolation fix, and it's real.
- **Service-role reduction measured + guarded.** 23 sites/18 files → **13 sites/8 files**; `smoke-service-role-usage` pins the 13-set **and** requires each survivor justified in `rls-enable.md` (the guard whose docs-gap I flagged tick 62 — now satisfied). Enquiry hard-delete is `.select("id")`-verified so an RLS-filtered delete can't silently no-op. The remaining 13 are legitimate (public ingestion, storage, health).
- **Graceful pre-migration.** Public insert paths stamp `agency_id` + `metadata.agencyId` with a `PGRST204` retry-without-column, so enquiry capture survives the window before the migration lands.

**Findings:**
- (note, not a defect) **The `brand_enquiries` agency-column migration is not applied yet** — honestly flagged; **Ed runs `supabase db push` from `aquaCRM/supabase/`, then `rls-verify.sql`.** Until then, DB-level tenant scoping of `brand_enquiries` by `agency_id` is pending (the app-code changes — scoped client, demo-401, insert stamping — are already live; the migration's shape is pinned by `smoke-rls-policy-coverage`). I can't apply/verify a live migration; its structure (column + backfill + keep-filled trigger + agency-matched policy, null-tolerant ratchet) reads sound and is test-pinned.

**→ Commander:** Mark **RLS residue done (code)** — service-role cut 23→13 with the movers now on an RLS-respecting scoped client (demo sessions 401 instead of admin-key-mutating real enquiries), the 13 survivors pinned + documented (**resolves my tick-62 red**), hard-delete no-silent-no-op. **Action for Ed:** apply the `brand_enquiries` agency-column migration (`supabase db push` + `rls-verify.sql`) to land the DB-level tenant column. Suite green; launch blockers resolved.

## 2026-08-20 — ✅ PASS — MFA Phases 3+4: session assurance · side doors closed · recovery codes

**Verdict:** ✅ PASS. The security-critical part — **"side doors closed"** — genuinely holds: neither magic-link nor Google-OAuth can mint a session for an MFA-enrolled account; both call the gate **before** minting, refuse an enrolled account, and **fail closed** when enrolment can't be read. Session assurance stamps `aal` honestly, and recovery codes are scrypt-hashed + single-use-by-deletion + rate-limited + post-password. Behaviourally tested (the doors test asserts *no cookie is minted*). One honestly-flagged, low-exposure residual.

**Audited:**
- **Ran the suites myself:** `smoke-mfa` **70/0**, `smoke-mfa-doors` **13/0**; full suite green (2495/0, tick 63).
- **Side doors closed — VERIFIED (the crux).** Both `auth/magic/verify` (`:58-59`) and `auth/oauth/google/callback` (`:60-61`) call `checkSideDoorMfa(email)` **before** any `issueSession`, and `return err(…)`/403 when the decision is `refuse` — a refused sign-in never mints. `gateSideDoorSession` (`mfa.ts`): `unavailable → refuse` (fail-closed — "nothing confirmed, nothing minted"), `absent → clear`, `found → hasVerifiedFactor ? refuse : clear`; `hasVerifiedFactor` keys on `status === "verified"` (an un-confirmed enrolment doesn't falsely block). The OAuth gate "sits before BOTH paths, the first-run bootstrap included." So MFA cannot be bypassed via magic link or Google.
- **Session assurance — honest.** Every session-minting route stamps `aal` — `aal2` **only** when a second factor (TOTP/recovery) was actually verified by the minting flow; password/magic/Google → `aal1`; absence fails closed. Read via `sessionAssurance`/`sessionHasSecondFactor`.
- **Recovery codes — secure.** Ten single-use codes, **scrypt-hashed** at rest (same format as passwords), **spent by deleting the hash** (single-use by absence, not bookkeeping), same 5/min limiter + lockout as TOTP, and only reachable **after a correct password** (not a standalone bypass). Shown once; native form-posts never trigger generation.
- **Tests behavioural (B).** `smoke-mfa-doors` imports the **real** `magicVerify`/`oauthCallback` GET handlers and asserts the security property directly — *no session cookie comes back* for an enrolled account, and refuse-on-unavailable ("an open-on-failure door is not closed"). `smoke-mfa` adds the recovery loop, aal stamps, shown-once, form-post suppression — "all red before the wiring."

**Findings:**
- 🟡 (honestly pre-flagged, low exposure, verified) **The two signup routes don't run `checkSideDoorMfa`** — but both **refuse existing emails** (`end-customer/signup:97-101` → 409; `auth/signup` → account-existence message), so signup can only create a **new** account (no MFA to bypass), not sign into an existing enrolled one. Exposure ≈ nil for the MFA-bypass concern. **Optional:** add the gate for defense-in-depth, or document the reliance on the existing-email refusal. (Also builder-flagged, non-security: recovery generation isn't on the enrolment screen yet; "backup codes" was a guess pending Ed's confirm.)

**→ Commander:** Mark **MFA Phases 3+4 done** — the side-door closure is real and verified (magic + OAuth refuse enrolled accounts before minting, fail-closed), session assurance stamps aal honestly, recovery codes are scrypt-hashed + single-use + post-password, all behaviourally tested (the doors test proves *no cookie minted*). **With the Phase 1–2 login gate (verified tick 58), MFA is now a complete, non-bypassable feature.** ⚠ Ops note (builder-flagged): the two doors now **require `SUPABASE_SERVICE_ROLE_KEY`** to mint (fail-closed by design) — confirm it's set in Vercel, or magic/OAuth sign-in returns `mfa_unavailable`.

## 2026-08-20 — 🟡 RED (docs-completeness, security-governance) — 8 service-role (RLS-bypass) files undocumented in the RLS plan

**Caught by the periodic full-suite check** (unlogged: count grew +6 → 2463, top of `updates.md` unchanged). One real red (reproduces in isolation), and it's a **governance/audit-trail gap, not a code bug:** `smoke-service-role-usage.test.ts` — its call-site **count is stable (13 sites / 8 files — that subtest passes)**, but a second subtest fails: **8 service-role files are not documented in `docs/development/plans/rls-enable.md`** — `clients/[clientId]/erase/route.ts`, `public/brand-enquiry`, `public/form-capture`, `telemetry/collect`, `databaseStorageHealth.ts`, `privateUploadStorage.ts`, `publicUploadStorage.ts`, `websiteEnquiries.ts`.

**Why it matters (mildly):** each service-role call **bypasses Supabase RLS**, so tenant isolation there rests on code, not the DB. The guard requires the RLS plan's phase-4 table to justify *why* each remaining site keeps the service role — otherwise the "we reduced service-role usage" claim can't be audited. The 8 sites look **legitimate** (public ingestion endpoints, storage, a DB-health probe — places that genuinely run without a user session or must cross tenants), so the fix is to **document/justify them**, not remove them.

**Findings:**
- 🟡 **The RLS plan doesn't document 8 of the 13 service-role sites.** A governance guard (likely newly-added, hence unlogged) is red until each RLS-bypass is justified in `rls-enable.md`. **Fix (docs, route to whoever owns RLS):** add the 8 files to the phase-4 table with a one-line "why this keeps the service role" each. Not a code regression — the count is stable and the sites are legitimate.

**→ Commander:** Suite has 1 red — a **docs-completeness governance gap**, not a bug: 8 RLS-bypass (service-role) files aren't justified in `rls-enable.md`, so the "service-role reduction" can't be fully audited. Finish the phase-4 table (one line per file). Likely mid-work (the guard was just added). Launch state otherwise green; blockers resolved.

## 2026-08-20 — ✅ PASS — Editor renamed to "Aqua Engine" (user-facing labels only)

**Verdict:** ✅ PASS. A safe cosmetic rebrand — the display name a user sees ("Website Editor" / "Portal editor" / "Open Studio" → **Aqua Engine**) across labels, tabs, buttons, hints, aria-labels. Correctly **did not** touch the load-bearing identifiers: the `website-editor` plugin id (keys installed state), URLs, and internal code identifiers are unchanged — so no persistence/routing/code break. `tsc` 0, suite green (2457/0, my run); 2 test pins updated. Nothing to flag.

**→ Commander:** Mark done — labels-only rename, identifiers preserved (no state/URL/code impact), verified green.

## 2026-08-20 — ✅ PASS — Codebase reorganised into domain folders (pure move, verified clean)

**Verdict:** ✅ PASS. A pure structural move — `src/lib/` (71 loose → 15 domain folders) and `src/lib/server/` (89 files → 12 families) reorganised, every reference form rewritten (aliases, relative imports, literal path strings, `join()` builds — 1,700+ touches). No logic changed, and I independently confirmed it's clean: **`tsc --noEmit` 0 errors**, suite at the **exact pre-move baseline** (2458 tests, 0 fail), and **no dangling old flat-path references**. Reduces duplication (six twin filenames resolved) as a bonus.

**Audited:**
- **`tsc --noEmit`: 0 errors (ran it myself)** — the authoritative check for a move: every import across the entire graph (including files no test exercises) resolves to its new location. Conclusive that no reference was left dangling.
- **Suite at the exact pre-move baseline — 2458 tests / 0 fail** (my run) — no test lost, no behaviour changed; the count matches the claim's pre-move baseline, so the move is behaviour-neutral.
- **No dangling old paths** — spot-grepped four files I'd cited at their old flat paths in prior audits (`@/lib/businessRadar`, `clientRadar`, `kpiRegistry`, `marketingIntelligence`) → **zero** old-path references remain; they're now under `radar/`, `clients/`, `kpi/`, `intelligence/` with all refs rewritten. The literal-path-string + `join()` rewrites (the classic move-refactor miss, invisible to `tsc`) were handled, and a `doesNotMatch` test guard was fixed so it didn't go trivially green.
- **Scope + hygiene.** Deliberately did NOT move what shouldn't move (`scripts/*.test.ts` — the glob is law; `src/app/` — paths are URLs; `built-ins/`, `components/`, `src/server/`). Six twin `*Service.ts` filenames resolved (logged in hazards-and-duplication.md); pre-move `src/` snapshot kept; workspace tree + symbol reference regenerated.

**Findings:** none. A rigorous, behaviour-neutral move — `tsc`-clean, suite at baseline, no dangling references, duplication reduced.

**→ Commander:** Mark **codebase reorg done** — verified a pure move: `tsc` 0 errors (whole graph resolves), suite at the exact pre-move baseline (2458/0), no dangling old-path references, duplication reduced, nothing changed behaviourally. (Heads-up: prior audits' `file:line` references to `src/lib/*` files now point at their *old* flat paths — the domain-folder locations are in the regenerated symbol reference / WORKSPACE-FILE-TREE.md.) Launch state unchanged: green, blockers resolved.

## 2026-08-20 — ✅ PASS — Docs-accuracy pass, and my tick-24 MFA finding is RESOLVED: login 2FA is now genuinely BUILT

**Verdict:** ✅ PASS on the load-bearing claim. The pass reconciles stale docs to source with `file:line` evidence, and the one I most needed to check — because it **contradicted my tick-24 finding** — holds: **MFA at login is now genuinely BUILT** (it was *absent* when I grepped this route at tick 24). So my tick-24 "MFA Phase 4 complete is false / login has zero MFA" finding is **RESOLVED** — the feature was subsequently built (unlogged), and this pass honestly corrected the docs.

**Audited:**
- **Re-verified the MFA claim in source (`api/auth/login/route.ts`).** At tick 24 I grepped this exact route → **zero** mfa/aal/factor/totp. **Now it has a real second-factor gate:** imports `loginMfaStep`/`raisedToSecondFactor` from `@/lib/server/auth/mfa` (`:19-22`); `loginMfaStep({user, code})` (`:312`) → `mfaRequired: true` refuses the session without a code (`:320`); rate-limited code attempts (`:329`); real `supabase.auth.mfa.challenge`/`verify` (`:340-344`); and the load-bearing check — **`if (!verified || !raisedToSecondFactor(verified.access_token))`** (`:355`) refuses unless the returned session's **`aal` claim actually rose** (a 200 that didn't raise assurance is rejected). A correct gate, not a rubber-stamp. Phases 3–4 (session assurance, recovery codes) remain honestly open per the pass.
- **The pass's method is sound (checklist F).** It read the source for each claim and marked fixed items **RESOLVED with `file:line` evidence rather than deleting them** — connect codes shipped (matches my Connect-flow audits), RLS on in live Supabase, radar infra health, issues #9b/#15. It also honestly re-scopes an earlier wrong "no RLS migrations" note (they exist — 14 migrations in `aquaCRM/supabase/migrations/`, only visible outside `portal/`). Corrections, not overclaims.

**Findings:** none. An honest source-verified reconciliation that closes a real gap I'd flagged.

**→ Commander / Ed:** **My tick-24 MFA finding is RESOLVED** — sign-in 2FA is now genuinely built with a proper `aal`-raise gate (not just claimed). The "is 2FA a launch requirement / it doesn't exist today" question I raised is now **moot for the login gate** — it exists; only MFA Phases 3–4 (session-assurance, recovery codes) remain open. Docs-accuracy pass is honest (source-verified). Suite green (2457/0, tick 57). The one standing decision still on Ed: the **data-retention time-limit** (DPO pack Q1).

## 2026-08-20 — ✅ SUITE GREEN again (tick 55) — every recent red resolved

**Verdict:** ✅ Re-ran the full suite: **2413 pass / 0 fail / 1 skip.** The active-development burst (ticks 47–53) has fully settled; **every red I flagged is now resolved:**
- ✅ Meta "fail closed" security regression → `smoke-meta-master-inbox` 5/5.
- ✅ Roadmap dangling-plan reference (`roadmap.md:121`).
- ✅ `seventyNinthCollection` state-collection **data-loss gap** → wired into `parseBlob`/`empty()`, `smoke-state-roundtrip` 3/3.
- ✅ The churning `smoke-dev-tasks-parse` red → now green (the commander's banner diagnosed it as a **stale test** pinning the marketing plan's "BLOCKED on Ed" prose after that phase legitimately became "✅ SHIPPED" — plan right, test stale).

Closes the loop on the commander's banner ("one red observed since"). Standing process point still holds: much of that burst landed **unlogged** and was caught only via periodic full-suite runs.

**→ Commander:** Confirming **suite fully green (2413/0)** — all recent reds cleared, launch blockers remain resolved. Nothing open on my side.

## 2026-08-20 — 🟠 SUITE RED BURST (unlogged, mid-flight) — a new PortalState collection isn't wired into persistence (data-loss gap)

**Caught by the periodic full-suite check.** A burst of unlogged work landed (~+55 tests → **2410**; the docs-queue still shows nothing new), and the suite went from 1 red to **~9 fails** (that run also reported an anomalous exit-0, and the machine is under heavy load — workers actively mid-flight, suite >2min). I verified the clearest, most concrete failure directly in isolation:

- 🟠 **A new `PortalState` collection is not persisted — `smoke-state-roundtrip.test.ts` (isolated 2 fail, real, not a flake).** The state-roundtrip integrity guard reports **"parseBlob spreads parsed but still omits: `seventyNinthCollection`"** + a second failure that it has **no `empty()` default**. So a `seventyNinthCollection` field was added to `PortalState` (`types.ts`) but **not wired into `storage.ts`'s `parseBlob` (rebuild-from-blob) or `empty()` (default)** — it would **not survive a save/load round-trip (data loss)** and has no default (undefined-access risk). The guard is doing its job. **Fix (trivial):** add `seventyNinthCollection` to `parseBlob`'s rebuild + `empty()`'s defaults, the pattern every other collection follows. *(Placeholder-ish name → likely WIP, but the type + guard are live, so the tree is red until it's wired.)*

**The other ~7 fails** are in the still-churning `dev-tasks`/roadmap tooling + likely cascade from this mid-flight burst; I did **not** enumerate each against a rapidly-changing tree (they'll shift next tick). The state-integrity gap above is the concrete, non-churning one.

**→ Commander:** **Suite is RED again (~9 fails) from a fresh burst of unlogged work.** The one to fix now regardless of the churn: **wire `seventyNinthCollection` into `parseBlob` + `empty()`** (`storage.ts`) — a new state collection currently can't persist. And (recurring) **LOG this work in `updates.md`** — a +55-test burst with 9 fails is entirely invisible to the docs-queue. I'll re-assess the full fail-set once the active work settles. Launch blockers otherwise clear.

## 2026-08-20 — 🟠 SECOND SUITE RED (regression, unlogged) — Meta "fail closed" security test broken at readiness; its security assertions no longer run

**Caught by the periodic full-suite check** (the queue still shows nothing new). A **second** red has appeared since tick 35: `smoke-meta-master-inbox.test.ts` "Meta readiness, OAuth state and webhook signatures fail closed" now **fails**, and it's a **real regression** — fails in isolation (4/1), not a flake. It was **5/5 green when I audited it at tick 14**. Suite is now **2343 pass / 2 fail** (roadmap + this).

**The failure is at readiness (`test:26`), which aborts the security checks below it.** `metaInboxReadiness("agn_test").configured` returns **false** where the test expects **true**, even though the test sets the full standard env (`META_APP_ID`/`APP_SECRET`/`WEBHOOK_VERIFY_TOKEN`/`GRAPH_API_VERSION` + an https base URL). The env→values mapping (`integrationConnections.ts:301-306`) and readiness's required fields (`metaMessaging.ts:57-74`) both *look* intact on inspection, so the break is subtler — consistent with **unlogged Meta/Instagram work** (the same test now asserts `www.instagram.com` + `instagram_business_manage_messages`, added with no `updates.md` entry). Whoever made that change must diagnose the readiness regression.

**Why it matters:** the test aborts at line 26, so the **fail-closed security assertions never run** — the OAuth-state-tamper check (`verifyMetaOAuthState(state+"tampered").ok === false`, `:39`) and the webhook-signature-tamper check (`verifyMetaWebhookSignature(raw+"x", …) === false`, `:51`) are now **unverified, not proven broken**. So this is **not** a demonstrated fail-open — but the Meta webhook/OAuth fail-closed guarantees (sound at tick 14) are **no longer test-protected** while it's red, and the regression itself is real and unexplained.

**Findings:**
- 🟠 **Real unlogged regression red-lines the Meta security test.** `metaInboxReadiness` reads not-configured with the standard env (`smoke-meta-master-inbox.test.ts:26`), aborting the fail-closed OAuth/webhook assertions. **Fix (route to whoever did the Meta/Instagram change):** diagnose why readiness returns false with the standard `META_*` env, restore it, and confirm the OAuth-state + webhook-signature fail-closed assertions still pass.
- 🟠 **(process, recurring) More unlogged work.** The Meta/Instagram change has no `updates.md` entry — same as the dev-roadmap feature (tick 35). **Two** unlogged changes have now each produced a suite red the queue couldn't see.

**→ Commander:** **The suite has a SECOND red** — a real (isolation-confirmed) regression broke the Meta readiness/security test (`smoke-meta-master-inbox.test.ts:26`), which stops its fail-closed OAuth/webhook checks from running. Route to whoever made the unlogged Meta/Instagram change: fix readiness + re-confirm the security assertions pass. And **log Meta/Instagram + dev-roadmap in `updates.md`** — the queue is now demonstrably blind to real regressions. (Not a confirmed security hole — the security assertions are unverified, not shown fail-open. Launch blockers otherwise clear.)

## 2026-08-20 — 🟠 SUITE RED (caught by a periodic health check) — dev-roadmap integrity test fails on a dangling plan reference (+ unlogged work)

**How this surfaced:** after ~11 quiet ticks where the docs-queue showed nothing new, I ran the **full suite** as a periodic health check (not just the header scan) — and it's **RED**. The tree has grown to **2346 tests** (was ~1817–1874 when last fully run) but `updates.md` still shows only the 2 already-audited 2026-08-20 entries. So substantial work — including a whole **`dev-roadmap` feature** (`smoke-dev-roadmap.test.ts`, 31 cases) — landed with **no `updates.md` entry**, invisible to the docs-driven queue.

**The failure — real, reproduces in isolation (30/1, not a flake).** `smoke-dev-roadmap.test.ts:163` ("the real roadmap loads, and progress is COMPUTED from tasks not typed") fails: `stages-carry-what-the-client-sees-retire-the-four-mode-enum names a plan that does not exist: portal-products-scope-down`. Confirmed: **`docs/development/roadmap.md:121`** declares `**Plans:** portal-products-scope-down`, but **`docs/development/plans/portal-products-scope-down.md` does not exist** — `portal-products-scope-down` is a *memory-note* name, not a plan file. The integrity test (every roadmap `**Plans:**` must name a real plan) is working correctly; the roadmap data is wrong. **Sole red** in the suite (otherwise 2344 pass / 1 skip).

**Findings:**
- 🟠 **The full suite is RED on a dangling plan reference — it breaks the green-suite gate for everyone.** "Run the full smoke suite green before done" is a CLAUDE.md non-negotiable; right now it can't be met. **Fix (trivial; auditor is read-only, so routing, not editing):** at `roadmap.md:121` either drop/correct `**Plans:** portal-products-scope-down` (it's a memory note, not a plan) or create `docs/development/plans/portal-products-scope-down.md`. Then green is restored.
- 🟠 **(process) Substantial unlogged work — the docs-queue is out of sync with the tree.** ~+470 tests and at least a whole `dev-roadmap` feature landed with **no `updates.md` entry**. The auditor works from `updates.md` (docs-are-the-queue), so unlogged work is never queued for audit — exactly the pattern that hid earlier issues. Log substantial changes so they enter the queue.

**→ Commander:** **The suite is currently RED** — fix the one-line dangling reference at `roadmap.md:121` (a memory-note name masquerading as a plan) to restore the green-suite gate. **And log the unlogged `dev-roadmap` work** (+ whatever else drove +470 tests) in `updates.md` so I can audit it — right now it's shipped but invisible to the queue. **Process note for me:** header-only scans miss unlogged work; I'll run the full suite periodically on quiet ticks, not just check the queue. Launch blockers otherwise all-clear (this is a doc-integrity red, not a product defect).

## 2026-08-20 — ✅ PASS — Dev Team portal (icons · accuracy · Command Centre wiring) — the board that refuses to overclaim

**Verdict:** ✅ PASS. This internal founder tool is well-built and, more importantly, **honest by design** — its "accuracy" half is the auditor's own mission applied to the dev-team board: it stops a worker row overclaiming completion over its plan's real state, keeps the badge/station/board one number by construction, and matches my 🔴 rulings to their ✅ resolutions without hiding anything. I verified its central catch is correct (MFA is genuinely absent from login). Founder-gated, URL-guard on the station, behaviourally tested. One real finding to route — the MFA overclaim still lives in the shared brain.

**Audited:**
- **Suite:** `smoke-dev-team-portal` **8/8** (this portal went from zero coverage to a guarded contract).
- **P2 accuracy — the board doesn't overclaim (I verified the central catch).** The builder found `mfa-login`'s worker row ("✅ Phase 4 complete — PARKED") was dragging the plan into **Shipped** while the login route has **no MFA**. **Verified independently:** `grep -niE "mfa|aal|factor|totp|otp" src/app/api/auth/login/route.ts` → **zero hits**. So the "complete" claim is genuinely false and the new `isParked()` demotion (Shipped → Ready-next, verdict handed back to the plan) is correct. Same for `connect-flow-real-codes` self-classifying SHIPPED with open gates → now "🔴 NOT LAUNCH-DONE". The board reflects reality, not the rosiest row.
- **The badge is one number with the board.** `agency/page.tsx` computes it from the **same** `composeLanes(scanDevTeamBoard())` the station renders — badge, station "Blocked" tile and board Blocked lane equal **by construction** (an open launch blocker reads `critical`). Same consistency discipline as the other Command-Centre surfaces.
- **The auditor page reads MY log honestly.** `devTeamAuditor.ts` `supersededBy` is set **only on authored evidence** (a newer ✅ / a ✅ RESOLVED banner naming the same subject), with "Phase" excluded so Phase 1 can't close Phase 2 — an unmatched ruling is labelled **unresolved, never dropped**. (This is what makes my audits.md discipline — ✅ RESOLVED banners naming the closer — machine-checkable.)
- **P3 station gating — verified.** `commandStationMode(value, devTeamVisible)` returns the devteam station **only when `devTeamVisible`** (`_DashboardCommandCenter.tsx:2393`); a hand-typed `?station=devteam` can't land a non-founder there. Founder gate is the same `devDocsAccessible` used by Dev Docs / Dev Console.
- **Tests behavioural (B).** 8 cases drive the real `parseWorkers`/`composeLanes` (parked-vs-shipped, trouble-wins-over-parked) and the real `parseAuditFindings` supersede matcher (incl. "an older ✅ must not close a newer 🔴", "same plan, different phase ≠ same subject") + the icon contract (proven to guard) + the station wiring.

**Findings:**
- 🟠 **(route to the commander — verified real) The `mfa-login` "Phase 4 complete" claim is FALSE, and the shared brain still carries it.** `/api/auth/login` has **zero** MFA (confirmed — no mfa/aal/factor/totp/otp), yet `state.md`'s MFA worker row still reads "✅ Phase 4 complete" (the builder flagged this at updates line 215 — not their row to edit; the *board* no longer believes it). So a security feature is documented as done while absent. **Two actions:** (1) correct the `state.md` MFA row to match reality; (2) **decide whether sign-in MFA (2FA on login) is a launch requirement** — if so it's an **open gap**, not a complete feature (the connect-flow email code is a *connection* proof, not login 2FA). Not a defect in *this* work — this work is what *surfaced* it — but a real "done-that-isn't" to resolve.

**→ Commander:** Mark **Dev Team portal done** — icons complete, the board is honest (demotes overclaimed rows, badge=board by construction, my rulings matched to resolutions without hiding), the station is founder-gated + URL-guarded, tests behavioural. **Act on the verified MFA finding:** fix the false "MFA complete" row in `state.md` and rule on whether sign-in MFA is required for launch (it does not exist today). Launch blockers otherwise all-clear.

## 2026-08-20 — ✅ PASS — Internal chat → the owner's "Needs attention" (unread-chat operational alert)

**Verdict:** ✅ PASS. The wire surfacing unread team-chat into the owner's Command Centre alert is correct and safe: the count is computed **only over the owner's accessible channels** (reusing the Staff-Phase-6 read-gate), counts **only what's waiting on them** (unread DMs from others + @mentions, not all chatter), and returns **counts only — never message content**, so the alert can't leak a DM. Correctly classified (in-app, clears on reading), agency-scoped, behaviourally tested. No findings.

**Audited:**
- **Ran the suites myself:** `smoke-people-workspace` **21/21**, `smoke-operational-notifications` **15/15**.
- **Access-control respected — no channel leak (`people.ts:1041-1058`).** `chatAttentionForUser` iterates **`listPeopleChannels(agencyId, userId)`** (`:1045`) — the same read-gate verified in Staff Phase 6 that returns only `[team, ...the user's own DMs]`. So the count can never include a channel/DM the user isn't in. Per channel it uses `lastReadAt` and **skips read + self-authored messages** (`:1048`), counting only a **direct** message (`channel.kind==="direct"`) or an **@mention** (`message.mentions.includes(userId)`) — `if (!isDirect && !mentioned) continue` (`:1051`). "What's waiting on *you*", not every team message.
- **No content leak.** The function returns **`{directCount, mentionCount, total, latestAt}`** (`:1057`) — counts + a timestamp, never message text. The alert (`operationalAlerts.ts:79`) shows the total + a breakdown ("N direct + M mentions") + a link to `?view=chat` — a count with a specific reason and a direct path, not a vague number.
- **Contract + scope.** `kind:"in-app"` with `clearsWhen:"You open Team chat and read the messages waiting for you"` — honest (an in-app action, cleared by reading). `ownerChatAttention` scopes to the agency owner (found by role); the computation is agency-scoped.
- **Behaviourally tested (B).** `smoke-people-workspace:60-71` drives the real `ownerChatAttention` — `directCount===1` + `mentionCount===1`, and **null when nothing is waiting** (no alert). `smoke-operational-notifications:540-560` drives the real `listOperationalAlerts` — the `people:chat-attention` alert is present with unread, and **cleared after the chat is read**. No test weakened; no `.skip`.

**Findings:** none. A small wire done correctly — respects the chat read-gate, leaks no content, honest classification, tested.

**→ Commander:** Mark **Internal chat → Needs attention done** — the owner's unread-chat alert counts only their accessible channels (no channel leak), only what's genuinely waiting on them (DMs + mentions), returns counts-only (no DM content), is correctly classified in-app, and is behaviourally tested. Launch blockers remain all-clear. **This drains the last meaningful straggler — the audit queue is effectively clear**; the only remaining unaudited entries are trivial onboarding-UI prompts.

## 2026-08-20 — ✅ PASS — Freelancer workspace P1–P3: access-control (what a freelancer sees + can do)

**Verdict:** ✅ PASS. The freelancer access layer is secure and privacy-first: a freelancer sees **only their own jobs**, and for each only the **policy-permitted fields** — the client is "Confidential client project" (the real id/name *omitted from the payload*) unless the agency sets "named", the fee/notes/brief/dates are gated, and the mark-submitted action is role + ownership + policy + state gated. Server-side filtering (not UI-hiding), fail-safe defaults, behaviourally tested. Completes the freelancer feature alongside the earlier preview audit.

**Audited:**
- **Ran the suite myself:** `smoke-dev-mode` **48/48** (covers the freelancer POV + P2/P3).
- **P1 — view filters server-side, jobs scoped to the freelancer (`freelancerWorkspace.ts`).** `freelancerWorkspace(agencyId, userId)` resolves the freelancer's employee (`getPeopleEmployeeByUserId`; **null → empty state, no leak**) and lists **only their jobs** (`listPeopleFreelancerJobs(agencyId, employee.id)`, `:171`). `toJobView` (`:143-160`) adds a field **only if the policy allows** — `brief/dates/feeLabel/notes` each gated — and `clientLabel` is the real `client.name` **only** when `clientIdentity==="named"`, else the neutral `"Confidential client project"` (`:155-158`). The view interface has **no `clientId` field and no raw fee** — a hidden client/fee is *absent from the payload*, not merely UI-hidden.
- **P2 — agency policy, fail-safe (`:23-62`).** Defaults privacy-first (`clientIdentity:"anonymised"`, read-only). `normaliseFreelancerAccess` coerces any non-`"named"` value to `"anonymised"` (`:42`) — an untrusted/partial config can't reveal the client (tested: `clientIdentity:"wat"` → anonymised, `:463-465`). `resolveFreelancerAccess` returns the **per-job override ?? agency default** (`:110`).
- **P3 — mark-submitted, fully gated (`submitFreelancerJob` + route).** The helper returns `no_freelancer` / **`not_your_job`** (the jobId must be in *their* scoped list) / **`not_allowed`** (policy `markSubmitted`) / **`not_active`** before flipping status. The route 401s without a session, **403s unless `session.role==="freelancer"`**, and calls with `session.agencyId`/`session.userId` (never the body). A freelancer can only submit **their own active job, if policy allows, as themselves**.
- **Behaviourally tested (B) — the policy drives the view.** `smoke-dev-mode`: anonymised by default (`clientLabel==="Confidential client project"`, `:238`); **flip to `"named"` → the real `client.name` appears** (`:477-479`, driving the real `freelancerWorkspace`); read-only by default (`:240`); mark-submitted `not_allowed`/`not_your_job` until enabled (`:510-512`); per-job override wins then clears (`:523-533`); normalise fails safe (`:463-465`). No test weakened; no `.skip`.

**Findings:** none. Privacy-first, server-side-filtered, per-freelancer-scoped, fully-gated action — the "all configurable" access-control Ed wanted, done securely and tested against the real read model.

**→ Commander:** Mark **Freelancer workspace P1–P3 done** — a freelancer sees only their own jobs and only policy-permitted fields (client/fee omitted from the payload, not UI-hidden), defaults are anonymised + read-only + fail-safe, per-job overrides win, and mark-submitted is role/ownership/policy/state/session gated. With the earlier preview audit (session-minting escalation, resolved), the **freelancer feature is now fully audited**. Launch blockers remain all-clear.

## 2026-08-20 — ✅ PASS — Dev Console in the topbar (founder tool) + the standing `devteam` sidebar red is now CLEARED

**Verdict:** ✅ PASS. The ambient Dev Console (capture a finding from any page) is a founder-only internal tool, correctly gated at both the UI and the endpoint, reusing the existing findings API (not a second system) with no session-minting. Well-tested (badge honest + consistent). And the `devteam` sidebar-icons contract that stood red from tick 14 is **now green** (8/8) — the worker updated it; the "plan COMPLETE" claim is no longer contradicted by a red test.

**Audited:**
- **Ran the suites myself:** `smoke-dev-console-topbar` **19/19**, `smoke-dev-team-portal` **8/8** (the sidebar-icons red is resolved).
- **Gated at every layer.** UI: `Topbar.tsx:89` renders it only when `devConsole && !publicShowcase && !showcaseMode` — hidden for non-founders **and** in demo/showcase. The boolean is `devDocsAccessible(session)` (founder + Dev Mode — the gate audited in Dev Docs). Endpoint: `/api/portal/dev-team/findings` uses `requireRole([...AGENCY_ROLES])` **+** `if (!devDocsAccessible(session)) return null` (`route.ts:24-25`) — founder-gated **server-side**, so even a leaked icon couldn't POST. Absent for a normal owner/staff/client.
- **Reuse, not a second system.** The composer POSTs the **existing** findings `action:"create"` — a faster front-end, not a new backend. Reuses the `RadarQuickLookButton`/`NotificationCentreButton` shape (36px, `role="dialog"`, Escape/outside-click), `next/dynamic` lazy-mount (costs nothing unopened), and the audited `DEV_MODE_LOADIN_KEY`. **Never mints a session** — identity unchanged (the P3 copy correctly says "Still signed in as you · Your real data", distinct from the demo-fenced overlay).
- **Honest badge (tested behaviourally).** The badge counts **only open** findings + blockers (resolved/fixed excluded, `:133`), the badge and the panel read the **same** numbers ("the icon can never disagree with what it opens", `:69`), cached-and-invalidated (`:78`), the popover caps display but counts the whole truth (`:105`). Same honesty/consistency discipline as the other Command-Centre surfaces.

**Findings:** none. A well-gated, reuse-based founder tool with an honest, tested badge.

**→ Commander:** Mark **Dev Console done** — founder+DevMode-gated at UI and endpoint, reuses the existing findings system, no session-minting, badge honest + consistent, tests green. **And the standing `devteam` sidebar-icons red is now CLEARED** (8/8) — the worker updated the contract, so the Dev-Team-portal "plan COMPLETE" claim is no longer contradicted. The devteam area is settled + green; the last-known standing suite red is gone. Launch blockers remain all-clear.

## 2026-08-20 — ✅ PASS — Aqua Tag Phase 3: workspace moved into Fulfilment (as a view)

**Verdict:** ✅ PASS. A clean, faithful relocation — the Aqua Tags workspace moved from its standalone `agency/aqua-tags/` route into a Fulfilment **"tags" view**, wired exactly like the existing "technical" view (a server-rendered node passed as a prop). The old route is fully removed with **no dangling references**, the inbound links all point to `?view=tags`, and the routing logic (unchanged) still tests green. No findings.

**Audited:**
- **Old route removed, no dead duplicate.** `src/app/portal/agency/aqua-tags/` no longer exists; a grep for the old route path across `src/` returns **zero dangling references** (the only `aqua-tags` hits are the unchanged `api/portal/aqua-tags/detect` endpoint + the new fulfilment home). Addresses the hazards "no third copy / dead path" concern.
- **New "tags" view wired like "technical" (the established pattern).** `fulfilment/page.tsx` builds `tagsWorkspace = <AquaTagsWorkspace snippet/siteKey>` when `view==="tags"` (`:82-86`) and passes it down (`:112`) — the same server-rendered-node-as-prop shape the `technical` view uses (`:106`). `VALID_VIEWS` includes `"tags"` (`:44`); `_FulfilmentWorkspace` adds the `FulfilmentView` "tags" + a view-tab (`{id:"tags", label:"Aqua tags", icon:Radio}`, `:114`) + the `tagsWorkspace?` prop (`:161`).
- **Inbound links updated.** The company-card "Set up Aqua tag →" (`_TradingCompaniesPanel.tsx:123`) and the inbox-Channels "Master tags →" (`_WebsiteSourcesConfig.tsx:192`) both point to `/portal/agency/fulfilment?view=tags` (+ the dev-team API panel, consistent).
- **Logic unchanged — routing tests green.** `smoke-website-sources` **24/24** (the routing lives in `websiteSources.ts`, untouched by the UI move; the workspace component's logic was verified in the Phase 1 + Phase 3-start audits). Only the file location + the mount changed.

**Findings:** none. A relocation done correctly — no dead code, no broken links, faithful wiring, tests green. Only the purely-visual browser walk (Fulfilment → Aqua tags tab renders; the two "→ tags" links land) is left, as the builder flagged.

**→ Commander:** Mark **Aqua Tag Phase 3 (Fulfilment move) done** — the workspace is a clean Fulfilment view, the old route is gone with no dangling links, routing logic unchanged + green. This clears the oldest straggler in the queue. (Note: the `devteam` sidebar-icons contract is **still red** — 7 pass / 1 fail, unchanged since tick 14 — and the `devteam` area is actively churning (a new "Dev Console" just landed), so I'll audit it once it settles. Launch blockers remain all-clear.)

## 2026-08-20 — ✅ PASS — Erasure: 4th bug-class instance (`identityResolutionReviews`) + DPO review pack

**Verdict:** ✅ PASS on both. The 4th instance is a real PII gap — `identityResolutionReviews` holds enquirer PII but links via `selectedClientId` (not `clientId`), so the sweep missed email/phone/explanation-prose on erasure — fixed with the established split (always unlink; strip only when resolved AS the erased client; a separate party kept), tested both ways. And the **DPO pack is exemplary honest compliance documentation** — it explicitly disclaims compliance, marks each item verified-by-test-or-not, lists every evidence limit, and surfaces the weakest point (RETAIN has no expiry) as a DPO question rather than hiding it. This is the auditor's own standard.

**Audited:**
- **Erasure suite (isolated): 27/27 pass.** Full suite this run: **1 fail** — `dev team portal — sidebar icons` (the standing unrelated `devteam` contract; the builder's "4 fail" was a snapshot while the marketing worker was also mid-edit — those have since cleared). No erasure regression.
- **4th instance — real gap, correctly fixed (`clientErasure.ts:318-348`).** `identityResolutionReviews` is now a dedicated collection (`:60`). The fix processes only reviews that name this client (`:324`), **always drops the link** (`selectedClientId=undefined` + clears the resolution's `clientId/clientName/clientContactId` and filters candidates, `:327-338`), and **strips the enquirer's PII only when `resolvedAsClient`** (`:341`) — `name/email/phone/company/decisionNote` **and** `resolution.explanation` (the generated prose quoting the matched address) + candidates (`:342-347`). A separate party merely matched keeps their record; audit is counts-only. Same split as `brand_enquiries`/`persons`. The systematic "classify all 70+ collections for the bug shape (holds PII vs carries a matchable clientId)" is exactly how to find the class — and it cleared ~20 as genuinely unaffected, with reasons.
- **DPO pack — HONEST (`docs/compliance/erasure-dpo-pack.md`, 261 lines).** The core auditor check on a compliance doc is that it doesn't overclaim, and it doesn't: **"It is not a claim of compliance … the software cannot make anyone compliant — it can provide controls and evidence"** (`:17-18`). The per-category data map marks each row verified-by-test (✅) or **against a fake DB, not a live run** (⚠️, `:112`) or unverified. §6 "Limits of the evidence" honestly lists them all — **live scrub never run on the real DB, backups/PITR unaddressed, pre-fix log entries, sub-processor copies, and the org-link rationale residue** (`:163-182`; the last is the exact 🟡 I flagged tick 17), plus the unpublish-media residue from tick 8 (`:228`). §8 poses **8 questions a DPO must rule on**, chief being **Q1: RETAIN has no expiry — "indefinite retention is the weakest point in this design"** (`:193`) — surfaced, not hidden.

**Findings:** none — both clean. One item to route to Ed (already surfaced honestly in the pack, not a code defect):
- 📋 **RETAIN has no expiry (DPO pack Q1) — the design's weakest point, a real pre-real-client decision.** Finance/contracts/deliverables/erasure-audit are retained indefinitely; GDPR wants a justified period + eventual purge. Not a bug (retention is lawful); a policy/time-box decision Ed + the DPO must make before real client data. The pack correctly frames it as a question.

**→ Commander:** Mark **the 4th erasure instance + the DPO pack done** — the `identityResolutionReviews` PII gap is closed with the same verified split, and the DPO pack is honest compliance evidence (disclaims compliance, marks verified/unverified, states every limit, surfaces RETAIN-no-expiry as the key open question). This is the honesty standard the whole fleet should match. **To Ed/DPO:** rule on the pack's 8 questions before real client data — especially Q1 (a retention time-box). (Launch blockers all-clear; the `devteam` sidebar red still stands separately.)

## 2026-08-20 — ✅ PASS — Marketing overhaul (Phases 1–4): data spine · pulse · marketing radar · live funnel

**Verdict:** ✅ PASS. Marketing is a **read model** over already-computed data (the Radar `marketing` domain, the KPI registry, `commercialIntelligence.lineage`) — no engine rebuilt, consumed read-only, one cached radar build feeding all three views. The honesty contract is the risk here and it's **enforced at the type level and behaviourally tested**: an unmeasured family is `null`/`"unmeasured"` (never a fabricated `0`), enquiries a demo session didn't read report `available: false` (never "zero enquiries"), the worst lens wins a family's status, and a blind spot is never a false "attention". No findings.

**Audited:**
- **Ran the marketing suites myself:** `smoke-marketing-intelligence` **35/35**, `smoke-marketing-customer-profiles` **2/2**, `client-marketing-service` **2/2** — all green.
- **Read-only, no engine edit (`marketingIntelligence.ts`).** Every dependency is a read: `getCachedBusinessIssueRadar` (the **cached** radar — one build), `describeCommandKpis` (the KPI registry projection, already audited), `inspectRadarEvidence`, `listWebsiteSources`, `brand_enquiries`. No `mutate`/`storage.set`/`writeFile`/`logActivity`; the `.set()` calls are on local `Map`s. `marketingCommandModel()` feeds spine + pulse + funnel off one radar read (the efficiency claim holds).
- **Honesty rule — enforced by types + tested (the radar blind-spot contract).** Measures are typed `value: number | null` with a distinct `"unmeasured"` status (`:57-79`) and `available: boolean` for enquiries (`:126`) — never defaulted to 0. Tests pin it behaviourally: "a family the tag never reported is unmeasured — **null, never a fabricated zero**" (`:84-96` — asserts `value===null`, `value!==0`, `status==="unmeasured"`, and that unmeasured is **not** "attention"); "enquiries not read report **unavailable** — never 'zero enquiries'" (`:130-132` — `available===false`, "a demo session supplies none; that is not evidence of none"); worst-lens-wins the family status. The CLAUDE.md "missing evidence is a visible blind spot, never a healthy pass / never a fabricated reading" contract, correctly applied.
- **Reuse + scope.** Same read-model pattern as `staffCapacity.ts` (over the Radar `team` domain); agency-scoped by construction (built from `agencyId`-scoped radar + enquiries). The duplicate agency-only `websiteViews` counter was retired — one traffic number, not two competing ones.

**Findings:** none. A large surface, but a disciplined read-only projection with the honesty contract enforced in the type system and behaviourally tested — the same rigor as KPI Phase 1 and Client Health.

**→ Commander:** Mark **Marketing overhaul Phases 1–4 done** — spine/pulse/radar/funnel are a read-only projection over the existing radar + KPI + lineage (no engine touched, one cached build), and the honesty rule (unmeasured → null/unavailable, never a fabricated 0, never a false alarm) is enforced by types and behaviourally tested. Only the purely-visual browser walk of the new views is left. (Launch blockers all-clear; `devteam` sidebar red still stands separately.)

## 2026-08-19 — ✅ PASS — Erasure: Person records anonymise-if-orphaned (facet-retention + right-to-be-forgotten)

**Verdict:** ✅ PASS. Closes a **new** PII gap — the canonical `Person` carries no `clientId`, so an enquiry-originated client's email/phone survived erasure on the Person. The rule honors several contracts at once: **always unlink**, **strip identity only when orphaned** (no other client workspace AND not a standalone role), **keep facets/classification/history** (the CLAUDE.md "changing what someone IS never destroys what they DID"), and **don't over-strip** a supplier/partner or multi-workspace person (their own lawful basis). Tested **both directions** via the real API + mutation-checked. One honestly pre-flagged 🟡 residual.

**Audited:**
- **Erasure suite (isolated): 23/23 pass** (stable — the worker has settled).
- **The rule — correct + guarded (`clientErasure.ts:234-283`).** Only persons who actually held the erased client (or its relationship) are processed — **`if (!heldThisClient && !heldThisRelationship) continue`** (`:249`), so no unrelated person is touched. **Always unlink** (`:252-256`): drop the clientId from `facets.clientIds`, clear `relationshipId` if held. **Strip only if orphaned** (`:259-261`): `remaining.length === 0 && !STANDALONE_PERSON_CLASSIFICATIONS.has(classification)` (supplier/partnership/marketer excluded). Strip clears `emails/phones/name/company/jobTitle/notes/customFields` and blanks the free text in each `record[]` entry while **keeping its `kind`+`at`** (`:263-278`) — a de-identified fact, PII gone. Keeps facets/classification/classificationHistory/timestamps. Audit records **counts only** (`unlinked:persons`/`anonymised:persons`, `:283`), never a name. `persons` is a dedicated collection, skipped by the generic pass + excluded from `previewClientErasure` (anonymise-in-place, not delete).
- **Contracts honored.** Right-to-be-forgotten (orphan → all identity + free text stripped; the state-walk probe finds **0 survivors** for email/phone/name/company). Facet-retention (facets/classification kept). Lawful-basis / no-over-strip (supplier + multi-workspace intact). No PII in the audit log.
- **Tests real + BOTH directions (B — the rigor the original bug lacked).** `smoke-client-erasure.test.ts:632` seeds through the real `upsertPerson`/`addPersonRecord` API (no raw writes): orphaned enquirer → email+phone absent from the whole state (the `walk`, `:330`); **supplier intact** (`primaryEmail === EMAIL`, "must NOT be collateral damage", `:706`); second-workspace holder intact; record entries keep `kind`+`at` with free text cleared. Mutation-checked both ways (pass removed → orphan cases red; naive strip-always → supplier + second-workspace red). No `.skip`; no test weakened.

**Findings:**
- 🟡 (minor, honestly pre-flagged by the builder — Ed's call) **`PersonOrganisationLink.reason` free text can retain an email DOMAIN after orphan-anonymise.** `types.ts:629` — the reason is free text like "Shares the domain acme.example", so an orphaned person's own email domain can persist in a link rationale (the state-walk for the *full* email won't catch a domain-only trace). Usually low-identifying (a shared domain), but a personal/sole-trader domain can identify the person — a genuine residual RTBF trace. The link itself is a fact worth keeping; **Ed to decide** whether to clear or domain-redact `reason` on orphan-anonymise.

**→ Commander:** Mark **Person anonymise-if-orphaned done** — closes a real new PII gap (enquiry-originated clients' Person PII surviving erasure), strips only when orphaned while keeping facets + a supplier's/multi-workspace person's lawful details, tested both directions via the real API + mutation-checked. **Surface the one flagged residual to Ed:** whether `PersonOrganisationLink.reason` (can hold an email domain) should be cleared/redacted on orphan-anonymise. (Launch blockers remain all-clear; the `devteam` sidebar red still stands, separately.)

## 2026-08-19 — ✅ PASS (re-audit) — Erasure: the hook that erased NOTHING — real fix + real-flow test (🔴 RESOLVED — the LAST launch blocker)

**Verdict:** ✅ PASS — the erasure 🔴 is **RESOLVED**, and it was the sole remaining launch blocker. The builder found the hole was **bigger** than my tick-5 finding (the hook was a total no-op) and fixed it properly: the hook now actually resolves the client's people via the real links and deletes/anonymises them, every PII log site is id-only, and the new test **drives the real `upsert→convert→promote→update` flow** and asserts **zero trace of the email or phone in any value OR key** — and fails on the old code. Verified 18/18 in isolation, stable.

**Audited:**
- **Erasure suite (isolated): 18/18 pass, stable across repeats.** *(The worker is actively extending the file — 16→18 during this audit — and a full-suite run mid-edit showed a transient red on one erasure subtest that clears to 18/18 in isolation: a live-edit/load artifact, not a defect. Per the corrected flake note above: memory backend shares no state-file and files are separate processes, so isolated-green is authoritative here.)*
- **Root cause worse than tick-5 said — CONFIRMED.** `leads-pipeline` `onEraseClient` filtered `contact.clientId === clientId`, but **nothing writes `Contact.clientId`** — so the hook matched **nothing**, deleted nothing, and (since `clientErasure` skips a hook-owned slice) nothing else swept it. 8 traces survived (contact + lead rows/keys incl. **phone**, + 4 activity messages). My tick-5 finding was right but understated — the whole hook was inert.
- **The hook now actually erases (`leads-pipeline/index.ts:168-203`).** Resolves the client's people through the links the app really maintains — `Lead.convertedClientId` (stamped by `recordConversion`), the **reused** `clientMatchesLead`/`clientMatchesContact` matchers (the same the conversion handlers use — reaches a client converted straight from a contact with no back-link), `promotedFromLeadId`. Reads the client via `getClientForAgency` before `eraseClientCompletely` deletes it. Dispositions: **contacts DELETE**, **leads ANONYMISE**.
- **Anonymise strips ALL identity + drops the key pointers (`leads.ts:531`).** `anonymiseForErasure` deletes `emailPtrKey` + `phonePtrKey` (the `leads/email/…`, `leads/phone/…` pointers) and sets `email:""`, `name/phone/company/personId/notes/customFields: undefined` — a complete identity strip, funnel record kept; the log message is id-only. Contacts are deleted (row + email key + index).
- **The test proves ZERO trace via the REAL flow (`smoke-client-erasure.test.ts`).** Seeds through `leads.upsert → recordConversion → promoteLead → update` (**no raw `pluginData` writes**), erases, then a recursive `walk` over `storage.getState()` checks **every string value** (`:319`) **and every storage-key name** (`:325`) for a unique email + phone → asserts **none found**. Verified to **fail on the old code** (the old raw-seeded test passed while these fail — exactly the gap I named tick 5). This is the test I asked for.

**Findings:** none on erasure — the 🔴 is genuinely closed. Two adjacent notes:
- 🟠 **(route to `devteam`, unrelated) "Dev Team portal FINISHED / plan COMPLETE" (updates.md:14) is contradicted by a still-RED contract test.** `smoke-dev-team-portal.test.ts` "sidebar icons" still fails ("the Dev Team sidebar sections changed — update this contract deliberately") — the same red I flagged tick 14, now doubled-down as "complete." A plan is not complete while its own contract test is red. Route to `devteam`.
- (note) The full suite is currently **1842/2** — the 2 reds are (a) the erasure live-edit transient (clears isolated) and (b) the devteam contract. No product regression from the erasure fix.

**→ Commander: UN-HOLD the erasure launch gate — the 🔴 is RESOLVED.** The hook now actually erases (it was inert), all PII log sites are id-only, leads anonymise + contacts delete + PII-key-pointers drop, and the real-flow test proves zero trace of email/phone anywhere in state (and fails on the old code). **This clears the last of the original three launch blockers.** 🎉 Do a final clean full-suite run once the erasure worker settles (still adding tests), and route the unrelated `devteam` sidebar-icons red.

## 2026-08-19 — ✅ PASS (re-audit) — Pre-launch hardening: three auditor 🟡s closed (public uploads · Aqua Tag consent · Meta webhook)

**Verdict:** ✅ PASS — all three of my flagged 🟡 hardening items are **genuinely closed**, each verified in source + a passing behavioural test (the builder even mutation-tested the consent gate). Exemplary follow-through. Separately: the suite's currently-reported **1 fail is confirmed unrelated** (a `devteam` sidebar-nav contract, not this work) — routed below.

**Audited:**
- **Ran the three fix suites + the failing one myself (targeted — stronger than a full-count for a fixes re-audit):** public-upload **20/20**, consent-injection **5/5**, meta-master-inbox **5/5**; `smoke-dev-team-portal` 1 pass / **1 fail** (the unrelated devteam item). Last full run was 1786/0/1 + the builder's 1777/1 (the 1 = dev-team).
- **① Public upload content-type + path guard — CLOSED (`publicUploadStorage.ts`).** `ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES` = raster image + video only; `image/svg+xml`/`text/html`/everything-else rejected by omission with a typed `PublicUploadContentTypeError`. The gate throws at `:134` — **before the provider branch**, so it holds on the Supabase path too — on the **normalised** type (`;`-params stripped + lowercased, `:83-84`), so a decorated header can't smuggle a type. `svg` also dropped from `publicMediaAdapter`'s `EXT_BY_MIME`. Path guard: `startsWith(publicRoot + sep)` (`:165-166`) rejects traversal, absolute keys, **and** the `uploads-public-evil` sibling-prefix; `publicUrl` derived from the path actually written. Fail-open promotion means a rejected SVG stays inline (publish never breaks). Closes both parts of my Public-upload 🟡.
- **② Aqua Tag consent fail-OPEN → fail-CLOSED + the behavioural test — CLOSED (`aquaTagSource.ts`).** The `|| "necessary"` default is gone: `if (!permitted(item.consentCategory)) continue` (`:164`), so an unlabelled/unknown category is **held even under full consent** (comment `:160-161`). And the test I asked for **twice** now exists and is real: `smoke-aqua-tag-consent-injection.test.ts` **`vm.runInNewContext(AQUA_TAG_SOURCE, …)`** (`:107`) executes the **real shipped tag** against a fake DOM and asserts what reaches `document.head` — analytics seeded, no consent → **NOT injected** (`configRequests===1`, a real gate) → `applyPreferences` → injected retroactively, no re-fetch; rejection / marketing-separation / necessary / unlabelled all covered. **Mutation-checked** (restore the default → 2 fail; remove the gate → 5 fail), so the tests genuinely bite. Closes the Aqua Tag consent 🟡s.
- **③ Meta verify-token constant-time — CLOSED (`metaMessaging.ts`).** `constantTimeSecretMatch` (`:381-388`) SHA-256-digests **both** sides (always 32 bytes → `timingSafeEqual` unconditional, no length-guard leak) and compares **every** candidate with **no early return** (`:386` sets `matched` but keeps looping) — so neither the token length nor which candidate matched leaks via timing. `metaWebhookVerifyTokenAccepted` now returns it (`:404`); the old `candidates.has(...)` is gone. The POST HMAC is still the real gate. Closes my Meta 🟡.
- **Posture unchanged, depth added.** All three are defense-in-depth on already-PASS surfaces; no behaviour widened, prod fail-closed unchanged; the "no browser (no UI surface)" caveat is correct.

**Findings:**
- 🟠 **(unrelated, route to `devteam`) The suite is currently RED on 1 real failure — but NOT from this work.** `smoke-dev-team-portal.test.ts` "sidebar icons" fails: *"the Dev Team sidebar sections changed — update this contract deliberately"* (`+ 'findings'` in actual). The `devteam` worker added a nav item to `src/app/portal/dev-team/layout.tsx` without updating that contract list — its own guardrail firing correctly, left unfixed. Both files are `devteam`'s; the three hardening files are untouched by it. **Also unlogged** — the `dev-team/*` changes have no updates.md entry. Deterministic (not the tick-11 flake). Route to `devteam`: update the sidebar-icon contract deliberately + log the nav change.

**→ Commander:** **Mark the three hardening 🟡s CLOSED** — public-upload content-type/path guard, Aqua Tag consent fail-closed (+ the real VM behavioural test, mutation-checked), Meta constant-time verify-token are all verified. Exemplary follow-through on audit findings. Separately, **route the RED `smoke-dev-team-portal` "sidebar icons" to `devteam`** (their nav change vs their own contract test — unrelated to this work, and unlogged). Launch gates unchanged: erasure 🔴 the sole open blocker; the 🟠 dev-mode `process.env` flake stands (separate from this deterministic dev-team red).

## 2026-08-19 — ✅ PASS — Dev Mode Phases 3 + 4: cinematic load-in + isolation hardening (plan COMPLETE)

**Verdict:** ✅ PASS on both. **Phase 4 (the one that matters)** genuinely proves the fencing: a demo persona is minted **only** into the demo agency, and the mutation gate `assertTenantScope` **refuses** it on any real tenant — behaviourally, against the real gate. So a demo/dev-mode session can never mutate real data (critical, since dev mode writes to live Supabase locally). **Phase 3** is a cosmetic demo-gated load-in — inert for real users, respects reduced-motion + the performance toggle, reuses the existing transition CSS. No findings.

**Audited:**
- **Re-ran the FULL suite myself: 1787 · 1786 pass · 0 fail · 1 skip** (green; the dev-mode `process.env` flake didn't fire this run). **`smoke-dev-mode` ISOLATED: 47/47** (the file holding every Phase 3 + 4 test) — clean. *(Note: the total jumped 1751→1787 (+36) since the prior tick with no new updates.md entry — active unlogged test-authoring by the workers; green, but the docs-queue is lagging the tree.)*
- **Phase 4 isolation — VERIFIED BEHAVIOURALLY (the security contract).** `assertTenantScope` (`auth.ts:290-294`) throws `403 tenant_scope_mismatch` when the target agency isn't in `getSessionAgencyIds(session)`. The tests drive the **real** gate against a **real** minted demo session:
  - `smoke-dev-mode.test.ts:334` — every persona mint (enter + switch owner/staff/client) is fenced: `agencyId` = the demo agency, never the real one (also `:132` `agencyId !== the real agency`).
  - `:354-364` — **`assert.throws(() => assertTenantScope(demo, realAgency.id), /tenant_scope_mismatch/)`** (a demo write can't reach a real tenant) **and** `doesNotThrow` for the demo's own agency. Physical isolation at the scope layer, proven against the gate every mutation runs through.
  - `:275` the demo inspection is fenced (`isDemo`); the agency inbox's `session.isDemo ? Promise.resolve([])` guard means a demo POV shows no live data. Phase 4 ships **no new source** — it's verification, and the verification is real (not source-shape).
- **Phase 3 load-in — demo-gated + accessible, zero real-user impact.** Mounted `{session.isDemo ? <DevModeLoadIn/> : null}` (`portal/layout.tsx:29`) — real users never render it. `DevModeLoadIn` bails on `performanceModeEnabled() || reducedMotionPreferred()` (`:45`), plays once via a sessionStorage flag it removes (`:40-42`), reuses the `mm-command-transition` CSS (no new keyframes). The 3 tests are source-shape pins (the UI norm). Additive shared edits (layout mount, one z-index rule, two flag-arms) all flagged + demo-gated.

**Findings:** none. Phase 4's fencing is the right guarantee, proven against the real mutation gate; Phase 3 is a safe, accessible, demo-only cosmetic.

**→ Commander:** Mark **Dev Mode Phases 3 + 4 done — plan COMPLETE** — the isolation hardening genuinely proves a demo persona is fenced to the demo agency and refused on any real tenant (behavioural, against `assertTenantScope`); the cinematic is demo-gated + reduced-motion-safe. Only the live browser click-through is left, as the builder flagged. Launch gates unchanged: erasure 🔴 the sole open blocker; the 🟠 suite-flake finding stands.

## 2026-08-19 — ✅ PASS — Aqua Tag Phase 3 (start): the agency routing registry is company-aware

**Verdict:** ✅ PASS. Closes the company-blindness gap Phase 1 opened in the inbox routing manager (`_WebsiteSourcesConfig`): a company-routed site now displays as its company (not "your inbox"), and — the real fix — re-routing sends the **kind-specific field** so editing a company-routed site no longer **silently clears the company**. Verified end-to-end (display + the server POST); server-side routing was behaviourally verified in the Phase 1 audit. Suite green this run.

**Audited:**
- **Re-ran the FULL suite myself:** **1751 · 1750 pass · 0 fail · 1 skip** (green — the dev-mode isolation flake didn't fire this run; it remains intermittent per the cross-cutting finding below).
- **The silent-clear bug — FIXED end-to-end (`_WebsiteSourcesConfig.tsx`).** The dropdown value encodes the destination kind (`decodeDestination`: `company:X` → `{destinationCompanyId:X}`, `client:X` → `{destinationClientId:X}`, inbox → `{}`, `:57-60`); `encodeDestination` shows a company route as `company:X` so the row no longer reads "your inbox" (`:62-64`). `reroute` POSTs `{action:"update", id, ...routing}` with that kind-specific field (`:130`) — so a company reroute sends **`destinationCompanyId`**, not the old client-only body. Combined with the server's reassign-both-with-`||undefined` (`websiteSources.ts:165-166`, verified tick 11), the company is set and the client cleared — no silent wipe. Optimistic update with rollback on a failed save (`:134`).
- **Display — all three homes.** A company route shows the company name + a `Building2` badge (`:247`), a client route its client link (`:262-264`); the add + reroute dropdowns offer Your inbox · Clients · Your companies optgroups (`:210-218`).
- **Tests (B).** The panel contract (`smoke-website-sources.test.ts:140-165`) is source-shape (asserts the panel references `destinationCompanyId` + encodes `company:${…}`) — the repo norm for a UI component (no DOM renderer); I verified the decode/encode/reroute logic directly. The behavioural coverage is the server routing (Phase 1, 24/24). No test weakened; no `.skip`.
- **Scope + reuse.** Edits only `_WebsiteSourcesConfig` (the inbox routing manager); reads the `companies` the routing API already returns; `_ClientTagWorkspace` (client-scoped) correctly untouched. The Fulfilment-relocation of the workspace is explicitly **deferred + flagged for a commander decision** (touches shared nav) — honestly not done here.

**Findings:** none. A precise fix to a real bug Phase 1 opened (a company-blind panel silently clearing the company on edit), correct end-to-end. *(Observation, not a finding: the test total rose 1748→1751 with no matching updates.md entry and `smoke-dev-mode.test.ts` is the most-recently-touched test file — someone is editing tests underneath the queue, possibly the flake; green this run, but the 🟠 flake finding stands until it's consistently green or the env-injection fix lands + is logged.)*

**→ Commander:** Mark **Aqua Tag Phase 3 (start) done** — the inbox routing panel is now company-complete: company routes display correctly and re-route without wiping the company (the Phase-1 silent-clear is closed). Only the browser walk + the flagged Fulfilment-relocation decision remain. Launch gates unchanged: erasure 🔴 the sole open blocker; the 🟠 suite-flake finding stands (green this run, but intermittent).

## 2026-08-19 — 🟡 Cross-cutting (CORRECTED tick 15) — dev-mode flake: my earlier "`process.env` isolation race" mechanism was WRONG

**CORRECTION — I got the mechanism wrong and am retracting it.** **Verified this tick:** node's `--test` runs each file in its **own child process** (proved directly — two test files printed PIDs 63004 vs 63005), so **`process.env` does NOT leak across test files**; the "culprit" I named (`smoke-dev-docs.test.ts:65` setting `PORTAL_DEV_MODE`) **cannot** affect `smoke-dev-mode` — different process. And the suite runs `PORTAL_BACKEND=memory`, whose backend is a pure in-process `memoryBlob` (`storage.ts:142-147`) — it never touches `.data/portal-state.json`. So **neither `process.env` nor the state-file is shared** across these memory-backend unit files. The env-race story is false.

**What's actually true:** the *observation* stands — `smoke-dev-mode` failed 2 subtests **once** (tick 11), under heavy multi-worker load (the suite was observably slow that run), passes **47/47 in isolation**, and has been **green in every full run since** (ticks 12 · 13 · 14). So it is a **rare load-induced transient**, not a systematic isolation defect. The genuine cross-file hazards here are the filesystem (`.data/portal-state.json`), ports, and live Supabase — none of which these memory-backend unit tests share — which points at load/timing, not shared mutable state. **Downgraded 🟠 → 🟡.** The "inject env / make it hermetic" fix I recommended would NOT fix a load transient — retracted.

**Still valid — the diagnostic:** when the suite is red, **re-run the failing file alone** (`npx tsx --test scripts/smoke-dev-mode.test.ts` → 47/47) to tell a real regression from a transient, *before* trusting or dismissing a red run. That guidance holds; only the mechanism was wrong.

**→ Commander:** Treat this as a **rare load-induced flake** (mechanism unknown, likely CPU-starvation timing; seen once, not reproduced) — **no hermetic-env work needed** (files are already process-isolated). Prior verdicts that referenced "the process.env flake" (ticks 11–14) are unaffected in their PASS/FAIL conclusions — the flake was always noted as *unrelated* to the audited work; only this note's mechanism is corrected. *(Original tick-11 text retracted; kept this brief for the record rather than preserving the wrong analysis.)*

## 2026-08-19 — ✅ PASS — Aqua Tag Phase 1: tagged sites route to your own companies (routing keystone)

**Verdict:** ✅ PASS. The routing keystone is correct and multi-tenant-safe: company + client destinations are **agency-scoped** (a foreign company/client is refused), **client-XOR-company** is enforced at add + update (one home per site; a re-point clears the other), a company route is **recorded on the enquiry, not misfiled onto a client**, and an unregistered/no-destination site safely defaults to the inbox (old behaviour preserved). Behaviourally tested against the real store. (Suite caveat: the full run was red on 2 UNRELATED dev-mode isolation flakes — the cross-cutting finding above; Aqua Tag's own tests are 24/24 green in isolation and were not among the failures.)

**Audited:**
- **Re-ran the FULL suite myself:** 1748 · 1745 pass · **2 fail** · 1 skip — but **both failures are the dev-mode `process.env` isolation flake** (unrelated; 47/47 in isolation; cross-cutting entry above). **Aqua Tag's own suite is 24/24 green in isolation** and `smoke-website-sources` was not among the failures — so this feature is verified.
- **Agency scoping — VERIFIED (multi-tenant boundary).** `addWebsiteSource` (`websiteSources.ts:115-119`) and `updateWebsiteSourceRouting` (`:153-158`) validate a client via `getClientForAgency(agencyId, …)` and a company via `getTradingCompany(agencyId, …)` — **both agency-scoped**, so a site can't route to another agency's client or company (`assert.throws` on a foreign company, `smoke-website-sources.test.ts:102-105`). `update` also refuses a source not in the caller's agency (`:149`).
- **client-XOR-company — VERIFIED.** Both setters throw on `destinationClientId && destinationCompanyId` (`:110-112`, `:150-152`); `update` reassigns **both** fields from the input with `|| undefined` (`:165-166`), so a client→company re-point **clears the client** — one home (or inbox) only. `resolveWebsiteSourceRouting` returns the discriminated `{kind: inbox|client|company}` with a safe inbox default (`:88-95`).
- **No misfiling — VERIFIED.** The live paths branch on the destination kind: `routedClientId = kind==="client" ? … : undefined`, `routedCompanyId = kind==="company" ? … : undefined` (`form-capture/route.ts:166-167`); a company route stamps `routedCompanyId` on the enquiry and does **not** fire the client ledger (comment `:164-165`: "a company is not a client"). Inbox/client routing byte-for-byte unchanged.
- **Tests real + not weakened (B).** The resolver contract was retargeted to the union but still asserts substantive routing (inbox default `:41-42`, client routing incl. URL-normalisation `:47-48`, foreign-client refused `:64`, re-point+remove `:67-72`), plus a real company block (routes to company `:97-99`, foreign-company refused `:102-105`). Behavioural against the real store. No test deleted/`.skip`'d.
- **Reuse + scope.** Additive `destinationCompanyId` + a new `WebsiteSourceDestination` union on shared `types.ts` (flagged, localized); reuses `getTradingCompany`. No duplicate routing system; no git; memory store. Honest status: unit-verified, NOT browser/runtime-verified (headers-`getSession` route, no in-process rig) → commander browser-walk pending.

**Findings:** none specific to Aqua Tag Phase 1. (The red suite is the unrelated dev-mode isolation flake — filed as the cross-cutting finding above.)

**→ Commander:** Mark **Aqua Tag Phase 1 done** — routing is agency-scoped (no cross-tenant route), one-home client-XOR-company enforced, a company route is correctly attributed (not misfiled onto a client), inbox default preserved; behaviourally tested. Only the browser walk is left (route a company's site → confirm it lists). Launch gates unchanged: erasure 🔴 remains the sole open blocker; and see the new 🟠 suite-flake finding above.

## 2026-08-19 — ✅ PASS — Enquiry detail card Phase 1: the submission mirrored (modal)

**Verdict:** ✅ PASS. The modal is accessible and honors the consent-first contract — it distinguishes consent **given / declined / not-recorded** honestly (a decline is never a yes; an unasked form never assumes consent), mirrors every submitted field + the full `additional` answers (evidence, not a count), reuses the `ConfirmDialog` shell + the one `EnquiryCommunications` composer, and stays agency-internal. One nit: the "new behavioural smoke" is actually source-shape (the repo norm for UI), so a UI-logic slip wouldn't be caught by the suite — I verified the consent honesty in source directly.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 · 1747 pass · 0 fail · 1 skip** (green; the claim's 1574 is stale drift).
- **Consent-first — HONEST (verified in source, `_EnquiryDetailCard.tsx:406-422`).** `ConsentRow` resolves three distinct states — `item.consent === true` → "Consent given" (+ purpose/version/date), `=== false` → "Consent not given", else → "Consent not recorded" ("This form did not record a consent answer. Confirm before contacting."). The source comment states the discipline: "a form that never asked is not the same as a visitor who declined, and neither is the same as a yes." No fabricated consent — the AquaCRM consent-first principle done right.
- **Layers + reuse.** Layer A mirrors every `formCapture` field in order + shows the `additional` answers **in full** (previously only counted). Layer B is read-only (consent-led, then classification, services, source, triage, timeline, linked lead/contact/client). Reuses `ConfirmDialog`'s shell (`useFocusTrap`, Escape/backdrop, `role="dialog"`/`aria-modal`) and the unchanged `EnquiryCommunications` composer. Agency-inbox path — internal stays internal.
- **The refactor preserved its contracts (B).** `_MasterInbox` extracted the inline block into the card (803→697L); row triage actions unchanged. The 5 retargeted contracts genuinely **moved, not weakened** — spot-checked: the "one contact-aware composer per enquiry view" contract still asserts the card hosts `<EnquiryCommunications>` with all four channels (`smoke-master-inbox-communications.test.ts:9-20`); the public-contact ingestion-route contract is intact. No test deleted or `.skip`'d.

**Findings:**
- 🟡 (minor) **The new test is source-shape, not "behavioural" as the update states.** `smoke-enquiry-detail-card.test.ts` regex-matches the `.tsx` (its own header admits "these are source-shape contracts") — modal a11y strings, `capture.fields.map`, the three `item.consent ===` branches, etc. Acceptable (the smoke suite has no DOM renderer — the norm for every UI component here), but a logic slip in the card's rendering (e.g., the consent-state branching) wouldn't be caught by a string match; I verified the consent honesty by reading the source. **Also a doc nit:** the update calls it "behavioural" — it isn't.

**→ Commander:** Mark **Enquiry detail card Phase 1 done** — the modal is accessible, mirrors the real submission, and surfaces consent honestly (given/declined/not-recorded, never assumed), reusing the shell + composer; the refactor kept its contracts. Only the purely-visual browser walk is left, as the builder flagged. (Coverage is source-shape, the UI norm here — a behavioural render test would harden the consent-state logic.) Launch gates unchanged: erasure 🔴 remains the sole open blocker.

## 2026-08-19 — ✅ PASS — KPI Intelligence Phase 1: KPI Registry + explorer upgrade (repurpose)

**Verdict:** ✅ PASS. The registry is a faithful pure projection — it **wraps, never recomputes** (value/target/baseline/series lifted verbatim off the built KPI), preserves **honest nulls** (no fabricated value where the source has none), and copies the series (no shared mutation). The explorer is a genuine repurpose of the existing comparison workspace, not a parallel build. Behaviourally tested. Low-risk, clean. No findings.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 · 1747 pass · 0 fail · 1 skip** (green; the claim's 1574 is stale drift).
- **Faithful wrap, no recompute (`kpiRegistry.ts:104-138`).** `describeCommandKpi` lifts every field directly off the built `CommandKpi` — `value: kpi.value`, `target: kpi.plan.targetValue`, `baseline: kpi.plan.baselineValue`, `status`, `display` — with **no defaulting** (`?? 0`) and no separate computation, so a descriptor can never disagree with the KPI it wraps. `series` is a fresh `history.map(...)` copy (mutating the descriptor can't corrupt the source). `describeCommandKpis` preserves the snapshot's rank order.
- **Honest-null discipline preserved (the Radar/Client-Health contract).** A learning KPI's null target/baseline/value and empty series pass through untouched — the projection never manufactures a number where evidence is missing.
- **Reuse, not a third copy (D).** Repurposes `_CommandIntelligenceWorkspace` (registry-backed instrument selector + line/area/bar switching) rather than a parallel `_KpiExplorer`; the registry wraps the existing `CommandKpi`. Exactly the reuse the checklist wants.
- **Tests real + behavioural (B).** `smoke-kpi-registry.test.ts` — 7 input→output cases: field projection (`:51-63`), **series is a copy** (deepEqual values + notEqual the reference, `:66-70`), **honest nulls survive** (null target/baseline, empty series, `:73-81`), ordering (`:84-88`), search by label/category/unit. No test weakened; no `.skip`.
- **Scope + status.** Client-safe pure module; the shared `_CommandIntelligenceWorkspace.tsx` edit is additive (flagged); no git, no live data. Honestly logged as "logic-tested, NOT browser-verified by me" → commander browser-verify pending (Explore all KPIs → line/area/bar → search).

**Findings:** none. A faithful wrapping projection with honest nulls, a genuine repurpose, and behavioural tests — the foundation done right.

**→ Commander:** Mark **KPI Phase 1 done** (logic-verified) — the registry faithfully wraps each KPI without recomputing or fabricating, honest nulls survive, and it's a genuine repurpose of the comparison workspace. Only the purely-visual explorer walk is left, as the builder flagged. Launch gates unchanged: erasure 🔴 remains the sole open blocker.

## 2026-08-19 — ✅ PASS — Public bucket Phases 3–4: gate + renderers (plan COMPLETE)

**Verdict:** ✅ PASS. Mostly a verify-and-codify pass over P2's design, and it holds: media is promoted to the public CDN bucket **only on publish** (drafts keep inline `data:` URLs — nothing private leaks by default), the renderers serve the promoted CDN URL, and a real end-to-end capstone proves upload→publish→render drops the `data:` and emits the CDN URL. Behaviourally tested. One honestly-deferred follow-up (unpublish doesn't retract already-public media).

**Audited:**
- **Re-ran the FULL suite myself:** **1748 · 1747 pass · 0 fail · 1 skip** (green; the claim's 1607 is stale drift).
- **P3 gate — "nothing private leaks by default" VERIFIED.** The promotion walker `promoteBlockTreeMedia` has **exactly one caller** — `publishPage` (`pages.ts:140`), fed the `publicMedia` port from the publish handler (`handlers/pages.ts:129`). `publishPage` promotes `draftBlocks ?? blocks` to CDN URLs and clears `draftBlocks` at the moment of publish (`pages.ts:124-147`). No draft-save path promotes — so an unpublished draft's media stays inline `data:` and never lands in the public bucket. The module comment is accurate: "nothing public by default; only the published copy is promoted."
- **P4 renderers — CDN URL, no `data:` leak.** The end-to-end capstone (`smoke-public-media-promotion.test.ts:147-160`) seeds a draft with an inline `data:` PNG → drives the **real** `publishPage` (fake port → CDN URL) → the **real** `renderPageHtml` → asserts the rendered HTML `includes src="<cdnUrl>"` **and** `doesNotMatch /data:image\//`. The plan's "Done when," proven in memory.
- **Tests real + behavioural (B).** The promotion walker (data: only, dedup, recurse variants, **fail-open on a storage error so publish never blocks**), `publishPage` integration (port wired → published block carries the CDN URL; no port → inline, backward-compat), and the render capstone all drive the real functions. The foundation-wiring case is source-shape (a registration contract — acceptable). No test weakened; no `.skip`.
- **Reuse + scope.** Promotion rides the Phase-1 `storePublicUpload` (already audited) via the additive `publicMedia` port (flagged + Ed-approved in P2). No duplicate storage; memory backend, no live-Supabase junk, no git.

**Findings:**
- 🟡 (deferred, flagged by the builder — track it) **Unpublishing does not retract already-public media.** Content-addressed keys are shared across pages, so safe deletion needs refcounting; the builder deferred active deletion and left `deleteSupabasePublicUpload` in place for a refcount-aware cleanup. Reasonable — the bytes were already public when published, so an orphan at an unguessable CDN URL isn't a *new* exposure. But it means "unpublish" (or deleting a page) does **not** take the media down from the bucket — relevant if a client ever needs published media genuinely *removed* (the same right-to-be-forgotten angle as the erasure blocker: if promoted media carried personal data, unpublish wouldn't erase it). Not a defect in what shipped; a tracked follow-up before that guarantee is needed.
- (note) The **live Supabase-CDN upload path is source-shape-pinned, not exercised against a live bucket** (the storage boundary + prod fail-closed were verified in the Public-upload-storage audit). Honestly flagged as a non-code remainder; not a defect.

**→ Commander:** Mark **Public bucket Phases 3–4 done — plan COMPLETE** — promotion is publish-gated (drafts never go public), the renderers serve the CDN URL with the `data:` gone (end-to-end capstone), behaviourally tested. Track the deferred **unpublish/delete → retract-from-bucket** cleanup (refcount-aware) before any "take this media down" guarantee is promised. Launch gates unchanged: erasure 🔴 remains the sole open blocker.

## 2026-08-19 — ✅ PASS — Client Health Phases 3–4 (+ mount): "clients needing attention" panel

**Verdict:** ✅ PASS. Phase 3 rides the canonical client-radar fleet (no second source of truth); Phase 4's `listClientsNeedingAttention` returns which client / how bad / the top reason / a Fulfilment link — never a bare count — agency-scoped, and only ever lists **risk/watch** (a thin-data `learning` client is never surfaced, so no crying wolf). Behaviourally tested; the mount is wired and browser-verified by the builder. One optional naming nit.

**Audited:**
- **Re-ran the FULL suite myself:** green (exit 0 this tick; standing baseline **1747 pass · 0 fail · 1 skip** holds — nothing shipped since). Attention suite 3/3. (The claims' 1604/1639 are stale drift.)
- **Rides the fleet, agency-scoped (`clientAttention.ts:29-48`).** `listClients(agencyId)` filtered to active/non-churned → `buildClientRadarFleet(agencyId, {now, clients})` (the canonical rollup that folds in the Phase-1 factors) → keeps only `healthState` risk|watch → maps to {clientId, clientName, state, headline=summary, score, href}, risk-before-watch, worst-score-first. No parallel health computation, and a `learning`/`strong` client is excluded — thin-data honesty preserved.
- **Not a bare count.** The panel (`_ClientsNeedingAttention.tsx`) lists per client: state dot, name, state badge, the top reason (`headline`), score/100, and an arrow linking into `/portal/clients/<id>` (Fulfilment). The header chip ("N to review · M at risk") is a summary *above* the actionable list, with an honest empty state ("No active client is currently in a risk or watch state"). Which/how-bad/why/way-in.
- **Mount present + correct.** `page.tsx` fetches `listClientsNeedingAttention(agency.id, …)` in the parallel load (agency-scoped) and passes it through (`:51,78,356`); `_DashboardCommandCenter.tsx` renders `<ClientsNeedingAttention items={…}>` in the Day Command station (`:68,167,1262`). Builder browser-verified on :3032 (specific: "1 to review → Northlight Studio · WATCH · … · 91/100 · → Fulfilment"). I couldn't independently re-drive the shared server (preview-lock), but the data path is behaviourally tested and the wiring is verified-present + tsc-clean.
- **Tests real + behavioural (B).** `smoke-client-attention.test.ts` drives the real `listClientsNeedingAttention`: enquiry-none client → `risk` + `/Enquir/i` headline + correct href; a **churned client is never listed**; only risk/watch appear; empty agency → `[]`; risk-before-watch ordering. No test weakened; no `.skip`.

**Findings:**
- 🟡 (minor, optional — **not a bug**) **Field-name collision on the dashboard payload.** `payload.clientsNeedingAttention` is the new **array** (`ClientAttentionItem[]`, the panel prop) while `payload.actuals.clientsNeedingAttention` is a pre-existing **count** (a number fed to `calculateCompanyHealth`; compared `> 0` at `_DashboardCommandCenter.tsx:2347`). Different paths, correctly typed, tsc-clean — no defect (I traced it specifically to rule out an array-compared-`>0` bug). But the shared name is a maintenance trap where a future editor could grab the wrong one. **Optional:** rename the array (e.g. `clientAttentionItems`) or the count for clarity.

**→ Commander:** Mark **Client Health Phases 3–4 + mount done** — the panel rides the canonical fleet, names which/how-bad/why with a Fulfilment link (not a bare count), only surfaces data-backed risk/watch, is behaviourally tested and browser-verified. The Client Health plan is complete. (Optional: disambiguate the `clientsNeedingAttention` array-vs-count name on the dashboard payload.) Launch gates unchanged: erasure 🔴 remains the sole open blocker.

## 2026-08-19 — ✅ PASS — Client Health Phase 2: enquiry/traffic → Command Centre alerts

**Verdict:** ✅ PASS — exemplary, like Phase 1. A firing enquiry/traffic risk factor becomes a specific operational alert that carries the **exact baseline evidence** and a **direct resolution path** (never a bare count), is correctly classified **off-system** with an observable `clearsWhen` (no Resolve button for off-system work), fires **only when data-backed** (thin data stays `learning` — no crying wolf), and derives from the **same verdicts** as the health chip so the two can't disagree. Behaviourally tested against the real alert engine. No findings.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 tests · 1747 pass · 0 fail · 1 skip** (green; the claim's 1588 is stale drift).
- **The operational-alert contract — HELD (`operationalAlerts.ts:294-311`).** Each alert carries `detail` = the verdict's exact evidence ("No enquiries in the last 30 days, against a baseline of X per month") + `href: /portal/clients/<id>?tab=systems` (a direct Fulfilment resolution path) + `clientId`/`clientName`. Not a vague count with nowhere to act. Severity `traffic-silent → critical`, else warning; gated by `notifications.clientAlerts`.
- **Thin-data honesty — PRESERVED through the refactor.** `clientTelemetryRiskSignals` (`clientAquaHealth.ts:282`) only emits a signal when the verdict's `risk` is set, and each verdict returns `risk: null` whenever `ratio===null || baseline===null` (no established baseline → learning, `:183/226`). So an alert fires only against an evolving, above-floor baseline — never from thin data. The same verdicts feed the health factor, so alert and chip can't disagree (single source of truth).
- **Action-kind contract — HELD.** `kind: "off-system"` + a concrete `clearsWhen` (the metric returns to baseline) — an observable clearance, not a judgement and not a Resolve button. The `client-health-` family is registered in **both** classification tables (`resolutionExplain.ts:108` off-system + `resolutionFocus.ts:48` → "evidence"), so the "every action classified" guarantee test stays green; the cross-lane edits are additive lookup rows only.
- **Tests real + behavioural (B).** `smoke-operational-notifications.test.ts:222` drives the **real** `listOperationalAlerts` against a seeded memory store (a client with ~80% traffic drop + no enquiries) and asserts the exact alert: `kind==="off-system"`, title "…no enquiries this month", **`detail` matches "baseline of 4.5 per month"** (the evidence, not a count), `href` startsWith `?tab=systems`, `clearsWhen`, `clientId`. Plus 3 signal cases in `client-aqua-health.test.ts`. No test weakened; no `.skip`.

**Findings:** none. Evidence + resolution path + honest off-system classification + fires-only-when-data-backed + a behavioural test — the operational-alert contract done exactly right. The Phase-1 rigor sustained.

**→ Commander:** Mark **Client Health Phase 2 done** — the enquiry/traffic alerts identify exact evidence and a direct path, never cry wolf from thin data, are correctly classified off-system with a real clearance, and are behaviourally tested against the live engine. (Launch gates unchanged: erasure 🔴 remains the sole open blocker.)

## 2026-08-19 — ✅ PASS (re-audit) — Finance: one shared idempotency guard across the money-CREATE surface

**Verdict:** ✅ PASS — the money double-count 🟠 cross-cutting finding is **resolved**, and correctly. One shared primitive (`deriveRecordId`) derives a record's id from a client-supplied per-intent key, so a resubmit lands on the same slot and can't become a duplicate — the exact "stable reference" idea I asked to generalise, one mechanism not five patches. Money-in is safe on both the sequential double-click **and** a parallel race; genuine partial payments still record. Behaviourally tested, including the parallel race. One minor **non-money** nit remains.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 tests · 1747 pass · 0 fail · 1 skip** (green).
- **Mechanism — sound.** `deriveRecordId(prefix, key)` (`idempotency.ts:59`) = `${prefix}_${cyrb128("prefix:key")}` — deterministic 128-bit id, **namespaced by prefix** so a close-deal contract and its invoice from the same key don't collide; no key → old random `makeId` (backward-compatible). Key trimmed/bounded (`normaliseIdempotencyKey`, empty→absent).
- **payments.record — money-safe (`payments.ts:120-186`).** With a key, `get(id)` short-circuits **before** any write/log/emit/settle, returning the first payment with `deduped:true` (`:130-134`). Sequential resubmit → one row, no double side-effect. Parallel race → same derived id overwrites one slot → **one payment row** (and the index is set-to-computed-array, so it holds the id once); money-in reads rows (Finance Phase 2) → counted once. New key → new id → recorded (partials legal).
- **invoices.create — no burned number (`invoices.ts:131-136`).** The existence short-circuit returns **before** the sequential invoice-number allocation (`:140-141`), so a resubmit doesn't consume a number.
- **close-deal — no double-bill (`closeDeal.ts:81-99`).** Contract id derived from the key; fast-return when `priorInvoice && priorContract` both exist → `deduped:true`, **no second pay-link, no duplicate deal.closed log**. Off the fast path, `invoices.create(key)` still dedups the invoice and the contract save replaces by id (`filter(id!==contractId)`).
- **income/plans/payroll** all route through `deriveRecordId` (`income.ts:41`, `plans.ts:65`, `operations.ts:246`) with the same short-circuit shape.
- **Tests real + behavioural (checklist B).** `smoke-finance-idempotency.test.ts` drives the **real container**: sequential double-submit → `deduped`, one payment, "money-in counted once" (`:110-117`); **parallel `Promise.all` → one payment** (`:126-130`); two distinct-key partials → two payments + settles (`:137-148`); no-key → two, unchanged (`:153-156`); `deriveRecordId` determinism + prefix-namespacing (`:93-101`). `smoke-finance-close-deal.test.ts` +2 (same key → one invoice+contract; new key → two). No existing finance test weakened; no `.skip`.

**Findings:**
- 🟡 (minor, **not money**) **A true parallel race can still double-log / double-emit the side-effects.** In `payments.record` (and sibling creates) two simultaneous same-key submits can both pass the `get(id)` check before either writes; the **row is deduped (money safe** — one payment, and **nothing money-aggregating subscribes to `agency-finance.payment.recorded`** — verified by grep), but the activity-log entry + event emit at `:160-167` can run twice. Cosmetic (a duplicate log line) — the common sequential double-click is fully clean via the short-circuit. **Optional hardening:** re-check existence immediately before the side-effects, or gate them on a post-write "first writer" check.
- (scope note, not this claim) The separate **Stripe webhook drop-on-transient-retry** 🟠 (Finance Phase 3 verdict — `handlers-stripe.ts` marks an event processed *before* reconcile succeeds) is a different bug (a *drop*, not a double-count) and this create-surface fix does not touch it. Still open as its own item — track before enabling LIVE Stripe.

**→ Commander:** Mark the **finance money-idempotency launch gate RESOLVED** — the create-surface double-billing is fixed with one shared, reused mechanism, money-in is safe on sequential **and** parallel double-submits, partial payments still work, and it's behaviourally tested (incl. the parallel race). This is the test-rigor the money paths owed. Neither of the two remaining items is part of this claim: the **erasure 🔴** (still HELD, re-audited tick 5) and the separate **Stripe drop-on-retry 🟠** (before LIVE Stripe). After this tick, **erasure is the sole remaining launch blocker** of the original three.

## 2026-08-19 — ✅ PASS (re-audit) — Freelancer preview MANAGER → OWNER escalation: CLOSED

**Verdict:** ✅ PASS — the 🔴 privilege escalation is **resolved**. `exit` now restores the exact enterer stashed at `enter` (not "an owner it finds"), derived from the live record and fail-closed on every missing/invalid case. Manager→manager, owner→owner; no owner fallback remains, and no new escalation is introduced. Behaviourally regression-tested against the real handler with the owner present in the agency (so the old bug would fail the test). Clears the loud line.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 tests · 1747 pass · 0 fail · 1 skip** (green; all three blocker-fixes now in the tree).
- **The escalation is closed (`preview-as-freelancer/route.ts`).** `enter` stashes `previewReturnUserId: session.userId` (`:88`). `exit` restores that **exact** user via `getUserById(session.previewReturnUserId)` (`:44`), taking role/email/agencyIds/sessionRev from the **live** record (`:52-61`) and re-scoping to the return agency. **The old owner-find is gone** — no `listUsersForAgency`, no `find(role==="agency-owner")`.
- **Fail-closed, no owner fallback.** A legacy cookie without `previewReturnUserId` → `enterer` null → **409** (`:44-45`); a deleted enterer → 409; an enterer no longer in the return agency → **409** (`:46-51`). None fall back to an owner.
- **No new escalation (adversarial).** `previewReturnUserId` is written server-side into the **signed** session at enter, so a manager can't forge it to the owner's id; re-calling `enter` from inside the freelancer preview hits the `:66-68` role gate (freelancer ≠ owner/manager → 403); cross-agency is blocked by the `entererAgencyIds.includes(returnAgency.id)` check. Exit only ever restores the caller's own stashed identity.
- **Behaviourally tested — real regression guard (checklist B).** `smoke-dev-mode.test.ts:698` imports the **real** `POST` handler (`:21`), creates a genuine `agency-manager` **with the owner also present in the agency** (so the old owner-find would have had an owner to grab and the test would fail on the old code), drives enter→exit, and asserts the restored session is `agency-manager` / the manager's email and **NOT** `agency-owner` / the owner's email (`:725-731`), plus `previewReturnUserId === manager.id` at enter. The owner + demo-owner round-trips (`:667-696`) are preserved; nothing weakened; no `.skip`.

**Findings:** none. The fix is exactly what the REWORK asked for (stash + restore the exact enterer, fail-closed), guarded by a behavioural test that would catch a regression.

**→ Commander:** Mark the **Freelancer preview escalation RESOLVED** — the manager→owner 🔴 is closed and behaviourally regression-tested. Loud line cleared. (Remaining launch gates: erasure 🔴 still HELD — re-audited last tick; finance money-idempotency fix claimed and pending re-audit next tick.)

## 2026-08-19 — 🔴 REWORK (re-audit) — Erasure "close the last PII hole": only the delete path was fixed; create/promote/update still leak the email

**Verdict:** 🔴 REWORK — the gate stays **HELD**. The delete-path fix is real and correct (`contacts.ts:277` now logs `Archived contact <id>`, no email), but "the **LAST** PII hole" is an overclaim: **three sibling log sites still write the raw email with no `clientId`**, and the clientId-only sweep can't reach any of them. The `Added` entry exists for **every** contact (it's how one is created), so a real erased contact's email survives in `state.activity`. The new test passes only because it seeds the contact by a **raw `state.pluginData` write**, never calling `ContactService.add()` — so the `Added … email` entry that leaks in production is never created in the test.

**Audited:**
- **Re-ran the FULL suite myself:** **1739 pass / 0 fail / 1 skip** (green — but green here does not prove the hole closed; see the test gap below).
- **The fix — VERIFIED as far as it goes.** `contacts.ts:260-279` `delete()` now logs `message: \`Archived contact ${id}.\`` with metadata `{contactId, type}` — no email. Correct; the guard comment (`:272-276`) is accurate about *that one* path.
- **The hole — STILL OPEN (three more sites).** The same file's other three activity writes still embed the email and pass **no `clientId`** (metadata is `{contactId,…}` only): `add()` `:156-163` → `Added … ${contact.email}`; `promoteLead()` `:215-222` → `Promoted lead ${lead.email}`; `update()` `:240-247` → `Updated contact ${updated.email}`. `logActivity` stores `clientId` verbatim → these are `clientId: undefined`; `clientErasure`'s sweep drops activity only where `entry.clientId === clientId` (no content scrub — confirmed by the test's own comment `smoke-client-erasure.test.ts:208-210` and by the update entry). So each survives erasure with the raw email. This is exactly what my tick-3 finding named ("`Added … ${email}` :161, `Promoted … ${email}` :220 … none pass a clientId … survive erasure") — only `:272/277` was addressed. The builder's own note "the delete path is the only one erasure exercises" is the reasoning error: the leak isn't what erasure *exercises*, it's the **pre-existing** create/promote entries that erasure *fails to sweep*.
- **The test seeds around the gap.** `smoke-client-erasure.test.ts:165-168` writes the leads contact straight into `state.pluginData[leads.id]` (`"contact:l1": {…, email:"lead@x.com"}`), so **no `Added … lead@x.com` entry is ever produced**. The only email-bearing log entry the test can create is the delete entry (now clean), so the "email absent from `state.activity`" assertion (`:211-212`) passes without touching the real leak. Seed the same contact via `ContactService.add()` and that assertion fails on the surviving `Added` entry. Same class as the original miss: the test proves the fixed path, not the real surface. *(Proven by code-inspection + the test's own seeding path; a plugin-runtime repro wasn't built this tick — the deduction is airtight: three sites embed the email, none carry clientId, sweep is clientId-only.)*

**Findings:**
- 🔴 **The erased contact's email still survives erasure via the create/promote/update activity entries** (`contacts.ts:161,220,245` — raw email, no `clientId`; sweep is clientId-only). The `Added` entry is guaranteed for any real contact. "Closed the last PII hole" is false. **Fix (complete this time — my prior "don't log PII *during* erasure" guidance was too narrow, and the builder followed it literally):** either (a) remove the email from **all four** contact log messages (`add`/`promote`/`update`/`delete`), using contactId + metadata as the delete path now does; or (b) stamp contact activity with the contact's `clientId` at write time **and** purge the pre-existing entries during erasure; or (c) add a content-scrub to the erasure activity sweep that redacts the known-erased email across `state.activity`.
- 🟠 **(test) The regression test bypasses the API it is meant to protect.** Seeding `state.pluginData` directly means it can never observe the create-path leak. A right-to-be-forgotten test must drive the real **create → erase** lifecycle: seed via `ContactService.add({email})`, erase the client, assert the email is absent from `state.activity`.

**→ Commander: KEEP the erasure launch gate 🔴 HELD.** The builder closed the delete-path leak (real progress) but "last hole closed" overclaims — the create/promote/update log entries still carry the email past erasure, and the new test seeds around them. Route back to the erasure builder: strip the email from all four contact log messages (or purge/scrub the pre-existing entries), and re-seed the test via `ContactService.add()`. Do not un-hold until the email is absent from `state.activity` after a contact created through the **real** API is erased.

## 2026-08-19 — ✅ PASS — Connect flow Phase 4: expiry countdown + error UX

**Verdict:** ✅ PASS. Every Phase 4 claim is real and correct — a self-expiring M:SS countdown, a plain "expired, send a new one" once it lapses, Confirm disabled on a spent (expired/locked) code with the resend promoted to primary, and a confirm handler that reads the accept `confirmation` status to branch retry-vs-fresh-code and clears a dead code. Pure client-side UX with the server as the real gate; no contract surface, nothing gamed to go green.

**Audited** (`_ConnectFlow.tsx`, its own file):
- **Re-ran the FULL suite myself:** **1739 tests · 1738 pass · 0 fail · 1 skip** (green; the 1 skip is the standing `smoke-postgres-backend-wired` memory-backend skip, unrelated).
- **A — claim VERIFIED by reading the source.** Countdown (`:191-192,226-228`) with `formatCountdown` rounding up (`:329-334`); `codeExpired`/`needsFreshCode` derived from the server outcome *or* the clock (`:192-193`); Confirm disabled on spent (`:241` `disabled={busy || !code.trim() || needsFreshCode}`); resend promoted to primary text+style when spent (`:249-258`); confirm reads `result.confirmation` to set `lastOutcome` and clears the box on expired/locked (`:171-175`); a fresh code resets clock+outcome+input (`:101-104`); the recipient line uses `sentTo` (`:70,98,205-207`). `expiresAt` is wired end-to-end — `request-code` returns it (`route.ts:115,120`), the component consumes it.
- **No React 19 Strict-Mode timer trap.** The two concerns my memory flags are already split: the one-shot auto-send guard (`requestedRef`, `:117-121`, no cleanup → fires once even under dev double-invoke) and the 1s countdown interval (`:125-129`, idempotent with a `clearInterval` cleanup, gated on `step==="code" && expiresAt!=null`). No stranded state, no leaked timer; the interval clears on unmount / step-change / resend.
- **C/D/E — no risk.** Client-side only: no server mutation, no role/scope/internal-visibility/radar surface. The real gate for expired/locked is the already-audited server (`checkConfirmationCode` + accept route, Phase 1/3). Edits only its own file plus the already-audited `expiresAt` return; no duplication; no live-Supabase write; connect-flow files remain untracked (no git commit).
- **B — no test gamed.** No `.skip` in `smoke-mfa`/`smoke-portal-connections`; the Phase 4 assertions are additive `it()` blocks, no prior contract weakened or deleted.

**Findings:**
- 🟡 (minor) **The Phase 4 UI contracts are source-matched, not behavioural** — `smoke-mfa.test.ts:176-200` regex the `.tsx` text (`/needsFreshCode/`, the exact `disabled={…}` string, `/formatCountdown/`). Acceptable here (the smoke suite has no DOM renderer, so this is the established norm for every UI component incl. `TwoFactorSetup.tsx`, and Phase 4 is presentation-only), but a logic slip in the `codeExpired`/`needsFreshCode` derivation wouldn't be caught by tests — I inspected it and it's correct, and the server refuses spent codes regardless.
- 🟡 (trivial, optional) **The countdown interval keeps ticking after the code lapses** — its effect guard (`step==="code" && expiresAt!=null`) stays satisfied post-expiry, so `nowTick` updates every second with nothing left to change. Negligible; gate it on `remainingMs > 0` to stop the idle timer.
- (note) The update's suite count (1517) is stale vs the current 1738 — expected drift as later phases landed; not a defect. The update honestly states the interactive code-step browser walk wasn't driven.

**→ Commander:** Mark **Connect flow Phase 4 done** — the expiry/countdown/spent-code UX is correct, the timer effects are Strict-Mode-safe, suite green, server remains the real gate. UI contracts are source-matched (fine for presentation), so the browser click-through of the code step is the only thing left to move it fully user-reachable — as the builder already flagged. Connect flow stays off the current launch-gate list; the 3 open 🔴s are unchanged this tick.

## 2026-08-19 — 🟡 PASS WITH NITS — Connect flow Phase 2: email the code + issue/resend endpoint

**Verdict:** 🟡 PASS WITH NITS. The Phase 2 claims are **true and the behaviour is correct** — the code is emailed **only** to `session.email` (a request cannot redirect it), no code is minted that can't be delivered outside dev (503 fail-closed), dev logs the code, and the email builder never carries the hash. The one real gap: the endpoint's **security contract is source-match-tested, not behavioural** — the "14/14 in-process harness" the update cites was a **throwaway scratch harness**, not committed, so the recipient-binding + fail-closed guarantees have no durable regression test (the same scratch-harness pattern the erasure 🔴s were caught by).

**Audited:**
- **Re-ran the FULL suite myself:** **1739 tests · 1738 pass · 0 fail · 1 skip** (green; matches the current baseline).
- **A — recipient binding VERIFIED (the core claim).** `request-code/route.ts` parses the body for **`connectionId` only** (`:36-37`) and sends with **`to: session.email`** (`:89`) — the recipient comes from the authenticated session, never the request. The transport honours it: `sendTransactionalEmail` sets `to: input.to` on both the Resend (`transactionalEmail.ts:66`) and SMTP (`:96`) paths — only FROM/apiKey come from tenant config, so **agency/client config cannot override the recipient**. A caller cannot redirect the code.
- **A — fail-closed delivery VERIFIED.** Outside dev the route checks `transactionalEmailReadiness(agencyId, clientId)` and returns **503 `confirmation:"unavailable"`** when no sender is configured (`:55-65`), so it won't mint an undeliverable code; the readiness expression (`transactionalEmail.ts:35-36`) matches the send-path guard for the no-`sender` caller (`:63-84`), so there's no "readiness passes but send is unconfigured" mismatch. In dev it's exempt and logs the code to console like magic-link (`:106-107`).
- **C/E — the mint is viewer-scoped.** `issuePortalConnectionCode` gates the write through `canCompleteConnection(viewerClientId, viewerUserId)` — the same authz as completing the connection — and hashes the code to `viewerUserId` (`portalConnectionStore.ts:126-145`). So the code is bound to, and sent only to, the entitled viewer. No junk to live Supabase (store/memory only); connect-flow files remain untracked working-tree work (no git commit).
- **D — reuse, not a third copy.** Uses the one transport (`sendTransactionalEmail`), `rateLimit` (Phase 3), and the pure `connectionCodeEmail` builder; the email mirrors magic-link's styling deliberately, not a duplicated transport.
- **B — email builder behaviourally tested; endpoint only source-matched.** The `connectionCodeEmail` tests are real (`smoke-portal-connections.test.ts:765-787`): they derive the actual hash and assert the email does **not** contain it, plus code-present / expiry / single-use. **But the endpoint tests (`:790-833`) read the route file as text and string-match it** — `assert.match(route(), /to: session\.email/)`, `/transactionalEmailReadiness/`, etc. No committed test drives the `request-code` POST handler; the `issueSession + NextRequest` in-process pattern exists in 9 other suites but **not** here.

**Findings:**
- 🟠 **The endpoint's security contract has no behavioural test — the "14/14" harness was throwaway.** "Sends to `session.email`, never a body address" and "503 without a sender outside dev" are asserted only by string-matching the route source (`smoke-portal-connections.test.ts:811-823`). Source-matching `to: session.email` is brittle both ways (a benign rename to a local var fails it; a real regression via a differently-named body field passes it) and cannot prove the *behaviour* that a request carrying an `email` can't redirect the code. The behavioural in-process harness the update cites (`updates.md:695`, "14/14") is **not in the repo** — the same scratch-harness pattern the erasure Phase 2/2b 🔴s were caught by. **Fix:** add a committed in-process handler test (the `issueSession + NextRequest` pattern already in `smoke-dev-mode`/`smoke-signup-flow`): (a) POST a body carrying a *different* `email` → assert the send still targets `session.email`; (b) drive the no-sender path with dev-mode off → assert 503 + `confirmation:"unavailable"`.
- 🟡 (minor, optional) **Readiness is probed before viewer-authorization**, so any signed-in user who knows a `connectionId` they're not party to can distinguish "this agency has no email sender" (503) from the authz refusal (403) — a very low-value signal about an agency's email config (not PII; needs a valid connectionId). **Fix (optional):** run the readiness check after `issuePortalConnectionCode` succeeds, so only entitled viewers reach it.

**→ Commander:** Mark **Connect flow Phase 2 done for TEST mode** — recipient-binding and fail-closed delivery are verified correct, the mint is viewer-scoped, the transport honours `to`, suite green. **Before launch:** commit a behavioural in-process test for the endpoint's two security guarantees (recipient-binding + 503-without-sender) — today they're source-matched only and the runtime harness was throwaway; the same durable-test gap the erasure and finance paths still owe. (Connect flow is not on the current launch-gate list — the 3 open 🔴s stand unchanged this tick.)

## 2026-08-19 — ✅ PASS — Enquiry card: import-forms SSRF + "Added by hand" internal-stays-internal (Orchestrator request)

**Verdict:** ✅ PASS on both. The import-forms fetch is genuinely SSRF-hardened — it can't be pointed at cloud-metadata/internal endpoints even if a registered host resolves internal, and every redirect is re-validated. The "Added by hand" store writes only its own slot, never the live enquiry or the Person model.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Q1 — Import-forms SSRF: SAFE.** `importFormSchemasForSite` (`websiteFormSchemas.ts:44-80`) fetches **`https://${source.host}`** where `source` is the agency's **registered** website source (`:50`) — the URL is **not user-supplied** (input is a `websiteSourceId`), scheme hardcoded https. The fetch goes through `fetchPublicSiteHtml` (`safeSiteFetch.ts`), comprehensively SSRF-hardened:
  - **Blocks private/reserved/metadata addresses** via `isUnsafeSyntheticAddress` — incl. **`169.254.169.254`** (`a===169 && b===254`, the cloud-metadata endpoint), `127/8`, `10/8`, `172.16/12`, `192.168/16`, CGNAT, multicast, IPv6 `::1`/ULA/link-local. Applied to **IP literals AND every DNS-resolved address** (`:96-113`) — a registered host that *resolves* to an internal IP is blocked.
  - **Re-validates the destination on EVERY redirect hop** (`assertPublicDestination` at loop top `:188`; `redirect:"manual"` `:123`) — the classic redirect-to-metadata SSRF is closed.
  - Non-http schemes + URL credentials rejected (`:81-86`); redirect cap 5, 8s timeout, 512KB body cap. Blocklist **shared with Radar's synthetic probes** (no drift).
- **Q2 — "Added by hand" internal-stays-internal: SOUND.** `saveEnquiryContactDetails` (`enquiryContactDetails.ts:66-79`) writes **only** to `state.enquiryContactDetails[enquiryId]` — never `brand_enquiries` (the live enquiry) or `people`/`Person` (the doc-comment `:11-19` states this deliberately; a Person is created only on conversion). Agency-scoped (`:55`), bounded inputs. Dedicated test: `smoke-enquiry-contact-details.test.ts`.

**Findings:** none. Import-forms SSRF hardening is textbook (registered host + guarded fetch + per-redirect re-validation + comprehensive blocklist incl. the metadata endpoint); the hand-added store is correctly isolated.

**→ Orchestrator / Commander:** **Both CONFIRMED.** Import-forms is SSRF-safe (can't reach localhost / 169.254.169.254 / internal ranges / non-http, even via a redirect or a malicious registered host), and the "Added by hand" layer stays internal (writes only its own slot). Ship it.

## 2026-08-19 — ✅ PASS — Dev Docs in-app markdown viewer: XSS-safe (new-work spot-check)

**Verdict:** ✅ PASS. The new in-app markdown viewer renders via **react-markdown without `rehype-raw`** — raw HTML in the markdown is escaped, not rendered — so there's no XSS surface. (Content is the project's own docs, owner + dev-mode gated, so the input is trusted too.)

**Audited** (`dev-docs/_DocMarkdown.tsx`; full suite green at tick 25, this is a static config review):
- **No raw-HTML injection.** `ReactMarkdown` + `remarkGfm` only (`:8-9,72`); **no `rehype-raw`**, so raw `<script>`/HTML in the markdown is escaped by default (the comment `:2-6` states this posture). **No `dangerouslySetInnerHTML`** anywhere in the docs components. Every element renders via the `components` map as React JSX (children auto-escaped).
- **Link + image safety.** External links get `rel="noopener noreferrer" target="_blank"` (`:31-38`) — no tabnabbing; relative doc links render as inert text (`:44`). The `img` renderer reads only `{src, alt}` (`:64-67`) — no arbitrary attributes, so no `onerror` injection.

**Findings:** none — a correctly-built markdown viewer (escape-by-default, no rehype-raw, link noopener).

**→ Commander:** Dev Docs markdown viewer verified XSS-safe. (The 3 open 🔴s — erasure log, freelancer escalation, finance idempotency — remain the launch gates; unchanged this tick.)

## 2026-08-19 — ✅ PASS — KPI Intelligence overhaul: formula engine + targets scoping + evidence-vault edit (Orchestrator request)

**Verdict:** ✅ PASS on all three. The custom-KPI "formula engine" is a **structured allow-listed builder, not an eval surface** — a malicious formula is structurally impossible. The targets endpoint is agency-scoped (no cross-tenant leak). The evidence-vault edit is additive, summary-only, and thin-data-honest — no radar contract weakened.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip** (all radar golden/classification/evidence tests pass → the radar contract holds under the vault edit).
- **Q1 — Formula-engine injection surface: SAFE (no eval).** A custom KPI is a **structured `CustomKpiDefinition`** — `{label, numeratorId, denominatorId?, op}` (`customKpis.ts`), **not** a formula string. `op` must be one of the allow-list `["ratio","rate","sum","diff"]`, enforced at `createCustomKpi:36` (throws otherwise). `computeCustomKpi` (`kpiRegistry.ts:303-306`) is a `switch(op)` over **pure arithmetic** (`÷0 → null`; an unknown metric id → the KPI drops to null `:373` — **no crash**). There is **no `eval`/`new Function`** and no formula-code path — the store comment is accurate: *"they carry no formula code."* A user can only pick existing metric ids + 4 ops → nothing to inject/exfiltrate.
- **Q3 — Targets endpoint agency-scoped: SOUND.** `kpi-registry/targets/route.ts` GET/POST both bind to **`session.agencyId`** (`getKpiTargetsConfig(session.agencyId)` / `setKpiTarget(session.agencyId, …)`) — the agency is never taken from the body, so **agency A cannot read or write agency B's targets**. Role-gated to `AGENCY_ROLES`.
- **Q2 — `radarEvidenceVault` edit: additive, summary-only, honest.** `git diff`: **+21/-1** — adds `rollingBaseline: rollingValues.length >= 3 ? median(...) : undefined` to the vault **summary**. Thin-data-honest (a baseline only once ≥3 points; else undefined — no manufactured baseline, consistent with tick-6 zero-blindness / tick-16 Client-Health honesty). The anomaly path is untouched; the suite's radar tests (golden 2064/2959, classification, evidence) all pass → **no contract weakened**, co-exists with the 2,064 catalogue.

**Findings:**
- 🟡 (minor, targets) `setKpiTarget` receives a body `companyId` without the route verifying it belongs to `session.agencyId` — a target could carry a foreign `companyId` scope key. **No leak** (stored under the actor's own agency; a foreign key is an unused scope, not a read of B's data), so cosmetic/data-integrity. **Fix (optional):** validate `companyId ∈ agency`.

**→ Orchestrator / Commander:** **All three CONFIRMED clean.** The formula engine is a safe structured builder (no eval — the highest-risk item is a non-issue by design), targets are agency-scoped, the evidence-vault edit is additive + honest with no radar regression. Ship it. (Optional targets nit: validate `companyId ∈ agency`.)

## 2026-08-19 — 🔴 HELD (re-audit of "plan COMPLETE") — Erasure: email-in-LOG still open; RETAIN + brand_enquiries sound

**Verdict:** 🔴 HELD. The worker's "plan COMPLETE" does **not** address the email-in-LOG 🔴 (my tick-3 finding) — confirmed unchanged. The two items the worker asked me to scrutinize (RETAIN classification, `brand_enquiries` split) are **actually sound**. So erasure is **one narrow fix from complete** — but "complete/launch-safe" is an overclaim by exactly the log hole.

**Audited (re-verify on the "complete" claim):**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- 🔴 **email-in-LOG — STILL OPEN.** `ContactService.delete` (`contacts.ts:272`) still logs `Archived contact ${existing.email}` with metadata `{contactId,type}` — **no clientId**; `clientErasure` still sweeps `state.activity` **by clientId only** (`:463`, no content scrub); **no log-absent test** exists. Phase 2b fixed the email-in-**KEY** (`contacts/email/<email>` pointer) — a *different* thing. The delete op still writes the email into the activity log, un-scrubbed. Unchanged from tick 3.
- ✅ **RETAIN classification — sound (scrutiny #1).** **retain + strip-hook** for PII-embedding plugins (ecommerce, affiliates, **memberships** — now HAS a hook, an improvement since tick 4) → PII stripped, de-identified record kept; **retain-wholesale** only for legal-hold records that reference `clientId` — `agency-finance` (its `name` fields are template/attachment names, not client PII; Invoice/Payment/Expense reference `clientId`) and `fulfillment` (no PII fields) → no silent PII keep; **delete** (default) for comms/marketing/CRM/funnel/email-sender. No plugin wrongly `delete` (no legal-hold breach) or wrongly `retain` (no silent PII keep). *(Scoped: sampled finance's name-bearing types, not all 6 — but the pattern is clearly clientId-referencing + non-PII names.)*
- ✅ **`brand_enquiries` split — correct + matches the recording (scrutiny #2).** `clientErasure.ts:382-410`: **always** drops the client link (`metadata.clientId`, `clientLinkedAt`, `ir.clientId`, `ir.clientName`); strips PII (`name/email/phone/contact_method/message/source_url` + `replies/calls/formCapture`) **only** when `ir.status==="resolved" && clientId matches` (`:392`) — the enquirer IS the erased client. A separate party merely tagged is unlinked but kept. The split reads the same `identityResolution.status/clientId` fields the recording writes — consistent. *(Minor: confirm no other PII column on `brand_enquiries` beyond those stripped.)*

**→ Commander / Orchestrator:** **HOLD launch-safe.** Erasure is genuinely close — RETAIN + live-scrub + brand_enquiries are all correct — but the **email-in-LOG 🔴 stands**; "complete" overstates by exactly that. Un-hold when the delete stops writing the email to the activity log (a silent/PII-free delete path for the erase hook, or a `clientId`-stamped + swept entry) **AND** a test asserts the erased email is absent from `state.activity` after an erase.

## 2026-08-19 — 🔴 REWORK — Freelancer preview: MANAGER → OWNER privilege escalation (session-minting)

**Verdict:** 🔴 REWORK. The preview-as-freelancer session-minting is otherwise well-built — owner/manager-gated, agency-scoped, cleanly isolated from the Dev Mode channel, crypto-random freelancer password. But `exit` re-mints "an agency-owner" regardless of who entered, and `enter` admits managers — so **any agency-manager can preview a freelancer and exit as the OWNER.** A trivial 2-request RBAC escalation.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **What's sound:** `enter` is owner/manager-only (staff/others → 403, `preview-as-freelancer/route.ts:47`); the target freelancer resolves **agency-scoped** (`freelancerLoginUserId(session.agencyId, employeeId)`, `:53`); the minted preview is **fenced** (role `"freelancer"`, `agencyIds:[session.agencyId]`, `isDemo`, `:57-68`); **channel isolation is correct** — it stamps `previewReturnAgencyId` (not `devReturnAgencyId`), so Dev Mode's `isActiveDevSession` (needs `devReturnAgencyId`) rejects it (switcher hidden), and the freelancer `exit` needs `previewReturnAgencyId` so a Dev Mode session can't use it. `createFreelancer` mints a **crypto-random** password (`crypto.randomBytes(24)`, `freelancerAdmin.ts:65` — unguessable) and is agency-scoped (cross-agency email → `email_in_use`, `:58`).

**Findings:**
- 🔴 **Privilege escalation: manager → owner.** `enter` admits `agency-manager` (`route.ts:47`), but `exit` re-mints as **whatever agency-owner it finds** (`:31` `listUsersForAgency(...).find(role==="agency-owner")` → `:33-42` `role: owner.role`), because the preview session records only `previewReturnAgencyId`/`previewReturnWasDemo`, **not the enterer's identity**. So a manager: `POST {employeeId}` (enter, authorized) → `POST {action:"exit"}` → re-minted as the **agency owner** (owner.id, role agency-owner) → holds a full owner session. Breaks the role-scope contract. (Dev Mode avoids this only because *its* enter is founder-only.) **Untested** — the enter→exit tests use an owner enterer. **Fix:** stash the enterer's `userId` (+ role) at `enter` and restore **exactly** on `exit`; or restrict `enter` to owner-only.

**→ Commander:** **Route to the freelancer builder — 🔴 privilege escalation.** A manager becomes the agency owner via a freelancer-preview enter→exit round-trip (exit restores "an owner," not the enterer). Fix by restoring the exact enterer (or owner-only enter), and add a test: a *manager* who previews → exits is restored as a **manager**. Everything else in the feature is sound.

## 2026-08-19 — ✅ PASS — Aqua Tag consent enforcement (re-verify) + Radar catalogue growth (Orchestrator request)

**Verdict:** ✅ PASS on both. Tag-side consent gating genuinely holds analytics/marketing until consent, is idempotent, and isn't bypassable (endpoint didn't widen). The Radar catalogue growth (2,040→2,064) is guarded, drift-locked, and the 2 new families are real signals, not placeholders. One carry-over nit: the injection gate still isn't behaviourally VM-tested.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Q1 — Tag-side consent enforcement (`aquaTagSource.ts`).** `permitted` (`:93`): `necessary` always; `analytics`/`marketing` only when `preferences` grants → **held until consent**. `runInjections` (`:154-160`) injects **only if `permitted`**, is **idempotent** (`injectedKeys[key]` set *before* inject, `:158-160`), and retroactive on opt-in (`applyPreferences → runInjections`, `:449`). **Not bypassable**: `consentCategory` is server-set from the allow-listed store, and the public endpoint still returns only `{kind,value,consentCategory}` (`aqua-tag-config/route.ts:38-41`) — no widening.
- **Q2 — Radar catalogue growth.** The 2 new families are **named + real**: `sales:enquiry-routing` (fed by a real `websiteSources` routing-destination observation) and `development:injection-coverage` (fed by a real `websiteSiteConfigs` enabled-injection observation) — both **informational + connected-at-zero** (a zero reading is a baseline, never a false blind spot/alarm — the tick-6 zero-blindness contract, correctly applied). **Guarded**: exact-count invariants updated deliberately in **both** `smoke-radar-golden-sweep` (`catalogChecks===2064`, `totalChecks===2959`) and `smoke-radar-classification` (`catalogue.length===2064`) — so any silent drift fails the suite. **+16/family** invariant holds (12 catalogue lenses + 4 evidence-layer × 2 = 32). Reference regenerated.
- **Q3 — Public endpoint didn't widen.** ✓ still `{kind,value,consentCategory}` only.

**Findings:**
- 🟡 (carry-over from tick 11) **The injection-specific consent gate still isn't behaviourally VM-tested.** `smoke-consent-capture` VM-executes the tag but its `appendChild` is a no-op stub (`:45`) that doesn't observe injection — it only asserts the *telemetry* gate (`:91-97`). The injection gate is verified by code + browser + a source-match wiring contract, but not by a repeatable "analytics tool held without consent → injected after `applyPreferences`" VM test. Confidence stays high (shared `permitted()` is VM-tested via telemetry; browser-verified), but that one test would fully close it.
- (minor, tick 11) `runInjections` defaults a category-less config item to `"necessary"` (`:159`) — fail-open-to-necessary. Dead-defensive (the store always sets a category), but holding an unknown category would be safer.

**→ Orchestrator / Commander:** **Both CONFIRMED.** Consent enforcement is sound (held-until-consent, idempotent, unbypassable, endpoint unchanged); the Radar growth is guarded and the 2 families are real signals honoring zero-blindness. Only optional hardening: the one behavioural VM test for the injection gate, and fail-closed the category-less default.

## 2026-08-19 — 🟡 INHERITS P4a — Finance Phase 4b: one-button close for a lead (UI reuse)

**Verdict:** 🟡 Inherits the P4a verdict; **no new server risk**. Phase 4b is a **UI-only** edit — a "Close the deal" button on the post-convert banner in `_LeadsPipelineWorkspace.tsx` that runs the **same `/api/tenants/close-deal` route + `closeDealForClient` engine** I audited in tick 19, on the just-converted client.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Confirmed UI-only reuse.** The close-deal route imports only `closeDealForClient` — no new `closeDealForLead` endpoint; lead→client is the existing `convert-to-client` flow, and 4b appends the close as an optional second step.
- **Leads-pipeline coordination respected.** No leads-pipeline **server** change (the flagged hazard) — it's a Journey UI edit reusing a live, tested Finance endpoint, and it did **not** disturb the erasure 🔴 that lives in leads-pipeline. Good.

**Findings (all inherited from P4a — still open):**
- 🟠 **The double-bill reaches the pipeline too** — the "Close the deal" modal hits the same unguarded close-deal route, so a double-click on a just-converted lead double-bills. Part of the systemic money-idempotency gap (re-checked this tick: **still unfixed** — the `payments.ts` "idempotent" grep hit was only a comment, line 68).
- 🟡 non-atomic close ordering (contract before invoice) — inherited.

**→ Commander:** **4b is a clean UI reuse** — no new risk, leads-pipeline correctly untouched. It only extends the reach of the already-flagged close-deal double-bill to the pipeline; the single money-idempotency fix (cross-cutting finding below) covers 4a + 4b together.

## 2026-08-19 — 🟠 Cross-cutting — money-layer idempotency gap is systemic across the finance create-surface (Orchestrator follow-up)

Per the Orchestrator's ask to watch the idempotency theme across finance — the gap is **systemic, not two isolated bugs**. Every money-*creating* path is a thin handler that mints a fresh record with **no server-side double-submit / idempotency guard**:
- `payments.record` (`server/payments.ts:114+`) mints `makeId("pay")` on every call, no dedup on (invoice, amount, externalRef); `createPaymentHandler` (`api/handlers-r007.ts:46-58`) is a bare passthrough → a double-click / retry records a **duplicate payment → silently double-counts money-in** (the tick-12 aggregation shows 2×).
- Same shape: `createInvoiceHandler`, `createIncomeHandler`, `createPlanHandler`, `compensationPaymentsHandler`.
- Already filed individually: **close-deal** (🟠 tick-19 — dup contract + invoice) and the **Stripe webhook** in-process cache (🟠 tick-14 — *drops* a payment on transient-failure retry).

So a double-submit anywhere on the finance surface duplicates money records (or, for the Stripe webhook, drops one). Nuance: recording *multiple* payments per invoice is legitimately allowed (partial payments), so the fix isn't blocking them — it's deduping *accidental* dupes.

**→ Commander / Finance worker:** treat this as **one launch task, not five patches** — give the finance create-surface a shared idempotency mechanism (a client-supplied idempotency key checked server-side, or a same-actor/same-amount/short-window dedup) + a test — before real client money. Individually each is a small nit; together, an unguarded money surface is launch-blocking.

## 2026-08-19 — ✅ PASS — Meta webhook multi-tenant HMAC gate (security review — Orchestrator request)

**Verdict:** ✅ PASS — the builder's claim holds. HMAC is genuinely the sole gate; env is only ever a candidate; empty candidates are filtered and a no-candidate request fails closed; no cross-tenant path accepts a forgery; the signature compare is constant-time. One minor nit: the GET verify-token handshake compare isn't constant-time (low-value token).

**Audited** (independent review of `webhooks/meta/route.ts`, `verifyMetaWebhookRequest`/`verifyMetaWebhookSignature`, the account→agency resolver, `metaWebhookVerifyTokenAccepted`):
- **Full suite green this session** (tick 19: 0 fail / 1 skip).
- **Q1 — Can a forged/unsigned request ever be accepted? NO.** POST rejects a missing signature (`metaMessaging.ts:396`) and accepts only if the signature matches `HMAC(secret, body)` for **≥1** candidate (`:408`). Candidates are **filtered to non-empty** — stored `if (secret)` (`:404`), env `if (envSecret)` (`:407`) — so there's **no empty-key candidate** (an empty secret would make `HMAC("", body)` forgeable; it's excluded). No resolvable account + no env secret → `secrets` empty → `[].some() === false` → **401, fail-closed** (route `:34-35`). Adding candidates only adds *real* secrets to match against. Body-parse is explicitly for secret *selection*, not trust (route comment `:32-33`).
- **Q2 — Cross-tenant confusion? NO.** Candidate secrets resolve by **account ownership** (`entry.id` → `findPrivateConnectionByExternalAccount` → that agency's secret, `:398-404`). An attacker can't sign with a secret they don't hold: a forged payload naming agency B's account adds B's secret as a candidate but can't produce `HMAC(B's secret, body)` → rejected; an agency can only validly sign for accounts whose secret they hold (**their own**). Even a *resolver error* **fails closed** (wrong secret → HMAC mismatch → 401). Security rests on the HMAC, not the lookup — as claimed.
- **Q3 — Timing-safe?** Signature: **YES** — `verifyMetaWebhookSignature` uses `crypto.timingSafeEqual` + length guard (`:364`). GET verify-token: **NO** — `metaWebhookVerifyTokenAccepted` uses `candidates.has(suppliedToken)` (`:386`), a Set lookup.

**Findings:**
- 🟡 (minor) **GET verify-token handshake compare isn't constant-time** (`metaMessaging.ts:386`). **Low impact:** the verify token is a low-value handshake secret — passing the GET handshake only echoes Meta's `challenge` (no data access; Meta still delivers only to the configured URL), and the POST HMAC is the real gate. **Fix (optional):** compare against each candidate with `crypto.timingSafeEqual` to match the signature path.

**→ Orchestrator / Commander:** **Claim CONFIRMED** — the session-less multi-tenant Meta webhook is safe: HMAC-sole-gate, empty-candidate-filtered, no-candidate fail-closed, no cross-tenant forgery path, constant-time signature. Ship it. Only optional hardening: make the GET verify-token compare constant-time too.

## 2026-08-19 — 🟡 PASS WITH NITS — Finance Phase 4a: one-button "close the deal" (contract + invoice + payment)

**Verdict:** 🟡 PASS WITH NITS. Auth/scoping and the happy-path orchestration are sound (pay-link failure correctly non-fatal). Two money-adjacent correctness gaps: no double-submit guard (→ duplicate invoice/contract, a double-bill risk) and a non-atomic order that can leave a dangling contract on a mid-way failure.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Auth + scoping — sound.** `close-deal/route.ts`: `requireRoleForClient([...AGENCY_ROLES], clientId)` (`:54`) + `getClientForAgency(session.agencyId, clientId)` (`:57`) — role + agency-scoped; finance container built for `session.agencyId`; validation (client + title + positive amount, `:49`). App never holds funds (record + route only).
- **Happy path correct.** `closeDealForClient` (`closeDeal.ts:64-116`): sent contract → `invoices.create` → `invoices.update(status:"sent")` → route payment (Stripe pay-link or manual intent). A pay-link failure is **non-fatal** (`:101-107`) — the contract + invoice still land, with an honest "check Stripe" instruction. Tested (per-channel routing, non-fatal payLink, validation).

**Findings:**
- 🟠 **No double-submit / idempotency guard → duplicate invoice + contract (double-bill risk).** Nothing (route or engine) dedups a repeated close. A double-click or network retry on "Close the deal" runs the orchestration twice → **two contracts + two invoices + two pay-links** for one deal (the client could be billed / pay twice). Money action, no server guard. **Fix (before live money):** an idempotency key (client-generated, checked server-side) or a short dedup window so a retry returns the first result. (Same class as the tick-14 Stripe idempotency gap — the money layer is thin on idempotency.)
- 🟡 **Non-atomic ordering: the contract is saved *before* the invoice, no rollback** (`closeDeal.ts:83` then `:86`). If `invoices.create` throws after the contract is persisted, a dangling "sent" contract remains (each retry adds another). Not a double-bill (the invoice is the billing artifact), but a data-integrity mess. **Fix:** create + issue the invoice first, then save the contract; or roll the contract back if the invoice step fails.
- 🟡 (test-gap) Neither the double-submit nor the invoice-creation-failure path is tested — the 6 tests are happy-path routing + payLink-failure + validation. Fits the recurring test-lag on safety-critical (here money) paths.

**→ Commander:** Mark **Finance Phase 4a done for TEST mode** — auth/scoping sound, happy path correct, pay-link failure handled. **Before real client money:** add a double-submit idempotency guard (a double-click currently bills twice) and reorder so a failed invoice can't leave a dangling contract — plus tests for both. Same idempotency theme as the Stripe finding; the money layer needs a consistent idempotency story before launch.

## 2026-08-19 — ✅ PASS — Client Health Phase 1: the "don't cry wolf from thin data" honesty contract

**Verdict:** ✅ PASS — exemplary. Client Health genuinely stays `learning` on thin data and raises risk only when it's data-backed, mirroring the Radar blind-spot principle. Well-designed AND well-tested. No findings.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Aggregation gate — VERIFIED.** `clientAquaHealth.ts:86-95`: `confidence < 50 → "learning"` (confidence = the weight of factors that actually have data), so a client with thin data resolves to **learning, never risk**. The final `else → "risk"` fires only when `confidence >= 50` AND the score is genuinely low — risk is always **data-backed**. `severeKnownRisk` (`:86`) requires `score !== null`, so a learning factor can't trigger it.
- **Factor floor gate — VERIFIED.** `signalBaseline` returns `baseline: null, ratio: null` when there's no prior month (`maxBucket < 1`) or the baseline is below the floor (`baseline < floor`) — so a thin trickle of enquiries stays `learning`, never manufacturing a risk. Risk only ever computes against an established, above-floor baseline.
- **Behaviourally tested — the honesty contract is pinned** (`client-aqua-health.test.ts`): no evidence → `learning`, score null, confidence 0 (`:18-29`); a missing factor is a **visible blind spot** (confidence capped at 70, not a free pass) (`:61-63`); risk fires **only against an established evolving baseline** — enquiries-to-none (`:66-84`), sharp traffic drop (`:88-106`); a soft >10% dip stays **informational (`watch`)**, not risk (`:109-125`).

**Findings:** none. The evidence-confidence / blind-spot honesty is the CLAUDE.md Radar-contract principle applied to client health, and it's genuinely tested.

**→ Commander:** Mark **Client Health Phase 1 verified** — it won't cry wolf from thin data, risk is always data-backed, and the honesty contract is behaviourally tested. This is the test-rigor the money/erasure paths still owe — the fleet clearly *can* do it, so the recurring test-lag elsewhere is inconsistency, not capability.

## 2026-08-19 — ✅ PASS — Public upload storage (path safety + prod fail-closed)

**Verdict:** ✅ PASS. The design is safe — prod fails closed to Supabase (the filesystem-write branch never runs live), keys are content-addressed + per-agency namespaced (no user-filename traversal), extensions allow-listed. Two defense-in-depth hardenings before launch: allow-list the served content-type, and self-guard the local write path.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Prod fail-closed — VERIFIED.** `storePublicUpload` (`publicUploadStorage.ts:76-105`): Supabase branch if configured; else `durablePublicUploadsRequired` (NODE_ENV=production || VERCEL) → **throws `PublicUploadStorageError`** (`:96`) before the local `writeFile`. The filesystem write is **dev-only** — never in production.
- **No filename traversal from the real caller — VERIFIED.** The only caller, `publicMediaAdapter.store`, builds the path via `publicMediaKey` (`publicMediaAdapter.ts:53-69`): `website-media/<agencyId>/<clientId>/<siteId>/<sha256(bytes)>.<ext>` — filename is a **content hash** (not a user filename), extension is **allow-listed** (`EXT_BY_MIME`, `:19-29`, else "bin"), directory segments are **server-derived ids**. No `../`, no user-controlled path component. Content-addressing gives a stable URL across re-publishes (with `upsert:true`); per-agency namespacing prevents cross-agency overwrite.

**Findings:**
- 🟡 **Content-type isn't allow-listed at the storage boundary** — `storePublicUpload` stores + serves the caller's `contentType` verbatim, and the mime map includes `image/svg+xml` (an SVG can carry script); a `data:text/html` URI would store + serve as HTML. **Bounded** (the uploader is a trusted agency user publishing to *their own* site — where they can already inject script — and prod serves from a separate CDN origin, per-agency namespaced), so **not an active escalation**, but "approved website media" being executable is a hardening gap. **Fix (before launch):** allow-list `contentType` to safe image/video types at the boundary (reject `text/html`, sanitize or drop SVG, or serve public media with a restrictive `Content-Disposition`/CSP).
- 🟡 (defense-in-depth) **The local-dev write doesn't verify the resolved path stays within `public/uploads-public/`** (`:101` joins caller `localDirectory`/`localKey`). Not currently exploitable — the one caller passes safe values — but a future caller with user-controlled inputs would traverse (dev-only; prod is fail-closed). **Fix:** `path.resolve` + a `startsWith(publicRoot)` guard so the boundary self-defends.

**→ Commander:** Mark **public upload storage safe for now** — prod fail-closed, content-addressed, per-agency namespaced, no traversal from the real caller. Two pre-launch hardenings (both defense-in-depth, neither an active exploit): allow-list the served content-type (so website media can't be executable HTML/SVG), and add a path-within-dir guard to the local-write boundary.

## 2026-08-19 — 🟡 PASS WITH NITS — Finance Phase 3: Stripe (webhook + reconcile + refunds)

**Verdict:** 🟡 PASS WITH NITS. The security gate is right (fail-closed signature verification, per-agency secret) and reconciliation is correct + durably idempotent. But a real 🟠 money-correctness edge case: the in-process idempotency cache marks an event "processed" *before* reconcile succeeds, so a transient failure + a same-process retry can silently drop a payment.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Webhook signature gate — FAIL-CLOSED (verified).** `stripeWebhookHandler` (`handlers-stripe.ts:78-97`): no `stripe-signature` header → 400 (`:81`); `verifyStripeWebhook` (`stripe.ts:103-112`) throws if the webhook secret is unset (`:109`) and uses Stripe's canonical `constructEvent` (throws on mismatch); the handler `catch` returns 400 and **never reconciles** an unverified event (`:93-95`). Keys come from **the `?agencyId=`'s own install config** (`:85`), so a forged agencyId verifies against the wrong secret → mismatch → 400 (per-agency, no cross-tenant forgery). Keys never logged/returned.
- **Reconciliation correct + durably idempotent.** `reconcileStripeEvent` (`stripeReconcile.ts`): `checkout.session.completed` → `findByExternalRef(paymentIntent)` returns **`deduped`** on redelivery (`:45-48`) → no double-settle; matches the invoice by `metadata.invoiceId`; records payment + settles. Refund/dispute keyed by PaymentIntent; unknown events ignored. invoiceId is stamped into both session + PaymentIntent metadata (`stripe.ts:92-93`) — the load-bearing link.
- **Handlers agency-scoped.** Checkout refuses an already-paid invoice (`:50`); refund on the agency-scoped container; both 502 on Stripe errors. **App never holds funds** (pay-link + verify + refund only).

**Findings:**
- 🟠 **In-process idempotency marks an event processed BEFORE reconcile succeeds → a transient failure can drop a payment.** `handlers-stripe.ts:90` (`processedEventIds.add(event.id)`) runs *before* `reconcileStripeEvent` (`:91`). If reconcile throws (e.g. a storage blip) and Stripe **retries to the same warm process**, `:89` sees the id cached → returns `deduped` (200) → Stripe stops retrying → **the payment is never recorded; the invoice stays unpaid though the customer paid.** The durable `findByExternalRef` would have recovered a retry, but the in-process cache short-circuits before reaching it. **Fix (before live Stripe):** add to `processedEventIds` only *after* reconcile succeeds, or drop the in-process cache and rely solely on the durable `findByExternalRef`.
- 🟡 (test-gap) The **failure-then-retry** path isn't tested — the "idempotent redelivery" test is happy-path (reconcile succeeds, 2nd delivery deduped); it wouldn't catch the drop above. Fits the recurring test-lag pattern. **Fix:** a test where the first reconcile throws and the retry still records the payment.
- 🟡 (tiny, optional) The webhook error text distinguishes "not configured" vs "verification failed", letting someone enumerate which agencies have Stripe configured. Very low impact.

**→ Commander:** Mark **Finance Phase 3 done for TEST mode** — the signature gate is fail-closed + per-agency, reconciliation is correct. **Before enabling LIVE Stripe:** fix the idempotency ordering (`handlers-stripe.ts:90`) so a transient webhook-processing failure can't drop a real payment, and add the failure-retry test. (Also queued: the builder flagged a `finance:refund`/`chargeback` operational alert belongs in `operationalAlerts.ts` — the client-health worker's file — route that.)

## 2026-08-19 — ✅ PASS — Staff Phase 6: internal chat (message/channel access control)

**Verdict:** ✅ PASS. A staff member can't read another pair's DM or post to a channel they're not in, and it's agency-scoped throughout. Two low nits.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Route** (`team-chat/route.ts`): `agencyId = getActiveAgencyId(session)` (from the session, never the body), actor always `session.userId`, role-gated to agency roles (owner/manager/staff).
- **Read gate — sound.** `listPeopleChannels` (`people.ts:938-943`) returns `[team, ...the user's own direct channels]` — accessible channels only. `teamChatSnapshot` (`:1003`) picks `active` via `.find` over *that* list, so passing an `activeChannelId` for a DM you're not in is ignored (falls back to the team channel), and `listPeopleMessages` is only ever called for an accessible channel. **Can't read another pair's DM.**
- **Send gate — sound + tested.** `postPeopleMessage` (`:970-972`) throws unless the channel is in the agency AND `canAccessChannel` (team OR member). Behaviourally tested: a non-member can't post to a direct channel (`smoke-people-workspace.test.ts:262`); anyone posts to team (`:258`).
- **Cross-agency — held.** All reads/sends filter by the session `agencyId`; `userDisplayName` resolves only within the agency (a foreign id → "Team member", no name leak).

**Findings:**
- 🟡 (low) **`ensureDirectChannel` doesn't validate `withUserId` is an agency member** (`people.ts:946-956`; the `open-direct` action guards only `withUserId === self`). A staff member could open a DM against an arbitrary userId → a junk one-sided channel in their agency. **No leak** (agency-scoped reads keep the target from seeing it; the foreign name resolves to "Team member"), so it's cosmetic / data-integrity. **Fix:** validate `withUserId ∈ agency` before creating the channel.
- 🟡 (minor test-gap) The **read gate isn't behaviourally tested** — the send gate is (`:262`), but nothing pins "a non-member's `teamChatSnapshot(…, someoneElsesDmId)` returns the team channel, not the DM's messages." Inspection-verified only; fits the recurring test-lag pattern (code sound, safety-critical path under-tested). **Fix:** add that read-gate assertion.

**→ Commander:** Mark **Staff Phase 6 chat done** — DM read/send access is correctly membership-gated and agency-scoped. Two low-priority cleanups: validate the `open-direct` `withUserId` is an agency member, and add a behavioural read-gate test.

## 2026-08-19 — 🟡 PASS WITH NITS — Finance Phase 2: "money in across everything" (channel aggregation)

**Verdict:** 🟡 PASS WITH NITS. The money-in aggregation is **arithmetically correct** — each payment counted once (no double-count), totals per currency (never summed across), all four channels always shown. The nit: the correctness-critical double-count dedup lives in the React component and has no behavioural test.

**Audited:**
- **Re-ran the FULL suite myself:** **1642 pass · 0 fail · 1 skip** (green).
- **Aggregator correct + tested.** `summariseMoneyInByChannel` (`agency-finance/src/lib/moneyIn.ts:40-61`) counts each record once, keeps `totalsByCurrency` per (channel, currency) — never summing GBP+USD (`smoke-finance-channels.test.ts:67` asserts `other = [["gbp",1000],["usd",4000]]`) — returns all four channels in catalogue order, folds legacy `"manual"`→`"other"` (`:38`). Pure, real-input→output tested.
- **No double-count — the upstream dedup VERIFIED (by inspection).** The three money-in shapes unify in `IncomeSheet.tsx`: `paymentInvoiceIds = new Set(payments.map(p => p.invoiceId))` (`:50`); rows = every payment + paid invoices **`&& !paymentInvoiceIds.has(invoice.id)`** (`:70`) + non-invoice income. So a paid invoice that *has* a payment is counted **once** (via the payment; the invoice is excluded); one settled via `paidVia` with no payment counts once (via the invoice); non-invoice income once. Each pound counted exactly once.
- **Browser-verified** (builder, `:3032`): the by-channel view renders (four channels, per-channel reference labels, filter). *Caveat the builder noted:* the dev tenant has **no income**, so the aggregation + dedup weren't exercised with real data in the browser — only unit-proven (aggregator) / inspection-proven (dedup).

**Findings:**
- 🟡 **The double-count dedup — the most correctness-critical part — has no behavioural test.** The Phase 2 tests feed `summariseMoneyInByChannel` pre-built records; they never exercise the payment-vs-paid-invoice unification (`IncomeSheet.tsx:50,70`), which lives in a React component and wasn't browser-exercised (no dev income). A regression removing the `!paymentInvoiceIds.has(...)` filter would **double-count revenue** with nothing to catch it. **Fix:** extract the three-shapes→`MoneyInRecord[]` gathering into a pure function and test it (paid-invoice-with-payment counts once, without counts once, other-income once).
- (Note, not a defect) `summariseMoneyInByChannel` is pure and doesn't self-scope — money-in is only as agency/client-scoped as the `payments`/`invoices` the finance page feeds it. Consistent with the codebase pattern, but worth confirming the page scopes to the tenant (an unscoped feed would sum across tenants).

**→ Commander:** Mark **Finance Phase 2 done** — money-in is correctly channel-grouped, per-currency, and (by inspection) double-count-free. Before real client money flows: add a behavioural test for the payment-vs-paid-invoice dedup (revenue accuracy is high-impact and currently only inspection-proven), and confirm the finance page scopes its payments/invoices to the tenant.

## 2026-08-19 — 🟡 PASS WITH NITS — Aqua Tag: tag-side consent enforcement (closes the tick-9 pending finding)

**Verdict:** 🟡 PASS WITH NITS. The consent *enforcement* my tick-9 verdict flagged as pending has shipped and is **correct** — the tag holds analytics/marketing tools until consent, injects `necessary` immediately, and injects retroactively on opt-in. Browser-verified. One real nit: the injection-specific gate is source-matched, not the behavioural VM test I asked for.

**Audited:**
- **Re-ran the FULL suite myself:** **1635 pass · 0 fail · 1 skip** (green).
- **Consent gate — logic VERIFIED.** `aquaTagSource.ts` `permitted` (:93-96): `necessary` always; `analytics`/`marketing` only when `preferences.analytics`/`.marketing`. `runInjections` (:155-159) injects a tool **only when `permitted(item.consentCategory)`**, skipping already-injected (`injectedKeys`). With `preferences` null (no consent yet) the `&&` short-circuits false → **analytics/marketing held by default** (GDPR-correct opt-in), `necessary` still fires. `runInjections` re-runs from `applyPreferences` → **retroactive** injection on opt-in.
- **Gate function behaviourally tested (shared path).** `smoke-consent-capture.test.ts` **VM-executes** the real `AQUA_TAG_SOURCE` and proves the same `permitted()` gate for telemetry: consent rejected → analytics/marketing beacons blocked (`:91-95`); analytics granted, marketing not → marketing still blocked (`:97-99`). So the gate function `runInjections` calls is behaviourally proven.
- **Browser-verified** (builder, `:3032`): served `/aqua-tag.js` parses in real V8 (`new Function`), injection + consent-gate + config-fetch present, form-capture intact, no `${` leak; endpoint returns the safe `{injections:[]}` default. Robustness: every tool try/catch-wrapped, fetch `typeof fetch`-guarded — a failing tool can't break the host site.

**Findings:**
- 🟡 **The injection-specific gate is source-matched, not VM-executed** — the behavioural test I asked for in tick 9. `smoke-aqua-tag-injections.test.ts:156` asserts the source *contains* `if (!permitted(item.consentCategory`; it does not seed an analytics injection, run the tag without consent, assert it's NOT injected, then grant consent and assert it IS. Confidence stays high (the shared `permitted()` is VM-tested via telemetry + the tag is browser-verified), but the dedicated test would fully close it. **Fix:** VM-execute — analytics tool held without consent → injected after `applyPreferences`.
- 🟡 (tiny, optional) `runInjections` defaults a missing `consentCategory` to `"necessary"` (`:159` — `item.consentCategory || "necessary"`), i.e. **fail-open** (inject immediately) rather than fail-closed (hold). The store always sets a category so it's effectively dead-defensive, but holding an unknown category would be safer.
- (Not a defect) The **workspace UI** to populate a site's injections is still builder-flagged as pending, so end-to-end "GA4 loads on a real page" isn't reachable yet.

**→ Commander:** The **consent-gating enforcement is done and correct** — resolves the "enforcement pending" nit from the tick-9 Aqua Tag verdict; the tag genuinely holds analytics/marketing until consent (GDPR opt-in default), browser-verified. Before ticking the old "form-capture not consent-gated" issue fully closed: add the one behavioural injection test (held-without / injected-after) so the gate is regression-proof, and land the config UI for true end-to-end.

## 2026-08-19 — ✅ PASS — Staff & Team Phase 9: training modules (answer-key protection + grading integrity)

**Verdict:** ✅ PASS. Staff can't cheat and can't complete someone else's module — the quiz answer key is stripped from the staff-facing view, grading is server-side, and completion is bound to the assignee. Behaviourally tested.

**Audited:**
- **Re-ran the FULL suite myself:** **1629 pass · 1 fail · 1 skip.** The one fail — `smoke-consent-capture` "Aqua Tag sends only consented telemetry" — is **`fetch is not defined`** (`:58`), a **test-isolation race** (a concurrent test nulled `globalThis.fetch`), **not** an Aqua Tag consent regression (tick-9 PASS holds). This is a concrete second root cause for the standing red-suite finding — global-state races, not just source-shape churn.
- **Answer-key stripped — VERIFIED.** `sanitizeModuleForStaff` (`people.ts:1405-1413`) returns each quiz option as `{id, text}` only — the `correct` flag is dropped — and `employeePeopleSnapshot` serves staff the sanitized modules (`:1424`). Test: `!JSON.stringify(staffView.quiz).includes("correct")` (`smoke-people-workspace.test.ts:232`). The staff client never receives which option is right.
- **Grading server-side — VERIFIED.** `gradeTrainingQuiz` (`:597-608`) matches answers against the correct option **on the server**; the key never leaves it. Pure + tested.
- **Only-assignee + agency-scoped — VERIFIED.** `completeModuleAssignment` (`:614-618`) returns `null` unless the assignment is in the actor's agency AND `getPeopleEmployee(...).userId === input.userId`. Test: a stranger gets `null` (`:247`); fail → in-progress, pass → completed (`:240-243`).

**Findings:** none for Phase 9. (Standing: the red-suite flakiness now confirmed to include global-`fetch`/`env` isolation races — this tick's `fetch is not defined` — on top of the source-shape churn; fix is hermetic tests / injected fetch.)

**→ Commander:** Mark **Staff Phase 9 done** — answer-key server-only, grading server-authoritative, completion bound to the assignee. Staff plan is now audited across its security contracts (role/scope in the Phases-1–10 verdict; answer-key here).

## 2026-08-19 — 📋 Calibration — Dev Mode browser review (Commander, 4 fixes) vs my tick-5 static PASS

The Commander browser-verified Dev Mode on `:3032` and fixed 4 issues. Checked against my tick-5 static PASS — **none are security holes**, so the PASS stands; browser verification added a runtime layer, as its caveat anticipated:
- 🔴 `DevModeLoadIn` Strict-Mode overlay click-trap — in the **Phase 3** cinematic load-in, which shipped *after* my tick-5 audit of the route/gate (outside the scope I verified). A React-19 Strict-Mode double-invoke timing bug — the runtime class static reading is weakest at.
- 🟠 demo-staff dead-end (missing `PeopleEmployee`) · ➕ exit→/login (a `/dev` founder's `isDemo` session dropped on exit) — runtime/auth-plumbing integration bugs; a deep static trace *might* have reached them, but they surface naturally on a click-through.
- 🟡 caption — not a real bug (looked stuck only because of the trap).

The gate / fencing / authority I actually audited in tick 5 held (Phase 4 later *proved* the fencing throws at the scope layer). **Takeaway:** static + browser passes are complementary — my security contract verification is sound, and browser verification is where runtime UX/auth bugs surface. Reinforces that browser-level verification (blocked for me by the `:3032` lock) is worth unblocking via per-session isolation.

## 2026-08-19 — ✅ PASS — Aqua Tag Phase 4: consent-aware tag manager (config store + public endpoint)

**Verdict:** ✅ PASS. The security-critical parts are solid and behaviourally tested — the injected value can't become script (anchored allow-list patterns, no raw-snippet path), the public endpoint leaks nothing, and everything is agency-scoped. Honest scope: this is the **config + delivery** half; the actual consent *enforcement* (tag-side) is a later slice, not yet shipped.

**Audited:**
- **Re-ran the FULL suite myself:** **1622 pass · 0 fail · 1 skip** — green this run. (Caveat: the suite is **flaky run-to-run** per the builders' own notes — isolation races + source-shape churn; see my standing cross-cutting finding. A single green run isn't proof of stability.)
- **XSS guard — VERIFIED (the critical one).** The value becomes markup on the client's live site, so it *is* the XSS surface. Every `valuePattern` (`websiteInjections.ts:39-47`) is **anchored** (`^…$`) and admits only `[A-Za-z0-9_-]` + fixed prefixes — no `<`, `>`, `"`, `'`, `/`, spaces. With a strict **allow-list** (no raw `<script>` path; unknown provider → error, :82) and pattern-check **before** mutate (:84), a crafted value can never reach the markup. Behaviourally tested: `addInjection(ga4, "G-1\"><script>…")` **throws** (`smoke-aqua-tag-injections.test.ts:48`), as do malformed ids (:49-50) and unknown providers (:43).
- **Public endpoint — no leak, correctly scoped.** `aqua-tag-config/route.ts` returns **only** `{kind, value, consentCategory}` (:38-42) — no internal id/label/owner/agency; resolves the **master key → agency** and filters to that agency's host, so agency A's key can't read agency B's sites; unknown key/host → `[]` (safe default). Served values are public provider ids that already ship in the page HTML — nothing secret. CORS-open + cached is appropriate for a public config fetch.
- **Agency-scope — VERIFIED + tested.** All CRUD gates on `getWebsiteSource(agencyId, …)`; the test proves a foreign agency can't add to another's site (`:66` → "not found"). Dedupe, per-site cap (25), consent default-vs-override, disabled-withheld all covered.

**Findings:**
- 🟡 **Consent *enforcement* is not yet live — config-complete, gating pending.** The injections carry a `consentCategory` and the endpoint serves it, but the piece that actually **holds** an analytics/marketing tag until consent is granted is the tag-side injection in `lib/aquaTagSource.ts` — the **next slice, not shipped** (honestly flagged by the builder). So the known "Aqua Tag form-capture not consent-gated" gap (issues.md) is **not fully closed** until that lands. **→ Commander:** don't mark the consent-gating issue resolved until the tag-side gating ships (with a behavioural test that a tag stays out until consent).

**→ Commander:** Mark **Aqua Tag Phase 4 (config + delivery) done** — the allow-list XSS guard is strong and behaviourally tested, the public endpoint is scoped + leak-free, agency-scoping holds. The remaining slice (tag-side consent enforcement) is where the actual gating lives — audit that when it ships.

## 2026-08-19 — ✅ PASS — Staff & Team (Phases 1–10): role + agency-scope on every server mutation

**Verdict:** ✅ PASS. The CLAUDE.md non-negotiable — *"respect role and agency scope on every server mutation"* — holds across the People API and its server functions. Scope: I audited the authorization contract (route dispatch + a representative sample of `people.ts` mutations), not each of the ~25 actions individually. (Separately: the full suite is red again from unrelated parallel-worker refactors — recurring cross-cutting finding.)

**Audited:**
- **Re-ran the FULL suite myself:** **1615 pass · 2 fail · 1 skip.** Both failures are **non-Staff** (`smoke-finance-operations` #307, `smoke-nav-audit` #412) — see the finding. Staff's own tests pass.
- **Route dispatch — sound** (`api/portal/people/route.ts`): `agencyId` is always taken from the **session** (`getActiveAgencyId`, :91), **never** the request body — so a caller cannot act on another agency. Staff (`agency-staff`) get a limited self-action set, each **station-gated** (`canUsePeopleStation`, e.g. :101) and scoped to `session.userId`, and fall through to **403** for anything else (:157). Manager actions are re-gated by a second `requireRole([...MANAGERS])` (:160).
- **Functions scope the target entity to the agency — verified across a sample.** `getPeopleEmployee` is agency-scoped (`:279` — `employee?.agencyId === agencyId ? … : null`), and the mutations that take a raw `employeeId` all guard on it: `savePeopleShift`, `savePeopleTraining`, `awardPeopleRecognition` (`:637`), `savePeopleFreelancerJob` (`:542` + an existing-job agency check `:547`) each `throw` if the employee isn't in the actor's agency — so a manager can't award/schedule/hire against a **foreign** employee id.
- **Phase-10 "only the owning employee may sign" — verified.** `acknowledgePeopleContract` checks the contract is in the actor's agency **and** `getPeopleEmployee(agencyId, contract.employeeId).userId === session.userId` — a colleague (or another agency) gets `null` → 404 ("not yours to sign").

**Findings:**
- 🟠 **Cross-cutting (recurring — 3rd sweep): the full suite is red again, and nobody owns it.** 2 fails this run, both **brittle source-shape tests** broken by parallel refactors: `smoke-finance-operations` expects `/Operations/` in a Finance component that was refactored to pull `FINANCE_SECTIONS` from a new `../lib/sections` module; `smoke-nav-audit` is a nav-structure assertion. This is the **third sweep** (also tick 5's `smoke-lead-wait-tracing`, tick 5's inbox churn) where the suite is red from unrelated workers' refactors breaking source-shape tests, and everyone ships anyway. The "green baseline" the whole audit trust model leans on is **chronically unstable**. **→ Commander:** assign an owner to keep the suite green as refactors land, and consider migrating the brittle source-string tests to behavioural/structured assertions so a component refactor stops turning the suite red.

**→ Commander:** Mark the **Staff role/agency-scope contract verified** — every server mutation takes its agency from the session and scopes its target entity, staff are confined to station-gated self-actions, and contract sign-off is bound to the owning employee. (Scope: the auth contract + a representative sample of mutations, not all ~25 individually — but the pattern is consistent.) Please act on the recurring red-suite finding — it now spans three sweeps.

## 2026-08-19 — ✅ PASS — Meta social inbox Phases 1–3: credential secret-handling

**Verdict:** ✅ PASS. Secret hygiene is genuinely solid — AES-256-GCM at rest, production requires a real vault key, secrets never reach persisted state or the browser, stored-then-env resolution — verified by a strong behavioural test. The webhook fails **closed**. The builder's own flagged deferral (webhook uses env, not stored) is confirmed + characterized; three minor nits.

**Audited:**
- **Re-ran the FULL suite myself:** **1600 pass · 0 fail · 1 skip** (green).
- Read the store (`integrationConnections.ts`), its test (`smoke-integration-connections.test.ts`), and the webhook route (`webhooks/meta/route.ts`).
- **Encrypted at rest — VERIFIED.** `encryptSecret` (`integrationConnections.ts:392-397`): AES-256-GCM, per-secret random IV + auth tag; `vaultKey()` **throws `vault_not_configured` in production without `PORTAL_VAULT_ENCRYPTION_KEY`** (:384-386). Secret fields → `encryptedSecrets` (encrypted); non-secrets → `config` (plaintext) (:75-83).
- **Never to the browser — VERIFIED.** `publicIntegrationConnection` exposes only `configuredSecretFields` (the *names*, sorted), never values or ciphertext (:234-250); decryption (`privateValues`) is server-only. The test asserts `"encryptedSecrets" in saved === false` and that **neither `storage.getState()` nor the returned record contains the plaintext secret** (`smoke-integration-connections.test.ts:129-130,212-213`).
- **Stored-then-env + blank-preserves-secret — VERIFIED** behaviourally (:155-167, :235-240). Test-without-leak (:260) and store-driven readiness (:277-291) verified. The test drives the real store + injected `fetch` end-to-end — a strong contrast to the erasure scratch harnesses.
- **Webhook fails CLOSED — VERIFIED.** `webhooks/meta/route.ts`: GET returns **503** when the verify token is unset (:15), 403 on mismatch (:16-18); POST returns **503** when the app secret is unset (:24) and **401** on an invalid `x-hub-signature-256` (:26). Never accepts an unsigned/unverified webhook — no fail-open.

**Findings:**
- 🟡 **Confirmed the flagged deferral — self-serve is incomplete for *inbound*.** The webhook reads `META_WEBHOOK_VERIFY_TOKEN` (:14) + `META_APP_SECRET` (:23) from **env**, not the stored connection — so an agency that configures Meta only via the in-app form (Phases 1-3) **won't receive Meta messages** until the `META_*` env vars are also set (the webhook 503s). No security hole (fails closed). The fix is non-trivial: the webhook is a **single global endpoint** while stored Meta connections are **per-agency** (each its own app secret), so it must resolve the right agency's secret per event. **Fix:** per-agency stored-secret resolution in the webhook, or document that Meta needs env config until then. (Builder flagged this honestly — awaiting Ed's call.)
- 🟡 (minor) GET verify-token compare is a plain `!==` (`route.ts:16`), not constant-time. Low risk for a handshake token; `crypto.timingSafeEqual` would match the connect-code verify pattern. Optional.
- 🟡 (minor) `safeTestMessage` (`integrationConnections.ts:421`) redacts only `sk_/re_/whsec_/github_pat_` prefixes from stored/returned error messages — not Meta app secrets (hex) or Twilio tokens. Low probability + truncated to 300 chars, but incomplete. Optional.

**→ Commander:** Mark **Meta Phases 1–3 done** — credential secret-handling is solid, behaviourally tested, and the webhook fails closed. One item to track before launch: inbound webhooks still need `META_*` **env** config (self-serve drives outbound, not inbound), non-trivial to close because the webhook is global while stored connections are per-agency — the Ed decision the builder already flagged.

## 2026-08-19 — ✅ PASS — Radar upgrade: the health / confidence / readiness contract (spot-audit)

**Verdict:** ✅ PASS. The CLAUDE.md non-negotiable — *"distinguish health, evidence confidence, and setup/readiness; missing evidence is a visible blind spot, never a healthy pass"* — holds in **both the implementation and a real behavioural test**. Scope: I verified the core contract + classification + infra behaviour, **not** all 7 stages / 2,040 rules individually (the builder browser-verified the UI panels earlier; the seed queue said spot-check).

**Audited:**
- **Re-ran the FULL suite myself:** **1574 pass · 0 fail · 1 skip** — green; the tick-5 red-suite failure (`smoke-lead-wait-tracing`) has **cleared** (the `websiteSources` restructure settled).
- **Contract holds in code** (`businessIssueRadar.ts:505-532`): `RadarCheckStatus` distinguishes `pass | critical | warning | blind | learning | inactive` (`businessRadar.ts:26`); **`assuredChecks = passedChecks + firingChecks` only** (:511) — blind/learning/inactive are excluded from "assured," so a check with no evidence can **never** count as a healthy pass; `assurancePercent` divides assured by *applicable* (:532), so a blind spot drags assurance **down**, never inflates it. Domains with `blindChecks > 0` raise a visible *"N checks cannot prove health"* incident (:468-475).
- **Contract is behaviourally tested** (`smoke-radar-golden-sweep.test.ts`) — runs the **real** `buildBusinessIssueRadar` end-to-end on a fresh fixture and asserts: every check partitions into exactly one status bucket; **`assured === passed + firing`** ("a blind check is never counted as assured — the core blind-spot contract", :57); an uninstrumented agency **must** surface `blindChecks > 0` + the `coverage:business-blind-spots` incident ("never a false pass", :72-82); an un-probed infra check is `status:"learning"`, never a fake pass (:47); deterministic across builds. A genuine behavioural golden test, not source-shape.
- **Classification (Stage 2)** (`radarClassification.ts`): `tier` (instant/probe/rollup → which sweep) + `dataDependency` (in-state/derived/external, so *"why is this blind?"* is answerable) — additive over the 2,040-rule catalogue, clean.

**Findings:**
- 🟡 **(minor) Finding-group bucketing is regex-on-id** (`radarClassification.ts:100-134`) — `INFRASTRUCTURE_ID`/`RELIABILITY_ID`/etc. match substrings of a finding's id, first-match-wins. A future check whose id merely *contains* e.g. `integration`/`storage` would be forced into Infrastructure even in a commercial context. It's a **display grouping** (the FindingGroupBar), not the blind-spot contract, and the domain default backstops it — low impact. **Fix (optional):** classify off a structured field rather than an id regex if the buckets ever drive more than display.

**→ Commander:** Mark the **Radar core contract verified** — health/confidence/readiness is distinguished and missing-evidence-is-a-blind-spot holds in code **and** a real behavioural test. (Scope: core contract + classification + infra behaviour spot-checked; per-stage UI panels were browser-verified by the builder earlier, not re-driven here.) Optional next: the Stage-7 "suggested work needs human acceptance" contract is a separate non-negotiable worth its own spot-check.

## 2026-08-19 — ✅ PASS — Dev Mode Phase 1 + 2: demo-persona POV switcher (mint route + gate)

**Verdict:** ✅ PASS. A new **session-minting** feature done *right* — a strong four-guard availability gate, sound fencing, and genuinely behavioural + durable tests. One minor nit. (Separately surfaced: the full suite is currently **red** from an unrelated parallel-worker edit — flagged below; not Dev Mode's fault.)

**Audited:**
- **Re-ran the FULL suite myself:** **1562 tests · 1560 pass · 1 fail · 1 skip.** The one failure is `smoke-lead-wait-tracing` (a leads/inbox **source-shape** test), **not Dev Mode** (cross-cutting finding below). Dev Mode's own 16 tests pass.
- Read the mint route (`api/auth/dev-mode/route.ts`), the gate (`devModeAccess.ts` → `devMode.ts`), and the test (`smoke-dev-mode.test.ts`).
- **#1 security contract — VERIFIED.** `canUseDevMode()` → `isDevModeEnabled()` requires **all four**: `PORTAL_DEV_MODE==="true"` · `NODE_ENV!=="production"` · no `VERCEL_ENV` · **file/memory backend** (`devMode.ts:55-73`). Guard 4 is defense-in-depth — even with the env flags wrong it can't reach a durable backend, so it "physically cannot mint against real data." The route checks it **first** → 404 before touching session/state (`route.ts:114-120`); in production guards 2/3/4 all fail. Behaviourally tested: refuse → 404, **no cookie minted** (`smoke-dev-mode.test.ts:98-111`).
- **Authority + fencing — VERIFIED.** `enter` is founder-only (`agency-owner` + `isFounder`, `route.ts:187-189`); `switch`/`exit` require an active demo session — the HMAC-signed `devReturnAgencyId` capability, unforgeable (correct: the demo *client* isn't a founder, so an `isFounder` gate would trap you). Every mint is fenced to the demo agency (`agencyIds:[demoAgencyId]`, `route.ts:91-104`), so a demo session can't reach a real tenant. Same-origin enforced. All behaviourally tested (fences on enter, restores on exit, foreign origin 403, non-founder 403, persona hops, client-can-still-exit).
- **Tests real (B):** `smoke-dev-mode.test.ts` drives the **real handler in-process** (`issueSession` + `NextRequest`) — 16 durable behavioural tests, a marked contrast to the erasure scratch harnesses. UI wiring is source-shape (fine). Reuse: `issueSession`/`effectiveRole`/`demoSeed`/Showcase pattern — no third copy.

**Findings:**
- 🟠 **Cross-cutting (NOT Dev Mode): the full suite is red right now.** My run: **1 fail — `smoke-lead-wait-tracing` › "wires the timing ledger into Journey, Inbox…"** — a **source-shape** test that reads an agency settings/inbox component expecting `/Elapsed since enquiry/`, but the component was restructured by a parallel worker (now imports `IntegrationConnectionsPanel` + `WebsiteSourcesConfig` — the Meta/websiteSources work). The Dev Mode P2 builder separately reported **6** failures (inbox/enquiry domain); the count shifts as workers edit shared components. **Multiple builders are shipping against a red suite, each attributing it elsewhere** — so the "green suite" baseline the audit trust model relies on is currently unreliable. **→ Someone must OWN this:** confirm whether the leads-timing wiring actually regressed or the test is merely stale against the inbox/settings restructure, then fix it. (And brittle source-shape tests coupled to shared components will keep breaking on every unrelated refactor.)
- 🟡 **`exit` restores "an" owner, not necessarily the enterer.** `route.ts:151` recovers the founder as `listUsersForAgency(returnAgency.id).find(u => u.role === "agency-owner")` — the first owner. The demo session doesn't retain the real userId, so in a multi-owner agency `exit` could land you as a different (equally-privileged) owner of the agency you entered from. Not a security issue; harmless for the single-owner norm. **Fix (optional):** stash the real userId alongside `devReturnAgencyId` at `enter` and restore exactly.

**→ Commander:** Mark **Dev Mode Phase 1 + 2 done** — prod gate solid, fencing sound, tests real + behavioural. Two non-blocking items: (1) 🟠 the **full suite is red** from a parallel worker's edit — assign an owner to resolve `smoke-lead-wait-tracing` (real regression vs stale test) so "green" means something again; (2) 🟡 optional: make `exit` restore the exact entering owner.

## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 3–5: live scrub + per-disposition test ("plan COMPLETE")

**Verdict:** 🔴 REWORK — but *one narrow hole from a genuine PASS*. Excellent, responsive work: the retain-PII 🔴 (Phase 2) is fixed and the sweep finally has a real test. But the claim "plan COMPLETE / GDPR gap closed" is premature — the leads-pipeline contact's **email still survives in the activity log** (the Phase 2b 🔴, unaddressed), and the new test doesn't check for it.

**Audited:**
- **Re-ran the FULL suite myself:** **1535 pass · 0 fail · 1 skip** (green).
- Read the new per-disposition test (`smoke-client-erasure.test.ts:143-252`), the three module manifests, the leads-pipeline hook, `ContactService`, and `clientErasure.ts`'s activity handling.
- **Verified FIXED (credit):** ecommerce now has a real `onEraseClient` that **strips `customerEmail`, keeps `paymentIntentId`** (test :200-203); affiliates likewise (`affiliates/index.ts:221`); memberships is now a deliberate `retain` (legal-defence record, comment corrected — no more phantom hook). The leads email-in-**key** is erased (test :206). The live scrub (inbox delete + no-PII stub; `brand_enquiries` anonymise split by identity resolution) is covered by a **faithful fake Supabase** test (:174-235), and the builder is honest it's "not a live run — needs a staged run + DPO sign-off." **The "no durable test" 🟠 is resolved** — this is a genuine behavioural regression test.

**Findings:**
- 🔴 **The leads-pipeline contact's EMAIL still survives erasure, in the activity log** (unchanged from the Phase 2b verdict). The hook (`leads-pipeline/index.ts:138-151`) calls `ContactService.delete`, which logs `Archived contact ${existing.email}` (`contacts.ts:272`) with **no `clientId`**; `clientErasure.ts` sweeps `state.activity` only by `clientId` and adds **no content-based PII scrub**. So after an erase, `state.activity` still contains the email. The new test **seeds this exact contact** (`lead@x.com`, test :167), asserts the storage **key** is gone (:206) — but makes **no assertion the email is absent from the log**, so it passes while the PII survives. This is why "GDPR gap closed" is not yet true. **Fix:** don't re-log PII during erasure — a silent/PII-free delete path on `ContactService` for the erase hook (or stamp contact-activity with `clientId` so the sweep reaches it) — then add a test assertion: after erase, **no activity entry contains the erased email**.
- 🟡 **Doc overclaim.** The updates entry + plan say "plan COMPLETE / launch-blocker gap closed." One PII leak remains, so it isn't. **Fix:** downgrade to "built, one PII-log gap open" until the above lands.

**→ Commander:** Huge progress — erasure is ~one fix from done. **Route the single remaining item to the erasure builder** (email-in-activity-log + a test assertion). Do **not** mark the launch blocker complete until an erase leaves **zero** trace of the contact's email, the activity log included. The Phase 2 retain-PII 🔴 is **resolved**; the Phase 2b activity-log 🔴 **remains**.

## 2026-08-19 — ✅ PASS — Connect flow Phase 3: lockout + rate-limits

**Verdict:** ✅ PASS. The per-code lockout is correct and behaviourally tested, the rate-limits are wired on both endpoints, and this **closes the missing-lockout nit** from the Connect Phase 1 audit.

**Audited:**
- **Re-ran the FULL suite myself:** **1535 pass / 0 fail / 1 skip** (green).
- **Lockout (verified correct):** `MAX_CODE_ATTEMPTS = 5` (`connectionConfirmation.ts:63`); the `locked` branch (`:190-195`) sits **after** the dev bypass but **before** the hash compare — so once `attempts >= 5` even the correct code returns `locked` (defeats guess-to-limit-then-try-real), while dev `00000` stays usable (`:177`). A resend mints a fresh code with `attempts: 0`, so a lock is never permanent.
- **Rate-limits (wired):** accept caps verify at **20 / 15 min per ip+user** (`accept/route.ts:18,42-51`) and counts a guess **only** on `wrong-code` (`:74-78` — never on locked/throttled); request-code caps sends at **5 / 15 min per connection** (`request-code/route.ts:15,41-48`); both 429 with `retryAfterSec`.
- **Durable tests (not a scratch harness):** `smoke-portal-connections.test.ts` behaviourally tests the lockout (:495-497 locks after MAX incl. correct-code-refused; :500-502 dev bypass through when locked) and pins "never count a locked/throttled guess" (:848) + `rateLimit(` wiring on both routes (:830,:844).

**Findings:**
- 🟡 The 429 **throttle** behaviour is source-matched in the durable suite (the behavioural 5-sends→429 run was the builder's in-process harness); the security-critical **per-code lockout** is behaviourally covered, so this is minor. End-to-end browser click-through still pending (shared `:3032`).
- 🟡 (carry-over) **Connect Phase 2 is still unlogged** — the `request-code` endpoint that Phase 3 rate-limits has no `updates.md` entry. Log it for the record.

**→ Commander:** Mark **Connect Phase 3 done** — lockout correct, rate-limits wired, durable tests; clears the lockout follow-up from the Phase 1 audit. Still owed: an `updates.md` entry for the (shipped, load-bearing) Phase 2 request-code endpoint.

## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 2b: leads-pipeline `onEraseClient` (key-PII)

**Verdict:** 🔴 REWORK. The claimed mechanism is real and verified — but erasing a leads-pipeline client **leaves the contact's email in the activity log**, so the feature still fails "no identifying PII remains."

**Audited:**
- **Re-ran the FULL suite myself:** **1521 tests · 1520 pass · 0 fail · 1 skip** (green).
- Read the hook (`built-ins/modules/leads-pipeline/index.ts:138-151`), `ContactService` (`.../src/server/contacts.ts`), the activity wiring (`foundationAdapter.ts` → `leadsPipelineFoundation.ts` → `_foundationPorts.ts`), and `logActivity` (`src/server/activity.ts`).
- **Claim A — TRUE (verified):** `ContactService.delete` (`contacts.ts:260-277`) removes the row (`contact:<id>`, :263), **the `contacts/email/<email>` pointer key (:264)** — the key-name email Phase 2b exists to kill — and the index entry (:266); idempotent (:262). The hook filters by `clientId` correctly (`index.ts:147`). So the specific claim shipped and works.

**Findings:**
- 🔴 **The erased contact's EMAIL survives in the app-wide activity log.** Every `leads.contact.*` write names the email in its message — `Added … ${contact.email}` (`contacts.ts:161`), `Promoted lead ${lead.email}` (:220), `Archived contact ${existing.email}` (:272) — and **none pass a `clientId`**. `logActivity` stores `clientId: input.clientId` verbatim (`activity.ts:31`) → these entries are `clientId: undefined`. The erasure sweep only drops activity where `entry.clientId === clientId` (`clientErasure.ts:315-316`), and `onEraseClient` deletes only the row/pointer/index — so the email-bearing log entries **survive erasure**. The hook kills the email in the storage key but leaves it in the log. **Fix:** during erasure, delete contacts without re-logging PII (a silent / PII-free delete path), or stamp contact-activity with `clientId` at write time so the sweep reaches it (and purge the pre-existing ones). *(Mitigation: pre-launch test data; it's the email in internal log messages, not the whole record — but it is identifying PII surviving a right-to-be-forgotten erasure. Also check `appendActivityToClientRecordLedger` as a second sink.)*
- 🟠 **No durable test for the hook — same gap as Phase 2.** `onEraseClient` appears in **0** test files and `contacts/email` in **0**; the leads-pipeline module smoke never touches erase. The "10/10 runtime-verified" was a scratch harness, not in the repo — which is exactly why the activity-log leak went unseen. **Fix:** a behavioural test that seeds a client's contacts, erases, and asserts **zero trace of the email anywhere** — row, pointer key, index, **and the activity log**.

**→ Commander:** **Route to the erasure builder** (same owner as the Phase 2 🔴). The deletion mechanism is sound and verified; the gap is PII completeness — the email survives in the activity log and no test would catch it. Don't mark erasure done until a test proves the email is gone from *every* surface, the log included.

## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 2: the runtime sweep

**Verdict:** 🔴 REWORK. The sweep *code* is well-structured, but as the tree stands the erasure **fails its own done-criteria** — customer PII in three plugins survives a right-to-be-forgotten erasure — and the entire plugin-sweep path has **no durable test**. Phase 2's own claim ("ecommerce/affiliates/memberships … whole slice dropped wholesale") is now contradicted by the tree.

**Audited:**
- **Re-ran the FULL suite myself:** **1518 tests · 1517 pass · 0 fail · 1 skip** (green; grew +10 since tick 1 — a builder is live in parallel).
- Read the sweep (`src/server/clientErasure.ts`, untracked/new), the disposition types (`_types.ts`), all four module manifests, and the erasure test.
- **Ran it: partial.** The defect is proven by code-inspection with exact file:line (below); I did not build a plugin-runtime repro this tick (read-only on repo tests; the harness is non-trivial). The fix must ship the missing runtime test.

**Findings:**
- 🔴 **ecommerce / affiliates / memberships retain full client PII on erasure.** Each sets `dataDisposition: "retain"` (`built-ins/modules/ecommerce/index.ts:108`, `affiliates/index.ts:39`, `memberships/index.ts:45`) under a comment claiming "a bespoke `onEraseClient` (below) … strips PII, keeps the de-identified record" — **but no such hook exists** (grep: only `leads-pipeline` implements `onEraseClient`). Per `clientErasure.ts:191-192` + `:222-226`, `retain` **excludes the slice from the sweep**, so the data survives *untouched* — including PII (ecommerce is `scopePolicy:"client"` and stores Orders + **Customers**). Fails the plan's "Done when: no identifying PII remains for that clientId in pluginData" and contradicts Phase 2's "dropped wholesale" claim. **Fix:** implement the promised `onEraseClient` on each (strip PII, keep the de-identified record — the anonymise disposition the plan intends); or, if wholesale legal-hold retention is genuinely intended, say so (DPO sign-off) and delete the false "strips PII" comment. *(Mitigation: all data is Ed's test data pre-launch — fix-before-launch, not a live breach.)*
- 🟠 **The plugin-data sweep has no durable test — this is why the 🔴 slipped through.** `smoke-client-erasure.test.ts` seeds only a connection + an activity entry (`pluginData` refs: **0**); it never installs a plugin or seeds a slice, so `sweepPluginData` / `resolveDispositionsAndRunHooks` / the hook·retain·delete paths / `pruneClientId` are **entirely uncovered**. Phase 2's "11/11" and Phase 2b's "10/10" were **scratch harnesses** (the updates say so) — throwaway, not repeatable. **Fix:** seed `pluginData` for a delete-plugin, a retain-plugin, and a hook-plugin, then assert the disposition each got — deleted / **PII-stripped** / retained — not "zero rows."
- 🟠 **Unlogged work drove the regression.** The `dataDisposition:"retain"` flags on the three modules appear in **no updates.md entry** (Phase 2b logged only leads-pipeline), so the change that flipped them from "deleted" to "retained-with-PII" is invisible to this queue — same pattern as Connect Phase 2 last sweep. **Fix:** log the disposition-policy wiring so it's auditable.

**→ Commander:** **Route to the erasure builder.** Fix = the missing `onEraseClient` hooks (or an honest disposition + comment) **plus** a durable plugin-sweep test. Do **not** mark the erasure launch blocker done until PII-strip is proven by a repeatable test. Also log the module `dataDisposition` changes in updates.md.

## 2026-08-19 — ✅ PASS — Plugin-data erasure Phase 1: `onEraseClient` hook contract

**Verdict:** ✅ PASS. The additive hook contract is exactly as claimed — clean, optional, correctly shaped.

**Audited:** `built-ins/runtime/_types.ts:528` — `onEraseClient?: (ctx: PluginCtx, clientId: string) => Promise<void>`. Optional (absent → no runtime change), `clientId` passed **explicitly** (not via `ctx.clientId` — correct for agency-scoped installs holding many clients' data), idempotency contract documented (`:517-527`). Additive only; the claim's "nothing implements it yet, nothing changes at runtime" held at ship time. Full suite green.

**Findings:** none for Phase 1. The defects are in how the *consumers* wired disposition — see the Phase 2 REWORK above.

**→ Commander:** Mark **Erasure Phase 1 done** — the hook seam is sound; the launch-blocker risk is in Phase 2, not the contract.

## 2026-08-19 — 🟡 PASS WITH NITS — Connect flow Phase 1: real code — generate + store + verify

**Verdict:** 🟡 PASS WITH NITS. Phase 1's claim (mint + hash-at-rest + verify, `00000` behind the dev gate) is **verified** — source matches, security-critical logic is behaviourally tested and green, no contract broken. The findings are doc/queue drift, not Phase 1 defects.

**Audited:**
- **Re-ran the FULL suite myself** (memory backend, `scripts/*.test.ts`): **1508 tests · 1507 pass · 0 fail · 1 skip.** (The update claimed 1497 — stale; more work has landed since. Still green, no flake this run.)
- Read the shipped source (all **untracked/new** files): `src/lib/server/connectionConfirmation.ts`, `accept/route.ts`, and the tests. Matches the claim exactly: `crypto.randomInt` uniform 6-digit code · HMAC-SHA256 bound to `connect-code:{connectionId}:{userId}:{code}` · 15-min TTL · `crypto.timingSafeEqual` constant-time compare (length-guarded) · single-use clear on accept · `expired` distinct from `wrong-code` · `00000` honoured **only** when `bypassEnabled` (the real stored path still runs in dev).
- **Tests are real (checklist B).** The security logic is exercised behaviourally against the real store — issue → hash-only-at-rest → verify → user-binding → connection-binding → expiry → single-use clear → resend-replaces → attempt-count (`smoke-portal-connections.test.ts:402-597`). The "stale smoke-mfa contract test" was **re-pointed, not weakened**: it pins the same "nothing bound unproven" contract on the new emailed-code gate (`smoke-mfa.test.ts:62-127`); the old `unavailable` status still exists in the type. No test gamed, skipped, or deleted.
- **Contracts held (C/E).** Accept route re-checks rules against stored state *before* binding, binds to `session.userId`, refuses wrong-client (tested), single-use enforced. Shared-file touches (`PortalConnection.pendingCode` + two store fns) were flagged in the update and are strictly additive. No junk to live Supabase (memory backend). **No git commits — HEAD still `b46d8ae`; every connect-flow file is untracked working-tree work.**
- **Ran in app: NO (end-to-end).** The `/connect/[id]` flow needs a seeded connection + signed-in client session to reach; deferred this tick. Matches the builder's own "not runtime-verified end-to-end" caveat. The behavioural suite already runs the security-critical paths, so Phase 1's *logic* is verified even without the browser walk.

**Findings:**
- 🟠 **Phase 2 is shipped but unlogged — it escapes this audit queue.** `src/app/api/portal/connections/request-code/route.ts` (untracked) is a real, wired endpoint that mints a code and emails it (`issuePortalConnectionCode` → `connectionCodeEmail` → `sendTransactionalEmail`, `to: session.email`, dev-gated), and `_ConnectFlow.tsx` (untracked) wires the request/resend/`sentTo` UI — both covered by passing tests. But `plans/connect-flow-real-codes.md:20` marks Phase 2 `⬜ next` and there is **no Phase 2 entry in `updates.md`**. A live code-emailing endpoint is therefore invisible to the docs-driven queue and will never be audited. **Fix:** add a Phase 2 entry to `updates.md` + tick the plan's Phase 2 box (or, if deliberately mid-build, mark the route/UI as in-progress and not wired) so it enters the queue for its own audit.
- 🟡 **The live (unlogged) endpoint has no verify-attempt lockout yet** (Phase 3 `⬜`). `accept/route.ts:55-57` counts wrong guesses but nothing enforces a cap, so the verify path currently accepts unlimited attempts on a 6-digit code. **Largely self-mitigating:** the code is HMAC-bound to `userId`, so a caller can only ever brute-force a code issued for their *own* (userId, connectionId) — which they could simply email themselves; a colleague's guesses hash with the wrong userId and never match. Low severity, but close before launch. **Fix:** enforce a max-attempts cap in the accept route (Phase 3).
- 🟡 **Stale suite count** in the Phase 1 update (says 1497). Current green baseline is **1507 pass / 0 fail / 1 skip**. Expected drift as later work landed — noting for the record.

**→ Commander:** Mark **Connect-flow Phase 1 done** (claim verified, contracts held, tests real + green, dev gate sound). THEN log the already-shipped **Phase 2** (request-code email endpoint + resend UI) in `updates.md` + tick the plan, so it enters the queue for its own audit — it is live and unaudited today, and ships without the Phase 3 verify-lockout (low risk due to userId-binding, but close before launch).
