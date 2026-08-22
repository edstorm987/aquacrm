# AquaCRM Development Handoff

> **Despite the name, this is the ENVIRONMENT RUNBOOK — repo, ports, commands,
> persistence, backends.** It is live, it is named as required reading by
> `CLAUDE.md`, and it is *not* a session handoff. The dated session handoffs
> (`SESSION-HANDOFF-2026-08-18/19`) were a different thing wearing a similar
> name; they were archived 2026-08-21 to the
> [history shelf](context/archive/README.md).
>
> ⚠ Two known staleness points in the text below, flagged rather than silently
> rewritten: the install line still says `npm install --legacy-peer-deps`, and
> this file's own "last updated" predates several environment changes. Verify
> against `package.json` before trusting a command.

Last updated: 17 August 2026

## Repository And Runtime

- GitHub: `https://github.com/edstorm987/aquacrm`
- App directory: `portal/` inside the repository
- Local app directory on Ed's machine:
  `/Users/eds/Desktop/Projects/Web Development/Personal EcoSystem/aquaCRM/portal`
- Framework: Next.js App Router with React and TypeScript
- Local port: `3032`
- Vercel Root Directory: `portal`
- Default branch: `main`

Install and run:

```bash
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3032`.

## Required Reading

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/PRODUCT-ARCHITECTURE.md`
4. `docs/CURRENT-IMPLEMENTATION.md`
5. Relevant files in `node_modules/next/dist/docs/` before using Next.js APIs

## Persistence

The aggregate state and backend selection live in `src/server/storage.ts`.
Production must use a durable backend.

Local development does **not** default to the file backend. `pickBackend()`
promotes to Supabase whenever `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set and `PORTAL_BACKEND` is unset — which is
the normal state of `.env.local`. So a plain `npm run dev` reads and writes the
**live Supabase database**. There is no local sandbox by default.

To develop against a disposable copy instead:

```bash
npm run dev:sandbox
```

That pins `PORTAL_BACKEND=file`, so all reads and writes go to
`.data/portal-state.json` (gitignored) and production is untouched. Seed it
with a snapshot of live data when you need realistic records. Use
`npm run dev` only when you intend to work against production data.

Supported backend kinds in the current storage layer are:

- `file`: local development persistence;
- `memory`: ephemeral tests/development only;
- `postgres`: durable database backend;
- `supabase`: durable Supabase storage backend;
- `kv`: reserved but not wired.

Production readiness rejects file or memory persistence. Supabase is selected
when its complete configuration is present, unless another backend is
explicitly selected. Postgres is selected when `DATABASE_URL` is present.

Do not introduce module-level Maps or arrays as production persistence. Use
the aggregate state, a domain server module, or an existing durable specialist
store such as Inbox, private uploads, Radar evidence, or website enquiries.

## Main Code Map

```text
src/app/                 Next.js pages, layouts, and API routes
src/app/portal/          Authenticated workspace routes
src/app/api/             Server mutation and integration boundaries
src/components/          Shared UI and chrome
src/built-ins/           Installable domain modules
src/lib/                 Reusable domain calculations and client helpers
src/lib/server/          Server-only integrations, evidence, auth, and adapters
src/server/              Persisted aggregate models and domain repositories
src/server/types.ts      Canonical persisted type catalogue
scripts/                 Smoke, contract, migration, and audit tests
docs/                    Architecture and integration handoff
```

Useful entrypoints:

- agency home: `src/app/portal/agency/page.tsx`
- client workspace: `src/app/portal/clients/[clientId]/page.tsx`
- client tabs: `src/lib/clients/clientWorkspace.ts`
- Master Inbox: `src/app/portal/agency/inbox/_MasterInbox.tsx`
- Actions: `src/app/portal/agency/actions/_ActionsWorkspace.tsx`
- Journey: `src/app/portal/agency/pipelines/[slug]/`
- Fulfilment: `src/app/portal/agency/fulfilment/`
- product models: `src/server/agencyProducts.ts` and
  `src/server/productWorkspaces.ts`
- operational alerts: `src/lib/server/inbox/operationalAlerts.ts`
- Radar: `src/engines/data/server/radar/businessIssueRadar.ts`, `src/engines/data/radar/radarPolicyEngine.ts`,
  and `src/engines/data/radar/radarCheckEngine.ts`
- permissions: `src/lib/server/auth/requireAgencyScope.ts` and
  `src/lib/server/RequirePermission.tsx`

## API And Mutation Pattern

For a normal feature:

1. Define or extend the canonical type in `src/server/types.ts`.
2. Add domain operations in `src/server/` or the correct built-in module.
3. Add a scoped API route in `src/app/api/`.
4. Enforce session, agency, role, and client scope server-side.
5. Use the API from a client component and refresh authoritative data.
6. Emit or refresh operational attention when the mutation changes risk.
7. Add a focused smoke test in `scripts/`.

Never rely on hiding a button as authorisation. UI permissions improve the
experience; server permissions protect the data.

## Making An Action Resolvable

