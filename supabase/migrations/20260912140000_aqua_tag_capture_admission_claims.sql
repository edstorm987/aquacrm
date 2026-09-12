-- ABUSE-003 follow-up: classify Aqua Tag form captures before victim-derived
-- quotas or enquiry mutation. This is additive because the 20260902093000
-- delivery migration may already be applied in production.

alter table public.aqua_tag_submissions
  add column if not exists tag_capture_digest text,
  add column if not exists tag_capture_status text,
  add column if not exists tag_capture_claim_token uuid,
  add column if not exists tag_capture_lease_expires_at timestamptz,
  add column if not exists tag_capture_receipt jsonb;

alter table public.aqua_tag_submissions
  drop constraint if exists aqua_tag_submissions_tag_capture_status_check;
alter table public.aqua_tag_submissions
  add constraint aqua_tag_submissions_tag_capture_status_check
  check (tag_capture_status is null or tag_capture_status in ('processing', 'complete', 'legacy-review')) not valid;
alter table public.aqua_tag_submissions
  validate constraint aqua_tag_submissions_tag_capture_status_check;

-- A capture with no brand half is unambiguously tag-first: the historical
-- ingest function created its hold row, so the original receipt was
-- attached:false. Keep the historical fingerprint as its exact-retry key;
-- it intentionally differs from the stronger post-admission digest.
update public.aqua_tag_submissions
set tag_capture_status = 'complete',
    tag_capture_receipt = jsonb_build_object(
      'ok', true,
      'attached', false,
      'submissionId', submission_id,
      'enquiryId', enquiry_id,
      'boundary', 'database'
    )
where capture is not null
  and enquiry_id is not null
  and brand is null
  and coalesce(facts ->> 'captureFingerprint', '') ~ '^[a-f0-9]{64}$'
  and tag_capture_status is null
  and tag_capture_receipt is null;

-- Once both halves exist, the final row cannot prove whether the tag created
-- the hold first (attached:false) or attached after the brand (attached:true).
-- Never manufacture that receipt. These rows fail closed until a one-time
-- evidence-backed backfill supplies the original outcome and exact digest.
update public.aqua_tag_submissions
set tag_capture_status = 'legacy-review'
where capture is not null
  and tag_capture_receipt is null
  and tag_capture_status is null;

-- Remove the superseded pre-release review signature if this additive draft
-- was exercised against a disposable database before the final contract.
drop function if exists public.claim_aqua_tag_capture(text, text, text, text, integer);

