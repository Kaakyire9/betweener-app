-- Migration: enable realtime for blocks
ALTER TABLE public.blocks REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'blocks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.blocks;
  END IF;
END $$;
