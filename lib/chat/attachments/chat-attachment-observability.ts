import { addBreadcrumb, captureException } from '@/lib/telemetry/sentry';

export type ChatAttachmentLifecycleStage =
  | 'queued'
  | 'upload_started'
  | 'upload_completed'
  | 'preview_completed'
  | 'finalize_started'
  | 'ready'
  | 'retry_scheduled'
  | 'cancelled'
  | 'cleanup_failed'
  | 'failed';

export const observeChatAttachmentLifecycle = (
  stage: ChatAttachmentLifecycleStage,
  context: {
    clientMessageId: string;
    attachmentId?: string | null;
    attachmentIndex?: number;
    attachmentCount?: number;
    mediaType?: string | null;
    attemptCount?: number;
  },
  error?: unknown,
) => {
  addBreadcrumb(`chat_attachment.${stage}`, context);
  if (error && (stage === 'failed' || stage === 'cleanup_failed')) {
    captureException(error, {
      tags: { area: 'chat_attachment_lifecycle', stage },
      ...context,
    });
  }
};
