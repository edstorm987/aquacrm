create table if not exists public.inbox_channel_connections (
  id text primary key,
  agency_id text not null,
  company_id text,
  marketing_asset_id text,
  provider text not null check (provider in ('meta')),
  channel text not null check (channel in ('instagram', 'facebook')),
  auth_mode text not null check (auth_mode in ('instagram-login', 'facebook-login')),
  external_account_id text not null,
  external_page_id text,
  username text,
  display_name text not null,
  avatar_url text,
  scopes text[] not null default '{}',
  status text not null default 'connecting' check (status in ('awaiting-credentials', 'connecting', 'connected', 'needs-attention', 'disconnected')),
  webhook_status text not null default 'pending' check (webhook_status in ('pending', 'subscribed', 'failed')),
  encrypted_access_token text not null,
  token_expires_at timestamptz,
  last_webhook_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, provider, channel, external_account_id)
);

create table if not exists public.inbox_contact_identities (
  id text primary key,
  agency_id text not null,
  connection_id text not null references public.inbox_channel_connections(id) on delete cascade,
  external_user_id text not null,
  username text,
  display_name text not null,
  avatar_url text,
  lead_id text,
  contact_id text,
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_user_id)
);

create table if not exists public.inbox_conversations (
  id text primary key,
  agency_id text not null,
  connection_id text not null references public.inbox_channel_connections(id) on delete cascade,
  identity_id text not null references public.inbox_contact_identities(id) on delete cascade,
  external_conversation_id text not null,
  status text not null default 'open' check (status in ('open', 'snoozed', 'closed')),
  assigned_to text,
  tags text[] not null default '{}',
  unread_count integer not null default 0 check (unread_count >= 0),
  first_inbound_at timestamptz,
  last_inbound_at timestamptz,
  first_response_at timestamptz,
  last_outbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  response_due_at timestamptz,
  snoozed_until timestamptz,
  closed_at timestamptz,
  source text,
  campaign text,
  referral_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_conversation_id)
);

create table if not exists public.inbox_messages (
  id text primary key,
  agency_id text not null,
  connection_id text not null references public.inbox_channel_connections(id) on delete cascade,
  conversation_id text not null references public.inbox_conversations(id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  message_type text not null check (message_type in ('text', 'image', 'video', 'audio', 'file', 'share', 'story', 'reaction', 'system', 'note')),
  body_text text,
  attachments jsonb not null default '[]'::jsonb,
  reply_to_external_message_id text,
  status text not null check (status in ('received', 'pending', 'sent', 'delivered', 'read', 'failed', 'deleted')),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_message_id)
);

create table if not exists public.inbox_webhook_events (
  id text primary key,
  provider text not null check (provider in ('meta')),
  event_key text not null,
  object_type text,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, event_key)
);

create index if not exists inbox_connections_agency_status_idx
  on public.inbox_channel_connections (agency_id, status, updated_at desc);
create index if not exists inbox_identities_agency_links_idx
  on public.inbox_contact_identities (agency_id, lead_id, contact_id, client_id);
create index if not exists inbox_conversations_queue_idx
  on public.inbox_conversations (agency_id, status, last_message_at desc);
create index if not exists inbox_conversations_response_due_idx
  on public.inbox_conversations (agency_id, response_due_at)
  where status <> 'closed';
create index if not exists inbox_messages_thread_idx
  on public.inbox_messages (conversation_id, sent_at);
create index if not exists inbox_webhook_queue_idx
  on public.inbox_webhook_events (status, available_at, lease_expires_at, created_at)
  where status in ('pending', 'failed', 'processing');

alter table public.inbox_channel_connections enable row level security;
alter table public.inbox_contact_identities enable row level security;
alter table public.inbox_conversations enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.inbox_webhook_events enable row level security;

revoke all on public.inbox_channel_connections from public, anon, authenticated;
revoke all on public.inbox_contact_identities from public, anon, authenticated;
revoke all on public.inbox_conversations from public, anon, authenticated;
revoke all on public.inbox_messages from public, anon, authenticated;
revoke all on public.inbox_webhook_events from public, anon, authenticated;

grant all on public.inbox_channel_connections to service_role;
grant all on public.inbox_contact_identities to service_role;
grant all on public.inbox_conversations to service_role;
grant all on public.inbox_messages to service_role;
grant all on public.inbox_webhook_events to service_role;

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

revoke all on function public.claim_inbox_webhook_events(integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_inbox_webhook_events(integer, text, integer) to service_role;

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

revoke all on function public.complete_inbox_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.fail_inbox_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function public.complete_inbox_webhook_event(text, text) to service_role;
grant execute on function public.fail_inbox_webhook_event(text, text, text) to service_role;

comment on table public.inbox_channel_connections is
  'Encrypted Meta account connections for AquaCRM Master Inbox. Browser clients never access this table directly.';
comment on table public.inbox_webhook_events is
  'Idempotent webhook inbox and retry queue. Raw provider payloads are private service-role data.';
