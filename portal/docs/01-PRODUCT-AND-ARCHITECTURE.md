# Product and architecture

> Product shape, portal model, brand architecture and plain-English system explanations.
>
> Consolidated 2026-08-27 from **2** source documents / **6,002 words**. Each source is retained verbatim between provenance markers. The original path remains alongside it because relative links and runtime-backed Dev Team records still resolve from that location during the compatibility phase.

## Source map

- [`docs/architecture-noobie.md`](#source-docs-architecture-noobie-md) — 1,702 words · `089741ec7a41`
- [`docs/PRODUCT-ARCHITECTURE.md`](#source-docs-product-architecture-md) — 4,300 words · `88b78ad5b0c9`

---

<a id="source-docs-architecture-noobie-md"></a>

## Source document — `docs/architecture-noobie.md`

<!-- AQUACRM_SOURCE_START path="docs/architecture-noobie.md" sha256="089741ec7a410b5864537cb4f96a0253143dca6e0e8f02f5fa85ab27feabd47d" -->
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
<!-- AQUACRM_SOURCE_END path="docs/architecture-noobie.md" -->

---

<a id="source-docs-product-architecture-md"></a>

## Source document — `docs/PRODUCT-ARCHITECTURE.md`

<!-- AQUACRM_SOURCE_START path="docs/PRODUCT-ARCHITECTURE.md" sha256="88b78ad5b0c99adbf6f98c0a35cfc9cf6674128fce9ae41abd6c36287b0f1570" -->
# AquaCRM Product Architecture

Last reviewed: 26 August 2026 (implementation boundary reconciled)

> This file describes intended and implemented product boundaries. It is not a
> runtime-status document. Use [development/checklist.md](development/checklist.md)
> for current completion/reliability and [development/status.md](development/status.md)
> for verification depth. The access implementation and remaining adoption gate are
> tracked in
> [configurable-access-and-workspace-parity.md](development/plans/configurable-access-and-workspace-parity.md).

## System Shape

AquaCRM is one Next.js application containing five related surfaces:

1. The public AquaCRM website and brand enquiry capture.
2. Secure agency operations under `/portal/agency`.
3. Internal client workspaces under `/portal/clients/[clientId]`.
4. Customer and team portals under `/portal/customer` and `/portal/team`.
5. The production Dev Team control plane under `/portal/dev-team`.

These surfaces share identity, agency scope, products, client records,
communications, finance, delivery, and evidence. They are different views of
the same operating system, not separate products with copied data.

## Dev Workspace And Preview Architecture

AquaCRM remains **one application and one control plane**. A project's preview is
not another AquaCRM server and GitHub is not a runtime server. GitHub stores the
repository; AquaCRM connects or creates that repository and manages an isolated
project workspace.

The authoritative development path is:

1. select one explicitly authorised project and repository;
2. create or resume an isolated branch/worktree;
3. install with the project's declared package manager and lockfile policy;
4. start its declared preview command as a supervised loopback process or
   isolated container, with a bounded port, health state, logs and stop/restart;
5. show that preview inside the Dev Editor and map inspected elements back to
   source where the framework permits it;
6. let visual controls, source tools or AI produce reviewable file changes;
7. show the diff and run project checks before commit;
8. publish through branch, commit and pull request; production changes only
   after the separately authorised merge/deploy policy.

The preview process is disposable. The repository branch/worktree is the code
source of truth. AquaCRM stores workspace metadata, grants, audit events and
process state; it must not treat an iframe DOM or a deployed production page as
the canonical editable document.

For a site without a repository, AquaCRM may offer an **authorised migration**:
capture the publicly observable frontend and assets, inventory routes, forms,
authentication, data and external providers, create a repository, reconstruct
the site with AI assistance, and compare it against a parity checklist. Public
HTML cannot reveal private backend logic, databases, credentials or provider
workflows, so “exact conversion” applies only to evidence that can be observed;
missing server behaviour must be identified and deliberately reimplemented.

The Aqua Tag remains valuable but has a narrower authority. It owns consented
marketing/analytics telemetry, managed tag injection, form/event routing and an
optional remote-inspection bridge when repository source is unavailable. A
repository-backed local preview does not require the Tag, and Tag observations
never override repository truth.

### Current preview implementation boundary

The first trusted preview lifecycle is now implemented for already-configured
local repositories. `aqua-preview.config.json` is the server-owned manifest;
the browser supplies only an action and project id, never a root, command,
arguments, environment, port or shell. In local/test mode the supervisor resolves
an approved real path, starts the declared command with `shell:false` on loopback,
bounds/redacts logs, caps concurrent processes and prevents two access realms from
controlling the same physical worktree. Start, status, logs, stop and restart are
separately capability-gated and production refuses this local process feature.

The mounted repository preview has now browser-proved Start, Restart with a new
loopback process, Stop, responsive Preview/Code panes and HTTP 200 for
`/aqua-tag.js`. That is representative lifecycle acceptance, not completion of the
eight-step path above. Repository creation/cloning, worktree preparation,
installation policy and the complete journey through inspect/edit/AI/diff/check/PR
still require end-to-end acceptance. Failure, crash, occupied-port,
dirty-transition and reload paths remain part of that gate.

## Project And Workspace Access Model

Roles are templates, not authority. `developer`, `staff`, `freelancer`, `AI`,
`customer` and `owner` may prefill a grant, but effective access is the
intersection of explicit workspace, project, capability, resource and
environment grants. Absence means deny. A role never grants blanket CRM,
client, repository or Dev Team access.

Identity and authority remain separate. A person's tenant membership, client
relationship and portal persona establish hard audience ceilings and the correct
shell; editing a role template cannot manufacture agency/client membership or
cross a tenant boundary. Display assignments such as company tags are not
membership. The same human may legitimately be staff in one scope, a freelancer
on one job and a developer on one project without changing accounts or receiving
the union of every surface.

The implemented base capability vocabulary is:

- `workspace.view` and `workspace.manage`;
- `project.view`, `project.manage`, `project.edit`, `project.ai` and
  `project.preview`;
- `dev.project.run_local` and `dev.project.logs`;
- `project.pull-request`, `project.publish` and `project.deploy`;
- `access.request`, `access.grant.manage`, `access.template.manage`,
  `access.request.review` and `access.audit.view`;
- registered workspace-element capabilities such as
  `element.<workspace>.<element>.view`, `.use` and `.manage`;
- no capability that reveals stored secret values.

Workspace-element permissions use stable product-owned identifiers for real
sections, tabs, boards, tools, field groups and actions. They never store CSS
selectors, DOM paths or arbitrary component names that can silently drift after
a redesign. `view` permits the element and its safe data, `use` permits its
ordinary interaction or mutation, and `manage` permits configuration or
delegation. A role-template editor may present those as **Hidden**, **View only**,
**Use/Edit** and **Manage**. Hiding is still only presentation: data loaders and
mutation handlers enforce the corresponding element capability server-side.

Adopted human paths use this evaluator. Sandbox and live are environment scopes,
not alternative permission systems; the public Showcase keeps its
separate fixed read-only realm. AI/service principals and expiring share links
are the next consumers, not capabilities implied by the human UI. When added,
they must name one workspace/project/environment and an allowlist, expire, be
revocable and never grant more than the issuer held. A person invited to one
client website can therefore be given that project without receiving another
project, CRM finance, unrelated clients, production secrets or the rest of Dev
Team.

Live state is the governance control plane for identities, role templates, grants
and requests. A signed Sandbox session selects a separate resource realm. The
effective decision intersects the live grant with the resources that actually
exist in that active realm, so a Sandbox-only Project A may be governed centrally
without making a live-only or invented Project B visible. Demo realms are shared
per agency/dataset and the browser never chooses their physical id. Non-owner
members may enter only the safe Demo dataset, cannot force-reset it or select a
more privileged persona, and live revocation invalidates their old Sandbox
session. Provider and read-only fences remain additional layers beneath this
access decision.

### Per-person grants and visible workspaces

Ed can now create, name, revise and archive reusable role templates and combine
them with direct per-person grants. A template is inert until it is assigned
within an exact scope and environment. The first kernel is additive and bounded:
membership and audience ceilings remain hard limits, absence denies, and reducing
access means revoking a grant or replacing it with a narrower assignment rather
than composing ambiguous negative-rule precedence. A version-history/impact-
preview experience is still future work; `createdAt`, `updatedAt` and attributable
writers do not by themselves provide that richer workflow.

Effective authority is evaluated from fresh user and membership state, the
requested environment, the resource's tenant/client/project ownership and the
union of unexpired grants that match every requested dimension. Sensitive
decisions are not stored as durable truth in a session cookie. Grant, role,
membership, expiry or revocation changes advance the user's access/session
revision so an old browser cookie cannot retain the prior authority.

The project-scoped Dev Workspace and its eligible portal links are derived from
server-produced access resolution. Staff station and Fulfilment view projections
now use the same decision for navigation/direct pages and representative operations.
The broad exact-client projection does the same for the internal client workspace
and its canonical tenant routes. Customer/freelancer and the remaining ambiguous
module/task associations still have to converge.
Discoverability is never security:
every adopted page, direct deep link, API, file read, AI operation, preview
process and publish action re-evaluates the same server-side capability before
returning data or mutating state. A refusal must not flash sensitive content.
Where policy allows, it may show a neutral Request access state instead of a
dead end.
The same rule applies inside a granted workspace: a role can expose the workspace
while hiding one element, expose it read-only, permit ordinary use, or permit
management. An element-level request names that registered element and requested
level; it cannot be used to infer or request an arbitrary hidden DOM target.

### Permission requests and delegated approval

A permission request grants nothing. It records the requester, exact agency,
workspace/project/resource, environment, capability allowlist, reason, requested
duration and an idempotency key. Its lifecycle is pending, approved, narrowed,
denied, cancelled, expired or revoked. An authorised approver may approve the
exact request, approve a smaller capability set or duration, or deny it with a
note. The requester cannot approve their own request; an AI/service principal
cannot self-escalate; and an approver cannot delegate more than they currently
hold in that exact scope.

Approval and grant creation are one coordinated, idempotent operation. Repeated
decisions cannot create duplicate grants. Request, decision and revocation append
attributable, non-secret activity and refresh effective access immediately; expiry
is evaluated at resolution time. The shared control surface shows current grants,
expiry and request status and is mounted in Settings, People and Fulfilment.
Product notifications and a dedicated Account Permissions destination remain
separate follow-up work. A local manager may act only inside their delegated
management ceiling.

### Staff, Fulfilment, client and project parity

There is now one evaluator and one set of canonical workspace/project/resource
IDs, not identical screens and not copied stores. The owner can configure access
from Settings, Staff/People and Fulfilment. Technical and Dev Workspace grants
name their exact project and keep the internal Dev Team control plane—Roadmap,
findings, workers, repository-wide docs and unrelated projects—outside that
authority. The reusable Dev Workspace mounts the shared `DevEditor` from eligible
staff, freelancer, client and customer navigation without inventing a client-only
role system.

Staff and Fulfilment are now runtime consumers: their canonical projections hide
ungranted navigation, refuse hidden deep links and constrain representative data/
mutation operations to View, Use or Manage. Staff People data is projected by the
specific visible element instead of exposing the full directory/card/org graph, and
Fulfilment client list/create requires Services View/Manage. The client workspace now registers 11
stable elements: Overview, Relationship, Fulfilment, Marketing, Systems,
Commercial, Communications, Files, Portal, Record and Settings. Its layout, tabs,
Settings, plugin page catch-all and representative mutations resolve the exact client;
an unrelated Staff/Fulfilment grant cannot act as an implicit tunnel into every
client.

That is a materially wider implemented slice, not complete application parity.
All tenant route files containing `clientId` are 35/36 canonical-gated; the sole
exception is the dev-only empty-store seeder, and 28 completed mappings are pinned
by the source contract. The focused boundary passes 62/62 including six direct
tests, with separate product-workspace cross-process proof 4/4 and clean TypeScript/
diff. Expense attachments do not carry client identity, so they cannot honestly be
described as exact-client gated; agency/global branches remain agency surfaces.

The genuinely unclassified client associations are the dynamic plugin API catch-all
for Fulfilment, Client CRM, Ecommerce, Memberships and Affiliates; freelancer jobs;
and generic tasks/task-template application. Customer/session/relationship routes,
the Dev project kernel, workspace list/create, website-source destination metadata
and output/derived-association routes intentionally retain their more appropriate
authority instead of being forced through the client-element evaluator.

Governed client and end-customer collaboration routes now retain their existing
relationship/role/action ceilings and also enforce the matching client element:
Commercial for contracts, Files for file reads/writes, Communications for requests
and Record for project briefs. Entirely ungoverned identities retain the explicit
legacy migration fallback; that compatibility is not authority for a governed user.

Exact workspace composition is also enforced in the manager. Staff scope exposes
only base Workspace plus Staff elements; Fulfilment scope exposes only base Workspace
plus Fulfilment elements. Changing scope prunes stale capability selections and the
server-facing grant/request/review payload is sanitised again at submission. A generic
Development workspace selection was removed because Development capabilities resolve
against exact projects; exact project scopes remain the supported authority.

Existing `PeopleEmployee.workspaceAccess`, Agency HR custom roles/client
assignments and freelancer job access remain migration inputs. They have not all
converged yet and must become explicit compatibility adapters or be retired rather
than becoming competing authority. Record visibility (`internal`, `client`,
`inherent`, `system`) remains a separate content-sharing rule and is intersected
with access; a project grant does not turn an internal note into client-visible
material.

### Dev Workspace launch minimum

The grant kernel, first management UI and project-scoped Dev Workspace are now
implemented in source. They separate:

- Dev Workspace view from internal Dev Team control-plane view;
- project view, source edit, local preview run and log inspection;
- AI prompt from AI apply;
- settings/member management;
- tests, commit and pull-request publication;
- merge/deploy and production publication, which remain owner-only by default;
- non-revealing secret use from any ability to view stored credentials.

The Settings/People/Fulfilment manager now feeds real Staff and Fulfilment
projections, and the 11-element client projection is exact-client gated. The Dev
Workspace remains the deepest end-to-end adopter. The named module/freelancer-job/
task associations, customer/freelancer workspaces and legacy loaders/mutation
handlers must still be migrated or their unbacked toggles withheld from release.

The final static/UI closure for this checkpoint passes 92/92 focused/adjacent access
checks, 11/11 exact-scope composer checks and 32/32 `/dev` session/realm checks, with
full TypeScript and diff checks clean. A freshly restarted mounted browser showed
exactly the registered Staff-only and Fulfilment-only sets, a 390px 2×2 selector with
44px targets and no overflow, and People Capacity without overflow or alert; the
browser warning/error log was empty. The new-role composer visibly exposed all four
scope kinds, both environments and all 28 stable element groups; one control interaction
was restored without submit, so it is not persistence evidence. This evidence closes those concrete boundaries,
not the complete cross-persona request/mutation/accessibility matrix below.
The settled relevant combined gate is 130/130 across core access/Dev/workspace/client/
People, exact Access UI, Dev Team performance and Sandbox protection; it is not a
complete repository-suite rerun.

The remaining launch gate uses two people, two projects and two environments. It proves a
Project A grant cannot list/read Project B, edit does not imply publish, publish
does not imply merge/deploy, Sandbox authority cannot cross into live, a request
cannot self-approve, approval creates one grant, and revocation takes effect on
the old session. The internal `/portal/dev-team` control plane remains separate
from the reusable project Dev Workspace even though both mount the same editor
engine. Focused automated coverage exists for these boundaries. Representative
browser proof covers the manager across seven widths, real restricted Staff/
Fulfilment deep-link refusal, missing exact-client refusal, responsive editor panes
and preview Start/Restart/Stop. The clean follow-up additionally proves exact Staff/
Fulfilment scope composition and mobile People Capacity. The complete cross-persona create/grant/request/
approve/revoke, positive exact-client, mutation/reload, accessibility and failure
matrix is still required.

## Macro And Micro Rule

Agency workspaces are the macro view. They answer questions across the whole
business: all tasks, all clients, all finance, all delivery, and all risk.

Client workspaces are the micro view. They must let an authorised operator do
the same ordinary work for one client without returning to the macro view.
Examples include creating an invoice, updating a payment plan, managing a
contract, assigning a service, moving a service stage, uploading evidence,
editing a portal, and recording a call.

Do not replace one with the other:

- Agency Finance remains the complete portfolio ledger.
- Client Finance remains a writable, permission-scoped view of that client's
  ledger.
- Agency Fulfilment remains the cross-client delivery command surface.
- Client Fulfilment remains the complete delivery surface for that client.

## Agency Domain Ownership

### Command Centre

Route: `/portal/agency`

Command Centre is the owner operating layer. It currently brings together:

- Day Command: clock in/out, inactivity review, planned outcomes, work queue,
  schedule, evidence, briefings, and mandatory clock-out review.
- Executive Command Centre: health, Radar, confidence, readiness, business
  signals, full scans, actionable findings, and KPI intelligence.
- Battle Table: strategy, business plans, targets, projections, quarterly
  reviews, capacity, hiring recommendations, ownership, investment, dividends,
  and governance.

Command Centre uses a deliberate dark naval visual mode. Do not accidentally
apply that theme to ordinary workspaces. Performance Mode can suppress the
entry/exit transition while preserving functionality.

### Master Inbox

Route: `/portal/agency/inbox`

Master Inbox owns communication and attention across enquiries, support,
social channels, client messages, operational alerts, and updates.

The `Needs attention` view is an action surface, not a notification archive.
Every row must provide:

- exact problem and evidence;
- an authoritative resolution destination;
- a visible Resolve action;
- Remind later choices;
- Dismiss until the underlying evidence changes.

Inbox threads are only opened when the alert actually resolves to a matching
conversation. A finance, delivery, or system issue must not open an unrelated
contact merely because names happen to match.

### Actions

Route: `/portal/agency/actions`

Actions unifies committed and proposed work from four origins:

- manual;
- Radar;
- Advisor;
- CRM.

The All view ranks these in one queue with source badges. Source tabs expose
deeper origin-specific views. Suggested work remains approval-gated.

Focus protection normally limits a large queue to five items. A direct link to
an exact task temporarily promotes that task into the visible window and opens
its editor. Never let overload protection make a resolution link ineffective.

### Journey

Primary routes: `/portal/clients` and `/portal/agency/pipelines/[slug]`

Journey owns the relationship before, during, and after conversion:

- enquiries and identity review;
- contacts and relationship categories;
- leads, opportunities, and sales pipelines;
- cold scouting and qualification;
- follow-up and recontact scheduling;
- meetings, reminders, no-shows, recordings, and notes;
- conversion into a client workspace;
- relationship health and contact cadence.

Not every enquiry is a lead. Supplier, partner, marketer, recruitment, spam,
and other relationship categories stay outside the sales Journey unless a
human classifies them as sales.

A lead workspace should evolve into the client workspace when converted,
preserving identity, notes, messages, attribution, and history.

### Fulfilment

Route: `/portal/agency/fulfilment`

Fulfilment owns the work that delivers what was sold:

- cross-client delivery overview;
- product/service catalogue and workspaces;
- service stage boards and process steps;
- client delivery workspaces;
- portal operations;
- website, technical, development, performance, resources, vault, and workflow;
- service-specific marketing delivery where sold as a client service.

Client development delivery remains integrated into Fulfilment, but the Dev
Workspace/Editor is one reusable engine rather than a Fulfilment-only feature.
Dev Team is its macro control-plane home; a client Fulfilment workspace or
client portal is a separately granted, project-scoped door into the same engine.
The Dev Team control plane exists today; that does **not** mean the new managed
preview/editor lifecycle is launch-ready. Its browser acceptance and client
embedding finish line remain open.

### Finance

Route: `/portal/agency/agency-finance`

Finance owns income, expenses, invoices, payment plans, budgets, allocation
pots, workforce costs, currency handling, tax evidence, profitability, legal
obligations, and financial planning.

Client Finance writes to the same underlying commercial records through a
client-scoped interface. Payment status, paid-in-full state, instalments,
missed payments, stage time, upsell signals, and client profitability must
remain traceable at both scopes.

### Staff

Route: `/portal/agency/people`

Staff owns applicants, employment records, access, onboarding, leave, shifts,
training, pay/commission configuration, and employee Day Command. Access is
composed from permitted workspaces and clients, not from one unrestricted
agency role. The People access manager assigns reusable role templates and
person-specific grants; the Team shell projects only the resulting stations,
clients, Fulfilment workspaces and projects. A station hidden from navigation is
still refused by its page and API until an appropriate grant exists.

### Marketing

Route: `/portal/agency/marketing`

Marketing owns campaign planning, social and ads, newsletters, direct
messages, cold campaigns, physical and charitable campaigns, funnels,
audiences, demographics, attribution, Google Business Profile, and internal
automations. Booking funnels belong here even when Journey uses their booking
links.

When social media or ads are sold as a service, the reusable capability is
surfaced inside that client's Fulfilment workspace with client scope.

### Other Domains

- You Deserve It: client/staff experience, rewards, events, trips, welcome
  packs, reputation, and care packages.
- SOP Library: folders, tags, uploads, relocation, and multiple media types.
- Tools: calendar, notepad, quick utilities, and internal tooling access.
- Company/Battle Table: company profile, plans, legal records, connections,
  capacity, capital, ownership, and executive review.

## Client Workspace Architecture

Canonical route: `/portal/clients/[clientId]`

The standard client lenses are defined in `src/lib/clients/clientWorkspace.ts`:

- Overview
- Relationship
- Fulfilment
- Social & ads, when relevant
- Systems, when relevant
- Finance
- Communications
- Files
- Portal
- Record

The sidebar should stay understandable as services grow. Core lenses remain
stable; assigned product/service workspaces appear as service-specific entries
rather than flattening every capability into one enormous list. Simple mode
shows the next operational step. Advanced mode reveals stages, SOPs,
variations, configuration, and deeper controls.

### Buyer, Workspace, Company, And Portal

These concepts must not be collapsed:

- A person or buyer identity may own several workspaces.
- A client workspace represents one commercial/delivery engagement.
- A workspace may be assigned to a trading company.
- The assigned company determines customer-facing portal branding.
- The same buyer may have separate portals for separate projects or companies.
- The relationship ledger can read across linked workspaces without merging
  their delivery, finance, permissions, or portal state.

### Products And Services

`AgencyProduct` is the catalogue template. It contains pricing, status,
portal requirements, portal template, internal workspace modules, stages,
steps, and related operating configuration.

Important rules:

- Products/services may be draft, live, or archived.
- A client assignment can carry a `ClientProductVariation` without mutating the
  catalogue template.
- New product definitions should be able to create a viable standalone client
  workspace and compose cleanly with other assigned products.
- Each assigned service owns its own stages. Website delivery can be in review
  while photography is already delivered.
- Global client stage is relationship-level context, not a substitute for
  per-service delivery state.
- Product changes may be rolled out deliberately; do not silently overwrite a
  client's bespoke variation.

### Internal Record And Customer Visibility

The client Record is a chronological ledger across messages, notes, calls,
commercial events, delivery movement, files, recordings, and system activity.

Visibility is explicit:

- `internal`: agency team only;
- `client`: deliberately shared into the customer portal;
- `inherent`: already customer-facing by the nature of the source;
- `system`: generated system evidence.

Do not leak internal notes, recordings, risk assessments, or staff-only
evidence into the customer portal. Do not hide deliberately shared records
from the client either.

## Radar And Advisor Architecture

Radar evaluates business, domain, client, service, system, and evidence state.
Its policy model supports setup, launch, operating, scaling, seasonal, and
paused stages, plus per-check lifecycle and exceptions.

Three values must remain separate:

- Health: outcomes against approved targets and commitments.
- Confidence: whether fresh, decision-grade evidence supports the assessment.
- Readiness/setup: whether sources and policies are configured enough to run.

New clients, products, websites, portals, and services should contribute their
own checks through data-driven rule generation. Client Radar rolls into the
agency Radar but remains inspectable inside the client workspace.

Advisor receives the same evidence-backed business context and visibility
limits. It can recommend, brief, rank, and propose. It must not have
unrestricted mutation access. External assistants use scoped API keys and a
proposal inbox with human approval.

## Canonical People And Companies

`Person` is the canonical human and `Organisation` the customer company. They
sit above the older records rather than replacing them: `Lead`, `Contact` and
`Client` are facets that point back with `personId`.

The rule this exists to enforce is that changing what somebody IS must never
destroy what they DID. A meeting held while they were a lead is still a meeting
once they are a supplier, so it is held on the Person and survives
reclassification. Facets are retained, never deleted, and the card's face
(enquiry / contact / lead / client) is DERIVED from which facets exist plus the
classification — never stored, so it cannot drift from the records behind it.

Distinctions that must not be collapsed:

- `Organisation` is the CUSTOMER's company. `TradingCompany` is one of Ed's own
  brands and drives customer-facing portal branding.
- `Person.organisationId` is only ever set from a confirmed link. Membership is
  proposed by the system and decided by a human; a rejection is retained so the
  same guess is never proposed again.
- A shared phone number is not proof of a shared person. A company switchboard
  would otherwise collapse every contact behind it into one record.
- `Client.relationshipId` still groups client workspaces for one buyer. Clients
  sharing a `relationshipId` share a `personId`; the two agree rather than
  compete.

Where a person opens depends on what they are now — contact card, lead card, or
client workspace. Resolve one destination through `personDestination` rather
than hard-coding a link, or a list keeps sending an operator to the contact
card long after somebody became a client.

## Actions And Resolution

Every operational alert declares how it can be dealt with:

- `in-app` - a control on a screen resolves it;
- `off-system` - the work happens elsewhere and Aqua records the outcome;
- `judgement` - there is no fix, only a decision.

This is declared by the check, not inferred from its id at render time. Roughly
half of all alert families are `off-system`: offering a Resolve button on those
promises a control that cannot exist.

A judgement call must never claim a mechanical clearance condition, and an
alert whose own wording is statistical ("99 robust deviations from its retained
median") must be translated into plain English before it reaches an operator —
including saying plainly when the numbers are too thin to conclude anything.

## Source Of Truth Rule

Before adding a new store or UI-only state, locate the authoritative model:

- persisted aggregate types: `src/server/types.ts`;
- aggregate storage and backend selection: `src/server/storage.ts`;
- domain server modules: `src/server/`;
- server-only integrations and evidence builders: `src/lib/server/`;
- reusable domain calculations: `src/lib/`;
- API boundaries: `src/app/api/`;
- UI routes: `src/app/portal/`.

Prefer extending these layers over introducing a second representation of the
same client, task, invoice, stage, alert, or portal.
<!-- AQUACRM_SOURCE_END path="docs/PRODUCT-ARCHITECTURE.md" -->

---
