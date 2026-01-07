-- Voice messages schema additions
-- Allow message types and audio metadata
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS audio_path text,
  ADD COLUMN IF NOT EXISTS audio_duration numeric,
  ADD COLUMN IF NOT EXISTS audio_waveform jsonb;

ALTER TABLE messages
  ADD CONSTRAINT message_type_valid
  CHECK (message_type IN ('text','voice','image','mood_sticker'));

ALTER TABLE messages
  ALTER COLUMN text SET DEFAULT '';

-- Fallback: insert directly into storage.buckets for environments without create_bucket helper
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, avif_autodetection)
VALUES ('voice-messages', 'voice-messages', false, NULL, NULL, false)
ON CONFLICT (id) DO NOTHING;

-- RLS: allow authenticated users to manage their audio objects
CREATE POLICY "voice messages read"
  ON storage.objects
  FOR SELECT USING (bucket_id = 'voice-messages' AND auth.role() = 'authenticated');

CREATE POLICY "voice messages upload"
  ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'voice-messages' AND auth.role() = 'authenticated');

CREATE POLICY "voice messages update"
  ON storage.objects
  FOR UPDATE USING (bucket_id = 'voice-messages' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'voice-messages' AND auth.role() = 'authenticated');

CREATE POLICY "voice messages delete"
  ON storage.objects
  FOR DELETE USING (bucket_id = 'voice-messages' AND auth.role() = 'authenticated');
