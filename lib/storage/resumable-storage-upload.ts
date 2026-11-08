import {
  ChatUploadTransport,
  type ChatUploadProgress,
} from '@/lib/chat/transfer/chat-upload-transport';

export type ResumableStorageUploadProgress = ChatUploadProgress;

export type ResumableStorageUploadRequest = {
  bucket: string;
  objectPath: string;
  localUri: string;
  fileName: string;
  contentType: string;
  byteSize?: number | null;
  accessToken: string;
  anonKey: string;
  supabaseUrl: string;
  ownerUserId: string;
  onProgress?: (progress: ResumableStorageUploadProgress) => void;
};

/**
 * Shared immutable TUS transport. Chat owns the battle-tested implementation;
 * this adapter keeps product services independent from chat-specific naming.
 */
export const ResumableStorageUpload = {
  upload(request: ResumableStorageUploadRequest) {
    return ChatUploadTransport.upload({ ...request, upsert: false });
  },
};
