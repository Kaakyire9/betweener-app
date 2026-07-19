-- Betweener 1.1.1 production release registration.
-- Operational SQL for the Supabase SQL Editor; this is intentionally outside
-- supabase/migrations because it must run only after both store builds are
-- approved and available to users.
--
-- Replace the two positive integer placeholders before running:
--   __IOS_BUILD__
--   __ANDROID_BUILD__

begin;

do $release$
declare
  v_ios_build integer := __IOS_BUILD__;
  v_android_build integer := __ANDROID_BUILD__;
  v_affected integer;
  v_items jsonb := jsonb_build_array(
    'Smoother profile media handling',
    'Refined navigation and quieter polish',
    'Stability improvements across core flows'
  );
  v_notes text :=
    'A quieter polish release with smoother profile media handling, refined navigation, and stability improvements.';
begin
  if v_ios_build <= 0 or v_android_build <= 0 then
    raise exception 'Replace both release build placeholders with positive integers';
  end if;

  update public.app_version_rules
  set
    latest_version = '1.1.1',
    latest_build_number = v_ios_build,
    update_mode = 'silent',
    update_title = 'A better Betweener is ready',
    update_message = v_notes,
    whats_new_title = 'New in Betweener',
    whats_new_items = v_items,
    updated_at = timezone('utc'::text, now())
  where platform = 'ios'
    and environment = 'production'
    and enabled = true;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'Expected one enabled iOS production rule, updated %', v_affected;
  end if;

  update public.app_version_rules
  set
    latest_version = '1.1.1',
    latest_build_number = v_android_build,
    update_mode = 'silent',
    update_title = 'A better Betweener is ready',
    update_message = v_notes,
    whats_new_title = 'New in Betweener',
    whats_new_items = v_items,
    updated_at = timezone('utc'::text, now())
  where platform = 'android'
    and environment = 'production'
    and enabled = true;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'Expected one enabled Android production rule, updated %', v_affected;
  end if;

  insert into public.app_version_history (
    platform,
    version,
    build_number,
    release_type,
    title,
    release_notes,
    whats_new_items,
    released_at
  )
  values
    (
      'ios', '1.1.1', v_ios_build, 'hotfix', 'New in Betweener',
      v_notes, v_items, timezone('utc'::text, now())
    ),
    (
      'android', '1.1.1', v_android_build, 'hotfix', 'New in Betweener',
      v_notes, v_items, timezone('utc'::text, now())
    )
  on conflict (platform, version, build_number)
  do update set
    release_type = excluded.release_type,
    title = excluded.title,
    release_notes = excluded.release_notes,
    whats_new_items = excluded.whats_new_items,
    released_at = excluded.released_at;
end;
$release$;

commit;
