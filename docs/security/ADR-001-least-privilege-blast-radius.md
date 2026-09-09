# ADR-001 — Reduce the shared service-role blast radius (Item 6)

**Status:** ACCEPTED (design) · code preparation landed on
`security/production-gate-repair-20260908` · the infrastructure move is **OWNER
ACTION** (separate Supabase projects / scoped credentials / secret rotation).

## Context

The portal (`portal/`) and the standalone client portal (`client-portal/`) are
two deployed applications that today share **one Supabase project** and each
hold a **full-project `SUPABASE_SERVICE_ROLE_KEY`** (which is `BYPASSRLS`). That
key in a sibling application means: theft of the client-portal credential yields
read/write to **every table and bucket of every app and every tenant** — the
portal's `app_datastores` (all tenants' PortalState), `brand_enquiries`,
`audit_events`, and all storage buckets. Application-level tenant checks do not
constrain a `BYPASSRLS` key; only the database boundary does.

## Inventory (2026-09-09)

| Application | Supabase credential held | Effective reach |
|---|---|---|
| `portal/` | `SUPABASE_SERVICE_ROLE_KEY` (full project, BYPASSRLS) | everything |
| `client-portal/` | `SUPABASE_SERVICE_ROLE_KEY` (full project, BYPASSRLS) — `client-portal/lib/supabase/admin.ts` | everything (same project) |
| siblings (aquaoasis-web, milesymedia, zimante) | anon key + own-row reads (per the containment migration) | public content + own profile row |

Tables of concern: `app_datastores`, `app_datastore_history`, `brand_enquiries`,
`audit_events`, `website_consent_events`, `profiles`, `clients`,
`client_portals`, `client_portal_members`. Buckets: `aquacrm-public`,
`aquacrm-site`, `aquacrm-uploads` (+ per-app `*-public`).

## Decision — target least-privilege architecture

1. **Separate database identities per application.** The client portal must not
   hold the portal's full-project service-role key. Options, in preference order:
   a. **Separate Supabase projects** for the client portal's own data, with its
      own credentials and rotation boundary (strongest isolation); or
   b. a **narrowly-scoped server-to-server gateway/RPC** on the portal that the
      client portal calls with an app-specific token — the portal performs the
      few operations the client portal needs (enquiry INSERT) under tenant
      predicates, and the client portal never holds a BYPASSRLS key; or
   c. a **dedicated Postgres role** (not `service_role`) with grants limited to
      exactly `brand_enquiries` INSERT, used by the client portal via PostgREST,
      with RLS predicates — no BYPASSRLS.
2. **Independent secrets & rotation.** Each app's credential rotates on its own
   schedule; compromise of one never requires rotating the other's.
3. **Tenant predicates at the DB/repository boundary**, not only in app code, so
   a stolen credential is still bounded by the database.

## What landed in code now (this branch)

- The client-portal public enquiry route no longer inserts via the browser
  **anon** key (which the containment migration revokes); it uses the
  server-mediated admin path **behind per-IP rate limiting + validation** (Item
  5). This does not increase the blast radius (the client portal already held
  the admin client for enquiry reads) but it makes the sibling's data path
  explicit and rate-limited.
- The portal's `brand_enquiries` access is centralised in one service-role data
  client with app-level tenant-ownership checks (`enquiryDataClient` +
  `loadOwnedEnquiry`), and `smoke-service-role-usage` pins the (documented)
  service-role call-site count so a new one cannot appear silently.

## OWNER ACTIONS (cannot be done from code)

- Provision the separate Supabase project **or** the scoped role/gateway (1a/b/c).
- Remove the full-project `SUPABASE_SERVICE_ROLE_KEY` from the client portal's
  environment once (b) or (c) is in place.
- Establish independent secrets and a rotation schedule per app.

## Adversarial model (documented; the DB-isolation half is OWNER)

Threat: the client-portal deployment credential is stolen. **Today:** full
project compromise. **After this ADR is executed:** the attacker can, at most,
insert `brand_enquiries` rows (rate-limited) or reach the client portal's own
isolated project — never the portal's tenant state, audit log, or other tenants'
data. Application checks alone do **not** create this isolation; the database
boundary does — which is why the infra move is required and is marked OWNER.
