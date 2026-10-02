-- Cache exact-byte chat image moderation decisions for retry-safe v1.2 albums.
-- Receipts are service-only and never make staged media receiver-visible.

create table if not exists public.chat_image_moderation_receipts (
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  client_message_id text not null,
  attachment_id text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null,
  policy_version text not null,
  decision text not null check (decision in ('ALLOW', 'BLOCK', 'REVIEW')),
  categories text[] not null default '{}',
  risk_score numeric not null default 0 check (risk_score between 0 and 1),
  provider text not null,
  provider_model text not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '7 days',
  primary key (sender_user_id, client_message_id, attachment_id, sha256, mime_type, policy_version)
);

create index if not exists chat_image_moderation_receipts_expiry_idx
  on public.chat_image_moderation_receipts(expires_at);

alter table public.chat_image_moderation_receipts enable row level security;
revoke all on table public.chat_image_moderation_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_image_moderation_receipts to service_role;

create or replace function public.rpc_service_purge_expired_chat_image_moderation_receipts(
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  with expired as (
    select receipt.ctid
    from public.chat_image_moderation_receipts receipt
    where receipt.expires_at <= timezone('utc', now())
    order by receipt.expires_at
    limit greatest(1, least(coalesce(p_limit, 1000), 10000))
  )
  delete from public.chat_image_moderation_receipts receipt
  using expired
  where receipt.ctid = expired.ctid;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.rpc_service_purge_expired_chat_image_moderation_receipts(integer)
  from public, anon, authenticated;
grant execute on function public.rpc_service_purge_expired_chat_image_moderation_receipts(integer)
  to service_role;

comment on table public.chat_image_moderation_receipts is
  'Short-lived exact-byte decisions used to resume v1.2 album finalisation without rescanning approved siblings.';
