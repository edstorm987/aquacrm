-- LOGIN-CONTEXT-003: make Google OAuth state consumption durable and
-- cross-instance. Browser proof remains in a host-only HttpOnly cookie; only
-- its signed state nonce is domain-digested and recorded here.

alter table public.aqua_auth_nonces
  drop constraint if exists aqua_auth_nonces_kind_check;

alter table public.aqua_auth_nonces
  add constraint aqua_auth_nonces_kind_check check (kind in (
    'magic-link',
    'client-portal-invite',
    'email-verify',
    'password-reset',
    'google-oauth',
    'aqua-embed',
    'csrf'
  ));

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
     or p_kind not in ('magic-link', 'client-portal-invite', 'email-verify', 'password-reset', 'google-oauth', 'aqua-embed', 'csrf')
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

revoke all on function public.consume_aqua_auth_nonce(text, text, bigint) from public, anon, authenticated;
grant execute on function public.consume_aqua_auth_nonce(text, text, bigint) to service_role;
