# Workspace file tree — the contents page

This is the **index** to a full map of the AquaCRM portal: what every part does,
so edits land in the right place and nothing gets built twice. The detail lives
in per-area **chapters** in [`docs/workspace/`](workspace/) — this page is the
table of contents and the shared rules.

**1,733** `.ts`/`.tsx` files in `src` (722 under `src/built-ins`), **308** `scripts/*.test.ts`.
Big, but every concern has one owning place — the chapters tell you where.
Counts re-taken 2026-08-24; re-take them rather than trusting them:
`find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l`.

> This map was reconciled for non-security structure only. Current delivery and
> reliability live in [development/checklist.md](development/checklist.md).

---

**New here, or coming back after a while?** Read
[architecture-noobie.md](architecture-noobie.md) first — the whole system in plain
English, no assumed knowledge. Then come back to this page for the detail.

## The golden rule

**Before adding a file or a feature, find the concern first.** Most "where does
this go?" and "did we already build this?" questions are answered by the
[Feature → files index](workspace/feature-index.md). If two things look alike,
check [Hazards & duplication](workspace/hazards-and-duplication.md) **before**
editing — several features exist twice, and editing the obvious file is
sometimes the wrong move.

The owning layer, by kind of change:

| Changing… | Lives in | Chapter |
| --- | --- | --- |
| State / data (the `PortalState` store) | `src/server/` | [State layer](workspace/state-layer.md) |
| Logic / services / engines | `src/lib/<domain>/`, `src/lib/server/<family>/` — foldered by domain 2026-08-20, see chapter head | [Shared logic](workspace/shared-logic.md) |
| An HTTP endpoint | `src/app/api/**/route.ts` | [API & routes](workspace/api-and-routes.md) |
| A screen | `src/app/portal/**/page.tsx` + `_Component.tsx` | [Portal UI](workspace/portal-ui.md) |
| **The editor** (there is only ONE) | `src/engines/editor/` — `DevEditor.tsx` is the whole editor surface, `editing/` the plan→confirm→publish loop, `elements/` the block vocabulary, `server/` its loaders. It is **route-independent**: `agency/portals/editor` and `dev-team/editor/studio` are doors that mount it. No portal/website/code editors as separate things. Moved out of the portals route 2026-08-21. | [Feature index](workspace/feature-index.md) · [Portal UI](workspace/portal-ui.md) |
| A whole feature/module | `src/built-ins/modules/<plugin>/` | [Plugins](workspace/plugins.md) |
| Shared UI (shell, primitives) | `src/components/` | [Components](workspace/components.md) |
| Config / tests / docs | root, `scripts/`, `docs/` | [Scripts, config & docs](workspace/scripts-config-docs.md) |

