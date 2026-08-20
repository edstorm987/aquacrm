# `scripts/smoke-worker-tooling.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Worker tooling — the primitives the whole parallel-worker plan rests on.  `fork-sandbox.mjs` and `worker-checkin.mjs` had ZERO coverage: a full green suite said nothing about either. That matters most for fork-sandbox, whose entire promise is "your server writes ONLY here; the shared sandbox is untouched" — invert one `copyFileSync` argument and the next worker to fork overwrites Ed's shared state at the exact moment the script promises it cannot happen, with the suite still reporting green.  Every case runs the REAL script as a child process against a throwaway temp root, so nothing here can reach the repo's own `.data/`.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

