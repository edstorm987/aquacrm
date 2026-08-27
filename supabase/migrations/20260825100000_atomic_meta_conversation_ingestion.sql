-- Atomically append an idempotent provider message and advance its conversation.
--
-- The message row is the delivery fact. Conversation timestamps are derived
-- from retained provider messages under a row lock, so concurrent or delayed
-- webhooks cannot lose unread increments or move thread clocks backwards.

create or replace function public.append_inbox_provider_message(
  p_conversation jsonb,
  p_message jsonb
)
returns table(conversation_row jsonb, message_row jsonb, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_conversation public.inbox_conversations%rowtype;
  current_message public.inbox_messages%rowtype;
  incoming_direction text := p_message ->> 'direction';
  incoming_sent_at timestamptz := nullif(p_message ->> 'sent_at', '')::timestamptz;
  did_insert boolean := false;
  derived_first_inbound timestamptz;
  derived_last_inbound timestamptz;
  derived_first_response timestamptz;
  derived_last_outbound timestamptz;
  derived_last_message timestamptz;
begin
  if nullif(p_conversation ->> 'id', '') is null
    or nullif(p_conversation ->> 'agency_id', '') is null
    or nullif(p_conversation ->> 'connection_id', '') is null
    or nullif(p_conversation ->> 'identity_id', '') is null
    or nullif(p_conversation ->> 'external_conversation_id', '') is null
    or nullif(p_message ->> 'id', '') is null
    or incoming_sent_at is null
    or incoming_direction not in ('inbound', 'outbound') then
    raise exception 'A complete inbound/outbound provider message is required.';
  end if;

  insert into public.inbox_conversations (
    id,
    agency_id,
    connection_id,
    identity_id,
    external_conversation_id,
    status,
    tags,
    unread_count,
    last_message_at,
    source,
    campaign,
    referral_url,
    metadata,
    created_at,
    updated_at
  ) values (
    p_conversation ->> 'id',
    p_conversation ->> 'agency_id',
    p_conversation ->> 'connection_id',
    p_conversation ->> 'identity_id',
    p_conversation ->> 'external_conversation_id',
    'open',
    '{}'::text[],
    0,
    incoming_sent_at,
    nullif(p_conversation ->> 'source', ''),
    nullif(p_conversation ->> 'campaign', ''),
    nullif(p_conversation ->> 'referral_url', ''),
    coalesce(p_conversation -> 'metadata', '{}'::jsonb),
    coalesce(nullif(p_conversation ->> 'created_at', '')::timestamptz, now()),
    now()
  )
  on conflict (connection_id, external_conversation_id) do nothing;

  select conversation.*
  into current_conversation
  from public.inbox_conversations conversation
  where conversation.connection_id = p_conversation ->> 'connection_id'
    and conversation.external_conversation_id = p_conversation ->> 'external_conversation_id'
  for update;

  if not found then
    raise exception 'The provider conversation could not be created or locked.';
  end if;

  insert into public.inbox_messages (
    id,
    agency_id,
    connection_id,
    conversation_id,
    external_message_id,
    direction,
    message_type,
    body_text,
    attachments,
    reply_to_external_message_id,
    status,
    error,
    metadata,
    sent_at,
    created_at,
    updated_at
  ) values (
    p_message ->> 'id',
    current_conversation.agency_id,
    current_conversation.connection_id,
    current_conversation.id,
    nullif(p_message ->> 'external_message_id', ''),
    incoming_direction,
    p_message ->> 'message_type',
    nullif(p_message ->> 'body_text', ''),
    coalesce(p_message -> 'attachments', '[]'::jsonb),
    nullif(p_message ->> 'reply_to_external_message_id', ''),
    p_message ->> 'status',
    nullif(p_message ->> 'error', ''),
    coalesce(p_message -> 'metadata', '{}'::jsonb),
    incoming_sent_at,
    coalesce(nullif(p_message ->> 'created_at', '')::timestamptz, now()),
    now()
  )
  on conflict (connection_id, external_message_id) do nothing
  returning * into current_message;
  did_insert := found;

  if not did_insert then
    if nullif(p_message ->> 'external_message_id', '') is null then
      raise exception 'A provider message without an external id conflicted unexpectedly.';
    end if;
    select message.*
    into current_message
    from public.inbox_messages message
    where message.connection_id = current_conversation.connection_id
      and message.external_message_id = p_message ->> 'external_message_id';
    if not found then
      raise exception 'The conflicting provider message could not be loaded.';
    end if;
    if current_message.conversation_id <> current_conversation.id then
      delete from public.inbox_conversations conversation
      where conversation.id = current_conversation.id
        and not exists (
          select 1 from public.inbox_messages message
          where message.conversation_id = conversation.id
        );
      select conversation.*
      into current_conversation
      from public.inbox_conversations conversation
      where conversation.id = current_message.conversation_id;
      if not found then
        raise exception 'The conflicting provider message references a missing conversation.';
      end if;
    end if;
    return query select to_jsonb(current_conversation), to_jsonb(current_message), false;
    return;
  end if;

  select
    min(message.sent_at) filter (where message.direction = 'inbound'),
    max(message.sent_at) filter (where message.direction = 'inbound'),
    max(message.sent_at) filter (where message.direction = 'outbound'),
    max(message.sent_at)
  into
    derived_first_inbound,
    derived_last_inbound,
    derived_last_outbound,
    derived_last_message
  from public.inbox_messages message
  where message.conversation_id = current_conversation.id
    and message.direction in ('inbound', 'outbound');

  select min(message.sent_at)
  into derived_first_response
  from public.inbox_messages message
  where message.conversation_id = current_conversation.id
    and message.direction = 'outbound'
    and derived_first_inbound is not null
    and message.sent_at >= derived_first_inbound;

  update public.inbox_conversations conversation
  set status = case when incoming_direction = 'inbound' then 'open' else conversation.status end,
      unread_count = conversation.unread_count + case when incoming_direction = 'inbound' then 1 else 0 end,
      first_inbound_at = derived_first_inbound,
      last_inbound_at = derived_last_inbound,
      first_response_at = derived_first_response,
      last_outbound_at = derived_last_outbound,
      last_message_at = coalesce(derived_last_message, incoming_sent_at),
      response_due_at = case when derived_last_inbound is null then null else derived_last_inbound + interval '24 hours' end,
      snoozed_until = case when incoming_direction = 'inbound' then null else conversation.snoozed_until end,
      closed_at = case when incoming_direction = 'inbound' then null else conversation.closed_at end,
      source = case
        when incoming_sent_at >= conversation.last_message_at then coalesce(nullif(p_conversation ->> 'source', ''), conversation.source)
        else conversation.source
      end,
      campaign = case
        when incoming_sent_at >= conversation.last_message_at then coalesce(nullif(p_conversation ->> 'campaign', ''), conversation.campaign)
        else conversation.campaign
      end,
      referral_url = case
        when incoming_sent_at >= conversation.last_message_at then coalesce(nullif(p_conversation ->> 'referral_url', ''), conversation.referral_url)
        else conversation.referral_url
      end,
      metadata = conversation.metadata || coalesce(p_conversation -> 'metadata', '{}'::jsonb),
      updated_at = now()
  where conversation.id = current_conversation.id
  returning * into current_conversation;

  return query select to_jsonb(current_conversation), to_jsonb(current_message), true;
end;
$$;

revoke all on function public.append_inbox_provider_message(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.append_inbox_provider_message(jsonb, jsonb) to service_role;

comment on function public.append_inbox_provider_message(jsonb, jsonb) is
  'Idempotently appends one provider message and advances its conversation atomically with monotonic derived timestamps.';
