-- Backfill sender gift snapshots to use username when full_name is missing.

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
    or g.sender_avatar_url is null
    or g.sender_gender is null
    or coalesce(nullif(btrim(g.sender_display_name), ''), 'Someone') = 'Someone'
  );
