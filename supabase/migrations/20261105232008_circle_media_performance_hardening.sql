begin;

create index if not exists circle_media_assets_uploader_profile_idx
  on public.circle_media_assets(uploader_profile_id)
  where uploader_profile_id is not null;

create index if not exists circle_media_assets_rights_attested_by_idx
  on public.circle_media_assets(rights_attested_by_user_id)
  where rights_attested_by_user_id is not null;

create index if not exists circle_media_assets_reviewed_by_idx
  on public.circle_media_assets(reviewed_by_user_id)
  where reviewed_by_user_id is not null;

create index if not exists circle_media_cleanup_queue_asset_idx
  on public.circle_media_cleanup_queue(asset_id)
  where asset_id is not null;

create index if not exists circle_media_daily_analytics_circle_idx
  on public.circle_media_daily_analytics(circle_id);

create index if not exists circle_media_reactions_circle_idx
  on public.circle_media_reactions(circle_id);

create index if not exists circle_media_reactions_profile_idx
  on public.circle_media_reactions(profile_id);

create index if not exists circle_media_saved_items_circle_idx
  on public.circle_media_saved_items(circle_id);

create index if not exists circle_media_saved_items_pulse_item_idx
  on public.circle_media_saved_items(pulse_item_id);

create index if not exists circle_media_subject_approvals_circle_idx
  on public.circle_media_subject_approvals(circle_id);

create index if not exists circle_media_submissions_submitted_by_idx
  on public.circle_media_submissions(submitted_by_profile_id)
  where submitted_by_profile_id is not null;

create index if not exists circle_media_submissions_reviewed_by_idx
  on public.circle_media_submissions(reviewed_by_profile_id)
  where reviewed_by_profile_id is not null;

commit;
