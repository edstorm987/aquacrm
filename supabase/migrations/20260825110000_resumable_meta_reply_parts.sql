-- One logical outbound reply can require several Meta provider calls (text plus
-- attachments). Claim and settle each embedded delivery part under a row lock so
-- retries skip confirmed sends and concurrent workers cannot send the same part.

drop function if exists public.claim_inbox_reply_part(text, text, text, text, integer);

create or replace function public.claim_inbox_reply_part(
  p_agency_id text,
  p_message_id text,
  p_part_id text,
  p_lease_owner text,
  p_lease_ms integer default 90000
)
returns public.inbox_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  current_message public.inbox_messages%rowtype;
  current_part jsonb;
  updated_part jsonb;
  next_parts jsonb;
  next_metadata jsonb;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  lease_ms integer := least(300000, greatest(1000, coalesce(p_lease_ms, 90000)));
  all_sent boolean;
  any_blocking boolean;
  first_error text;
begin
  if nullif(p_lease_owner, '') is null then
    raise exception 'A reply-part lease owner is required.';
  end if;

  select message.*
  into current_message
  from public.inbox_messages message
  where message.agency_id = p_agency_id
    and message.id = p_message_id
  for update;
  if not found then
    raise exception 'The reply operation was not found.';
  end if;

  select part.value
  into current_part
  from jsonb_array_elements(coalesce(current_message.metadata -> 'metaReplyOperation' -> 'parts', '[]'::jsonb)) part(value)
  where part.value ->> 'id' = p_part_id;
  if current_part is null then
    raise exception 'The reply delivery part was not found.';
  end if;

  if current_part ->> 'status' = 'sending'
    and coalesce((current_part ->> 'leaseExpiresAt')::bigint, 0) <= now_ms then
    updated_part := (current_part - 'leaseOwner' - 'leaseExpiresAt') || jsonb_build_object(
      'status', 'uncertain',
      'error', 'Delivery result is unknown because the sending worker stopped before recording Meta''s response.',
      'updatedAt', now_ms
    );
  elsif current_part ->> 'status' in ('pending', 'failed') then
    updated_part := (current_part - 'providerMessageId' - 'error') || jsonb_build_object(
      'status', 'sending',
      'attempts', coalesce((current_part ->> 'attempts')::integer, 0) + 1,
      'leaseOwner', p_lease_owner,
      'leaseExpiresAt', now_ms + lease_ms,
      'updatedAt', now_ms
    );
  end if;

  if updated_part is not null then
    select jsonb_agg(
      case when part.value ->> 'id' = p_part_id then updated_part else part.value end
      order by part.ordinality
    )
    into next_parts
    from jsonb_array_elements(current_message.metadata -> 'metaReplyOperation' -> 'parts')
      with ordinality part(value, ordinality);

    select
      bool_and(part.value ->> 'status' = 'sent'),
      bool_or(part.value ->> 'status' in ('failed', 'uncertain')),
      min(nullif(part.value ->> 'error', '')) filter (where part.value ->> 'status' in ('failed', 'uncertain'))
    into all_sent, any_blocking, first_error
    from jsonb_array_elements(next_parts) part(value);

    next_metadata := jsonb_set(current_message.metadata, '{metaReplyOperation,parts}', next_parts, false);
    update public.inbox_messages message
    set metadata = next_metadata,
        status = case when all_sent then 'sent' when any_blocking then 'failed' else 'pending' end,
        error = first_error,
        updated_at = clock_timestamp()
    where message.id = current_message.id
    returning message.* into current_message;
  end if;

  return current_message;
end;
$$;

drop function if exists public.settle_inbox_reply_part(text, text, text, text, text, text);

create or replace function public.settle_inbox_reply_part(
  p_agency_id text,
  p_message_id text,
  p_part_id text,
  p_lease_owner text,
  p_provider_message_id text default null,
  p_error text default null
)
returns public.inbox_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  current_message public.inbox_messages%rowtype;
  target_conversation_id text;
  current_part jsonb;
  updated_part jsonb;
  next_parts jsonb;
  next_operation jsonb;
  next_metadata jsonb;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  all_sent boolean;
  any_blocking boolean;
  first_error text;
