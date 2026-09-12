# Independent review inbox

The review worker may change only the Status, Result and Report cells here.
Codex supplies exact immutable SHAs and owns every QUEUE.md transition.

Statuses: `READY-FOR-REVIEW`, `ACTIVE`, `ACCEPTED`, `REJECTED`, `BLOCKED`, `IDLE`.

| Order | ID | Exact SHA | Status | Scope | Result | Report |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ABUSE-BASE-001 | `604dfe5e` | REJECTED | Durable limiter infrastructure: determine production backend selection, fail-closed behavior, privacy/cardinality/retention, atomicity and whether zero wired callers means infrastructure-only. | P0 0 / P1 1 / P2 0 | `reviews/ABUSE-BASE-001-604dfe5e.md` |
| 2 | SETTINGS-SCROLL-001 | `1cc13b2d` | READY-FOR-REVIEW | Authenticated desktop sticky rail/internal-pane scroll plus 320/390/768/1440, zoom, focus, overflow and persisted selection. | — | — |
| 3 | CHECKIN-UX-001 | `7bfe9ffc` | READY-FOR-REVIEW | Mounted authenticated 10-minute inactivity prompt: scope, snooze, keyboard/focus, unsaved input, route changes and return behavior. | — | — |
| 4 | SEC-006 | `2439e1b59a1442eed73b7d017098e42e2a0e2e40` | REJECTED | Third-pass DSAR ownership, typed projections, plugin/lazy-sidecar coverage, prepared-review-delivered fulfilment, rollback/replay and bounded linear work. Replay every prior rejection exploit; do not trust 18/18 alone. | P0 0 / P1 5 / P2 1 | `reviews/SEC-006-2439e1b5.md` |
| 5 | BRAND-ERASURE-001 | `f2573d24` | REJECTED | Part 1 already independently rejected P0 0/P1 6/P2 2; wait for a new exact correction SHA. | P0 0 / P1 6 / P2 2 | `EVIDENCE.md` |

Do not review `02a9b520`, `ecf91b21`, `60f08599`, `b5d2cc5d` or any moving
implementation branch as a release candidate; their superseding truth is already
recorded.
