-- Migration: add current_country_code to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_country_code text;
