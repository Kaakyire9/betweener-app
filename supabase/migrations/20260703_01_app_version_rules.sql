create table if not exists public.app_version_rules (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  environment text not null default 'production',
  latest_version text not null,
  latest_build_number integer not null,
  minimum_supported_version text not null,
  minimum_supported_build_number integer not null,
  update_mode text not null default 'silent',
  -- silent-first policy:
  -- silent = default for almost every release
  -- soft = rare, meaningful, non-breaking launch messaging
  -- force = only for unsupported, unsafe, or incompatible builds
  update_title text,
  update_message text,
  whats_new_title text,
  whats_new_items jsonb not null default '[]'::jsonb,
  store_url text not null,
  enabled boolean not null default true,
  soft_prompt_cooldown_hours integer not null default 72,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint app_version_rules_platform_check
    check (platform in ('ios', 'android')),
  constraint app_version_rules_environment_check
    check (environment in ('production', 'staging', 'development')),
  constraint app_version_rules_update_mode_check
    check (update_mode in ('silent', 'soft', 'force'))
);

create unique index if not exists app_version_rules_platform_env_unique
on public.app_version_rules(platform, environment)
where enabled = true;

create table if not exists public.app_version_history (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  version text not null,
  build_number integer not null,
  release_type text not null default 'normal',
  title text,
  release_notes text,
  whats_new_items jsonb not null default '[]'::jsonb,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint app_version_history_platform_check
    check (platform in ('ios', 'android')),
  constraint app_version_history_release_type_check
    check (release_type in ('normal', 'major', 'critical', 'hotfix')),
  unique(platform, version, build_number)
);

alter table public.app_version_rules enable row level security;
alter table public.app_version_history enable row level security;

drop policy if exists "Anyone can read enabled app version rules" on public.app_version_rules;
create policy "Anyone can read enabled app version rules"
on public.app_version_rules
for select
to anon, authenticated
using (enabled = true);

drop trigger if exists app_version_rules_set_updated_at on public.app_version_rules;
create trigger app_version_rules_set_updated_at
before update on public.app_version_rules
for each row execute function public.set_updated_at();

drop function if exists public.rpc_get_app_version_rule(text, text);
create or replace function public.rpc_get_app_version_rule(
  p_platform text,
  p_environment text default 'production'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_rule public.app_version_rules%rowtype;
  v_platform text := lower(nullif(btrim(coalesce(p_platform, '')), ''));
  v_environment text := lower(nullif(btrim(coalesce(p_environment, '')), ''));
begin
  if v_platform not in ('ios', 'android') then
    return null;
  end if;

  if v_environment not in ('production', 'staging', 'development') then
    v_environment := 'production';
  end if;

  select *
    into v_rule
  from public.app_version_rules
  where enabled = true
    and platform = v_platform
    and environment = v_environment
  order by updated_at desc, created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'platform', v_rule.platform,
    'environment', v_rule.environment,
    'latestVersion', v_rule.latest_version,
    'latestBuildNumber', v_rule.latest_build_number,
    'minimumSupportedVersion', v_rule.minimum_supported_version,
    'minimumSupportedBuildNumber', v_rule.minimum_supported_build_number,
    'updateMode', v_rule.update_mode,
    'updateTitle', v_rule.update_title,
    'updateMessage', v_rule.update_message,
    'whatsNewTitle', v_rule.whats_new_title,
    'whatsNewItems', coalesce(v_rule.whats_new_items, '[]'::jsonb),
    'storeUrl', v_rule.store_url,
    'softPromptCooldownHours', v_rule.soft_prompt_cooldown_hours
  );
end;
$$;

insert into public.app_version_rules (
  platform,
  environment,
  latest_version,
  latest_build_number,
  minimum_supported_version,
  minimum_supported_build_number,
  update_mode,
  update_title,
  update_message,
  whats_new_title,
  whats_new_items,
  store_url,
  enabled
)
values
(
  'ios',
  'production',
  '1.1.0',
  38,
  '1.0.0',
  1,
  'silent',
  'A better Betweener is ready',
  'We''ve refined Vibes, Profile Studio and Chat.',
  'New in Betweener',
  '["Profile Studio feels lighter and more visual", "Vibes discovery is more refined", "Chat and navigation are smoother"]'::jsonb,
  'https://apps.apple.com/app/betweener/id6753134347',
  true
),
(
  'ios',
  'staging',
  '1.1.0',
  38,
  '1.1.0',
  38,
  'silent',
  'A better Betweener is ready',
  'We''ve refined Vibes, Profile Studio and Chat.',
  'New in Betweener',
  '["Profile Studio feels lighter and more visual", "Vibes discovery is more refined", "Chat and navigation are smoother"]'::jsonb,
  'https://apps.apple.com/app/betweener/id6753134347',
  true
),
(
  'android',
  'production',
  '1.1.0',
  1,
  '1.1.0',
  1,
  'silent',
  'A better Betweener is ready',
  'We''ve refined Vibes, Profile Studio and Chat.',
  'New in Betweener',
  '["Profile Studio feels lighter and more visual", "Vibes discovery is more refined", "Chat and navigation are smoother"]'::jsonb,
  'https://play.google.com/store/apps/details?id=com.aduboffour.betweener',
  true
),
(
  'android',
  'staging',
  '1.1.0',
  1,
  '1.1.0',
  1,
  'silent',
  'A better Betweener is ready',
  'We''ve refined Vibes, Profile Studio and Chat.',
  'New in Betweener',
  '["Profile Studio feels lighter and more visual", "Vibes discovery is more refined", "Chat and navigation are smoother"]'::jsonb,
  'https://play.google.com/store/apps/details?id=com.aduboffour.betweener',
  true
)
on conflict (platform, environment) where enabled = true
do update set
  latest_version = excluded.latest_version,
  latest_build_number = excluded.latest_build_number,
  minimum_supported_version = excluded.minimum_supported_version,
  minimum_supported_build_number = excluded.minimum_supported_build_number,
  update_mode = excluded.update_mode,
  update_title = excluded.update_title,
  update_message = excluded.update_message,
  whats_new_title = excluded.whats_new_title,
  whats_new_items = excluded.whats_new_items,
  store_url = excluded.store_url,
  soft_prompt_cooldown_hours = excluded.soft_prompt_cooldown_hours,
  enabled = excluded.enabled,
  updated_at = timezone('utc'::text, now());

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
  'ios',
  '1.1.0',
  38,
  'major',
  'New in Betweener',
  'Profile Studio feels lighter and more visual. Vibes discovery is more refined. Chat and navigation are smoother.',
  '["Profile Studio feels lighter and more visual", "Vibes discovery is more refined", "Chat and navigation are smoother"]'::jsonb,
  timezone('utc'::text, now())
),
(
  'android',
  '1.1.0',
  1,
  'major',
  'New in Betweener',
  'Profile Studio feels lighter and more visual. Vibes discovery is more refined. Chat and navigation are smoother.',
  '["Profile Studio feels lighter and more visual", "Vibes discovery is more refined", "Chat and navigation are smoother"]'::jsonb,
  timezone('utc'::text, now())
)
on conflict (platform, version, build_number)
do update set
  release_type = excluded.release_type,
  title = excluded.title,
  release_notes = excluded.release_notes,
  whats_new_items = excluded.whats_new_items,
  released_at = excluded.released_at;

revoke all on table public.app_version_rules from public, anon, authenticated;
grant select on table public.app_version_rules to anon, authenticated;

revoke all on function public.rpc_get_app_version_rule(text, text) from public;
grant execute on function public.rpc_get_app_version_rule(text, text) to anon, authenticated;
