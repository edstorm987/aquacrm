# `src/lib/server/portal/apiTenantScope.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** WHO DECIDES THE TENANT ON A PLUGIN API CALL?  The plugin API dispatcher (`/api/portal/[module]/[...rest]`) has always accepted a `?agencyId=` / `?clientId=` scope hint. R032 gave it a second job: PUBLIC routes — a Stripe webhook, Postmark's delivery callback, the funnel's capture handoff — land with no session at all, so the only place their tenant can come from is the URL. To know whether a route is public the dispatcher has to resolve it first, so it "peeks" using the caller's own agencyId.  That peek then became authoritative for EVERY route, not just the public ones:  const peeked = queryAgencyId ? resolvePluginApiRoute(…, { agencyId: queryAgencyId }) : null; … const resolved = peeked ?? resolvePluginApiRoute(…, { agencyId: session.agencyId });  `peeked` is non-null whenever `?agencyId=` names an agency with the plugin installed, so the `??` fallback — the branch that used the session — never ran. An agency-owner in agency A POSTing `/api/portal/agency-hr/staff?agencyId=B` was resolved against B's install, handed a `PluginCtx` carrying B's `agencyId` and B's plugin storage, and got back `201 { agencyId: "B" }`. Reading it back with `?agencyId=B` returned it; their own agency listed empty. Cross-tenant write, then cross-tenant read, from the browser, with no role gate involved — the dispatcher was gated by ROLE, not by TENANT.  ─── The rule ─────────────────────────────────────────────────────────────  A query-supplied agencyId is authoritative ONLY when the resolved route is genuinely public. The instant a session exists, the SESSION decides the tenant, and a query parameter that names someone else is a REFUSAL — never a silent redirect of scope.  Two deliberate seams in that rule, both pinned by `scripts/smoke-plugin-api-tenancy.test.ts`:  1. R025 multi-agency. A master user's session carries `agencyIds[]`. A query naming one of THEIR OWN agencies is honoured — that is the Topbar agency switcher, not an escalation. Anything outside the membership is refused. 2. Public routes are not re-gated by a session that happens to be present. A public route answers anonymous callers by definition: refusing the same call because the caller also holds an unrelated cookie protects nothing (log out, call again) while breaking the real case — a signed-in `lead`, whose session lives in the `agency_lead_global` sentinel tenant, submitting a funnel form that belongs to a real agency.  `clientId` gets the same treatment one level down. It never selects the tenant (the agency does), but it selects the install and lands in `ctx.clientId`, so a caller must not be able to name a client that is not theirs: a client-side role is pinned to its own `session.clientId`, and an agency-side role may only name a client its own agency owns.  This lives in its own module, as a pure function over a session shape, so the decision can be driven directly in tests and so the negative control (the pre-fix `peeked ?? …` rule) can be written out and shown to leak.

## Exports (5)

- `interface TenantScopeSession (4 members)`
- `interface ApiTenantScopeInput (5 members)`
- `type ApiTenantScope`
- `resolveApiTenantScope(input: ApiTenantScopeInput): ApiTenantScope`
- `tenantScopeSession(session: SessionPayload): TenantScopeSession`

## Depends on (1)

- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`scripts/smoke-plugin-api-tenancy.test.ts`](../../../../scripts/smoke-plugin-api-tenancy.test.md)
- [`src/app/api/portal/[module]/[...rest]/route.ts`](../../../app/api/portal/[module]/[...rest]/route.md)

