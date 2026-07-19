-- Server-owned, single-use selfie liveness challenges.
-- On-device measurements are preflight evidence only; a human reviewer remains
-- the final authority for verification approval.

create table if not exists public.verification_liveness_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  nonce uuid not null default gen_random_uuid(),
  actions text[] not null,
  status text not null default 'issued',
  issued_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  evidence jsonb,
  verification_request_id uuid references public.verification_requests(id) on delete set null,
  constraint verification_liveness_challenges_actions_check
    check (actions in (array['turn', 'blink']::text[], array['blink', 'turn']::text[])),
  constraint verification_liveness_challenges_status_check
    check (status in ('issued', 'consumed', 'expired', 'superseded')),
  constraint verification_liveness_challenges_expiry_check
    check (expires_at > issued_at)
);

create unique index if not exists verification_liveness_challenges_active_idx
  on public.verification_liveness_challenges (profile_id)
  where status = 'issued';

create index if not exists verification_liveness_challenges_expiry_idx
  on public.verification_liveness_challenges (expires_at)
  where status = 'issued';

alter table public.verification_liveness_challenges enable row level security;
revoke all on table public.verification_liveness_challenges from public, anon, authenticated;

-- All client submissions now pass through validation RPCs. The old generic
-- table insert policy and timer-era liveness RPC would otherwise bypass the
-- challenge binding introduced below.
drop policy if exists "Users can insert their own verification requests"
  on public.verification_requests;
revoke execute on function public.rpc_submit_selfie_liveness_verification(
  uuid, text, text, text, text
) from public, anon, authenticated;

create table if not exists public.verification_evidence_retention (
  request_id uuid primary key references public.verification_requests(id) on delete cascade,
  bucket_id text not null default 'verification-docs',
  object_path text not null,
  delete_after timestamptz not null,
  status text not null default 'scheduled',
  attempts integer not null default 0,
  processing_started_at timestamptz,
  last_error text,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint verification_evidence_retention_status_check
    check (status in ('scheduled', 'processing', 'deleted', 'failed')),
  constraint verification_evidence_retention_object_path_check
    check (object_path <> '' and object_path !~ '(^|/)\.\.(/|$)')
);

create index if not exists verification_evidence_retention_due_idx
  on public.verification_evidence_retention (delete_after)
  where status in ('scheduled', 'failed');

alter table public.verification_evidence_retention enable row level security;
revoke all on table public.verification_evidence_retention from public, anon, authenticated;
grant select, update on table public.verification_evidence_retention to service_role;

create or replace function public.schedule_verification_evidence_after_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status in ('approved', 'rejected', 'cancelled')
     and old.status is distinct from new.status then
    update public.verification_evidence_retention retention
    set delete_after = least(retention.delete_after, timezone('utc', now()) + interval '7 days'),
        status = case when retention.status = 'deleted' then 'deleted' else 'scheduled' end,
        processing_started_at = null,
        last_error = null
    where retention.request_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists verification_requests_schedule_evidence_retention
  on public.verification_requests;
create trigger verification_requests_schedule_evidence_retention
after update of status on public.verification_requests
for each row execute function public.schedule_verification_evidence_after_review();

create or replace function public.rpc_claim_verification_evidence_retention(
  p_limit integer default 50
)
returns table (
  request_id uuid,
  bucket_id text,
  object_path text,
  attempts integer
)
language sql
volatile
security definer
set search_path = public, pg_catalog
as $$
  with due as (
    select retention.request_id
    from public.verification_evidence_retention retention
    where (
        retention.status in ('scheduled', 'failed')
        or (
          retention.status = 'processing'
          and retention.processing_started_at < timezone('utc', now()) - interval '15 minutes'
        )
      )
      and retention.delete_after <= timezone('utc', now())
      and retention.attempts < 8
    order by retention.delete_after
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), claimed as (
    update public.verification_evidence_retention retention
    set status = 'processing',
        attempts = retention.attempts + 1,
        processing_started_at = timezone('utc', now()),
        last_error = null
    from due
    where retention.request_id = due.request_id
    returning retention.request_id, retention.bucket_id,
      retention.object_path, retention.attempts
  )
  select claimed.request_id, claimed.bucket_id, claimed.object_path, claimed.attempts
  from claimed;
$$;

revoke all on function public.rpc_claim_verification_evidence_retention(integer)
  from public, anon, authenticated;
grant execute on function public.rpc_claim_verification_evidence_retention(integer)
  to service_role;