Every operational alert already carries resolution context — `listOperationalAlerts`
stamps `?resolve=<alertId>&focus=<what>` onto every href centrally, so a new
alert type gets it for free. The announcement bar is mounted in the agency
layout and appears on any page opened from a Resolve click.

To make a screen point at the control that needs acting on, add one attribute
to the relevant section:

```tsx
<section data-resolution-focus="payment">
```

`ResolutionSpotlight` (mounted in the layout) finds it, applies the amber ring
and the "Needs your action" marker, and scrolls it into view. No props, no
component changes, no focus state. Valid values are `ResolutionFocus` in
`src/lib/inbox/resolutionContext.ts`.

A page with no annotated target is fine: the bar still names the task, there is
simply no ring. Never invent a target — a ring pointing at the wrong control is
worse than none.

### Multi-step resolutions

When a job spans several places, add a plan in
`src/lib/server/resolutionPlans.ts`. Steps are **derived from live records on
every request**, never stored — a stored checklist drifts out of sync with the
business and then lies about it.

Every step must have an observable completion condition. If you cannot derive
whether a step is done, do not add the step: it will never tick and will strand
the operator on a checklist that cannot complete.

## Route And Navigation Rules

- Preserve query-addressable workspace lenses, for example
  `/portal/clients/<id>?tab=finance`.
- Keep compatibility aliases when replacing a route that existing alerts,
  bookmarks, or portals may still reference.
- Notifications and search results must link to the narrowest actionable
  destination.
- If focus protection or a collapsed section can hide a deep-linked record,
  promote/open only the requested record.
- Client-scoped work should stay inside the client workspace unless the user
  explicitly asks for the portfolio view.
- Use `src/lib/clients/clientWorkspace.ts` for client tab IDs and URL creation.

## UI Rules Already Established

- Operational interfaces are dense, calm, and scan-friendly.
- Cards represent real records or tools, not decorative page sections.
- Use Lucide icons through the existing icon system.
- Icon-only controls require accessible names and tooltips where unfamiliar.
- Buttons and labels must fit at phone, tablet, and desktop widths.
- Tablet can use a manually collapsible sidebar; it should not be forced into
  the phone-only navigation model.
- Dark mode must preserve contrast and status visibility.
- Command Centre deliberately uses its own dark experience.
- Customer/internal client workspaces use their own differentiated theme and
  must not expose an Aqua attribution label that weakens bespoke branding.
- Loading transitions respect Performance Mode.
- Notification dots, counts, hover explanations, read/park/dismiss state, and
  exact resolution paths should remain consistent across sidebar, tabs, and
  workspaces.

## Validation

Run focused checks while iterating:

```bash
npm run typecheck
NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/<relevant-test>.test.ts
git diff --check
```

Run the broad suite before a significant release:

```bash
npm run smoke:all
npm run build
```

Useful targeted scripts include:

```bash
npm run smoke:notifications
npm run smoke:advisor
npm run smoke:external-assistant-api
npm run smoke:google-calendar
npm run smoke:integrations
npm run smoke:meta-inbox
npm run smoke:people-workspace
npm run smoke:production-readiness
```

The repository contains many source-contract smoke tests. They are intentional:
they protect connected workflows that are difficult to cover through one UI
test. Update a contract test when the behaviour deliberately changes; do not
weaken it only to make a failure disappear.

## Local And Git Safety

- Inspect `git status -sb` and the diff before editing or staging.
- Work with existing local changes. Do not reset or revert them.
- Use `apply_patch` for manual edits.
- Do not commit, push, deploy, change branches, or rewrite history unless Ed
  explicitly asks.
- When Ed says "git everything", confirm the remote is
  `edstorm987/aquacrm`, commit the complete intended AquaCRM worktree, push
  `main`, then compare local and remote commit hashes.
- Do not commit `.env.local`, tokens, credentials, generated build output, or
  personal data.

## Vercel And Production

Vercel must build from the repository's `portal` root directory. Required
environment variables and safety notes are listed in `.env.example`.

Before calling a deployment healthy, verify:

- `/healthz` returns HTTP 200;
- `/healthz/full` returns HTTP 200 and `readyForProduction: true`;
- Settings -> Launch reports database, storage, email, and security ready;
- the deployed commit matches the intended `main` commit;
- login is the real authenticated flow, not Showcase Mode;
- production is not using file or memory persistence.

Showcase Mode is intentionally read-only fictional data. It must never block a
real database login or be presented as the client authentication path.

## Integration Documents

- External assistants: `docs/external-assistant-api.md`
- Meta/Instagram messaging: `docs/meta-master-inbox.md`
- Development cleanup: `docs/development-workspace-cleanup.md`
- Brand architecture: `docs/zimante-brand-architecture.md`

## End-Of-Task Checklist

1. Re-read the user's latest request.
2. Confirm the change belongs to the correct domain.
3. Check client/agency scope and customer visibility.
4. Check empty, loading, error, permission, and responsive states.
5. Run TypeScript and focused tests.
6. Use the local app to verify the primary interaction.
7. Report what changed, what was verified, and whether work remains local or
   has been published.
