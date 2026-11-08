-- Restore reproducible Circle infrastructure and isolated staging fixtures.
-- Bucket inserts are idempotent and preserve existing production settings.
-- Fixture rows are guarded by the server-owned staging application identity.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  ('circle-images', 'circle-images', false, null, null),
  (
    'circle-pulse-media',
    'circle-pulse-media',
    false,
    52428800,
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/quicktime'
    ]::text[]
  )
on conflict (id) do nothing;

do $$
declare
  v_is_staging boolean := false;
  v_admin_profile_id uuid;
  v_admin_user_id uuid;
  v_second_profile_id uuid;
  v_second_user_id uuid;
  v_third_profile_id uuid;
  v_third_user_id uuid;
  v_fourth_profile_id uuid;
begin
  select exists (
    select 1
    from private.push_application_config config
    where config.id = true
      and config.app_environment = 'staging'
      and config.application_id = 'com.aduboffour.betweener.staging'
  ) into v_is_staging;

  if not v_is_staging then
    return;
  end if;

  select profile.id, profile.user_id
    into v_admin_profile_id, v_admin_user_id
  from public.profiles profile
  join public.internal_admins admin
    on admin.user_id = profile.user_id
  where profile.deleted_at is null
    and profile.user_id is not null
  order by profile.created_at
  limit 1;

  if v_admin_profile_id is null then
    raise exception 'circle_staging_fixture_admin_profile_missing';
  end if;

  select profile.id, profile.user_id
    into v_second_profile_id, v_second_user_id
  from public.profiles profile
  where profile.deleted_at is null
    and profile.user_id is not null
    and profile.id <> v_admin_profile_id
  order by profile.created_at
  offset 0 limit 1;

  select profile.id, profile.user_id
    into v_third_profile_id, v_third_user_id
  from public.profiles profile
  where profile.deleted_at is null
    and profile.user_id is not null
    and profile.id <> v_admin_profile_id
  order by profile.created_at
  offset 1 limit 1;

  select profile.id
    into v_fourth_profile_id
  from public.profiles profile
  where profile.deleted_at is null
    and profile.user_id is not null
    and profile.id <> v_admin_profile_id
  order by profile.created_at
  offset 2 limit 1;

  insert into public.circles (
    id, name, slug, description, short_description, visibility, category,
    created_by_profile_id, created_by_user_id, circle_type, status,
    visibility_scope, country_code, country_name, city, diaspora_tags,
    culture_tags, interest_tags, audience_tags, is_official, is_featured,
    requires_join_approval, approved_by_admin_id, approved_at, rules,
    safety_note
  )
  values
    (
      'c1c1c1c1-0000-4000-8000-000000000001'::uuid,
      'Staging Circle Lab',
      'staging-circle-lab',
      'A private staging workspace for validating Circle membership, hosting, Pulse, invitations, and Gatherings.',
      'Validate the complete Circles experience safely in staging.',
      'public', 'staging', v_admin_profile_id, v_admin_user_id,
      'official', 'approved', 'global', null, null, null,
      '{}', '{}', array['product testing'], array['staging testers'],
      true, true, false, v_admin_user_id, timezone('utc', now()),
      'Use synthetic content only. Do not copy production member data.',
      'This Circle is isolated to Betweener Staging.'
    ),
    (
      'c2c2c2c2-0000-4000-8000-000000000002'::uuid,
      'Accra Intentional Connections — Staging',
      'accra-intentional-connections-staging',
      'A staging Circle for validating local discovery, member roles, prompts, and in-person Gathering presentation.',
      'Test local Circle discovery and community activity.',
      'public', 'community',
      coalesce(v_second_profile_id, v_admin_profile_id),
      coalesce(v_second_user_id, v_admin_user_id),
      'community', 'approved', 'country', 'GH', 'Ghana', 'Accra',
      '{}', array['ghanaian'], array['community', 'relationships'],
      array['staging testers'], false, false, false,
      v_admin_user_id, timezone('utc', now()),
      'Be respectful and use test content only.',
      'Meet in public places for staging Gathering tests.'
    ),
    (
      'c3c3c3c3-0000-4000-8000-000000000003'::uuid,
      'Diaspora Evenings — Staging',
      'diaspora-evenings-staging',
      'A staging Circle for validating diaspora discovery, invitations, and cross-location community context.',
      'Test diaspora discovery and invitations.',
      'public', 'community',
      coalesce(v_third_profile_id, v_admin_profile_id),
      coalesce(v_third_user_id, v_admin_user_id),
      'community', 'approved', 'diaspora', 'GB', 'United Kingdom', 'London',
      array['ghana', 'united kingdom'], array['ghanaian diaspora'],
      array['culture', 'community'], array['staging testers'],
      false, false, true, v_admin_user_id, timezone('utc', now()),
      'Invitations are test-only and must stay within staging.',
      'This is a synthetic staging Circle.'
    )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    short_description = excluded.short_description,
    status = excluded.status,
    archived_at = null,
    updated_at = timezone('utc', now());

  insert into public.circle_members (
    circle_id, profile_id, user_id, role, status, is_visible, joined_at, left_at
  )
  select
    'c1c1c1c1-0000-4000-8000-000000000001'::uuid,
    profile.id,
    profile.user_id,
    case when profile.id = v_admin_profile_id then 'host' else 'member' end,
    'active', true, timezone('utc', now()), null
  from public.profiles profile
  where profile.deleted_at is null
    and profile.user_id is not null
  on conflict (circle_id, profile_id) do update set
    user_id = excluded.user_id,
    role = excluded.role,
    status = 'active',
    is_visible = true,
    left_at = null,
    updated_at = timezone('utc', now());

  if v_second_profile_id is not null then
    insert into public.circle_members (
      circle_id, profile_id, user_id, role, status, is_visible, joined_at, left_at
    ) values (
      'c2c2c2c2-0000-4000-8000-000000000002'::uuid,
      v_second_profile_id, v_second_user_id, 'host', 'active', true,
      timezone('utc', now()), null
    )
    on conflict (circle_id, profile_id) do update set
      user_id = excluded.user_id, role = 'host', status = 'active',
      is_visible = true, left_at = null, updated_at = timezone('utc', now());
  end if;

  if v_third_profile_id is not null then
    insert into public.circle_members (
      circle_id, profile_id, user_id, role, status, is_visible, joined_at, left_at
    ) values
      (
        'c2c2c2c2-0000-4000-8000-000000000002'::uuid,
        v_third_profile_id, v_third_user_id, 'moderator', 'active', true,
        timezone('utc', now()), null
      ),
      (
        'c3c3c3c3-0000-4000-8000-000000000003'::uuid,
        v_third_profile_id, v_third_user_id, 'host', 'active', true,
        timezone('utc', now()), null
      )
    on conflict (circle_id, profile_id) do update set
      user_id = excluded.user_id, role = excluded.role, status = 'active',
      is_visible = true, left_at = null, updated_at = timezone('utc', now());
  end if;

  insert into public.circle_prompts (
    id, circle_id, title, prompt, prompt_type, status,
    created_by_profile_id, created_by_admin_id, starts_at, expires_at
  )
  values
    (
      'a1a1a1a1-0000-4000-8000-000000000001'::uuid,
      'c1c1c1c1-0000-4000-8000-000000000001'::uuid,
      'What should we validate next?',
      'Share the one Circles flow you want the staging team to validate next.',
      'featured', 'published', v_admin_profile_id, v_admin_user_id,
      timezone('utc', now()), timezone('utc', now()) + interval '180 days'
    ),
    (
      'a2a2a2a2-0000-4000-8000-000000000002'::uuid,
      'c2c2c2c2-0000-4000-8000-000000000002'::uuid,
      'A meaningful Accra evening',
      'What makes a community Gathering feel welcoming, safe, and worth attending?',
      'weekly', 'published', coalesce(v_second_profile_id, v_admin_profile_id),
      v_admin_user_id, timezone('utc', now()),
      timezone('utc', now()) + interval '180 days'
    )
  on conflict (id) do update set
    title = excluded.title, prompt = excluded.prompt, status = 'published',
    starts_at = excluded.starts_at, expires_at = excluded.expires_at,
    updated_at = timezone('utc', now());

  insert into public.gatherings (
    id, circle_id, title, slug, description, gathering_type, status,
    country_code, country_name, city, venue_name, address_visibility,
    starts_at, ends_at, timezone, is_official, safe_first_date_space,
    max_attendees, created_by_profile_id, created_by_user_id,
    approved_by_admin_id, approved_at, tags
  ) values (
    'b1b1b1b1-0000-4000-8000-000000000001'::uuid,
    'c1c1c1c1-0000-4000-8000-000000000001'::uuid,
    'Staging Circle Walkthrough',
    'staging-circle-walkthrough',
    'A synthetic Gathering for validating cards, attendance, calendar export, and Circle navigation.',
    'hybrid', 'approved', 'GH', 'Ghana', 'Accra',
    'Betweener Staging Lab', 'attendees_only',
    timezone('utc', now()) + interval '90 days',
    timezone('utc', now()) + interval '90 days 2 hours',
    'Africa/Accra', true, true, 24, v_admin_profile_id, v_admin_user_id,
    v_admin_user_id, timezone('utc', now()),
    array['staging', 'circles', 'walkthrough']
  )
  on conflict (id) do update set
    title = excluded.title, description = excluded.description,
    status = 'approved', starts_at = excluded.starts_at,
    ends_at = excluded.ends_at, updated_at = timezone('utc', now());

  insert into public.circle_pulse_items (
    id, circle_id, item_type, prompt_id, title, subtitle, body,
    status, priority, starts_at, expires_at, created_by_profile_id,
    created_by_user_id, discussion_cta, discussion_summary
  ) values (
    'd1d1d1d1-0000-4000-8000-000000000001'::uuid,
    'c1c1c1c1-0000-4000-8000-000000000001'::uuid,
    'prompt', 'a1a1a1a1-0000-4000-8000-000000000001'::uuid,
    'Help shape the staging walkthrough',
    'A safe place to validate Circle discussion.',
    'Reply with the next workflow the team should exercise.',
    'active', 100, timezone('utc', now()),
    timezone('utc', now()) + interval '180 days',
    v_admin_profile_id, v_admin_user_id,
    'Join the test discussion', 'Synthetic staging discussion'
  )
  on conflict (id) do update set
    status = 'active', title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, starts_at = excluded.starts_at,
    expires_at = excluded.expires_at, updated_at = timezone('utc', now());

  if v_second_profile_id is not null then
    insert into public.circle_pulse_comments (
      id, circle_id, pulse_item_id, profile_id, user_id, body, status
    ) values (
      'f1f1f1f1-0000-4000-8000-000000000001'::uuid,
      'c1c1c1c1-0000-4000-8000-000000000001'::uuid,
      'd1d1d1d1-0000-4000-8000-000000000001'::uuid,
      v_second_profile_id, v_second_user_id,
      'Staging fixture ready: membership, discussion, and moderation paths can now be exercised.',
      'active'
    )
    on conflict (id) do update set
      body = excluded.body, status = 'active', deleted_at = null,
      updated_at = timezone('utc', now());
  end if;

  if v_fourth_profile_id is not null and v_third_profile_id is not null then
    insert into public.circle_invitations (
      id, circle_id, inviter_profile_id, invited_profile_id, status,
      message, expires_at
    ) values (
      'e1e1e1e1-0000-4000-8000-000000000001'::uuid,
      'c3c3c3c3-0000-4000-8000-000000000003'::uuid,
      v_third_profile_id, v_fourth_profile_id, 'pending',
      'Staging invitation fixture for validating the Circle inbox.',
      timezone('utc', now()) + interval '180 days'
    )
    on conflict (id) do update set
      status = 'pending', message = excluded.message,
      expires_at = excluded.expires_at, responded_at = null,
      updated_at = timezone('utc', now());
  end if;

  update public.circles circle
  set member_count = (
        select count(*)::integer
        from public.circle_members member
        where member.circle_id = circle.id
          and member.status = 'active'
          and member.is_visible is not false
      ),
      gathering_count = (
        select count(*)::integer
        from public.gatherings gathering
        where gathering.circle_id = circle.id
          and gathering.status = 'approved'
          and gathering.starts_at >= timezone('utc', now())
      ),
      updated_at = timezone('utc', now())
  where circle.id in (
    'c1c1c1c1-0000-4000-8000-000000000001'::uuid,
    'c2c2c2c2-0000-4000-8000-000000000002'::uuid,
    'c3c3c3c3-0000-4000-8000-000000000003'::uuid
  );
end;
$$;

commit;
