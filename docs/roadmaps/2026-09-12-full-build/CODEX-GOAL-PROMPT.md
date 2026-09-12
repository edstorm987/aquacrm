# Updated Codex goal prompt

The current product goal object is usage-limited and cannot be rewritten in
place. This is the replacement charter for the active heartbeat and the prompt
to paste into the next Codex `/GOAL` if a fresh goal is needed.

```text
/GOAL Take AquaCRM from its current GitHub-preserved full-build checkpoint to an honestly production-grade, full-product release and first real-client onboarding decision. Do not reduce the product to a disabled pilot and do not confuse local green tests with production proof.

Act as the permanent user-facing orchestrator, integration owner and GitHub/main custodian. Ed must be able to keep talking to this Codex thread while work continues. Coordinate three isolated lanes: Claude Worker A implements one explicitly reserved QUEUE.md item; Claude Worker B independently reviews exact immutable SHAs and audits documentation without editing reviewed source; Codex resolves decisions, performs/corrects work, integrates only accepted slices, updates canonical truth and owns checkpoints/main. Never allow two workers to edit the same worktree/files or let an implementer self-accept.

Every cycle read the orchestration folder at <WORKSPACE>/aquaCRM-orchestration/2026-09-12-full-build, especially QUEUE.md, REVIEW-INBOX.md, DECISIONS.md, EVIDENCE.md, CODEX-STATUS.md, FEATURE-GAP-MAP-2026-09-12.md and GITHUB-CHECKPOINT-POLICY.md. Treat exact source/behavior as truth; worker claims are handoff evidence. Use Graphify for navigation, then verify directly because the graph may be stale.

Preserve work continuously. Before each GitHub checkpoint: require a coherent commit; no merge conflict; diff-check; scan staged/range additions for credentials, private keys, live data, generated/local state, symlinks and files over 5 MiB; classify migrations and reject duplicate versions. Push recovery, worker and integration history only to Ed-authorised https://github.com/edstorm987/aquacrm.git under truthful checkpoint/* names and verify every remote SHA with git ls-remote. Never force-push. Keep rejected/partial work isolated and labelled. A verified all-refs bundle is the fallback when remote push is blocked.

Move main only from an exact accepted integration SHA. Before promotion require: no included unresolved P0/P1; focused and adjacent security suites; full TypeScript; canonical smoke and Website Editor suites; production build; provider-free browser, accessibility, responsive and performance gates; migration ordering/schema/RLS review; semantics, metadata contracts, search/API/reference docs and Graphify regenerated from frozen source; duplicate classification; backup/recovery and human-only external gaps explicitly recorded. Verify integration/local-main/upstream-main/remote-main SHA equality. Never claim launch readiness for untested live gates.

Railway, Supabase cloud, DNS, providers, real credentials/data, email/SMS/payments, deployment and applying migrations remain prohibited until Ed separately authorises the exact action. Local fixtures, isolated memory/file backends, disposable databases and 127.0.0.1 are allowed. Skip human-only keys/legal/provider actions, record them, and continue independent safe work. Keep heavy jobs serial with <TMP>/aquacrm-heavy-job-20260912.lock and avoid sustained resource saturation.

Product architecture decision: hardcoded scripts/playbooks/checklists are replaced by tenant-validated searchable references to the canonical SOP Library or composed SOP Guides. Workflows offer search/open/role-gated Create SOP; activity records retain SOP id and observed revision/fingerprint. Never create a duplicate document store.

After each outcome update QUEUE/EVIDENCE truth, add reviewable exact SHAs to REVIEW-INBOX, checkpoint accepted progress, then take the next dependency-safe item. Ask Ed only for a genuine product/legal choice or newly required authority; otherwise keep progressing autonomously.
```
