-- Productionize premium gifts with server-backed lifecycle and sender snapshots.

alter table public.profile_gifts
  add column if not exists sender_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists sender_display_name text not null default 'Someone',
  add column if not exists sender_avatar_url text,
  add column if not exists sender_gender text,
  add column if not exists opened_at timestamptz,
  add column if not exists revealed_at timestamptz,
  add column if not exists archived_at timestamptz;

create index if not exists idx_profile_gifts_profile_revealed_created
  on public.profile_gifts (profile_id, revealed_at, created_at desc);

create index if not exists idx_profile_gifts_sender_profile_created
  on public.profile_gifts (sender_id, profile_id, created_at desc);

update public.profile_gifts g
set sender_profile_id = coalesce(g.sender_profile_id, p.id),
    sender_display_name = coalesce(
      nullif(btrim(g.sender_display_name), ''),
      nullif(btrim(p.full_name), ''),
      nullif(btrim(p.username), ''),
      'Someone'
    ),
    sender_avatar_url = coalesce(g.sender_avatar_url, p.avatar_url),
    sender_gender = coalesce(g.sender_gender, p.gender::text)
from public.profiles p
where p.user_id = g.sender_id
  and p.deleted_at is null
  and (
    g.sender_profile_id is null
    or g.sender_display_name = 'Someone'
    or g.sender_avatar_url is null
    or g.sender_gender is null
  );

create or replace function public.notify_profile_gift_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  sender_name text;
  sender_avatar text;
  gift_label text;
begin
  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = (
      select recipient.user_id
      from public.profiles recipient
      where recipient.id = new.profile_id
      limit 1
    )
      and (p.push_enabled = false or p.gifts = false)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles recipient
    where recipient.id = new.profile_id
      and public.is_quiet_hours(recipient.user_id)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles recipient
    join public.blocks b
      on (b.blocker_id = recipient.user_id and b.blocked_id = new.sender_id)
      or (b.blocker_id = new.sender_id and b.blocked_id = recipient.user_id)
    where recipient.id = new.profile_id
  ) then
    return new;
  end if;

  sender_name := coalesce(nullif(new.sender_display_name, ''), 'New gift');
  sender_avatar := new.sender_avatar_url;
  gift_label := case new.gift_type
    when 'rose' then 'a rose'
    when 'teddy' then 'a teddy bear'
    when 'ring' then 'a ring'
    else 'a gift'
  end;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', (
        select recipient.user_id
        from public.profiles recipient
        where recipient.id = new.profile_id
        limit 1
      ),
      'title', sender_name,
      'body', sender_name || ' sent you ' || gift_label,
      'data', jsonb_build_object(
        'type', 'profile_gift',
        'gift_id', new.id,
        'gift_type', new.gift_type,
        'profile_id', new.sender_profile_id,
        'name', sender_name,
        'avatar_url', sender_avatar
      )
    )
  );
  return new;
end;
$$;

create or replace function public.rpc_send_profile_gift(
  p_recipient_profile_id uuid,
  p_gift_type text,
  p_include_sandbox_preview boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_sender_profile public.profiles%rowtype;
  v_recipient_profile public.profiles%rowtype;
  v_resolved_plan public.subscription_type := 'FREE';
  v_gift_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_gift_type not in ('rose', 'teddy', 'ring') then
    raise exception 'invalid gift type' using errcode = '22023';
  end if;

  select p.*
    into v_sender_profile
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if v_sender_profile.id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  select p.*
    into v_recipient_profile
  from public.profiles p
  where p.id = p_recipient_profile_id
    and p.deleted_at is null
  limit 1;

  if v_recipient_profile.id is null then
    raise exception 'recipient profile not found' using errcode = 'P0002';
  end if;

  if v_recipient_profile.user_id = auth.uid() then
    raise exception 'cannot send gift to yourself' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.profile_gifts g
    where g.profile_id = v_recipient_profile.id
      and g.sender_id = auth.uid()
      and g.created_at >= timezone('utc'::text, now()) - interval '6 hours'
  ) then
    raise exception 'gift cooldown active' using errcode = '23514';
  end if;

  v_resolved_plan := public.get_subscription_badge_plan(
    auth.uid(),
    coalesce(p_include_sandbox_preview, false)
  );

  if p_gift_type in ('rose', 'teddy') and v_resolved_plan not in ('SILVER', 'GOLD') then
    raise exception 'premium subscription required' using errcode = '42501';
  end if;

  if p_gift_type = 'ring' and v_resolved_plan <> 'GOLD' then
    raise exception 'gold subscription required' using errcode = '42501';
  end if;

  insert into public.profile_gifts (
    profile_id,
    sender_id,
    sender_profile_id,
    sender_display_name,
    sender_avatar_url,
    sender_gender,
    gift_type
  )
  values (
    v_recipient_profile.id,
    auth.uid(),
    v_sender_profile.id,
    coalesce(
      nullif(btrim(v_sender_profile.full_name), ''),
      nullif(btrim(v_sender_profile.username), ''),
      'Someone'
    ),
    v_sender_profile.avatar_url,
    v_sender_profile.gender::text,
    p_gift_type
  )
  returning id into v_gift_id;

  return jsonb_build_object(
    'gift_id', v_gift_id,
    'gift_type', p_gift_type,
    'recipient_profile_id', v_recipient_profile.id,
    'plan', v_resolved_plan
  );
end;
$$;

create or replace function public.rpc_reveal_profile_gift(
  p_gift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.profile_gifts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.profile_gifts g
  set opened_at = coalesce(g.opened_at, timezone('utc'::text, now())),
      revealed_at = coalesce(g.revealed_at, timezone('utc'::text, now()))
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  returning g.* into v_row;

  if v_row.id is null then
    raise exception 'gift not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'gift_id', v_row.id,
    'opened_at', v_row.opened_at,
    'revealed_at', v_row.revealed_at,
    'archived_at', v_row.archived_at
  );
end;
$$;

revoke all on function public.rpc_send_profile_gift(uuid, text, boolean) from public;
grant execute on function public.rpc_send_profile_gift(uuid, text, boolean) to authenticated;

revoke all on function public.rpc_reveal_profile_gift(uuid) from public;
grant execute on function public.rpc_reveal_profile_gift(uuid) to authenticated;
