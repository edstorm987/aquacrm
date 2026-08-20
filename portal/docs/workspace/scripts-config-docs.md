# Chapter — Scripts, config & docs (`scripts/`, repo root, `docs/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

## Repo-root config

| File | Controls |
| --- | --- |
| `package.json` | App manifest + all npm scripts. Next 16.3, React 19.2, Supabase, pg, nodemailer, Tailwind v4, tsx. |
| `package-lock.json` **+** `pnpm-lock.yaml` | **Two lockfiles.** npm is canonical (`.npmrc` + Vercel use npm); the pnpm one is stale/secondary — keep npm's authoritative. |
| `next.config.ts` | Security headers (HSTS/CSP), `rewrites()` for the marketing site → `public/aquacrm-site/`, **strict build gate** (full ESLint + TS, no ignore flags). |
| `middleware.ts` | Matches `/portal/:path*` but is a **pass-through no-op** — auth is enforced in the server layer, NOT here. Don't add auth logic here expecting it to run first. |
| `tsconfig.json` | `strict`, `@/*`→`src/*`, `@aqua/plugin-*`→`built-ins/modules/*`. **Excludes `scripts`, `__smoke__`, `_attic`.** |
| `tailwind.config.ts` | `brand` tokens bound to CSS vars (per-tenant branding). |
| `.npmrc` | `install-links=true` — copies vendored plugins into `node_modules`. **Re-run `npm install` after editing plugin source** or your change won't be picked up. |
| `.env.example` | Every env var, split into per-deployment (infra) vs per-client (portal editor). `.env.local` = local secrets, gitignored. |
| `vercel.json` | `npm install --legacy-peer-deps`; one cron: `/api/cron/inbox` daily 06:00. |
| `AGENTS.md` / `CLAUDE.md` | AI-session rules + non-negotiable contracts. **Read these first.** |

**Key npm scripts:** `dev` (:3032), `dev:sandbox` (file backend),
`dev:sandbox:real` (milesymedia data — Ed's working sandbox), `build`,
`typecheck`, `smoke:all` (narrow glob), plus ~60 `smoke:<name>` shortcuts.

> **Full suite (canonical — run before calling any behaviour change done):**
> ```bash
> PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
> ```
> `PORTAL_BACKEND=memory` keeps stateful tests off Ed's live sandbox.

## `scripts/` (277 entries, 242 of them `*.test.ts`)

**Test convention:** `node:test` files run through `tsx` (no Jest/Vitest),
mostly **static-source contract tests** (`readFileSync` a module + assert on its
content). `scripts/` is excluded from tsconfig — they only run under tsx.

> ⚠ **Seven files omit the `smoke-` prefix**, so `smoke:all`'s narrow glob
> misses them (the `*.test.ts` full-suite glob catches them): `company-health`,
> `client-aqua-health`, `client-marketing-service`, `client-workspace-navigation`,
> `hiring-capacity`, `attention-protection`, `inbox-attention-thread`.

**242 `*.test.ts`, grouped by domain** (re-counted 2026-08-20) — there's a smoke test for almost
everything, so **check for an existing one before changing behaviour** (a
contract test may pin the behaviour you're about to change):
radar/monitoring · inbox/attention/actions · products/portals/client-workspaces ·
connections/auth/session · finance/commerce · enquiries/leads/journey ·
people/persons/identity · command-centre/nav/shell · assistant/advisor/external-AI ·
website/editor/domains · fulfilment/delivery/dev-ops · platform/storage/perf/readiness.

**Non-test scripts:**
- **HTTP/e2e harnesses** (`.mjs`, need a live server): `smoke.mjs` (main black-box), `post-deploy-smoke.mjs`, `smoke-ux.mjs`, `smoke-perf.mjs`, `smoke-postgres.mjs`, `perf-baseline.mjs`.
- **Build/deploy:** `prepare-vercel-root-manifest.mjs` (post-build), `vercel-build.sh`, `build-route-inventory.mjs` → `route-inventory.json`, `schema.sql` (Postgres single-table KV).
- **Migration/seed:** `provision-founder.mjs`, `migrate-file-to-{postgres,supabase}.mjs`, `backfill-persons.ts`, `seed-dev-tenant.ts`, `seed-bare-co-portal.ts`, `seed-contact-card-fixture.ts`.
- **Audit/cleanup:** `audit-{actions,alert-families,judgement-evidence}.ts`, `launch-audit.ts`, `catalogue-development-workspace.ts`, `purge-duplicate-development-artifacts.ts` (`--apply`-gated), **`cleanup-junk-enquiries.mjs`** (one-off: deletes junk live-Supabase enquiries + stray test users; backs up first — **for Ed to run himself**).

## `docs/`

The prose docs (this file map is the structural companion to them):
- `PRODUCT-ARCHITECTURE.md` — domain ownership + the macro/micro workspace model.
- `CURRENT-IMPLEMENTATION.md` — what's built + integration-truth boundaries.
- `DEVELOPMENT-HANDOFF.md` — repo workflow (persistence, testing, git safety, deploy).
- `WHERE-WE-ARE.md` — honest plain-language state-of-the-app map.
- `SESSION-HANDOFF-2026-08-19.md` — latest resume point (single entry for a fresh chat); `-2026-08-18.md` = prior day.
- `WORKSPACE-FILE-TREE.md` — the **contents page** for this map; `workspace/` — its chapters (you are here).
- Feature docs: `portal-tiers-and-fractal-fulfilment`, `website-editor-and-migration`, `meta-master-inbox`, `external-assistant-api`, `development-workspace-cleanup`, `zimante-brand-architecture`.
