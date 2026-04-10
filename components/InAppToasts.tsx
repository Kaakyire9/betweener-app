import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { getSafeRemoteImageUri, getUserFacingDisplayName } from '@/lib/profile/display-name';
import { getDatePlanPreviewText } from '@/lib/message-preview';
import { supabase } from '@/lib/supabase';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastItem = {
  id: string;
  title: string;
  body: string;
  emoji?: string | null;
  avatarUrl?: string | null;
  profileId?: string | null;
  chatId?: string | null;
  route?: string | null;
  routeParams?: Record<string, string>;
};

type NotificationPrefs = {
  inapp_enabled: boolean;
  preview_text: boolean;
  messages: boolean;
  message_reactions: boolean;
  reactions: boolean;
  likes: boolean;
  superlikes: boolean;
  matches: boolean;
  moments: boolean;
  notes: boolean;
  gifts: boolean;
  boosts: boolean;
  verification: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_tz: string | null;
};

const TOAST_DURATION_MS = 4200;

type ProfileLite = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  account_state?: string | null;
  deleted_at?: string | null;
  avatar_url: string | null;
};

export default function InAppToasts() {
  const { user, profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const isChatRoute = useMemo(() => pathname?.startsWith('/chat'), [pathname]);
  const isMomentsRoute = useMemo(
    () => pathname?.startsWith('/moments') || pathname === '/my-moments',
    [pathname],
  );

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const timeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastToastAtRef = useRef<Record<string, number>>({});
  const profileCacheRef = useRef<Map<string, ProfileLite>>(new Map());
  const momentRelationshipCueCacheRef = useRef<Map<string, string | null>>(new Map());

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

  const pushToast = useCallback((toast: ToastItem) => {
    const now = Date.now();
    const lastShownAt = lastToastAtRef.current[toast.id];
    if (lastShownAt && now - lastShownAt < TOAST_DURATION_MS) {
      return;
    }
    lastToastAtRef.current[toast.id] = now;
    setToasts((prev) => [toast, ...prev.filter((item) => item.id !== toast.id)].slice(0, 3));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (timeouts.current[toast.id]) {
      clearTimeout(timeouts.current[toast.id]);
    }
    timeouts.current[toast.id] = setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, TOAST_DURATION_MS);
  }, []);

  const activeChatId = useMemo(() => {
    if (!pathname?.startsWith('/chat/')) return null;
    const parts = pathname.split('/').filter(Boolean);
    return parts[1] || null;
  }, [pathname]);

  const isActiveChatWith = useCallback(
    (otherId?: string | null) => Boolean(activeChatId && otherId && activeChatId === otherId),
    [activeChatId],
  );

  useEffect(() => {
    return () => {
      Object.values(timeouts.current).forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const loadPrefs = async () => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select(
          'inapp_enabled,preview_text,messages,message_reactions,reactions,likes,superlikes,matches,moments,notes,gifts,boosts,verification,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_tz',
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
          reactions: Boolean(data.reactions),
          likes: Boolean(data.likes),
          superlikes: Boolean(data.superlikes),
          matches: Boolean(data.matches),
          moments: Boolean((data as any).moments),
          notes: Boolean(data.notes),
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
            reactions: Boolean(row.reactions),
            likes: Boolean(row.likes),
            superlikes: Boolean(row.superlikes),
            matches: Boolean(row.matches),
            moments: Boolean(row.moments),
            notes: Boolean(row.notes),
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
          if (!canInAppNotify('messages')) return;
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
            const peerUserId = typeof row.peer_user_id === 'string' ? row.peer_user_id : null;
            const peer = peerUserId ? await getProfileLite(peerUserId, { preferUserId: true }) : null;
            const peerName = getUserFacingDisplayName(peer, 'They');
            const preview = systemMessagePreview(row, peerName);
            const requestType =
              typeof row?.metadata?.request_type === 'string' ? String(row.metadata.request_type) : '';

            pushToast({
              id: `system-${row.id}`,
              title: preview.title,
              body: preview.body,
              avatarUrl: peer?.avatar_url ?? null,
              profileId: peer?.id ?? null,
              chatId:
                row.event_type === 'request_accepted' ||
                row.event_type === 'date_plan_accepted' ||
                row.event_type === 'date_plan_declined' ||
                row.event_type === 'date_plan_cancelled' ||
                row.event_type === 'date_plan_concierge_requested'
                  ? peer?.id ?? null
                  : null,
              route: row.event_type === 'request_expired' ? '/(tabs)/intent' : null,
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
  }, [canInAppNotify, getProfileLite, pushToast, systemMessagePreview, user?.id]);

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
  }, [canInAppNotify, intentRequestPreview, profile?.id, pushToast]);

  const messagePreview = useCallback((row: any, previewsAllowed: boolean) => {
    if (!previewsAllowed) return 'Sent you a message';
    const datePlanPreview = getDatePlanPreviewText(row?.text);
    if (datePlanPreview) return datePlanPreview;
    if (row?.text) return row.text;
    if (row?.message_type === 'image') return 'Photo';
    if (row?.message_type === 'video') return 'Video';
    if (row?.message_type === 'voice') return 'Voice message';
    if (row?.message_type === 'location') return 'Location';
    return 'New message';
  }, []);

  const messageReactionPreview = useCallback((row: any, emoji: string | null | undefined, previewsAllowed: boolean) => {
    const reactionPrefix = emoji ? `reacted ${emoji}` : 'reacted';
    if (!previewsAllowed) return `${reactionPrefix} to your message`;

    const datePlanPreview = getDatePlanPreviewText(row?.text);
    if (datePlanPreview) return `${reactionPrefix} to your date suggestion`;

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

  const momentCommentPreview = useCallback((commentRow: any, previewsAllowed: boolean, relationshipCue?: string | null) => {
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
    if (!previewsAllowed) return cueLead ? `${cueLead} commented on your Moment` : 'Commented on your Moment';
    const snippet = String(commentRow?.body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return snippet ? `${cueLead ? `${cueLead} commented` : 'Commented'}: "${snippet}"` : cueLead ? `${cueLead} commented on your Moment` : 'Commented on your Moment';
  }, []);

  const quotedSnippet = useCallback((value: string | null | undefined, maxLength: number) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.slice(0, maxLength);
  }, []);

  const verificationMethodLabel = useCallback((verificationType?: string | null) => {
    switch ((verificationType || '').toLowerCase()) {
      case 'social':
        return 'social proof';
      case 'selfie_liveness':
        return 'face check';
      case 'passport':
        return 'passport proof';
      case 'residence':
        return 'residence proof';
      case 'workplace':
        return 'work or study proof';
      default:
        return 'verification';
    }
  }, []);

  const intentRequestPreview = useCallback((requestType?: string | null) => {
    switch (requestType) {
      case 'connect':
        return 'Opened the door to a thoughtful conversation.';
      case 'date_request':
        return 'Would like to take this beyond the app.';
      case 'circle_intro':
        return 'Opened a warmer introduction to connect.';
      case 'like_with_note':
        return 'Left a note worth your attention.';
      default:
        return 'Opened a meaningful way to connect.';
    }
  }, []);

  const intentReminderPreview = useCallback((requestType?: string | null, isLastChance: boolean) => {
    if (isLastChance) {
      return 'This opening is about to close. If you are curious, answer now.';
    }
    switch (requestType) {
      case 'date_request':
        return 'Would still like to take this beyond the app.';
      case 'like_with_note':
        return 'Left you a note worth answering.';
      case 'circle_intro':
        return 'Opened a more personal way to connect.';
      case 'connect':
      default:
        return 'Left the door open for a thoughtful reply.';
    }
  }, []);

  const swipePreview = useCallback((action?: string | null) => {
    return action === 'SUPERLIKE'
      ? 'Made a stronger move toward you.'
      : 'Noticed you and wanted you to know.';
  }, []);

  const matchPreview = useCallback((otherName: string) => {
    return `You and ${otherName || 'them'} saw something in each other. Start with something real.`;
  }, []);

  const notePreview = useCallback(
    (note: string | null | undefined, previewsAllowed: boolean) => {
      if (!previewsAllowed) return 'Left you a note worth opening.';
      const snippet = quotedSnippet(note, 120);
      return snippet ? `Left you a note: "${snippet}"` : 'Left you a note worth opening.';
    },
    [quotedSnippet],
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

  const systemMessagePreview = useCallback(
    (row: any, peerName: string) => {
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
    },
    [],
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
          router.push({ pathname: toast.route as any, params: toast.routeParams });
        } else {
          router.push(toast.route as any);
        }
        return;
      }
      if (toast.chatId) {
        router.push({
          pathname: '/chat/[id]',
          params: {
            id: toast.chatId,
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

    const channel = supabase
      .channel(`inapp_messages:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.sender_id === user.id) return;
          if (isChatRoute) return;
          if (isActiveChatWith(row.sender_id)) return;
          if (!canInAppNotify('messages')) return;
          const previewAllowed = prefs?.preview_text !== false;
          const preview = messagePreview(row, previewAllowed);
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
              avatarUrl,
              profileId: senderProfileId ?? null,
              chatId: senderProfileId ?? String(row.sender_id),
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, getProfileLite, isActiveChatWith, isChatRoute, messagePreview, prefs?.preview_text, pushToast, user?.id]);

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
          if (row.user_id === user.id) return;
          if (isChatRoute) return;
          if (!canInAppNotify('message_reactions')) return;
          void (async () => {
            let name = 'Someone';
            let avatarUrl: string | null = null;
            let otherId: string | null = null;
            let reactorProfileId: string | null = null;
            let reactionBody = row.emoji ? `reacted ${row.emoji}` : 'reacted to your message';
            try {
              const { data: messageRow } = await supabase
                .from('messages')
                .select('sender_id,receiver_id,text,message_type')
                .eq('id', row.message_id)
                .maybeSingle();
              if (!messageRow?.sender_id || !messageRow?.receiver_id) return;
              if (messageRow.sender_id !== user.id && messageRow.receiver_id !== user.id) return;
              otherId = messageRow.sender_id === user.id ? messageRow.receiver_id : messageRow.sender_id;
              if (isActiveChatWith(otherId)) return;
              reactionBody = messageReactionPreview(messageRow, row.emoji, prefs?.preview_text !== false);
              const p = await getProfileLite(String(row.user_id), { preferUserId: true });
              name = getUserFacingDisplayName(p, 'Someone');
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) reactorProfileId = p.id;
            } catch {}

            pushToast({
              id: `message-reaction-${row.id}`,
              title: name,
              body: reactionBody,
              avatarUrl,
              profileId: reactorProfileId ?? null,
              chatId: reactorProfileId ?? otherId ?? String(row.user_id),
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, getProfileLite, isActiveChatWith, isChatRoute, messageReactionPreview, prefs?.preview_text, pushToast, user?.id]);

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

            pushToast({
              id: `moment-post-${row.id}`,
              title: name,
              body: momentPostPreview(row, prefs?.preview_text !== false, relationshipCue),
              avatarUrl,
              profileId: posterProfileId ?? null,
              route: '/moments',
              routeParams: {
                startUserId: String(row.user_id),
                startMomentId: String(row.id),
              },
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
    momentPostPreview,
    prefs?.preview_text,
    profile?.id,
    pushToast,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    const handleMomentReaction = (payload: any) => {
      const row = payload?.new as any;
      if (!row) return;
      if (payload?.eventType === 'UPDATE' && payload?.old?.emoji === row.emoji) return;
      if (row.user_id === user.id) return;
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

        pushToast({
          id: `moment-reaction-${row.id}`,
          title: name,
          body: momentReactionPreview(momentRow, row.emoji, prefs?.preview_text !== false, relationshipCue),
          avatarUrl,
          profileId: reactorProfileId ?? null,
          route: '/moments',
          routeParams: {
            startUserId: String(user.id),
            startMomentId: String(momentRow.id),
            entrySource: 'reaction',
            reactionEmoji: row.emoji ? String(row.emoji) : '',
          },
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
    momentReactionPreview,
    prefs?.preview_text,
    pushToast,
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
          if (!canInAppNotify('moments')) return;
          if (isMomentsRoute) return;
          void (async () => {
            const { data: momentRow } = await supabase
              .from('moments')
              .select('id,user_id,is_deleted')
              .eq('id', row.moment_id)
              .maybeSingle();
            if (!momentRow || momentRow.user_id !== user.id || momentRow.is_deleted) return;

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
              body: momentCommentPreview(row, prefs?.preview_text !== false, relationshipCue),
              avatarUrl,
              profileId: commenterProfileId ?? null,
              route: '/moments',
              routeParams: {
                startUserId: String(user.id),
                startMomentId: String(momentRow.id),
                openComments: '1',
                entrySource: 'comment',
                commentId: String(row.id),
              },
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
    momentCommentPreview,
    prefs?.preview_text,
    pushToast,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, any> | undefined;
      const pushType = typeof data?.type === 'string' ? data.type : '';
      if (pushType === 'moment_post' || pushType === 'moment_reaction' || pushType === 'moment_comment') {
        if (!canInAppNotify('moments')) return;
        if (isMomentsRoute) return;

        const momentId = data?.moment_id ? String(data.moment_id) : '';
        const commentId = data?.comment_id ? String(data.comment_id) : '';
        const reactionId = data?.reaction_id ? String(data.reaction_id) : '';
        const startUserId =
          data?.start_user_id ||
          data?.poster_user_id ||
          data?.moment_owner_user_id ||
          data?.user_id;

        pushToast({
          id:
            pushType === 'moment_comment'
              ? `moment-comment-${commentId || momentId}`
              : pushType === 'moment_reaction'
                ? `moment-reaction-${reactionId || momentId}`
                : `moment-post-${momentId}`,
          title: notification.request.content.title || 'Someone',
          body: notification.request.content.body || 'Shared a new Moment',
          avatarUrl: typeof data?.avatar_url === 'string' ? data.avatar_url : null,
          profileId: data?.profile_id ? String(data.profile_id) : null,
          route: '/moments',
          routeParams: {
            startUserId: startUserId ? String(startUserId) : '',
            startMomentId: momentId,
            openComments: pushType === 'moment_comment' ? '1' : '',
            entrySource: pushType === 'moment_comment' ? 'comment' : pushType === 'moment_reaction' ? 'reaction' : '',
            commentId: pushType === 'moment_comment' ? commentId : '',
            reactionEmoji:
              pushType === 'moment_reaction'
                ? (data?.emoji ? String(data.emoji) : data?.reaction_emoji ? String(data.reaction_emoji) : '')
                : '',
          },
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
              : intentReminderPreview(data?.request_type ? String(data.request_type) : '', pushType === 'intent_last_chance')),
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
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    canInAppNotify,
    intentReminderPreview,
    intentRequestPreview,
    isMomentsRoute,
    isQuietHours,
    prefs,
    pushToast,
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
      .channel(`inapp_notes:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profile_notes', filter: `profile_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.sender_id === user.id) return;
          if (!canInAppNotify('notes')) return;
          void (async () => {
              let name = 'New note';
            let avatarUrl: string | null = null;
            let senderProfileId: string | null = null;
            try {
              const p = await getProfileLite(String(row.sender_id), { preferUserId: true });
                name = getUserFacingDisplayName(p, 'New note');
                if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) senderProfileId = p.id;
            } catch {}
            pushToast({
              id: `note-${row.id}`,
              title: name,
              body: notePreview(row.note, prefs?.preview_text !== false),
              avatarUrl,
              profileId: senderProfileId ?? null,
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, getProfileLite, notePreview, prefs?.preview_text, profile?.id, pushToast, user?.id]);

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
    if (!profile?.id) return;

    const handleMatch = async (row: any) => {
      if (!row) return;
      if (row.status !== 'ACCEPTED') return;
      if (row.user1_id !== profile.id && row.user2_id !== profile.id) return;
      if (!canInAppNotify('matches')) return;

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
        <ToastCard key={toast.id} toast={toast} theme={theme} onPress={openToastTarget} />
      ))}
    </View>
  );
}

function ToastCard({
  toast,
  theme,
  onPress,
}: {
  toast: ToastItem;
  theme: typeof Colors.light;
  onPress: (toast: ToastItem) => void;
}) {
  const translateY = useRef(new Animated.Value(-14)).current;
  const opacity = useRef(new Animated.Value(0)).current;

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

  return (
    <Pressable
      onPress={() => onPress(toast)}
      disabled={!toast.profileId && !toast.chatId && !toast.route}
      style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
      pointerEvents="auto"
    >
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
      >
        <LinearGradient
          colors={[theme.tint, theme.accent]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.toastRail}
        />
        <View style={styles.toastContent}>
          {(() => {
            const safeToastAvatarUrl = getSafeRemoteImageUri(toast.avatarUrl);
            return safeToastAvatarUrl ? (
              <Image source={{ uri: safeToastAvatarUrl }} style={styles.toastAvatar} />
            ) : null;
          })() ?? (toast.emoji ? (
            <Text style={[styles.toastEmoji, { color: theme.text }]}>{toast.emoji}</Text>
          ) : null)}
          <View style={styles.toastTextCol}>
            <Text numberOfLines={1} style={[styles.toastTitle, { color: theme.text }]}>
              {toast.title}
            </Text>
            <Text numberOfLines={2} style={[styles.toastBody, { color: theme.textMuted }]}>
              {toast.body}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: 'hidden',
  },
  toastRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastEmoji: {
    fontSize: 20,
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
});
