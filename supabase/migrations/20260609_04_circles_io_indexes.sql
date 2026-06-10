create index if not exists circle_members_profile_status_visible_circle_idx
  on public.circle_members (profile_id, status, is_visible, circle_id);

create index if not exists circle_members_circle_status_visible_joined_idx
  on public.circle_members (circle_id, status, is_visible, joined_at desc, profile_id);

create index if not exists circle_pulse_comments_item_status_created_id_desc_idx
  on public.circle_pulse_comments (pulse_item_id, status, created_at desc, id desc);