create or replace function public.claim_aqua_tag_capture(
  p_tenant_scope text,
  p_submission_id text,
  p_site_key text,
  p_capture_digest text,
  p_legacy_capture_fingerprint text,
  p_lease_ms integer default 15000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.aqua_tag_submissions%rowtype;
  claim_token uuid;
  lease interval;
begin
  if coalesce(btrim(p_tenant_scope), '') = ''
     or p_submission_id is null
     or p_submission_id !~ '^aqua_sub_[A-Za-z0-9_-]{12,100}$'
     or coalesce(btrim(p_site_key), '') = ''
     or p_capture_digest !~ '^[a-f0-9]{64}$'
     or p_legacy_capture_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'aqua tag capture identity is invalid';
  end if;
  lease := make_interval(secs => greatest(1000, least(coalesce(p_lease_ms, 15000), 60000))::double precision / 1000.0);

  -- INSERT ... ON CONFLICT is the cross-instance gate. A concurrent claimant
  -- waits here, then observes the committed receipt or the live claim below.
  insert into public.aqua_tag_submissions (tenant_scope, submission_id, site_key)
  values (p_tenant_scope, p_submission_id, p_site_key)
  on conflict (tenant_scope, submission_id) do nothing;

  select * into submission
  from public.aqua_tag_submissions
  where tenant_scope = p_tenant_scope and submission_id = p_submission_id
  for update;

  if submission.site_key <> p_site_key then
    raise exception using errcode = 'AQ409', message = 'aqua_tag_submission_conflict:siteKey';
  end if;
  if submission.tag_capture_receipt is not null then
    if submission.tag_capture_digest is not null and submission.tag_capture_digest <> p_capture_digest then
      raise exception using errcode = 'AQ409', message = 'aqua_tag_submission_conflict:captureDigest';
    end if;
    if submission.tag_capture_digest is null
       and coalesce(submission.facts ->> 'captureFingerprint', '') <> p_legacy_capture_fingerprint then
      raise exception using errcode = 'AQ409', message = 'aqua_tag_submission_conflict:legacyCaptureFingerprint';
    end if;
    return jsonb_build_object('kind', 'replay', 'receipt', submission.tag_capture_receipt);
  end if;
  if submission.tag_capture_status = 'legacy-review' then
    return jsonb_build_object(
      'kind', 'unavailable',
      'reason', 'legacy_aqua_tag_capture_requires_evidence_backfill'
    );
  end if;
  if submission.tag_capture_digest is not null and submission.tag_capture_digest <> p_capture_digest then
    raise exception using errcode = 'AQ409', message = 'aqua_tag_submission_conflict:captureDigest';
  end if;
  if submission.tag_capture_status = 'processing'
     and coalesce(submission.tag_capture_lease_expires_at, '-infinity'::timestamptz) > now() then
    return jsonb_build_object(
      'kind', 'pending',
      'retryAfterMs', greatest(25, least(1000, ceil(extract(epoch from (submission.tag_capture_lease_expires_at - now())) * 1000)::integer))
    );
  end if;

  claim_token := gen_random_uuid();
  update public.aqua_tag_submissions
  set tag_capture_digest = p_capture_digest,
      tag_capture_status = 'processing',
      tag_capture_claim_token = claim_token,
      tag_capture_lease_expires_at = now() + lease,
      updated_at = now()
  where tenant_scope = p_tenant_scope and submission_id = p_submission_id;
  return jsonb_build_object('kind', 'new', 'claimToken', claim_token);
end;
$$;

create or replace function public.complete_aqua_tag_capture(
  p_tenant_scope text,
  p_submission_id text,
  p_site_key text,
  p_claim_token uuid,
  p_facts jsonb,
  p_capture jsonb,
  p_enquiry_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.aqua_tag_submissions%rowtype;
  ingestion jsonb;
  receipt jsonb;
begin
  select * into submission
  from public.aqua_tag_submissions
  where tenant_scope = p_tenant_scope and submission_id = p_submission_id
  for update;
  if not found
     or submission.site_key <> p_site_key
     or submission.tag_capture_status <> 'processing'
     or submission.tag_capture_claim_token is distinct from p_claim_token
     or coalesce(submission.tag_capture_lease_expires_at, '-infinity'::timestamptz) <= now() then
    raise exception using errcode = 'AQ412', message = 'aqua_tag_capture_claim_lost';
  end if;
  if coalesce(p_facts ->> 'captureDigest', '') <> submission.tag_capture_digest then
    raise exception using errcode = 'AQ409', message = 'aqua_tag_submission_conflict:captureDigest';
  end if;

  -- Nested function execution shares this transaction and row lock: enquiry
  -- mutation and the durable receipt either both commit or both roll back.
  ingestion := public.ingest_aqua_tag_submission(
    p_tenant_scope,
    p_submission_id,
    p_site_key,
    'tag',
    p_facts,
    p_capture,
    null,
    p_enquiry_row
  );
  receipt := jsonb_build_object(
    'ok', true,
    'attached', not coalesce((ingestion ->> 'created')::boolean, false),
    'submissionId', p_submission_id,
    'enquiryId', ingestion ->> 'enquiryId',
    'boundary', 'database'
  );
  update public.aqua_tag_submissions
  set tag_capture_status = 'complete',
      tag_capture_receipt = receipt,
      tag_capture_claim_token = null,
      tag_capture_lease_expires_at = null,
      updated_at = now()
  where tenant_scope = p_tenant_scope and submission_id = p_submission_id;
  return jsonb_build_object('receipt', receipt, 'ingestion', ingestion);
end;
$$;

create or replace function public.release_aqua_tag_capture(
  p_tenant_scope text,
  p_submission_id text,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.aqua_tag_submissions
  set tag_capture_status = null,
      tag_capture_claim_token = null,
      tag_capture_lease_expires_at = null,
      updated_at = now()
  where tenant_scope = p_tenant_scope
    and submission_id = p_submission_id
    and tag_capture_status = 'processing'
    and tag_capture_claim_token = p_claim_token
    and tag_capture_receipt is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_aqua_tag_capture(text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_aqua_tag_capture(text, text, text, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.release_aqua_tag_capture(text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_aqua_tag_capture(text, text, text, text, text, integer) to service_role;
grant execute on function public.complete_aqua_tag_capture(text, text, text, uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.release_aqua_tag_capture(text, text, uuid) to service_role;

comment on function public.claim_aqua_tag_capture(text, text, text, text, text, integer) is
  'Atomically classifies an exact Aqua Tag capture as new, pending, replay, or conflict before victim-derived quota is charged.';
