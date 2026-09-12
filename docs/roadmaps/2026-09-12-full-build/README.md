# AquaCRM full-build overnight coordination

This directory is the only cross-agent coordination surface for the 12 September 2026 run. It is outside every Git worktree so Codex and Claude can read it without sharing source files.

## Objective

Advance the complete AquaCRM product, not a reduced pilot, while preserving tenant isolation, exact data lineage, role gates, accessibility, responsive behaviour, truthful documentation, and production evidence. “Complete” means the queue is either verified or explicitly parked as a human/provider/legal blocker. It never means claiming production readiness from source tests alone.

## Workspaces

- Codex integration tree: `/Users/eds/Desktop/Projects/Web Development/Personal EcoSystem/aquaCRM-sales-workflow-recovered-20260912`
- Frozen full recovery checkpoint: `3abd629ec87d43e4d5138af9204060df73e92bbc` on `checkpoint/full-build-20260912-112701`, remotely verified.
- Active accepted-slice integration branch: `integration/full-build-20260912`; GitHub checkpoint mirror is `checkpoint/integration/full-build-20260912`.
- Claude Worker A implementation tree: `/private/tmp/aquacrm-claude-hardening-20260912`, branch `overnight/claude-hardening-20260912`.
- Claude Worker B read-only acceptance tree: `/private/tmp/aquacrm-claude-review-20260912`, always detached at the exact `REVIEW-INBOX.md` SHA.
- Codex ABUSE-001 isolated tree: `/private/tmp/aquacrm-codex-abuse-001-20260912`, branch `overnight/codex-abuse-001-20260912`, same base.
- Codex ABUSE-002 isolated tree: `/private/tmp/aquacrm-codex-abuse-002-20260912`, branch `overnight/codex-abuse-002-20260912`, same base.
- Codex ABUSE-003 isolated tree: `/private/tmp/aquacrm-codex-abuse-003-20260912`, branch `overnight/codex-abuse-003-20260912`, same base.
- Earlier Claude AUTH-001 evidence tree remains `/private/tmp/aquacrm-claude-public-edge-20260912`; do not continue new work there.
- Primary `aquaCRM/main` stays untouched until the exact promotion gates in `GITHUB-CHECKPOINT-POLICY.md` pass. Never alter its untracked `graphify-out/**`.

## Ownership protocol

1. Codex is the user-facing orchestrator, integration owner, canonical-doc truth owner and sole GitHub/`main` custodian. It owns `QUEUE.md`, `DECISIONS.md`, `EVIDENCE.md`, `REVIEW-INBOX.md` assignments and checkpoint decisions.
2. Claude Worker A implements one explicitly assigned item in its isolated worktree and leaves exact-SHA handoffs. Claude Worker B reviews only immutable SHAs, never edits reviewed source, and writes reports under `reviews/` plus its result cell in `REVIEW-INBOX.md`.
3. A worker edits source only for an item explicitly assigned to it, and only in its own worktree. An implementer never self-accepts.
4. Every source slice ends with focused behavioural tests, typecheck, `git diff --check`, owning docs, and an exact changed-file list. Codex publishes scanned recovery/worker/integration checkpoints to the authorised GitHub repository and verifies remote SHAs. Checkpoint publication is not release approval.
5. If a decision is missing, choose the fail-closed reversible default, record it in the questions file, skip the blocked part, and continue with the next independent item. Never wait for Ed overnight.
6. Never claim a gate from an older run. Label evidence as static, focused-test, local-browser, isolated-production, or deployed-live.

## Heavy-job lock

Only one worker may run a full suite, production build, browser matrix, dependency install, Graphify regeneration, or other high-load job at once.

- Acquire atomically with `mkdir /private/tmp/aquacrm-heavy-job-20260912.lock`.
- If it already exists, do light source/docs work and retry later.
- Record the command and PID context in your own status file.
- Release with `rmdir /private/tmp/aquacrm-heavy-job-20260912.lock` after the process exits.
- If CPU is at or above 95%, swap is growing quickly, or the machine is visibly struggling, stop launching heavy jobs and return to light work until pressure falls.

## Absolute safety boundaries

- No `git reset --hard`, checkout-overwrite, clean, rebase, force operation, broad deletion, or secret disclosure.
- No force-push, unaccepted `main` merge, deployment, Railway mutation, Supabase migration/write, DNS change, provider send, credential rotation, production data access, or legal sign-off unattended.
- Ed authorises scanned GitHub preservation checkpoints to `https://github.com/edstorm987/aquacrm.git`. Railway, Supabase cloud, DNS, providers, production data, deployed sites, credentials, deployment and applying migrations remain parked for a later exact authorisation.
- No arbitrary user-supplied JavaScript in AquaCRM’s origin. Custom embeds use an isolated opaque-origin sandbox and receive no CRM data bridge.
- No public endpoint may mint a privileged or client-scoped session from caller-supplied identity or tenant fields.

## Graphify

Use the existing primary map only for navigation, then verify every conclusion in the active worktree because that map predates this run. Query before broad searching, update the owning architecture/docs after each accepted slice, and run `graphify reflect --if-stale` only at a coordinated final checkpoint under the heavy-job lock. Never treat a graph result as authority over source or runtime evidence.
