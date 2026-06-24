-- Fix profile note/gift recipient policies and route gift sending through a secure RPC.

drop policy if exists "Profiles can view notes" on public.profile_notes;
create policy "Profiles can view notes" on public.profile_notes
for select
to authenticated
using (
  sender_id = auth.uid()
  or exists (
    select 1
    from public.profiles recipient
    where recipient.id = profile_notes.profile_id
      and recipient.user_id = auth.uid()
      and recipient.deleted_at is null
  )
);

drop policy if exists "Users can delete own notes" on public.profile_notes;
create policy "Users can delete own notes" on public.profile_notes
for delete
to authenticated
using (
  sender_id = auth.uid()
  or exists (
    select 1
    from public.profiles recipient
    where recipient.id = profile_notes.profile_id
      and recipient.user_id = auth.uid()
      and recipient.deleted_at is null
  )
);

drop policy if exists "Profiles can view gifts" on public.profile_gifts;
create policy "Profiles can view gifts" on public.profile_gifts
for select
to authenticated
using (
  sender_id = auth.uid()
  or exists (
    select 1
    from public.profiles recipient
    where recipient.id = profile_gifts.profile_id
      and recipient.user_id = auth.uid()
      and recipient.deleted_at is null
  )
);

drop policy if exists "Users can delete own gifts" on public.profile_gifts;
create policy "Users can delete own gifts" on public.profile_gifts
for delete
to authenticated
using (
  sender_id = auth.uid()
  or exists (
    select 1
    from public.profiles recipient
    where recipient.id = profile_gifts.profile_id
      and recipient.user_id = auth.uid()
      and recipient.deleted_at is null
  )
);

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
  v_sender_profile_id uuid;
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

  select p.id
    into v_sender_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if v_sender_profile_id is null then
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
    gift_type
  )
  values (
    v_recipient_profile.id,
    auth.uid(),
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

revoke all on function public.rpc_send_profile_gift(uuid, text, boolean) from public;
grant execute on function public.rpc_send_profile_gift(uuid, text, boolean) to authenticated;
