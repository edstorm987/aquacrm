# Questions and handoffs for Codex

Claude owns this file. Write concise questions or conflicts here, include the queue ID and exact path, then skip to safe independent work. Do not wait for an answer overnight and do not guess across a security, tenancy, data-destruction, deployment, or product-authority boundary.

---

## 2026-09-12 — AUTH-001 handoffs (Claude)

Chosen defaults are already implemented and fail-closed/reversible; these are coordination points, not blockers on my side.

1. **Shared file touched — CSP (coordination).** AUTH-001 edited `portal/next.config.ts` `SCRIPT_SRC` to add ONE pinned host `https://challenges.cloudflare.com` (the Turnstile widget script). This is the sanctioned "pinned CDN" extension the file's own comment anticipates; `frame-src`/`connect-src` already allow `https:`. No wildcard added. Flagging because `next.config.ts` is shared — please reconcile at integration if Codex also edits it.

2. **Widget wiring on published-site form blocks (before go-live).** Backend enforcement is LIVE and fail-closed on `POST /api/auth/login` (JSON path), `POST /api/public/contact`, `POST /api/public/brand-enquiry`. Their published-site mounted UIs live in the website-editor module (under SALES-001 verification), so I did NOT edit them to avoid conflict. Before production keys are set, these need the Turnstile widget or they fail closed:
   - `portal/src/built-ins/modules/website-editor/src/components/blocks/LoginFormBlock.tsx` (no-JS native login) — add `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>` + `<div class="cf-turnstile" data-sitekey=… data-action="login">`. The login route already forwards the injected `cf-turnstile-response` field.
   - `portal/src/built-ins/modules/website-editor/src/components/blocks/CrmContactFormBlock.tsx` — mounted UI for `/api/public/brand-enquiry`; add the widget with `data-action="brand-enquiry"` and post `captchaToken` (= the `cf-turnstile-response` value).
   - `SignupFormBlock.tsx` / end-customer signup + magic are SEC-002 (Codex) territory — I deliberately did not gate them. If you want the managed challenge there too, `verifyBotChallenge({ action: … })` from `@/lib/server/security/botChallenge` is ready.
   Client config helper `botChallengeClientConfig()` returns the public site key only (no secret).

3. **Canonical Terms destination (product/legal).** DECISIONS #16 asked for one Policies link to "canonical privacy/terms pages". The login link points to the canonical, always-served, smoke-tested `/privacy` (Privacy & cookies; static rewrite in `next.config.ts`). There is NO always-served canonical Terms route — only the demo-gated, `noindex` `(website)/terms` (404 unless `WEBSITE_DEMO_ENABLED`). Legal privacy/terms sign-off is a parked HUMAN blocker. Chosen default: single link → `/privacy`. Please confirm the canonical Terms destination (and whether a second link is wanted) before go-live.

4. **Production Turnstile keys (already in HUMAN-BLOCKERS).** With `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set, every enforced surface must present the widget or it fails closed. Portal `/login` is complete; the published-site blocks in (2) are the remaining coverage. Documented in `portal/.env.example`.

5. **Queue status FYI (orchestrator-owned, not editing).** With SEC-002 now DONE, `DOMAIN-001` (Claude) still shows `BLOCKED-DEPENDENCY` in QUEUE.md — its only listed dependency is satisfied, so it may be flippable to `READY` if you intend Claude to pick it up. `SEC-006` (Claude) is now READY (dep SEC-005 DONE) and is self-contained from SEC-003's active erasure files — assessed in CLAUDE-STATUS as the next Claude item.
