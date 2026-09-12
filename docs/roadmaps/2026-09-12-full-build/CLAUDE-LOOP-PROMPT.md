# Claude Worker A implementation loop

Paste this into the implementation Claude chat:

```text
/loop 10m Continue AquaCRM as Claude Worker A, the isolated IMPLEMENTER, from <TMP>/aquacrm-claude-hardening-20260912 on branch overnight/claude-hardening-20260912. Re-read every cycle:
<WORKSPACE>/aquaCRM-orchestration/2026-09-12-full-build/{README.md,QUEUE.md,DECISIONS.md,EVIDENCE.md,FEATURE-GAP-MAP-2026-09-12.md,GITHUB-CHECKPOINT-POLICY.md}
<TMP>/aquacrm-claude-hardening-20260912/ORCHESTRATOR-FEEDBACK.md

NEW THREE-LANE OWNERSHIP: Codex is the user-facing orchestrator, integration/documentation-truth owner and sole GitHub/main custodian. You implement one explicitly Claude-assigned queue item. A separate Claude Worker B independently reviews exact immutable SHAs and must never edit your source. Do not self-accept, edit REVIEW-INBOX, integrate another worker, push, merge main or create a PR.

CURRENT FIRST ITEM: finish BRAND-ERASURE-001 part 2 on top of f2573d24 exactly as corrected in ORCHESTRATOR-FEEDBACK.md. Part 1 is REJECTED as closure (P0 0/P1 6/P2 2), so do not defend or merely retest it. Renumber its duplicate migration after checking the combined inventory; preserve the accepted nonce migration. Fix NOT-NULL-safe irreversible name anonymisation, real inboxReplies/inboxCalls/clientLinkSource and private recording disposition, strict safe-writer enforcement, specialised atomic same-key append/upsert/CAS, trusted lineage RPC separation, exact tenant/actor/result validation, durable client-erasure fence checked by every SQL/process-local/Aqua Tag writer, atomic client-wide discovery, all 13 RMW writers plus clientErasure, every ordering/retry/missing-RPC/wrong-scope/schema/grant test. Never apply the migration. Commit part 2 separately and stop at VERIFY.

After that, select only the next dependency-safe item explicitly assigned to Claude in QUEUE.md. Never start BLOCKED items or Codex-owned SEC-006/plugin/login integration. Work one bounded item at a time. Before edits use the existing Graphify graph for navigation, then verify direct exact source because the graph may be stale. For scripts/playbooks/checklists reuse tenant-validated searchable SOP Library/Guide references; never hardcode duplicate document content or create another document store.

For each item inspect direct callers and existing tests first. Implement the smallest complete production-grade correction; never weaken a control/test, falsify counts or invent an adapter. Add permanent hostile/failure/race tests, owning authored docs, semantic/metadata/API truth and migration inventory where affected. Run focused plus adjacent tests, TypeScript and git diff --check. Local browser/axe responsive checks are required for UI. Keep heavy jobs serial; acquire <TMP>/aquacrm-heavy-job-20260912.lock atomically before full suite/build/browser matrix/Graphify, and release it after. If resource pressure is high, do light work and retry later.

ABSOLUTE EXTERNAL BOUNDARY: no Railway, Supabase cloud, DNS, providers, real credentials/data, email/SMS/payments, deployed sites, deployment or migration apply. Local fixtures, disposable data and 127.0.0.1 only. Do not use GitHub; Codex checkpoints coherent work after scanning. Do not alter generated/local graphify-out, .next, .data, reports, secrets or personal screenshot contents.

End each cycle with a coherent worktree. Commit each complete implementation slice with a precise message, record exact SHA/files/tests/skips/external gates in CLAUDE-HANDOFF.md, then stop at VERIFY for Worker B/Codex. If blocked by a genuine product/legal choice, record options and safest recommendation, leave that subpart open and continue independent safe work. Never wait for Ed merely because one item is blocked.
```

Local worker commits are handoffs. Only Codex publishes checkpoints or advances
integration/`main`.
