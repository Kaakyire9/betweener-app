-- Add a clean DB status for "superseded by match" intent rows.
--
-- Why:
-- - "passed" can feel like a rejection even when the real outcome is positive (a match).
-- - A dedicated status lets analytics + UI stay clear without overloading "accepted".
--
-- Semantics:
-- - matched: this intent is no longer actionable because the pair matched (chat is now primary).
-- - accepted: explicit accept of that specific request by the recipient.

ALTER TABLE public.intent_requests
  DROP CONSTRAINT IF EXISTS intent_requests_status_check;

ALTER TABLE public.intent_requests
  ADD CONSTRAINT intent_requests_status_check
  CHECK (status IN ('pending','accepted','passed','expired','cancelled','matched'));

-- Backfill: convert older auto-closed-by-match rows from passed -> matched.
UPDATE public.intent_requests
SET status = 'matched'
WHERE status = 'passed'
  AND (
    lower(coalesce(metadata->>'auto_closed_by', '')) = 'match'
    OR (metadata ? 'match_id')
  );

