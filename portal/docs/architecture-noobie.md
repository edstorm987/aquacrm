# AquaCRM, explained plainly

← [development.md](development.md) is the law. This is the map you read first.

Written 2026-08-20. No jargon, no assumed knowledge. If a sentence here needs a
glossary, it is a bad sentence — tell me and I will rewrite it.

---

## The one-paragraph version

AquaCRM is **one app, on one server, serving many companies**. It is not one copy
per company. Everything a company owns — its clients, money, files, website, its
whole workspace — is tagged with that company's id, and the app only ever shows
you rows carrying the id you are currently working as. Which company you are
working as is a thing you switch, like changing hats. That single idea explains
about 80% of the codebase.

---

## 1. The nesting dolls

Five layers, outermost first. Each one can see everything inside it, and nothing
outside it.

```
  DEV MODE            you, building the thing            (founder only)
   └─ AGENCY          a business. Milesymedia. Aqua Oasis Web.
       └─ COMPANY     a brand that business trades under  (a "trading company")
           └─ CLIENT  someone that business works for
               └─ CUSTOMER   the client's own customers
```

**Agency** is the real boundary. It owns its data, its settings, its brand, its
staff. When two things must never see each other, they are in different agencies.

**Company** is the cheap start — a brand inside an agency, with its own logo and
colours. Today it is *labelling*, not a wall: a company cannot yet have its own
switched-off features. When a brand becomes a real business it gets **promoted**
into its own agency, which is a plan we have written but not built
([promote-trading-company.md](development/plans/promote-trading-company.md)).

**Client** is who you do the work for. **Customer** is their customer — the person
who buys from your client's shop or fills in their contact form.

### Who you are

Eight roles, and they map onto the dolls:

| role | sees |
|---|---|
| `agency-owner` · `agency-manager` · `agency-staff` | the agency workspace |
| `client-owner` · `client-staff` | one client's portal |
| `freelancer` | only the jobs assigned to them |
| `end-customer` | a client's own customer portal |
| `lead` | not a customer yet |

Your role and your agency travel in a signed cookie. Every server action re-checks
it — the screen hiding a button is never the security, the server refusing the
write is.

---

## 2. Where the data actually lives

Two places, and it matters which is which.

**One big JSON blob** — `PortalState`, **78 collections** (clients, users,
invoices, tasks, notes, calendar entries…). Locally it is a file at
`.data/portal-state.json`; in production it is one row in a Supabase table called
`app_datastores`. The whole thing is loaded into memory, changed, and written
back.

*Why that matters to you:* it is fast and simple, and it is why an early bug could
silently drop four collections on every restart — the code rebuilds that object
field by field, and a field nobody listed just vanished. There is now a test that
fails if a 79th collection is added without being handled.

**Real Supabase tables** — for things that need to be queried, or written by
something that is not the app: `brand_enquiries` (your website enquiries — 35 of
them right now), `website_consent_events` (cookie consent), the inbox tables,
`brands`, `shoots`.

*Rule of thumb:* if a website or an outside service writes it, it is a real table.
If only the app touches it, it is in the blob.

---

## 3. Modules — the parts you can switch off

There are **13 modules** in `src/built-ins/modules/`: finance, marketing,
leads-pipeline, client-crm, fulfilment, website-editor, ecommerce, memberships,
affiliates, HR, email-sender, auth-gate, public-funnel.

They are **installed per agency**. Install finance and you get finance. Don't
install marketing and marketing does not exist for that company — including its
menu items, because **the sidebar builds itself from whatever is installed**. Each
install also has a `features` map for switching bits on and off inside a module.

*Why that matters:* "an operations CRM without marketing" needs no new code. It is
the same app with a different set of modules switched on. Nothing is duplicated —
every company runs the same code and differs only in what is enabled.

---

## 4. Aqua Engine — one editor wearing four hats

There is **one** editing engine, and its name is **Aqua Engine** —
`src/engines/editor/editing/engine.ts`. Every button that used to say "Website editor",
"Portal editor" or "Studio" now says Aqua Engine, because they were always the
same tool pointed at different things. It works the same way everywhere:

```
   what you want to change  →  a PLAN (a dry run: here is exactly what would change)
                            →  you confirm
                            →  it publishes
```

Four things ride it through "adapters": a **website**, a **client portal**, a
**plain code repository**, and the **app's own settings**. They all get the dry
run, the before/after diff and the explicit-confirm for free. Those are four
**things you can point the editor at** — they are not four editors.

