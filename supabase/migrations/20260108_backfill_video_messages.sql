-- Migration: backfill legacy video text messages to message_type=video
UPDATE public.messages
SET
  message_type = 'video',
  text = split_part(text, E'\n', 2)
WHERE message_type = 'text'
  AND text LIKE '🎥 Video%' 
  AND split_part(text, E'\n', 2) <> '';

-- Fallback for older label without emoji
UPDATE public.messages
SET
  message_type = 'video',
  text = split_part(text, E'\n', 2)
WHERE message_type = 'text'
  AND text LIKE 'Video%' 
  AND split_part(text, E'\n', 2) <> '';
