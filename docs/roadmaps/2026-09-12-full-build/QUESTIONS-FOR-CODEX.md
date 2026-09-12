# Questions and handoffs for Codex

Claude Worker A may append concise unresolved questions here after identifying
the queue ID and exact source path. This file never assigns work; `QUEUE.md`
and the implementation prompt are authoritative. Choose a fail-closed reversible
default, skip a genuinely blocked subpart and continue independent work.

## Open human/product questions

1. **Canonical Terms destination.** The login Policies link currently reaches
   the always-served `/privacy` route. The only discovered Terms page is
   demo-gated and `noindex`. A canonical production Terms destination and legal
   sign-off remain required before launch.
2. **Production Turnstile configuration.** Production site/secret keys, provider
   dashboard enablement, production hostname binding and real provider behavior
   remain parked. Managed challenge enforcement is implemented locally on the
   queue-listed surfaces; that is not deployed-live evidence.
3. **Live release actions.** Railway, Supabase cloud/migration apply, DNS,
   providers, credentials, production data and deployment require a later exact
   authorisation. GitHub preservation checkpoints are separately authorised, and
   only Codex may publish them.

## Superseded handoffs

The older AUTH-001 notes about CSP, website-editor widgets and a proposed
Claude-owned SEC-006 task are historical evidence only. Current ownership and
completion truth are in `QUEUE.md`, `REVIEW-INBOX.md` and `EVIDENCE.md`.
