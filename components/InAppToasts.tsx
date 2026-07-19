import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { subscribeForegroundChatMessages, type ForegroundChatMessageEvent } from '@/lib/chat/chat-foreground-events';
import { upsertChatPref } from '@/lib/chat/chat-list-actions-service';
import { ChatOutboxService } from '@/lib/chat/outbox/chat-outbox-service';
import { getStickerReactionTarget, parseStickerPreview } from '@/lib/chat-sticker-preview';
import { getChatMessagePreviewText, getDatePlanPreviewText, parseDatePlanPreviewMeta } from '@/lib/message-preview';
import { getSafeRemoteImageUri, getUserFacingDisplayName } from '@/lib/profile/display-name';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { createVideoPlayer } from 'expo-video';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastKind =
  | 'message'
  | 'media'
  | 'message_reaction'
  | 'live_location'
  | 'date_plan'
  | 'moment'
  | 'system'
  | 'generic';

type ToastItem = {
  id: string;
  title: string;
  body: string;
  kind?: ToastKind;
  emoji?: string | null;
  avatarUrl?: string | null;
  profileId?: string | null;
  chatId?: string | null;
  peerUserId?: string | null;
  groupKey?: string | null;
  groupCount?: number;
  mediaThumbnailUrl?: string | null;
  mediaThumbnailKind?: 'image' | 'video' | 'document' | 'location' | 'date_plan' | null;
  mediaThumbnailLabel?: string | null;
  route?: string | null;
  routeParams?: Record<string, string>;
};

type ToastThumbnailSource = { uri: string } | unknown | null;

type NotificationPrefs = {
  inapp_enabled: boolean;
  preview_text: boolean;
  messages: boolean;
  message_reactions: boolean;
  profile_interest: boolean;
  reactions: boolean;
  circle_discussions: boolean;
  likes: boolean;
  superlikes: boolean;
  matches: boolean;
  moments: boolean;
  gifts: boolean;
  boosts: boolean;
  verification: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_tz: string | null;
};

type MessageToastRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string | null;
  message_type: string | null;
  is_view_once?: boolean | null;
};

const LOCATION_LIVE_PREFIX = 'LIVE:';
const LOCATION_TEXT_PREFIX = '\u{1F4CD}';
const GOOGLE_MAPS_NATIVE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_WEB_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY || GOOGLE_MAPS_NATIVE_API_KEY;
const GOOGLE_MAPS_MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID;

const TOAST_DURATION_MS = 4200;
const MOMENT_COMMENT_TOAST_DURATION_MS = 6800;
const MOMENT_COMMENT_REACTION_TOAST_DURATION_MS = 5600;
const MOMENT_REACTION_BURST_WINDOW_MS = 30000;
const MOMENT_POST_BURST_WINDOW_MS = 600000;
const videoThumbnailCache = new Map<string, ToastThumbnailSource>();
const videoThumbnailInflight = new Map<string, Promise<ToastThumbnailSource>>();

const isRemoteMediaUrl = (value: string | null | undefined) => /^https?:\/\//i.test(String(value || '').trim());
const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';

const parseDocumentPreviewLabel = (text: string | null | undefined) => {
  const normalized = String(text || '').trim();
  if (!normalized.startsWith(DOCUMENT_TEXT_PREFIX)) return null;
  const firstLine = normalized.split('\n')[0]?.trim() || '';
  const withoutPrefix = firstLine.replace(new RegExp(`^${DOCUMENT_TEXT_PREFIX}\\s*`), '');
  const [namePart] = withoutPrefix.split('|').map((part) => part.trim()).filter(Boolean);
  return namePart || 'Document';
};

const getDocumentPreviewBadge = (label: string | null | undefined) => {
  const normalized = String(label || '').trim();
  if (!normalized) return 'FILE';
  const ext = normalized.split('.').pop()?.trim().toUpperCase();
  if (!ext || ext === normalized.toUpperCase()) return 'FILE';
  return ext.slice(0, 4);
};

const buildMapsLink = (lat: number, lng: number) => `https://maps.google.com/?q=${lat},${lng}`;

const parseCoordsLine = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
};

const parseCoordsFromMapsUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/q=([-0-9.]+),([-0-9.]+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
};

const getStaticMapUrl = (lat: number, lng: number) => {
  if (!GOOGLE_MAPS_WEB_API_KEY) return null;
  const base = 'https://maps.googleapis.com/maps/api/staticmap';
  const center = `${lat},${lng}`;
  const marker = `color:0x0ea5a0|${center}`;
  const mapId = GOOGLE_MAPS_MAP_ID ? `&map_id=${encodeURIComponent(GOOGLE_MAPS_MAP_ID)}` : '';
  return `${base}?center=${center}&zoom=15&size=640x360&scale=2&markers=${encodeURIComponent(marker)}&key=${GOOGLE_MAPS_WEB_API_KEY}${mapId}`;
};

const parseLocationPreview = (text: string | null | undefined) => {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const first = lines[0] ?? '';
  const isLive = first.startsWith(LOCATION_LIVE_PREFIX);
  const isPinned = first.startsWith(LOCATION_TEXT_PREFIX);
  if (!isLive && !isPinned) return null;

  let label = '';
  let address = '';
  let coordsLine = '';
  let mapLink = '';

  if (isLive) {
    coordsLine = lines[1] ?? '';
    label = lines[2] ?? '';
    address = lines[3] ?? '';
    mapLink = lines.find((line) => line.includes('maps.google.com') || line.startsWith('http')) ?? '';
  } else {
    label = first.replace(LOCATION_TEXT_PREFIX, '').trim();
    coordsLine = lines[1] ?? '';
    mapLink = lines.find((line) => line.includes('maps.google.com') || line.startsWith('http')) ?? '';
    if (lines.length > 2 && lines[2] !== mapLink) {
      address = lines[2] ?? '';
    }
  }

  const coords = parseCoordsLine(coordsLine) ?? parseCoordsFromMapsUrl(mapLink);
  if (!coords) return null;
  return {
    label: label || address || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
    mapUrl: getStaticMapUrl(coords.lat, coords.lng),
    mapLink: mapLink || buildMapsLink(coords.lat, coords.lng),
    isLive,
  };
};

const parseMediaUrlFromMessage = (messageType: string, text: string) => {
  const firstLine = text.split('\n')[0]?.trim() || '';
  if (messageType === 'image' && isRemoteMediaUrl(firstLine)) return firstLine;
  if (messageType === 'video' && isRemoteMediaUrl(firstLine)) return firstLine;
  return null;
};

const resolveVideoThumbnailSource = async (videoUrl: string): Promise<ToastThumbnailSource> => {
  if (!videoUrl) return null;
  const cached = videoThumbnailCache.get(videoUrl);
  if (cached) return cached;
  const inflight = videoThumbnailInflight.get(videoUrl);
  if (inflight) return inflight;

  const promise = (async () => {
    let player: ReturnType<typeof createVideoPlayer> | null = null;
    try {
      player = createVideoPlayer({ uri: videoUrl });
      const thumbnails = await player.generateThumbnailsAsync([0.15], {
        maxWidth: 96,
        maxHeight: 96,
      });
      const thumbnail = thumbnails[0] ?? null;
      if (thumbnail) {
        videoThumbnailCache.set(videoUrl, thumbnail);
        return thumbnail;
      }
      return null;
    } catch {
      return null;
    } finally {
      videoThumbnailInflight.delete(videoUrl);
      const releasable = player as { release?: () => void; dispose?: () => void } | null;
      try {
        releasable?.release?.();
      } catch {}
      try {
        releasable?.dispose?.();
      } catch {}
    }
  })();

  videoThumbnailInflight.set(videoUrl, promise);
  return promise;
};

const getMessageToastKind = (row: MessageToastRow | null | undefined): ToastKind => {
  const messageType = String(row?.message_type || 'text');
  const text = String(row?.text || '');
  if (messageType === 'location' && text.startsWith(LOCATION_LIVE_PREFIX)) return 'live_location';
  if (messageType === 'location') return 'live_location';
  if (messageType === 'date_plan' || Boolean(getDatePlanPreviewText(text))) return 'date_plan';
  if (messageType === 'image' || messageType === 'video' || messageType === 'voice' || messageType === 'document') {
    return 'media';
  }
  return 'message';
};

const getMessageMediaThumbnail = (
  row: MessageToastRow | null | undefined,
): { url: string | null; kind: 'image' | 'video' | 'document' | 'location' | 'date_plan' | null; label: string | null } => {
  const messageType = String(row?.message_type || 'text');
  const text = String(row?.text || '').trim();
  const remoteMediaUrl = parseMediaUrlFromMessage(messageType, text);

  if (messageType === 'image' && remoteMediaUrl) {
    return { url: remoteMediaUrl, kind: 'image', label: null };
  }

  if (messageType === 'video') {
    return { url: remoteMediaUrl, kind: 'video', label: 'Video' };
  }

  if (messageType === 'document' || text.startsWith(DOCUMENT_TEXT_PREFIX)) {
    return { url: null, kind: 'document', label: parseDocumentPreviewLabel(text) };
  }

  if (messageType === 'location') {
    const locationPreview = parseLocationPreview(text);
    return {
      url: locationPreview?.mapUrl || null,
      kind: 'location',
      label: locationPreview?.label || (text.startsWith(LOCATION_LIVE_PREFIX) ? 'Live now' : 'Open map'),
    };
  }

  if (messageType === 'date_plan' || Boolean(getDatePlanPreviewText(text))) {
    const datePlanPreview = parseDatePlanPreviewMeta(text);
    const mapUrl =
      datePlanPreview?.lat != null && datePlanPreview?.lng != null
        ? getStaticMapUrl(datePlanPreview.lat, datePlanPreview.lng)
        : null;
    return {
      url: mapUrl,
      kind: 'date_plan',
      label: datePlanPreview?.placeName || 'Date plan',
    };
  }

  return { url: null, kind: null, label: null };
};

type ProfileLite = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  account_state?: string | null;
  deleted_at?: string | null;
  avatar_url: string | null;
};

type MatchCelebrationEvent = {
  id: string;
  match_id: string;
  recipient_user_id: string;
  recipient_profile_id: string;
  peer_user_id: string;
  peer_profile_id: string;
  seen_at: string | null;
  created_at: string;
};

type MomentReactionBurstActor = {
  key: string;
  name: string;
  avatarUrl: string | null;
  profileId: string | null;
  emoji: string | null;
};

type MomentReactionBurst = {
  actors: Map<string, MomentReactionBurstActor>;
};

type MomentCommentReactionBurstActor = {
  key: string;
  name: string;
  avatarUrl: string | null;
  profileId: string | null;
  reaction: string | null;
};

type MomentCommentReactionBurst = {
  actors: Map<string, MomentCommentReactionBurstActor>;
};

type MomentPostBurstActor = {
  key: string;
  name: string;
  avatarUrl: string | null;
  profileId: string | null;
  relationshipCue: string | null;
};

type MomentPostBurst = {
  actor: MomentPostBurstActor;
  momentCount: number;
  latestMomentId: string;
};

