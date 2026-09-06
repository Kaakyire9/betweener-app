-- Provider latency is an operational failure, not evidence of member abuse.
-- The Edge Function now degrades only the supplemental private-chat OCR scan
-- after the independent multimodal harm scan succeeds. Close historical
-- timeout-only reviews and remove their review-attempt penalty. This migration
-- deliberately does not alter profile moderation state: profile restrictions
-- are owned by the separate profile Guard review workflow.

with remediated as (
  update public.content_moderation_events event_row
  set decision = 'ALLOW',
      status = 'AUTO_CLOSED',
      categories = array['provider_unavailable'],
      risk_score = coalesce((
        select max(value::numeric)
        from jsonb_each_text(coalesce(event_row.evidence_snapshot -> 'scores', '{}'::jsonb))
        where value ~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
      ), 0),
      reviewed_at = null,
      reviewed_by = null,
      review_outcome = null,
      review_notes = null
  where event_row.content_type = 'chat_image'
    and event_row.status = 'PENDING_REVIEW'
    and event_row.decision = 'REVIEW'
    and event_row.categories <@ array['provider_unavailable']::text[]
    and event_row.failure_reason in (
      'OPENAI_VISION_TIMEOUT',
      'OPENAI_VISION_INVALID_RESPONSE'
    )
  returning event_row.actor_user_id
), affected as (
  select distinct actor_user_id from remediated
)
update public.content_safety_actor_state actor_state
set review_attempts = coalesce((
      select count(*)::integer
      from public.content_moderation_events event_row
      where event_row.actor_user_id = actor_state.user_id
        and event_row.decision = 'REVIEW'
    ), 0),
    updated_at = timezone('utc', now())
where actor_state.user_id in (select actor_user_id from affected);

comment on function public.rpc_admin_resolve_content_moderation_event(uuid, text, text) is
  'Resolves content evidence only. Profile visibility is independently controlled by the profile Guard review workflow.';