**And the screen you actually edit in is one file too** (added 2026-08-21):
`src/engines/editor/DevEditor.tsx`. It deliberately does **not** live inside any
feature folder. Two routes open it — `/portal/agency/portals/editor` (coming at
it from a client portal) and `/portal/dev-team/editor` → *Open editor* (coming at
it from a project) — and both mount the same component. It used to live inside
the portals route, which meant portal-flavoured wording kept turning up in front
of somebody editing a website; moving it out is what stops that happening again.
If you are looking for "the editor", that file is it.

**The shared vocabulary foundation now exists, but the widening is unfinished.**
The element registry and its first three phases are shipped under
`src/engines/editor/elements/`, and portal blocks have a parity guard. Website
and portal families still need to be widened onto the shared definitions before
an assistant can compose every real surface from one complete catalogue. See the
current “Engine widening + assistant proposals” item in
[checklist.md](development/checklist.md).

---

## 5. The documents ARE the database

Unusual, deliberate, and worth understanding because it is how the whole build is
run.

- `docs/development/roadmap.md` — **outcomes**: what is coming, when, and which
  plans deliver it.
- `docs/development/plans/*.md` — **one plan per piece of work**, each with a
  `**Status:` line and numbered phases.
- `docs/development/findings/` — things spotted while using the app.
- `docs/context/state.md` — the shared brain.

The app **reads these files and renders them**. The Dev Console's board, the task
list, the progress bars — all parsed from markdown. Change the file, the screen
changes. Change it in the screen, the file changes.

Each plan also carries a **file map**: the exact files that plan owns. That is
what makes it safer to run several workers at once — before handing out two
jobs, you check their file maps do not overlap. A first commit now exists, but
the shared working tree still carries uncommitted work from multiple lanes, so
discarding or overwriting a file can still destroy somebody else's work.

---

## 6. The Dev Console

`/portal/dev-team` — your own workspace for building the thing, founder-only, and
invisible unless Dev Mode is on. Seven sections (counted 2026-08-21 in
`src/app/portal/dev-team/layout.tsx:74-89`; this used to say "Six" and then list
only five, missing Home and Editor):

**Home** (the dashboard — what's in flight, what's done, what's blocked) ·
**Roadmap** (what's coming · what's moving · every task) · **Findings** (what you
spotted · what the auditor spotted) · **Library** (docs · logs · updates) ·
**Tools** (inspector · editor · API & MCP) · **Editor** (the Dev Editor projects
workspace, and the door into the editor itself) · **Notes**.

("My profile" is there too, but it sits in a separate Settings panel at the
bottom rather than being one of the seven.)

Entering it does **not** change who you are — you stay you, on your real data.
Identity only changes in **Inspector**, and leaving restores exactly the person
who started.

---

## 7. How a change gets made safely

The rhythm, in order:

1. **Look before building.** `docs/workspace/feature-index.md` answers "where does
   X live?", `docs/reference/` lists every function. This codebase has duplicated
   things before; reuse beats rebuild.
2. **Write a plan** with phases and a file map.
3. **Check for collisions** — three files are claimed by many plans and can only
   ever have one owner at a time: `src/server/types.ts` (10 plans),
   `src/lib/chrome/sidebarLayout.ts` (9), `src/server/storage.ts` (7).
4. **Build it**, with a test that would have FAILED before the change. A test that
   passes either way proves nothing.
5. **Run the whole suite** — **233 test files**. Adjacent tests are not enough;
   an old test elsewhere is often pinning the behaviour you just changed.
6. **Open it in a browser.** A green suite is not proof. Several real bugs this
   week were invisible to a passing suite and obvious on screen.

---

## 8. The five things that will confuse you most

1. **A green test suite is not proof.** Tests can pin a *bug* as if it were the
   spec — three did exactly that, each with a comment cheerfully describing the
   wrong behaviour as intended.
2. **The docs lag the code.** All three "🔴 launch blockers" turned out to be
   already fixed. Check the code, then fix the doc.
3. **Two ways to say "done".** A plan's `**Status:` line is maintained; the ✅ on
   individual phases often is not. The status line is the one to trust.
4. **`.data/portal-state.json` is your real sandbox.** Only the dev server may
   write it. Tests and scripts get an in-memory copy, because the test suite used
   to wipe it.
5. **Env variables are yours alone.** `process.env` credentials belong to *your*
   agency — a second company must connect its own. Anything configured by an env
   var needs a redeploy, which needs the source, which is why a sellable product
   cannot rely on them.

---

## 9. Scale, for context

**1,637** source files · **13** modules · **78** state collections · **233** test
files (~2,300 tests) · **59** screens in the agency workspace alone.

It is a big system. But every part of it obeys the sentence at the top: one app,
many companies, everything tagged with whose it is.
