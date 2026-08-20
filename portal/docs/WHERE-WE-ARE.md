# Where we are — an honest map of AquaCRM

Written 18 Aug 2026 after a full read-through of every area. Plain language, no
sugarcoating. The point of this doc is to turn "months of work and I don't know
what's left" into something finite you can work through one piece at a time.

## The big picture in five lines

1. **The core is real.** Enquiries, CRM, delivery, bookkeeping, the inbox, the
   monitoring engine — these are genuinely built and wired to real data, not
   fake screens. This is further along than "it's all chaos" feels.
2. **Most "half-done" is actually "switched off," not "broken."** Stripe, the
   social inbox, Google login, MFA — the code is there; it's waiting on
   credentials or a switch, not a rebuild. (One real exception: Stripe has no
   adapter at all — see Finance.)
3. **The real mess is duplication.** Several things exist twice. That's what
   makes it feel chaotic more than anything.
4. **The junk test data is making everything look worse than it is.** Clearing
   it will instantly calm the whole app down.
5. **You're pre-launch.** What's left is smaller than what you've built:
   tidy up, connect a few pipes, and run the first real person through.

## The scoreboard

| Area | Honest status |
| --- | --- |
| Journey (enquiries, CRM, leads) | **Solid** — most finished part |
| Master Inbox (alerts, actions, tasks) | **Solid** — trust it |
| Finance (bookkeeping) | **Solid for tracking money** — but can't *take* money |
| Command Centre / Radar / Advisor | **Real engine, starved of data** |
| Customer portal (connect + setup) | **Built this session, works** — 2 gaps to prod |
| Fulfilment / Products | **Well-built but badly tangled** — your instinct was right |
| Platform (auth, plugins) | **Solid foundations** |
| Platform (editing engine, commit path, MFA) | **Written, wired to nothing** |

---

## Area by area — what it is, and what needs doing

### Journey — enquiries, CRM, leads  ·  Solid
The most finished part of the app. Website enquiry capture, classifying an
enquiry into a lead/contact/person, the person + company model, the lead board,
and cold scouting are all real and wired to real backends.

**What needs doing**
- **Two Contacts systems exist.** The newer canonical one (`/portal/agency/contacts`)
  and an older CSV rolodex inside the leads-pipeline plugin. Both are live and
  linked. Pick one, retire the other. This is the main confusion here.
- Heads-up: `/portal/agency/people` is your **staff/HR** screen, not CRM — easy
  to confuse because the CRM people live under "contacts."
- Delete a dead placeholder board (`leads-pipeline/.../LeadsBoardPage.tsx`).
- Fix a crash: `pipelines/[slug]/page.tsx:44` (see crash bugs below).

### Master Inbox — alerts, actions, tasks  ·  Solid
Genuinely strong. ~40 kinds of alert, all derived from your real records.
Actions and the inbox share one queue (park in one, it sticks in the other).
Deferral tracking, task templates + checklists, and the "how does this clear"
logic are all real and honest. **Don't rebuild any of this.**

**What needs doing**
- **The social (Instagram/Facebook) inbox is switched off** — the whole pipeline
  is built, but there are no Meta credentials, so it receives zero messages.
  Either plug in a Meta app + the 4 env vars + a public webhook, or hide the tab
  until you're ready.
- Inbound email/WhatsApp/SMS don't feed the inbox yet (replies go out, nothing
  comes in through them). The Channels tab is honest about this.
- One copy mismatch: the inbox "needs attention" rows all say "clears
  automatically" and show a Resolve button, even for judgement calls that don't
  clear on their own. The correct logic exists elsewhere; the inbox list just
  needs to use it.
- Delete dead `NotificationBell.tsx`.

### Finance — bookkeeping  ·  Solid for tracking, can't take money
Real invoicing (numbered, printable, branded), expenses, budgets, payment plans,
contracts, a payments ledger, and an honest MRR strip (only counts money
actually paid). As a bookkeeping engine it's real.

**What needs doing — the big one**
- **You cannot actually collect money anywhere.** There's no Stripe, no live
  payment links (the "payment link" is a text box you paste a URL into), and no
  real e-signature (accepting a contract just flips its status). Money is
  *tracked*, never *taken*. Unlike the other "switched off" items, this one has
  **no adapter to configure** — it needs building when you want real payments.
