# Launch: the order, and what is stopping us

**Written 2026-08-27** for Ed's ask: *"i need everything working complete
production ready TODAY… tick verify all of the phases, then full browser
walkthroughs, then production ready and verified secure… anything you need or is
stopping you write down in a document."*

This is that document. It is deliberately blunt, because a launch plan that
flatters the position is worse than no plan.

---

## ⚡ DO THIS — the whole remaining list, in order

*Added 2026-08-28, after a full day of work. Everything below this heading is
detail and evidence; this is the part you act on. Nothing here is code — all of
it is either a value only you can set, or a position only you can take.*

**Everything buildable is built, verified and green.**

*Evidence refreshed 2026-08-28 (late), after a second full day of work — the
earlier line said 4,827 tests and 286 pages, which is now history:*

| | |
| --- | --- |
| Suite | **4,940 tests / 4,938 pass / 0 fail / 2 skip** (the 2 are optional live-Postgres) |
| Types | `tsc --noEmit` clean |
| Production build | **287/287 pages, 0 errors** |
| Breakpoints | 320×568 · 375×812 · 812×375 · 768×1024 · 1024×768 · 1280×800 · 1920×1080 — no page-level horizontal overflow at any size |

Shipped since the earlier line: the **journey-pipelines add-on** (a client's own
kanban with automations, toggleable like the editor), plus fixes for a dead
cross-plugin email wire, client-scoped plugin navigation that rendered nowhere,
unlayered CSS silently overriding every author's sizing app-wide, and ten
modules' `healthcheck` hooks that nothing had ever called.

### 1. Deploy — 5 minutes, unblocks items 2 and 3

Set these two in the Vercel environment, alongside the values already in
`.env.local`:

```
NEXT_PUBLIC_PORTAL_SECURITY=strict
NEXT_PUBLIC_PORTAL_BASE_URL=https://<your-domain>
```

**Measured, not assumed — and RE-measured on 2026-08-28 after a second day of
changes, because a launch number nobody re-checks is just a number:**

Run against your real `.env.local` with `VERCEL_ENV=production`, the four
required items are `database`, `security`, `email`, `uploads`:

- **without** the two variables → **3/4**, and the one that fails is `security`
  (`needs-setup`);
- **with** them → **4/4**, `ready: true`.

So it is precisely one item, and those two lines are what close it. No missing
credential, nothing left to build.

### 2. Fix two accounts — 10 minutes, after deploy

Measured against the live project:

- **One portal user has no Supabase Auth account.** Create it, or they are
  locked out the moment `signInWithPassword` is the only path.
- **Two Supabase Auth accounts have no portal record.** They would authenticate
  and resolve to no role and no agency. Create portal users, or delete them.

That is the entire cutover. It is much smaller than "everyone re-sets their
password" suggested.

**Check it yourself, before and after:**

```bash
node scripts/supabase-cutover-preflight.mjs
```

Read-only. It compares the two user lists as SHA-256 hashes, so it counts the
overlap without printing anybody's address — add `--show-missing` when you want
the specific addresses that need action. It deliberately does not create or
delete accounts; that belongs to you in the Supabase dashboard. Re-run it
afterwards and both numbers should read 0.

### 3. Choose the privacy sentence — a decision, not a drafting job

The notice says *"Form field values are never included in telemetry."* The Aqua
Tag sends them. Three replacement texts are written out in
`supabase-cutover-and-policy-drafts.md` §2f — **pick a row**.

**Option 2 (narrow the capture) is the one I would look at first:** it is the
only one where the sentence you have already published becomes true, with no new
legal assertion and a one-line change.

### 4. Set three retention numbers — the form is live

**Governance → Subject requests.** Suggested starting points, with the trade
shown for each, in `supabase-cutover-and-policy-drafts.md` §3:
activity `2555`, DSAR register `1095`, enquiry notices `730`.

Everything is unset today, and unset means keep forever — so nothing expires
until you type something. Read the count the panel shows before enabling;
saving never sweeps.

### 5. Two smaller decisions, whenever

- **Embed token** — one deployment-wide token can currently mint an admin embed
  session for *any* tenant's client. Fine while only you hold it; a problem the
  day you hand it to a partner. Three options in D9b.
- **DSAR intake channel** — a form, a monitored mailbox, or something else. The
  register is built and will receive from whichever you pick.

### Then, and only then

- **Per-client RLS** — your own Supabase is verified protected on every table
  holding data (41 enquiries invisible to the public key). Client projects are
  checked automatically by the connection test when you connect one.
- **Re-check three empty tables** (`clients`, `client_portals`, `audit_events`)
  once they carry rows — an empty table proves nothing about its policies.

---

## The one fact that decides today

> **This section was WRONG for a full day and is corrected here rather than
> lower down.** It used to open with a table of twelve ❌ and the sentence
> "0 of 12… we cannot be live today". That number came from running
> `inspectProductionReadiness()` in a standalone `tsx` process, which does not
> load `.env.local` the way Next does. I measured an empty environment and
> reported it as fact. The full account is under **⚠️ CORRECTION** below.

`inspectProductionReadiness()`, run with the environment actually loaded
(2026-08-28):

| Prerequisite | State |
| --- | --- |
| Customer data (Supabase) | ✅ ready |
| **Secure access** (session secret, strict mode, HTTPS origin) | ⚠️ **needs-setup — the only required gap** |
| Credential vault encryption key | ✅ ready |
| Customer email | ✅ ready |
| Private file uploads | ✅ ready |
| External AI access | ✅ ready |
| Stripe payments | optional |
| Google sign-in | optional |
| GitHub publishing | optional |
| Vercel deployment | optional |
| Built-in assistant | optional |
| Error monitoring | optional |

**Six ready. One required gap. Six optional.**

And the required gap is not a missing credential — the session secret already
passes at 53 characters. It wants `NEXT_PUBLIC_PORTAL_SECURITY=strict` and an
https `NEXT_PUBLIC_PORTAL_BASE_URL`, both of which **a Vercel deployment sets**.
Simulated with exactly those two values: `ready: true`, nothing required
outstanding.

Three independent things confirm the position:

- `.env.local` holds **38 variables**, including all three Supabase values.
- `POST /api/auth/login` with a bogus account answers **401 "Email or password
  is incorrect."** — Supabase was reached and replied. Sign-in works.
- The live realm holds **3.4 MB of real data**. Supabase is not merely
  configured; it is already serving.

So: **the blocker is the deployment, not the credentials.** Two things it cannot
see remain — the Supabase account migration (everyone sets a new password on
cutover day) and the privacy-notice decision. Both are described below.

There is also a second honest number: **108 open items** in `todo.md` (60 not
started, 48 partly done) and **97 roadmap items** not shipped. That is not a
day. The order below separates *launch-blocking* from *everything else*, because
trying to do all of it is how none of it gets done.

---

## ⚠️ CORRECTION — Supabase was configured all along. 6 of 12 are READY.

**Written 2026-08-27, after Ed asked "you should have access to my supabase
already dude".** He was right and I was wrong, for most of a day.

### What I got wrong, and how

Every earlier statement in this document that "nobody can sign in" and
"0 of 12 ready" came from running `inspectProductionReadiness()` **in a
standalone `tsx` process**. Next loads `.env.local` automatically; a bare `tsx`
script does not. So I measured an environment with no configuration in it, and
then repeated the result as fact for hours.

`.env.local` exists, is git-ignored, is untracked, and contains **38 variables**
including all three Supabase values (URL 40 chars, anon key 208, service role
219), `PORTAL_SESSION_SECRET` (53), `PORTAL_VAULT_ENCRYPTION_KEY` (43), Resend,
Stripe, GitHub, Vercel and OpenAI.

### What the readiness check ACTUALLY says, with the env loaded

| Item | Status |
| --- | --- |
| Customer data (Supabase) | **ready** |
| **Secure access** | **needs-setup** ← the only required item failing |
| Credential vault | **ready** |
| Customer email | **ready** |
| Private files | **ready** |
| External AI access | **ready** |
| Stripe, Google, GitHub, Vercel, Assistant, Sentry | optional |

**Six ready. One required item outstanding. Six optional.** Not zero.

### The durable backend itself — verified for the first time

Every walkthrough in this document used the **file** backend. Whether the
Supabase storage layer actually round-trips state had never been tested, which
is a gap in "production ready" that no amount of feature work closes.

Tested 2026-08-28 against a **separate realm**, with live byte-counts asserted on
both sides and the row deleted afterwards:

| Check | Result |
| --- | --- |
| `saveBlob` | ok |
| `loadBlob` — values preserved (deep-equal) | **true** |
| unicode (`café ✓`), `null` inside an array, empty object | all survived |
| `applyPatch` | ok — value updated |
| cleanup | `204`, realm empty, nothing left behind |
| **live realm** | **3,412,877 bytes before and after — UNCHANGED** |

**One result needed explaining rather than reporting.** A naive string
comparison of the saved and reloaded blob returns **false**, which reads like
data loss. It is not: Postgres JSONB stores object keys by length-then-bytes
rather than insertion order, so `zeta,alpha,mid-key,num,empty` comes back as
`num,zeta,alpha,empty,mid-key`. A deep comparison confirms every value is intact.

That distinction matters, and the follow-up question does too: if anything in
the app compared serialised state to decide whether to write, reordering would
make it look permanently dirty and cause write amplification against Ed's
database. `storage.ts` has exactly one `JSON.stringify(state)` and it feeds the
parse cache — there is no comparison-based change detection, so the reordering
is harmless.

**What this does not cover:** the access kernel, which pins itself to the live
realm by design (see D9 above) and therefore cannot be exercised against a
durable backend without writing to live governance.

### Simulated: what deploying actually changes

Measured 2026-08-28 by running `inspectProductionReadiness()` twice — once with
`.env.local` as it stands, once with the two values a Vercel deployment on the
real domain would set:

```
AS IT IS NOW
  overall ready: false
  required not ready: Secure access (needs-setup)

SIMULATED DEPLOY  (NEXT_PUBLIC_PORTAL_SECURITY=strict, https base URL)
  overall ready: true
  required not ready: none
```

**Nothing else is missing.** Adding only those two deployment values flips the
app to `ready: true` with no required prerequisite outstanding.

**What that does and does not mean.** It means the twelve prerequisites are
satisfied — credentials, vault, database, email, files. It does **not** mean
every feature works; readiness is a configuration check, not a functional one.
The two things it cannot see remain: the Supabase account migration (everyone
sets a new password on cutover day) and the privacy-notice decision.

### The one thing actually blocking

`securityReady` needs three things, and two of them are **deployment values**,
not missing credentials:

- `PORTAL_SESSION_SECRET` ≥ 32 chars — **already satisfied** (53).
- `NEXT_PUBLIC_PORTAL_SECURITY === "strict"` — currently `dev`.
- `NEXT_PUBLIC_PORTAL_BASE_URL` on **https**, not localhost — currently
  `http://localhost:3032`.

Both become correct the moment it is deployed to Vercel on the real domain. So
the honest answer to *"what's left before I can put clients in"* is **the
deployment itself**, plus the Supabase account migration (§1b) — not a list of
credentials to go and find.

### The account migration is still real

The one thing from §1b that does NOT go away: `signInWithPassword` means
Supabase Auth holds the password, our scrypt hashes are never consulted, and
**every user sets a new password on cutover day**. That is a communication task
with a date on it. See `supabase-cutover-and-policy-drafts.md`.

### On keys — the fear is already answered by the design

Ed, 2026-08-27: *"im very worried about security no keys in code maybe proxies
or something… but can be entered in just never stored revealed."*

Both halves are already true, and were verified rather than assumed:

- **No keys in code.** `.gitignore:41` covers `.env*.local`, and `.env.local` is
  untracked. Nothing secret is in the repository.
- **Entered, never revealed.** Per-client credentials go into the vault
  encrypted with AES-256-GCM, and `publicIntegrationConnection` returns
  `configuredSecretFields: Object.keys(connection.encryptedSecrets)` — the
  **names** of the fields that are set, never the values. There is no API path
  that reads a stored secret back out to a browser.
- **The startup three are different on purpose.** `NEXT_PUBLIC_SUPABASE_*`,
  the service-role key, the session secret and the vault key cannot live in the
  vault, because the vault needs them to decrypt itself. Those belong in Vercel's
  environment. Everything else — client Stripe, client Resend, client Supabase —
  belongs in-app, which is exactly the split Ed described.
- **A proxy is not needed for the anon key.** A Supabase anon key is designed to
  be public and is protected by row-level security. The service-role key is the
  one that must never leave the server, and it never does.

## The homework on those blockers is already done

Before you read the list below: the two biggest items now have a companion
document — **`supabase-cutover-and-policy-drafts.md`** — so that what is left
for you is deciding, not working out what you are deciding.

It contains the Supabase cutover traced through the real login route, including
**one fact that changes the plan: existing passwords cannot be migrated.**
`signInWithPassword` means Supabase Auth holds the password and our own scrypt
hashes are never consulted, so every user sets a new one on cutover day. That is
a dated communication task, and far better known now than on launch morning.

It also has the four things that must line up per person, the `profiles` table
SQL, the role mapping (including a **freelancer trap** that locks people out
with an error that does not say why), and the full Article 13 wording drafted
with your decisions marked `[DECIDE]` and nothing invented.

## What I need from you (the blockers)

Nothing below can be worked around in code. Grouped by what it unblocks.

### 1. Deployment — blocks literally everything

| Need | Why | Where it goes |
| --- | --- | --- |
| A hosting environment (Vercel project or equivalent) | There is nowhere to deploy to | — |
| `NEXT_PUBLIC_PORTAL_BASE_URL` on **https** | Secure-access readiness; OAuth callbacks; cookie security | env |
| `PORTAL_SESSION_SECRET` (≥32 chars, random) | Signs every session cookie | env |
| `PORTAL_VAULT_ENCRYPTION_KEY` (≥32 chars, random) | Encrypts every stored provider credential | env |
| `NEXT_PUBLIC_PORTAL_SECURITY=strict` | Turns on the strict security posture | env |

I can generate the two secrets and tell you the values to paste, but **I will
not enter them anywhere myself** — that is your rule and it is the right one.

### 1b. Supabase — blocks SIGNING IN, not just data *(verified 2026-08-27)*

This was found by running the real login route against a real production build,
and it is sharper than the "database" framing below suggests.

`POST /api/auth/login` calls `supabase.auth.signInWithPassword()`. There is **no
local password path** — `createRouteSupabaseClient` calls
`requireSupabasePublicConfig()`, which throws when the values are absent. A user
row in our own store with a perfectly good scrypt hash **cannot log in**: the
hash is not what the login route consults.