export default function InAppToasts() {
  const { user, profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const isChatThreadRoute = useMemo(() => /^\/chat\/[^/]+/.test(pathname ?? ''), [pathname]);
  const isMomentsRoute = useMemo(
    () => pathname?.startsWith('/moments') || pathname === '/my-moments',
    [pathname],
  );

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const recentToastKeysRef = useRef<Map<string, number>>(new Map());
  const toastGroupsRef = useRef<Map<string, { id: string; count: number }>>(new Map());
  const pausedToastIdsRef = useRef<Set<string>>(new Set());
  const timeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastToastAtRef = useRef<Record<string, number>>({});
  const shownMatchCelebrationRef = useRef<Set<string>>(new Set());
  const profileCacheRef = useRef<Map<string, ProfileLite>>(new Map());
  const momentRelationshipCueCacheRef = useRef<Map<string, string | null>>(new Map());
  const momentReactionBurstsRef = useRef<Record<string, MomentReactionBurst>>({});
  const momentReactionBurstTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const momentCommentReactionBurstsRef = useRef<Record<string, MomentCommentReactionBurst>>({});
  const momentCommentReactionBurstTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const momentPostBurstsRef = useRef<Record<string, MomentPostBurst>>({});
  const momentPostBurstTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const getProfileLite = useCallback(
    async (id: string, opts?: { preferUserId?: boolean }) => {
      if (!id) return null;
      const preferUserId = opts?.preferUserId === true;
      const key = `${preferUserId ? 'u' : 'p'}:${id}`;
      const cached = profileCacheRef.current.get(key);
      if (cached) return cached;

      const byUser = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,account_state,deleted_at,avatar_url')
          .eq('user_id', id)
          .maybeSingle();
        return (data as ProfileLite | null) ?? null;
      };

      const byProfile = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,account_state,deleted_at,avatar_url')
          .eq('id', id)
          .maybeSingle();
        return (data as ProfileLite | null) ?? null;
      };

      // Many entry points pass auth.users ids (messages/reactions); others pass profiles.id (swipes/matches/intents).
      const resolved = preferUserId ? (await byUser()) ?? (await byProfile()) : (await byProfile()) ?? (await byUser());
      if (resolved) profileCacheRef.current.set(key, resolved);
      return resolved;
    },
    [],
  );

  const scheduleToastDismiss = useCallback((toastId: string, groupKey?: string | null, delayMs = TOAST_DURATION_MS) => {
    if (timeouts.current[toastId]) {
      clearTimeout(timeouts.current[toastId]);
    }
    timeouts.current[toastId] = setTimeout(() => {
      if (pausedToastIdsRef.current.has(toastId)) {
        scheduleToastDismiss(toastId, groupKey, 1_200);
        return;
      }
      if (groupKey) {
        const activeGroup = toastGroupsRef.current.get(groupKey);
        if (activeGroup?.id === toastId) {
          toastGroupsRef.current.delete(groupKey);
        }
      }
      setToasts((prev) => prev.filter((item) => item.id !== toastId));
    }, delayMs);
  }, []);

  const pushToast = useCallback((toast: ToastItem, opts?: { replace?: boolean; durationMs?: number }) => {
    let nextToast = toast;
    let replace = opts?.replace === true;
    if (toast.groupKey) {
      const currentGroup = toastGroupsRef.current.get(toast.groupKey);
      if (currentGroup) {
        nextToast = {
          ...toast,
          id: currentGroup.id,
          groupCount: currentGroup.count + 1,
        };
        toastGroupsRef.current.set(toast.groupKey, {
          id: currentGroup.id,
          count: currentGroup.count + 1,
        });
        replace = true;
      } else {
        toastGroupsRef.current.set(toast.groupKey, {
          id: toast.id,
          count: toast.groupCount ?? 1,
        });
      }
    }
    const now = Date.now();
    const lastShownAt = lastToastAtRef.current[nextToast.id];
    if (!replace && lastShownAt && now - lastShownAt < TOAST_DURATION_MS) {
      return;
    }
    lastToastAtRef.current[nextToast.id] = now;
    setToasts((prev) => [nextToast, ...prev.filter((item) => item.id !== nextToast.id)].slice(0, 3));
    if (!replace) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    scheduleToastDismiss(nextToast.id, nextToast.groupKey ?? null, opts?.durationMs ?? TOAST_DURATION_MS);
  }, [scheduleToastDismiss]);

  const activeChatId = useMemo(() => {
    if (!pathname?.startsWith('/chat/')) return null;
    const parts = pathname.split('/').filter(Boolean);
    return parts[1] || null;
  }, [pathname]);

  const isActiveChatWith = useCallback(
    (otherId?: string | null) => Boolean(activeChatId && otherId && activeChatId === otherId),
    [activeChatId],
  );

  const shouldSuppressToast = useCallback((key: string, ttlMs = 8_000) => {
    const now = Date.now();
    const recent = recentToastKeysRef.current;
    for (const [entryKey, timestamp] of recent.entries()) {
      if (now - timestamp > ttlMs) {
        recent.delete(entryKey);
      }
    }
    const last = recent.get(key);
    if (last && now - last < ttlMs) {
      return true;
    }
    recent.set(key, now);
    return false;
  }, []);

  useEffect(() => {
    return () => {
      Object.values(timeouts.current).forEach((timeout) => clearTimeout(timeout));
      Object.values(momentReactionBurstTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
      Object.values(momentCommentReactionBurstTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
      Object.values(momentPostBurstTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const loadPrefs = async () => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select(
          'inapp_enabled,preview_text,messages,message_reactions,profile_interest,reactions,circle_discussions,likes,superlikes,matches,moments,gifts,boosts,verification,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_tz',
        )
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.log('[push] prefs fetch error', error);
        setPrefs(null);
        return;
      }
      if (data) {
        setPrefs({
          inapp_enabled: Boolean(data.inapp_enabled),
          preview_text: (data as any)?.preview_text !== false,
          messages: Boolean(data.messages),
          message_reactions: Boolean(data.message_reactions),
          profile_interest: (data as any)?.profile_interest !== false,
          reactions: Boolean(data.reactions),
          circle_discussions: (data as any)?.circle_discussions !== false,
          likes: Boolean(data.likes),
          superlikes: Boolean(data.superlikes),
          matches: Boolean(data.matches),
          moments: Boolean((data as any).moments),
          gifts: Boolean(data.gifts),
          boosts: Boolean(data.boosts),
          verification: Boolean((data as any).verification),
          quiet_hours_enabled: Boolean(data.quiet_hours_enabled),
          quiet_hours_start: data.quiet_hours_start ?? null,
          quiet_hours_end: data.quiet_hours_end ?? null,
          quiet_hours_tz: data.quiet_hours_tz ?? null,
        });
      } else {
        setPrefs(null);
      }
    };
    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`inapp_prefs:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notification_prefs', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          setPrefs({
            inapp_enabled: Boolean(row.inapp_enabled),
            preview_text: row.preview_text !== false,
            messages: Boolean(row.messages),
            message_reactions: Boolean(row.message_reactions),
            profile_interest: row.profile_interest !== false,
            reactions: Boolean(row.reactions),
            circle_discussions: row.circle_discussions !== false,
            likes: Boolean(row.likes),
            superlikes: Boolean(row.superlikes),
            matches: Boolean(row.matches),
            moments: Boolean(row.moments),
            gifts: Boolean(row.gifts),
            boosts: Boolean(row.boosts),
            verification: Boolean(row.verification),
            quiet_hours_enabled: Boolean(row.quiet_hours_enabled),
            quiet_hours_start: row.quiet_hours_start ?? null,
            quiet_hours_end: row.quiet_hours_end ?? null,
            quiet_hours_tz: row.quiet_hours_tz ?? null,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const isQuietHours = useMemo(() => {
    if (!prefs?.quiet_hours_enabled) return false;
    if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) return false;

    const toMinutes = (value: string) => {
      const [hour, minute] = value.split(':');
      const h = Number.parseInt(hour ?? '0', 10);
      const m = Number.parseInt(minute ?? '0', 10);
      if (Number.isNaN(h) || Number.isNaN(m)) return 0;
      return h * 60 + m;
    };

    const start = toMinutes(prefs.quiet_hours_start);
    const end = toMinutes(prefs.quiet_hours_end);
    if (start === end) return false;

    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();

    if (start < end) {
      return current >= start && current < end;
    }
    return current >= start || current < end;
  }, [prefs]);

  const canInAppNotify = useCallback(
    (kind: keyof Omit<NotificationPrefs, 'inapp_enabled'>) => {
      if (!prefs) return true;
      if (isQuietHours) return false;
      if (!prefs.inapp_enabled) return false;
      return prefs[kind] !== false;
    },
    [isQuietHours, prefs],
  );

  function intentRequestPreview(requestType?: string | null) {
    switch (requestType) {
      case 'connect':
        return 'Opened the door to a thoughtful conversation.';
      case 'date_request':
        return 'Would like to take this beyond the app.';
      case 'circle_intro':
        return 'Opened a warmer introduction to connect.';
      case 'like_with_note':
        return 'Liked you with a message.';
      default:
        return 'Opened a meaningful way to connect.';
    }
  }

  function intentReminderPreview(isLastChance: boolean, requestType?: string | null) {
    if (isLastChance) {
      return 'This opening is about to close. If you are curious, answer now.';
    }
    switch (requestType) {
      case 'date_request':
        return 'Would still like to take this beyond the app.';
      case 'like_with_note':
        return 'Sent a like with a message worth answering.';
      case 'circle_intro':
        return 'Opened a more personal way to connect.';
      case 'connect':
      default:
        return 'Left the door open for a thoughtful reply.';
    }
  }

  function swipePreview(action?: string | null) {
    return action === 'SUPERLIKE'
      ? 'Sent you a Signal.'
      : 'Noticed you and wanted you to know.';
  }

  function systemMessagePreview(row: any, peerName: string) {
    if (row?.event_type === 'admin_queue_item') {
      return {
        title: 'Admin queue',
        body: row?.text ?? 'A new admin item needs review.',
      };
    }
    if (row?.event_type === 'admin_report_reviewed') {
      return {
        title: 'Safety update',
        body: row?.text ?? 'Your report has been reviewed.',
      };
    }
    if (
      row?.event_type === 'date_plan_concierge_claimed' ||
      row?.event_type === 'date_plan_concierge_completed' ||
      row?.event_type === 'date_plan_concierge_cancelled'
    ) {
      return {
        title: 'Date concierge',
        body: row?.text ?? 'Your concierge request has been updated.',
      };
    }
    if (
      row?.event_type === 'account_recovery_reviewing' ||
      row?.event_type === 'account_recovery_resolved' ||
      row?.event_type === 'account_recovery_closed'
    ) {
      return {
        title: 'Account support',
        body: row?.text ?? 'Your account recovery request has been updated.',
      };
    }
    if (row?.event_type === 'request_accepted') {
      return {
        title: peerName,
        body: 'Reopened the door. Start with something warm and specific.',
      };
    }
    if (row?.event_type === 'date_plan_accepted') {
      return {
        title: peerName,
        body: 'Said yes to the date plan. Keep the energy warm and specific.',
      };
    }
    if (row?.event_type === 'date_plan_declined') {
      return {
        title: peerName,
        body: 'Passed on the date plan for now.',
      };
    }
    if (row?.event_type === 'date_plan_cancelled') {
      return {
        title: peerName,
        body: 'Closed the date plan for now.',
      };
    }
    if (row?.event_type === 'date_plan_concierge_requested') {
      return {
        title: peerName,
        body: 'Asked Betweener to help shape the details.',
      };
    }
    if (row?.event_type === 'request_expired') {
      return {
        title: 'A window closed',
        body:
          row?.text ||
          `That opening to ${peerName || 'them'} closed. If it still feels right, come back warmer and more specific.`,
      };
    }
    return {
      title: 'Betweener',
      body: row?.text ?? 'There is something worth checking.',
    };
  }

  function isOfficialSystemMessage(row: any) {
    const eventType = String(row?.event_type || '');
    return (
      eventType === 'admin_queue_item' ||
      eventType === 'admin_report_reviewed' ||
      eventType === 'date_plan_concierge_claimed' ||
      eventType === 'date_plan_concierge_completed' ||
      eventType === 'date_plan_concierge_cancelled' ||
      eventType === 'account_recovery_reviewing' ||
      eventType === 'account_recovery_resolved' ||
      eventType === 'account_recovery_closed'
    );
  }

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`inapp_system_messages:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          const officialSystemMessage = isOfficialSystemMessage(row);
          const notificationKind =
            row?.event_type === 'admin_queue_item' ||
            row?.event_type === 'admin_report_reviewed' ||
            String(row?.event_type || '').startsWith('account_recovery_')
              ? 'verification'
              : 'messages';
          if (!canInAppNotify(notificationKind)) return;
          // Mirror server behavior: only push to the requester; accepter gets in-app only.
          if (String(row?.metadata?.role || '') === 'accepter') return;
          if (
            row?.event_type === 'date_plan_concierge_requested' &&
            String(row?.metadata?.role || '') === 'requester'
          ) {
            return;
          }
          if (
            row?.event_type === 'date_plan_cancelled' &&
            typeof row?.text === 'string' &&
            row.text.trim().toLowerCase().startsWith('you ')
          ) {
            return;
          }
          void (async () => {
            const peerUserId =
              !officialSystemMessage && typeof row.peer_user_id === 'string' ? row.peer_user_id : null;
            const peer = peerUserId ? await getProfileLite(peerUserId, { preferUserId: true }) : null;
            const peerName = getUserFacingDisplayName(peer, 'They');
            const preview = systemMessagePreview(row, peerName);
            const requestType =
              typeof row?.metadata?.request_type === 'string' ? String(row.metadata.request_type) : '';

            pushToast({
              id: `system-${row.id}`,
              title: preview.title,
              body: preview.body,
              kind: officialSystemMessage ? 'system' : 'generic',
              emoji: officialSystemMessage ? 'B' : null,
              avatarUrl: officialSystemMessage ? null : peer?.avatar_url ?? null,
              profileId: officialSystemMessage ? null : peer?.id ?? null,
              chatId:
                officialSystemMessage
                  ? null
                  : row.event_type === 'request_accepted' ||
                      row.event_type === 'date_plan_accepted' ||
                      row.event_type === 'date_plan_declined' ||
                      row.event_type === 'date_plan_cancelled' ||
                      row.event_type === 'date_plan_concierge_requested'
                    ? peer?.id ?? null
                    : null,
              route:
                row.event_type === 'admin_queue_item'
                  ? '/admin'
                  : row.event_type === 'request_expired'
                    ? '/(tabs)/intent'
                    : null,
              routeParams:
                row.event_type === 'request_expired'
                  ? {
                      requestId: row.intent_request_id ? String(row.intent_request_id) : '',
                      type: requestType,
                    }
                  : undefined,
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, getProfileLite, pushToast, user?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`inapp_intent_requests:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'intent_requests', filter: `recipient_id=eq.${profile.id}` },
        async (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (!canInAppNotify('messages')) return;
          if (row.status !== 'pending') return;
          // Likes are notified via swipes (LIKE/SUPERLIKE) and mirrored into Intent; avoid duplicate toasts.
          if (row.type === 'like_with_note') return;

          let actorName: string | null = null;
          let actorAvatar: string | null = null;
            const { data } = await supabase
              .from('profiles')
              .select('full_name,account_state,deleted_at,avatar_url')
              .eq('id', row.actor_id)
              .maybeSingle();
            if (data) {
              actorName = getUserFacingDisplayName(data, 'Someone');
              actorAvatar = data.avatar_url ?? null;
            }

          pushToast({
            id: `intent-${row.id}`,
            title: (actorName ?? '').trim() || 'Someone',
            body: intentRequestPreview(row.type),
            avatarUrl: actorAvatar,
            profileId: row.actor_id,
            route: '/(tabs)/intent',
            routeParams: {
              requestId: String(row.id),
              type: row.type ? String(row.type) : '',
            },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, profile?.id, pushToast]);

  const messagePreview = useCallback((row: any, previewsAllowed: boolean) => {
    if (!previewsAllowed) return 'Sent you a message';
    return (
      getChatMessagePreviewText({
        text: row?.text,
        messageType: row?.message_type,
        isViewOnce: Boolean(row?.is_view_once),
      }) || 'New message'
    );
  }, []);

  const queueIncomingMessageToast = useCallback(
    (row: ForegroundChatMessageEvent | MessageToastRow) => {
      if (!user?.id) return;
      if (!row?.id || !row?.sender_id || row.sender_id === user.id) return;
      if (shouldSuppressToast(`message:${String(row.id)}`)) return;
      if (isChatThreadRoute) return;
      if (isActiveChatWith(row.sender_id)) return;
      if (!canInAppNotify('messages')) return;

      const previewAllowed = prefs?.preview_text !== false;
      const preview = messagePreview(row, previewAllowed);
      const kind = getMessageToastKind(row);
      const mediaThumbnail = getMessageMediaThumbnail(row);

      void (async () => {
        let name = 'New message';
        let avatarUrl: string | null = null;
        let senderProfileId: string | null = null;
        try {
          const p = await getProfileLite(String(row.sender_id), { preferUserId: true });
          name = getUserFacingDisplayName(p, 'New message');
          if (p?.avatar_url) avatarUrl = p.avatar_url;
          if (p?.id) senderProfileId = p.id;
        } catch {}

        pushToast({
          id: `msg-${row.id}`,
          title: name,
          body: preview,
          kind,
          avatarUrl,
          profileId: senderProfileId ?? null,
          chatId: senderProfileId ?? String(row.sender_id),
          peerUserId: String(row.sender_id),
          groupKey: `chat:${String(row.sender_id)}`,
          groupCount: 1,
          mediaThumbnailUrl: mediaThumbnail.url,
          mediaThumbnailKind: mediaThumbnail.kind,
          mediaThumbnailLabel: mediaThumbnail.label,
        });
      })();
    },
    [
      canInAppNotify,
      getProfileLite,
      isActiveChatWith,
      isChatThreadRoute,
      messagePreview,
      prefs?.preview_text,
      pushToast,
      shouldSuppressToast,
      user?.id,
    ],
  );

  const messageReactionPreview = useCallback((row: any, emoji: string | null | undefined, previewsAllowed: boolean) => {
    const reactionPrefix = emoji ? `reacted ${emoji}` : 'reacted';
    if (!previewsAllowed) return `${reactionPrefix} to your message`;

    const datePlanPreview = getDatePlanPreviewText(row?.text);
    if (datePlanPreview) return `${reactionPrefix} to your date suggestion`;
    if (row?.message_type === 'mood_sticker' || parseStickerPreview(row?.text)) {
      return `${reactionPrefix} to ${getStickerReactionTarget(row?.text, previewsAllowed)}`;
    }

    if (row?.message_type === 'text' && row?.text) {
      const snippet = String(row.text).replace(/\s+/g, ' ').trim().slice(0, 88);
      return snippet ? `${reactionPrefix} to "${snippet}"` : `${reactionPrefix} to your message`;
    }
    if (row?.message_type === 'image') return `${reactionPrefix} to your photo`;
    if (row?.message_type === 'video') return `${reactionPrefix} to your video`;
    if (row?.message_type === 'voice') return `${reactionPrefix} to your voice note`;
    if (row?.message_type === 'location') return `${reactionPrefix} to your location`;
    return `${reactionPrefix} to your message`;
  }, []);

  const muteToastConversation = useCallback(
    async (toast: ToastItem) => {
      if (!user?.id || !toast.peerUserId) return;
      const { data } = await supabase
        .from('chat_prefs')
        .select('pinned,muted')
        .eq('user_id', user.id)
        .eq('peer_id', toast.peerUserId)
        .maybeSingle();

      const { error } = await upsertChatPref(user.id, toast.peerUserId, {
        pinned: Boolean((data as { pinned?: boolean | null } | null)?.pinned),
        muted: true,
      });

      if (!error) {
        Haptics.selectionAsync().catch(() => undefined);
        if (toast.groupKey) {
          const activeGroup = toastGroupsRef.current.get(toast.groupKey);
          if (activeGroup?.id === toast.id) {
            toastGroupsRef.current.delete(toast.groupKey);
          }
        }
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }
    },
    [user?.id],
  );

  const quickReplyToToast = useCallback(
    async (toast: ToastItem, text: string) => {
      if (!user?.id || !toast.peerUserId) return false;
      const trimmed = text.trim();
      if (!trimmed) return false;

      try {
        await ChatOutboxService.queueTextMessage({
          ownerUserId: user.id,
          threadId: toast.peerUserId,
          text: trimmed,
          peerProfileId: toast.profileId ?? null,
          peerName: toast.title,
          peerAvatarUrl: toast.avatarUrl ?? null,
          flush: true,
        });

        if (toast.groupKey) {
          const activeGroup = toastGroupsRef.current.get(toast.groupKey);
          if (activeGroup?.id === toast.id) {
            toastGroupsRef.current.delete(toast.groupKey);
          }
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
        return true;
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        return false;
      }
    },
    [user?.id],
  );

  const setToastReplying = useCallback(
    (toastId: string, isReplying: boolean, groupKey?: string | null) => {
      if (isReplying) {
        pausedToastIdsRef.current.add(toastId);
        if (timeouts.current[toastId]) {
          clearTimeout(timeouts.current[toastId]);
          delete timeouts.current[toastId];
        }
        return;
      }

      pausedToastIdsRef.current.delete(toastId);
      const stillVisible = toasts.some((toast) => toast.id === toastId);
      if (!stillVisible) return;
      scheduleToastDismiss(toastId, groupKey ?? null, 2_400);
    },
    [scheduleToastDismiss, toasts],
  );

  const momentPostPreview = useCallback((row: any, previewsAllowed: boolean, relationshipCue?: string | null) => {
    const cueLead = (() => {
      if (relationshipCue === 'You matched') return 'Your match';
      if (relationshipCue === 'Door reopened') return 'A reopened connection';
      if (relationshipCue === 'Liked you') return 'Someone who liked you';
      if (relationshipCue === 'You liked each other') return 'Someone you both noticed';
      if (relationshipCue === 'You liked them') return 'Someone on your radar';
      if (relationshipCue === 'You reached out') return 'Someone you reached out to';
      if (relationshipCue === 'They reached out') return 'Someone who reached out';
      return null;
    })();

    if (!previewsAllowed) return cueLead ? `${cueLead} shared a new Moment` : 'Shared a new Moment';
    const textSnippet = String(row?.text_body || '').replace(/\s+/g, ' ').trim().slice(0, 88);
    const captionSnippet = String(row?.caption || '').replace(/\s+/g, ' ').trim().slice(0, 88);
    if (row?.type === 'text' && textSnippet) return cueLead ? `${cueLead} shared: "${textSnippet}"` : `Shared a new thought: "${textSnippet}"`;
    if (captionSnippet) return cueLead ? `${cueLead} shared: "${captionSnippet}"` : `Shared a new Moment: "${captionSnippet}"`;
    if (row?.type === 'video') return cueLead ? `${cueLead} shared a new video Moment` : 'Shared a new video Moment';
    if (row?.type === 'photo') return cueLead ? `${cueLead} shared a new photo Moment` : 'Shared a new photo Moment';
    return 'Shared a new Moment';
  }, []);

  const momentReactionPreview = useCallback((momentRow: any, emoji: string | null | undefined, previewsAllowed: boolean, relationshipCue?: string | null) => {
    const reactionPrefix = emoji ? `reacted ${emoji}` : 'reacted';
    const cueLead = (() => {
      if (relationshipCue === 'You matched') return 'Your match';
      if (relationshipCue === 'Door reopened') return 'A reopened connection';
      if (relationshipCue === 'Liked you') return 'Someone who liked you';
      if (relationshipCue === 'You liked each other') return 'Someone you both noticed';
      if (relationshipCue === 'You liked them') return 'Someone on your radar';
      if (relationshipCue === 'You reached out') return 'Someone you reached out to';
      if (relationshipCue === 'They reached out') return 'Someone who reached out';
      return null;
    })();
    if (!previewsAllowed) return cueLead ? `${cueLead} ${reactionPrefix} to your Moment` : `${reactionPrefix} to your Moment`;
    const textSnippet = String(momentRow?.text_body || '').replace(/\s+/g, ' ').trim().slice(0, 88);
    if (momentRow?.type === 'text' && textSnippet) {
      return cueLead ? `${cueLead} ${reactionPrefix} to "${textSnippet}"` : `${reactionPrefix} to "${textSnippet}"`;
    }
    return cueLead ? `${cueLead} ${reactionPrefix} to your Moment` : `${reactionPrefix} to your Moment`;
  }, []);

  const momentCommentPreview = useCallback((
    commentRow: any,
    previewsAllowed: boolean,
    relationshipCue?: string | null,
    recipientKind: 'moment_owner' | 'reply_target' = 'moment_owner',
  ) => {
    const cueLead = (() => {
      if (relationshipCue === 'You matched') return 'Your match';
      if (relationshipCue === 'Door reopened') return 'A reopened connection';
      if (relationshipCue === 'Liked you') return 'Someone who liked you';
      if (relationshipCue === 'You liked each other') return 'Someone you both noticed';
      if (relationshipCue === 'You liked them') return 'Someone on your radar';
      if (relationshipCue === 'You reached out') return 'Someone you reached out to';
      if (relationshipCue === 'They reached out') return 'Someone who reached out';
      return null;
    })();
    const baseVerb = recipientKind === 'reply_target' ? 'replied to your comment' : 'commented on your Moment';
    const snippetVerb = recipientKind === 'reply_target' ? 'replied' : 'commented';
    if (!previewsAllowed) return cueLead ? `${cueLead} ${baseVerb}` : baseVerb.charAt(0).toUpperCase() + baseVerb.slice(1);
    const snippet = String(commentRow?.body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return snippet
      ? `${cueLead ? `${cueLead} ${snippetVerb}` : snippetVerb.charAt(0).toUpperCase() + snippetVerb.slice(1)}: "${snippet}"`
      : cueLead
        ? `${cueLead} ${baseVerb}`
        : baseVerb.charAt(0).toUpperCase() + baseVerb.slice(1);
  }, []);

  const momentCommentReactionPreview = useCallback((
    reaction: string | null | undefined,
    previewsAllowed: boolean,
    relationshipCue?: string | null,
  ) => {
    const cueLead = (() => {
      if (relationshipCue === 'You matched') return 'Your match';
      if (relationshipCue === 'Door reopened') return 'A reopened connection';
      if (relationshipCue === 'Liked you') return 'Someone who liked you';
      if (relationshipCue === 'You liked each other') return 'Someone you both noticed';
      if (relationshipCue === 'You liked them') return 'Someone on your radar';
      if (relationshipCue === 'You reached out') return 'Someone you reached out to';
      if (relationshipCue === 'They reached out') return 'Someone who reached out';
      return null;
    })();
    const reactionEmoji = (() => {
      switch ((reaction || '').toLowerCase()) {
        case 'heart':
          return '❤️';
        case 'love':
          return '😍';
        case 'fire':
          return '🔥';
        case 'clap':
          return '👏';
        case 'laugh':
          return '😂';
        default:
          return null;
      }
    })();
    if (!previewsAllowed) return cueLead ? `${cueLead} reacted to your comment` : 'Reacted to your comment';
    const verb = reactionEmoji ? `reacted ${reactionEmoji}` : 'reacted';
    return cueLead ? `${cueLead} ${verb} to your comment` : `${verb.charAt(0).toUpperCase() + verb.slice(1)} to your comment`;
  }, []);

  const momentPostBurstPreview = useCallback((count: number, relationshipCue?: string | null) => {
    const cueLead = (() => {
      if (relationshipCue === 'You matched') return 'Your match';
      if (relationshipCue === 'Door reopened') return 'A reopened connection';
      if (relationshipCue === 'Liked you') return 'Someone who liked you';
      if (relationshipCue === 'You liked each other') return 'Someone you both noticed';
      if (relationshipCue === 'You liked them') return 'Someone on your radar';
      if (relationshipCue === 'You reached out') return 'Someone you reached out to';
      if (relationshipCue === 'They reached out') return 'Someone who reached out';
      return null;
    })();
    if (cueLead) {
      return `${cueLead} shared ${count} new Moment${count === 1 ? '' : 's'}`;
    }
    return `Shared ${count} new Moment${count === 1 ? '' : 's'}`;
  }, []);

  const queueMomentReactionToast = useCallback(
    ({
      momentId,
      reactionId,
      reactorKey,
      reactorName,
      avatarUrl,
      profileId,
      emoji,
      momentRow,
      previewsAllowed,
      relationshipCue,
      routeStartUserId,
    }: {
      momentId: string;
      reactionId: string;
      reactorKey: string;
      reactorName: string;
      avatarUrl: string | null;
      profileId: string | null;
      emoji: string | null;
      momentRow: any;
      previewsAllowed: boolean;
      relationshipCue?: string | null;
      routeStartUserId: string;
    }) => {
      const burstKey = String(momentId);
      const nextActors = new Map(momentReactionBurstsRef.current[burstKey]?.actors ?? []);
      if (!nextActors.has(reactorKey)) {
        nextActors.set(reactorKey, {
          key: reactorKey,
          name: reactorName,
          avatarUrl,
          profileId,
          emoji,
        });
      } else {
        const current = nextActors.get(reactorKey)!;
        nextActors.set(reactorKey, {
          ...current,
          name: reactorName || current.name,
          avatarUrl: avatarUrl ?? current.avatarUrl,
          profileId: profileId ?? current.profileId,
          emoji: emoji ?? current.emoji,
        });
      }
      momentReactionBurstsRef.current[burstKey] = { actors: nextActors };

      if (momentReactionBurstTimeoutsRef.current[burstKey]) {
        clearTimeout(momentReactionBurstTimeoutsRef.current[burstKey]);
      }
      momentReactionBurstTimeoutsRef.current[burstKey] = setTimeout(() => {
        delete momentReactionBurstsRef.current[burstKey];
        delete momentReactionBurstTimeoutsRef.current[burstKey];
      }, MOMENT_REACTION_BURST_WINDOW_MS);

      const actors = Array.from(nextActors.values());
      const latestActor = actors[actors.length - 1];
      const totalActors = actors.length;
      const textSnippet = String(momentRow?.text_body || '').replace(/\s+/g, ' ').trim().slice(0, 88);
      const subject =
        previewsAllowed && momentRow?.type === 'text' && textSnippet ? `"${textSnippet}"` : 'your Moment';
      const body =
        totalActors > 1
          ? `${latestActor.name} and ${totalActors - 1} other${totalActors - 1 === 1 ? '' : 's'} reacted to ${subject}`
          : momentReactionPreview(momentRow, emoji, previewsAllowed, relationshipCue);

      pushToast({
        id: `moment-reaction-burst-${burstKey}`,
        title: totalActors > 1 ? `${totalActors} reactions` : reactorName,
        body,
        kind: 'moment',
        avatarUrl: latestActor.avatarUrl,
        profileId: totalActors > 1 ? null : profileId,
        route: '/moments',
        routeParams: {
          startUserId: String(routeStartUserId),
          startMomentId: String(momentId),
          entrySource: 'reaction',
          reactionEmoji: latestActor.emoji ? String(latestActor.emoji) : '',
          reactionId: reactionId ? String(reactionId) : '',
        },
      }, { replace: totalActors > 1 });
    },
    [momentReactionPreview, pushToast],
  );

  const queueMomentCommentReactionToast = useCallback(
    ({
      commentId,
      momentId,
      reactionId,
      reactorKey,
      reactorName,
      avatarUrl,
      profileId,
      reaction,
      previewsAllowed,
      relationshipCue,
      routeStartUserId,
    }: {
      commentId: string;
      momentId: string;
      reactionId: string;
      reactorKey: string;
      reactorName: string;
      avatarUrl: string | null;
      profileId: string | null;
      reaction: string | null;
      previewsAllowed: boolean;
      relationshipCue?: string | null;
      routeStartUserId: string;
    }) => {
      const burstKey = String(commentId);
      const nextActors = new Map(momentCommentReactionBurstsRef.current[burstKey]?.actors ?? []);
      if (!nextActors.has(reactorKey)) {
        nextActors.set(reactorKey, {
          key: reactorKey,
          name: reactorName,
          avatarUrl,
          profileId,
          reaction,
        });
      } else {
        const current = nextActors.get(reactorKey)!;
        nextActors.set(reactorKey, {
          ...current,
          name: reactorName || current.name,
          avatarUrl: avatarUrl ?? current.avatarUrl,
          profileId: profileId ?? current.profileId,
          reaction: reaction ?? current.reaction,
        });
      }
      momentCommentReactionBurstsRef.current[burstKey] = { actors: nextActors };

      if (momentCommentReactionBurstTimeoutsRef.current[burstKey]) {
        clearTimeout(momentCommentReactionBurstTimeoutsRef.current[burstKey]);
      }
      momentCommentReactionBurstTimeoutsRef.current[burstKey] = setTimeout(() => {
        delete momentCommentReactionBurstsRef.current[burstKey];
        delete momentCommentReactionBurstTimeoutsRef.current[burstKey];
      }, MOMENT_REACTION_BURST_WINDOW_MS);

      const actors = Array.from(nextActors.values());
      const latestActor = actors[actors.length - 1];
      const totalActors = actors.length;
      const body =
        totalActors > 1
          ? `${latestActor.name} and ${totalActors - 1} other${totalActors - 1 === 1 ? '' : 's'} reacted to your comment`
          : momentCommentReactionPreview(reaction, previewsAllowed, relationshipCue);

      pushToast({
        id: `moment-comment-reaction-burst-${burstKey}`,
        title: totalActors > 1 ? `${totalActors} comment reactions` : reactorName,
        body,
        kind: 'moment',
        avatarUrl: latestActor.avatarUrl,
        profileId: totalActors > 1 ? null : profileId,
        route: '/moments',
        routeParams: {
          startUserId: String(routeStartUserId),
          startMomentId: String(momentId),
          openComments: '1',
          entrySource: 'comment',
          commentId: String(commentId),
          reactionEmoji: '',
          reactionId: reactionId ? String(reactionId) : '',
        },
      }, { replace: totalActors > 1, durationMs: MOMENT_COMMENT_REACTION_TOAST_DURATION_MS });
    },
    [momentCommentReactionPreview, pushToast],
  );

  const queueMomentPostToast = useCallback(
    ({
      posterKey,
      posterName,
      avatarUrl,
      profileId,
      relationshipCue,
      momentId,
      momentRow,
      previewsAllowed,
      routeStartUserId,
    }: {
      posterKey: string;
      posterName: string;
      avatarUrl: string | null;
      profileId: string | null;
      relationshipCue: string | null;
      momentId: string;
      momentRow: any;
      previewsAllowed: boolean;
      routeStartUserId: string;
    }) => {
      const burstKey = String(posterKey);
      const previous = momentPostBurstsRef.current[burstKey];
      const nextCount = (previous?.momentCount ?? 0) + 1;
      momentPostBurstsRef.current[burstKey] = {
        actor: {
          key: posterKey,
          name: posterName,
          avatarUrl,
          profileId,
          relationshipCue,
        },
        momentCount: nextCount,
        latestMomentId: momentId,
      };

      if (momentPostBurstTimeoutsRef.current[burstKey]) {
        clearTimeout(momentPostBurstTimeoutsRef.current[burstKey]);
      }
      momentPostBurstTimeoutsRef.current[burstKey] = setTimeout(() => {
        delete momentPostBurstsRef.current[burstKey];
        delete momentPostBurstTimeoutsRef.current[burstKey];
      }, MOMENT_POST_BURST_WINDOW_MS);

      pushToast({
        id: `moment-post-burst-${burstKey}`,
        title: posterName,
        body:
          nextCount > 1
            ? momentPostBurstPreview(nextCount, relationshipCue)
            : momentPostPreview(momentRow, previewsAllowed, relationshipCue),
        kind: 'moment',
        avatarUrl,
        profileId,
        route: '/moments',
        routeParams: {
          startUserId: String(routeStartUserId),
          startMomentId: String(momentId),
        },
      }, { replace: nextCount > 1 });
    },
    [momentPostBurstPreview, momentPostPreview, pushToast],
  );

  const verificationMethodLabel = useCallback((verificationType?: string | null) => {
    switch ((verificationType || '').toLowerCase()) {
      case 'social':
        return 'social proof';
      case 'selfie_liveness':
        return 'face check';
      case 'passport':
        return 'identity document proof';
      case 'residence':
        return 'residence proof';
      case 'workplace':
        return 'work or study proof';
      default:
        return 'verification';
    }
  }, []);

  const matchPreview = useCallback((otherName: string) => {
    return `You and ${otherName || 'them'} saw something in each other. Start with something real.`;
  }, []);

  const markMatchCelebrationSeen = useCallback(async (eventId: string) => {
    if (!eventId) return;
    try {
      await supabase.rpc('rpc_mark_match_celebration_seen', { p_event_id: eventId });
    } catch {
      // Best-effort: the toast is already local, the next app open can retry.
    }
  }, []);

  const showMatchCelebrationEvent = useCallback(
    async (row: MatchCelebrationEvent | null | undefined) => {
      if (!row?.id || !row.match_id || !row.peer_profile_id) return;
      if (!canInAppNotify('matches')) return;

      if (shownMatchCelebrationRef.current.has(row.match_id)) {
        void markMatchCelebrationSeen(row.id);
        return;
      }
      shownMatchCelebrationRef.current.add(row.match_id);

      let otherName = 'them';
      let otherAvatar: string | null = null;

      try {
        const profileRow = await getProfileLite(row.peer_profile_id);
        otherName = getUserFacingDisplayName(profileRow, 'them');
        if (profileRow?.avatar_url) otherAvatar = profileRow.avatar_url;
      } catch {
        // best-effort only
      }

      pushToast({
        id: `match-${row.match_id}`,
        title: "It's a match",
        body: matchPreview(otherName),
        avatarUrl: otherAvatar,
        profileId: row.peer_profile_id,
        chatId: row.peer_profile_id,
      });
      void markMatchCelebrationSeen(row.id);
    },
    [canInAppNotify, getProfileLite, markMatchCelebrationSeen, matchPreview, pushToast],
  );

  const giftPreview = useCallback((giftType?: string | null) => {
    switch (giftType) {
      case 'rose':
        return 'Sent a rose to get your attention.';
      case 'teddy':
        return 'Sent a teddy bear with softer energy.';
      case 'ring':
        return 'Sent a ring. That move was not casual.';
      default:
        return 'Sent you a thoughtful gift.';
    }
  }, []);

  const verificationOutcomePreview = useCallback(
    (status?: string | null, targetLevel?: string | number | null, verificationType?: string | null) => {
      const resolvedLevel =
        typeof targetLevel === 'number'
          ? targetLevel
          : typeof targetLevel === 'string'
            ? Number.parseInt(targetLevel, 10) || null
            : null;
      if (status === 'approved') {
        return `Your ${verificationMethodLabel(verificationType)} moved you${resolvedLevel ? ` to Trust level ${resolvedLevel}` : ' forward'}.`;
      }
      return 'One proof needs a cleaner pass. Pick it up privately when you are ready.';
    },
    [verificationMethodLabel],
  );

  const getMomentRelationshipCueForPoster = useCallback(
    async (posterUserId: string) => {
      if (!profile?.id || !posterUserId || posterUserId === user?.id) return null;
      const cacheKey = `${profile.id}:${posterUserId}`;
      const cached = momentRelationshipCueCacheRef.current.get(cacheKey);
      if (cached !== undefined) return cached;

      const poster = await getProfileLite(posterUserId, { preferUserId: true });
      const posterProfileId = poster?.id;
      if (!posterProfileId) {
        momentRelationshipCueCacheRef.current.set(cacheKey, null);
        return null;
      }

      const [swipeRes, intentRes] = await Promise.all([
        supabase
          .from('swipes')
          .select('swiper_id,target_id,created_at,action')
          .or(
            `and(swiper_id.eq.${profile.id},target_id.eq.${posterProfileId},action.in.(LIKE,SUPERLIKE)),and(swiper_id.eq.${posterProfileId},target_id.eq.${profile.id},action.in.(LIKE,SUPERLIKE))`,
          ),
        supabase
          .from('intent_requests')
          .select('actor_id,recipient_id,status,created_at')
          .or(
            `and(actor_id.eq.${profile.id},recipient_id.eq.${posterProfileId},status.in.(pending,accepted,matched)),and(actor_id.eq.${posterProfileId},recipient_id.eq.${profile.id},status.in.(pending,accepted,matched))`,
          ),
      ]);

      const intentRows = (intentRes.data as { actor_id: string; recipient_id: string; status: string; created_at?: string | null }[] | null) ?? [];
      let bestIntentCue: string | null = null;
      let bestIntentPriority = -1;
      let bestIntentAt = 0;
      intentRows.forEach((row) => {
        const status = String(row.status || '').toLowerCase();
        const cue =
          status === 'matched'
            ? 'You matched'
            : status === 'accepted'
              ? 'Door reopened'
              : row.actor_id === profile.id
                ? 'You reached out'
                : 'They reached out';
        const priority = cue === 'You matched' ? 3 : cue === 'Door reopened' ? 2 : 1;
        const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
        if (priority > bestIntentPriority || (priority === bestIntentPriority && createdAt > bestIntentAt)) {
          bestIntentPriority = priority;
          bestIntentAt = createdAt;
          bestIntentCue = cue;
        }
      });

      if (bestIntentCue) {
        momentRelationshipCueCacheRef.current.set(cacheKey, bestIntentCue);
        return bestIntentCue;
      }

      const swipeRows = (swipeRes.data as { swiper_id: string; target_id: string; created_at?: string | null; action: string }[] | null) ?? [];
      let likedYou = false;
      let youLiked = false;
      swipeRows.forEach((row) => {
        if (row.target_id === profile.id) likedYou = true;
        if (row.swiper_id === profile.id) youLiked = true;
      });

      const cue = likedYou && youLiked ? 'You liked each other' : likedYou ? 'Liked you' : youLiked ? 'You liked them' : null;
      momentRelationshipCueCacheRef.current.set(cacheKey, cue);
      return cue;
    },
    [getProfileLite, profile?.id, user?.id],
  );

  const openToastTarget = useCallback(
    (toast: ToastItem) => {
      if (toast.route) {
        if (toast.routeParams) {
          const target = { pathname: toast.route as any, params: toast.routeParams };
          const hasTargetedPulseParams = Boolean(
            toast.routeParams.openPulseItemId ||
            toast.routeParams.openPulseCommentId ||
            toast.routeParams.openPulseParentCommentId,
          );
          if (hasTargetedPulseParams) {
            router.replace(target);
          } else {
            router.push(target);
          }
        } else {
          router.push(toast.route as any);
        }
        return;
      }
      if (toast.chatId) {
        router.push({
          pathname: '/chat/[id]',
          params: {
            id: toast.peerUserId ?? toast.chatId,
            peerUserId: toast.peerUserId ?? '',
            peerProfileId: toast.profileId ?? '',
            userName: toast.title,
            userAvatar: toast.avatarUrl ?? '',
          },
        });
        return;
      }
      if (toast.profileId) {
        router.push({ pathname: '/profile-view', params: { profileId: String(toast.profileId) } });
      }
    },
    [router],
  );

  useEffect(() => {
    if (!user?.id) return;
    return subscribeForegroundChatMessages((row) => {
      if (row.receiver_id !== user.id) return;
      queueIncomingMessageToast(row);
    });
  }, [queueIncomingMessageToast, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`inapp_message_reactions:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (shouldSuppressToast(`message-reaction:${String(row.id)}`)) return;
          if (row.user_id === user.id) return;
          if (isChatThreadRoute) return;
          if (!canInAppNotify('message_reactions')) return;
          void (async () => {
            let name = 'Someone';
            let avatarUrl: string | null = null;
            let otherId: string | null = null;
            let reactorProfileId: string | null = null;
            let reactionBody = row.emoji ? `reacted ${row.emoji}` : 'reacted to your message';
            let mediaThumbnailUrl: string | null = null;
            let mediaThumbnailKind: ToastItem['mediaThumbnailKind'] = null;
            let mediaThumbnailLabel: string | null = null;
            try {
              const { data: messageRow } = await supabase
                .from('messages')
                .select('sender_id,receiver_id,text,message_type,is_view_once')
                .eq('id', row.message_id)
                .maybeSingle();
              if (!messageRow?.sender_id || !messageRow?.receiver_id) return;
              if (messageRow.sender_id !== user.id && messageRow.receiver_id !== user.id) return;
              otherId = messageRow.sender_id === user.id ? messageRow.receiver_id : messageRow.sender_id;
              if (isActiveChatWith(otherId)) return;
              reactionBody = messageReactionPreview(messageRow, row.emoji, prefs?.preview_text !== false);
              const mediaThumbnail = getMessageMediaThumbnail(messageRow as MessageToastRow);
              mediaThumbnailUrl = mediaThumbnail.url;
              mediaThumbnailKind = mediaThumbnail.kind;
              mediaThumbnailLabel = mediaThumbnail.label;
              const p = await getProfileLite(String(row.user_id), { preferUserId: true });
              name = getUserFacingDisplayName(p, 'Someone');
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) reactorProfileId = p.id;
            } catch {}

            pushToast({
              id: `message-reaction-${row.id}`,
              title: name,
              body: reactionBody,
              kind: 'message_reaction',
              avatarUrl,
              profileId: reactorProfileId ?? null,
              chatId: reactorProfileId ?? otherId ?? String(row.user_id),
              peerUserId: otherId ?? null,
              groupKey: otherId ? `chat:${String(otherId)}` : null,
              groupCount: 1,
              mediaThumbnailUrl,
              mediaThumbnailKind,
              mediaThumbnailLabel,
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, getProfileLite, isActiveChatWith, isChatThreadRoute, messageReactionPreview, prefs?.preview_text, pushToast, shouldSuppressToast, user?.id]);

  useEffect(() => {
    if (!user?.id || !profile?.id) return;

    const channel = supabase
      .channel(`inapp_moment_posts:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'moments' },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.user_id === user.id) return;
          if (row.is_deleted) return;
          if (shouldSuppressToast(`moment-post:${String(row.id)}`)) return;
          if (!canInAppNotify('moments')) return;
          if (isMomentsRoute) return;
          void (async () => {
            const relationshipCue = await getMomentRelationshipCueForPoster(String(row.user_id));
            if (!relationshipCue) return;

            let name = 'Someone';
            let avatarUrl: string | null = null;
            let posterProfileId: string | null = null;
            try {
              const p = await getProfileLite(String(row.user_id), { preferUserId: true });
              name = getUserFacingDisplayName(p, 'Someone');
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) posterProfileId = p.id;
            } catch {}

            queueMomentPostToast({
              posterKey: posterProfileId ?? String(row.user_id),
              posterName: name,
              avatarUrl,
              profileId: posterProfileId ?? null,
              relationshipCue,
              momentId: String(row.id),
              momentRow: row,
              previewsAllowed: prefs?.preview_text !== false,
              routeStartUserId: String(row.user_id),
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    canInAppNotify,
    getProfileLite,
    getMomentRelationshipCueForPoster,
    isMomentsRoute,
    prefs?.preview_text,
    profile?.id,
    queueMomentPostToast,
    shouldSuppressToast,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    const handleMomentReaction = (payload: any) => {
      const row = payload?.new as any;
      if (!row) return;
      if (payload?.eventType === 'UPDATE' && payload?.old?.emoji === row.emoji) return;
      if (row.user_id === user.id) return;
      if (shouldSuppressToast(`moment-reaction:${String(row.id)}`)) return;
      if (!canInAppNotify('moments')) return;
      if (isMomentsRoute) return;
      void (async () => {
        const { data: momentRow } = await supabase
          .from('moments')
          .select('id,user_id,type,text_body,caption,is_deleted')
          .eq('id', row.moment_id)
          .maybeSingle();
        if (!momentRow || momentRow.user_id !== user.id || momentRow.is_deleted) return;

        let name = 'Someone';
        let avatarUrl: string | null = null;
        let reactorProfileId: string | null = null;
        try {
          const p = await getProfileLite(String(row.user_id), { preferUserId: true });
          name = getUserFacingDisplayName(p, 'Someone');
          if (p?.avatar_url) avatarUrl = p.avatar_url;
          if (p?.id) reactorProfileId = p.id;
        } catch {}
        const relationshipCue = await getMomentRelationshipCueForPoster(String(row.user_id));
        queueMomentReactionToast({
          momentId: String(momentRow.id),
          reactionId: String(row.id),
          reactorKey: reactorProfileId ?? String(row.user_id),
          reactorName: name,
          avatarUrl,
          profileId: reactorProfileId ?? null,
          emoji: row.emoji ? String(row.emoji) : null,
          momentRow,
          previewsAllowed: prefs?.preview_text !== false,
          relationshipCue,
          routeStartUserId: String(user.id),
        });
      })();
    };

    const channel = supabase
      .channel(`inapp_moment_reactions:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moment_reactions' }, handleMomentReaction)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'moment_reactions' }, handleMomentReaction)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    canInAppNotify,
    getProfileLite,
    getMomentRelationshipCueForPoster,
    isMomentsRoute,
    prefs?.preview_text,
    pushToast,
    queueMomentReactionToast,
    shouldSuppressToast,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`inapp_moment_comments:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'moment_comments' },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.user_id === user.id) return;
          if (shouldSuppressToast(`moment-comment:${String(row.id)}`)) return;
          if (!canInAppNotify('moments')) return;
          if (isMomentsRoute) return;
          void (async () => {
            const [{ data: momentRow }, { data: parentCommentRow }] = await Promise.all([
              supabase
                .from('moments')
                .select('id,user_id,is_deleted')
                .eq('id', row.moment_id)
                .maybeSingle(),
              row.parent_comment_id
                ? supabase
                    .from('moment_comments')
                    .select('id,user_id,is_deleted')
                    .eq('id', row.parent_comment_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
            ]);

            if (!momentRow || momentRow.is_deleted) return;

            const recipientKind: 'moment_owner' | 'reply_target' | null =
              momentRow.user_id === user.id
                ? 'moment_owner'
                : parentCommentRow &&
                    !parentCommentRow.is_deleted &&
                    parentCommentRow.user_id === user.id &&
                    parentCommentRow.user_id !== row.user_id
                  ? 'reply_target'
                  : null;

            if (!recipientKind) return;

            let name = 'Someone';
            let avatarUrl: string | null = null;
            let commenterProfileId: string | null = null;
            try {
              const p = await getProfileLite(String(row.user_id), { preferUserId: true });
              name = getUserFacingDisplayName(p, 'Someone');
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) commenterProfileId = p.id;
            } catch {}
            const relationshipCue = await getMomentRelationshipCueForPoster(String(row.user_id));

            pushToast({
              id: `moment-comment-${row.id}`,
              title: name,
              body: momentCommentPreview(row, prefs?.preview_text !== false, relationshipCue, recipientKind),
              avatarUrl,
              profileId: commenterProfileId ?? null,
              route: '/moments',
              routeParams: {
                startUserId: String(momentRow.user_id),
                startMomentId: String(momentRow.id),
                openComments: '1',
                entrySource: 'comment',
                commentId: String(row.id),
              },
            }, { durationMs: MOMENT_COMMENT_TOAST_DURATION_MS });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    canInAppNotify,
    getProfileLite,
    getMomentRelationshipCueForPoster,
    isMomentsRoute,
    momentCommentPreview,
    prefs?.preview_text,
    pushToast,
    shouldSuppressToast,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`inapp_moment_comment_reactions:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'moment_comment_reactions' },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.user_id === user.id) return;
          if (shouldSuppressToast(`moment-comment-reaction:${String(row.id)}`)) return;
          if (!canInAppNotify('moments')) return;
          if (isMomentsRoute) return;
          void (async () => {
            const [{ data: commentRow }, { data: momentRow }] = await Promise.all([
              supabase
                .from('moment_comments')
                .select('id,user_id,moment_id,is_deleted')
                .eq('id', row.comment_id)
                .maybeSingle(),
              supabase
                .from('moments')
                .select('id,user_id,is_deleted')
                .eq('id', row.moment_id)
                .maybeSingle(),
            ]);
            if (!commentRow || !momentRow || commentRow.is_deleted || momentRow.is_deleted) return;
            if (commentRow.user_id !== user.id) return;

            let name = 'Someone';
            let avatarUrl: string | null = null;
            let reactorProfileId: string | null = null;
            try {
              const p = await getProfileLite(String(row.user_id), { preferUserId: true });
              name = getUserFacingDisplayName(p, 'Someone');
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) reactorProfileId = p.id;
            } catch {}
            const relationshipCue = await getMomentRelationshipCueForPoster(String(row.user_id));

            queueMomentCommentReactionToast({
              commentId: String(commentRow.id),
              momentId: String(momentRow.id),
              reactionId: String(row.id),
              reactorKey: reactorProfileId ?? String(row.user_id),
              reactorName: name,
              avatarUrl,
              profileId: reactorProfileId ?? null,
              reaction: row.reaction ? String(row.reaction) : null,
              previewsAllowed: prefs?.preview_text !== false,
              relationshipCue,
              routeStartUserId: String(momentRow.user_id),
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    canInAppNotify,
    getProfileLite,
    getMomentRelationshipCueForPoster,
    isMomentsRoute,
    momentCommentReactionPreview,
    prefs?.preview_text,
    pushToast,
    queueMomentCommentReactionToast,
    shouldSuppressToast,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, any> | undefined;
      const pushType = typeof data?.type === 'string' ? data.type : '';
      if (pushType === 'message') {
        if (!user?.id) return;
        if (!canInAppNotify('messages')) return;
        const messageId = data?.message_id ? String(data.message_id) : '';
        const peerUserId = data?.peer_user_id ? String(data.peer_user_id) : '';
        if (!messageId) return;
        if (shouldSuppressToast(`message:${messageId}`)) return;
        if (isChatThreadRoute || (peerUserId && isActiveChatWith(peerUserId))) return;
        void (async () => {
          const { data: messageRow } = await supabase
            .from('messages')
            .select('id,sender_id,receiver_id,text,message_type,is_view_once')
            .eq('id', messageId)
            .maybeSingle();
          const resolvedRow = messageRow as MessageToastRow | null;
          const previewAllowed = prefs?.preview_text !== false;
          const kind = getMessageToastKind(resolvedRow);
          const mediaThumbnail = getMessageMediaThumbnail(resolvedRow);
          const body = resolvedRow
            ? messagePreview(resolvedRow, previewAllowed)
            : notification.request.content.body || 'New message';
          pushToast({
            id: `msg-push-${messageId}`,
            title: notification.request.content.title || 'New message',
            body,
            kind,
            avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
            profileId: data?.profile_id ? String(data.profile_id) : null,
            chatId: data?.profile_id ? String(data.profile_id) : peerUserId || null,
            peerUserId: peerUserId || null,
            groupKey: peerUserId ? `chat:${peerUserId}` : null,
            groupCount: 1,
            mediaThumbnailUrl: mediaThumbnail.url,
            mediaThumbnailKind: mediaThumbnail.kind,
            mediaThumbnailLabel: mediaThumbnail.label,
          });
        })();
        return;
      }

      if (pushType === 'message_reaction') {
        if (!user?.id) return;
        if (!canInAppNotify('message_reactions')) return;
        const reactionId = data?.reaction_id ? String(data.reaction_id) : notification.request.identifier;
        const messageId = data?.message_id ? String(data.message_id) : '';
        const peerUserId = data?.peer_user_id ? String(data.peer_user_id) : '';
        if (shouldSuppressToast(`message-reaction:${reactionId}`)) return;
        if (isChatThreadRoute || (peerUserId && isActiveChatWith(peerUserId))) return;
        void (async () => {
          let body = notification.request.content.body || 'reacted to your message';
          let mediaThumbnailUrl: string | null = null;
          let mediaThumbnailKind: ToastItem['mediaThumbnailKind'] = null;
          let mediaThumbnailLabel: string | null = null;
          if (messageId) {
            const { data: messageRow } = await supabase
              .from('messages')
              .select('sender_id,receiver_id,text,message_type,is_view_once')
              .eq('id', messageId)
              .maybeSingle();
            if (messageRow) {
              body = messageReactionPreview(
                messageRow,
                data?.emoji ? String(data.emoji) : null,
                prefs?.preview_text !== false,
              );
              const mediaThumbnail = getMessageMediaThumbnail(messageRow as MessageToastRow);
              mediaThumbnailUrl = mediaThumbnail.url;
              mediaThumbnailKind = mediaThumbnail.kind;
              mediaThumbnailLabel = mediaThumbnail.label;
            }
          }
          pushToast({
            id: `message-reaction-push-${reactionId}`,
            title: notification.request.content.title || 'Someone',
            body,
            kind: 'message_reaction',
            avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
            profileId: data?.profile_id ? String(data.profile_id) : null,
            chatId: data?.profile_id ? String(data.profile_id) : peerUserId || null,
            peerUserId: peerUserId || null,
            groupKey: peerUserId ? `chat:${peerUserId}` : null,
            groupCount: 1,
            mediaThumbnailUrl,
            mediaThumbnailKind,
            mediaThumbnailLabel,
          });
        })();
        return;
      }

      if (pushType === 'moment_post' || pushType === 'moment_reaction' || pushType === 'moment_comment' || pushType === 'moment_comment_reaction') {
        if (!canInAppNotify('moments')) return;
        if (isMomentsRoute) return;

        const momentId = data?.moment_id ? String(data.moment_id) : '';
        const commentId = data?.comment_id ? String(data.comment_id) : '';
        const reactionId = data?.reaction_id ? String(data.reaction_id) : '';
        const commentReactionId = data?.comment_reaction_id ? String(data.comment_reaction_id) : '';
        const startUserId =
          data?.start_user_id ||
          data?.poster_user_id ||
          data?.moment_owner_user_id ||
          data?.user_id;

        const suppressionKey =
          pushType === 'moment_post'
            ? `moment-post:${momentId}`
            : pushType === 'moment_reaction'
              ? `moment-reaction:${reactionId || momentId}`
              : pushType === 'moment_comment'
                ? `moment-comment:${commentId || momentId}`
                : `moment-comment-reaction:${commentReactionId || commentId || momentId}`;
        if (shouldSuppressToast(suppressionKey)) return;

        if (pushType === 'moment_post') {
          const previewsAllowed = prefs?.preview_text !== false;
          const relationshipCue =
            typeof data?.relationship_cue === 'string' ? String(data.relationship_cue) : null;
          const fallbackMomentRow = {
            id: momentId,
            type: data?.moment_type ? String(data.moment_type) : null,
            text_body: data?.moment_text_body ? String(data.moment_text_body) : null,
            caption: data?.moment_caption ? String(data.moment_caption) : null,
          };

          queueMomentPostToast({
            posterKey: data?.profile_id ? String(data.profile_id) : startUserId ? String(startUserId) : notification.request.identifier,
            posterName: notification.request.content.title || 'Someone',
            avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
            profileId: data?.profile_id ? String(data.profile_id) : null,
            relationshipCue,
            momentId,
            momentRow: fallbackMomentRow,
            previewsAllowed,
            routeStartUserId: startUserId ? String(startUserId) : String(user.id),
          });
          return;
        }

        if (pushType === 'moment_reaction') {
          const previewsAllowed = prefs?.preview_text !== false;
          const relationshipCue =
            typeof data?.relationship_cue === 'string' ? String(data.relationship_cue) : null;
          const fallbackMomentRow = {
            id: momentId,
            type: data?.moment_type ? String(data.moment_type) : null,
            text_body: data?.moment_text_body ? String(data.moment_text_body) : null,
          };

          queueMomentReactionToast({
            momentId,
            reactionId,
            reactorKey: data?.profile_id ? String(data.profile_id) : reactionId || notification.request.identifier,
            reactorName: notification.request.content.title || 'Someone',
            avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
            profileId: data?.profile_id ? String(data.profile_id) : null,
            emoji:
              data?.emoji ? String(data.emoji) : data?.reaction_emoji ? String(data.reaction_emoji) : null,
            momentRow: fallbackMomentRow,
            previewsAllowed,
            relationshipCue,
            routeStartUserId: startUserId ? String(startUserId) : String(user.id),
          });
          return;
        }

        if (pushType === 'moment_comment_reaction') {
          const previewsAllowed = prefs?.preview_text !== false;
          const relationshipCue =
            typeof data?.relationship_cue === 'string' ? String(data.relationship_cue) : null;
          queueMomentCommentReactionToast({
            commentId,
            momentId,
            reactionId: commentReactionId || commentId || notification.request.identifier,
            reactorKey: data?.profile_id ? String(data.profile_id) : commentReactionId || notification.request.identifier,
            reactorName: notification.request.content.title || 'Someone',
            avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
            profileId: data?.profile_id ? String(data.profile_id) : null,
            reaction:
              data?.reaction ? String(data.reaction) : data?.reaction_emoji ? String(data.reaction_emoji) : null,
            previewsAllowed,
            relationshipCue,
            routeStartUserId: startUserId ? String(startUserId) : String(user.id),
          });
          return;
        }

        pushToast({
          id:
            pushType === 'moment_comment'
              ? `moment-comment-${commentId || momentId}`
              : `moment-post-${momentId}`,
          title: notification.request.content.title || 'Someone',
          body: notification.request.content.body || 'Shared a new Moment',
          avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
          profileId: data?.profile_id ? String(data.profile_id) : null,
          route: '/moments',
          routeParams: {
            startUserId: startUserId ? String(startUserId) : '',
            startMomentId: momentId,
            openComments: pushType === 'moment_comment' || pushType === 'moment_comment_reaction' ? '1' : '',
            entrySource: pushType === 'moment_comment' || pushType === 'moment_comment_reaction' ? 'comment' : '',
            commentId: pushType === 'moment_comment' || pushType === 'moment_comment_reaction' ? commentId : '',
            reactionEmoji: '',
          },
        }, {
          durationMs:
            pushType === 'moment_comment'
              ? MOMENT_COMMENT_TOAST_DURATION_MS
              : pushType === 'moment_comment_reaction'
                ? MOMENT_COMMENT_REACTION_TOAST_DURATION_MS
                : TOAST_DURATION_MS,
        });
        return;
      }

      if (pushType === 'intent_request' || pushType === 'intent_expiring_soon' || pushType === 'intent_last_chance') {
        if (!canInAppNotify('messages')) return;
        pushToast({
          id:
            pushType === 'intent_request'
              ? `intent-${data?.request_id ? String(data.request_id) : notification.request.identifier}`
              : `${pushType}-${data?.request_id ? String(data.request_id) : notification.request.identifier}`,
          title: notification.request.content.title || 'Someone',
          body:
            notification.request.content.body ||
            (pushType === 'intent_request'
              ? intentRequestPreview(data?.request_type ? String(data.request_type) : '')
              : intentReminderPreview(pushType === 'intent_last_chance', data?.request_type ? String(data.request_type) : '')),
          avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
          profileId: data?.profile_id ? String(data.profile_id) : null,
          route: '/(tabs)/intent',
          routeParams: {
            requestId: data?.request_id ? String(data.request_id) : '',
            type: data?.request_type ? String(data.request_type) : '',
          },
        });
        return;
      }

      if (pushType === 'verification_outcome') {
        if (!canInAppNotify('verification')) return;
        pushToast({
          id: `verification-${data?.request_id ? String(data.request_id) : notification.request.identifier}`,
          title: notification.request.content.title || 'Trust update',
          body:
            notification.request.content.body ||
            verificationOutcomePreview(
              data?.status ? String(data.status) : '',
              data?.target_level,
              data?.verification_type ? String(data.verification_type) : '',
            ),
          route: '/(tabs)/profile',
          routeParams: {
            openVerification: 'true',
          },
        });
        return;
      }

      if (pushType === 'profile_interest') {
        if (!canInAppNotify('profile_interest')) return;
        pushToast({
          id: `profile-interest-${data?.signal ? String(data.signal) : notification.request.identifier}-${data?.profile_id ? String(data.profile_id) : 'anonymous'}`,
          title: notification.request.content.title || 'Profile Interest',
          body: notification.request.content.body || 'Someone engaged with your profile.',
          kind: 'generic',
          avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
          profileId: data?.profile_id ? String(data.profile_id) : null,
          route: '/profile-interest',
        });
        return;
      }

      if (pushType === 'relationship_compass_ready') {
        if ((prefs && !prefs.inapp_enabled) || isQuietHours) return;
        pushToast({
          id: `relationship-compass-${notification.request.identifier}`,
          title: notification.request.content.title || 'Relationship Compass',
          body:
            notification.request.content.body ||
            'Your Love Compass is ready again. Fresh curated profiles are waiting.',
          route: '/relationship-compass',
        });
        return;
      }

      if (pushType === 'circle_pulse_discussion' && data?.circle_id && data?.pulse_item_id) {
        if (!canInAppNotify('circle_discussions')) return;
        pushToast({
          id: `circle-pulse-discussion-${data?.comment_id ? String(data.comment_id) : notification.request.identifier}-${data?.event_type ? String(data.event_type) : 'activity'}`,
          title: notification.request.content.title || 'Circle discussion',
          body: notification.request.content.body || 'There is new activity in a Circle discussion.',
          kind: 'generic',
          route: '/circles/[id]',
          routeParams: {
            id: String(data.circle_id),
            openPulseItemId: String(data.pulse_item_id),
            ...(data?.comment_id ? { openPulseCommentId: String(data.comment_id) } : {}),
            ...(data?.parent_comment_id ? { openPulseParentCommentId: String(data.parent_comment_id) } : {}),
            openPulseRouteNonce: notification.request.identifier,
          },
        });
        return;
      }

      if (pushType === 'circle_pulse_reaction' && data?.circle_id && data?.pulse_item_id) {
        if (!canInAppNotify('reactions')) return;
        pushToast({
          id: `circle-pulse-reaction-${data?.comment_id ? String(data.comment_id) : notification.request.identifier}-${data?.reaction ? String(data.reaction) : 'reaction'}`,
          title: notification.request.content.title || 'Circle reaction',
          body: notification.request.content.body || 'Someone reacted in a Circle discussion.',
          kind: 'generic',
          route: '/circles/[id]',
          routeParams: {
            id: String(data.circle_id),
            openPulseItemId: String(data.pulse_item_id),
            ...(data?.comment_id ? { openPulseCommentId: String(data.comment_id) } : {}),
            openPulseRouteNonce: notification.request.identifier,
          },
        });
        return;
      }

      if (pushType === 'circle_love_seat' && data?.circle_id) {
        if ((prefs && !prefs.inapp_enabled) || isQuietHours) return;
        pushToast({
          id: `circle-love-seat-${data?.love_seat_id ? String(data.love_seat_id) : notification.request.identifier}-${data?.event_type || 'update'}`,
          title: notification.request.content.title || 'Circle Love Seat',
          body: notification.request.content.body || 'There is a new Love Seat update in your Circle.',
          kind: 'generic',
          route: '/circles/[id]',
          routeParams: {
            id: String(data.circle_id),
          },
        });
        return;
      }

      if (pushType === 'circle_invitation' && data?.circle_id) {
        if ((prefs && !prefs.inapp_enabled) || isQuietHours) return;
        pushToast({
          id: `circle-invitation-${data?.invitation_id ? String(data.invitation_id) : notification.request.identifier}`,
          title: notification.request.content.title || 'A Circle invited you in',
          body: notification.request.content.body || 'Open the Circle to accept or decline your private invitation.',
          kind: 'generic',
          route: '/circles/[id]',
          routeParams: {
            id: String(data.circle_id),
          },
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    canInAppNotify,
    intentReminderPreview,
    intentRequestPreview,
    isActiveChatWith,
    isChatThreadRoute,
    isMomentsRoute,
    isQuietHours,
    messagePreview,
    messageReactionPreview,
    prefs,
    pushToast,
    queueMomentPostToast,
    queueMomentReactionToast,
    shouldSuppressToast,
    user?.id,
    verificationOutcomePreview,
  ]);

  useEffect(() => {
    if (!profile?.id || !user?.id) return;

    const handleProfileReaction = (payload: any) => {
      const row = payload?.new as any;
      if (!row) return;
      if (payload?.eventType === 'UPDATE' && payload?.old?.emoji === row.emoji) return;
      if (row.reactor_user_id === user.id) return;
      if (!canInAppNotify('reactions')) return;
      void (async () => {
        const emoji = row.emoji || null;
        let name = 'Someone';
        let avatarUrl: string | null = null;
        let reactorProfileId: string | null = null;
        try {
          const p = await getProfileLite(String(row.reactor_user_id), { preferUserId: true });
          name = getUserFacingDisplayName(p, 'Someone');
          if (p?.avatar_url) avatarUrl = p.avatar_url;
          if (p?.id) reactorProfileId = p.id;
        } catch {}
        pushToast({
          id: `react-${row.id}`,
          title: name,
          body: emoji ? `reacted ${emoji} to your photo` : 'reacted to your photo',
          avatarUrl,
          profileId: reactorProfileId ?? null,
        });
      })();
    };

    const channel = supabase
      .channel(`inapp_profile_reactions:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profile_image_reactions', filter: `profile_id=eq.${profile.id}` },
        handleProfileReaction,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profile_image_reactions', filter: `profile_id=eq.${profile.id}` },
        handleProfileReaction,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, getProfileLite, profile?.id, pushToast, user?.id]);

  useEffect(() => {
    if (!profile?.id || !user?.id) return;

    const channel = supabase
      .channel(`inapp_gifts:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profile_gifts', filter: `profile_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.sender_id === user.id) return;
          if (!canInAppNotify('gifts')) return;
          void (async () => {
              let name = 'New gift';
            let avatarUrl: string | null = null;
            let senderProfileId: string | null = null;
            try {
              const p = await getProfileLite(String(row.sender_id), { preferUserId: true });
                name = getUserFacingDisplayName(p, 'New gift');
                if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) senderProfileId = p.id;
            } catch {}
            pushToast({
              id: `gift-${row.id}`,
              title: name,
              body: giftPreview(row.gift_type),
              avatarUrl,
              profileId: senderProfileId ?? null,
              route: '/profile-insights',
              routeParams: {
                giftId: String(row.id),
              },
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, getProfileLite, giftPreview, profile?.id, pushToast, user?.id]);

  useEffect(() => {
    if (!profile?.id || !user?.id) return;

    const channel = supabase
      .channel(`inapp_boosts:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profile_boosts', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.user_id !== profile.id) return;
          if (!canInAppNotify('boosts')) return;
          pushToast({
            id: `boost-${row.id}`,
            title: 'Boost active',
            body: 'You are more visible right now. This is a good window to be intentional.',
            profileId: row.user_id,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, profile?.id, pushToast, user?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`inapp_swipes:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'swipes', filter: `target_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.action === 'SUPERLIKE' && !canInAppNotify('superlikes')) return;
          if (row.action === 'LIKE' && !canInAppNotify('likes')) return;
          void (async () => {
            let name = 'Someone';
            let avatarUrl: string | null = null;
            try {
                const { data } = await supabase
                  .from('profiles')
                  .select('id, full_name, account_state, deleted_at, avatar_url')
                  .eq('id', row.swiper_id)
                  .maybeSingle();
                name = getUserFacingDisplayName(data, 'Someone');
                if (data?.avatar_url) avatarUrl = data.avatar_url;
            } catch {}

            if (row.action === 'SUPERLIKE') {
              pushToast({
                id: `superlike-${row.id}`,
                title: name,
                body: swipePreview(row.action),
                avatarUrl,
                profileId: row.swiper_id,
              });
              return;
            }
            if (row.action === 'LIKE') {
              pushToast({
                id: `like-${row.id}`,
                title: name,
                body: swipePreview(row.action),
                avatarUrl,
                profileId: row.swiper_id,
              });
            }
          })();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'swipes', filter: `target_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (payload.old?.action === row.action) return;
          if (row.action === 'SUPERLIKE' && !canInAppNotify('superlikes')) return;
          if (row.action === 'LIKE' && !canInAppNotify('likes')) return;
          void (async () => {
            let name = 'Someone';
            let avatarUrl: string | null = null;
            try {
                const { data } = await supabase
                  .from('profiles')
                  .select('id, full_name, account_state, deleted_at, avatar_url')
                  .eq('id', row.swiper_id)
                  .maybeSingle();
                name = getUserFacingDisplayName(data, 'Someone');
                if (data?.avatar_url) avatarUrl = data.avatar_url;
            } catch {}

            if (row.action === 'SUPERLIKE') {
              pushToast({
                id: `superlike-${row.id}`,
                title: name,
                body: swipePreview(row.action),
                avatarUrl,
                profileId: row.swiper_id,
              });
              return;
            }
            if (row.action === 'LIKE') {
              pushToast({
                id: `like-${row.id}`,
                title: name,
                body: swipePreview(row.action),
                avatarUrl,
                profileId: row.swiper_id,
              });
            }
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, profile?.id, pushToast, swipePreview]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const loadUnseenMatchCelebrations = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('match_celebration_events')
          .select('id,match_id,recipient_user_id,recipient_profile_id,peer_user_id,peer_profile_id,seen_at,created_at')
          .is('seen_at', null)
          .order('created_at', { ascending: true })
          .limit(5);
        if (error || cancelled) return;

        const rows = (data ?? []) as MatchCelebrationEvent[];
        for (const row of rows) {
          if (cancelled) return;
          await showMatchCelebrationEvent(row);
        }
      } catch {
        // Table may not exist until the launch migration is applied.
      }
    };

    void loadUnseenMatchCelebrations();

    const channel = supabase
      .channel(`inapp_match_celebrations:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_celebration_events',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          void showMatchCelebrationEvent((payload as any)?.new as MatchCelebrationEvent);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [showMatchCelebrationEvent, user?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    const handleMatch = async (row: any) => {
      if (!row) return;
      if (row.status !== 'ACCEPTED') return;
      if (row.user1_id !== profile.id && row.user2_id !== profile.id) return;
      if (!canInAppNotify('matches')) return;
      if (row.id && shownMatchCelebrationRef.current.has(row.id)) return;
      if (row.id) shownMatchCelebrationRef.current.add(row.id);

      const otherId = row.user1_id === profile.id ? row.user2_id : row.user1_id;
      if (!otherId) return;

      let otherName = 'them';
      let otherAvatar: string | null = null;

      try {
          const { data } = await supabase
            .from('profiles')
            .select('id,user_id,full_name,account_state,deleted_at,avatar_url')
            .eq('id', otherId)
            .maybeSingle();
          const profileRow = data as any;
          otherName = getUserFacingDisplayName(profileRow, 'them');
          if (profileRow?.avatar_url) otherAvatar = profileRow.avatar_url;
      } catch {
        // best-effort only
      }

      pushToast({
        id: `match-${row.id}`,
        title: "It's a match",
        body: matchPreview(otherName),
        avatarUrl: otherAvatar,
        profileId: otherId,
        chatId: otherId,
      });
    };

    const channel = supabase
      .channel(`inapp_matches:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          void handleMatch((payload as any)?.new);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          const next = (payload as any)?.new;
          if (!next) return;
          if ((payload as any)?.old?.status === next.status) return;
          void handleMatch(next);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, matchPreview, profile?.id, pushToast, user?.id]);

  const containerStyle = useMemo(
    () => [styles.container, { top: insets.top + 10 }],
    [insets.top],
  );

  if (!toasts.length) return null;

  return (
    <View pointerEvents="box-none" style={containerStyle}>
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          theme={theme}
          onPress={openToastTarget}
          onMute={muteToastConversation}
          onQuickReply={quickReplyToToast}
          onReplyingChange={setToastReplying}
        />
      ))}
    </View>
  );
}

const getToastBadgeLabel = (toast: ToastItem) => {
  switch (toast.kind) {
    case 'message':
      return 'Message';
    case 'message_reaction':
      return 'Reaction';
    case 'live_location':
      return 'Live location';
    case 'date_plan':
      return 'Date plan';
    case 'media':
      if (toast.mediaThumbnailKind === 'video') return 'Video';
      if (toast.mediaThumbnailKind === 'document') return 'Document';
      if (toast.mediaThumbnailKind === 'location') return 'Location';
      if (toast.mediaThumbnailKind === 'date_plan') return 'Date plan';
      return 'Media';
    case 'moment':
      return 'Moment';
    case 'system':
      return 'Update';
    default:
      return 'Alert';
  }
};

const getToastIconName = (toast: ToastItem): React.ComponentProps<typeof MaterialCommunityIcons>['name'] => {
  switch (toast.kind) {
    case 'message_reaction':
      return 'emoticon-happy-outline';
    case 'live_location':
      return 'map-marker-radius-outline';
    case 'date_plan':
      return 'calendar-heart';
    case 'media':
      if (toast.mediaThumbnailKind === 'video') return 'video-outline';
      if (toast.mediaThumbnailKind === 'document') return 'file-document-outline';
      if (toast.mediaThumbnailKind === 'location') return 'map-marker-outline';
      if (toast.mediaThumbnailKind === 'date_plan') return 'calendar-heart';
      return 'image-outline';
    case 'moment':
      return 'image-marker-outline';
    case 'system':
      return 'bell-outline';
    default:
      return 'message-outline';
  }
};

const getToastRailColors = (toast: ToastItem, theme: typeof Colors.light): readonly [string, string] => {
  switch (toast.kind) {
    case 'message_reaction':
      return [theme.accent, theme.tint];
    case 'live_location':
      return ['#1DBA8A', theme.tint];
    case 'date_plan':
      return ['#F59E0B', '#F97316'];
    case 'media':
      return ['#06B6D4', theme.tint];
    case 'moment':
      return [theme.accent, '#F97316'];
    case 'system':
      return [theme.textMuted, theme.text];
    default:
      return [theme.tint, theme.accent];
  }
};

const shouldShowReplyAction = (toast: ToastItem) =>
  toast.kind === 'message' || toast.kind === 'media' || toast.kind === 'date_plan' || toast.kind === 'live_location';

const canMuteToastConversation = (toast: ToastItem) =>
  Boolean(toast.peerUserId) &&
  (toast.kind === 'message' ||
    toast.kind === 'media' ||
    toast.kind === 'date_plan' ||
    toast.kind === 'live_location' ||
    toast.kind === 'message_reaction');

const getToastPreviewFallbackIcon = (
  toast: ToastItem,
): React.ComponentProps<typeof MaterialCommunityIcons>['name'] => {
  if (toast.mediaThumbnailKind === 'document') return 'file-document-outline';
  if (toast.mediaThumbnailKind === 'location') return 'map-marker-radius-outline';
  if (toast.mediaThumbnailKind === 'date_plan' || toast.kind === 'date_plan') return 'calendar-heart';
  if (toast.mediaThumbnailKind === 'video') return 'video-outline';
  return getToastIconName(toast);
};

const getToastPreviewFallbackTitle = (toast: ToastItem) => {
  if (toast.mediaThumbnailKind === 'document') return 'Document';
  if (toast.mediaThumbnailKind === 'location') return toast.body.includes('Live') ? 'Live' : 'Location';
  if (toast.mediaThumbnailKind === 'date_plan' || toast.kind === 'date_plan') return 'Date plan';
  if (toast.mediaThumbnailKind === 'video') return 'Video';
  return null;
};

function ToastCard({
  toast,
  theme,
  onPress,
  onMute,
  onQuickReply,
  onReplyingChange,
}: {
  toast: ToastItem;
  theme: typeof Colors.light;
  onPress: (toast: ToastItem) => void;
  onMute: (toast: ToastItem) => void;
  onQuickReply: (toast: ToastItem, text: string) => Promise<boolean>;
  onReplyingChange: (toastId: string, isReplying: boolean, groupKey?: string | null) => void;
}) {
  const translateY = useRef(new Animated.Value(-14)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const replyIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const railColors = getToastRailColors(toast, theme);
  const canOpen = Boolean(toast.profileId || toast.chatId || toast.route);
  const safeToastAvatarUrl = getSafeRemoteImageUri(toast.avatarUrl);
  const safeToastThumbnailUrl = getSafeRemoteImageUri(toast.mediaThumbnailUrl);
  const [resolvedPreviewSource, setResolvedPreviewSource] = useState<ToastThumbnailSource>(null);
  const fallbackPreviewTitle = getToastPreviewFallbackTitle(toast);
  const hasActions = canOpen || canMuteToastConversation(toast);
  const canInlineReply = shouldShowReplyAction(toast) && Boolean(toast.peerUserId);
  const documentPreviewBadge =
    toast.mediaThumbnailKind === 'document' ? getDocumentPreviewBadge(toast.mediaThumbnailLabel) : null;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 14,
        bounciness: 7,
      }),
    ]).start();
  }, [opacity, translateY]);

  useEffect(() => {
    onReplyingChange(toast.id, isReplying, toast.groupKey ?? null);
    return () => {
      onReplyingChange(toast.id, false, toast.groupKey ?? null);
    };
  }, [isReplying, onReplyingChange, toast.groupKey, toast.id]);

  const clearReplyIdleTimer = useCallback(() => {
    if (replyIdleTimeoutRef.current) {
      clearTimeout(replyIdleTimeoutRef.current);
      replyIdleTimeoutRef.current = null;
    }
  }, []);

  const closeReplyComposer = useCallback(() => {
    clearReplyIdleTimer();
    setReplyText('');
    setIsReplying(false);
  }, [clearReplyIdleTimer]);

  const scheduleReplyIdleCollapse = useCallback(() => {
    clearReplyIdleTimer();
    replyIdleTimeoutRef.current = setTimeout(() => {
      setReplyText('');
      setIsReplying(false);
    }, 12000);
  }, [clearReplyIdleTimer]);

  useEffect(() => {
    let active = true;

    if (toast.mediaThumbnailKind !== 'video') {
      setResolvedPreviewSource(safeToastThumbnailUrl ? { uri: safeToastThumbnailUrl } : null);
      return () => {
        active = false;
      };
    }

    if (!safeToastThumbnailUrl) {
      setResolvedPreviewSource(null);
      return () => {
        active = false;
      };
    }

    const cached = videoThumbnailCache.get(safeToastThumbnailUrl);
    if (cached) {
      setResolvedPreviewSource(cached);
      return () => {
        active = false;
      };
    }

    setResolvedPreviewSource(null);
    void resolveVideoThumbnailSource(safeToastThumbnailUrl).then((source) => {
      if (!active) return;
      setResolvedPreviewSource(source);
    });

    return () => {
      active = false;
    };
  }, [safeToastThumbnailUrl, toast.mediaThumbnailKind]);

  useEffect(() => {
    if (!isReplying || isSendingReply) {
      clearReplyIdleTimer();
      return;
    }

    scheduleReplyIdleCollapse();
    return () => {
      clearReplyIdleTimer();
    };
  }, [clearReplyIdleTimer, isReplying, isSendingReply, replyText, scheduleReplyIdleCollapse]);

  const submitQuickReply = useCallback(async () => {
    if (isSendingReply) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setIsSendingReply(true);
    const sent = await onQuickReply(toast, trimmed);
    if (!sent) {
      setIsSendingReply(false);
      return;
    }
    setReplyText('');
    setIsReplying(false);
    setIsSendingReply(false);
  }, [isSendingReply, onQuickReply, replyText, toast]);

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          borderColor: theme.outline,
          backgroundColor: theme.background,
          shadowColor: theme.text,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="auto"
    >
      <LinearGradient
        colors={railColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.toastRail}
      />
      <Pressable
        onPress={() => onPress(toast)}
        disabled={!canOpen}
        style={({ pressed }) => [styles.toastMainPressable, { opacity: pressed ? 0.88 : 1 }]}
      >
        <View style={styles.toastHeaderRow}>
          <View style={[styles.toastBadge, { backgroundColor: railColors[0] }]}>
            <MaterialCommunityIcons name={getToastIconName(toast)} size={11} color={Colors.light.background} />
            <Text style={styles.toastBadgeText}>{getToastBadgeLabel(toast)}</Text>
          </View>
          {(toast.groupCount ?? 1) > 1 ? (
            <View style={[styles.toastCountPill, { backgroundColor: theme.backgroundSubtle }]}>
              <Text style={[styles.toastCountText, { color: theme.textMuted }]}>{toast.groupCount} new</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.toastContent}>
          {safeToastAvatarUrl ? (
            <Image source={{ uri: safeToastAvatarUrl }} style={styles.toastAvatar} />
          ) : toast.emoji ? (
            <Text style={[styles.toastEmoji, { color: theme.text }]}>{toast.emoji}</Text>
          ) : (
            <View style={[styles.toastIconFallback, { backgroundColor: theme.backgroundSubtle }]}>
              <MaterialCommunityIcons name={getToastIconName(toast)} size={18} color={railColors[0]} />
            </View>
          )}

          <View style={styles.toastTextCol}>
            <Text numberOfLines={1} style={[styles.toastTitle, { color: theme.text }]}>
              {toast.title}
            </Text>
            <Text numberOfLines={2} style={[styles.toastBody, { color: theme.textMuted }]}>
              {toast.body}
            </Text>
          </View>

          {resolvedPreviewSource ? (
            <View style={styles.toastThumbWrap}>
              <ExpoImage source={resolvedPreviewSource} style={styles.toastMediaThumb} contentFit="cover" transition={120} />
              {toast.mediaThumbnailKind === 'video' ? (
                <View style={[styles.toastThumbOverlay, { backgroundColor: 'rgba(9, 16, 15, 0.46)' }]}>
                  <MaterialCommunityIcons name="play" size={14} color={Colors.light.background} />
                </View>
              ) : null}
            </View>
          ) : toast.mediaThumbnailKind ? (
            <View style={[styles.toastPreviewCard, { backgroundColor: theme.backgroundSubtle }]}>
              <View style={styles.toastPreviewCardTopRow}>
                <MaterialCommunityIcons
                  name={getToastPreviewFallbackIcon(toast)}
                  size={18}
                  color={railColors[0]}
                />
                {documentPreviewBadge ? (
                  <View style={[styles.toastPreviewDocBadge, { backgroundColor: `${railColors[0]}1A` }]}>
                    <Text style={[styles.toastPreviewDocBadgeText, { color: railColors[0] }]}>
                      {documentPreviewBadge}
                    </Text>
                  </View>
                ) : null}
              </View>
              {fallbackPreviewTitle ? (
                <Text numberOfLines={1} style={[styles.toastPreviewTitle, { color: theme.text }]}>
                  {fallbackPreviewTitle}
                </Text>
              ) : null}
              {toast.mediaThumbnailLabel ? (
                <Text numberOfLines={1} style={[styles.toastPreviewMeta, { color: theme.textMuted }]}>
                  {toast.mediaThumbnailLabel}
                </Text>
              ) : null}
            </View>
          ) : toast.kind === 'date_plan' || toast.kind === 'live_location' ? (
            <View style={[styles.toastPreviewCard, { backgroundColor: theme.backgroundSubtle }]}>
              <MaterialCommunityIcons
                name={getToastPreviewFallbackIcon(toast)}
                size={18}
                color={railColors[0]}
              />
              {fallbackPreviewTitle ? (
                <Text numberOfLines={1} style={[styles.toastPreviewTitle, { color: theme.text }]}>
                  {fallbackPreviewTitle}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>

      {hasActions ? (
        <View style={[styles.toastActionsRow, { borderTopColor: theme.outline }]}>
          {canInlineReply ? (
            <Pressable style={styles.toastActionButton} onPress={() => onPress(toast)}>
              <Text style={[styles.toastActionText, { color: theme.tint }]}>Open</Text>
            </Pressable>
          ) : canOpen ? (
            <Pressable style={styles.toastActionButton} onPress={() => onPress(toast)}>
              <Text style={[styles.toastActionText, { color: theme.tint }]}>
                Open
              </Text>
            </Pressable>
          ) : null}
          {canInlineReply ? (
            <Pressable
              style={styles.toastActionButton}
              onPress={() => {
                if (isReplying) {
                  closeReplyComposer();
                  return;
                }
                setIsReplying(true);
              }}
            >
              <Text style={[styles.toastActionText, { color: isReplying ? railColors[0] : theme.textMuted }]}>
                {isReplying ? 'Cancel' : 'Reply'}
              </Text>
            </Pressable>
          ) : null}
          {canMuteToastConversation(toast) ? (
            <Pressable style={styles.toastActionButton} onPress={() => onMute(toast)}>
              <Text style={[styles.toastActionText, { color: theme.textMuted }]}>Mute</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isReplying ? (
        <View style={[styles.toastReplyComposer, { borderTopColor: theme.outline }]}>
          <TextInput
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Reply quickly..."
            placeholderTextColor={theme.textMuted}
            style={[
              styles.toastReplyInput,
              {
                color: theme.text,
                borderColor: theme.outline,
                backgroundColor: theme.backgroundSubtle,
              },
            ]}
            multiline
            maxLength={240}
            editable={!isSendingReply}
            onFocus={scheduleReplyIdleCollapse}
            onBlur={() => {
              if (!replyText.trim() && !isSendingReply) {
                closeReplyComposer();
              }
            }}
          />
          <Pressable
            style={[styles.toastReplyCancel, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            onPress={closeReplyComposer}
            disabled={isSendingReply}
          >
            <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
          </Pressable>
          <Pressable
            style={[
              styles.toastReplySend,
              {
                backgroundColor: replyText.trim() && !isSendingReply ? theme.tint : theme.backgroundSubtle,
              },
            ]}
            onPress={() => {
              void submitQuickReply();
            }}
            disabled={!replyText.trim() || isSendingReply}
          >
            {isSendingReply ? (
              <ActivityIndicator size="small" color={Colors.light.background} />
            ) : (
              <MaterialCommunityIcons
                name="send"
                size={16}
                color={replyText.trim() ? Colors.light.background : theme.textMuted}
              />
            )}
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    gap: 10,
  },
  toast: {
    borderRadius: 16,
    borderWidth: 1,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: 'hidden',
  },
  toastMainPressable: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  toastRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  toastHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  toastBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  toastBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.light.background,
  },
  toastCountPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  toastCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastEmoji: {
    fontSize: 20,
  },
  toastIconFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  toastTextCol: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  toastBody: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  toastMediaThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  toastThumbWrap: {
    width: 42,
    height: 42,
  },
  toastThumbOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastPreviewCard: {
    width: 64,
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
  },
  toastPreviewCardTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toastPreviewDocBadge: {
    minWidth: 24,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastPreviewDocBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  toastPreviewTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  toastPreviewMeta: {
    fontSize: 9,
    lineHeight: 12,
  },
  toastActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toastActionButton: {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toastReplyComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toastReplyInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 84,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  toastReplyCancel: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastReplySend: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