> **Two backends exist:** local **file/memory** state (`.data/portal-state.json`)
> and **live Supabase** (auth + `brand_enquiries` + Storage). `.data/` is local,
> but **it is not a sandbox for the whole app**: `PORTAL_BACKEND=file` guards the
> state file only, while `lib/supabase/admin.ts` reads env directly and reaches the
> **real** auth + `brand_enquiries` + Storage project even in local dev. Anything
> touching Supabase is real, un-sandboxed data — see the
> [live-data hazards](workspace/hazards-and-duplication.md#-live-data-hazards-real-un-sandboxed).
>
> **The DDL and the RLS policies are NOT in `portal/`** — they are a normal
> Supabase CLI project one directory up, at `../supabase/migrations/` (14
> migrations, 26 policies). An audit scoped to `portal/` will correctly find
> nothing and incorrectly conclude nothing exists; that happened, and it sent a
> work lane off on a false premise. See the [database chapter](workspace/database.md).

---

## The chapters

1. **[State layer](workspace/state-layer.md)** — `src/server/` (56 TypeScript files). The `PortalState` store and every CRUD/domain function over it. Start here to understand the data.
2. **[Shared logic](workspace/shared-logic.md)** — `src/lib/` + `src/lib/server/` (219 TypeScript files). Services, integrations, auth, the Aqua Tag. The client-safe vs server-only split. ⚠ **The engines moved out of `src/lib/` and now live in `src/engines/`**: `src/engines/{editor,data,sop}/` (85 TypeScript files). The editor is `src/engines/editor/**` (incl. `elements/` — the block vocabulary, which left the website-editor plugin 2026-08-20 and is **not** at `lib/elements/`); Radar is `src/engines/data/radar/**`.
3. **[Portal UI](workspace/portal-ui.md)** — `src/app/portal/` (agency / clients / customer / team). Every screen, its tabs, and the load-bearing components.
4. **[API & routes](workspace/api-and-routes.md)** — `src/app/api/**` + the non-portal routes, grouped by area with the **live-Supabase** ones flagged. For the exhaustive one-row-per-endpoint version (path · methods · purpose · scope · live), see the **[full API reference](workspace/api-reference.md)**.
5. **[Plugins](workspace/plugins.md)** — `src/built-ins/` (722 TypeScript files). The 13 feature modules and the runtime that installs them, mapped internally.
6. **[Components](workspace/components.md)** — `src/components/` (93 TypeScript files). The app shell (chrome), attention surface, and reusable primitives.
7. **[Scripts, config & docs](workspace/scripts-config-docs.md)** — root config, the 308 test files, and the prose docs. Includes the canonical full-suite command.
8. **[Feature → files index](workspace/feature-index.md)** — the conflict-avoider: "where does X live?" across all layers, per feature.
9. **[Hazards & duplication](workspace/hazards-and-duplication.md)** — live-data risks, confirmed duplicates, drift-prone twins, dead/alias code, and the standing rules. **Read before editing.**
10. ~~Recent changes (Aug 2026)~~ — **archived 2026-08-21**; it was a dated session narrative, not a chapter of the map. The running record of every change is **[updates.md](development/updates.md)** (the one log); the file itself is on the [history shelf](context/archive/README.md).

**Feature dossiers** (a whole subsystem pulled into one verified page — read from source, omega detail):
- **[Radar](workspace/radar.md)** — the 2,064-rule catalogue, the check engine, the health/evidence/readiness contract, policy, correlations, sentinels, the scan flow, the in-app/off-system/judgement action model, and the full test inventory.
- **[Advisor & AI Assistant](workspace/advisor.md)** — the 8 skill recipes, action/proposal types + human-acceptance flow, context builders, the OpenAI wiring, and every MCP tool.
- **[KPI & Intelligence](workspace/kpi-intelligence.md)** — every metric with its formula and source (20 command KPIs + 40 commercial formulas), the trajectory mechanics, and computed-vs-hardcoded-vs-index.
- **[The Aqua Tag](workspace/aqua-tag.md)** — the tag script + verified internals, keys & routing, all its views/workspaces, detect/scan engine, ingestion + telemetry, consent model, endpoints.
- **[Database (Supabase)](workspace/database.md)** — table-by-table columns, storage buckets, auth flows, and security — with the hard repo-vs-dashboard boundary (RLS is not in the repo).

---

## The function-by-function reference (`docs/reference/`)

The chapters above tell you **what each area does**. The
**[symbol reference](reference/00-index.md)** tells you **where every single
function is** — every exported function, class, service method, type and const
in all 1,649 source files, with its **real signature and doc-comment**.
**6,352 symbols**, grouped by area:

- [State layer](reference/server.md) · [Shared logic](reference/lib.md) · [Components](reference/components.md) · [Plugins](reference/built-ins.md) · [App routes & UI](reference/app.md) · [Scripts](reference/scripts.md)

**Grep it instead of opening source** — that's the context-saver. It's
**generated** by [`scripts/generate-symbol-reference.mjs`](../scripts/generate-symbol-reference.mjs)
(parses the code with the TypeScript compiler, so it never misses a file), and
**re-runnable** so it stays true:

```bash
node scripts/generate-symbol-reference.mjs
```

For the deepest layer, browse the **[source-file index](reference/files-index.md)**.
Every source path jumps to an anchored entry in one of the eight large reference
volumes, where its purpose, API, dependencies and dependants stay together. The
old one-Markdown-file-per-source tree was consolidated because it created more
than 2,000 tiny docs with the same information.

```bash
node scripts/generate-symbol-reference.mjs
```

For endpoints specifically, the [full API reference](workspace/api-reference.md)
adds purpose + scope + live-data flag per route.

---

## Top-level layout

```
aquaCRM/portal/
├── src/
│   ├── app/            Next.js App Router — routes, pages, API (558 TypeScript files)
│   │   ├── api/            HTTP endpoints (portal, public, tenants, auth, v1…)
│   │   ├── portal/         Authenticated UI (agency / clients / customer / team)
│   │   ├── connect/ setup/ login/ dev/ …   public + auth flows
│   │   ├── (website)/      Public marketing site route group
│   │   └── aqua-tag.js/    Serves the Aqua Tag script
│   ├── lib/            Shared logic — client-safe + server-only (219 TypeScript files)
│   │   └── server/         server-only services (Supabase, radar, enquiries…)
│   ├── server/         State/store layer (56 TypeScript files)
│   ├── components/     Shared UI (chrome, attention, editing, auth) (93 TypeScript files)
│   ├── engines/        Editor, Data and SOP engines (85 TypeScript files)
│   └── built-ins/      Plugin/module system (722 TypeScript files)
│       ├── runtime/        registry + foundation adapters
│       └── modules/        one folder per plugin (website-editor, finance…)
├── scripts/            308 test files + tooling (344 top-level files total)
├── docs/               handoffs, architecture, this map
│   └── workspace/          the chapters this page indexes
└── .data/              local state file (git-ignored — NOT a sandbox: see below)
```

---

## Keeping this map honest

It's a living map — when you add a feature or move something, update the
relevant chapter and, if it's a new cross-layer concern, the
[feature index](workspace/feature-index.md). If you create a new duplicate or
alias (sometimes unavoidable), log it in
[hazards](workspace/hazards-and-duplication.md) so the next person doesn't get
caught. The map is only worth trusting if it stays true.
