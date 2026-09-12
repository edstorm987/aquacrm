-- ABUSE-001: durable, cross-instance single-use ledger for public auth links.
-- Bearer nonces are SHA-256 domain-digested in the application before they
-- reach this table. Only service_role may call the atomic RPCs.

create table if not exists public.aqua_auth_nonces (
  token_hash text primary key,
  kind text not null check (kind in (
    'magic-link',
    'client-portal-invite',
    'email-verify',
    'password-reset',
    'csrf'
  )),
  expires_at bigint not null,
  consumed_at timestamptz not null default now()
);

create index if not exists aqua_auth_nonces_expires_at_idx
  on public.aqua_auth_nonces (expires_at);

alter table public.aqua_auth_nonces enable row level security;
-- Keep the ledger RPC-only, including for the service key. The SECURITY
-- DEFINER functions below own the exact atomic mutations; no caller needs a
-- direct table primitive that could erase or pre-seed another nonce.
revoke all on table public.aqua_auth_nonces from public, anon, authenticated, service_role;

create or replace function public.consume_aqua_auth_nonce(
  p_token_hash text,
  p_kind text,
  p_expires_at bigint
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_kind not in ('magic-link', 'client-portal-invite', 'email-verify', 'password-reset', 'csrf')
     or p_expires_at <= floor(extract(epoch from clock_timestamp()) * 1000)::bigint then
    return false;
  end if;

  insert into public.aqua_auth_nonces (token_hash, kind, expires_at)
  values (p_token_hash, p_kind, p_expires_at)
  on conflict (token_hash) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function public.release_aqua_auth_nonce(
  p_token_hash text,
  p_kind text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.aqua_auth_nonces
  where token_hash = p_token_hash and kind = p_kind;
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

create or replace function public.gc_aqua_auth_nonces(p_now bigint)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.aqua_auth_nonces where expires_at < p_now;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.consume_aqua_auth_nonce(text, text, bigint) from public, anon, authenticated;
revoke all on function public.release_aqua_auth_nonce(text, text) from public, anon, authenticated;
revoke all on function public.gc_aqua_auth_nonces(bigint) from public, anon, authenticated;
grant execute on function public.consume_aqua_auth_nonce(text, text, bigint) to service_role;
grant execute on function public.release_aqua_auth_nonce(text, text) to service_role;
grant execute on function public.gc_aqua_auth_nonces(bigint) to service_role;
