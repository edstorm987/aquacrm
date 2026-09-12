# Codex status

## 2026-09-12 current checkpoint

This file is current routing truth only. Historical attempts and detailed gate
evidence live in `EVIDENCE.md` and `reviews/`.

### Git preservation

- Immutable recovery checkpoint: `checkpoint/full-build-20260912-112701` at
  `3abd629ec87d43e4d5138af9204060df73e92bbc`.
- Last accepted combined parent and accepted-only remote line:
  `checkpoint/integration/accepted-full-build-20260912` at
  `43aa898d541fc9174089e54e3a9dab60de42c4f8`.
- Rejected historical candidate: `checkpoint/integration/full-build-20260912`
  is frozen at `2439e1b59a1442eed73b7d017098e42e2a0e2e40` because SEC-006 failed
  independent acceptance. Never advance or promote it.
- Ten scanned worker histories and the independently accepted route-inventory
  worker `e3d1df1c` are remotely preserved. A verified 45 MB all-refs bundle is
  an additional local copy.
- The first orchestration snapshot is preserved at `fce64ab0`, but its
  documentation review rejected stale contradictions. It is historical evidence;
  the external coordination directory remains canonical until a corrected
  replacement is reviewed.
- Remote `main` is independently confirmed unchanged at
  `d932ce665d9f6afaffa75ed7796a69b17ac7ee58`.

### Active isolated lanes

- `SEC-006-PASS4` — exact correction `59520ecd15b041a4afde6b88cb945ed789561026`
  is under fresh independent hostile acceptance. Implementer evidence is focused
  24/24, adjacent 146/146, TypeScript/diff green. Do not integrate yet.
- `LOGIN-CONTEXT-001` — correction is active after candidate `d8dd30bb` was
  rejected P0 0/P1 2/P2 2 for global skip focus and lost client/tenant recovery
  and OAuth context. The accepted isolated visual/contrast work remains valid;
  the combined candidate does not.
- `BRAND-ERASURE-001` — Claude Worker A correction remains active after part 1
  `f2573d24` was rejected P0 0/P1 6/P2 2. No migration is applied.
- `SETTINGS-SCROLL-001` — source layout appears correct, but `1cc13b2d` is
  rejected P2 for a false browser-evidence comment and needs a narrow evidence
  correction/re-review.

### Accepted local slices awaiting safe integration or release gates

- Core SEC-001/002/003/004/005/007 and the abuse/auth/public-plugin hardening
  rows marked `DONE` in `QUEUE.md` have independent local evidence. They are not
  deployed and do not prove provider/live readiness.
- Plugin lineage is accepted at `a437a605` and reconciled in accepted parent
  `43aa898d` with focused combined gates green.
- Route inventory is accepted at `e3d1df1c` and remotely preserved; it is not yet
  on the accepted-only combined line.
- Login visual/accessibility correction is accepted in isolation through
  `d8042433`; broader context integration remains active as above.
- Check-in logic is accepted at `7bfe9ffc` P0/P1/P2 none attributable; real
  authenticated usability remains a final human gate.

### Release truth

- `main` cannot move yet: active P1 work remains, the accepted combined parent
  has known SEC TypeScript drift, and the full combined build/browser/performance/
  docs/Graphify/migration/recovery gates have not run on a frozen accepted SHA.
- Ed authorises scanned checkpoints to
  `https://github.com/edstorm987/aquacrm.git` and eventual non-force `main`
  promotion only after `GITHUB-CHECKPOINT-POLICY.md` passes.
- Railway, Supabase cloud, DNS, providers, credentials, production data,
  email/SMS/payments, deployment and migration apply remain prohibited without a
  separate exact authorisation. No launch/production-readiness claim is made.
