import { getStickerMessagePreview, parseStickerPreview } from '@/lib/chat-sticker-preview';

export const DATE_PLAN_TEXT_PREFIX = 'date_plan::';
export const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';
export const VIDEO_TEXT_PREFIX = '\u{1F3A5} Video';

export type DatePlanPreviewMeta = {
  placeName: string;
  placeAddress: string | null;
  scheduledFor: Date | null;
  lat: number | null;
  lng: number | null;
};

const formatDatePlanWhen = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
};

export const parseDatePlanPreviewMeta = (text?: string | null): DatePlanPreviewMeta | null => {
  if (!text?.startsWith(DATE_PLAN_TEXT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(DATE_PLAN_TEXT_PREFIX.length));
    const rawPlaceName = typeof parsed?.placeName === 'string' ? parsed.placeName.trim() : '';
    const lat = typeof parsed?.lat === 'number' && Number.isFinite(parsed.lat) ? parsed.lat : null;
    const lng = typeof parsed?.lng === 'number' && Number.isFinite(parsed.lng) ? parsed.lng : null;
    const scheduledForRaw =
      typeof parsed?.scheduledFor === 'string' && parsed.scheduledFor.trim()
        ? parsed.scheduledFor
        : null;
    const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : null;
    return {
      placeName: rawPlaceName || 'a date',
      placeAddress:
        typeof parsed?.placeAddress === 'string' && parsed.placeAddress.trim()
          ? parsed.placeAddress.trim()
          : null,
      scheduledFor:
        scheduledFor && !Number.isNaN(scheduledFor.getTime())
          ? scheduledFor
          : null,
      lat,
      lng,
    };
  } catch {
    return null;
  }
};

export const getDatePlanPreviewText = (text?: string | null) => {
  const parsed = parseDatePlanPreviewMeta(text);
  if (!parsed) return null;
  const when = formatDatePlanWhen(parsed.scheduledFor?.toISOString());
  return when ? `Date suggestion: ${parsed.placeName} ${when}` : `Date suggestion: ${parsed.placeName}`;
};

const isRemoteMediaUrl = (value: string) => /^https?:\/\//i.test(value);

export const getChatMessagePreviewText = ({
  text,
  messageType,
  isViewOnce = false,
  status,
}: {
  text?: string | null;
  messageType?: string | null;
  isViewOnce?: boolean;
  status?: string | null;
}) => {
  const normalizedText = String(text || '').trim();
  const normalizedType = String(messageType || 'text');

  if (status === 'pending' || status === 'queued' || status === 'sending') {
    if (normalizedType === 'image') return 'Queued photo';
    if (normalizedType === 'video') return 'Queued video';
    if (normalizedType === 'document') return 'Queued document';
    if (normalizedType === 'voice' || normalizedType === 'audio') return 'Queued voice message';
    return 'Queued message';
  }

  if (normalizedType === 'mood_sticker') {
    return normalizedText ? `Sticker: ${getStickerMessagePreview(normalizedText)}` : 'Sticker';
  }

  const datePlanPreview = getDatePlanPreviewText(normalizedText);
  if (datePlanPreview) return datePlanPreview;

  if (normalizedText.startsWith(DOCUMENT_TEXT_PREFIX)) return 'Document';
  if (normalizedText.startsWith(`${VIDEO_TEXT_PREFIX}\n`) || normalizedText.startsWith('Video\n')) {
    return 'Video';
  }

  if (normalizedType === 'text') {
    const sticker = parseStickerPreview(normalizedText);
    if (sticker) {
      return `Sticker: ${getStickerMessagePreview(normalizedText)}`;
    }
  }

  if (isViewOnce && normalizedType === 'image') return 'View once photo';
  if (isViewOnce && normalizedType === 'video') return 'View once video';

  if (normalizedType === 'image') return 'Photo';
  if (normalizedType === 'video') return 'Video';
  if (normalizedType === 'document') return 'Document';
  if (normalizedType === 'voice' || normalizedType === 'audio') return 'Voice message';
  if (normalizedType === 'location') return 'Location';
  if (normalizedType === 'date_plan') return datePlanPreview || 'Date suggestion';

  if (
    isRemoteMediaUrl(normalizedText) &&
    (normalizedType === 'image' || normalizedType === 'video' || normalizedType === 'document')
  ) {
    if (normalizedType === 'video') return 'Video';
    if (normalizedType === 'document') return 'Document';
    return 'Photo';
  }

  return normalizedText;
};
