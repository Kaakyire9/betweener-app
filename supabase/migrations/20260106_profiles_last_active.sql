-- Migration: add last_active to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active timestamptz;
