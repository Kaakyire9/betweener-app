import { getSafeAttachmentExtension } from '@/lib/chat/attachment-lifecycle';
import { ChatUploadTransport } from '@/lib/chat/transfer/chat-upload-transport';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/supabase/types/database';

const MODERATION_BUCKET = 'view-once-moderation';

type CanonicalMessage = Database['public']['Tables']['messages']['Row'];

export const buildViewOnceModerationPath = (input: {
  senderId: string;
  receiverId: string;
  clientMessageId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
}) => {
  const extension = getSafeAttachmentExtension(input.fileName, input.contentType);
  return `${input.senderId}/${input.receiverId}/${input.clientMessageId}/${input.attachmentId}-plaintext.${extension}`;
};

const extractInvokeErrorCode = async (error: unknown) => {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.clone === 'function') {
    try {
      const detail = await context.clone().json() as { error?: string };
      return detail.error ?? null;
    } catch {}
  }
  return null;
};

export const moderateEncryptAndSendViewOnceImage = async (input: {
  senderId: string;
  receiverId: string;
  clientMessageId: string;
  attachmentId: string;
  localUri: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  replyToMessageId?: string | null;
}): Promise<CanonicalMessage> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!accessToken || !supabaseUrl || !anonKey) throw new Error('view_once_auth_required');

  const contentType = input.contentType.toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : input.contentType;
  const stagingPath = buildViewOnceModerationPath({ ...input, contentType });
  await ChatUploadTransport.upload({
    bucket: MODERATION_BUCKET,
    objectPath: stagingPath,
    localUri: input.localUri,
    fileName: input.fileName,
    contentType,
    byteSize: input.byteSize,
    accessToken,
    anonKey,
    supabaseUrl,
    ownerUserId: input.senderId,
    upsert: true,
  });

  const { data, error } = await supabase.functions.invoke('chat-attachment-finalize', {
    body: {
      mode: 'finalize_view_once_plaintext',
      receiverId: input.receiverId,
      clientMessageId: input.clientMessageId,
      attachmentId: input.attachmentId,
      attachmentType: 'image',
      stagingBucket: MODERATION_BUCKET,
      stagingPath,
      originalName: input.fileName,
      mimeType: contentType,
      byteSize: input.byteSize,
      replyToMessageId: input.replyToMessageId ?? null,
    },
  });
  if (error) {
    const code = await extractInvokeErrorCode(error) ?? error.message ?? 'view_once_moderation_failed';
    const moderationError = new Error(code);
    (moderationError as Error & { code?: string }).code = code;
    throw moderationError;
  }
  const message = (data as { message?: CanonicalMessage } | null)?.message;
  if (!message) throw new Error('view_once_finalize_missing_message');
  return message;
};
