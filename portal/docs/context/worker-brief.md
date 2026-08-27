# Worker brief — spin a development worker

← [context/](README.md)

The commander fills this in per assignment; Ed pastes it into a fresh Claude chat
to spin a worker on one plan. `<PLAN>` = the plan file (e.g.
`docs/development/plans/enquiry-detail-card.md`).

## The paste-ready template
```
You're a development worker on AquaCRM (Next.js 16 / React 19 / TypeScript),
working dir: aquaCRM/portal/

ORIENT (read in this order):
1. docs/development.md — the project law (map, discipline, workflow).
2. <PLAN> — YOUR plan. This is your whole job. Build its phases, simple-first.
3. docs/context/worker-brief.md (this file's "Conventions" below) — how workers behave.
4. docs/context/state.md — confirm your assignment + the files you own (don't touch files another
   worker owns). Trust its "Verified ground truth" table; treat its "🗄 HISTORICAL" sections as
   dated belief, not fact — re-read the source before acting on any 🔴 you find there.
5. docs/development/checklist.md — the most reliable current summary of where the project stands.

YOUR JOB: execute <PLAN>'s phases in order, simple-first. Don't re-design the plan;
if it needs a decision Ed hasn't made (the plan flags them), surface it — don't guess.

HARD RULES:
- Reuse before building — the plan names what already exists to reuse. Check
  docs/reference/ (eight consolidated source/symbol volumes) before adding anything new.
- Run the FULL suite before calling a phase done:
  PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
  Extend the nearest test with your new BEHAVIOUR (not just a source-shape assertion).
- A passing test ≠ working — BROWSER-VERIFY YOUR OWN UI. **You now get a FULLY ISOLATED sandbox, so
  self-verifying can no longer clobber anyone** (fixed 2026-08-19 — this is why older docs told you not to):
  1. **Fork your own sandbox** (once, at the start):
     `npm run sandbox:fork -- <your-worker-name> <port>`   e.g. `npm run sandbox:fork -- alpha 3041`
     It copies the shared state to `.data/portal-state.<name>.json` (so you get REAL seeded data, not an
     empty tenant) and prints your exact run command. It never writes the shared sandbox.
  2. **Run YOUR server** with the printed command:
     `PORTAL_DATA_FILE=.data/portal-state.<name>.json NEXT_DIST_DIR=.next-<name> npm run dev:worker -- -p <port>`
     Own state file · own build dir · own port → cannot collide with the Commander or another worker.
     (Pick a port no one else is using: 3041, 3042, 3043… ask the Commander if unsure.)
  3. **Sign in with NO login** — go to `http://localhost:<port>/dev`: it mints an owner session instantly.
     Append `?client=<slug>` for a client view, or use the **Dev Console** (`/portal/dev-team`)
     → **Tools → Inspector** (`/portal/dev-team/tools?view=inspector`) to become owner / staff /
     customer / freelancer. (Corrected 2026-08-20: "Profiles" was RENAMED to **Inspector** — it
     collided with client/customer/user profiles — and it now lives as a `?view=` of Tools, not as
     its own sidebar item. `/portal/dev-team/inspector` still redirects there.)
     ⚠ Entering the Dev Console is plain navigation and does NOT change who you are. Identity
     changes ONLY via Inspector, and exiting an inspection restores the exact person who started it.
  4. **Drive it** — read_page / computer (click+type) / screenshot to actually exercise your change;
     read_console_messages + preview_logs for errors. Screenshot the working result as proof and record the
     honest level in docs/development/status.md.
  - **Browser-tool gotchas** (save yourself the confusion): your session's browser tools only reach a server
    **you** started — you cannot drive another chat's. If `read_page` returns an empty tree / `Viewport: 0x0`,
    the tab is wedged: open a fresh one (`tabs_create` → `navigate`) instead of fighting it. Click via `ref_N`
    from `read_page`, not raw coordinates (screenshots are scaled). During a heavy recompile you may see
    transient `ERR_CONNECTION_REFUSED` / incomplete-chunk errors — settle, then retry before believing them.
  - **When you finish:** stop your server and delete `.data/portal-state.<name>.json` + `.next-<name>`.
    Next may append two `.next-<name>/types` lines to `tsconfig.json` — harmless; revert them if you like.
- Live Supabase is NOT sandboxed — the admin client hits real data even in dev. Don't write junk.
- Do NOT touch files another worker owns (see state.md). Don't edit shared foundations
  without flagging it to the commander.
- ⛔ **NEVER TOUCH GIT.** Not `commit`, not `push`, not `checkout`, not `restore`. A push triggers
  Vercel → **production**. And the whole tree is uncommitted, so `git checkout <file>` deletes other
  workers' unshipped work — this has actually happened. Rollback = copy the file to the scratchpad
  first, restore with `cp`.

AFTER EACH SHIPPED PHASE (this is the report — nothing lives only in chat):
- Update the relevant chapter in docs/workspace/ if behaviour changed.
- Regenerate the reference if code changed: node scripts/generate-symbol-reference.mjs
  (+ the radar-rules one if you touched the catalogue).
- Tick the item in docs/development/todo.md; add a dated entry at the TOP of
  docs/development/updates.md (stable anchor, don't rewrite others' entries).
- Say: what shipped, tests (pass/fail count), docs updated, what's next / any blocker.

Confirm you've read <PLAN> and outline Phase 1 before writing code.
```

## Check in so Ed can see you (30 seconds, do it)
Ed watches a **live board** at `/portal/dev-team/roadmap?view=now` (corrected 2026-08-20 — the old
`/portal/dev-team/working` route is now a redirect stub to it). Make yourself visible:

```
npm run worker:checkin -- <your-name> "<what you're doing>" --plan <plan-slug> --phase "<phase>"
```

Run it **when you start, after each shipped phase, and when you finish or block** (e.g.
`npm run worker:checkin -- alpha "P2 shipped, suite green — starting P3" --plan enquiry-detail-card --phase P3`).
It writes `.data/workers/<name>.json` (local only) and shows on Ed's board within ~10s.

The board also shows **raw file activity**, so you're visible either way — but a check-in is what turns
"something changed in `src/app/portal`" into "alpha is on phase 2 of the enquiry card, suite green."

## Conventions (the worker contract)
- **One plan, staged.** Build your plan's phases in order; ship + verify each before the next.
- **Own your files.** state.md lists the files/areas you own. Stay in them. Need a shared file? Flag the commander.
- **Docs are part of "done."** A phase isn't done until the tests pass *and* the docs reflect it (chapter, reference, todo tick, updates.md entry). This is how the next chat knows what happened.
- **Honest status — and self-verify now.** Green tests prove shape, not that it works. You can now browser-verify your OWN UI: **`npm run sandbox:fork -- <name> <port>`** (NOT bare `dev:verify` — that shares the sandbox state file with everyone else) → open `<your-server>/dev` (signs you in with **no credentials**) → drive the browser tools → screenshot the proof. Do that before calling a UI phase done — don't just defer it to the Commander. Record the real level in status.md; only say "not browser-verified" if the server was genuinely unreachable/too busy.
- **Surface, don't guess.** A decision the plan flags for Ed → surface it to the commander/Ed, don't invent an answer.
- **Never touch git.** Ever. See the hard rule above — this is not "ask Ed first", it is "don't".

## What the commander fills in per assignment
- `<PLAN>` path.
- Any files/areas this worker **owns** (and any it must **avoid** because another worker owns them).
- Any specific phase to start on (if not Phase 1) or scope limit.
- Any decision already made since the plan was written.
