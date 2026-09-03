-- Aqua Tag form ingestion: one database identity per browser submission and a
-- crash-recoverable delivery record for its downstream work. → issues #87
--
-- Before this migration a submission's identity lived only in
-- brand_enquiries.metadata->>'submissionId' with no uniqueness, the tag/host
-- race was serialised by a process-local queue, and the downstream effects ran
-- inline with no durable record of which had happened. A crash after an effect
-- and before the completion write replayed everything, and two server
-- instances could each create a row for one submission.
--
-- This table makes (tenant_scope, submission_id) the one non-null identity,
-- merges tag-first and brand-first arrival inside one transaction with the
-- canonical brand_enquiries row, refuses contradictory reuse of an id, and
-- carries the downstream work as an owner/token-fenced, leased, bounded-retry
-- item with a terminal dead-letter state.
--
-- The portal keeps working without it: `src/lib/supabase/enquirySubmissionClaims.ts`
-- recognises the missing function/table and the public routes fall back to the
-- older process-local path, reporting `boundary: "process-local"` so nobody
-- mistakes that weaker guarantee for this one. Apply with `supabase db push`;
-- re-run rls-verify.sql afterwards.

create table if not exists public.aqua_tag_submissions (
  tenant_scope text not null check (length(btrim(tenant_scope)) > 0),
  submission_id text not null check (submission_id ~ '^aqua_sub_[A-Za-z0-9_-]{12,100}$'),
  site_key text not null check (length(btrim(site_key)) > 0),
  enquiry_id uuid references public.brand_enquiries(id) on delete cascade,
  -- Facts that may be recorded once and never contradicted: the tag's capture
  -- fingerprint and page, the brand form's slug and contact key. A second
  -- arrival with an equal fact is a replay; a different fact is a conflict.
  facts jsonb not null default '{}'::jsonb,
  capture jsonb,
  brand jsonb,
  state text not null default 'capture-only'
    check (state in ('capture-only', 'ingesting', 'complete', 'dead-letter')),
  work_status text not null default 'idle'
    check (work_status in ('idle', 'pending', 'processing', 'complete', 'dead')),
  claim_owner text,
  claim_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 6 check (max_attempts between 1 and 50),
  available_at timestamptz not null default now(),
  last_error text,
  -- Per-effect checkpoints: {"lead": {"status": "done", ...}, ...}. Replay
  -- skips a done effect and never repeats a non-idempotent one that was
  -- attempted but not acknowledged.
  effects jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_scope, submission_id)
);

create index if not exists aqua_tag_submissions_work_idx
  on public.aqua_tag_submissions (available_at, created_at)
  where work_status in ('pending', 'processing');

create index if not exists aqua_tag_submissions_enquiry_idx
  on public.aqua_tag_submissions (enquiry_id);

alter table public.aqua_tag_submissions enable row level security;
revoke all on table public.aqua_tag_submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.aqua_tag_submissions to service_role;

comment on table public.aqua_tag_submissions is
  'One row per Aqua Tag browser submission: the (tenant, submission id) identity, merged tag/brand facts and the fenced, leased delivery record for its downstream work.';