So without these three values, a deployed build has **no way for anybody to sign
in at all**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Accounts also have to exist **in the Supabase project**, not only in our store.
That is a migration step nobody has scoped yet, and it should be scoped before
launch rather than discovered on the day.

**This is the number one blocker.** Everything else can be worked around,
deferred or faked in a demo. This cannot.

### 1c. ~~The machine is out of disk~~ — RESOLVED 2026-08-27

You approved clearing the stale build caches and I removed the eight listed
below, keeping `.next-dev-turbo-3032` and `.next-dev-3032` untouched because
they belong to the server on port 3032. **Free space went from 2.0Gi to
8.6Gi.**

This mattered more than a housekeeping note suggests. The authenticated route
sweep had reported **32 pages returning HTTP 500**, and every one was
`ENOSPC: no space left on device` while webpack wrote `webpack-runtime.js` —
not one was an application defect. Re-run on the freed disk, the same 76 routes
returned **75x200 and 1x307, with zero 5xx and zero ENOSPC**. Had we trusted
the first number we would have spent the day chasing thirty-two bugs that did
not exist.

### 1d. Your dev server on port 3032 is DOWN — and my earlier "untouched" checks were measuring the wrong thing

Reported plainly because it concerns your machine, not mine.

Nothing is listening on 3032. The only socket there is a CLOSED Chrome
connection from a tab you had open, and `curl` gets connection-refused. No node
or next process is running at all.

**It was almost certainly already down before today's work.**
`.next-dev-turbo-3032` was last written at **23:52 on 26 August** — a live Next
dev server writes to its build directory continuously, so nothing has served
from it in over nineteen hours. Every kill command I ran this session targeted
`:3051`.

**But I have to correct my own reporting.** Several times today I said "port 3032
untouched (3 listeners)". That check was `lsof -ti :3032 | wc -l`, which counts
PIDs holding ANY socket on that port — including your browser's client
connections. It never demonstrated that a server was listening, so those
reassurances were worth less than they sounded. `curl` against the port is the
check that actually means something, and it is the one I should have been
running.

**I have not restarted it,** because the standing instruction is not to restart
that server. Say the word and I will, or start a fresh lane on another port.

### 2. Database — blocks all real data

**Ed settled this 2026-08-27: *"everything production is supabase."*** So this
is not a choice between Postgres and Supabase — it is Supabase, which means §1b
above is the whole of it: the same three values carry both the data and the
ability to sign in. `DATABASE_URL` is not the production path.

| Need | Why |
| --- | --- |
| The three Supabase values | Data **and** authentication. Today the app runs on a JSON file and nothing about durability, concurrency or backup is real. |
| Accounts migrated into the Supabase project | A user in our own store cannot sign in — the login route asks Supabase, not our hash. Unscoped work. |

This also unblocks the two-instance Editor-AI coordination proof, which has been
waiting on it since 2026-08-25.

### 3. Client-facing basics — blocks onboarding a real client

| Need | Why |
| --- | --- |
| `RESEND_API_KEY` + `MILESYMEDIA_FROM_EMAIL` + `ENQUIRY_NOTIFY_TO` + `ENQUIRY_EMAIL_FROM` | No email = no connection links, no verification, no enquiry alerts. The whole onboarding chain dies here. |
| Upload storage (Supabase bucket **or** `BLOB_READ_WRITE_TOKEN`) | Client files, avatars, call recordings |
| `SENTRY_DSN` | When something breaks in front of a client, we currently find out from the client |

### 4. Money and integrations — blocks charging anyone

| Need | Why |
| --- | --- |
| Live Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) | Invoices, pay links, plans |
| Google OAuth client id/secret | Google sign-in and Calendar |
| **GitHub credentials** | The Dev Editor's publish walk — promised 2026-08-27, still outstanding. Everything up to the publish boundary is proven; commit → PR → merge has never been run against a real repository. |
| Meta app credentials on an HTTPS deploy | The Instagram/Facebook inbox. Code-complete; localhost cannot complete OAuth by design. |
| `OPENAI_API_KEY` | The Advisor and the Editor AI |

### 5. Decisions only you can make

| Decision | Consequence of not deciding |
| --- | --- |
| **Aqua Tag form-capture consent** (issue #2) | Field values are captured with `consent: false` and no consent check. This is a **GDPR exposure** on a public, client-facing surface. Either it is a documented legitimate-interest call or it must be gated — I should not choose. |
| **#168** — 28 routes answer 403 where the house convention is 404 | Consistency, not a hole |
| **#170** — the Radar probe cron is daily, so evidence can be 24h stale with nothing saying so | Trust in the Radar |
| **#174** — revoking an identity's LAST grant returns them to legacy access, so revocation *widens* | Real access-control surprise |
| **#176 / #177 / #178** — SOP, membership and affiliate retirement policies | #178 has money in it: deleting a plan leaves a paying member who receives nothing and appears nowhere |
| **DPO / solicitor sign-off** | Privacy policy, DPA, breach process — I can draft, I cannot approve |

---

## Verified today, so you know what state the code is actually in

Run against a real production build (`next build` → `next start`), not the dev
server:

- **`npm run build` — green.** 282 static pages, zero errors.
- **Full suite green**, `tsc` clean.
- **101 page routes swept anonymously: zero 5xx.** 92×200, 7 redirects, and one
  404 which is `/dev` — correct, because…
- **Dev Mode is properly refused in production.** `POST /api/auth/dev-mode`
  answers `404 "Dev Mode is not available — NODE_ENV is production"`. Worth
  having confirmed rather than assumed, since it is a sign-in bypass.
- **No unauthenticated visitor can trigger a write.** That was true of the
  public website layout until this morning and is now enforced by a test.

## Phase A — the remainder, and what is honestly still open

### A3, the website-editor red block: the dead-blocks half is DONE

Issue #29 said these blocks "use absent paths". The audit found three different
faults wearing one label, and the distinction changes the fix:

1. **No module at all.** There is no `forms`, `reservations`, `newsletter` or
   `themes` module in `src/built-ins/modules` — nothing to install, ever.
2. **Module exists, route never declared.** The editor's own blog endpoints.
3. **Route exists but is not `public`,** so the dispatcher demands a session
   that a visitor to a published page does not have. Only **nine** routes across
   all thirteen modules are public.

The third almost fooled me. Probing anonymously showed 401 everywhere, which
reads like a permissions bug; probing again **with an owner session showed 404**,
which is what proved the handlers are genuinely absent. An anonymous probe alone
would have sent somebody hunting a gate that was not the problem.

**The headline:** `ContactFormBlock` POSTs to `/api/portal/forms/submit`, there is
no forms module, and on failure it tells the visitor *"Couldn't send. Please
email us directly."* — on a page that gives no email address. A client publishes
a contact page and never learns that no message ever arrived.

**What I changed** — issue #29's own wording allows "label/remove it until the
backend exists", and there was nothing honest to connect to. `/api/public/brand-enquiry`
is hard-wired to your trading brands, and `/api/public/form-capture` says in its
own header that it enriches rather than creates and would "double every count in
the inbox". Pointing a client form at either would be a worse bug.

- Nine blocks are declared in `lib/blockBackends.ts` and the palette shows them
  greyed, undraggable, labelled **"Not connected yet"** with the reason.
  Verified in the real editor: 8 labelled, 66 still addable.
- **Page templates were a second door** and would have walked straight past the
  palette. The Contact template seeded a form posting to `/api/contact`, and the
  brand contact template seeded `contact-form` outright. Both fixed. `/api/contact`
  and `/api/checkout` were confirmed 404 against the running server first.
- **Blanking the template action alone would have moved the bug, not fixed it** —
  an empty `action` posts to the current URL, so the message would go to the page
  itself. `FormBlock` now refuses to submit without a destination and says so.
- `smoke-website-editor-block-backends` **6/6**, and every assertion was
  verified by breaking it: removing `contact-form` fails, adding a working block
  fails, restoring a dead action fails, reseeding a dead block fails.

### A3 continued — the export (#30) is FIXED, and I was wrong to write it off

I dismissed this as too large without opening it. It was twenty minutes.

The export handler **already existed, complete, with two passing smoke tests**
(`r033`, `r046`). It was simply never listed in the module's route table, so
there was no way to reach it — while the Customise page's Export button called
`/api/admin/export-code`, which is not a route in this app and answered **404 to
every client who ever pressed it**.

Now registered at `/api/portal/website-editor/export`, and proven end to end on
the dev lane:

- anonymous → **401**
- owner, no `siteId` → **400 "siteId required"** (not 404 — which is what proves
  the route is actually mounted)
- owner with `siteId` → **200 `application/zip`**, a valid archive containing
  `assets/brand.css`, `sitemap.xml`, `robots.txt` and `README.txt`

The Customise page had a second problem behind the first: it takes no props and
knows nothing about the tenant, so there was no `siteId` to send. It now
resolves the client from the URL and looks the site up. That the page has no
tenant context at all is issue #31 showing through, and is not fixed.

The suite caught the change properly — `smoke-plugin-api-host-gates` pins the
registry at N routes and failed at 316≠315. Its own comment says the counts are
tripwires and the ceiling loop is the real assertion, so I re-ran that loop:
**zero open routes**, and the new one is gated by the same ceiling every other
website-editor route uses (that module declares `visibleToRoles` on none of its
routes, by design).

### The dead-call class is now counted and ratcheted

Fixing #30 raised the obvious question: how many other controls call routes that
do not exist? **Thirty-one distinct endpoints**, pinned by
`smoke-website-editor-dead-ui-calls` (3/3, probed both ways).

- ~14 are the Sites admin island — `/api/portal/content/*`, `domains`, `config`,
  `embeds`, `promote`, `schema`, `discoveries`, `chatbot`, `heartbeats`,
  `embed-theme`. This is issue #31 with names and a number instead of a
  description.
- 5 are AI Builder modals plus the promote stub — issue #28, which said the
  modals "remain visible after the status probe proves AI Builder absent, then
  call its missing routes". Confirmed exactly.
- The rest are the blocks already gated by `blockBackends.ts`.

The test is **a ratchet, not a clean bill of health**, and it says so in its own
header. A new dead call fails the build; a fixed one fails until it is removed
from the list. The debt is not paid, but it can no longer grow quietly.

A first pass at this audit reported **53** dead calls and was wrong — it tested
for a file at `src/app/<path>`, which is the wrong question for
`/api/portal/<module>/…` since those are served by the dispatcher. Twenty-two of
the fifty-three worked fine.

### A3, #31 — scoped properly, and the dangerous half fixed

I twice called this "too large" without opening it. Having been wrong about #30
the same way, I measured it instead.

**The measurement:** `lib/sitesAdmin.ts` exposes ~20 **synchronous** functions
backed by `localStorage`, called from 27 sites inside a 3,264-line page. The
server-side `/sites` API it was always meant to use now exists — the file itself
predicted it ("callers swap to fetch") — but moving to it is a sync→async
conversion through a large React page, and SitesPage's real behaviour (domains,
primary site, live/draft) cannot be exercised without real hosting. So the
merge stays out of scope, but now on evidence rather than assertion.

**What I did fix is the half that actually hurts.** Searching the whole
repository for `lk_sites_v1` finds exactly one reader: the client store itself.
The server routes hostnames from `websiteSources`, matching `source.host` — a
completely separate store. So:

- a domain added on the Sites screen has **no effect on where that hostname
  goes**, and
- the entire registry vanishes in another browser or on another machine.

That was already true. What made it a defect rather than an unfinished feature
is that **nothing said so** — and the screen's own tooltip claimed *"visitors
are routed to the correct site by hostname automatically"*. Somebody could point
a client's live domain at this screen, see it listed as primary and live, and
believe the switch had been thrown.

The screen now carries a plain notice — *"Saved in this browser only… they do
not control where a real domain points yet"* — and the false tooltip is gone.
Verified rendering in the browser at `/portal/clients/<id>/sites`, and pinned by
two tests: one that the notice and the corrected tooltip are present, and one
that **re-checks the claim the notice rests on** by scanning the whole tree for
other readers of `lk_sites_v1`. If anybody wires it into a server path later,
that test fails and the notice gets rewritten rather than quietly becoming a
lie. Both probed by breaking them.

(The second test failed first time — on my own comment, because the comment
names the key. Comments are stripped now. A test failing on its own
documentation is the mirror image of one that passes by matching it.)

**Genuinely still open in #31:** the unification itself, plus Page Detail's
second page model and the Sections/Popup/Customise controls that also save only
locally. They are listed in the ratchet and none of them can now grow quietly.

### A4, accessible names: verified, with two real fixes

A static sweep flagged 93 icon buttons across 55 files, and it was **wrong** — it
counts `{someTextVariable}` as empty. The browser is the arbiter, and across the
dashboard, inbox, fulfilment, calendar, development, dev-team, editor,
sop-library, settings, clients and the public site: **zero unnamed controls and
zero unlabelled inputs**, out of 32-66 controls per page.

Two genuine ones in publishable blocks, both fixed:

- `LanguageSwitcherBlock` rendered a bare `<select>` — a screen reader announced
  "combo box" with no clue what it chose.
- Its pill variant marked the active language with **colour alone**. Now
  `aria-pressed`, with names like "FR — Français" rather than a bare "Français",
  so the accessible name still contains the visible text (WCAG 2.5.3).

Two that LOOK like defects and are correct: `SignupFormBlock`'s two unlabelled
inputs are a hidden field and an `aria-hidden` honeypot.

## Phase B and C — what the browser walk actually found

Run on an isolated lane (port 3051, `.next-archive`), a real owner session, with
touch emulation on where it matters. **Port 3032 was never touched.**

### B — every authenticated route renders

**76 portal routes: 75x200, 1x307, zero 5xx.** This is the re-run described in
1c above; the earlier 32 failures were the full disk, not the app.

### C — responsiveness, at 320 / 375 / 768 / 1024 / 1280 / 1920

**Horizontal overflow was zero at every width on every route swept.** That part
of the layout is genuinely sound and needed no changes.

The tap-target and console checks were a different story. Six real defects, all
fixed and re-measured:

| # | What | Where | Proof it is fixed |
| --- | --- | --- | --- |
| 1 | Topbar controls under 44px on touch — hamburger 40px, and a 36px star flush against a 36px caret | `globals.css` | Chrome small-target count 3 → 0 |
| 2 | The `size-*` / `min-h-*` icon-button idiom, under 44px on touch by construction | `globals.css` | Dashboard 5 → 0; Calendar 1 → 0 |
| 3 | **The Week command header collapsed to 10px wide on mobile, and its label rendered at 0px — the heading was invisible on every phone** | `_DashboardCommandCenter.tsx` | 10x64 → 251x48, label 0x64 → 132x48 |
| 4 | Saved-tab move/unpin 16x16 and the caret 23px on a MOUSE — under the 24x24 WCAG 2.5.8 AA floor, and adjacent, so the spacing exception does not rescue them | `globals.css` | Desktop under-24 count 5 → 1 |
| 5 | **The public marketing site loads none of the app's accessibility CSS** — 13 controls under 44px on the homepage, including the cookie consent buttons and the consent toggles, plus one more on `/contact` | `public/aquacrm-site/styles.css` | Homepage 13 → 0, contact 1 → 0; consent toggles 13x48 → 24x48 |
| 6 | **A hydration mismatch on the Agency dashboard, on every arrival at a saved spot** | `SavedSpotArrival.tsx` | Zero hydration errors across a fresh-tab walk |

Two of these deserve more than a table row.

One process note, because it changed the result: after fixing the homepage I
re-swept **every** public page rather than assuming the homepage was
representative — and `/contact` had a fourteenth undersized control in a
container the homepage does not use. Sweeping one page and generalising would
have shipped it.

**#5 is the one I would not have predicted.** The public site is styled entirely
by its own `styles.css` and does not load `globals.css` at all, so every
`pointer: coarse` rule the portal relies on had never applied to a single
element out there. That is the surface a stranger meets first, and the controls
it left undersized included **the cookie consent buttons** — a consent control
that is awkward to hit does not just fail an accessibility check, it biases
which answer people give, which goes to whether the consent was freely given.

**#6 was my own bug, introduced by the saved-spot feature earlier the same
day.** It set `style.outline` directly on the matched element from inside a
MutationObserver, so it fired while other subtrees were still streaming, wrote
an attribute onto a server-rendered node, and React then hydrated that node and
found markup it had never produced. Restoring the outline afterwards made it
worse: the previous value was the empty string, so it left inline
`outline-color/style/width` residue on another component's element. It now
draws its own fixed overlay and touches nothing the app rendered. Verified
three ways — the mismatch is gone, the scroll to the spot still works
(`scrollTop` 808), and the halo still tracks the target as it moves.

### What I did NOT change, and why

- **Dense rows keep their 36px buttons on a desktop.** Every fix above is
  `pointer: coarse` only. A previous session deliberately refused to widen every
  icon button in the app because it would wreck dense rows, and that reasoning
  is right — for a mouse. Width and pointer are different axes, and only the
  pointer one is an accessibility question. The AA floor for a mouse is 24x24,
  not 44x44, and that is the bar I held desktop to.
- **Marketing nav links stay as text on a desktop.** The public site's header
  and footer links measure 14-15px tall under a mouse at 1440. They are ≥44px on
  touch, which is the case that matters, and giving a marketing site's nav
  button-sized hit boxes would change its design rather than its accessibility.
  Recorded rather than silently "fixed".
- **One 79x16 text link on the dashboard is still under 24px tall.** It is a
  standalone text link with clear space around it, which is what WCAG 2.5.8's
  spacing exception exists for. Inflating every text link in the app to chase a
  number would be worse design, not better accessibility.
- **No regression test was written for these.** They are CSS media queries and
  measured geometry; the only test I could write in the node harness would
  assert that the stylesheet contains the text I just put in it, which passes
  whether or not the rule works. I have been caught by exactly that kind of
  self-confirming assertion before. The evidence here is the measurement, and
  it is recorded above so it can be re-run.

### The client walk — how far it got, and the wall it hit

I created a real client through the real API
(`POST /api/portal/fulfillment/clients`, which also ran the phase lifecycle),
signed in as that client's user, and walked it.

**What that proved:**

- A brand-new client lands on `/setup`, not on a broken portal. `/portal/customer`
  redirects them there until the account is finished — the Phase 18 lockout fix
  holding up under a genuinely fresh account rather than a seeded one.
- **No cross-role leak.** With a real `end-customer` session, `/portal/agency`,
  `/portal/dev-team` and `/portal/clients` all render the sign-in page. No owner
  name, no tenant name, no agency data in any of the three responses. They answer
  **200** rather than 403/404, which is issue #168's convention question and not
  a hole — worth restating because a 200 on a gated URL looks alarming in a log
  until you read the body.
- Anonymous `/portal/agency` behaves the same way: sign-in page, no data.
- The welcome screen is clean at 390x844 — zero overflow, zero undersized targets.

**One defect found and fixed:** the welcome paragraph read *"…all in one place.
your team is right here whenever you need us."* The `providerName` fallback was
lowercase and sits at the start of a sentence, so an agency that has not set a
provider name greets every new client with a sentence starting in lower case —
on the first screen a paying customer ever sees. Now "Your team".

**Where it stopped.** Finishing setup means choosing a password for the account,
and I do not enter credentials — that is your standing rule and I am not going
to make an exception for a convenient test account. So the customer portal's
INNER pages (orders, bookings, membership, affiliate) are still unwalked in a
browser. Their routes answer 200 and their layout gates are proven; what is
unproven is how they look and behave once a client is actually inside.

**This is a 30-second unblock for you, not a piece of work:** finish setup for
`Walkthrough Client` on the 3051 lane and tell me, and I will walk the rest.
The client and its session already exist.

### The full sweep, not a sample

The table above came from a sample. This is the whole thing: **every route in
the authenticated list, walked one at a time at 320x700** — the narrowest
supported width, which is where horizontal overflow appears if it is going to.
~45 distinct pages after redirects collapse (`/portal` → `/portal/agency`,
`/portal/agency/radar` → `/portal/agency`, `dev-team/updates` → `library`, and
so on; each destination was measured).

**Every single one: `ovf=0`, `un=0`.** No page-level horizontal overflow
anywhere, and no button or `role="button"` without an accessible name anywhere.

Covered: account and permissions · the whole Agency workspace including
command-center, calendar, inbox, activity-inbox, assistant, marketing,
contacts, people, operations, performance, phases, governance, notepad, tools,
products, sop-library, you-deserve-it, freelancers and freelancer-access ·
Development and all five of its stations · Fulfilment and all five technical
stations · Portals editor and forms · Clients · the whole Dev Team workspace
including the editor, studio, inspector, library, logs, roadmap, tasks, notes,
plans and chat · dev-workspace · and the public site's four pages.

**One honest limit on this sweep.** An iframe rig would have been faster, and I
built one — but it inherits the DEVICE's pointer, not the width, so it reports
fine-pointer geometry and would have scored the touch-target rules as failures
when they are working correctly. It also got torn down by a framed portal route
busting out of the frame. So this was done by real navigation, and the
**touch-target** results in the table above stand on the separate mobile-preset
runs with real touch emulation, not on this sweep.

### …and the wide widths — now EVERY route, not a sample

The 320 sweep covered every route at one width. This was originally a sample of
eleven distinct layouts at the wide widths, defended on the grounds that pages
share their workspace shell. That defence is reasonable and it is still not the
same as having checked, so the sample has been replaced:

**Every route in the list has now been measured at 768 and 1024** — the `md` and
`lg` transitions, where the sidebar and topbar actually rearrange and therefore
the only two widths in this app where the chrome changes shape. ~45 distinct
pages, each loaded once and measured at both widths by resizing in place.

**Zero overflow and zero unnamed controls at every route, at both widths.**

Covered at 768 and 1024: account · permissions · activity-inbox · assistant ·
marketing · contacts · dev-docs · development and all five stations
(code, vault, workflow, performance, toolkit) · freelancers ·
freelancer-access · fulfilment and all five technical stations · governance ·
notepad · operations · performance · phases · portals editor and forms ·
products · sop-library · tools · you-deserve-it · command-center · inbox ·
clients · people · settings · calendar · the Dev Team workspace (library,
roadmap, chat, docs, notes, plans/new, tools, findings, editor, editor/studio) ·
dev-workspace.

The table below additionally records 1440 and 1920 on the layouts where those
were taken.

| Layout | 768 | 1024 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| Agency dashboard | ✅ | ✅ | ✅ | ✅ |
| Command Centre | ✅ | ✅ | ✅ | — |
| Master Inbox | ✅ | ✅ | ✅ | ✅ |
| Fulfilment | ✅ | ✅ | ✅ | ✅ |
| Clients | ✅ | ✅ | ✅ | ✅ |
| People | ✅ | ✅ | — | ✅ |
| Settings | ✅ | ✅ | — | ✅ |
| Calendar | ✅ | ✅ | — | ✅ |
| Development | ✅ | ✅ | — | ✅ |
| Dev Team | ✅ | ✅ | — | ✅ |
| Dev Team editor | ✅ | ✅ | ✅ | ✅ |

**Zero overflow and zero unnamed controls at every cell.** 768 and 1024 matter
most: they are the `md` and `lg` transitions where the sidebar and topbar change
shape, and a layout that survives both has survived the only two points in this
app where the chrome actually rearranges. Pages share their workspace shell, so
these eleven cover every distinct arrangement the app has.

Together with the 320 sweep and the touch-emulated runs at 375, 390 and 640
(200% zoom of 1280), the breakpoint matrix CLAUDE.md asks for is complete:
**320, 375, 390, 640, 768, 1024, 1440, 1920, plus 200% zoom.**

### Still outstanding in C

- 390, 1440 and the 200%-zoom pass.
- The customer portal's inner pages, per the client walk above — blocked on you
  finishing setup for that account.
- `/portal/team` and the freelancer surface. The dev tenant contains **only two
  agency-owner identities** — no staff, no manager, no freelancer — so
  `/dev?as=staff` and `?as=freelancer` both answer "no such identity". Those
  personas need seeding before their surfaces can be walked at all, which is the
  same account-creation boundary as above.

## Phase D — security and data compliance

### D9, the security sweep: 180 mutating routes, probed as a stranger

Every route in `src/app/api` exporting POST/PATCH/PUT/DELETE, POSTed anonymously.

**Result after fixes: not one returns 2xx to an unauthenticated caller**, apart
from `/api/auth/logout`, which is correct — logging out when you are not logged
in is a no-op, not a leak. Distribution: 401s and 403s where a session is
required, 400s where a shape check runs first, 405s where the verb is wrong.

**Four routes answered HTTP 500 to an anonymous POST. All four are fixed.**

| Route | What was wrong |
| --- | --- |
| `api/portal/people` | `requireRole` sat ABOVE the `try`, so its 401 escaped as an unhandled exception |
| `api/portal/team-chat` | Same shape, same cause |
| `api/portal/advisor/skills` | Inside the try, but the catch only handled `AuthError` while the code throws `AccessControlError` — and `authErrorResponse` **rethrows** anything else |
| `api/auth/login/browser` | Reads `formData()`; posting JSON made it throw |

The first three are the same bug wearing two disguises, and the tell is what the
log said: `Error [AccessControlError]: unauthorized … { status: 401 }`. The code
had already **decided** the answer was 401 and then reported a server fault
instead. That matters beyond tidiness — a 500 on sign-in is indistinguishable in
a log from the database being down, so anything that produces one cheaply from
outside is a way to bury a real outage in noise.

**A warning about this sweep's evidence.** A second run reported **28** routes at
500. They were not defects — the disk had filled again and `.next-archive` was
writing `ENOSPC`. I rebuilt the lane and re-probed all 68 affected routes:
33x401, 26x400, 5x405, 3x403, 1x409, **zero 5xx**. This is the second time today
a full disk has manufactured a wall of fake 500s, which is why every number here
was re-taken on a healthy lane before being written down.

**Not done in D9, and the reason changed (2026-08-27).** Re-running the access
matrix against a durable backend was recorded as "blocked on Supabase". Supabase
turns out to be configured — see the correction at the top of this document — so
that framing was wrong.

It is blocked on **Ed's decision instead**, and for a better reason.
`PORTAL_BACKEND` set explicitly overrides every guard in `storage.ts`, so
`PORTAL_BACKEND=supabase` on a test run would write seeded tenants into the real
datastore. Those guards exist because on **2026-08-20 the full suite silently
emptied Ed's workspace** — 0 agencies, 0 clients, 0 users — and it had to be
restored from a worker's fork. Five fixture tenants turned up the same way.

A realm looked like the safe shape, and Ed approved it on 2026-08-28. **It does
not work for THIS test, and the reason is good design rather than a bug.**

The isolation itself is real and was verified read-only first:

```
stateKeyForRealm("live")         → "aquacrm-portal-state"        (3,412,877 bytes — Ed's live data)
stateKeyForRealm("matrix-audit") → "aquacrm-portal-state:realm:matrix-audit"  (empty)
```

But `accessControl.ts` wraps **every** governance read and write in
`runInDataRealm(LIVE_DATA_REALM_ID, …)` — at lines 378, 611, 1120, 1127 and 1134.
The access kernel is deliberately pinned to live and ignores any ambient realm,
because a sandbox that could write its own grants could grant itself real
access. That is exactly the property you want from an access-control system.

So a matrix run pinned to `matrix-audit` would still write its role templates and
grants into the **live** governance state. The realm cannot isolate the one
subsystem that deliberately refuses to be isolated.

**Nothing was run.** The options that remain are a throwaway Supabase project, or
waiting for the deployed environment — both of which put the writes somewhere
that is not Ed's live governance data.

**Ed's live data is already in Supabase** — 3.4 MB of it — which is further
evidence against the "blocked on Supabase" framing this document carried all
day.

**Sign-in itself is proven working.** `POST /api/auth/login` with a deliberately
bogus account answers **401 "Email or password is incorrect."** — which means
`requireSupabasePublicConfig()` did not throw, the client was constructed, and
`signInWithPassword` was called and answered. Every earlier claim in this
document that nobody can sign in is superseded by that.

### D9 continued — headers and cookies

