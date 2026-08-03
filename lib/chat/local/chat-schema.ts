export const CHAT_DB_NAME = 'betweener_chat.db';
export const CHAT_SCHEMA_VERSION = 8;

export type ChatThreadLocalStatus = 'active' | 'hidden' | 'deleted';
export type ChatThreadType = 'direct';
export type ChatMessageDirection = 'incoming' | 'outgoing';
export type ChatMessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
export type ChatMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'location'
  | 'date_plan'
  | 'mood_sticker'
  | 'system';
export type ChatMediaUploadStatus = 'none' | 'pending' | 'uploading' | 'uploaded' | 'failed';
export type ChatOutboxStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type ChatSyncScope = 'global_threads' | 'thread_messages' | 'realtime';

export type ChatThreadRow = {
  id: string;
  owner_user_id: string;
  peer_user_id: string | null;
  peer_profile_id: string | null;
  peer_name: string | null;
  peer_avatar_url: string | null;
  peer_verified: number;
  peer_presence_status: string | null;
  peer_last_active: string | null;
  title: string | null;
  thread_type: ChatThreadType;
  last_message_id: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  last_message_status: ChatMessageStatus | null;
  last_message_edited_at: string | null;
  last_message_reaction_emoji: string | null;
  last_message_reaction_user_id: string | null;
  last_message_reaction_created_at: string | null;
  last_message_reaction_target_type: ChatMessageType | null;
  last_activity_kind: 'edit' | 'reaction' | null;
  last_activity_message_id: string | null;
  last_activity_preview: string | null;
  last_activity_at: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_muted: number;
  is_pinned: number;
  is_archived: number;
  local_status: ChatThreadLocalStatus;
  remote_updated_at: string | null;
  local_updated_at: string;
  created_at: string | null;
};

export type ChatMessageRow = {
  id: string;
  local_id: string | null;
  thread_id: string;
  owner_user_id: string;
  sender_user_id: string;
  receiver_user_id: string | null;
  body: string | null;
  message_type: ChatMessageType;
  status: ChatMessageStatus;
  direction: ChatMessageDirection;
  created_at: string;
  server_created_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_message_id: string | null;
  is_view_once: number;
  local_only: number;
  error_code: string | null;
  metadata_json: string | null;
  remote_updated_at: string | null;
  local_updated_at: string;
};

