-- ═══════════════════════════════════════════════════════════════════════════
-- Aqua client-owned form intake — client Supabase deployment bundle (v1).
--
-- This runs in the CLIENT'S OWN Supabase project, never Aqua's. It is the
-- database half of the secure intake path: an exported static site posts to the
-- `aqua-form-submit` Edge Function (this bundle), which validates and inserts
-- here using the project's SERVICE-ROLE client (that credential never leaves the
-- function runtime). The public anon/publishable key has NO access to any of
-- these tables — no SELECT, INSERT, UPDATE or DELETE. The exported bundle
-- therefore carries no table endpoint, no key, and no secret.
--
-- Aqua reads one submission on demand through a bounded, HMAC-authenticated
-- server-to-server read (the `aqua-form-read` Edge Function), never with the
-- anon key and never a service-role key in the export.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists aqua_intake;

-- ── Per-form configuration: the server-side mapping from a PUBLIC form id to its
--    fixed destination, allowlisted fields, and the fail-closed kill switch. The
--    exported site knows only `form_id`; it can never name a table or a column. ──
create table if not exists aqua_intake.form_configs (
  form_id           text primary key,
  site_id           text not null,
  -- Fixed allowlist. Submissions may carry only these keys; anything else is
  -- rejected. Each entry: {"key","type"("text"|"email"|"tel"|"textarea"),"maxLength","required"}.
  allowed_fields    jsonb not null default '[]'::jsonb,
  -- Server-owned, DEFAULT OFF, fail-closed. Not settable from a request/query and
  -- not implied by a connection existing: an operator flips it after acceptance.
  intake_enabled    boolean not null default false,
  -- Defence-in-depth only, never authentication.
  allowed_origins   text[] not null default '{}',
  -- Turnstile secret verified server-side inside the Edge Function (never exported).
  turnstile_secret  text,
  -- Per-form quota (submissions per rolling window) — abuse ceiling.
  window_seconds    integer not null default 3600 check (window_seconds between 1 and 86400),
  max_per_window    integer not null default 200  check (max_per_window between 1 and 100000),
  max_total_bytes   integer not null default 16384 check (max_total_bytes between 1 and 262144),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint form_configs_allowed_fields_is_array check (jsonb_typeof(allowed_fields) = 'array')
);

-- ── Per-site Aqua binding: where to send the signed pointer webhook, and the
--    SEPARATE secrets for (a) the pointer webhook Aqua receives and (b) the
--    bounded server-to-server read Aqua performs. Administrative/rotation control
--    is a third, out-of-band secret and is deliberately NOT stored in any
--    form-facing row. Written only by the deploy/activation step (service role);
--    `active` is fail-closed until the connection is tested and approved. ──
create table if not exists aqua_intake.link (
  site_id            text primary key,
  aqua_connection_id text not null,
  aqua_webhook_url   text not null,
  webhook_secret     text not null,
  read_secret        text not null,
  active             boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint link_distinct_secrets check (webhook_secret <> read_secret)
);

-- ── Submissions. Only the Edge Function (service role) ever writes here. ──
create table if not exists aqua_intake.form_submissions (
  id                uuid primary key default gen_random_uuid(),
  form_id           text not null references aqua_intake.form_configs(form_id) on delete cascade,
  site_id           text not null,
  -- Only allowlisted, size-bounded, PAN-screened fields reach this column.
  fields            jsonb not null,
  -- Client-supplied idempotency key: identical replays collapse to one row.
  idempotency_key   text not null,
  -- Coarse source metadata for rate limiting/audit — no raw PII, no full IP.
  submitter_ip_hash text,
  created_at        timestamptz not null default now(),
  constraint form_submissions_idem_unique unique (form_id, idempotency_key)
);

create index if not exists form_submissions_form_created_idx
  on aqua_intake.form_submissions (form_id, created_at desc);

-- ── Rate-limit / quota ledger (per form + coarse IP-hash bucket). ──
create table if not exists aqua_intake.rate_events (
  form_id     text not null,
  ip_hash     text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists rate_events_form_time_idx
  on aqua_intake.rate_events (form_id, occurred_at desc);

-- ── Nonce replay guard for the bounded HMAC read (single-use, time-boxed). ──
create table if not exists aqua_intake.read_nonces (
  nonce      text primary key,
  used_at    timestamptz not null default now()
);
create index if not exists read_nonces_used_idx on aqua_intake.read_nonces (used_at);

-- ── Lock everything down: the public roles get NOTHING on any intake object. ──
-- Revoke the PostgREST-exposed roles from the whole schema, then enable RLS with
-- no permissive policies. Even if a URL/key leaked, PostgREST would return 401/403.
revoke all on schema aqua_intake from anon, authenticated;
revoke all on all tables in schema aqua_intake from anon, authenticated, public;
revoke all on all functions in schema aqua_intake from anon, authenticated, public;
revoke all on all sequences in schema aqua_intake from anon, authenticated, public;
alter default privileges in schema aqua_intake revoke all on tables from anon, authenticated, public;

alter table aqua_intake.form_configs      enable row level security;
alter table aqua_intake.link              enable row level security;
alter table aqua_intake.form_submissions  enable row level security;
alter table aqua_intake.rate_events       enable row level security;
alter table aqua_intake.read_nonces       enable row level security;
alter table aqua_intake.form_configs      force row level security;
alter table aqua_intake.link              force row level security;
alter table aqua_intake.form_submissions  force row level security;
alter table aqua_intake.rate_events       force row level security;
alter table aqua_intake.read_nonces       force row level security;
-- No CREATE POLICY statements: RLS with zero policies denies every non-owner
-- role, including anon and authenticated. The service_role bypasses RLS and is
-- used ONLY from inside the Edge Functions.

comment on schema aqua_intake is
  'Aqua client-owned form intake (v1). Anon/authenticated have no access; only the aqua-form-submit / aqua-form-read Edge Functions (service role) touch these tables.';
