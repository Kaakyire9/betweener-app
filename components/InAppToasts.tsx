import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { getDatePlanPreviewText } from '@/lib/message-preview';
import { supabase } from '@/lib/supabase';
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
  notes: boolean;
  gifts: boolean;
  boosts: boolean;
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

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const timeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastToastAtRef = useRef<Record<string, number>>({});
  const profileCacheRef = useRef<Map<string, ProfileLite>>(new Map());

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
          .select('id,user_id,full_name,avatar_url')
          .eq('user_id', id)
          .maybeSingle();
        return (data as ProfileLite | null) ?? null;
      };

      const byProfile = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,avatar_url')
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
          'inapp_enabled,preview_text,messages,message_reactions,reactions,likes,superlikes,matches,notes,gifts,boosts,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_tz',
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
          notes: Boolean(data.notes),
          gifts: Boolean(data.gifts),
          boosts: Boolean(data.boosts),
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
            notes: Boolean(row.notes),
            gifts: Boolean(row.gifts),
            boosts: Boolean(row.boosts),
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
          void (async () => {
            const peerUserId = typeof row.peer_user_id === 'string' ? row.peer_user_id : null;
            const peer = peerUserId ? await getProfileLite(peerUserId, { preferUserId: true }) : null;
            const peerName = (peer?.full_name ?? '').trim() || 'They';
            const titleText = row.event_type === 'request_accepted' ? `${peerName} accepted` : 'Update';
            const bodyText =
              row.event_type === 'request_accepted' ? 'Start with a thoughtful hello.' : (row.text ?? 'Update');

            pushToast({
              id: `system-${row.id}`,
              title: titleText,
              body: bodyText,
              avatarUrl: peer?.avatar_url ?? null,
              profileId: peer?.id ?? null,
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
            .select('full_name,avatar_url')
            .eq('id', row.actor_id)
            .maybeSingle();
          if (data) {
            actorName = data.full_name ?? null;
            actorAvatar = data.avatar_url ?? null;
          }

          const bodyText =
            row.type === 'connect'
              ? 'Sent you a connect request.'
              : row.type === 'date_request'
                ? 'Sent you a date request.'
                : row.type === 'circle_intro'
                  ? 'Sent you a circle intro.'
                  : 'Sent you a request.';

          pushToast({
            id: `intent-${row.id}`,
            title: (actorName ?? '').trim() || 'Someone',
            body: bodyText,
            avatarUrl: actorAvatar,
            profileId: row.actor_id,
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
    const datePlanPreview = getDatePlanPreviewText(row?.text);
    if (datePlanPreview) return datePlanPreview;
    if (row?.text) return row.text;
    if (row?.message_type === 'image') return 'Photo';
    if (row?.message_type === 'video') return 'Video';
    if (row?.message_type === 'voice') return 'Voice message';
    if (row?.message_type === 'location') return 'Location';
    return 'New message';
  }, []);

  const giftLabel = useCallback((giftType?: string | null) => {
    switch (giftType) {
      case 'rose':
        return 'a rose';
      case 'teddy':
        return 'a teddy bear';
      case 'ring':
        return 'a ring';
      default:
        return 'a gift';
    }
  }, []);

  const openToastTarget = useCallback(
    (toast: ToastItem) => {
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
              if (p?.full_name) name = p.full_name;
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
            try {
              const { data: messageRow } = await supabase
                .from('messages')
                .select('sender_id,receiver_id')
                .eq('id', row.message_id)
                .maybeSingle();
              if (!messageRow?.sender_id || !messageRow?.receiver_id) return;
              if (messageRow.sender_id !== user.id && messageRow.receiver_id !== user.id) return;
              otherId = messageRow.sender_id === user.id ? messageRow.receiver_id : messageRow.sender_id;
              if (isActiveChatWith(otherId)) return;
              const p = await getProfileLite(String(row.user_id), { preferUserId: true });
              if (p?.full_name) name = p.full_name;
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) reactorProfileId = p.id;
            } catch {}

            pushToast({
              id: `message-reaction-${row.id}`,
              title: name,
              body: row.emoji ? `reacted ${row.emoji}` : 'reacted to your message',
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
  }, [canInAppNotify, getProfileLite, isActiveChatWith, isChatRoute, pushToast, user?.id]);

  useEffect(() => {
    if (!profile?.id || !user?.id) return;

    const channel = supabase
      .channel(`inapp_profile_reactions:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profile_image_reactions', filter: `profile_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.reactor_user_id === user.id) return;
          if (!canInAppNotify('reactions')) return;
          void (async () => {
            const emoji = row.emoji || null;
            let name = 'Someone';
            let avatarUrl: string | null = null;
            let reactorProfileId: string | null = null;
            try {
              const p = await getProfileLite(String(row.reactor_user_id), { preferUserId: true });
              if (p?.full_name) name = p.full_name;
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) reactorProfileId = p.id;
            } catch {}
            pushToast({
              id: `react-${row.id}`,
              title: name,
              body: emoji ? `reacted ${emoji}` : 'reacted to your photo',
              avatarUrl,
              profileId: reactorProfileId ?? null,
            });
          })();
        },
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
              if (p?.full_name) name = p.full_name;
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) senderProfileId = p.id;
            } catch {}
            pushToast({
              id: `note-${row.id}`,
              title: name,
              body: row.note || 'sent you a note',
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
              if (p?.full_name) name = p.full_name;
              if (p?.avatar_url) avatarUrl = p.avatar_url;
              if (p?.id) senderProfileId = p.id;
            } catch {}
            pushToast({
              id: `gift-${row.id}`,
              title: name,
              body: `${name} sent you ${giftLabel(row.gift_type)}`,
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
  }, [canInAppNotify, getProfileLite, giftLabel, profile?.id, pushToast, user?.id]);

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
            body: 'Your profile is now boosted',
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
                .select('id, full_name, avatar_url')
                .eq('id', row.swiper_id)
                .maybeSingle();
              if (data?.full_name) name = data.full_name;
              if (data?.avatar_url) avatarUrl = data.avatar_url;
            } catch {}

            if (row.action === 'SUPERLIKE') {
              pushToast({
                id: `superlike-${row.id}`,
                title: name,
                body: 'Sent you a superlike',
                avatarUrl,
                profileId: row.swiper_id,
              });
              return;
            }
            if (row.action === 'LIKE') {
              pushToast({
                id: `like-${row.id}`,
                title: name,
                body: 'Liked your profile',
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
                .select('id, full_name, avatar_url')
                .eq('id', row.swiper_id)
                .maybeSingle();
              if (data?.full_name) name = data.full_name;
              if (data?.avatar_url) avatarUrl = data.avatar_url;
            } catch {}

            if (row.action === 'SUPERLIKE') {
              pushToast({
                id: `superlike-${row.id}`,
                title: name,
                body: 'Sent you a superlike',
                avatarUrl,
                profileId: row.swiper_id,
              });
              return;
            }
            if (row.action === 'LIKE') {
              pushToast({
                id: `like-${row.id}`,
                title: name,
                body: 'Liked your profile',
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
  }, [canInAppNotify, profile?.id, pushToast]);

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
      let otherUserId: string | null = null;

      try {
        const { data } = await supabase
          .from('profiles')
          .select('id,user_id,full_name,avatar_url')
          .eq('id', otherId)
          .maybeSingle();
        const profileRow = data as any;
        if (profileRow?.full_name) otherName = profileRow.full_name;
        if (profileRow?.avatar_url) otherAvatar = profileRow.avatar_url;
        if (profileRow?.user_id) otherUserId = profileRow.user_id;
      } catch {
        // best-effort only
      }

      // Mirror server dedupe: if the user just got "NAME accepted", skip the match toast.
      if (otherUserId && user?.id) {
        try {
          const { data: sm } = await supabase
            .from('system_messages')
            .select('id')
            .eq('user_id', user.id)
            .eq('peer_user_id', otherUserId)
            .eq('event_type', 'request_accepted')
            .gte('created_at', new Date(Date.now() - 30_000).toISOString())
            .limit(1);
          if (Array.isArray(sm) && sm.length) return;
        } catch {
          // ignore
        }
      }

      pushToast({
        id: `match-${row.id}`,
        title: "It's a match",
        body: `You and ${otherName || 'them'} matched - say hi.`,
        avatarUrl: otherAvatar,
        profileId: otherId,
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
  }, [canInAppNotify, profile?.id, pushToast, user?.id]);

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
      disabled={!toast.profileId && !toast.chatId}
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
          {toast.avatarUrl ? (
            <Image source={{ uri: toast.avatarUrl }} style={styles.toastAvatar} />
          ) : toast.emoji ? (
            <Text style={[styles.toastEmoji, { color: theme.text }]}>{toast.emoji}</Text>
          ) : null}
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
