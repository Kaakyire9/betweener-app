-- Circles image path support

alter table public.circles
  add column if not exists image_path text,
  add column if not exists image_updated_at timestamptz;
