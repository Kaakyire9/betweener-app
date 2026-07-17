import { readOfflineData, removeOfflineEnvelope, updateOfflineEnvelope } from '@/lib/offline/core';

const SUPPORT_DRAFT_VERSION = 1;

export type SupportDraft = {
  topicId: string;
  subject: string;
  body: string;
  queued: boolean;
  updatedAt: string;
};

const buildSupportDraftKey = (userId: string | null) =>
  `offline:support-draft:v${SUPPORT_DRAFT_VERSION}:${userId || 'anonymous'}`;

export async function readSupportDraft(userId: string | null): Promise<SupportDraft | null> {
  return readOfflineData<SupportDraft>(buildSupportDraftKey(userId));
}

export async function writeSupportDraft(
  userId: string | null,
  draft: SupportDraft,
): Promise<SupportDraft | null> {
  return updateOfflineEnvelope<SupportDraft>(
    buildSupportDraftKey(userId),
    () => draft,
    { kind: 'support-draft' },
  );
}

export async function clearSupportDraft(userId: string | null): Promise<void> {
  await removeOfflineEnvelope(buildSupportDraftKey(userId));
}
