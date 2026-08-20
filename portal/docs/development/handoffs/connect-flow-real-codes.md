# Handoff — Connect flow: real emailed codes 🔴

← [plan](../plans/connect-flow-real-codes.md) · [updates.md](../updates.md) · [status.md](../status.md) · [development.md](../../development.md)

**Worker:** Connect-flow chat · **Date:** 2026-08-19 · **Status: ALL 4 PHASES SHIPPED — code-complete.**
Launch blocker on the **code** side is cleared. Two **non-code** things remain before a
real customer can use it (see [§7](#7-whats-left-to-be-a-usable-feature)).

---

## 1. What this was

Replace the `00000` dev-only bypass in the `/connect/[connectionId]` flow with a **real,
emailed, single-use, expiring confirmation code**, so a customer connecting their own
software to their Aqua portal can actually finish in production. The `00000` bypass is
**kept**, but only behind the dev-mode gate.

**Ed's decisions (made this session):** 6-digit numeric · 15-minute TTL · keep `00000`
behind the dev-mode gate (not removed).

---

## 2. Progress — the four phases

| Phase | What shipped | Verification |
|---|---|---|
| **1 — generate + store** | `generateConfirmationCode` (uniform 6-digit), `hashConfirmationCode` (HMAC, bound to `connectionId+userId`), `checkConfirmationCode` (constant-time, expiry-aware, `expired` vs vague `wrong-code`); hashed code stored on the connection record's additive `pendingCode`; single-use via clear-on-accept. | Behavioural smoke (runs the real store) · **Auditor: 🟡 PASS-WITH-NITS** |
| **2 — email** | `connectionCodeEmail` (pure builder, magic-link-styled); `POST /api/portal/connections/request-code` (mints + emails to the session's **own** email, resend, readiness gate, dev console fallback); `_ConnectFlow` auto-requests + resend + `sentTo`. | **Route-handler harness 14/14** |
| **3 — rate-limit + lockout** | `MAX_CODE_ATTEMPTS=5` → new `locked` outcome (even the right code refused while locked; resend resets); `rateLimit` throttles — verify 20/15min per IP+user, send 5/15min per connection. | **Route-handler harness 13/13** |
| **4 — UX** | Live M:SS expiry countdown; expired/locked disable Confirm + promote resend to primary; confirm handler branches on `confirmation` status. | UI contract tests · **live page render** on `:3032`, no console errors |

---

## 3. Files

### Owned (this worker's lane)
- `src/lib/server/connectionConfirmation.ts` — the decision module (rewritten). Codes, HMAC hash, verify, lockout, the email content builder, all the constants.
- `src/app/connect/[connectionId]/_ConnectFlow.tsx` — the client component (code step, countdown, resend, error states).
- `src/app/connect/[connectionId]/page.tsx` — unchanged in behaviour (still passes `DEV_CONFIRMATION_CODE` in dev).
- `src/app/api/portal/connections/accept/route.ts` — verifies the real code + IP throttle.
- `src/app/api/portal/connections/request-code/route.ts` — **new** endpoint (mint + email + resend + send throttle).

### Shared files touched — **additive, flagged** (not in this worker's lane; no other worker owns them)
- `src/lib/server/portal/portalConnections.ts` — added optional `pendingCode?: PendingConfirmationCode` field to `PortalConnection` + a `import type`.
- `src/server/portalConnectionStore.ts` — added `issuePortalConnectionCode`, `recordPortalConnectionCodeAttempt`; `acceptPortalConnection` now clears `pendingCode` on completion.

### Tests
- `scripts/smoke-portal-connections.test.ts` — extended (the real code lifecycle + email builder + endpoint guards).
- `scripts/smoke-mfa.test.ts` — **updated** stale contract tests that pinned the old temporary shape (see [§6](#6-problems--gotchas)).

### Docs updated
plan · todo · status.md · updates.md (4 entries) · shared-logic chapter · api-reference (new endpoint row) · state.md · symbol reference regenerated.

---

## 4. How it works (design + reasoning)

**Why the code lives on the connection record, not in `nonceStore`.**
The plan said "reuse the `nonces` store + HMAC pattern." Reading the code closely: `magicLink`/
`emailVerification` are *self-verifying* HMAC tokens (long, in a URL, no lookup), and
`nonceStore` only enforces **single-use** on an *already-verified* token — its `consumeNonce`
treats any first-seen token as valid, so it **cannot validate** a short human-typed code. A
6-digit code has no room for a signature, so it **must be stored** and looked up. The natural,
durable, multi-instance-safe home is the **connection record** (already persisted, already loaded
on every accept) — which also satisfies the plan's "bound to the connection id + user." So the
honoured reuse is: the **HMAC-hash pattern** + the **single-use semantics**, with the connection
record as the store. A memory map would have been broken on serverless (mint on instance A,
verify on instance B).

**The mechanism.**
1. `request-code` → `issuePortalConnectionCode` mints a random 6-digit code, computes
   `HMAC(secret, "connect-code:{connectionId}:{userId}:{code}")`, stores `{hash, expiresAt, attempts:0}`
   on the record, returns the plaintext once for the email. Raw code is **never** stored.
2. The code is emailed to `session.email` (the person's own account email — never a
   request-supplied address; that's the point of the proof).
3. `accept` → `checkConfirmationCode` re-hashes what was typed with the same ids and compares in
   **constant time** (`crypto.timingSafeEqual`). On success, `acceptPortalConnection` completes the
   connection **and clears `pendingCode` in the same mutation** → single-use (a replay finds nothing).

**Security properties**
- Code bound to `userId` → a colleague's session can't use a code emailed to someone else (different hash).
- Code bound to `connectionId` → can't be lifted onto another connection.
- Constant-time compare; only a hash at rest; single-use; 15-min TTL.
- **Lockout:** 5 wrong guesses → `locked`; even the correct code is then refused (so guess-to-limit-then-real can't work); a resend mints a fresh code (count reset) or expiry clears it.
- **Rate limits:** verify 20/15min per IP+user (blunt cap across fresh codes); send 5/15min per connection (no inbox-spam / email-cost lever).
- `00000` honoured **only** when `bypassEnabled` (dev mode requires file/memory backend → physically can't touch real data), and it sits **above** the lockout (it's for walking the flow).

**Key constants** (in `connectionConfirmation.ts`): `CONFIRMATION_CODE_LENGTH=6`,
`CONFIRMATION_CODE_TTL_MS=15min`, `MAX_CODE_ATTEMPTS=5`. Rate-limit consts live in the two routes.

---

## 5. Tests & verification

- **Full smoke suite: 1517 pass / 0 fail / 1 skip** (last run). Typecheck **clean in all connect-flow files**.
- Behavioural tests **run the real store** (not just source-shape): issue → hash-only-at-rest → verify → user/connection binding → expiry → single-use clear → resend-replaces → attempt count → lockout → dev bypass.
- **Runtime harness (the strong proof):** an in-process script drove the **actual route handlers** (`request-code` + `accept`) with a real signed session against the memory backend — **13/13**: refuse-without-mail-sender, real-code-completes, wrong+replay refused, lockout after 5 + resend-resets, send-throttle 429, dev bypass. Technique saved as a memory (`aquacrm-runtime-verify-route-handlers`). No server/`.next`/network.
- **Live render:** loaded `/connect/<bad-id>` on the running `:3032` dev server (it HMRs this folder) → correct refusal page, **no console errors** → the page + component compile and render in the real Next runtime.

---

## 6. Problems & gotchas (things the next person should know)

1. **Stale contract tests pinned the old temporary behaviour.** `smoke-mfa.test.ts` asserted the
   old `unavailable`/`if (!input.bypassEnabled)` shape and the old `{email}` UI token — exactly the
   "an existing contract test may be pinning the behaviour you changed" case CLAUDE.md warns about.
   **Updated (not weakened)** to pin the new mechanism (`bypassEnabled && code === DEV…`,
   `timingSafeEqual`, `{sentTo}`, request-code-on-open, resend). If you touch the flow, expect to
   re-point these, not fight them.
2. **Two session styles — only one is driveable in-process.** The connect routes use
   `getSessionFromRequest(req)` (pure HMAC verify) → harness-driveable. Routes using the
   headers-based `getSession()` (`await cookies()`) throw outside a request scope and must be
   browser-verified. (Captured in the runtime-verify memory.)
3. **Can't safely start a second dev server here.** A live server holds `:3032` and shares `.next` +
   the file sandbox (a documented wipe hazard). So the code-step **browser walk was deferred** and I
   used the route-handler harness + a read-only page-render check on the *existing* server instead.
4. **Parallel-worker churn is normal.** During this work the Staff worker was live-editing
   `_PeopleCommand.tsx` and `storage.ts` — transient `tsc` errors and an intermittent ordering-flake
   in *their* smokes appeared and vanished across runs. **None were from connect-flow** (proven:
   identical code passed 0-fail across repeats; my files 0 typecheck errors). Don't be alarmed by a
   red full-suite `tsc` if the errors are in another worker's file.
5. **Shared-file touches.** `portalConnections.ts` + `portalConnectionStore.ts` aren't in this
   worker's lane. Edits are strictly additive and were flagged in every update — but a future worker
   on the portal-connections store should know `pendingCode` + the two fns exist.

---

## 7. What's left to be a usable feature

Both are **non-code**:
1. **Connect a Resend or SMTP sender** for the agency (Company → Connections), or `RESEND_API_KEY` +
   `MILESYMEDIA_FROM_EMAIL` env. Without it, production delivers no code (the endpoint refuses cleanly
   with a clear message); dev is covered by `00000`.
2. **Walk the code step in a browser** — watch the countdown tick, resend, wrong→retry, real code →
   portal. Needs a seeded pending connection + a signed-in customer session. Deferred to avoid churning
   the Commander's shared `:3032`. The page-level render is already confirmed live; the server flow is
   13/13.

**Also needs `PORTAL_SESSION_SECRET` set in every environment** (codes are HMAC'd with it; the dev
fallback secret must not be used in prod).

---

## 8. Thoughts / suggested follow-ups (not blocking)

- **Audit queue:** Phase 1 passed (🟡, both nits since closed by P2+P3). **Phases 2, 3, 4 should
  still be re-audited** by the auditor loop now that they're logged.
- The **send throttle is keyed by `connectionId` only** — fine for the abuse it targets (resend spam
  on one link). If you later worry about an authed user hammering many connections, add an IP/user key
  too (the accept route already does IP+user).
- Rate-limit state is **process-local in-memory** (same limitation as the rest of `rateLimit.ts`) —
  resets on cold start, not shared across serverless instances. Good enough to slow abuse; a
  KV/Redis backing is the eventual upgrade (already noted in `rateLimit.ts`).
- The `_ConnectFlow` countdown uses a 1s interval only while the code screen is open + a code exists.
  Cheap, but it re-renders once a second — fine for this screen.
- No git commits (per the rules) — HEAD still `b46d8ae`; every connect-flow file is untracked
  working-tree work.

---

## 9. One-line status

**Connect-flow real emailed codes: all 4 phases shipped, server flow runtime-verified 13/13, page
renders live, full suite green. Usable once (a) a mail sender is connected and (b) someone walks the
code step in a browser. No further connect-flow code planned.**
