-- Aqua portal — Postgres schema for the storage backend (R7).
--
-- Single-table key/value store. The foundation writes the entire
-- `PortalState` JSON into one row keyed `__portal_state__`. Plugins
-- (or future foundation rounds) can write per-namespace rows under
-- keys like `t/<agencyId>/<clientId>/<plugin>/...` without changing
-- the table.
--
-- Apply once per database:
--   createdb aqua_portal
--   psql aqua_portal -f scripts/schema.sql

CREATE TABLE IF NOT EXISTS portal_kv (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prefix lookups: `keys('t/agency/<id>/...')` style queries use
-- `text_pattern_ops` so a btree index can satisfy the LIKE prefix
-- predicate. Without this op-class the planner falls back to a seq
-- scan on locales whose default collation isn't C.
CREATE INDEX IF NOT EXISTS portal_kv_key_prefix
  ON portal_kv USING btree (key text_pattern_ops);

-- Optional: invalidate cached rows aggressively on updates if a
-- caller wants to subscribe to changes. Out of scope for R7.

-- Per-tenant scoping defense (architecture §6) is enforced at the
-- foundation layer (`withTenantScope` helpers in `tenants.ts`).
-- Postgres-side row-level security is deferred to R8 — see
-- `04-foundation-round7-postgres.md` §"RLS deferral".
