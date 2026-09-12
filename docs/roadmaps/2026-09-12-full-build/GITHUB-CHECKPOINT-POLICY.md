# AquaCRM GitHub checkpoint policy

Status: active from 2026-09-12. This policy preserves work; it does not weaken
the production gates or turn a checkpoint into a release claim.

## Branch classes

- `checkpoint/full-build-<timestamp>` is an immutable frozen recovery snapshot.
  Never force-push or repurpose it.
- `checkpoint/workers/<slice>-<date>` preserves a worker's committed history,
  including rejected or incomplete experiments. It is not merge approval.
- `checkpoint/integration/accepted-full-build-<date>` advances only by coherent
  commits that reconcile independently accepted slices into the combined tree.
- A previously published integration candidate later rejected by independent
  review is immutable historical evidence. Never rewind it, advance it or call
  it accepted; start the accepted line again from the last accepted parent.
- `main` is the release branch. A checkpoint branch is never production merely
  because it compiles or exists on GitHub.

## When to checkpoint

Checkpoint immediately after any of these events:

1. a coherent local recovery snapshot is formed;
2. an isolated worker commits a substantial slice;
3. an independently accepted slice is integrated;
4. a correction changes more than one security/data boundary;
5. before a risky merge, migration reconciliation or broad generated-doc pass;
6. after final verification and immediately before `main` promotion.

During a long unattended loop, no coherent committed work should remain only on
one machine beyond the next phase boundary. Uncommitted half-edits are not
pushed: finish an internally consistent commit or capture the entire frozen tree
as an explicitly non-release recovery checkpoint first.

## Required pre-push checks

For the exact commit or range being published:

- working tree/index is understood; no unresolved merge or cherry-pick state;
- `git diff --check` passes;
- no `.env*` other than reviewed examples, credentials, private keys, provider
  tokens, live data, database dumps or personal exports;
- no `graphify-out`, `.next`, `.data`, dependency trees, browser reports,
  screenshots, caches or other generated/local state;
- no unexpected symlink or file larger than 5 MiB;
- changed migrations have globally unique versions and remain unapplied unless a
  separately authorised release action says otherwise;
- branch name and commit message state truthfully whether work is accepted,
  rejected, partial or recovery-only.

If GitHub is unavailable or destination approval is missing, create and verify
an all-refs Git bundle plus SHA-256 checksum outside the repository, then push as
soon as the boundary clears.

## Post-push proof

Run `git ls-remote` for every published ref and require its SHA to equal the
local commit. Record branch, local SHA, remote SHA, scan result and timestamp in
`EVIDENCE.md`. A successful `git push` message alone is not proof.

## Main promotion gate

Promote only the exact integration SHA that has all of the following:

- no unresolved P0/P1 acceptance finding in included code;
- focused security and adjacent regressions green;
- full TypeScript, canonical smoke/Website Editor and production build green;
- provider-free browser, accessibility and responsive acceptance green;
- semantics, metadata contracts, search/reference docs and Graphify regenerated
  from the frozen source and checked for drift/duplicates;
- migration inventory/order checked, with unapplied/live steps explicitly listed;
- human-only provider, credential, legal, recovery and live-environment gates
  reported honestly rather than silently treated as green.

Before and after promotion, verify local integration SHA, local `main`, upstream
`main` and `git ls-remote` all agree. Never force-push `main`; preserve the last
known-good SHA and rollback instructions.

## Current refs

- Frozen recovery: `checkpoint/full-build-20260912-112701` at `3abd629e`.
- Historical candidate: `checkpoint/integration/full-build-20260912` at
  `2439e1b5`. Independent SEC-006 review rejected this candidate P0 0/P1 5/P2
  1, so this ref is frozen and must not be promoted or advanced.
- Accepted-slice continuation:
  `checkpoint/integration/accepted-full-build-20260912` is independently
  verified at last accepted combined parent `43aa898d`. Advance it only with
  independently accepted route/login work after combined regression.
- Worker histories: ten refs under `checkpoint/workers/*`, including the
  independently checked route-inventory correction at exact remote SHA
  `e3d1df1c9917c4c84b93d348cbf29fcc26e55626`.
- Historical orchestration snapshot:
  `checkpoint/orchestration/full-build-20260912` at exact remote SHA
  `fce64ab005fd93d085ac6d708e8245cd2a0cb7da`. Independent documentation review
  rejected stale/conflicting instructions in that snapshot, so it must not be
  used as the active queue. The corrected external directory is canonical until
  a replacement documentation checkpoint is reviewed and published under a new
  immutable ref.
- GitHub repository authorised by Ed:
  `https://github.com/edstorm987/aquacrm.git`.
- `main` remains `d932ce665d9f6afaffa75ed7796a69b17ac7ee58` until the
  promotion gate passes.