- "Download invoice" saves an `.html` file, not a PDF (browser print-to-PDF
  works; the label oversells it).
- Stray old "Milesymedia" branding baked into the invoice template.
- A duplicate copy of the finance module lives in `github-templates/` — not used
  by the app, safe to delete once confirmed.

### Command Centre / Radar / Advisor  ·  Real engine, starved of data
This surprised me: it's not smoke. Radar runs on your real data (no fake
numbers), the "synthetic probes" are real uptime/website monitoring, and the AI
Advisor genuinely calls OpenAI (your key is set).

The catch: the headline "3,090 checks" is ~171 real signals viewed through 12
analytical lenses each. Because you're pre-launch with no history, most of those
lenses can't resolve yet — only ~216 actually lit up. Crucially the system is
**honest** about it: unknowns show as visible "blind spots," never fake green.
So it's a real engine correctly saying "I can't see enough yet," not a broken one.

**What needs doing**
- Fix a crash: `agency/page.tsx:62` (see crash bugs below).
- 2-minute check: confirm the AI model name it's set to actually works with your
  key — if not, every Advisor call silently falls back to non-AI and you'd never
  know.
- It mostly comes alive on its own once you have real clients + live website
  telemetry + a few weeks of history. Not a build problem — a data problem.
- Cosmetic naming drift ("Milesymedia" / "AquaOasis-Web" / "Aqua Advisor").

### Customer portal — connect + setup  ·  Built this session, works
The client-software connection flow, the customer first-run setup (welcome +
your VSL video → choose password → add-to-home-screen), and the agency-side
connection management (create/copy/reset/delete/disconnect + usage) are all
built, tested (1,390 tests pass), and walked in a browser.

**What needs doing**
- **The connect flow can't finish in production yet** — the email confirmation
  code is a dev stand-in (`00000`). Needs real emailed codes before real
  customers use it.
- The "usage / last seen" health and the Radar freshness for connections wait on
  the **Aqua Tag heartbeat**, which isn't built. (Has a design question first:
  how the tag knows which connection it is.)
- "Add to home screen" works everywhere via instructions; the one-tap install
  button needs a service worker (deliberately not added — caching risk).
- One stray test user got created in **live Supabase** during testing
  (`dev-customer-…@bare-co.test`) — safe to delete, just needs your say-so.

### Fulfilment / Products  ·  Well-built but badly tangled
The delivery machinery is real and good — service assignment, the product
operating plan (the best-built thing in this area), delivery overview, SOPs. But
your instinct about the products was exactly right.

**What needs doing — your call to cut back**
- **The product sprawl is real.** 11 hardcoded product templates + 16
  hand-written "bespoke" modules built for your own throwaway test products,
  spread across ~5 parallel files. Your store holds 38 product records. Cutting
  to "just the standard one" means untangling those lists, not deleting one file
  — but it's very doable, and I'll do it one careful step at a time.
- One gotcha: bespoke content is matched by product **name**, so renaming a
  product silently loses its content. Good reason to simplify.
- **Two fulfilment systems** exist, told apart only by British vs American
  spelling (`/fulfilment` route vs a `/fulfillment` plugin). Pick one; the
  plugin is the strongest deletion candidate.
- Every new agency auto-seeds all 11 products — that should become just the one.
- Some dead code to bin (`defaultProductPipelineStage`, a legacy columns table),
  and a stale "therapistName" field from an older build.

### Platform — the foundations  ·  Solid
Session auth (signed cookies, role + tenant checks) and the plugin/module system
are genuinely solid and load-bearing. Trust these.

### Platform — the unfinished half  ·  Written, wired to nothing
This is the "no idea what state it's in" bucket, now clarified:
- **The "one editing engine" is connected to nothing.** ~800 lines of engine +
  adapters with zero callers; the real editors still save directly (last-write-
  wins, no conflict detection). The earlier claim that editors were "migrated
  onto it" isn't true in the actual wiring.
