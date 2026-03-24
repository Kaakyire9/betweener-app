-- Auto-close pending intent_requests when a match is accepted.
--
-- Goals:
-- - If a mutual like creates a match, the mirrored `like_with_note` intent should flip out of "pending"
--   immediately (so users don't get stuck with "Request pending" guardrails).
-- - Any other pending requests between the pair should be closed to reduce inbox noise once chat is available.
--
-- Notes:
-- - matches.user1_id/user2_id are profiles.id.
-- - This trigger does NOT create system_messages; match push is enough for mutual-like flows.

CREATE OR REPLACE FUNCTION public.trg_close_intents_on_match_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- We close mirrored like intents as soon as a mutual swipe creates a match (often status = PENDING),
  -- and we close *other* request types as soon as a match exists (PENDING or ACCEPTED) to prevent stale
  -- pending requests blocking chat-first flows.
  IF NEW.status IS DISTINCT FROM 'PENDING' AND NEW.status IS DISTINCT FROM 'ACCEPTED' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Mark mirrored likes as accepted (premium: reciprocity auto-resolves the like card).
  UPDATE public.intent_requests ir
  SET status = 'accepted',
      metadata = ir.metadata || jsonb_build_object('auto_closed_by', 'match', 'match_id', NEW.id)
  WHERE ir.status = 'pending'
    AND ir.expires_at > now()
    AND ir.type = 'like_with_note'
    AND (
      (ir.actor_id = NEW.user1_id AND ir.recipient_id = NEW.user2_id)
      OR (ir.actor_id = NEW.user2_id AND ir.recipient_id = NEW.user1_id)
    );

  -- Close any other pending requests between them (they're now matched; chat is the primary channel).
  UPDATE public.intent_requests ir
  SET status = 'matched',
      metadata = ir.metadata || jsonb_build_object('auto_closed_by', 'match', 'match_id', NEW.id)
  WHERE ir.status = 'pending'
    AND ir.expires_at > now()
    AND ir.type <> 'like_with_note'
    AND (
      (ir.actor_id = NEW.user1_id AND ir.recipient_id = NEW.user2_id)
      OR (ir.actor_id = NEW.user2_id AND ir.recipient_id = NEW.user1_id)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS close_intents_on_match_accept ON public.matches;
CREATE TRIGGER close_intents_on_match_accept
AFTER INSERT OR UPDATE OF status ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.trg_close_intents_on_match_accept();
