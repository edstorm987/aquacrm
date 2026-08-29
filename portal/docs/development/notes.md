# Notes & decisions

← Back to [development.md](../development.md) (the law)

Durable context and decisions that aren't obvious from the code — the "why", so
nobody re-litigates a settled call or gets caught by a non-obvious fact. Newest
at the top.

## What a new agency inherits from the origin — Ed's answers (2026-08-27)

Asked the three questions the origin template hinged on, Ed settled all of them:

> "just for now be a real agency i operate for now i need to get this out for
> myself first! but it will be both … and yes it will do designs too … and no
> phases sops individually written ones wont transfer … contract templates
> branded no, templates sure."

Which reads as:

| | |
|---|---|
| **What the origin IS** | A real agency Ed operates — for now. It will **also** be a system-owned artefact later, so nothing may assume which. Named by `AQUA_ORIGIN_AGENCY_ID`; `projectAgencyOrigin()` takes an agency id, so a synthetic origin only has to produce one. |
| **Portal designs** | Transfer. |
| **Phases, SOPs, written material** | Do **not** transfer. Individually written work is the agency's own voice, and phases are its own lifecycle. |
| **Contract & task templates** | Transfer — the template, never the branding, and never a client's actual agreement. |

**The branding rule, since "branded no" cannot be automated honestly.** Branding
lives in free body text; a regex pretending to remove it would be worse than
saying so. So the line is drawn where it CAN be drawn: a contract template
created from a real client contract (`sourceContractId` present) is that client's
agreement in template clothing and does not transfer **at all**; the rest do, and
come back in `needsRebrand` so a person rewrites the wording deliberately.

**Ordering consequence worth remembering:** Ed's "I need to get this out for
myself first" means the origin is Milesymedia and the first consumer is Ed. Do
not build multi-tenant origin governance before the single-tenant path he
actually needs works.

## Where a client touches the editor — Ed's placement decision (2026-08-27)

Asked where a client should find their editor for phase 18, Ed drew the line by
**audience**, not by feature:

> "inside the client internal workspace is for internal employees. if the client has a
> website or software then we will optionally toggle to embed it into their portal…
> client internal we will have one anyway but we can face it to their portal for updates
> etc, but **for clients anything they touch is inside their portal**."

So the rule is:

- **`/portal/clients/<clientId>` is INTERNAL.** It is the agency-side workspace for Ed and
  his employees. The editor mounts there anyway, for internal work on that client's site.
- **A client's own portal is where the client touches anything.** When a client has a
  website or software project, the editor is **optionally toggled ON per client** and faced
  into their portal. Off by default: having a project does not automatically hand the client
  an editor.
- The toggle is a per-client decision Ed makes, not a role or a template. It composes with —
  and never replaces — the exact project grant: the toggle decides whether the surface is
  offered at all, the grant decides what it can do.

**Known tension — investigated 2026-08-27, and it is smaller than it looked.**
`src/app/portal/page.tsx:20` does redirect `client-owner`/`client-staff` INTO
`/portal/clients/<clientId>`. But the internal MUTATION surface is already
internal-only, by role, before any grant is consulted: `client-properties` is
`requireRoleForClient([...AGENCY_ROLES])` (`:144`) and `customer-portal-control`
401s anything failing `isAgencyRole(session.role)` (`:100`). A client role is
refused there even holding `client.portal.manage` on its own client — pinned by
`scripts/smoke-client-role-workspace-boundary.test.ts` (6/6), which also proves
an agency identity still works, so the boundary is about audience rather than a
dead route.

So Ed's rule is **already true for what a client can DO**; what remains is where a
client is SENT and what they SEE — a product/UX separation, not an exposure. That
matters for sequencing: it is safe to build the client-facing surface deliberately
rather than urgently.

**The destination — SETTLED by Ed, 2026-08-27.** Asked whether the client's portal
should be a new surface or whether the existing customer portal is meant to be it,
Ed answered: *"existing customer portal actually meant to be."*

So `/portal/customer` **is** the client's portal. The `end-customer` role name is
the legacy artefact, not the design: the portal already renders exactly what a
client is given — their project stage, invoices, files, support — and
`/client-preview/<id>` is the agency-side preview of that same portal.

**What that makes the work:** re-point client roles at it rather than build a
second portal. Concretely, `src/app/portal/page.tsx:20` stops sending
`client-owner`/`client-staff` into the internal workspace, and the customer
portal's `requireRole("end-customer")` gate (`app/portal/customer/layout.tsx:30`)
widens to the client roles it was always for. Both are small; the care needed is in
what the portal then shows each audience, and in not breaking the end-customer
journeys (orders, membership, bookings) that share the surface. Its own scoped
change, with its own browser matrix.

## The template system lives in Fulfilment — Ed, 2026-08-27

Ed asked for portal templates and product portals to be integrated into the
editor, "to make a system so I can edit and seed everything that will follow…
the original product will be the agency for everyone, with all products
services" — then immediately corrected the home himself: *"actually this should
mean it all lives in fulfilment."*

That is his own contract applied: `CLAUDE.md` says Fulfilment owns the
product/service operating model, and a library of product portal templates that
every client instance is seeded from is exactly that.

