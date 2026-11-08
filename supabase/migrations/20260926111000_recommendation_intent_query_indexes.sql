-- pg-delta: transaction=false
-- Online indexes for the highest-frequency recommendation and Intent paths.
-- Deliberately not wrapped in a transaction: CONCURRENTLY keeps production
-- writes available while each index is built.

create index concurrently if not exists vibes_events_viewer_learning_window_idx
  on public.vibes_events(viewer_profile_id, created_at desc)
  where event_type in (
    'profile_opened', 'full_profile_opened', 'intro_played', 'intro_completed',
    'profile_saved', 'pass', 'like', 'signal_sent', 'intent_sent', 'undo'
  );

create index concurrently if not exists vibes_v5_3_recommendations_resume_idx
  on public.vibes_v5_3_recommendations(
    viewer_profile_id, segment, shown_at desc, recommended_at desc
  )
  include (target_profile_id, id, outcome)
  where shown_at is not null;

create index concurrently if not exists intent_requests_actor_created_idx
  on public.intent_requests(actor_id, created_at desc);

create index concurrently if not exists intent_requests_recipient_created_idx
  on public.intent_requests(recipient_id, created_at desc);
