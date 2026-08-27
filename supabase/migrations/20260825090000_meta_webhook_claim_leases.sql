-- Crash-recoverable Master Inbox webhook claims.
--
-- The original queue moved rows to `processing` forever. These columns and
-- RPCs make processing a bounded lease: another worker can reclaim after
-- expiry, while a stale worker cannot complete or fail work it no longer owns.

alter table public.inbox_webhook_events
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz;

drop index if exists public.inbox_webhook_queue_idx;
create index inbox_webhook_queue_idx
  on public.inbox_webhook_events (status, available_at, lease_expires_at, created_at)
  where status in ('pending', 'failed', 'processing');

drop function if exists public.claim_inbox_webhook_events(integer);

create or replace function public.claim_inbox_webhook_events(
  p_limit integer default 20,
  p_lease_owner text default null,
  p_lease_ms integer default 90000
)
returns setof public.inbox_webhook_events
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_lease_owner), '') = '' then
    raise exception 'lease owner is required';
  end if;

  update public.inbox_webhook_events event
  set status = 'failed',
      lease_owner = null,
      lease_expires_at = null,
      last_error = coalesce(event.last_error, 'The webhook worker lease expired after the final attempt.'),
      updated_at = now()
  where event.status = 'processing'
    and coalesce(event.lease_expires_at, '-infinity'::timestamptz) <= now()
    and event.attempts >= 8;

  return query
  with selected as (
    select event.id
    from public.inbox_webhook_events event
    where (
        (event.status in ('pending', 'failed') and event.available_at <= now())
        or (
          event.status = 'processing'
          and coalesce(event.lease_expires_at, '-infinity'::timestamptz) <= now()
        )
      )
      and event.attempts < 8
    order by event.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.inbox_webhook_events event
  set status = 'processing',
      attempts = event.attempts + 1,
      lease_owner = left(btrim(p_lease_owner), 160),
      lease_expires_at = now() + make_interval(
        secs => greatest(1000, least(coalesce(p_lease_ms, 90000), 300000))::double precision / 1000.0
      ),
      updated_at = now()
  from selected
  where event.id = selected.id
  returning event.*;
end;
$$;

create or replace function public.complete_inbox_webhook_event(
  p_event_id text,
  p_lease_owner text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.inbox_webhook_events event
  set status = 'processed',
      processed_at = now(),
      last_error = null,
      lease_owner = null,
      lease_expires_at = null,
      updated_at = now()
  where event.id = p_event_id
    and event.status = 'processing'
    and event.lease_owner = p_lease_owner
    and event.lease_expires_at > now();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.fail_inbox_webhook_event(
  p_event_id text,
  p_lease_owner text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.inbox_webhook_events event
  set status = case when event.attempts >= 8 then 'failed' else 'pending' end,
      available_at = now() + make_interval(
        secs => least(3600, power(2, greatest(event.attempts - 1, 0)) * 30)::double precision
      ),
      last_error = left(coalesce(p_error, 'Webhook processing failed.'), 1000),
      lease_owner = null,
      lease_expires_at = null,
      updated_at = now()
  where event.id = p_event_id
    and event.status = 'processing'
    and event.lease_owner = p_lease_owner
    and event.lease_expires_at > now();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_inbox_webhook_events(integer, text, integer) from public, anon, authenticated;
revoke all on function public.complete_inbox_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.fail_inbox_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_inbox_webhook_events(integer, text, integer) to service_role;
grant execute on function public.complete_inbox_webhook_event(text, text) to service_role;
grant execute on function public.fail_inbox_webhook_event(text, text, text) to service_role;

comment on function public.claim_inbox_webhook_events(integer, text, integer) is
  'Atomically claims due or stale Master Inbox webhook rows under a bounded worker lease.';
