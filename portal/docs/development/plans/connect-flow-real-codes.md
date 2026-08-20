# Plan — Connect flow: real emailed codes  ✅ shipped

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: ✅ SHIPPED — all four phases (2026-08-19), code-complete and server-runtime-verified.** A mail sender is now connected (RESEND_API_KEY + MILESYMEDIA_FROM_EMAIL are set) — the one gate left is the code-step browser walk, tracked on the roadmap under `verify-sweep` and unblocked by `npm run sandbox:fork`.
The dev bypass is replaced by a real emailed confirmation code.

_Corrected 2026-08-20 — the paragraph here used to list two things standing between this and "done for a real customer". **One of the two has closed, and the other is no longer blocked:**_
- ~~**(1) a Resend/SMTP sender must be connected**~~ — ✅ **done.** `RESEND_API_KEY` and `MILESYMEDIA_FROM_EMAIL` are set, and `inspectProductionReadiness` reports the `email` row **ready** (`src/lib/server/productionReadiness.ts:140–144`).
- **(2) the code-step browser click-through** — still unwalked, but it is no longer "deferred off the Commander's shared `:3032` server": `npm run sandbox:fork` gives any worker its own port and state file. Reaching the code screen still needs a seeded connection + a customer session. Tracked on the roadmap under `verify-sweep`.

The connect page renders live in the real runtime with these changes (verified, no console errors), and the server flow is runtime-verified 13/13. **The `🔴 blocker` badge that used to sit in this plan's title was wrong and has been removed** — it is exactly the kind of stale marker that sends a worker to re-fix shipped code.

**Decisions made (Ed):** 6-digit numeric code · 15-min TTL · **keep** the
`00000` stand-in, only behind the existing dev-mode gate (not removed).

**Progress:**
- ✅ **Phase 1 (generate + store + verify).** `generateConfirmationCode` +
  `hashConfirmationCode` (HMAC, bound to connection+user) + `checkConfirmationCode`
  (constant-time, expiry-aware) in `connectionConfirmation.ts`; hashed code stored
  on the connection record's additive `pendingCode` field; `issuePortalConnectionCode`
  / `recordPortalConnectionCodeAttempt` + single-use clear-on-accept in
  `portalConnectionStore.ts`; accept route verifies against the stored code.
  Behavioural smoke coverage added; stale mfa contract test updated.
- ✅ **Phase 2 (email + issue/resend endpoint).** `connectionCodeEmail` builds
  the code email (magic-link-styled); new `POST /api/portal/connections/request-code`
  mints + emails the code (dev exempt from the readiness gate; magic-link-style
  console fallback), always to the session's **own** email, never a request-supplied
  one; keyed by expiry so a resend is a real new send. `_ConnectFlow` auto-requests
  a code when the code screen opens, names the destination (`sentTo`), and offers
  a resend. **Server-runtime-verified** end to end via an in-process route-handler
  harness (14/14): request-code refuses without a mail sender, real code completes,
  wrong/replay refused, dev bypass works. Browser click-through still pending a
  safe server.
- ✅ **Phase 3 (rate-limit + lockout).** Per-code **lockout**: `MAX_CODE_ATTEMPTS`
  (5) wrong guesses → new `locked` outcome; even the correct code is then refused
  until a **resend** mints a fresh code (attempts reset) or it expires. Plus
  `rateLimit` throttles (reuse `rateLimit.ts`): verify capped 20/15min per
  IP+user on `accept`; **send** capped 5/15min per connection on `request-code`
  (stops inbox spam). **Server-runtime-verified** (13/13): 5 wrong → locked,
  correct code refused while locked, resend resets; 5 sends allowed, 6th 429.
- ✅ **Phase 4 (resend / expiry / error UX).** `_ConnectFlow` now shows a **live
  M:SS countdown** while a code is valid and a plain "your code has expired" once
  it lapses; **Confirm is disabled on a spent (expired/locked) code** and the
  **resend becomes the primary action** ("Send me a new code"); the confirm
  handler **reads the `confirmation` status** to choose retry vs fresh-code and
  clears a dead code from the box; a fresh code resets the clock + input. The
  connect page **renders live in the real Next runtime** with these changes (no
  console errors); the interactive code-step walk is the one deferred check.

## Where we are
- `/connect/[connectionId]` cutscene → sign in → **code step accepts `00000` in dev** → loader → portal. The code gate is `lib/server/connectionConfirmation.ts`; UI in `app/connect/[connectionId]/_ConnectFlow.tsx`.
- No real code is generated or emailed — so a real customer can't complete it. (See [issues #5](../issues.md).)

## Phases
1. ✅ **Generate + store a code.** On "accept connection", mint a short-lived, single-use code (reuse the `nonces` store + HMAC pattern already used by magic-link/verify) bound to the connection id + user. TTL ~10 min.
2. ✅ **Email it.** Send via the existing transactional email (`lib/server/transactionalEmail.ts` / `resendEmail.ts`) — reuse a template.
3. ✅ **Verify + rate-limit.** Confirm endpoint checks the code (single-use via nonce), with attempt rate-limiting + lockout (reuse `lib/server/rateLimit.ts`). Keep `00000` **only** behind the existing dev-mode gate, clearly flagged.
4. ✅ **UX.** Resend link, expiry message, error states in `_ConnectFlow.tsx`.

## Reuse
`nonceStore.ts`, `magicLink.ts` (token pattern), `transactionalEmail.ts`, `rateLimit.ts`. Don't build new crypto — mirror the existing single-use token flow.

## Decisions (Ed)
- Code length/format (6-digit numeric vs alphanumeric) and TTL.
- Keep the `00000` dev bypass at all, or remove entirely?

## Done when (runtime-verified)
A real (non-dev) connect completes end-to-end: code arrives by email, wrong/expired codes are rejected, one-time use holds, and the portal loads. Add a behavioural test (not just a source-shape assertion).

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/server/connectionConfirmation.ts`
- `src/lib/server/portal/portalConnections.ts`
- `src/app/connect/[connectionId]/_ConnectFlow.tsx`
- `src/app/connect/[connectionId]/page.tsx`
- `src/app/api/portal/connections/request-code/route.ts`
- `src/app/api/portal/connections/accept/route.ts`
- `src/server/portalConnectionStore.ts`
- `scripts/smoke-portal-connections.test.ts`
- `docs/development/plans/connect-flow-real-codes.md`