create or replace function public.rpc_issue_selfie_liveness_challenge(
  p_profile_id uuid
)
returns table (
  challenge_id uuid,
  nonce uuid,
  actions text[],
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actions text[];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
  ) then
    raise exception 'profile not found for current user' using errcode = '42501';
  end if;

  update public.verification_liveness_challenges challenge
  set status = case when challenge.expires_at <= timezone('utc', now()) then 'expired' else 'superseded' end
  where challenge.profile_id = p_profile_id
    and challenge.user_id = auth.uid()
    and challenge.status = 'issued';

  -- Randomise the action order so a previously recorded fixed sequence cannot
  -- satisfy every challenge. gen_random_bytes is supplied by pgcrypto.
  v_actions := case
    when get_byte(extensions.gen_random_bytes(1), 0) % 2 = 0 then array['turn', 'blink']::text[]
    else array['blink', 'turn']::text[]
  end;

  return query
  insert into public.verification_liveness_challenges (
    user_id,
    profile_id,
    actions,
    expires_at
  )
  values (
    auth.uid(),
    p_profile_id,
    v_actions,
    timezone('utc', now()) + interval '2 minutes'
  )
  returning id, verification_liveness_challenges.nonce,
    verification_liveness_challenges.actions,
    verification_liveness_challenges.expires_at;
end;
$$;