-- Merge immutable facts. An absent or JSON-null fact may be set; an equal fact
-- is a no-op; a different fact aborts the whole transaction with SQLSTATE
-- AQ409 so the caller can answer 409 and nothing half-lands.
create or replace function public.aqua_tag_merge_facts(p_existing jsonb, p_incoming jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  merged jsonb := coalesce(p_existing, '{}'::jsonb);
  entry record;
begin
  if p_incoming is null or jsonb_typeof(p_incoming) <> 'object' then
    return merged;
  end if;
  for entry in select key, value from jsonb_each(p_incoming) loop
    if entry.value is null or jsonb_typeof(entry.value) = 'null' then
      continue;
    end if;
    if merged ? entry.key
       and jsonb_typeof(merged -> entry.key) <> 'null'
       and (merged -> entry.key) <> entry.value then
      raise exception using
        errcode = 'AQ409',
        message = format('aqua_tag_submission_conflict:%s', entry.key),
        detail = format('The submission reference was already used with a different %s.', entry.key);
    end if;
    merged := jsonb_set(merged, array[entry.key], entry.value, true);
  end loop;
  return merged;
end;
$$;

-- One transaction: claim or reuse the identity, merge facts, create or promote
-- the canonical brand_enquiries row, and enqueue the downstream work.
--
--   p_arrival = 'tag'   the Aqua Tag's capture (every answer given). Creates a
--                       consent:false hold row when the site's own POST has
--                       not arrived, otherwise attaches to the existing row.
--   p_arrival = 'brand' the site's own consented submission. Creates the row
--                       or promotes the hold row in place, then marks the
--                       downstream work pending. A second brand arrival with
--                       equal facts is a replay and changes nothing.
create or replace function public.ingest_aqua_tag_submission(
  p_tenant_scope text,
  p_submission_id text,
  p_site_key text,
  p_arrival text,
  p_facts jsonb,
  p_capture jsonb,
  p_brand jsonb,
  p_enquiry_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.aqua_tag_submissions%rowtype;
  incoming_metadata jsonb := coalesce(p_enquiry_row -> 'metadata', '{}'::jsonb);
  created boolean := false;
  promoted boolean := false;
  attached boolean := false;
  replay boolean := false;
  new_enquiry_id uuid;
begin
  if coalesce(btrim(p_tenant_scope), '') = '' then
    raise exception 'tenant scope is required';
  end if;
  if p_submission_id is null or p_submission_id !~ '^aqua_sub_[A-Za-z0-9_-]{12,100}$' then
    raise exception 'submission id is invalid';
  end if;
  if coalesce(btrim(p_site_key), '') = '' then
    raise exception 'site key is required';
  end if;
  if p_arrival is null or p_arrival not in ('tag', 'brand') then
    raise exception 'arrival must be tag or brand';
  end if;
  if jsonb_typeof(p_enquiry_row) is distinct from 'object' then
    raise exception 'enquiry row must be an object';
  end if;

  insert into public.aqua_tag_submissions (tenant_scope, submission_id, site_key)
  values (p_tenant_scope, p_submission_id, p_site_key)
  on conflict (tenant_scope, submission_id) do nothing;

  select * into submission
  from public.aqua_tag_submissions
  where tenant_scope = p_tenant_scope and submission_id = p_submission_id
  for update;

  -- Contradiction is decided before anything else changes; a raise here rolls
  -- back the identity row this transaction may have just created.
  submission.facts := public.aqua_tag_merge_facts(submission.facts, p_facts);

  if p_arrival = 'tag' then
    if jsonb_typeof(p_capture) is distinct from 'object' then
      raise exception 'capture must be an object';
    end if;
    if submission.capture is null then
      submission.capture := p_capture;
    end if;
    if submission.enquiry_id is null then
      insert into public.brand_enquiries (
        brand_slug, name, email, phone, contact_method, services, message,
        source_url, campaign, consent, agency_id, metadata
      ) values (
        p_enquiry_row ->> 'brand_slug',
        coalesce(nullif(p_enquiry_row ->> 'name', ''), 'Unknown'),
        p_enquiry_row ->> 'email',
        p_enquiry_row ->> 'phone',
        p_enquiry_row ->> 'contact_method',
        array(select jsonb_array_elements_text(coalesce(p_enquiry_row -> 'services', '[]'::jsonb))),
        p_enquiry_row ->> 'message',
        p_enquiry_row ->> 'source_url',
        p_enquiry_row ->> 'campaign',
        coalesce((p_enquiry_row ->> 'consent')::boolean, false),
        nullif(p_enquiry_row ->> 'agency_id', ''),
        incoming_metadata
          || jsonb_build_object('submissionId', p_submission_id, 'formCapture', submission.capture)
      )
      returning id into new_enquiry_id;
      submission.enquiry_id := new_enquiry_id;
      created := true;
    else
      update public.brand_enquiries e
      set metadata = e.metadata
        || jsonb_build_object('submissionId', p_submission_id, 'formCapture', submission.capture)
      where e.id = submission.enquiry_id;
      attached := true;
    end if;
  else
    if jsonb_typeof(p_brand) is distinct from 'object' then
      raise exception 'brand payload must be an object';
    end if;
    if submission.brand is not null then
      replay := true;
    else
      submission.brand := p_brand;
      if submission.enquiry_id is null then
        insert into public.brand_enquiries (
          brand_slug, name, email, phone, contact_method, services, message,
          source_url, campaign, consent, agency_id, metadata
        ) values (
          p_enquiry_row ->> 'brand_slug',
          coalesce(nullif(p_enquiry_row ->> 'name', ''), 'Unknown'),
          p_enquiry_row ->> 'email',
          p_enquiry_row ->> 'phone',
          p_enquiry_row ->> 'contact_method',
          array(select jsonb_array_elements_text(coalesce(p_enquiry_row -> 'services', '[]'::jsonb))),
          p_enquiry_row ->> 'message',
          p_enquiry_row ->> 'source_url',
          p_enquiry_row ->> 'campaign',
          coalesce((p_enquiry_row ->> 'consent')::boolean, false),
          nullif(p_enquiry_row ->> 'agency_id', ''),
          (incoming_metadata || jsonb_build_object('submissionId', p_submission_id)) - 'captureOnly'
        )
        returning id into new_enquiry_id;
        submission.enquiry_id := new_enquiry_id;
        created := true;
      else
        -- Promote the hold row in place. The brand form's fields win; the
        -- tag's richer formCapture already on the row survives the merge.
        update public.brand_enquiries e
        set brand_slug = coalesce(nullif(p_enquiry_row ->> 'brand_slug', ''), e.brand_slug),
            name = coalesce(nullif(p_enquiry_row ->> 'name', ''), e.name),
            email = coalesce(p_enquiry_row ->> 'email', e.email),
            phone = coalesce(p_enquiry_row ->> 'phone', e.phone),
            contact_method = coalesce(p_enquiry_row ->> 'contact_method', e.contact_method),
            services = case
              when p_enquiry_row ? 'services'
                then array(select jsonb_array_elements_text(coalesce(p_enquiry_row -> 'services', '[]'::jsonb)))
              else e.services
            end,
            message = coalesce(p_enquiry_row ->> 'message', e.message),
            source_url = coalesce(p_enquiry_row ->> 'source_url', e.source_url),
            campaign = coalesce(p_enquiry_row ->> 'campaign', e.campaign),
            consent = coalesce((p_enquiry_row ->> 'consent')::boolean, e.consent),
            agency_id = coalesce(nullif(p_enquiry_row ->> 'agency_id', ''), e.agency_id),
            metadata = ((e.metadata || incoming_metadata)
              || jsonb_build_object('submissionId', p_submission_id)) - 'captureOnly'
        where e.id = submission.enquiry_id;
        promoted := true;
      end if;
      submission.state := 'ingesting';
      submission.work_status := 'pending';
      submission.available_at := now();
      submission.attempts := 0;
      submission.last_error := null;
    end if;
  end if;

  update public.aqua_tag_submissions s
  set facts = submission.facts,
      capture = submission.capture,
      brand = submission.brand,
      enquiry_id = submission.enquiry_id,
      state = submission.state,
      work_status = submission.work_status,
      available_at = submission.available_at,
      attempts = submission.attempts,
      last_error = submission.last_error,
      updated_at = now()
  where s.tenant_scope = p_tenant_scope and s.submission_id = p_submission_id
  returning * into submission;

  return jsonb_build_object(
    'enquiryId', submission.enquiry_id,
    'state', submission.state,
    'workStatus', submission.work_status,
    'created', created,
    'promoted', promoted,
    'attached', attached,
    'replay', replay,
    'attempts', submission.attempts,
    'effects', submission.effects
  );
end;
$$;

-- Lease due work to one owner. A processing row whose lease has expired is
-- claimable again (the previous owner crashed or stalled); one that has spent
-- every attempt is dead-lettered instead. The returned claim_token fences every
-- later checkpoint and settle, so a stale owner cannot overwrite a live one.
create or replace function public.claim_aqua_tag_submission_work(
  p_owner text,
  p_lease_ms integer default 90000,
  p_tenant_scope text default null,
  p_submission_id text default null,
  p_limit integer default 1
)
returns setof public.aqua_tag_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  lease interval;
begin
  if coalesce(btrim(p_owner), '') = '' then
    raise exception 'claim owner is required';
  end if;
  lease := make_interval(
    secs => greatest(1000, least(coalesce(p_lease_ms, 90000), 300000))::double precision / 1000.0
  );

  update public.aqua_tag_submissions s
  set work_status = 'dead',
      state = 'dead-letter',
      dead_lettered_at = now(),
      claim_owner = null,
      claim_token = null,
      lease_expires_at = null,
      last_error = coalesce(s.last_error, 'The delivery lease expired after the final attempt.'),
      updated_at = now()
  where s.work_status = 'processing'
    and coalesce(s.lease_expires_at, '-infinity'::timestamptz) <= now()
    and s.attempts >= s.max_attempts
    and (p_tenant_scope is null or s.tenant_scope = p_tenant_scope)
    and (p_submission_id is null or s.submission_id = p_submission_id);

  return query
  with selected as (
    select s.tenant_scope, s.submission_id
    from public.aqua_tag_submissions s
    where (
        (s.work_status = 'pending' and s.available_at <= now())
        or (
          s.work_status = 'processing'
          and coalesce(s.lease_expires_at, '-infinity'::timestamptz) <= now()
        )
      )
      and s.attempts < s.max_attempts
      and (p_tenant_scope is null or s.tenant_scope = p_tenant_scope)
      and (p_submission_id is null or s.submission_id = p_submission_id)
    order by s.available_at, s.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 50))
  )
  update public.aqua_tag_submissions s
  set work_status = 'processing',
      attempts = s.attempts + 1,
      claim_owner = left(btrim(p_owner), 160),
      claim_token = gen_random_uuid(),
      lease_expires_at = now() + lease,
      updated_at = now()
  from selected
  where s.tenant_scope = selected.tenant_scope
    and s.submission_id = selected.submission_id
  returning s.*;