- **Editing leases + the live-edit overlay are fully dead** — mounted in no page.
- **The commit path / repo "Save"** is careful, tested code with no Save button
  and no callers — never run against a real repo.
- **MFA** is a complete build (logic + routes + screen) that nothing calls, and
  needs a Supabase toggle too.
- A redundant read-only code editor duplicates the newer Repo tab — delete after
  unlinking it.

Keep the engine/commit-path code (it's the intended future), just know nothing
runs it today.

---

## The things that cut across everything

These are the real sources of the "chaos" feeling:

1. **Duplication — several things exist twice.** Contacts (×2), Fulfilment (×2),
   a spare finance module copy, a redundant code editor. Deciding which one wins
   in each case will remove most of the confusion.
2. **Junk test data everywhere.** Client records `ddddd`, `defhjesuifhesif`, and
   one containing a slur; 8 test people; 38 product records; a stray Supabase
   user. None of it is real. It pollutes every screen, the inbox, and Radar.
   Clearing it is low-risk now and will make the app *feel* finished.
3. **Two live crash bugs** — `agency/page.tsx:62` and `pipelines/[slug]/page.tsx:44`
   both do `getAgency(...)!` with no null check. Same bug already hit once this
   session. Tiny fixes.
4. **"Off switches," not missing builds** — Meta inbox, Google login/calendar,
   MFA all need credentials or a toggle. Stripe is the exception: it needs
   actual building.
5. **Everything is uncommitted.** Months of work sits in the working tree with
   nothing pushed. One bad `git` command from gone. Worth a first commit soon to
   lock it in (your call — nothing gets committed without you asking).

---

## Progress — 18 Aug 2026 (afternoon)

Done in this pass:
- ✅ **Both crash bugs fixed** (`agency/page.tsx`, `pipelines/[slug]/page.tsx`)
  now redirect to login instead of crashing when the agency is missing.
- ✅ **Standard portal cut to one product: Website.** New agencies seed just
  the Website product; the other 10 catalogue templates stay available to add
  later, one at a time. (Existing test tenant not auto-reduced — see below.)
- ✅ **The four phases renamed and de-duplicated** to Onboarding → Design →
  Develop → Published. They were hardcoded in five different files with five
  different spellings; now there is one shared source of truth
  (`PORTAL_PHASE_LABELS` in `portalProducts.ts`) every screen reads from.
- 1,390 tests pass, typecheck clean.

### Cleanup pass — data (18 Aug, later)
- ✅ Archived the 26 extra products (Website is the only live one).
- ✅ Archived the 3 junk clients (`ddddd`, `defhjesuifhesif`, the slur one) —
  gone from every list and picker.
- ✅ Created one clean test client, **Northlight Studio**, on the Website
  product, to have a tidy standard portal to look at.
- ✅ Renamed the 4 slur person records; scrubbed the slur from the local state
  file (70 → 0 occurrences). Backup at
  `scratchpad/portal-state-before-scrub.json`.

**Still open — lives in LIVE Supabase, not local (needs Ed's ok):**
- `brand_enquiries` holds 35 enquiries; **33 are test junk, most with the
  slur** ("nigga one" ×12, "nigggaaaa" ×6, etc.). These are what still throw
  the "Classify enquiry from…" alerts on the dashboard. Website enquiries read
  from Supabase, so scrubbing/deleting them is a live-data operation — not done
  without a yes.
- The stray `dev-customer-…@bare-co.test` user in Supabase Auth (from earlier)
  is still there too.

## Where I'd start (cheap wins that calm everything down)

Roughly in order, each small and low-risk:

1. **Clear the junk test data** — the app stops screaming about `ddddd` and
   starts looking like a real product.
2. **Fix the two crash bugs** — remove the landmines.
3. **Cut the portal products back to the standard one** — your call, done safely
   (hide, don't delete), then rebuild the others one at a time.
4. **Pick a winner for each duplicate** (contacts, fulfilment) and retire the
   other.
5. **Decide the "off switches" that matter for launch** — probably real payments
   (Stripe) and the connect-flow email codes. Meta/MFA can wait.
6. **A first git commit** to lock in the work, when you're ready.

Everything past that is building out one thing at a time — which is exactly the
pace you asked for.