**Grounding, because most of this already exists:** `ClientPortalTemplateRecord`
and `ClientPortalInstanceRecord` already give template → instance with
`templateVersionId` pinning; `ensureProductPortalTemplate` provisions a template
per product; the Dev Editor already edits templates at
`/portal/agency/portals/editor`; and every page there is **already** gated on
`fulfilment.portals`. So the authority is already Fulfilment's — what is missing
is placement (the library is a top-level route, not inside the Fulfilment
workspace) and the genuinely new idea: a **cross-tenant origin template**, since
templates are `agencyId`-scoped today and `baseTemplateId` inherits only within an
agency. Full write-up:
[fulfilment-template-system.md](plans/fulfilment-template-system.md).


## Architecture / naming
- **Milesymedia = Aqua (legacy names).** The product is branded "Aqua Advisor" / "AquaCRM", but legacy identifiers still say Milesymedia (`askMilesymediaAssistant`, default agency id `"milesymedia"`, env `MILESYMEDIA_ASSISTANT_API_TOKEN`, `/milesy-tag.js`). Same tenant — don't treat them as separate.
- **Two persistence concerns, don't conflate:** the whole `PortalState` is one JSON blob (file / postgres `portal_kv` / supabase `app_datastores`), *separate* from the discrete Supabase tables (`brand_enquiries`, `inbox_*`, etc.). Which blob backend is live depends on `PORTAL_BACKEND`. (See [database.md](../workspace/database.md).)
- **File-backed persistence contract was repaired 2026-08-25.** Whole-state commits
  now use a same-directory temp file, fsync and atomic rename; failed saves are
  surfaced and mark the backend unwritable; malformed JSON fails closed instead of
  becoming an empty writable state. Keep the recovery regression with any storage
  change. Cross-process collection transactions are still a separate concern.
- **State goes through `getState()` / `mutate(fn)`** (`src/server/storage.ts`) — never mutate returned objects directly. New collection → add to `types.ts` `PortalState`.
- **Auth is enforced in the server layer, not middleware.** `middleware.ts` matches `/portal/*` but is a pass-through no-op. Don't add auth there expecting it to run first.
- **Integrations ⇄ settings are always both — two views, one source (Ed's principle).** A connection (Meta, email, SMS, …) should be manageable from **both** "Your connections" *and* Agency settings — the user shouldn't have to hunt for where it lives. **But** it's stored **once** (the integration-connection record); settings *renders the same record*, it does not hold a second copy. Two stores would drift (see [hazards](../workspace/hazards-and-duplication.md)) — "both" means both surfaces, one source of truth.

## Verification discipline (Ed's point — a passing test ≠ working ≠ usable)
- Most tests are **static-source contract tests** — they assert code *shape*, not runtime behaviour. Green means "structure intact", not "it works". The generated docs share the limit — they were parsed, not run.
- **Never claim a feature works without running it.** Distinguish: coded → static-tested → runtime-verified → user-reachable. Record the real level in [status.md](status.md).
- When something matters, **exercise it** (click the flow / hit the live endpoint) and prefer a behavioural test (renders/calls and asserts the *result*) over another source-shape assertion.
- Editor AI now includes an opt-in two-independent-Node-process Postgres claim test,
  but it is skipped when `DATABASE_URL` is absent. Matching DDL and green local
  tests still do not establish that production has the migration applied; run the
  database test against the deployed contract before claiming production acceptance.

## Product decisions (settled — don't re-open without Ed)
- **Scope-down is deliberate.** The standard portal is *one* Website product; the rest of the catalogue gets rebuilt one at a time. Don't re-sprawl the product list.
- **Guess, then human-confirm.** Matching/classification always suggests; a human accepts. Every advisor/radar/external-AI suggestion requires acceptance before it becomes committed work — enforced in code (`createAgencyTask` behind a click). Don't build anything that auto-commits.
- **The Aqua Tag runs on Ed's own sites first (dogfood) before any client.** The client version is the same flow repackaged.
- **Radar's three axes are separate on purpose** — health ≠ evidence-confidence ≠ readiness. Missing evidence is a visible `blind` spot, never a healthy `pass`. Don't collapse them.
- **Action types are a contract** — `in-app` (Resolve button) / `off-system` (Mark done) / `judgement` (Evidence, no Resolve). Never offer Resolve for off-system/judgement work. Enforced at `AttentionControls.tsx:71`.

## Gotchas learned
- **`.npmrc install-links=true`** vendors plugins into `node_modules` — **re-run `npm install` after editing plugin source** or the change isn't picked up.
- **Two lockfiles** — npm is canonical (`.npmrc` + Vercel use npm); the `pnpm-lock.yaml` is stale/secondary.
- **Full test suite, not `smoke:all`** — 7 test files lack the `smoke-` prefix and are missed by the narrow glob. (See [tests.md](tests.md).)
- **Dev/demo inbox is empty by design** (`session.isDemo ? []`) — don't conclude enquiry features are broken from the sandbox.
- The assistant model is **`gpt-5-mini`** (default), via the OpenAI Responses API, non-streaming, 45s timeout.

## People
- Ed: solo founder, has been building this for months, pre-launch, burned out — communicate plainly and honestly, no dense walls. All data is his own test data.

_This file is for context that would otherwise be lost. Code structure lives in
the [file map](../WORKSPACE-FILE-TREE.md); issues/risks live in
[issues.md](issues.md); the running log is [updates.md](updates.md)._