end;
$$;

-- Record that one named effect happened (or was attempted). Only the live
-- owner/token pair inside its lease may write; false means the lease was lost
-- and the caller must stop, because another owner may already be replaying.
create or replace function public.checkpoint_aqua_tag_submission_work(
  p_tenant_scope text,
  p_submission_id text,
  p_owner text,
  p_token uuid,
  p_effect text,
  p_record jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if coalesce(btrim(p_effect), '') = '' then
    raise exception 'effect name is required';
  end if;
  update public.aqua_tag_submissions s
  set effects = jsonb_set(coalesce(s.effects, '{}'::jsonb), array[p_effect], coalesce(p_record, '{}'::jsonb), true),
      updated_at = now()
  where s.tenant_scope = p_tenant_scope
    and s.submission_id = p_submission_id
    and s.work_status = 'processing'
    and s.claim_owner = p_owner
    and s.claim_token = p_token
    and s.lease_expires_at > now();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Finish a claim: complete, retry with exponential backoff, or dead-letter.
-- The brand_enquiries completion metadata is written in the same transaction,
-- so the canonical row and the work record cannot disagree about whether the
-- downstream delivery finished. A retry that has spent its last attempt is
-- terminal. A lost lease settles nothing and says so.
create or replace function public.settle_aqua_tag_submission_work(
  p_tenant_scope text,
  p_submission_id text,
  p_owner text,
  p_token uuid,
  p_outcome text,
  p_error text default null,
  p_effects jsonb default null,
  p_metadata_patch jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.aqua_tag_submissions%rowtype;
  next_status text;
  next_state text;
  backoff interval;
begin
  if p_outcome is null or p_outcome not in ('complete', 'retry', 'dead') then
    raise exception 'outcome must be complete, retry or dead';
  end if;

  select * into submission
  from public.aqua_tag_submissions
  where tenant_scope = p_tenant_scope and submission_id = p_submission_id
  for update;

  if not found
     or submission.work_status <> 'processing'
     or submission.claim_owner is distinct from p_owner
     or submission.claim_token is distinct from p_token
     or coalesce(submission.lease_expires_at, '-infinity'::timestamptz) <= now() then
    return jsonb_build_object('settled', false, 'reason', 'lease_lost');
  end if;

  if p_outcome = 'complete' then
    next_status := 'complete';
    next_state := 'complete';
  elsif p_outcome = 'dead' or submission.attempts >= submission.max_attempts then
    next_status := 'dead';
    next_state := 'dead-letter';
  else
    next_status := 'pending';
    next_state := 'ingesting';
  end if;
  backoff := make_interval(
    secs => least(3600, power(2, greatest(submission.attempts - 1, 0)) * 30)::double precision
  );

  update public.aqua_tag_submissions s
  set work_status = next_status,
      state = next_state,
      effects = coalesce(s.effects, '{}'::jsonb) || coalesce(p_effects, '{}'::jsonb),
      last_error = case
        when next_status = 'complete' then null
        else left(coalesce(p_error, 'Delivery failed.'), 1000)
      end,
      available_at = case when next_status = 'pending' then now() + backoff else s.available_at end,
      completed_at = case when next_status = 'complete' then now() else s.completed_at end,
      dead_lettered_at = case when next_status = 'dead' then now() else s.dead_lettered_at end,
      claim_owner = null,
      claim_token = null,
      lease_expires_at = null,
      updated_at = now()
  where s.tenant_scope = p_tenant_scope and s.submission_id = p_submission_id
  returning * into submission;

  if submission.enquiry_id is not null and jsonb_typeof(p_metadata_patch) = 'object' then
    update public.brand_enquiries e
    set metadata = e.metadata || p_metadata_patch
    where e.id = submission.enquiry_id;
  end if;

  return jsonb_build_object(
    'settled', true,
    'workStatus', submission.work_status,
    'state', submission.state,
    'attempts', submission.attempts,
    'availableAt', floor(extract(epoch from submission.available_at) * 1000),
    'lastError', submission.last_error
  );
end;
$$;

revoke all on function public.aqua_tag_merge_facts(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.ingest_aqua_tag_submission(text, text, text, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.claim_aqua_tag_submission_work(text, integer, text, text, integer) from public, anon, authenticated;
revoke all on function public.checkpoint_aqua_tag_submission_work(text, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.settle_aqua_tag_submission_work(text, text, text, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.aqua_tag_merge_facts(jsonb, jsonb) to service_role;
grant execute on function public.ingest_aqua_tag_submission(text, text, text, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.claim_aqua_tag_submission_work(text, integer, text, text, integer) to service_role;
grant execute on function public.checkpoint_aqua_tag_submission_work(text, text, text, uuid, text, jsonb) to service_role;
grant execute on function public.settle_aqua_tag_submission_work(text, text, text, uuid, text, text, jsonb, jsonb) to service_role;

comment on function public.ingest_aqua_tag_submission(text, text, text, text, jsonb, jsonb, jsonb, jsonb) is
  'Atomically claims or reuses one Aqua Tag submission identity, merges immutable facts (AQ409 on contradiction), creates or promotes the canonical brand_enquiries row and enqueues its downstream work.';
comment on function public.claim_aqua_tag_submission_work(text, integer, text, text, integer) is
  'Leases due or lease-expired Aqua Tag delivery work to one owner with a fencing token; spent work is dead-lettered.';