export type ChatPendingOutboxRow = {
  id: string;
  local_message_id: string;
  thread_id: string;
  owner_user_id: string;
  payload_json: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  status: ChatOutboxStatus;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatSyncStateRow = {
  id: string;
  owner_user_id: string;
  scope: ChatSyncScope;
  thread_id: string | null;
  last_cursor: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  updated_at: string;
};

export type ChatViewOnceStatusRow = {
  owner_user_id: string;
  message_id: string;
  thread_id: string;
  viewed_by_me: number;
  viewed_by_peer: number;
  updated_at: string;
};

export const CHAT_SCHEMA_SQL = `
create table if not exists local_schema_meta (
  key text primary key,
  value text not null,
  updated_at text not null
);

create table if not exists chat_threads (
  id text not null,
  owner_user_id text not null,
  peer_user_id text null,
  peer_profile_id text null,
  peer_name text null,
  peer_avatar_url text null,
  peer_verified integer not null default 0,
  peer_presence_status text null,
  peer_last_active text null,
  title text null,
  thread_type text not null default 'direct',
  last_message_id text null,
  last_message_preview text null,
  last_message_sender_id text null,
  last_message_status text null,
  last_message_edited_at text null,
  last_message_reaction_emoji text null,
  last_message_reaction_user_id text null,
  last_message_reaction_created_at text null,
  last_message_reaction_target_type text null,
  last_activity_kind text null,
  last_activity_message_id text null,
  last_activity_preview text null,
  last_activity_at text null,
  last_message_at text null,
  unread_count integer not null default 0,
  is_muted integer not null default 0,
  is_pinned integer not null default 0,
  is_archived integer not null default 0,
  local_status text not null default 'active',
  remote_updated_at text null,
  local_updated_at text not null,
  created_at text null,
  primary key(owner_user_id, id)
);

create table if not exists chat_participants (
  id text primary key,
  thread_id text not null,
  owner_user_id text not null,
  user_id text not null,
  profile_id text null,
  display_name text null,
  avatar_url text null,
  role text not null default 'member',
  joined_at text null,
  updated_at text null,
  unique(thread_id, user_id, owner_user_id)
);

create table if not exists chat_messages (
  id text not null,
  local_id text null,
  thread_id text not null,
  owner_user_id text not null,
  sender_user_id text not null,
  receiver_user_id text null,
  body text null,
  message_type text not null default 'text',
  status text not null default 'sent',
  direction text not null,
  created_at text not null,
  server_created_at text null,
  edited_at text null,
  deleted_at text null,
  reply_to_message_id text null,
  is_view_once integer not null default 0,
  local_only integer not null default 0,
  error_code text null,
  metadata_json text null,
  remote_updated_at text null,
  local_updated_at text not null,
  primary key(owner_user_id, id)
);

create table if not exists chat_message_media (
  id text primary key,
  message_id text not null,
  thread_id text not null,
  owner_user_id text not null,
  media_type text not null,
  local_uri text null,
  remote_url text null,
  storage_path text null,
  mime_type text null,
  width integer null,
  height integer null,
  duration_ms integer null,
  size_bytes integer null,
  upload_status text not null default 'none',
  created_at text not null,
  updated_at text not null
);

create table if not exists chat_read_states (
  id text primary key,
  thread_id text not null,
  owner_user_id text not null,
  user_id text not null,
  last_read_message_id text null,
  last_read_at text null,
  unread_count integer not null default 0,
  updated_at text not null,
  unique(thread_id, user_id, owner_user_id)
);

create table if not exists chat_pending_outbox (
  id text primary key,
  local_message_id text not null,
  thread_id text not null,
  owner_user_id text not null,
  payload_json text not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at text null,
  status text not null default 'queued',
  error_code text null,
  error_message text null,
  created_at text not null,
  updated_at text not null
);

create table if not exists chat_sync_state (
  id text primary key,
  owner_user_id text not null,
  scope text not null,
  thread_id text null,
  last_cursor text null,
  last_synced_at text null,
  last_error text null,
  updated_at text not null,
  unique(owner_user_id, scope, thread_id)
);

create table if not exists chat_view_once_status (
  owner_user_id text not null,
  message_id text not null,
  thread_id text not null,
  viewed_by_me integer not null default 0,
  viewed_by_peer integer not null default 0,
  updated_at text not null,
  primary key(owner_user_id, message_id)
);

create index if not exists idx_chat_threads_owner on chat_threads(owner_user_id);
create index if not exists idx_chat_threads_last_message on chat_threads(owner_user_id, is_pinned desc, last_message_at desc);
create index if not exists idx_chat_threads_unread on chat_threads(owner_user_id, unread_count);
create index if not exists idx_chat_threads_peer_profile on chat_threads(owner_user_id, peer_profile_id);
create index if not exists idx_chat_threads_archived on chat_threads(owner_user_id, is_archived);
create index if not exists idx_chat_threads_pinned on chat_threads(owner_user_id, is_pinned);
create index if not exists idx_chat_threads_active_list
  on chat_threads(
    owner_user_id,
    local_status,
    is_pinned desc,
    coalesce(last_message_at, created_at, local_updated_at) desc
  );
create index if not exists idx_chat_threads_active_archived_list
  on chat_threads(
    owner_user_id,
    local_status,
    is_archived,
    is_pinned desc,
    coalesce(last_message_at, created_at, local_updated_at) desc
  );

create index if not exists idx_chat_participants_thread on chat_participants(thread_id);
create index if not exists idx_chat_participants_owner on chat_participants(owner_user_id);
create index if not exists idx_chat_participants_user on chat_participants(user_id);
create index if not exists idx_chat_participants_profile on chat_participants(profile_id);

create index if not exists idx_chat_messages_thread_created on chat_messages(owner_user_id, thread_id, created_at desc);
create index if not exists idx_chat_messages_thread_incoming_created
  on chat_messages(owner_user_id, thread_id, direction, created_at desc, local_updated_at desc);
create index if not exists idx_chat_messages_owner on chat_messages(owner_user_id);
create index if not exists idx_chat_messages_status on chat_messages(owner_user_id, status);
create index if not exists idx_chat_messages_sender on chat_messages(sender_user_id);
create index if not exists idx_chat_messages_server_created on chat_messages(server_created_at);
create index if not exists idx_chat_messages_local_id on chat_messages(local_id);
create index if not exists idx_chat_messages_reply_to on chat_messages(reply_to_message_id);

create index if not exists idx_chat_message_media_message on chat_message_media(message_id);
create index if not exists idx_chat_message_media_thread on chat_message_media(thread_id);
create index if not exists idx_chat_message_media_upload on chat_message_media(upload_status);

create index if not exists idx_chat_pending_outbox_owner on chat_pending_outbox(owner_user_id);
create index if not exists idx_chat_pending_outbox_status on chat_pending_outbox(status);
create index if not exists idx_chat_pending_outbox_retry on chat_pending_outbox(next_retry_at);
create index if not exists idx_chat_pending_outbox_thread on chat_pending_outbox(thread_id);
create index if not exists idx_chat_pending_outbox_owner_local_message
  on chat_pending_outbox(owner_user_id, local_message_id);
create index if not exists idx_chat_pending_outbox_queued_due
  on chat_pending_outbox(owner_user_id, next_retry_at, created_at)
  where status = 'queued';
create index if not exists idx_chat_pending_outbox_sending_due
  on chat_pending_outbox(owner_user_id, updated_at, next_retry_at, created_at)
  where status = 'sending';
create index if not exists idx_chat_sync_state_owner_scope_thread
  on chat_sync_state(owner_user_id, scope, thread_id);
create index if not exists idx_chat_view_once_status_thread
  on chat_view_once_status(owner_user_id, thread_id);
`;
