export type DatePlanStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'countered';
export type DatePlanResponseKind = 'initial' | 'counter_time' | 'counter_place' | 'counter_both';

export type ChatMediaItem = {
  attachmentId: string;
  index: number;
  type: 'image' | 'video';
  storagePath: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
  durationMs?: number | null;
  localUri?: string;
  signedUrl?: string;
  previewStoragePath?: string | null;
  localPreviewUri?: string | null;
  previewSignedUrl?: string | null;
  transferState?:
    | 'queued'
    | 'preparing'
    | 'uploading'
    | 'uploaded'
    | 'retryable_failed'
    | 'terminal_failed'
    | 'cancelled';
  uploadProgress?: number | null;
  transferError?: string | null;
};

export type MessageType = {
  id: string;
  clientMessageId?: string | null;
  text: string;
  senderId: string;
  timestamp: Date;
  type: 'text' | 'voice' | 'image' | 'mood_sticker' | 'video' | 'document' | 'location' | 'date_plan' | 'system';
  isViewOnce?: boolean;
  encryptedMedia?: boolean;
  encryptedMediaPath?: string | null;
  encryptedKeySender?: string | null;
  encryptedKeyReceiver?: string | null;
  encryptedKeyNonce?: string | null;
  encryptedMediaNonce?: string | null;
  encryptedMediaAlg?: string | null;
  encryptedMediaMime?: string | null;
  encryptedMediaSize?: number | null;
  /** Stable private object reference. Renderers resolve this to a short-lived signed URL. */
  storagePath?: string | null;
  mediaItems?: ChatMediaItem[];
  mediaExpectedCount?: number | null;
  /** Stable identity for an ordered multi-item media send. */
  mediaGroupId?: string | null;
  /** Captions are message/album scoped. Per-item captions are intentionally unsupported. */
  mediaCaption?: string | null;
  reactions: { userId: string; emoji: string; }[];
  status?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  readAt?: Date;
  deletedForAll?: boolean;
  isSystem?: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  editedAt?: Date | null;
  sticker?: {
    emoji: string;
    color: string;
    name: string;
  };
  voiceMessage?: {
    duration: number;
    waveform: number[];
    isPlaying: boolean;
    audioPath?: string;
  };
  imageUrl?: string;
  videoUrl?: string;
  offlineImageUri?: string;
  offlineVideoUri?: string;
  previewStoragePath?: string | null;
  offlinePreviewUri?: string | null;
  previewUrl?: string | null;
  document?: {
    name: string;
    url: string;
    sizeLabel?: string | null;
    typeLabel?: string | null;
  };
  location?: {
    lat: number;
    lng: number;
    label: string;
    address?: string;
    mapUrl?: string;
    mapLink?: string;
    live?: boolean;
    expiresAt?: Date | null;
  };
  dateInvite?: {
    planId?: string | null;
    parentPlanId?: string | null;
    venueId?: string | null;
    scheduledFor: Date;
    placeName: string;
    placeAddress?: string;
    note?: string;
    source: 'betweener_pick' | 'nearby' | 'search' | 'preferred';
    badges?: string[];
    summary?: string | null;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
    mapUrl?: string | null;
    mapLink?: string | null;
    status?: DatePlanStatus;
    conciergeRequested?: boolean;
    responseKind?: DatePlanResponseKind;
  };
  replyToId?: string | null;
  replyTo?: MessageType;
};
