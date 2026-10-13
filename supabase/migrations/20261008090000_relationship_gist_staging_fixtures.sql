-- Seed editorial Relationship Gists only in the isolated Betweener Staging project.
-- Production and any unknown environment remain unchanged.

begin;

do $$
declare
  v_is_staging boolean := false;
  v_admin_profile_id uuid;
  v_admin_user_id uuid;
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
    raise exception 'relationship_gist_staging_admin_profile_missing';
  end if;

  insert into public.relationship_gists (
    id,
    circle_id,
    title,
    short_body,
    body,
    perspective,
    status,
    audience_tags,
    created_by_profile_id,
    created_by_admin_id,
    published_at,
    scheduled_for
  )
  values
    (
      '91000000-0000-4000-8000-000000000001'::uuid,
      null,
      'Clarity grows through consistency',
      'Look for the pattern created by someone''s choices, not only the promise made in one beautiful moment.',
      E'Connection becomes easier to trust when words and actions keep meeting each other. A thoughtful message matters, but the pattern around it matters more.\n\nNotice the pattern: Pay attention to whether plans, communication, and care remain steady across ordinary days. Consistency does not require perfection; it means repair, explanation, and follow-through arrive when something changes.\n\nKeep your pace: You do not need to rush intimacy to prove interest. Let reliability reveal itself while you stay honest about what you need.\n\nTakeaway: Choose the connection that becomes clearer with time, not the one that asks you to ignore repeated uncertainty.',
      'general',
      'published',
      array['staging testers'],
      v_admin_profile_id,
      v_admin_user_id,
      timezone('utc', now()),
      null
    ),
    (
      '91000000-0000-4000-8000-000000000002'::uuid,
      null,
      'Curiosity before assumption',
      'When two backgrounds meet, respectful curiosity creates more room than guessing what the other person means.',
      E'Shared values can be expressed differently across families, places, and traditions. Curiosity helps you learn the person in front of you without reducing them to a label.\n\nAsk with care: Invite context instead of demanding an explanation. Questions about family, faith, pace, and expectations land better when they are offered without judgement.\n\nName your own context: Cultural understanding works both ways. Share what shaped you and which expectations are important, flexible, or still evolving.\n\nTakeaway: Let culture deepen the conversation without allowing assumptions to replace the individual.',
      'culture',
      'published',
      array['staging testers'],
      v_admin_profile_id,
      v_admin_user_id,
      timezone('utc', now()) - interval '1 minute',
      null
    ),
    (
      '91000000-0000-4000-8000-000000000003'::uuid,
      null,
      'A boundary is useful information',
      'A healthy connection can hear a boundary without turning it into punishment, pressure, or a test of affection.',
      E'Boundaries make room for trust because they reveal what helps each person feel respected and safe. The response to a boundary often tells you more than the perfect words used before it.\n\nWatch the response: Respect sounds like acknowledgement, a clarifying question, or a calm adjustment. Repeated pressure, guilt, ridicule, or retaliation are reasons to slow down and seek support.\n\nProtect your options: Keep first meetings public, maintain your own transport where possible, and tell someone you trust where you will be. Safety planning is not pessimism; it protects your freedom to connect.\n\nTakeaway: The right pace is one where your no, not yet, and I need time remain safe to say.',
      'safety',
      'published',
      array['staging testers'],
      v_admin_profile_id,
      v_admin_user_id,
      timezone('utc', now()) - interval '2 minutes',
      null
    ),
    (
      '91000000-0000-4000-8000-000000000004'::uuid,
      null,
      'Say the kind thing clearly',
      'Warmth and directness can coexist; clear communication protects both people from avoidable guessing.',
      E'Good communication is not a performance of perfect phrasing. It is the practice of making your meaning understandable while remaining open to what the other person actually heard.\n\nLead with the point: Say what you feel, what you need, or what has changed without hiding it inside hints. Specific language gives the other person something real to respond to.\n\nListen for understanding: Reflect back the meaning before defending your intention. Repair becomes possible when both people feel accurately heard.\n\nTakeaway: Clarity is kind when it respects the other person''s dignity and their right to make an informed choice.',
      'communication',
      'published',
      array['staging testers'],
      v_admin_profile_id,
      v_admin_user_id,
      timezone('utc', now()) - interval '3 minutes',
      null
    )
  on conflict (id) do update set
    circle_id = null,
    title = excluded.title,
    short_body = excluded.short_body,
    body = excluded.body,
    perspective = excluded.perspective,
    status = 'published',
    audience_tags = excluded.audience_tags,
    created_by_profile_id = excluded.created_by_profile_id,
    created_by_admin_id = excluded.created_by_admin_id,
    published_at = excluded.published_at,
    scheduled_for = null,
    updated_at = timezone('utc', now());
end;
$$;

commit;
