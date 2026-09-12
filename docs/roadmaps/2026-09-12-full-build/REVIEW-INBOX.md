# Independent review inbox

The review worker may change only the Status, Result and Report cells here.
Codex supplies exact immutable SHAs and owns every QUEUE.md transition.

Statuses: `READY-FOR-REVIEW`, `ACTIVE`, `ACCEPTED`, `REJECTED`, `BLOCKED`, `IDLE`.

| Order | ID | Exact SHA | Status | Scope | Result | Report |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ABUSE-BASE-001 | `604dfe5e` | REJECTED | Durable limiter infrastructure: determine production backend selection, fail-closed behavior, privacy/cardinality/retention, atomicity and whether zero wired callers means infrastructure-only. | P0 0 / P1 1 / P2 0 | `reviews/ABUSE-BASE-001-604dfe5e.md` |
| 2 | SETTINGS-SCROLL-001 | `1cc13b2d` | REJECTED | Authenticated desktop sticky rail/internal-pane scroll plus 320/390/768/1440, zoom, focus, overflow and persisted selection. | P0 0 / P1 0 / P2 1 | `reviews/SETTINGS-SCROLL-001-1cc13b2d.md` |
| 3 | CHECKIN-UX-001 | `7bfe9ffc` | ACCEPTED | Mounted authenticated 10-minute inactivity prompt: scope, snooze, keyboard/focus, unsaved input, route changes and return behavior. | P0 0 / P1 0 / P2 0 | `reviews/CHECKIN-UX-001-7bfe9ffc.md` |
| 4 | SEC-006 | `2439e1b59a1442eed73b7d017098e42e2a0e2e40` | REJECTED | Third-pass DSAR ownership, typed projections, plugin/lazy-sidecar coverage, prepared-review-delivered fulfilment, rollback/replay and bounded linear work. Replay every prior rejection exploit; do not trust 18/18 alone. | P0 0 / P1 5 / P2 1 | `reviews/SEC-006-2439e1b5.md` |
| 5 | BRAND-ERASURE-001 | `f2573d24` | REJECTED | Part 1 already independently rejected P0 0/P1 6/P2 2; wait for a new exact correction SHA. | P0 0 / P1 6 / P2 2 | `EVIDENCE.md` |
| 6 | LOGIN-ROUTE-INTEGRATION-001 | `d8dd30bbdddf47b7d9ecf7a1fdfb683faecf9cf8` | REJECTED | Fresh accepted-base integration of route inventory plus the accepted login/contrast chain. Verify exact ancestry/delta, conflict resolution, client/tenant binding, auth/CAPTCHA/OAuth/MFA, responsive/focus/a11y/browser behavior and route classification. Separate known SEC TypeScript drift in base `43aa898d`. | P0 0 / P1 2 / P2 2 | `reviews/LOGIN-ROUTE-INTEGRATION-001-d8dd30bb.md` |
| 7 | SEC-006-PASS4 | `59520ecd15b041a4afde6b88cb945ed789561026` | ACTIVE | Replay every pass-3 exploit against canonical phone ownership, nested typed claims, unsafe references, request-field completeness, exact delivery replay, tenant-local/full work bounds and signed CSRF. Treat accepted route pin separately. | — | — |
| 8 | ORCHESTRATION-DOCS-001 | `fce64ab005fd93d085ac6d708e8245cd2a0cb7da` | REJECTED | Documentation safety/truth only: Git authority, active integration SHA, worker ownership, status freshness, canonical-vs-snapshot semantics, feature map, public plugin status, prompt size and private data. | P0 0 / P1 6 / P2 3 | `reviews/ORCHESTRATION-DOCS-001-fce64ab0.md` |

Do not review `02a9b520`, `ecf91b21`, `60f08599`, `b5d2cc5d` or any moving
implementation branch as a release candidate; their superseding truth is already
recorded.