begin
  if (nullif(p_provider_message_id, '') is null) = (nullif(p_error, '') is null) then
    raise exception 'Exactly one reply-part outcome is required.';
  end if;

  select message.conversation_id
  into target_conversation_id
  from public.inbox_messages message
  where message.agency_id = p_agency_id
    and message.id = p_message_id;
  if not found then
    raise exception 'The reply operation was not found.';
  end if;

  -- Match append_inbox_provider_message's conversation -> message lock order.
  perform 1
  from public.inbox_conversations conversation
  where conversation.agency_id = p_agency_id
    and conversation.id = target_conversation_id
  for update;
  if not found then
    raise exception 'The reply conversation was not found.';
  end if;

  select message.*
  into current_message
  from public.inbox_messages message
  where message.agency_id = p_agency_id
    and message.id = p_message_id
  for update;
  if not found then
    raise exception 'The reply operation was not found.';
  end if;

  select part.value
  into current_part
  from jsonb_array_elements(coalesce(current_message.metadata -> 'metaReplyOperation' -> 'parts', '[]'::jsonb)) part(value)
  where part.value ->> 'id' = p_part_id;
  if current_part is null then
    raise exception 'The reply delivery part was not found.';
  end if;
  if current_part ->> 'status' <> 'sending' or current_part ->> 'leaseOwner' <> p_lease_owner then
    raise exception 'The reply delivery lease is no longer owned by this worker.';
  end if;

  updated_part := current_part - 'providerMessageId' - 'error' - 'leaseOwner' - 'leaseExpiresAt';
  if nullif(p_provider_message_id, '') is not null then
    updated_part := updated_part || jsonb_build_object(
      'status', 'sent',
      'providerMessageId', p_provider_message_id,
      'updatedAt', now_ms
    );
  else
    updated_part := updated_part || jsonb_build_object(
      'status', 'failed',
      'error', p_error,
      'updatedAt', now_ms
    );
  end if;

  select jsonb_agg(
    case when part.value ->> 'id' = p_part_id then updated_part else part.value end
    order by part.ordinality
  )
  into next_parts
  from jsonb_array_elements(current_message.metadata -> 'metaReplyOperation' -> 'parts')
    with ordinality part(value, ordinality);

  select
    bool_and(part.value ->> 'status' = 'sent'),
    bool_or(part.value ->> 'status' in ('failed', 'uncertain')),
    min(nullif(part.value ->> 'error', '')) filter (where part.value ->> 'status' in ('failed', 'uncertain'))
  into all_sent, any_blocking, first_error
  from jsonb_array_elements(next_parts) part(value);

  next_operation := jsonb_set(current_message.metadata -> 'metaReplyOperation', '{parts}', next_parts, false);
  if all_sent and next_operation -> 'completedAt' is null then
    next_operation := next_operation || jsonb_build_object('completedAt', now_ms);
  end if;
  next_metadata := jsonb_set(current_message.metadata, '{metaReplyOperation}', next_operation, false);

  -- A very fast Meta echo can arrive between provider acceptance and this
  -- settlement. The logical operation owns that provider id, so remove any
  -- provisional echo row before assigning/embedding the id on the parent.
  if nullif(p_provider_message_id, '') is not null then
    delete from public.inbox_messages message
    where message.connection_id = current_message.connection_id
      and message.external_message_id = p_provider_message_id
      and message.id <> current_message.id;
  end if;

  update public.inbox_messages message
  set external_message_id = coalesce(message.external_message_id, nullif(p_provider_message_id, '')),
      metadata = next_metadata,
      status = case when all_sent then 'sent' when any_blocking then 'failed' else 'pending' end,
      error = first_error,
      updated_at = clock_timestamp()
  where message.id = current_message.id
  returning message.* into current_message;

  if all_sent then
    update public.inbox_conversations conversation
    set first_response_at = coalesce(conversation.first_response_at, current_message.sent_at),
        last_outbound_at = greatest(coalesce(conversation.last_outbound_at, current_message.sent_at), current_message.sent_at),
        last_message_at = greatest(conversation.last_message_at, current_message.sent_at),
        unread_count = 0,
        status = 'open',
        snoozed_until = null,
        closed_at = null,
        updated_at = clock_timestamp()
    where conversation.agency_id = p_agency_id
      and conversation.id = current_message.conversation_id;
  end if;

  return current_message;
end;
$$;

revoke all on function public.claim_inbox_reply_part(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.settle_inbox_reply_part(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_inbox_reply_part(text, text, text, text, integer) to service_role;
grant execute on function public.settle_inbox_reply_part(text, text, text, text, text, text) to service_role;
