import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_MEDIA_DOWNLOAD_POLICY_KEY = 'chat:media-download-policy:v1';

export type ChatDownloadMode = 'always' | 'wifi' | 'manual';
export type ChatDownloadMediaKind = 'photo' | 'video' | 'audio' | 'document';
export type ChatNetworkClass = 'offline' | 'wifi' | 'cellular' | 'unknown';

export type ChatMediaDownloadPolicy = Record<ChatDownloadMediaKind, ChatDownloadMode>;

export const DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY: ChatMediaDownloadPolicy = {
  photo: 'always',
  audio: 'always',
  video: 'wifi',
  document: 'manual',
};

const isDownloadMode = (value: unknown): value is ChatDownloadMode =>
  value === 'always' || value === 'wifi' || value === 'manual';

export const normalizeChatMediaDownloadPolicy = (
  value: unknown,
): ChatMediaDownloadPolicy => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY };
  }
  const candidate = value as Partial<Record<ChatDownloadMediaKind, unknown>>;
  return {
    photo: isDownloadMode(candidate.photo)
      ? candidate.photo
      : DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY.photo,
    video: isDownloadMode(candidate.video)
      ? candidate.video
      : DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY.video,
    audio: isDownloadMode(candidate.audio)
      ? candidate.audio
      : DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY.audio,
    document: isDownloadMode(candidate.document)
      ? candidate.document
      : DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY.document,
  };
};

export const shouldAutoDownloadChatMedia = ({
  kind,
  network,
  policy,
}: {
  kind: ChatDownloadMediaKind;
  network: ChatNetworkClass;
  policy: ChatMediaDownloadPolicy;
}) => {
  if (network === 'offline' || network === 'unknown') return false;
  const mode = policy[kind];
  if (mode === 'manual') return false;
  if (mode === 'wifi') return network === 'wifi';
  return true;
};

export const getChatMediaDownloadPolicy = async (): Promise<ChatMediaDownloadPolicy> => {
  try {
    const raw = await AsyncStorage.getItem(CHAT_MEDIA_DOWNLOAD_POLICY_KEY);
    return normalizeChatMediaDownloadPolicy(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY };
  }
};

export const setChatMediaDownloadPolicy = async (
  policy: ChatMediaDownloadPolicy,
) => {
  const normalized = normalizeChatMediaDownloadPolicy(policy);
  await AsyncStorage.setItem(CHAT_MEDIA_DOWNLOAD_POLICY_KEY, JSON.stringify(normalized));
  return normalized;
};
