create table if not exists public.lead_conversion_operations (
  app_key text not null,
  claim_key text not null,
  request_hash text not null,
  holder_id text not null,
  status text not null check (status in ('claimed', 'complete', 'failed')),
  lease_expires_at timestamptz not null,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (app_key, claim_key)
);

alter table public.lead_conversion_operations enable row level security;
revoke all on table public.lead_conversion_operations from public, anon, authenticated;
grant select, insert, update, delete on table public.lead_conversion_operations to service_role;

comment on table public.lead_conversion_operations is
  'Durable, replayable single-owner operations for lead-to-client conversion.';

create or replace function public.claim_lead_conversion(
  p_app_key text,
  p_claim_key text,
  p_request_hash text,
  p_holder_id text,
  p_lease_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  operation public.lead_conversion_operations%rowtype;
  lease_interval interval;
begin
  if coalesce(btrim(p_app_key), '') = ''
    or coalesce(btrim(p_claim_key), '') = ''
    or coalesce(btrim(p_request_hash), '') = ''
    or coalesce(btrim(p_holder_id), '') = '' then
    raise exception 'app key, claim key, request hash and holder id are required';
  end if;

  lease_interval := make_interval(
    secs => greatest(1000, least(coalesce(p_lease_ms, 300000), 300000))::double precision / 1000.0
  );

  insert into public.lead_conversion_operations (
    app_key, claim_key, request_hash, holder_id, status, lease_expires_at
  ) values (
    p_app_key, p_claim_key, p_request_hash, p_holder_id, 'claimed', now() + lease_interval
  ) on conflict (app_key, claim_key) do nothing;

  select * into operation
  from public.lead_conversion_operations
  where app_key = p_app_key and claim_key = p_claim_key
  for update;

  if operation.request_hash <> p_request_hash then
    return jsonb_build_object(
      'state', 'conflict',
      'leaseExpiresAt', floor(extract(epoch from operation.lease_expires_at) * 1000)
    );
  end if;

  if operation.status = 'complete' then
    return jsonb_build_object(
      'state', 'complete',
      'leaseExpiresAt', floor(extract(epoch from operation.lease_expires_at) * 1000),
      'result', operation.result
    );
  end if;

  if operation.status = 'claimed'
    and operation.holder_id <> p_holder_id
    and operation.lease_expires_at > now() then
    return jsonb_build_object(
      'state', 'held',
      'leaseExpiresAt', floor(extract(epoch from operation.lease_expires_at) * 1000)
    );
  end if;

  update public.lead_conversion_operations
  set holder_id = p_holder_id,
      status = 'claimed',
      lease_expires_at = now() + lease_interval,
      last_error = null,
      updated_at = now(),
      completed_at = null
  where app_key = p_app_key and claim_key = p_claim_key
  returning * into operation;

  return jsonb_build_object(
    'state', 'claimed',
    'leaseExpiresAt', floor(extract(epoch from operation.lease_expires_at) * 1000)
  );
end;
$$;

create or replace function public.complete_lead_conversion(
  p_app_key text,
  p_claim_key text,
  p_request_hash text,
  p_holder_id text,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_conversion_operations
  set status = 'complete',
      result = p_result,
      last_error = null,
      completed_at = now(),
      updated_at = now()
  where app_key = p_app_key
    and claim_key = p_claim_key
    and request_hash = p_request_hash
    and holder_id = p_holder_id
    and status = 'claimed'
    and lease_expires_at > now();
  if not found then
    raise exception 'lead conversion claim is not held';
  end if;
end;
$$;

create or replace function public.fail_lead_conversion(
  p_app_key text,
  p_claim_key text,
  p_request_hash text,
  p_holder_id text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_conversion_operations
  set status = 'failed',
      lease_expires_at = now(),
      last_error = left(coalesce(p_error, 'Lead conversion failed.'), 1000),
      updated_at = now()
  where app_key = p_app_key
    and claim_key = p_claim_key
    and request_hash = p_request_hash
    and holder_id = p_holder_id
    and status = 'claimed'
    and lease_expires_at > now();
end;
$$;

revoke all on function public.claim_lead_conversion(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_lead_conversion(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_lead_conversion(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_lead_conversion(text, text, text, text, integer) to service_role;
grant execute on function public.complete_lead_conversion(text, text, text, text, jsonb) to service_role;
grant execute on function public.fail_lead_conversion(text, text, text, text, text) to service_role;