create or replace function public.rpc_submit_selfie_liveness_verification_v2(
  p_profile_id uuid,
  p_challenge_id uuid,
  p_document_path text,
  p_evidence jsonb
)
returns table (
  request_id uuid,
  status text,
  created_at timestamptz,
  already_pending boolean
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_challenge public.verification_liveness_challenges%rowtype;
  v_document_path text := nullif(btrim(coalesce(p_document_path, '')), '');
  v_requested_actions text[];
  v_completed_actions text[];
  v_duration_ms integer;
  v_sample_count integer;
  v_single_face_samples integer;
  v_centered_samples integer;
  v_turn_samples integer;
  v_closed_eye_samples integer;
  v_reopened_eye_samples integer;
  v_request_id uuid;
  v_request_status text;
  v_request_created_at timestamptz;
  v_already_pending boolean := false;
  v_score numeric;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.user_id = auth.uid()
  ) then
    raise exception 'profile not found for current user' using errcode = '42501';
  end if;

  if v_document_path is null
     or v_document_path !~ ('^' || auth.uid()::text || '/verification_selfie_liveness_[0-9]+\.(mp4|mov)$')
     or char_length(v_document_path) > 240 then
    raise exception 'invalid liveness evidence path' using errcode = '22023';
  end if;

  if jsonb_typeof(p_evidence) <> 'object'
     or pg_column_size(p_evidence) > 8192
     or coalesce((p_evidence ->> 'schema_version')::integer, 0) <> 1
     or coalesce((p_evidence ->> 'challenge_completed')::boolean, false) is not true then
    raise exception 'invalid liveness evidence' using errcode = '22023';
  end if;

  select challenge.*
  into v_challenge
  from public.verification_liveness_challenges challenge
  where challenge.id = p_challenge_id
  for update;

  if v_challenge.id is null
     or v_challenge.profile_id <> p_profile_id
     or v_challenge.user_id <> auth.uid() then
    raise exception 'liveness challenge not found' using errcode = '42501';
  end if;

  if v_challenge.status <> 'issued' then
    raise exception 'liveness challenge already used' using errcode = '22023';
  end if;

  if v_challenge.expires_at <= timezone('utc', now()) then
    update public.verification_liveness_challenges set status = 'expired' where id = v_challenge.id;
    raise exception 'liveness challenge expired' using errcode = '22023';
  end if;

  if p_evidence ->> 'challenge_id' <> v_challenge.id::text
     or p_evidence ->> 'challenge_nonce' <> v_challenge.nonce::text then
    raise exception 'liveness challenge binding mismatch' using errcode = '22023';
  end if;

  select coalesce(array_agg(value order by ordinal), array[]::text[])
  into v_requested_actions
  from jsonb_array_elements_text(p_evidence -> 'requested_actions') with ordinality as requested(value, ordinal);

  select coalesce(array_agg(value order by ordinal), array[]::text[])
  into v_completed_actions
  from jsonb_array_elements_text(p_evidence -> 'completed_actions') with ordinality as completed(value, ordinal);

  if v_requested_actions <> v_challenge.actions or v_completed_actions <> v_challenge.actions then
    raise exception 'liveness action sequence incomplete' using errcode = '22023';
  end if;

  v_duration_ms := coalesce((p_evidence ->> 'duration_ms')::integer, 0);
  v_sample_count := coalesce((p_evidence ->> 'sample_count')::integer, 0);
  v_single_face_samples := coalesce((p_evidence ->> 'single_face_samples')::integer, 0);
  v_centered_samples := coalesce((p_evidence ->> 'centered_samples')::integer, 0);
  v_turn_samples := coalesce((p_evidence ->> 'turn_samples')::integer, 0);
  v_closed_eye_samples := coalesce((p_evidence ->> 'closed_eye_samples')::integer, 0);
  v_reopened_eye_samples := coalesce((p_evidence ->> 'reopened_eye_samples')::integer, 0);

  if v_duration_ms not between 1800 and 15000
     or v_sample_count < 10
     or v_single_face_samples < 9
     or v_centered_samples < 7
     or v_turn_samples < 2
     or v_closed_eye_samples < 2
     or v_reopened_eye_samples < 2
     or v_single_face_samples > v_sample_count
     or v_centered_samples > v_single_face_samples then
    raise exception 'liveness evidence thresholds not met' using errcode = '22023';
  end if;

  select vr.id, coalesce(vr.status, 'pending'),
    coalesce(vr.created_at, vr.submitted_at, timezone('utc', now()))
  into v_request_id, v_request_status, v_request_created_at
  from public.verification_requests vr
  where vr.profile_id = p_profile_id
    and vr.verification_type = 'selfie_liveness'
    and coalesce(vr.status, 'pending') = 'pending'
  order by vr.created_at desc nulls last, vr.id desc
  limit 1;

  if v_request_id is not null then
    v_already_pending := true;
  else
    -- This score represents measured challenge quality, not identity approval.
    -- It deliberately remains below an auto-approval threshold.
    v_score := least(
      0.84,
      0.58 +
      (least(v_centered_samples::numeric / greatest(v_sample_count, 1), 1) * 0.12) +
      (least(v_single_face_samples::numeric / greatest(v_sample_count, 1), 1) * 0.10)
    );

    insert into public.verification_requests (
      user_id,
      profile_id,
      verification_type,
      document_url,
      status,
      auto_verification_score,
      auto_verification_data
    ) values (
      auth.uid(),
      p_profile_id,
      'selfie_liveness',
      v_document_path,
      'pending',
      v_score,
      jsonb_build_object(
        'submitted_via', 'rpc_submit_selfie_liveness_verification_v2',
        'challenge_id', v_challenge.id,
        'challenge_actions', to_jsonb(v_challenge.actions),
        'challenge_issued_at', v_challenge.issued_at,
        'challenge_expires_at', v_challenge.expires_at,
        'measurement_source', 'vision_camera_5_mlkit_on_device',
        'human_review_required', true,
        'evidence', p_evidence,
        'retention_delete_after', timezone('utc', now()) + interval '30 days'
      )
    )
    returning id, coalesce(verification_requests.status, 'pending'),
      coalesce(verification_requests.created_at, verification_requests.submitted_at, timezone('utc', now()))
    into v_request_id, v_request_status, v_request_created_at;

    insert into public.verification_evidence_retention (request_id, object_path, delete_after)
    values (v_request_id, v_document_path, timezone('utc', now()) + interval '30 days')
    on conflict (request_id) do update
      set object_path = excluded.object_path,
          delete_after = excluded.delete_after,
          status = 'scheduled',
          attempts = 0,
          processing_started_at = null,
          last_error = null,
          deleted_at = null;
  end if;

  update public.verification_liveness_challenges
  set status = 'consumed',
      consumed_at = timezone('utc', now()),
      evidence = p_evidence,
      verification_request_id = v_request_id
  where id = v_challenge.id;

  return query select v_request_id, v_request_status, v_request_created_at, v_already_pending;
end;
$$;

revoke all on function public.rpc_issue_selfie_liveness_challenge(uuid) from public, anon;
grant execute on function public.rpc_issue_selfie_liveness_challenge(uuid) to authenticated;
revoke all on function public.rpc_submit_selfie_liveness_verification_v2(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.rpc_submit_selfie_liveness_verification_v2(uuid, uuid, text, jsonb) to authenticated;

comment on table public.verification_liveness_challenges is
  'Short-lived, single-use server challenges binding selfie evidence to an authenticated profile.';
comment on table public.verification_evidence_retention is
  'Private evidence deletion schedule. Storage deletion must be performed through the Storage API, never by deleting storage.objects directly.';
