export type RemoteThreadMessageRow = {
  id: string;
  client_message_id?: string | null;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  delivered_at: string | null;
  message_type?: string | null;
  audio_path?: string | null;
  audio_duration?: number | null;
  audio_waveform?: number[] | string | null;
  deleted_for_all?: boolean | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  reply_to_message_id?: string | null;
  edited_at?: string | null;
  is_view_once?: boolean | null;
  encrypted_media?: boolean | null;
  encrypted_media_path?: string | null;
  encrypted_key_sender?: string | null;
  encrypted_key_receiver?: string | null;
  encrypted_key_nonce?: string | null;
  encrypted_media_nonce?: string | null;
  encrypted_media_alg?: string | null;
  encrypted_media_mime?: string | null;
  encrypted_media_size?: number | null;
  storage_path?: string | null;
};

export type RemoteSystemMessageRow = {
  id: string;
  user_id: string;
  peer_user_id: string;
  text: string;
  created_at: string;
  event_type?: string | null;
  intent_request_id?: string | null;
  metadata?: unknown;
};

export type ChatRealtimeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | string;

export type RemoteReactionRow = {
  id?: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

export type RemoteMessageViewRow = {
  message_id: string;
  viewer_id: string;
};
