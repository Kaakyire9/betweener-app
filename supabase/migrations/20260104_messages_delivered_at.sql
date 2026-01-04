-- Migration: add delivered_at to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
