import {
  buildViewOnceFinalizeMetadata,
  getViewOnceSizeError,
  type EncryptedViewOncePayload,
  type ViewOnceAttachmentKind,
} from './view-once-attachment.ts';

type ViewOnceEncryptionResult = EncryptedViewOncePayload & { cipherBytes: Uint8Array };

export type SendViewOnceAttachmentInput<TResult> = {
  kind: ViewOnceAttachmentKind;
  uri: string;
  fileName: string;
  contentType: string;
  receiverId: string;
  clientMessageId: string;
  attachmentId: string;
  replyToMessageId?: string | null;
  senderPublicKey: string;
  receiverPublicKey: string;
  imageLimitBytes: number;
  videoLimitBytes: number;
  getFileSize: (uri: string) => Promise<number>;
  readBytes: (uri: string) => Promise<Uint8Array>;
  encrypt: (input: { plainBytes: Uint8Array; receiverPublicKey: string }) => Promise<ViewOnceEncryptionResult>;
  upload: (input: {
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
    clientMessageId: string;
    attachmentId: string;
  }) => Promise<string>;
  finalize: (input: Record<string, unknown>) => Promise<TResult>;
};

/**
 * Executes the sensitive view-once attachment sequence. Platform concerns are
 * injected so this module remains deterministic and testable. Both plaintext
 * and ciphertext buffers are cleared regardless of success or failure.
 */
export const sendViewOnceAttachment = async <TResult>(
  input: SendViewOnceAttachmentInput<TResult>,
): Promise<{ result: TResult; encryptedPath: string; encryptedByteSize: number }> => {
  const byteSize = await input.getFileSize(input.uri);
  const sizeError = getViewOnceSizeError({
    kind: input.kind,
    byteSize,
    imageLimitBytes: input.imageLimitBytes,
    videoLimitBytes: input.videoLimitBytes,
  });
  if (sizeError) throw new Error(sizeError);

  const plainBytes = await input.readBytes(input.uri);
  let payload: ViewOnceEncryptionResult;
  try {
    payload = await input.encrypt({
      plainBytes,
      receiverPublicKey: input.receiverPublicKey,
    });
  } finally {
    plainBytes.fill(0);
  }

  const encryptedByteSize = payload.cipherBytes.length;
  let encryptedPath: string;
  try {
    encryptedPath = await input.upload({
      bytes: payload.cipherBytes,
      fileName: `${input.fileName}.enc`,
      contentType: input.contentType,
      clientMessageId: input.clientMessageId,
      attachmentId: input.attachmentId,
    });
  } finally {
    payload.cipherBytes.fill(0);
  }

  const result = await input.finalize({
    receiverId: input.receiverId,
    clientMessageId: input.clientMessageId,
    attachmentId: input.attachmentId,
    attachmentType: input.kind,
    bucketId: 'chat-media',
    storagePath: encryptedPath,
    originalName: input.fileName,
    mimeType: input.contentType,
    byteSize: encryptedByteSize,
    replyToMessageId: input.replyToMessageId ?? null,
    ...buildViewOnceFinalizeMetadata({
      payload,
      senderPublicKey: input.senderPublicKey,
    }),
  });

  return { result, encryptedPath, encryptedByteSize };
};