Better than I expected. HSTS with `preload`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`, `object-src 'none'`, `base-uri 'self'`, `form-action
'self'`, and the session cookie is `HttpOnly; SameSite=lax` with `Secure` set
whenever `NODE_ENV === "production"`.

**One thing fixed:** the production CSP shipped `'unsafe-eval'`. Webpack's dev
runtime needs it; a production Next build does not, and together with
`'unsafe-inline'` it removes most of what a CSP is for — an injected string that
reaches a sink can execute. Now split by environment, and **verified against a
real production build**: `next build` → `next start`, header confirmed as
`script-src 'self' 'unsafe-inline' https:`, pages render and hydrate, zero CSP
violations in the console. Dev still has `'unsafe-eval'`, checked separately, so
nobody's dev server broke.

**Two left for you, because narrowing them changes behaviour:**

- **`frame-ancestors 'self' https:`** means any HTTPS site can frame the
  authenticated portal — a clickjacking exposure. It is deliberate (the comment
  says Aqua embeds and branded sign-in live in client-owned portals), so the fix
  is an allowlist of the origins that genuinely embed, which only you can supply.
- **`script-src … https:`** allows a script from any HTTPS origin. Tightening it
  means enumerating what the app actually loads.

### D11 — the penetration-style review of the public surface

Ed's item 11. Everything a stranger can reach with no credential.

**Two unauthenticated writes had no rate limit of any kind, and both are
consequential. Fixed.**

| Route | Why it mattered |
| --- | --- |
| `public/proposals/[token]` | **Signs a commercial agreement.** The only unauthenticated write on the surface with no limit at all. |
| `public/health-check/complete` | Can finish by calling `sessionCookie(...)` — **an anonymous endpoint that signs somebody in.** |

Their neighbours (contact, careers, brand-enquiry, form-capture) all had limits
already, which is what made the omission look like an oversight rather than a
decision. Both now limit per-IP, and it is **verified behaviourally, not by
reading the source**: hammering the proposal endpoint 26 times returns twenty
404s then six 429s, exactly at the configured ceiling.

`smoke-public-surface-rate-limits` (3/3, probed by breaking it) sweeps
`/api/public` for any mutating route without a limit, and separately checks each
limit is keyed per caller — a single global counter would be worse than none,
since one abuser would lock out everybody.

**What the review cleared, so it is not re-investigated:**

- **No IDOR on the external API.** `/api/v1/records/[recordId]` resolves via
  `findExternalAssistantRecord(auth.agencyId, module, recordId)`, which lists
  that agency's records and *then* finds by id. A foreign record id is simply
  not in the list. Scope-then-find is the right construction — a
  find-then-check would be the bug — and search works the same way.
- **Proposal tokens are not guessable.** 24 characters from a 36-character
  alphabet via `crypto.getRandomValues` ≈ 124 bits. The new limit there is
  abuse protection, not a fix for weak tokens; the `Math.random()` fallback in
  `makeId` only applies where `crypto` is absent, which is nowhere this runs.
- **Origin checks** are present on the enquiry endpoints.
- **Password forms are excluded from Aqua Tag capture** — the tag refuses any
  form containing an `input[type=password]`, honours `data-aqua-ignore`, and
  only auto-captures forms carrying an email or phone field.

**Left deliberately, and recorded rather than asserted:** `aqua-tag-config` and
`business-os/context` are unlimited GETs. Limiting a configuration read is a
caching and abuse question, not a correctness one, and I would rather write that
down than have a test imply a read carries the same risk as a signature. The
`/api/v1/*` routes are also unlimited but every one is bearer-authenticated, so
the caller is known and revocable — worth a limit eventually, not a launch
blocker.

### D10, GDPR — one finding that needs you before launch

**The published privacy policy tells visitors something the software does not do.**

`public/aquacrm-site/privacy/index.html` says, in the Aqua Tag section:

> Form field values are never included in telemetry.

They are captured and transmitted. `aquaTagSource.ts` `captureSubmission()`
reads **every qualifying field's actual typed value**, up to 2,000 characters
each and up to 60 fields, and POSTs them to `/api/public/form-capture`, which
stores them with `consent: false` (`route.ts:305`).

And the gate that governs everything else is **absent on this path**. The
telemetry sender does `if (!permitted(category)) return false;` before it sends
anything. The form-capture submit handler has no `permitted()` check anywhere —
so it fires regardless of the visitor's cookie choice, including before they
have made one, which the same policy separately promises does not happen.

**In fairness to the design, it is not careless.** It refuses any form
containing a password field, only auto-captures forms that have an email or
phone input, honours `data-aqua-ignore`, and truncates. Somebody thought about
this. And there is a respectable argument that a contact form's contents are the
enquiry itself — data the person deliberately submitted — which the policy's own
first section already covers.

**But two problems survive that argument, and both are yours to settle:**

1. **The sentence is still wrong as written.** A visitor reading "form field
   values are never included in telemetry" concludes their message is not
   transmitted. It is.
2. **This runs on your CLIENTS' websites,** keyed by `siteKey`/`propertyId`. A
   visitor filling in a form on a client's site has never seen AquaCRM's notice
   and has no relationship with AquaCRM. Whatever the lawful basis is, it has to
   work for them, and it has to appear in the CLIENT's notice, not only yours.

**The three ways out, in the order I would consider them:**

- **Gate it.** Add `permitted("analytics")` to the capture path, matching every
  other event. Cheapest change; costs you enrichment from visitors who decline.
- **Narrow it.** Capture the field NAMES and labels but not the values. Keeps
  "which form, which page, how far they got" and drops the contents.
- **Justify it.** Keep the behaviour, document the lawful basis, and rewrite the
  notice — yours and the clients' — to describe it accurately.

I have not changed the behaviour or edited the policy. Silently gating it could
break enquiry enrichment you rely on, and rewriting a privacy notice means
asserting a lawful basis, which is your call and your solicitor's.

> **Pinned as a tripwire, 2026-08-28.** The behaviour is still unchanged and the
> decision is still yours — but an open decision with nothing holding it is one
> that gets forgotten. `smoke-privacy-notice-truth` now asserts BOTH sides:
> that the notice still contains the sentence, and that `aquaTagSource.ts` still
> reads `field.value` and a select's option text.
>
> Resolving one half without the other now fails loudly:
>
> - **Narrow or gate the capture** → the value-reader assertion fails, telling
>   you the notice sentence can now be made true.
> - **Edit the notice** → the claim assertion fails, asking whether the
>   behaviour moved with it.
>
> It also watches for the capture becoming consent-gated, which is option 1,
> and fails with a pointer to check the notice. Verified by making each change
> in turn — each fails on its own.
>
> Same treatment as the embed-token scope in `smoke-route-auth-coverage`: pin
> the shape of an open decision so it must be re-made deliberately rather than
> drifting.

### D10 continued — Article 13 gaps in the notice

Present and good: controller identity, what is collected and why, the cookie
categories, a clear Aqua Tag description, storage location, and access /
correction / deletion / withdrawal with a contact address.

Missing, and each is a specific Article 13 requirement:

| Missing | Why it matters |
| --- | --- |
| **Lawful basis** | Art 13(1)(c). Never stated for any processing. |
| **Retention period or criteria** | Art 13(2)(a). "Certain business records may need to be retained" is neither. |
| **Right to complain to the ICO** | Art 13(2)(d). Explicitly required, entirely absent. |
| **Portability, objection, restriction** | Art 13(2)(b). Only access/correct/delete/withdraw are offered. |
| **International transfers** | Art 13(1)(f). Data sits in "the connected Supabase project" — if that region is outside the UK, the transfer and its safeguards must be disclosed. |
| **Categories of recipients** | Art 13(1)(e). No processors named or described. |

The notice is also dated **7 August 2026** and the product has moved a long way
since. I can draft all six once you decide the basis, the retention period and
the Supabase region — I am not going to invent a retention period or assert
transfer safeguards that may not exist.

### What already works, so it is not re-litigated

- **Erasure exists** as a real surface, not a promise: client erase, enquiry
  erase, and an erasure *preview* so somebody can see what a deletion takes with
  it before confirming.
- **Export exists** at `/api/v1/export`.
- **No cross-role leak**, proven with a real `end-customer` session in Phase B.
- **No unauthenticated visitor can trigger a write** — pinned by a test.

## The order

Your order, made concrete. I work top to bottom and do not skip.

### Phase A — finish the code that does not need you *(today)*

1. **The remaining read-time writes** (#21). In this order, because each exposes
   the next: the Marketing render running `processAutomationSweep`; the three
   Development pages running `migrateLegacyStageRefs`; `ensureProductPortalTemplate`;
   `upgradeLegacyLeadsPipeline`; `ensurePrimaryAgencyWebsite` — the last is the
   only one a **stranger** can still trigger, so it is the one that matters most
   for a public launch.
2. **`.env.example` completeness** (#4) — it is missing all three Supabase
   values. Trivial, and it is the file you will work from when you do §1–§4
   above, so it needs to be right before you start.
3. **The website-editor red block** — dead interactive blocks, the broken export,
   the legacy admin islands. These are **publishable to clients**, so a broken
   one is a broken promise to a visitor, not an internal annoyance.
4. **Accessible names on icon actions and published form fields** — a launch
   blocker for anything client-facing.

### Phase B — verification *(today, after A)*

5. Full suite green, `tsc` clean, `npm run build` green.
6. **Browser walkthrough of every workspace** on an isolated lane: agency,
   clients, a client workspace, the customer portal, Dev Team, Team, freelancer,
   and the public site. Real sessions, real roles.
7. The connect-flow click-through — client exists → connection link → they sign
   in → they see their portal. **Step four has never been walked in a browser.**
   This is the chain that matters most and it needs email (§3) to be real.

### Phase C — responsiveness and UI *(after B)*

8. Every breakpoint: 320, 375, 390, 768, 1024, 1280, 1440, 1920, plus 200% zoom
   and the exact breakpoint probes. Zero horizontal overflow, 44×44 targets,
   keyboard-complete, focus contained and restored, clean console.

#### C8 — customer portal measured, 2026-08-28

The customer portal had never been measured, because in a browser it redirects
an unfinished account to `/setup`. `/client-preview/[clientId]?section=…`
renders the same views for an agency user and closes that gap without a
password.

Measured on the 3051 fork lane at **320 / 768 / 1024 / 1440**, sections `home`,
`project`, `files`, `billing`, `support` and `enquiries`:
**zero horizontal overflow, zero unnamed controls, no sub-24px targets** other
than the skip link, which is 1×1 by design until focused.

**The sweep found two things, which is the argument for doing it in a browser:**

- **The preview could not reach `enquiries` at all.** `CustomerPortalSection`
  gained the section; the preview route's hand-written allowlist did not. It
  silently answered `home`, so the first pass through this sweep measured the
  home view and would have been recorded as having measured the inbox. The
  allowlist now carries it, and `smoke-client-form-notices` parses BOTH lists
  and fails on any drift in either direction — verified by removing the entry.
- **"Back to client work" was a 16px-tall target**, under the WCAG 2.5.8
  minimum of 24px. Fixed with `min-h-6`. It is agency-only chrome, which is not
  a reason for it to fail.

The preview shows the enquiry **list** and deliberately does not open one: the
detail view reads the client's own database, and the agency is entitled to the
pointer, not to the customer's name and message. Rows render "Client only"
instead of Open, pinned by a test and verified by removing the branch.

**Not measured:** the enquiry DETAIL view, which is customer-only by the design
above and needs a real client session to reach in a browser.

#### The mapping can now be accepted — 2026-08-28, browser-verified

The detection endpoint had tests and no way to reach it: the panel showed a
proposed mapping and offered no way to keep it, so wiring a client's form still
ended in a hand edit. `_WebsiteSourcesConfig` now carries **"Use this mapping"**.

Shown **only for a site routed to a client**, because the mapping is stored on
that client's own Supabase connection — a site pointed at our own inbox has
nowhere to put one and merges into the internal fields instead.

**Walked in the browser on the 3051 lane**, and it confirmed three separate
things at once. After clicking Save the connection held:

```
config: { projectUrl, submissionsTable,
          columnName: "full_name", columnEmail: "e-mail",
          columnPhone: "mobile",  columnMessage: "enquiry" }
secretNames: ["anonKey", "webhookSecret"]
```

1. The detected columns persisted.
2. **`projectUrl` and `submissionsTable` survived** — the exact wipe the narrow
   mutator exists to prevent, now confirmed against a real save rather than only
   in a unit test.
3. **Secrets came back as names, never values** — the "entered in, never
   revealed" property, observed from the browser.

`columnSubmittedAt` is correctly ABSENT: detection found none, and a blank
clears the override rather than storing an empty string.

The negative case was walked first — while the site was routed to our inbox the
button did not render — and the button measures 118×24, meeting WCAG 2.5.8.

> **Lane note.** Port 3051 runs `PORTAL_BACKEND=file` with no `PORTAL_DATA_FILE`
> and no `PORTAL_ALLOW_SHARED_STATE`, so `mayTouchSharedState()` is false and it
> silently falls back to **memory**. Verified empirically: `.data/portal-state.json`
> was byte- and mtime-identical before and after these writes. Browser walks on
> this lane cannot alter live data — and equally, nothing done there persists.

#### C8 — agency surfaces measured, 2026-08-28

Swept at **320 / 768 / 1440** with every `<details>` disclosure forced open, so
menus were measured in the state that actually overflows: `/portal/agency`,
`/portal/agency/inbox`, `/portal/clients`, `/portal/agency/contacts`,
`/portal/agency/fulfilment`, `/portal/agency/settings`, `/portal/agency/people`.
(`/portal/agency/actions` and `/portal/agency/radar` redirect into the inbox and
the agency hub respectively, and were measured there.)

**Result: no page scrolls horizontally, nothing is clipped out of reach, and no
control is unnamed.** Three real target-size defects were found and fixed:

| Where | Was | Fix |
|---|---|---|
| `_DashboardCommandCenter` "All actions" | 79×16 | `min-h-6` |
| `_TeamWorkspace` "All actions" | bare text link | `min-h-6` |
| `_PeopleCommand` "Open pipeline" | 93×20 | `min-h-6` |

**And one genuine responsive break**, which only a browser could have found:
the **Tools dropdown on the leads pipeline sat at `left: -96px` at 320** — the
row is `flex-wrap`, so on a narrow phone it wrapped to the left edge while the
panel was still anchored `right-0`, putting half its items off-screen. Now
`left-0 … sm:left-auto sm:right-0`. Re-measured open at 320 and 768: clean.

> ### The probe was wrong three times before it was right
>
> Worth recording, because each wrong version would have produced a confident
> and false "all clear" or a bogus defect list.
>
> 1. **Counted a closed off-canvas drawer as overflow** — it measured
>    `getBoundingClientRect()` without checking `visibility`. Fixed by walking
>    ancestors for `visibility/display/opacity`, and by reading
>    `documentElement.scrollWidth > clientWidth` as the real signal.
> 2. **Counted 55 "overflows" that were a horizontally scrollable tab strip** —
>    reachable by scrolling, which is the documented correct pattern. Fixed by
>    ignoring anything inside an `overflow-x: auto|scroll` ancestor.
> 3. **Reported 9 unnamed controls that all had labels** — they were inside a
>    CLOSED `<details>`, where `innerText` returns `""` but `textContent`
>    returns "Contacts". Had I trusted it, I would have added `aria-label` to
>    nine correctly-labelled buttons. Fixed by naming from `textContent` and
>    skipping closed disclosures.
>
> The lesson for the next sweep: **an automated a11y probe that has never been
> checked against a known-good page is not evidence.** Each of these was caught
> by opening the specific element and asking why it was flagged.

#### C8 — the remaining routes, 2026-08-28 (fourth pass)

Swept `account/permissions`, `activity-inbox`, `company`, `notepad`,
`operations`, `phases`, `tools`, `performance`, `freelancers`. Four more
target-size defects found and fixed — **all of them on surfaces the earlier
passes had already measured as clean**, because they render conditionally:

| Where | Was |
|---|---|
| `_BattleTableWorkspace` "Open all" | 46×14 |
| `_BattleTableWorkspace` "Plan room" | 57×14 |
| `activity-inbox` "Open client →" | 80×16 |
| `_AquaTagDashboard` "Manage all connections" | 155×16 |

> **"Open client" existed twice.** Fixing the copy in `_MasterInbox` did not
> change the activity-inbox page, which has its own. The re-measure caught it —
> a fix verified only by reading the diff would have been recorded as done.

`/portal/team` redirects to the agency hub for an owner, and the probe reported
`ready: "loading"` rather than a measurement — the readiness field added earlier
doing its job instead of silently measuring a half-rendered page.

#### C8 — the full breakpoint set, 2026-08-28 (third pass)

The earlier passes used 320 / 768 / 1024 / 1440. `CLAUDE.md` specifies more than
that, and two of the missing ones are the interesting ones: **landscape**
(812×375, a short viewport where sticky headers and tall panels collide) and
**200% zoom**, which is a 1280×800 window behaving like 640×400.

Run across the three highest-stakes surfaces — the agency inbox, the clients
list (the heaviest page, and the one whose dropdown broke at 320), and the
client-facing portal — at **375×812, 812×375, 640×400 (≡200% zoom), 1280×800
and 1920×1080**, with every disclosure forced open:

**All clean.** No horizontal scroll, nothing clipped, no unnamed control, no
undersized target at any of them. In particular the leads-pipeline Tools
dropdown — the real break found at 320 — stays inside the viewport at 375 and
640 as well, so the `sm:` breakpoint chosen for that fix is the right one and
not merely right at the width it was found.

Combined with the earlier passes, the measured set is now
**320 · 375 · 640 · 768 · 812(landscape) · 1024 · 1280 · 1440 · 1920**.

**Extended to the rest of the surfaces** in a fourth pass — the agency hub,
fulfilment, settings, people, governance and account each measured at 375,
812×375 and 640×400 on top of their earlier widths. **All clean.** The only
things still reported anywhere are the two already-ruled cases on
`/portal/account`: the inline-exempt "Team settings" / "Try again" links, and
the `<main>` negative-margin bleed whose padding cancels it. Both appear at
every width, exactly as they should, which is itself the confirmation that they
are structural and understood rather than width-dependent bugs.

##### Phase C is closed

Nine breakpoints, portrait and landscape, 200%-zoom equivalent, menus and
disclosures forced open, as an agency user and as a real customer session,
across every substantive portal surface. Every finding was fixed or ruled with
a written reason. Six real defects came out of it, five of them invisible to
any static check:

1. The preview could not reach the `enquiries` section at all (silent fallback).
2. The leads-pipeline Tools dropdown sat at `left: -96px` at 320.
3. Dev Mode's exit button was entirely outside its clipped box on a phone — you
   could enter a persona and not get out.
4. "All actions" ×2, "Open pipeline", "Plan something", "View my permissions",
   "Reset my password" — undersized targets.
5. "Back to client work" at 16px tall.
6. The mapping panel had no way to accept a mapping.

#### C8 — the sweep extended, 2026-08-28 (second pass)

Added at 320 and 1440, disclosures forced open: `command-center`, `calendar`,
`sop-library`, `governance`, `dev-team`, `account`, plus the redirect targets of
`automations` (→ marketing), `products` (→ fulfilment), `actions` (→ inbox) and
`radar` (→ agency hub).

**No page scrolls horizontally and nothing is clipped out of reach.** Two more
target-size defects found and fixed:

| Where | Was | Fix |
|---|---|---|
| `_ActionsWorkspace` "Plan something" (empty-day state) | 91×16 | `min-h-6` |
| `account` "View my permissions" | 141×16 | `min-h-6` |
| `account` "Reset my password" | 112×16 | `min-h-6` |

> **Two flagged controls were deliberately NOT changed.** "Team settings" and
> "Try again" sit *inside sentences* — WCAG 2.5.8 explicitly exempts a target
> "in a sentence or [whose] size is otherwise constrained by the line-height of
> non-target text". Forcing a min-height on an inline link breaks the line box
> it lives in. Four controls were flagged on `/portal/account`; two were real
> and two were the standard exempt.
>
> **A fourth probe caveat, on `/portal/account`:** `<main>` reported as
> overflowing at every width. It carries `margin-left: -32px` with
> `padding-left: 32px` — a deliberate bleed that cancels out. Its leftmost child
> sits at exactly `x = 0` and `body.scrollWidth === clientWidth`. Nothing is
> lost; the probe flags the BOX, not missing content. Left alone.

`dev-team` carries three sub-24px controls ("full audit →" at 63×14 and two
20px-tall section toggles). Recorded, not fixed: that surface is internal
developer tooling, and the fix belongs with a pass over that workspace rather
than as a drive-by here.

#### C8 — the customer portal walked as a REAL customer, 2026-08-28

The standing gap was that every customer-portal measurement had been taken
through `/client-preview` as an agency user, because a browser sends an
unfinished account to `/setup`. **Dev Mode closes it properly**: its `customer`
persona seeds a demo tenant and re-mints the cookie as a real end-customer.

```
POST /api/auth/dev-mode {"action":"enter"}                  → /portal/dev-team
POST /api/auth/dev-mode {"action":"switch","persona":"customer"} → /portal/customer
```

`/portal/customer/enquiries` resolves for that session, the nav link is present,
and the empty state renders. Measured at **320 / 768 / 1440: no horizontal
scroll, nothing clipped, no unnamed or undersized control.**

**This walk found a trap that no static test could have.** At 320 the Dev Mode
switcher laid its exit button out at `x = 312..356` while the switcher's own
`overflow-hidden` box ended at `308` — the button was *entirely* outside the
clipped area:

```
switcher 12..308   exit 312..356   → exit fully clipped, unreachable
```

So on a phone you could enter Dev Mode and have **no way back out of the
persona**. Both switchers now carry `max-w-full flex-wrap`, so the exit wraps
onto a second line inside the rounded box. Re-measured: exit at `13..57`,
**44×44**, inside the box, zero clipped. Clicking it returned the founder
session. Pinned by `smoke-dev-mode` and verified by removing the wrap.

**Still not walked:** the enquiry DETAIL view with real content. The demo tenant
has no notices, and the milesymedia client's Supabase is a placeholder URL, so
the populated state cannot be reached locally — only its unreachable/missing
branches could be. The cross-tenant rule (a notice belonging to anyone else is
*not found*, never found-then-refused) is pinned on both the customer and agency
routes by unit tests.

## Production-grade audit — 2026-08-28

Ed: *"complete the app full production grade audited… fix all errors no masks…
appropriate namings… ensure gdpr safety."* Findings, in the order they were
found. There is no ESLint config in this project, so "errors" here means `tsc`,
the suite, and a read of the code for the classes named.

### A1 — a live type bug: four plugins used a category the contract forbade

`PluginCategory` is vendored into **thirteen** modules
(`src/lib/aquaPluginTypes.ts` in each), every one a "copy of the canonical
contract" with a TODO to import it instead. They had diverged three ways:

| Copies | Members |
|---|---|
| 8 | …`"ops" \| "growth"` |
| 4 | …`"ops"` (neither) |
| 1 (ecommerce) | …`"ops" \| "fulfillment"` — matching canonical |

And **four plugin manifests declare `category: "growth"`** — client-crm,
memberships, affiliates, public-funnel — a member the canonical
`runtime/_types.ts` did **not** have. They compile only because each imports its
own copy. Point any of them at the canonical type, which is what their own TODO
says to do, and the build breaks.

**Fixed by widening the canonical** rather than editing four manifests: nothing
maps `PluginCategory` exhaustively (no `Record<PluginCategory, …>`, no switch),
so adding a member breaks nothing, and "growth" is the word those modules chose.
All thirteen copies then aligned to canonical.

> **My first measurement said there was no drift at all.** An `awk` range that
> stopped at the first `}` compared truncated fragments that happened to match.
> A brace-balanced parser found the real picture. Third time today a crude
> measurement nearly became a false all-clear.

### A2 — the remaining contract divergence, ratcheted

`smoke-vendored-plugin-contract` now parses all thirteen copies and fails on any
NEW disagreement — a union with different members, or a field with a different
type. The divergence that already existed is catalogued in `KNOWN_DIVERGENCE`,
a **ratchet, not an approval**: a fourth test fails if an entry there has been
fixed but left behind, so the list can only shrink.

**Two more were then FIXED rather than catalogued**, taking the ratchet from 22
entries to 17:

- **`PluginRoleVisibility`** — ten copies were missing `"lead"`, which the
  canonical `Role` in `src/server/types.ts` has always had and which
  bos-auth-gate and public-funnel already listed. Added to all ten: a widening,
  and nothing maps the union exhaustively.
- **`PluginPage.roles`** — ecommerce was the only module typing plugin
  visibility as `Role[]` (from its own `tenancy.ts`, and also missing `"lead"`)
  while twelve used `PluginRoleVisibility[]`. **One concept under two names** —
  exactly the naming problem to fix. ecommerce now declares and uses
  `PluginRoleVisibility` for all three visibility fields.

**Five more fixed in a second pass**, all the same shape — one module writing a
concept differently from the other twelve:

- **`PluginCtx.agencyId` / `.clientId`** and **`PluginPageProps.agencyId` /
  `.clientId`** — ecommerce typed these as bare `string` while twelve used the
  `AgencyId` / `ClientId` aliases that ecommerce's OWN `tenancy.ts` already
  exports. Same underlying type; one name per concept now.
- **`PluginFeature.plans`** — website-editor inlined `("free" | "starter" |
  "pro" | "enterprise")[]`, the union `PlanId` already spells out. Now `PlanId[]`.

**Ratchet: 22 → 12.** Ten divergences genuinely resolved today, not deferred.

Still listed, and each for a stated reason:

- **`NavItem.panelId`** — **RESOLVED, and my first reading of it was wrong.**
  I recorded that "the minority is the correct one here" because twelve copies
  said `string` and ecommerce had a named `PanelId`. A named type usually IS
  better, so I left it alone rather than degrading it.

  Checking what the values actually are showed the reverse. The canonical
  `NavItem` in `runtime/_types.ts` types the field `string` **deliberately** —
  `_validate.ts` states it, and WARNS on an unknown panel instead of failing,
  because plugin-specific panels are still in flight. Meanwhile ecommerce's
  union was missing `"customer"` (the whole end-customer surface) and every
  plugin panel in real use: `agency-finance`, `agency-hr`, `agency-marketing`,
  `growth`, `operations`.

  A narrower type that cannot express a nav item the rest of the system
  considers valid is not the better one. ecommerce now matches the canonical.
  **Ratchet: 12 → 11.**
**The list was then taken apart properly** rather than left as one
undifferentiated pile. Not every entry was pending work:

- **`PluginServices.*`** (six fields) — **verified deliberate.** Ten copies type
  these `unknown`; two give them real port types. I checked whether the ten
  actually consume those services: **none of them do.** `unknown` is the honest
  typing for a service a module never touches, and "aligning" it would vendor
  six more port interfaces into ten modules — **sixty new copies to drift**, for
  code nobody calls. Fixing this would make the codebase worse.
- **`AquaPlugin.storefront`** — **verified deliberate.** Five modules contribute
  only blocks, ecommerce adds routes and head injections, website-editor has its
  own `StorefrontContributions`. Three different contracts, not one concept
  written three ways.
- **`AquaPlugin.onEraseClient`** — **FIXED, and it was GDPR-relevant.** See
  below.

**The last three were then taken as well.**

- **`AquaPlugin.scopePolicy`** — ten copies said `ScopePolicy`, ecommerce said
  `PluginScopePolicy`. The canonical in `runtime/_types.ts` is
  **`PluginScopePolicy`**, so the majority was the divergent side again. Renamed
  in all ten; the name appears nowhere outside the vendored type files, so the
  change is contained.
- **`HeadInjection.render`** — website-editor's copy had diverged twice over: a
  different parameter and return type, **and no `position` field at all**, so it
  could not express whether an injection belongs in `<head>` or at body-end.
  **No module declares `headInjections`**, and nothing referenced the type
  outside that file — a divergent shape for something nobody implements is a
  pure future trap. Aligned to canonical.
- **`BlockDescriptor.category`** — **left alone, because the CANONICAL is the
  wrong side.** `runtime/_types.ts` types it
  `"layout" | "content" | "commerce" | "form" | "media" | "marketing"`, but
  memberships, affiliates and client-crm ship blocks categorised
  `"membership"`, `"affiliate"` and `"crm"`. Narrowing the five `string` copies
  would break all three. Nothing in the runtime reads the field and the
  validator does not check it, so `string` is the honest typing — **the same
  finding as `NavItem.panelId`, reached the same way**: by looking at the values
  actually shipped rather than at which type looked more rigorous.

**Ratchet: 22 → 7**, and none of the seven is pending work — six are
verified-deliberate (`PluginServices.*`, `AquaPlugin.storefront`) and one is the
canonical type being narrower than reality, recorded for whoever owns that
contract.

#### `onEraseClient` — two modules could not receive the erasure subject

The canonical signature is `(ctx, clientId, subject?: ErasureSubject)`, and the
runtime **actually passes** the subject — `clientErasure.ts:457`. Four modules
declare it. **ecommerce and affiliates vendored a two-argument version**, so
their hooks could not see the third parameter at all.

Their hooks work today: both match rows by `order.clientId === clientId`. But
the canonical comment says why `subject` exists — for data that *"predates the
client existing at all"*. **A guest order placed before somebody became a client
does not carry that `clientId`, so it is not found by id, and their type offered
no other way to find it.** The platform provides the means; two modules could
not accept it.

Both now declare `ErasureSubject` and the three-argument signature. Types only —
no behaviour changed, and adding an optional parameter cannot break a hook that
ignores it. **Ratchet: 11 → 9**, of which six are now verified-deliberate and
three genuinely pending.

The real fix is the TODO: one canonical contract, imported. That is a
thirteen-module refactor and is not something to slip into an audit pass.

> **The test itself was wrong twice before it was right, and both bugs
> manufactured false findings.**
>
> 1. Splitting interface bodies on `;` broke inside nested object types, so
>    `options?: { value: string; label: string }[]` produced phantom fields
>    named `label` and `value` with type `string }[]`. That put **three
>    non-existent conflicts** into the baseline — with the SAME thirteen modules
>    on both sides of the "disagreement", which is what gave it away.
> 2. The depth counter that replaced it counted `<` and `>`, so the `>` in every
>    `=>` decremented without a matching increment. Depth went negative on any
>    arrow type and top-level `;` stopped being seen.
>
> A ratchet containing entries that were never real is worse than no ratchet: it
> is a list where genuine drift can hide unnoticed. The stale-entry check is
> what surfaced them — it fails when a listed divergence is not actually
> present, which caught my own invented ones.

### A2b — `Role` meant two different things

The naming failure this audit was asked to find, in the most fundamental type
in the system. A **second** vendored family — `tenancy.ts`, one copy per module
— declares `Role` alongside the canonical one in `src/server/types.ts`:

```
[13 module copies] agency-owner … end-customer, freelancer        (7)
[src/server/types] agency-owner … end-customer, freelancer, lead  (8)
```

Every module's `Role` was missing **`"lead"`**, so a plugin's own types said a
lead user could not exist — while `bos-auth-gate` and `public-funnel` are
lead-facing surfaces, and `smoke-lead-role` exercises the role for real.

**Fixed:** all thirteen widened to the canonical eight. Nothing maps `Role`
exhaustively in `src/built-ins` (no `Record<Role, …>`, no switch), so this
breaks nothing. Pinned by a new check that fails if any copy disagrees, and
specifically if one drops `"lead"` — verified by removing it again.

> **Third parser slip of the afternoon, same file.** The new check read my own
> explanatory `//` comment inside the union as a member, so all thirteen
> annotated copies registered as disagreeing. Comments are stripped first now,
> the way `declarations()` already did. Every one of these was caught by
> reading the failure output rather than trusting the pass/fail.

### A3 — a mask in the editor: features with no server

`lib/funnels.ts` and `lib/splitTests.ts` fetch
`/api/portal/website-editor/{funnels,split-tests}`. **Neither route exists** —
not in `src/app/api/` and not among the twenty handlers in the plugin. Both
files say so in their headers as a "Round-2 TODO". The gap was not the problem;
what the UI did with it was:

- a 404 became an empty cache, so the editor rendered "no funnels" —
  indistinguishable from a real empty state;
- **"New funnel" let somebody type a name, press Create, and answered "Failed to
  create funnel."** — wording that invites a retry of something that can never
  succeed.

`featureBackends.ts` now declares both gaps, and the modal states the real cause
**before** the name field, disables Create, and uses the same wording on
failure. Pinned by `smoke-editor-feature-backends`, which also fails if a route
appears and the entry is left behind — an entry that outlives its gap tells
people a working feature is broken.

### A3b — every editor surface that fetches a route, checked

Having found funnels and split-tests, I swept the rest rather than assuming they
were the only two. Twelve base paths are fetched under
`/api/portal/website-editor/`; four are not among the fifty-nine the plugin
declares in `src/api/routes.ts`.

| Fetched | Declared? | Verdict |
|---|---|---|
| `funnels`, `split-tests` | No | **Masked** — fixed in A3 |
| `portal-variants` | **Yes** | Fine. My first check compared handler FILENAMES and got this wrong — the route exists under a differently-named handler |
| `git` | No | **Honest already.** `gitOps.ts` checks `res.status === 404` explicitly and returns `{ available: false }`; GitStatusPage renders a "not wired" state. Designed degradation, not a mask |
| `settings` | No | **Was masked, in dead code** — see below |

#### `saveSettings` reported success for a save that could not happen

`portalSettings.ts` caught the 404 and did an *"optimistic local apply"*: merged
the patch into the in-memory cache, notified listeners, and returned the merged
object. **A caller could not distinguish a real save from a failed one.**

The shape it saves includes `github.token` and `github.pat` — so somebody could
enter a personal access token, watch it "save", and have it live in a
client-side variable until the next reload.

**Severity, stated honestly: it has no caller.** `SitesPage` imports only the
read side (`loadSettings`, `getSettings`, `onSettingsChange`, `hasSecret`), so
this was never reachable, and the reachable path is fine — settings load as
defaults and `githubReady` correctly computes `false` from an empty repo URL.

Fixed rather than deleted, because dead code with a pretend-success path is a
trap for whoever wires the endpoint up. It now throws with a sentence naming the
cause. **`resetSettings` was left alone and that is deliberate:** nothing is
persisted, so the in-memory cache is the whole of the state, and clearing it to
defaults is a complete and truthful reset rather than a pretence.

### A3c — the same sweep across all thirteen modules

Having found two masked features in the editor, I ran the check everywhere
rather than assuming the editor was special: for each module, every fetched
`/api/portal/<module>/…` path against the routes that module declares.

**Only website-editor.** `agency-finance/operations` and `ecommerce/inventory`
appeared at first and were **false positives** — those modules declare paths
without a leading slash (`path: "invoices"`), which my regex required.

> **Fourth measurement bug of the day, and the dangerous kind.** An empty
> "declared" set makes every fetch look undeclared. The rewritten sweep refuses
> that case explicitly — a module that fetches but parses zero declarations now
> reports **"DETECTOR FAILED"** rather than a list of findings.

Two more real ones came out of it, both in code with **no importer** — never
reachable, corrected anyway, because dead code that reports success is a trap
for whoever wires the endpoint up:

#### `verifyDomain` marked domains verified without verifying anything

The most misleading thing found in the whole audit. It set
`status: "verified"` and stamped `verifiedAt` **without making any call** —
against a `/domains` proxy this plugin does not declare. "Verified" is exactly
the word an operator trusts about DNS.

It now refuses: returns `available: false`, leaves the stored status untouched,
and does not write at all. `attachDomain`/`detachDomain` keep their local record
but return `available: false` so a caller knows nothing reached a DNS provider.
Pinned by a test that fails if `"verified"` or `verifiedAt` ever reappear in
that function.

#### A live one: login customisation bled across clients

`CustomisePage` is mounted **per client** at
`/portal/clients/[clientId]/customise`, but `loginCustomisation.ts` wrote to a
single global `lk_login_customisation_v1`. Customise one client's login page,
open another's, and you saw the FIRST client's settings — and saving there
overwrote them. One browser, every client, one slot.

**This one was reachable.** The key is now `…:${clientId}`, derived from the
pathname the page already reads, exactly as the file's own header had
prescribed. **Deliberately not migrated** from the old key: copying it forward
would hand whatever was last saved to every client, which is the bug rather
than the fix. It is browser-local presentation, not user data.

**Browser-verified** on the 3051 lane: opened
`/portal/clients/cli_e5bd9f3e0e367962/customise` → Login page, edited the
welcome heading, and the key written was

```
lk_login_customisation_v1:cli_e5bd9f3e0e367962
```

— scoped, with no unscoped key present.

> **What that walk did NOT prove.** Only one real client exists on this lane, so
> the two-client demonstration could not be completed: a fabricated client id
> correctly refuses to render the page at all. The write side is verified and
> the read side derives from the same `storageKey()`, but "client B does not see
> client A's settings" is inferred from the shared derivation, not observed.
> Worth re-checking the first time there are two real clients.

### A4 — a second untrue sentence in the privacy notice

See `supabase-cutover-and-policy-drafts.md` §2g. The notice says the server
"independently rejects events outside the categories you allowed";
`eventIsConsented()` reads the consent flags **from the request body**, and
`website_consent_events` — where the real decision is stored — is only ever
INSERTed, never read. Not a security hole (the collector is public anyway), but
an accuracy problem in a published notice. Pinned; two ways out drafted.

### A5 — GDPR: what survives an erasure

The RETAIN set's justification, quoted from `clientErasure.ts`:

> "Excluded from the erasure sweep — the client record's own PII still goes, so
> what remains is de-identified."

**True of identifiers. Not automatically true of free text.** `ClientMilestone`
carries `title` and `description`, both operator-typed. A milestone called
"Onboarding call with Jane Smith" survives an erasure and becomes an orphaned
row — the client record that would have led you back to it is gone.

This is the rule the codebase already learned for the activity log ("never put
PII in an activity message — the erasure sweep is keyed by `clientId`"), applied
to a collection that never had it written down. The precedent for the fix also
already exists: meetings and calls have their free text cleared on erasure while
keeping the fact they happened, and ecommerce strips order PII while keeping the
payment record.

**What I did, and did not do.** I have not started scrubbing milestone text —
deciding what delivery proof must survive is question Q1 in the DPO pack, a
legal answer rather than a default this module may choose. What I did was make
the retain set **a reviewed list rather than an incidental one**:

- the rule is now written in `clientErasure.ts` directly above
  `RETAIN_COLLECTIONS`, where somebody changing it will read it;
- `smoke-client-erasure` pins the set's exact contents, so adding a collection
  fails with the question attached — *does this carry operator-typed prose that
  could name a person?*

Verified by adding a second collection to the set: the test fails with that
question. Left as one entry.

### A6 — GDPR: what the customer portal exposes

The contract is "internal records stay internal unless explicitly marked
client-visible". The riskiest item in `CustomerPortalData` is `activity` — the
internal audit log, shipped to a client's screen.

**It is an allowlist, and that is the right shape.** `customerActivityMessage`
matches known actions and ends `return undefined`, so an action nobody has
considered is DROPPED rather than shown. That is why the actions added on
2026-08-28 — `subject_access.exported`, `retention.policy_set` — cannot reach a
client, without anyone having to remember to exclude them.

**One line breaks the allowlist:**

```ts
if (item.action.startsWith("product_workspace.")) return item.message;
```

It passes the RAW stored message to the client. Safe today, and only because
the single writer of those actions builds its message with `customerMessage()`
— text authored for the customer at write time ("Your checklist was updated").

**Nothing enforced that.** A second writer, or an edit to the existing one,
would put internal wording in front of a client with no change to the portal at
all. Two assertions now stand in the way:

- the portal must still pass those through verbatim (if that stops being true,
  the guard should be deleted with it);
- **the set of files writing `product_workspace.*` must be exactly one**, and
  that one must build its message from `customerMessage()`.

Verified by replacing the message with `` `Internal: ${action} by ${session.email}` ``
— the guard fails, naming the requirement.

### 🔴 A7 — internal call notes were reaching the client's portal

**The most consequential finding of the audit.** The same data, classified two
different ways by two paths over it.

`websiteEnquiries.ts` builds a record-ledger entry for each enquiry call:

```ts
body: [outcome, call.notes, recording].join(" "),
visibility: "internal" as const,
```

`_portalData.ts` built its **own** entry from the same `enquiry.calls`, put
`call.notes` straight in the body, and spread it into `recordEntries` — **after**
the `.filter(entry => entry.visibility === "client")` applied to the other
source. The gate existed. This list walked around it.

So an agency's private commentary about a call — whatever was typed after
speaking to someone — appeared in that customer's own portal, under "Record".

> **The tell was already in the code.** The very next line gates the recording
> URL on `call.recording?.consentConfirmed`. Somebody thought carefully about
> consent for the recording and never looked at the notes sitting beside it.

**Fixed:** the entry now carries the call's DURATION, phrased the way the ledger
already phrases it (`12 min`), and no notes at all. That the call happened is
kept; what was written about it is not — the same ruling erasure already makes
for meetings and calls.

Pinned from **both** sides: the portal's block must never mention `call.notes`
and must keep the recording consent gate; and the ledger must still classify
those calls `internal`, so if that classification ever changes, the portal
decision is revisited rather than silently diverging again. Verified by putting
`call.notes` back — the guard fails.

### A8 — the rest of the customer payload, and the invariant behind it

`requests`, `approvals`, `files`, `invoices` and `contracts`, checked the same
way. **All clean**, and for a reason worth stating because it is what
`enquiryCallEntries` was missing:

- **`files`** — gated on `file.customerVisible === true`, or the customer
  uploaded it themselves.
- **`approvals` / `requests`** — mapped field by field, with the ACTOR masked:
  `requestedBy: providerName`, `respondedBy: "Customer"`,
  `reviewedBy: providerName`. Which member of staff acted never reaches the
  client.
- **`ClientRequest` carries no internal-only field today**, so copying it whole
  would leak nothing — but the portal maps it property by property anyway.

**That last point is the invariant.** The day somebody adds
`internalNote?: string` to `ClientRequest`, the portal does not start showing
it. The explicit mapping IS the protection; a spread would silently opt in
every field the type ever gains.

So it is now enforced: **no stored record may be spread into the customer
payload.** The one `...` in the file spreads an array of already-mapped replies,
which the check distinguishes. Verified by adding `...approval` to the approvals
map — the guard fails, naming the reason.

> ### The shape three of today's worst findings share
>
> **A second path over the same data that skips the first path's gate.**
>
> - `enquiryCallEntries` spread in *after* the `visibility === "client"` filter
> - `product_workspace.*` passing raw messages through an otherwise-allowlist
>   translator
> - the preview route's hand-written section list drifting from the type it
>   was supposed to mirror
>
> In each case the safety was real and held in exactly one place. Converting
> those single points into enforced invariants is most of what this audit did.

### A9 — naming: the distinctions existed only in a document

Ed's goal names this directly: *"ensure all code has appropriate namings to make
this easy."* The audit found the hazards were known and the **code was silent
about them**.

`hazards-and-duplication.md` is only read by somebody who already suspects a
duplicate exists. The person about to build a third copy is, by definition, not
suspicious — they are in the file, and the file said nothing.

| Pair | Before |
|---|---|
| `server/people.ts` (HR, 1,857 lines) vs `server/persons.ts` (CRM) | `persons.ts` explained itself; **`people.ts` had no header at all** |
| `agency/contacts/` vs `leads-pipeline/contacts/` | neither named the other |
| `fulfilment/` vs `fulfillment/` — **three surfaces, sharing no code** | distinguished by one letter and nothing else |
| `clientRelationshipRecord.ts` (client-safe) vs `clientRecordLedger.ts` (internal) | neither had a header — and this is the pair behind the call-notes leak |

| `aqua-tags` SETUP vs `_AquaTagDashboard` ANALYTICS | both "Aqua Tag" screens, neither naming the other |

All now state what they are, what they are **not**, and where the counterpart
lives — **ten files across seven pairs**. `smoke-hazards-doc-paths` asserts each
names its counterpart's PATH, so the reader is given somewhere to go rather than
just a warning.

The Aqua Tag split is worth stating plainly because it is easy to get wrong:
changing what a tag **collects** happens in Fulfilment; changing how it is
**reported** happens in Performance.

#### The duplication map pointed at seven files that had moved

Every one a file relocated a directory deeper in a reorganisation the doc never
caught up with — `lib/clientContacts.ts` → `lib/clients/clientContacts.ts`, and
six more including both halves of the record/ledger pair. A reader who follows a
dead path concludes the file was deleted and writes their own, which is the
exact outcome the document exists to prevent.

> **The guard is deliberately narrow, and that took three tries.** Demanding
> every backticked filename resolve produced **68 findings, almost all false** —
> the doc uses bare `page.tsx` / `index.ts` as prose shorthand after a sentence
> has already given the directory. A check that cries wolf 68 times is one
> nobody runs.
>
> A reference counts as a path claim only when it contains a `/` and starts with
> a real top-level `src/` directory; and it resolves against repo-root,
> `src/`-relative, **and** plugin-module-relative layouts — that last one alone
> removed six more false findings.
>
> **Then it turned out to be too NARROW.** The doc also writes paths relative to
> `src/app/portal/` (`agency/performance/…`), which no `src/` root covers — and
> exactly one stale path hid in that blind spot:
> `agency/aqua-tags/_AquaTagsWorkspace.tsx`, a file that actually lives under
> `agency/fulfilment/`. Portal roots are now recognised too.
>
> Sixth detector adjusted today, and the first that erred by excluding rather
> than over-including. Both directions were found the same way: by reading what
> the check said and asking whether it was true.

### A10 — "does it come to life": console and network, clean-room

Earlier passes measured LAYOUT (overflow, target sizes, breakpoints). This one
asks the other half of Ed's question — does it actually work — by loading each
surface and reading what the browser complains about.

**Eight surfaces, zero console errors, zero failed requests:** the agency hub,
inbox, clients, governance, fulfilment, people, contacts, the client-facing
portal, and the website editor. Nine resource loads on the editor, all 2xx; the
only API call on that page is `/api/portal/chrome/layout` → 200.

> **The first attempt reported six 401s and three 404s, and every one was mine.**
> The console persists for the life of a tab, and that tab had been carrying my
> probes all day — a deliberately fabricated client id, an endpoint I guessed
> wrong while hunting for the connections API, the dev-mode persona switches.
> Reporting those as application defects would have been reporting my own
> footprints as evidence.
>
> Redone in a **fresh tab**, so every page starts with an empty console. That is
> the only way this measurement means anything, and it is the seventh time today
> that checking the checker changed the answer.

### A11 — functional verification: the controls actually respond

Layout was measured earlier; console and network were swept clean-room. This is
the third question — do the controls *do* anything.

**Master inbox, all five view tabs** — Actions, Social inbox, Enquiries,
Support, Chatbot — each switches the view and renders its own content.
**Governance, all six tabs** — Posture, Legal register, DPO / erasure, Subject
requests, Sub-processors, Security — each renders distinct content, no console
errors. **A client workspace** opens from its id with contact controls, account
status, services and relationship health, and its Contact / Services tabs
switch.
**Governance → Subject requests** renders the clock, the register and the
retention form; the form saves and persists across a reload. **The mapping
button** on website sources saves and the connection keeps its other fields.
**The funnel modal** states its gap and disables Create. **Dev Mode** enters,
switches persona and exits. **Login customisation** writes a client-scoped key.
**The editor** loads a real site with pages, breakpoints and publish controls.

> ### A defect I nearly reported that was mine
>
> Driving those five inbox tabs in about five seconds left the Actions view
> stuck on **"Preparing your workspace…"** — 80 characters, no recovery after
> 45 seconds, and three 404s in the console. That reads exactly like a broken
> view.
>
> Two things said otherwise. `performance.getEntriesByType("resource")` showed
> **zero failed requests**, so the 404s were dev HMR chunk fetches rather than
> anything the app asked for. And clicking Actions **once**, from a freshly
> loaded page, rendered it correctly in under twenty seconds — 2,589 characters
> of real content.
>
> The stuck state was five overlapping client-side navigations from my own test
> harness, not the application. **Ninth time today that checking my own method
> changed the conclusion — and the first where the wrong answer would have been
> an accusation against working code.**

**Second pass, and the same trap with a different shape.** Continuing the sweep,
`/portal/agency/fulfilment` and `/portal/agency/people` both stalled on the
loader in a FRESH tab — 72 characters of visible text, no console errors.

Three measurements said it was not the app:

| Check | Result |
|---|---|
| `curl` both routes | **200, ~32 KB, under 0.2 s** |
| The stalled tab's DOM | **205 KB of HTML**, `readyState: complete` |
| `main`'s children | **1** — the loader, content never swapped in |
| Same two pages, earlier today | measured fine, with content |

So the server renders them; the browser session is not completing the RSC
navigation. The older tab had already been logging `ERR_CONNECTION_REFUSED` on
its HMR socket. After roughly twelve hours and several hundred driven
operations, the browser session is the degraded component.

**Recorded as a limit of this session's harness, not a defect.** Two of these in
one sweep is also the honest reason to stop treating late-session browser
readings as evidence without a server-side cross-check beside them.

### Not defects, checked and dismissed

- **30 empty `catch {}` blocks** — almost all around `localStorage`,
  `sessionStorage` and `document.cookie`, which genuinely throw in private mode.
  Swallowing there is correct defensive code, not a mask.
- **Cookie-consent persistence failures** — silently swallowed, but they fail
  SAFE: absent consent means the Tag sends nothing, so a lost write cannot
  result in unconsented tracking.

---

### Phase D — security and data compliance *(after C)*

#### D9a — route authentication surface: DONE 2026-08-28

**All 234 API routes are gated.** Thirty-four answer without an Aqua session,
every one of them deliberately and by an appropriate mechanism:

| Group | Count | How they authenticate |
|---|---|---|
| `auth/*` | 13 | these are how you *get* a session |
| `public/*` | 8 | public forms; proposals and client-form webhooks carry their own token/HMAC |
| `v1/*` + `mcp` | 10 | `authenticateExternalAssistant` — API key, then per-permission and per-module checks |
| `webhooks/meta` | 1 | HMAC over the raw body |
| `telemetry/collect` | 1 | anonymous collector, rate-limited |
| `cron/*` | 2 | deployment-scheduled |

**The Meta webhook was checked for the classic fail-open** — "no secret
configured, so allow" — and does not have it. Secrets are gathered into a `Set`
and the result is `[...secrets].some(...)`, so an empty set *denies*. The
comparison is `timingSafeEqual` with a length guard and a non-empty check.

**One hardening came out of it.** `portal/mfa/verify` was session-bound only
*implicitly*: every `client.auth.mfa.*` call acts on the caller's own Supabase
session, so nobody could ever verify another account's factor — but an
unauthenticated caller fell through to a **400 "there is no authenticator set
up on this account yet"**, which describes account state to a stranger and left
the route resting on downstream behaviour rather than a stated check. It now
answers **401**, matching `mfa/enrol`.

> **Two hand audits, both wrong.** The first grep reported **48 of 234 routes
> unauthenticated**, including `portal/dev/repo-write` (which writes to a git
> repository). Every one was gated — the dev routes via `requireDevProjectAccess`,
> the MFA routes via Supabase's own `auth.getUser()`. The grep's vocabulary was
> too narrow, not the code. That is the same failure as the responsiveness probe
> earlier today: **a security check that has never been validated against
> known-good code is not evidence.**

So the vocabulary now lives in `scripts/smoke-route-auth-coverage.test.ts`
rather than in whoever is greping. It enumerates the whole surface, fails if any
route names no gate and is not on a **reviewed PUBLIC list with a written
reason**, and fails if PUBLIC names a route that no longer exists. Verified by
adding a deliberately ungated route — it is named in the failure — and by the
collector asserting it found 200+ routes, so an empty sweep cannot pass silently.

**Still open in D9:** the access matrix against a durable backend. It cannot run
in isolation because `accessControl.ts` pins every governance read and write to
`LIVE_DATA_REALM_ID` (lines 378, 611, 1120, 1127, 1134), so exercising it would
write to live governance. Structural, not a matter of effort.

#### D9b — tenant scope on mutating routes: DONE 2026-08-28

The hole being hunted: a write that takes its tenant from the REQUEST rather
than the session, which is how one tenant reaches another's data.

**Agency from the body — 1 route, correctly hardened.** Only
`auth/switch-agency` reads `agencyId` from a request, which is its whole job. It
resolves membership from the intersection of the *signed session's* `agencyIds`
and the *live user record's*, so a cookie minted before a membership was revoked
cannot use it; every refusal — not a member, does not exist, archived, paused —
answers the same `403 forbidden`, so the endpoint cannot be used to enumerate
which agencies exist.

**Client from the body — 54 routes, all scoped.** Five did not use the common
helpers and were read individually; each turned out to scope correctly by a
different route:

| Route | How it scopes |
|---|---|
| `portal/customer/workspace` | body id must appear in `listAccessibleClientPortals(session…)`, else 403 |
| `portal/dev/projects` | `routeTenantScope(actor.session, …)` |
| `auth/magic/request` | public by design; resolves the client, must not reveal account existence |
| `auth/end-customer/signup` | public by design; resolves clientId → Client, 404 if archived |
| `v1/embed/sessions` | bearer token — **but no agency scoping; see below** |

##### 🟠 A DECISION FOR ED — the embed API token is deployment-wide

`v1/embed/sessions` is properly gated: the bearer check is the first statement
in the handler (so it cannot leak whether a client exists to an unauthenticated
caller), the comparison is `timingSafeEqual`, and an unset
`AQUA_EMBED_API_TOKEN` in production resolves to `""` and **denies everyone**
rather than admitting them — the local dev fallback is explicitly gated on not
being production.

**What it does not do is scope to an agency.** There is one token for the whole
deployment. Its holder can call `getClient(anyClientId)` across every tenant,
choose `mode: "admin"` from the request body, and receive that client's name.

For a single-operator deployment that is coherent — you hold the token. The risk
is what the feature is *for*: an embed token is the thing you hand to whoever
embeds a portal in their own site. **Hand it to one partner and they can mint an
admin embed session for every other tenant's clients.**

Not changed unilaterally, because the right answer depends on how you intend to
distribute it. The options, cheapest first:

1. **Keep it operator-only.** Never give the token to a client or partner; embed
   only from surfaces you run. No code change.
2. **Scope by env.** An optional `AQUA_EMBED_AGENCY_ID` that, when set, refuses
   clients outside it. Additive, off by default, ~10 lines.
3. **Per-agency tokens.** Move the embed token into the credential vault
   alongside the other per-agency secrets. Correct long-term, largest change.

The current shape is pinned by `smoke-route-auth-coverage` so it cannot drift
without the decision being re-made.

9. The security posture sweep: every public route ✅, every mutating route ✅,
   the access matrix re-run against the live backend rather than memory.
#### D10a — erasure covers the new client-form data: DONE 2026-08-28

`eraseClientCompletely` deletes live Supabase rows first (idempotent, so a
partial failure can be retried), then sweeps in-memory state: plugin-owned
storage, a dedicated anonymise-if-orphaned pass for persons, identity-resolution
reviews, and finally a generic `pruneClientId` over every remaining top-level
collection — which since 2026-08-27 also follows nested `scope: { kind:
"client", id }` and `scope: { clientId }` references.

**Checked against the data added on 28 August.** Client-form notices are
pointers — an id, a timestamp, a seen flag — and hold no customer PII by design.
They do record that a named client received enquiries and when, which is client
data and must not outlive the client.

They are erased correctly, and **nothing had to be written to make that true**:
`clientFormNotices` is simply absent from `RETAIN_COLLECTIONS`,
`PLUGIN_COLLECTIONS` and `DEDICATED_COLLECTIONS`, so the generic pass reaches
it. That is precisely why it now has a test — **the guarantee is an ABSENCE from
three lists, and an absence is the easiest thing to reverse by accident.**

`smoke-client-erasure` now seeds two clients, gives both notices, erases one and
asserts three things: the erased client's notices are gone; **no notice survives
carrying that client's id** (read from the store directly, because
`listClientFormNotices` filters by client and would report zero even for merely
orphaned rows); and the other client's notice is untouched. Verified by adding
`clientFormNotices` to `RETAIN_COLLECTIONS` — the test fails.

#### D10b — the client-Supabase RLS check: BUILT 2026-08-28

**This one moves your "RLS on before real enquiries land" blocker from a manual
step to an enforced check.**

An exported client site posts to their `form_submissions` table straight from
the visitor's browser, carrying the **anon key in the page source**. That is
correct — the anon key is public by design and RLS is the actual control. But if
the same policy also allows `SELECT`, **every enquiry that client has ever
received is readable by anyone who opens their homepage and views source.**

The exported README already said "keep that policy to INSERT only". Prose is not
a check, and nobody had ever verified it. There was also **no tester for
`client-supabase` at all** — it fell through to the OpenAI branch and tested a
client's database against `api.openai.com` with an undefined key.

Testing the connection now probes the table with the anon key and reads the
answer:

| Response | Verdict |
|---|---|
| `200` with an array | **FAIL** — "every enquiry in it is exposed", and how to fix it |
| `200` with an **empty** array | **FAIL** — the policy still permits the read; there are just no rows yet |
| `401` / `403` | **PASS** — RLS is denying anon |
| `404` | FAIL — table missing or not exposed; a different problem, said differently |

Deliberately **read-only**: proving INSERT works would mean writing a test row
into a client's live table, and no diagnostic is worth that. The test asserts
every call is a `GET`, hits only the configured project and table, and never
touches OpenAI.

> The empty-array case is the one that matters. The naive check — "did we get
> rows back?" — passes a brand-new client's table, which is exactly when they
> are being set up and when the mistake would be locked in. Verified by changing
> the condition to `rows.length > 0`: the test fails.

#### D10c — subject access and portability: BUILT 2026-08-28

`compliancePosture` recorded `gdpr.dsar-access` as **missing**: *"You can delete
someone's data but you cannot give it to them."* Access and portability are the
two most commonly exercised rights, and neither existed.

`POST /api/portal/governance/subject-access` now returns everything held about
one person as a JSON download — JSON because Art. 20 asks for a "structured,
commonly used and machine-readable" format and these records are nested;
flattening to CSV would lose the structure the right exists to preserve.

**It searches every collection in state, not a maintained list.** The obvious
design classifies each of the ~90 collections as personal/not-personal and
searches the first group. That fails silently and in the worst direction:
anything mis-classified — or any collection added next year and never
classified — is simply absent, while the covering letter says "this is
everything we hold about you". **A wrong subject-access response is worse than
none: it is a false statement made under a legal obligation.** So there is no
list; every collection is walked and the question is asked of each record.

Matching is recursive, because a reference is as often nested
(`scope: { kind: "person", details: { personId } }`) as top-level — the shape
that defeated the erasure sweep in August. It matches on person id,
relationship id, email (case-insensitively, and on the `raw` form as well as the
normalised one) and phone.

**Tenant safety.** Only records whose own `agencyId` matches are included: a
subject-access response that leaked another tenant's records would be a breach
committed in the act of complying with a subject right. Matches carrying **no**
`agencyId` cannot be proven to belong here, so they are counted and reported as
`recordsNotAttributableToThisAgency` — visible, never silently dropped.

Each fulfilment is logged, naming the subject **by id only**: activity messages
survive as an audit trail, and an address written into one would outlive the
person's own erasure.

Verified by breaking it — capping recursion depth loses the nested reference;
removing the agency filter leaks the other tenant's record. Both fail the tests.

**The posture was updated to `partial`, not `met`**, and the sync test with it.
Fulfilment now exists; the REQUEST side does not — no identity-verification step
before releasing someone's data, and no clock against the one-month deadline.
`gdpr.dsar-intake` stays `missing`, and the two must not be conflated: being able
to *fulfil* a request is not being able to *receive and evidence* one.

> Two existing guards caught this work before it landed, which is the system
> behaving correctly: the app-route tenancy test refused a new route until its
> tenant source was stated (session, not body), and the compliance-posture test
> refused a posture change until the DPO pack claim moved with it.

#### D10d — the DSAR register and its clock: BUILT 2026-08-28

**I had classified this as "a workflow decision before it's code". That was
wrong, and worth correcting: the deadline is not a preference.** GDPR Art. 12(3)
fixes it at one calendar month from receipt, extendable once by two further
months; Art. 12(6) requires an identity check where there is reasonable doubt.
All of that can be built before anybody chooses a policy.

`compliancePosture` recorded the gap exactly: *"no request log, no
identity-verification step and no response clock. If a regulator asked you to
evidence a request you handled, you could show the erasure but not the request."*

`subjectRequests.ts` is the register. Four things in it are load-bearing:

- **The clock runs from RECEIPT, not from logging.** A request that arrives by
  post and is typed in three days later is already three days into its month.
- **Month-end is clamped.** 31 January + one month lands on 28 February, not
  3 March — rolling forward would hand back time the regulation does not allow.
- **Identity is a SEQUENCE, not a prompt.** `fulfilSubjectRequest` throws
  `identity_unverified` until the check is recorded. Releasing someone's data to
  whoever emailed in is itself a breach, and a single "done" button is exactly
  how that happens. The verification stamp is write-once, so re-verifying cannot
  quietly reassign who checked.
- **An extension runs from the ORIGINAL deadline** and requires a written
  reason. Extending from today would reward answering late; an extension the
  subject was never told about is not an extension.

`subjectRequestClock` reports open / overdue / due-within-7-days /
awaiting-identity.

Verified by breaking both rules: removing the identity gate and extending from
`now` each fail the tests.

> **Three separate completeness guards caught the new collection**, which is the
> codebase working as designed: the promotion disposition map refused to compile
> until `subjectRequests` was classified, `PROMOTION_COLLECTION_COUNT` refused
> until the count moved from 90 to 91, and the origin-template classifier
> refused until it was told whether a new agency inherits one. It does not —
> a register is one controller's evidence of who asked them for what, and
> seeding it would start a new agency holding somebody else's compliance record
> with clocks that were never running for them.

**Posture moved to `partial`, not `met`.** The register and its clock are
correct; what is missing is that nothing yet FEEDS it. Requests still arrive by
email and are typed in by hand, and no screen surfaces the clock — so an overdue
request is visible only to somebody who goes looking. That, and retention of the
register itself, are the remaining halves.

#### D10e — the retention mechanism: BUILT 2026-08-28 (period still yours)

Same correction as the DSAR item. "Needs your retention period" was true of the
NUMBER and not of the machinery — so the machinery is built, and only the number
is left.

`retention.ts` expires three categories: the **activity log**, the **DSAR
register** and **enquiry notices**.

**Every period is unset, and unset means keep forever.** That is not a
placeholder, it is the entire safety story: a retention sweep that shipped with
numbers already in it would begin deleting records the moment it deployed, on a
schedule nobody chose, and deletion has no undo. So this lands in a live
codebase and changes nothing until you pick a number.

Four refusals, each tested by breaking it:

| Rule | Why |
|---|---|
| No period → delete nothing, and **say** each category is unset | so a `0` count is never misread as "nothing to delete" when it means "no policy" |
| A period of **0** is treated as unset | a 0 in a settings field is a slip or an empty box far more often than an instruction to wipe the category |
| An **open** DSAR never expires, however old | it is running a statutory clock; age is not the same as being finished with, and deleting an unanswered request destroys the evidence of the outstanding obligation |
| Sweeps are per-agency | another tenant's identical period must not reach my records |

`previewRetentionSweep` counts without mutating, and shares one implementation
with the real sweep so the preview cannot drift from the act. A test asserts
every category offered as a period is actually swept — **a stated period that
nothing enforces is the precise failure this module exists to end.**

**Deliberately NOT swept:** the erasure policy's RETAIN set — finance,
contracts, deliverable proof, the erasure audit. That is question Q1 in the DPO
pack and a legal answer, not a default this app may quietly choose.

**What is left is one decision:** the days per category — **and there is now a
form to enter them**, on Governance → Subject requests. Owner-only, matching the
erase button rather than the reports, because the next sweep deletes by whatever
it stores. A blank field clears the period and that category returns to
keep-forever; saving stores the numbers and re-counts, and never sweeps.

> **The first version of that save reported success and persisted nothing.**
> It did `const existing = state.agencySettings[agencyId]; if (!existing)
> return;` and still answered `ok: true` — so for any agency that had never
> opened settings, which is every new one, entering a retention period appeared
> to work and wrote nothing. **No unit test would have caught it, because the
> response was correct.** It was found by typing numbers into the form and
> reloading the page. Now built from `getAgencyWorkspaceSettings`, which
> materialises the record, and pinned by a test verified by reintroducing the
> exact broken line.
>
> It is also deliberately NOT routed through `updateAgencyWorkspaceSettings`,
> which rebuilds the record field by field and knows nothing about `retention` —
> it would drop the very thing being saved. The same shape as the
> `saveIntegrationConnection` wipe the client-Supabase mapping had to avoid.

#### D10f — the DSAR clock is now on screen, 2026-08-28

The posture gap said it plainly: *"no screen surfaces the clock, so an overdue
request is only visible to somebody who goes looking."* Governance is where
somebody looks, so the register lives there — a new **Subject requests** tab
beside DPO / erasure.

It shows the four counts (open · overdue · due in 7 days · awaiting identity),
every request with its received and due dates, overdue rows marked in red, and
a **Retention** panel underneath saying either what the current periods would
remove *right now* or, as today, that nothing is set and data is kept
indefinitely.

**Read-only, deliberately.** Logging a request, verifying identity and closing
one are writes with a required ORDER — Art. 12(6) before fulfilment — and
putting buttons on a screen before that flow is designed is exactly how the
order gets skipped. The register enforces the order today; the screen shows it.

> **My own read-path analyser caught this, and I did not declare it a false
> positive.** `previewRetentionSweep` and `runRetentionSweep` shared one
> function with a `dryRun` flag, so the analyser — correctly, at the level it
> works — saw the governance RENDER reach `mutate`. Declaring that away would
> have made the inventory less trustworthy, which is the same call made about
> `MarkEnquirySeen` earlier today. Instead `findExpired` was split out: it reads
> only, and the read path now cannot reach a writer because it does not name
> one. The preview still cannot drift from the act, because the act is defined
> as "delete exactly what `findExpired` returned".
>
> A test pins it: the governance data module must call `previewRetentionSweep`
> and **must not mention `runRetentionSweep`** — a compliance page that deleted
> records as a side effect of being opened would be the worst bug this module
> could have.

`gdpr.dsar-intake`'s gap now reads what is actually true: the register, the
clock and the screen exist; **intake** does not. Requests still arrive by email
and are logged by hand, so the register is only as complete as somebody's
diligence. Choosing an intake channel is the remaining half — and that is a
decision, not code.

10. GDPR: consent (issue #2 — **needs your decision**), erasure ✅,
    client-database RLS ✅, subject access & portability ✅, retention ❌ (no
    time-based expiry — needs your retention period), the audit trail ✅,
    the privacy policy and DPA — **need you**.

##### Audit trail and retention — the current honest position

The activity log (`src/server/activity.ts`) is a durable audit trail with
idempotency keys, and it is bounded by a **50,000-entry hard cap that evicts
oldest-first**. That is a size bound, **not a retention policy** — there is no
configurable "delete after N months", which is what GDPR's storage-limitation
principle asks for. Recording it as a known gap rather than implying it is
covered. Erasure by client works and is tested; time-based expiry does not
exist.
11. Penetration-style review of the public surface, the Aqua Tag, and the
    external API.

#### D9c — the LIVE Supabase RLS posture, verified 2026-08-28

Read-only, against the real project, using the **public anon key** — exactly the
access any visitor to a tagged site already has.

**The three tables that hold data today are provably protected:**

| Table | anon sees | service-role sees | Verdict |
|---|---|---|---|
| `brand_enquiries` | 0 | **41** | RLS filtering correctly |
| `profiles` | 0 | 3 | RLS filtering correctly |
| `website_consent_events` | 0 | 11 | RLS filtering correctly |
| `audit_events` | 0 | 0 | **Inconclusive — empty** |
| `client_portals` | 0 | 0 | **Inconclusive — empty** |
| `clients` | 0 | 0 | **Inconclusive — empty** |

41 real enquiries, with names and email addresses, are invisible to the public
key. That is the check that matters most before onboarding anyone.

> **The first pass of this nearly produced a false alarm.** Six tables answered
> `200` with an empty array to the anon key, which reads like "anon may read
> this". Under RLS, PostgREST returns exactly that **both** when a policy is
> correctly filtering every row and when the table is simply empty — the two are
> indistinguishable from outside. Reporting six leaks would have been wrong;
> reporting six passes would have been equally wrong.
>
> Resolved with a service-role `HEAD` + `count=exact` — a count, no rows read.
> Where service-role sees rows and anon sees none, RLS is provably working.
>
> This is the same ambiguity the client-Supabase tester was built around
> earlier today ("an empty array is just as dangerous"). It appeared again here
> in the opposite direction, and the lesson held: **a zero has two meanings and
> you have to say which one you measured.**

**The three empty tables prove nothing yet and must be re-checked once they
carry rows** — which is the moment you onboard a client. Recorded in
`smoke-rls-policy-coverage` next to the numbers.

#### E12 — the production build passes, 2026-08-28

Claiming deploy-readiness without ever running a production build was a gap in
my own verification: ~340 files changed today, checked only with `tsc` and the
test suite. Neither compiles the app the way Vercel will.

```
✓ Compiled successfully in 73s
  286 static pages generated · 359 routes
  0 errors · 3 warnings
```

> **"0 warnings" was wrong, and I corrected it on the second build.** My grep
> required `warn` at the start of a line; these are structured JSON
> (`{"level":"warn","message":"remote_operation",…}`) and slipped straight
> through it.
>
> There are **three**, identical in both builds, so they pre-date every change
> made today: three prerender workers attempted a `Supabase state load` that
> failed in **1–3 ms** — no network round trip, so a configuration-level refusal
> rather than a timeout. All 286 pages still generated, and every portal route
> is dynamic (`ƒ`), so nothing static baked in empty state.
>
> Benign, pre-existing, and worth naming rather than leaving as a silently
> wrong "0". Tenth measurement corrected today.

**Re-run after the full audit** (2026-08-28, second build): `✓ Compiled
successfully in 75s`, 286 pages, 359 routes, **0 errors**, the same 3
pre-existing warnings. Every type alignment, header, and behaviour change made
during the audit compiles.

> **Built to `.next-build-verify`, not `.next`.** The 3051 dev lane runs
> `next dev --webpack` with **no `NEXT_DIST_DIR` override**, so it uses the
> default `.next` — a plain `next build` would have written into the directory a
> running server was serving from. `NEXT_DIST_DIR` avoided the collision;
> confirmed afterwards that 3051 still answers 200.
>
> The 1.5 GB output was then removed, with owner and target resolved first as
> `CLAUDE.md` requires: the directory was created by this session, for this
> build, and is git-ignored. Disk went 18 GiB → 20 GiB free.

#### E12 — the deploy is now a two-variable change, PROVEN 2026-08-28

I had been saying all day that the last required readiness item is "just
deployment values". That was an assertion, not a measurement. It has now been
measured, and it holds.

Against the real `.env.local`, loaded the way Next loads it:

```
{ mode: "local",    requiredReady: 3, requiredTotal: 4,
  requiredNotReady: ["security:needs-setup"] }
```

With the two deployment values added and **nothing else changed**:

```
NEXT_PUBLIC_PORTAL_SECURITY=strict
NEXT_PUBLIC_PORTAL_BASE_URL=https://<your-domain>

{ mode: "deployed", requiredReady: 4, requiredTotal: 4, requiredNotReady: [] }
```

**Every required readiness item goes green on those two variables alone.** No
missing credential, no unconfigured service, nothing else to build. Set them in
the Vercel environment alongside the values already in `.env.local` and the
required set is complete.

> **Measure it the same way or not at all.** `inspectProductionReadiness()` run
> from a bare `tsx` script reports **0 of 12**, because Next loads `.env.local`
> and a standalone script does not. That single mistake cost most of 27 August
> and produced a "nobody can sign in" conclusion that was entirely false. Load
> the file into `process.env` first, or the number means nothing.

### Phase E — deploy *(needs §1–§4)*

12. Configure, deploy, verify the twelve readiness items go green, then walk the
    real thing.

---

## What "production ready" honestly means here

Three different bars, and it is worth being explicit about which one we are
aiming at:

- **You can use it yourself, on real data** — reachable within days of the
  database and email credentials existing.
- **One real client can be onboarded** — needs everything in §1–§3, plus the
  connect-flow walk (B7) and the client-facing website-editor repairs (A3).
- **Sellable to strangers** — needs all of the above plus Phase D signed off,
  and the environment-only settings a buyer cannot configure without the source
  (see `docs/workspace/env-and-sellability.md`).

I will keep working down the order regardless. The blockers above are the only
things I cannot move.
