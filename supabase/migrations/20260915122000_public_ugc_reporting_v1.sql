-- Give authenticated members a server-owned report path for public Moments and
-- member-authored Circle Pulse items. Evidence is snapshotted at submission so
-- later edits/deletion cannot erase the moderation context.

create or replace function public.rpc_submit_ugc_content_report_v1(
  p_content_type text,
  p_content_id uuid,
  p_reason text,
  p_client_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog, auth
as $$
declare
  v_reporter uuid := auth.uid();
  v_reported uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_snapshot jsonb := '{}'::jsonb;
  v_existing uuid;
  v_report_id uuid;
begin
  if v_reporter is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_content_id is null
     or p_content_type not in ('moment', 'circle_pulse_item')
     or v_reason not in ('NUDITY_OR_SEXUAL_CONTENT', 'HARASSMENT_OR_HATE',
       'SCAM_OR_SOLICITATION', 'VIOLENCE_OR_DANGER', 'OTHER') then
    raise exception using errcode = '22023', message = 'INVALID_CONTENT_REPORT';
  end if;

  if p_content_type = 'moment' then
    select moment_row.user_id,
      jsonb_build_object(
        'content_type', 'moment',
        'content_id', moment_row.id,
        'moment_type', moment_row.type,
        'caption', left(coalesce(moment_row.caption, ''), 1200),
        'text_body', left(coalesce(moment_row.text_body, ''), 1200),
        'media_url', moment_row.media_url,
        'created_at', moment_row.created_at
      )
    into v_reported, v_snapshot
    from public.moments moment_row
    where moment_row.id = p_content_id
      and not moment_row.is_deleted;
  else
    select coalesce(item.created_by_user_id, profile.user_id, moment_row.user_id),
      jsonb_build_object(
        'content_type', 'circle_pulse_item',
        'content_id', item.id,
        'circle_id', item.circle_id,
        'item_type', item.item_type,
        'title', left(coalesce(item.title, ''), 500),
        'body', left(coalesce(item.body, ''), 1200),
        'media_url', coalesce(item.media_url, item.image_url),
        'created_at', item.created_at
      )
    into v_reported, v_snapshot
    from public.circle_pulse_items item
    left join public.profiles profile on profile.id = item.created_by_profile_id
    left join public.moments moment_row on moment_row.id = item.moment_id
    where item.id = p_content_id
      and item.status = 'active';
  end if;

  if v_reported is null then
    raise exception using errcode = 'P0002', message = 'REPORTABLE_CONTENT_NOT_FOUND';
  end if;
  if v_reported = v_reporter then
    raise exception using errcode = '22023', message = 'CANNOT_REPORT_OWN_CONTENT';
  end if;

  select report.id into v_existing
  from public.reports report
  where report.reporter_id = v_reporter
    and report.reported_id = v_reported
    and report.status = 'PENDING'
    and report.created_at >= timezone('utc', now()) - interval '24 hours'
    and report.evidence ->> 'content_type' = p_content_type
    and report.evidence ->> 'content_id' = p_content_id::text
  order by report.created_at desc
  limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.reports(reporter_id, reported_id, reason, evidence)
  values (
    v_reporter,
    v_reported,
    v_reason,
    jsonb_strip_nulls(
      case when jsonb_typeof(p_client_evidence) = 'object'
        then p_client_evidence else '{}'::jsonb end ||
      v_snapshot || jsonb_build_object('source', 'public_ugc_report')
    )
  ) returning id into v_report_id;
  return v_report_id;
end;
$$;

revoke all on function public.rpc_submit_ugc_content_report_v1(text, uuid, text, jsonb)
  from public, anon;
grant execute on function public.rpc_submit_ugc_content_report_v1(text, uuid, text, jsonb)
  to authenticated, service_role;
