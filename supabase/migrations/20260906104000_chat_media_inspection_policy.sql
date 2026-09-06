-- Explicit compatibility policy for attachment types without complete byte inspection.

create table if not exists public.content_guard_media_policies (
  attachment_type text primary key check (attachment_type in ('video', 'audio', 'document')),
  enabled boolean not null default true,
  enforcement_mode text not null check (enforcement_mode in ('REPORT_ONLY', 'ENFORCE')),
  inspection_strategy text not null,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.content_guard_media_policies enable row level security;
revoke all on table public.content_guard_media_policies from public, anon, authenticated;
grant select, insert, update, delete on table public.content_guard_media_policies to service_role;

insert into public.content_guard_media_policies(
  attachment_type, enabled, enforcement_mode, inspection_strategy
) values
  ('video', true, 'REPORT_ONLY', 'signature_caption_preview_only'),
  ('audio', true, 'REPORT_ONLY', 'signature_only_transcription_pending'),
  ('document', true, 'REPORT_ONLY', 'signature_extension_only_malware_and_extraction_pending')
on conflict (attachment_type) do nothing;

comment on table public.content_guard_media_policies is
  'Server-only rollout controls. ENFORCE rejects an attachment until its declared inspection strategy is implemented.';
