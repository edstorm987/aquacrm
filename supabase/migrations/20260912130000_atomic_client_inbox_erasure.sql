-- Erase one client's inbox data from the schema-real ownership root.
--
-- Client ownership exists only on inbox_contact_identities. Conversations and
-- messages are reached through their foreign-key chain and are removed by the
-- existing ON DELETE CASCADE constraints. The table locks close predicate and
-- late-child races while the row locks make the exact reviewed set explicit.

create or replace function public.erase_client_inbox_data(
  p_agency_id text,
  p_client_id text
)
returns table(
  deleted_identity_count integer,
  deleted_conversation_count integer,
  deleted_message_count integer,
  conversation_from timestamptz,
  conversation_to timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_identity_ids text[] := array[]::text[];
  v_conversation_ids text[] := array[]::text[];
  v_identity_count integer := 0;
  v_conversation_count integer := 0;
  v_message_count integer := 0;
  v_conversation_from timestamptz;
  v_conversation_to timestamptz;
  v_deleted_identity_count integer := 0;
begin
  if nullif(btrim(p_agency_id), '') is null
    or nullif(btrim(p_client_id), '') is null then
    raise exception 'A valid inbox erasure scope is required.';
  end if;

  -- All inbox writers require ROW EXCLUSIVE locks. Holding SHARE ROW EXCLUSIVE
  -- on the complete FK chain prevents reassignment, phantom identities, and
  -- late children until this RPC commits or rolls back.
  lock table
    public.inbox_channel_connections,
    public.inbox_contact_identities,
    public.inbox_conversations,
    public.inbox_messages
  in share row exclusive mode;

  perform identity_row.id
  from public.inbox_contact_identities identity_row
  where identity_row.agency_id = p_agency_id
    and identity_row.client_id = p_client_id
  order by identity_row.id
  for update;

  select
    coalesce(array_agg(identity_row.id order by identity_row.id), array[]::text[]),
    count(*)::integer
  into v_identity_ids, v_identity_count
  from public.inbox_contact_identities identity_row
  where identity_row.agency_id = p_agency_id
    and identity_row.client_id = p_client_id;

  if exists (
    select 1
    from public.inbox_contact_identities identity_row
    left join public.inbox_channel_connections connection_row
      on connection_row.id = identity_row.connection_id
    where identity_row.id = any(v_identity_ids)
      and (
        identity_row.agency_id is distinct from p_agency_id
        or identity_row.client_id is distinct from p_client_id
        or connection_row.id is null
        or connection_row.agency_id is distinct from p_agency_id
      )
  ) then
    raise exception 'Inbox identity ownership is inconsistent.';
  end if;

  perform connection_row.id
  from public.inbox_channel_connections connection_row
  where exists (
    select 1
    from public.inbox_contact_identities identity_row
    where identity_row.id = any(v_identity_ids)
      and identity_row.connection_id = connection_row.id
  )
  order by connection_row.id
  for update;

  perform conversation_row.id
  from public.inbox_conversations conversation_row
  where conversation_row.identity_id = any(v_identity_ids)
  order by conversation_row.id
  for update;

  if exists (
    select 1
    from public.inbox_conversations conversation_row
    left join public.inbox_contact_identities identity_row
      on identity_row.id = conversation_row.identity_id
    where conversation_row.identity_id = any(v_identity_ids)
      and (
        identity_row.id is null
        or identity_row.agency_id is distinct from p_agency_id
        or identity_row.client_id is distinct from p_client_id
        or conversation_row.agency_id is distinct from p_agency_id
        or conversation_row.connection_id is distinct from identity_row.connection_id
      )
  ) then
    raise exception 'Inbox conversation ownership is inconsistent.';
  end if;

  select
    coalesce(array_agg(conversation_row.id order by conversation_row.id), array[]::text[]),
    count(*)::integer,
    min(conversation_row.created_at),
    max(coalesce(conversation_row.last_message_at, conversation_row.created_at))
  into
    v_conversation_ids,
    v_conversation_count,
    v_conversation_from,
    v_conversation_to
  from public.inbox_conversations conversation_row
  where conversation_row.identity_id = any(v_identity_ids);

  perform message_row.id
  from public.inbox_messages message_row
  where message_row.conversation_id = any(v_conversation_ids)
  order by message_row.id
  for update;

  if exists (
    select 1
    from public.inbox_messages message_row
    left join public.inbox_conversations conversation_row
      on conversation_row.id = message_row.conversation_id
    where message_row.conversation_id = any(v_conversation_ids)
      and (
        conversation_row.id is null
        or conversation_row.agency_id is distinct from p_agency_id
        or message_row.agency_id is distinct from p_agency_id
        or message_row.connection_id is distinct from conversation_row.connection_id
      )
  ) then
    raise exception 'Inbox message ownership is inconsistent.';
  end if;

  select count(*)::integer
  into v_message_count
  from public.inbox_messages message_row
  where message_row.conversation_id = any(v_conversation_ids);

  -- Delete only the locked, still-exact ownership roots. PostgreSQL performs
  -- both child deletions synchronously under the same transaction.
  delete from public.inbox_contact_identities identity_row
  where identity_row.agency_id = p_agency_id
    and identity_row.client_id = p_client_id
    and identity_row.id = any(v_identity_ids);
  get diagnostics v_deleted_identity_count = row_count;

  if v_deleted_identity_count <> v_identity_count
    or exists (
      select 1
      from public.inbox_conversations conversation_row
      where conversation_row.identity_id = any(v_identity_ids)
    )
    or exists (
      select 1
      from public.inbox_messages message_row
      where message_row.conversation_id = any(v_conversation_ids)
    ) then
    raise exception 'Inbox erasure did not remove the exact locked set.';
  end if;

  return query select
    v_identity_count,
    v_conversation_count,
    v_message_count,
    v_conversation_from,
    v_conversation_to;
end;
$$;

revoke all on function public.erase_client_inbox_data(text, text) from public, anon, authenticated;
grant execute on function public.erase_client_inbox_data(text, text) to service_role;

comment on function public.erase_client_inbox_data(text, text) is
  'Atomically validates and erases one client-owned inbox identity chain; service-role only.';
