import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastItem = {
  id: string;
  title: string;
  body: string;
  emoji?: string | null;
};

type NotificationPrefs = {
  inapp_enabled: boolean;
  messages: boolean;
  reactions: boolean;
  likes: boolean;
  superlikes: boolean;
  matches: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_tz: string | null;
};

const TOAST_DURATION_MS = 4200;

export default function InAppToasts() {
  const { user, profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const timeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const pushToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => [toast, ...prev.filter((item) => item.id !== toast.id)].slice(0, 3));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (timeouts.current[toast.id]) {
      clearTimeout(timeouts.current[toast.id]);
    }
    timeouts.current[toast.id] = setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, TOAST_DURATION_MS);
  }, []);

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
          'inapp_enabled,messages,reactions,likes,superlikes,matches,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_tz',
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
          messages: Boolean(data.messages),
          reactions: Boolean(data.reactions),
          likes: Boolean(data.likes),
          superlikes: Boolean(data.superlikes),
          matches: Boolean(data.matches),
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
            messages: Boolean(row.messages),
            reactions: Boolean(row.reactions),
            likes: Boolean(row.likes),
            superlikes: Boolean(row.superlikes),
            matches: Boolean(row.matches),
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

  const messagePreview = useCallback((row: any) => {
    if (row?.text) return row.text;
    if (row?.message_type === 'image') return 'Photo';
    if (row?.message_type === 'video') return 'Video';
    if (row?.message_type === 'voice') return 'Voice message';
    if (row?.message_type === 'location') return 'Location';
    return 'New message';
  }, []);

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
          if (!canInAppNotify('messages')) return;
          const preview = messagePreview(row);
          pushToast({
            id: `msg-${row.id}`,
            title: 'New message',
            body: preview,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, messagePreview, pushToast, user?.id]);

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
          const emoji = row.emoji || null;
          pushToast({
            id: `react-${row.id}`,
            title: 'New reaction',
            body: emoji ? `Someone reacted ${emoji}` : 'Someone reacted to your photo',
            emoji,
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
          if (row.action === 'SUPERLIKE') {
            pushToast({
              id: `superlike-${row.id}`,
              title: 'Superlike',
              body: 'You got a superlike',
            });
            return;
          }
          if (row.action === 'LIKE') {
            pushToast({
              id: `like-${row.id}`,
              title: 'New like',
              body: 'Someone liked your profile',
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, profile?.id, pushToast]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`inapp_matches:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.status !== 'ACCEPTED') return;
          if (row.user1_id !== profile.id && row.user2_id !== profile.id) return;
          if (!canInAppNotify('matches')) return;
          pushToast({
            id: `match-${row.id}`,
            title: "It's a match",
            body: 'Say hello to your new match',
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.status !== 'ACCEPTED') return;
          if (row.user1_id !== profile.id && row.user2_id !== profile.id) return;
          if (!canInAppNotify('matches')) return;
          pushToast({
            id: `match-update-${row.id}`,
            title: "It's a match",
            body: 'Say hello to your new match',
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canInAppNotify, profile?.id, pushToast]);

  const containerStyle = useMemo(
    () => [styles.container, { top: insets.top + 10 }],
    [insets.top],
  );

  if (!toasts.length) return null;

  return (
    <View pointerEvents="none" style={containerStyle}>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} theme={theme} />
      ))}
    </View>
  );
}

function ToastCard({ toast, theme }: { toast: ToastItem; theme: typeof Colors.light }) {
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
        {toast.emoji ? (
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
