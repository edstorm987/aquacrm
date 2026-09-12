# Claude status

Claude owns this file. Append newest entries at the top with timestamp, queue ID, branch/HEAD, exact files changed, tests/evidence, remaining risk, and local commit SHA if created.

Current assignment: `AUTH-001` in `/private/tmp/aquacrm-claude-public-edge-20260912`.

Identity verified at start: branch `overnight/claude-public-edge-20260912`, HEAD == base `d932ce665d9f6afaffa75ed7796a69b17ac7ee58`, clean tree, no unexpected work. Both worktrees confirmed via `git worktree list`. Graphify: no `graph.json` in this worktree; primary map at `aquaCRM/graphify-out` used read-only for navigation only, all claims re-verified in-worktree. No Graphify regeneration (deferred to final checkpoint).

---

## Log (newest first)

### 2026-09-12 — Queue re-check + AUTH-001 complete + SEC-006 assessment

- **AUTH-001 (Claude): DONE at local/focused-test evidence** on `overnight/claude-public-edge-20260912` @ `bca4f981`. Four checkpoints: `d01d0e5d` (abstraction), `e48fa87f` (login), `69f267e0` (public forms), `bca4f981` (env docs). Every AUTH-001 sub-requirement met at local evidence (see entries below). NOT production-ready: production Turnstile keys + published-block widget wiring are go-live readiness items (HUMAN-BLOCKERS + QUESTIONS-FOR-CODEX #2/#4). No push/deploy/migrate; primary main untouched.
- **Queue changed under me** (Codex advanced): SEC-001/002/004/005/007 now DONE, SEC-003 still ACTIVE (erasure). This made **SEC-006 (Claude) READY** (dep SEC-005 DONE). BOARD-001 still BLOCKED-DEPENDENCY (SALES-001 still VERIFY, not DONE). DOMAIN-001 still shows BLOCKED-DEPENDENCY though its dep SEC-002 is now DONE — see QUESTIONS-FOR-CODEX (orchestrator may flip it to READY).
- **SEC-006 assessment (READY, not started this session — session 30-turn budget reached):** NOT blocked and safely actionable. Surface is self-contained: `portal/src/lib/server/compliance/subjectAccessExport.ts` (208 lines), `portal/src/app/api/portal/governance/subject-access/route.ts` (78), `portal/src/lib/server/compliance/subjectRequests.ts` (184). It imports only `getState` + `PortalState` types — **no overlap with SEC-003's active erasure files** (`server/clientErasure.ts`, `api/portal/governance/erasure/**`), so it will not collide with Codex's in-flight work. The typed subject-ownership + provenance model it must reuse was delivered by SEC-004/005 (DONE): `identityResolution`, `ownedEnquiry`, `clientRecordLedger`, server-written route provenance. **Plan for the next session:** (1) read the three files + the SEC-005 ownership primitives; (2) write adversarial tests FIRST — a shared email/phone must export ONLY the exact typed-owned subject's records, never a third party's, with field-level redaction of co-mingled fields; (3) rebuild the export to scope by exact subject ownership + redact; (4) focused tests, `tsc --noEmit`, `git diff --check`, checkpoint commit, status. It is the top Claude item to pick up next.

### 2026-09-12 — AUTH-001 Slices B–D + docs: enforcement, widget, login redesign — DONE (local checkpoints)

- Branch/HEAD: `overnight/claude-public-edge-20260912` @ `bca4f981` (base `d932ce66`). Commits: `e48fa87f` (login), `69f267e0` (public forms), `bca4f981` (env docs).
- Files changed (all in `portal/`):
  - `src/app/api/auth/login/route.ts` — `verifyBotChallenge(action=login)` gates `handleJsonLogin` AFTER the per-IP limiter + required-fields check and BEFORE lockout/`signInWithPassword` (bots never reach credentials); native-form path forwards `cf-turnstile-response`.
  - `src/components/security/BotChallenge.tsx` (new) — vanilla Turnstile explicit-render client widget (no new dep), accessible retry + `role=status`/`role=alert`, StrictMode-safe, renders nothing when no site key.
  - `src/app/login/LoginForm.tsx` — renders the widget for password sign-in, sends `captchaToken`, resets the single-use token after each attempt (incl. MFA re-post).
  - `src/app/login/page.tsx` — passes public site key; adds ONE Policies link → canonical `/privacy`. Preserves tenancy/MFA/recovery/OAuth/keyboard.
  - `next.config.ts` — CSP `script-src` gains ONE pinned host `challenges.cloudflare.com` (see QUESTIONS-FOR-CODEX #1).
  - `src/app/globals.css` — captcha/status/retry + policies-link styles, `:focus-visible`, reduced-motion-safe (no added animation).
  - `src/app/api/public/contact/route.ts` — `verifyBotChallenge(action=public-contact)` after honeypot + validation + rate limits, before lead creation; bound to same-origin host.
  - `src/app/api/public/brand-enquiry/route.ts` — `verifyBotChallenge(action=brand-enquiry)` after validation + rate limits, before capture; bound to the SUBMITTING origin's host (cross-origin admission).
  - `.env.example` — documents `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CAPTCHA_EXPECTED_HOSTNAMES`, `CAPTCHA_PROVIDER` + behaviour + official test keys (placeholders only).
  - Tests (new): `scripts/smoke-login-bot-challenge.test.ts`, `scripts/smoke-public-forms-bot-challenge.test.ts`.
- Reuse, not rebuild: existing `rateLimit`, MFA, `authBrand`, `securityEvents`, honeypots, open-redirect guard, native-form path — all preserved. No SEC-001/002 files touched; no funnel internals or shared session/nonce/user/tenant/erasure internals touched; website-editor blocks NOT edited (handed off, QUESTIONS #2).
- Evidence class: **focused-test** — `NODE_OPTIONS='--conditions react-server' node --import tsx --test`:
  - `scripts/smoke-login-bot-challenge.test.ts` → **6/6** (no-token→403 before Supabase; valid token→200; rejected token→403; wrong password still 401; native form→303 with challenge cookie, message never in URL; unconfigured→login proceeds).
  - `scripts/smoke-public-forms-bot-challenge.test.ts` → **3/3** (contact + brand-enquiry no-token→403; honeypot still 200).
  - Regression: `scripts/smoke-auth-form-encoding.test.ts` **19/19**, `scripts/smoke-mfa.test.ts` **78/78** — unchanged.
  - **static/typecheck**: full `tsc --noEmit` = **0 errors** tree-wide (heavy-job lock acquired + released). `git diff --check` clean on every commit.
- Risks/notes: production keys + widget-on-published-blocks are go-live readiness items (QUESTIONS #2/#4; keys parked in HUMAN-BLOCKERS). Canonical Terms route absent → single Policies link points to canonical `/privacy` (QUESTIONS #3). Rate limiter/replay cache are process-local (existing known limitation). Login React changes verified via typecheck + route-level behavioural tests (no RTL/DOM harness exists in this repo). Local evidence only — **not** production-readiness.

### 2026-09-12 — AUTH-001 Slice A: managed bot-challenge abstraction — DONE (local checkpoint)

- Branch/HEAD: `overnight/claude-public-edge-20260912` @ `d01d0e5d` (base `d932ce66`).
- Files added:
  - `portal/src/lib/server/security/botChallenge.ts` (new; provider-abstracted managed CAPTCHA verifier, Turnstile-first).
  - `portal/scripts/smoke-bot-challenge.test.ts` (new; 20 adversarial cases).
- What it does (DECISIONS #13): mandatory server-side verification against Cloudflare Turnstile siteverify; action + hostname binding (strict in production, tolerated-with-warning outside prod for official test keys); bounded 5s AbortController timeout; single-use/replay resistance via a module-private salted-hash spent-token set (NOT the shared nonce store); per-IP verify rate limit reusing `rateLimit`; secret-free `recordSecurityEvent` evidence on every meaningful outcome; **fail-closed** — configured => any missing/malformed/replayed/expired/rejected/error/timeout/mismatch denies; unconfigured => skipped only outside production, and in production it denies + emits a `critical` `captcha.unconfigured-fail-closed` event (the DECISIONS #13 readiness blocker, made real). No secret ever reaches the client (`botChallengeClientConfig()` exposes site key only).
- Reuse, not rebuild: `rateLimit`, `recordSecurityEvent` (+ `clearSecurityEventsForTest`/`recentSecurityEvents`), `clientIpFromHeaders` (caller-side). No SEC-001/002 files touched. No funnel internals touched.
- Evidence class: **focused-test** — `NODE_OPTIONS='--conditions react-server' node --import tsx --test scripts/smoke-bot-challenge.test.ts` → **20/20 passed**. **static/typecheck** — full `tsc --noEmit` = **0 errors** across the whole tree (ran under the heavy-job lock; lock released). `git diff --cached --check` clean.
- Risks/notes: process-local replay cache + rate limiter reset on cold start (same known limitation as existing `rateLimit`; documented). Production CAPTCHA keys remain a parked HUMAN blocker (already in HUMAN-BLOCKERS.md) — no route wired to enforcement yet in this slice.
