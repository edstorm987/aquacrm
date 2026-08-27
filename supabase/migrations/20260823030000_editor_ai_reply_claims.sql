create table if not exists public.editor_ai_reply_claims (
  app_key text not null,
  claim_key text not null,
  holder_id text not null,
  status text not null check (status in ('claimed', 'complete')),
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (app_key, claim_key)
);

alter table public.editor_ai_reply_claims enable row level security;
revoke all on table public.editor_ai_reply_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.editor_ai_reply_claims to service_role;

comment on table public.editor_ai_reply_claims is
  'Durable one-reply claim per Aqua Editor AI user message; prevents duplicate provider calls across server instances.';

create or replace function public.claim_editor_ai_reply(
  p_app_key text,
  p_claim_key text,
  p_holder_id text,
  p_lease_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claim public.editor_ai_reply_claims%rowtype;
  lease_interval interval;
begin
  if coalesce(btrim(p_app_key), '') = '' or coalesce(btrim(p_claim_key), '') = '' or coalesce(btrim(p_holder_id), '') = '' then
    raise exception 'app key, claim key and holder id are required';
  end if;
  lease_interval := make_interval(secs => greatest(1000, least(coalesce(p_lease_ms, 90000), 300000))::double precision / 1000.0);

  delete from public.editor_ai_reply_claims
  where app_key = p_app_key
    and status = 'complete'
    and completed_at < now() - interval '90 days';

  insert into public.editor_ai_reply_claims (
    app_key, claim_key, holder_id, status, lease_expires_at
  ) values (
    p_app_key, p_claim_key, p_holder_id, 'claimed', now() + lease_interval
  ) on conflict (app_key, claim_key) do nothing;

  select * into claim
  from public.editor_ai_reply_claims
  where app_key = p_app_key and claim_key = p_claim_key
  for update;

  if claim.status = 'complete' then
    return jsonb_build_object(
      'state', 'complete',
      'leaseExpiresAt', floor(extract(epoch from claim.lease_expires_at) * 1000)
    );
  end if;

  if claim.holder_id = p_holder_id or claim.lease_expires_at <= now() then
    update public.editor_ai_reply_claims
    set holder_id = p_holder_id,
        status = 'claimed',
        lease_expires_at = now() + lease_interval,
        updated_at = now(),
        completed_at = null
    where app_key = p_app_key and claim_key = p_claim_key
    returning * into claim;
    return jsonb_build_object(
      'state', 'claimed',
      'leaseExpiresAt', floor(extract(epoch from claim.lease_expires_at) * 1000)
    );
  end if;

  return jsonb_build_object(
    'state', 'held',
    'leaseExpiresAt', floor(extract(epoch from claim.lease_expires_at) * 1000)
  );
end;
$$;

create or replace function public.complete_editor_ai_reply(
  p_app_key text,
  p_claim_key text,
  p_holder_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.editor_ai_reply_claims
  set status = 'complete', completed_at = now(), updated_at = now()
  where app_key = p_app_key
    and claim_key = p_claim_key
    and holder_id = p_holder_id
    and status = 'claimed';
  if not found then
    raise exception 'editor ai reply claim is not held';
  end if;
end;
$$;

create or replace function public.release_editor_ai_reply(
  p_app_key text,
  p_claim_key text,
  p_holder_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.editor_ai_reply_claims
  where app_key = p_app_key
    and claim_key = p_claim_key
    and holder_id = p_holder_id
    and status = 'claimed';
end;
$$;

revoke all on function public.claim_editor_ai_reply(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_editor_ai_reply(text, text, text) from public, anon, authenticated;
revoke all on function public.release_editor_ai_reply(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_editor_ai_reply(text, text, text, integer) to service_role;
grant execute on function public.complete_editor_ai_reply(text, text, text) to service_role;
grant execute on function public.release_editor_ai_reply(text, text, text) to service_role;
