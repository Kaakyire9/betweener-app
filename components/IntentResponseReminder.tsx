import SignalIcon from '@/components/icons/SignalIcon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { readCache, writeCache } from '@/lib/persisted-cache';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ReminderState = {
  waitingCount: number;
  endingSoonCount: number;
  signalCount: number;
  requestCount: number;
  mode: 'brief' | 'reminder';
};

type ReminderCache = {
  signature: string;
};

type DailyBriefCache = {
  dateKey: string;
};

const REMINDER_CACHE_MS = 90 * 60 * 1000;
const DAILY_BRIEF_CACHE_MS = 26 * 60 * 60 * 1000;

const hoursUntil = (iso?: string | null) => {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return (ts - Date.now()) / 3600000;
};

export default function IntentResponseReminder() {
  const { profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const [reminder, setReminder] = useState<ReminderState | null>(null);
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(-18)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const lastQueryAtRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldSuppress = useMemo(() => {
    if (!profile?.id) return true;
    if (!pathname) return false;
    return (
      pathname.includes('/intent') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/signup') ||
      pathname.startsWith('/onboarding') ||
      pathname.startsWith('/verify')
    );
  }, [pathname, profile?.id]);

  const animateVisible = useCallback(
    (nextVisible: boolean) => {
      setVisible(nextVisible);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: nextVisible ? 1 : 0,
          duration: nextVisible ? 260 : 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: nextVisible ? 0 : -18,
          duration: nextVisible ? 320 : 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!nextVisible) setReminder(null);
      });
    },
    [opacity, translateY],
  );

  const dismiss = useCallback(
    async (persist = true) => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (persist && profile?.id && reminder) {
        await writeCache<ReminderCache>(`intent-response-reminder:${profile.id}`, {
          signature: `${reminder.waitingCount}:${reminder.endingSoonCount}`,
        }).catch(() => undefined);
      }
      animateVisible(false);
    },
    [animateVisible, profile?.id, reminder],
  );

  const openIntent = useCallback(() => {
    void Haptics.selectionAsync();
    void dismiss(true);
    router.push({ pathname: '/(tabs)/intent', params: { filter: 'action' } } as never);
  }, [dismiss, router]);

  const loadReminder = useCallback(async () => {
    if (!profile?.id || shouldSuppress) return;
    const now = Date.now();
    if (now - lastQueryAtRef.current < 15000) return;
    lastQueryAtRef.current = now;

    const nowIso = new Date().toISOString();
    const [signalsResult, requestsResult] = await Promise.all([
      (supabase as any)
        .from('profile_signal_gestures')
        .select('id,expires_at')
        .eq('receiver_profile_id', profile.id)
        .in('status', ['sent', 'seen'])
        .gt('expires_at', nowIso)
        .limit(20),
      supabase
        .from('intent_requests')
        .select('id,expires_at')
        .eq('recipient_id', profile.id)
        .eq('status', 'pending')
        .gt('expires_at', nowIso)
        .limit(20),
    ]);

    if (signalsResult.error || requestsResult.error) return;
    const signals = ((signalsResult.data as Array<{ id: string; expires_at: string }> | null) ?? []).filter(Boolean);
    const requests = ((requestsResult.data as Array<{ id: string; expires_at: string }> | null) ?? []).filter(Boolean);
    const signalCount = signals.length;
    const requestCount = requests.length;
    const waitingCount = signalCount + requestCount;
    if (waitingCount <= 0) return;

    const endingSoonCount =
      signals.filter((item) => {
        const hours = hoursUntil(item.expires_at);
        return typeof hours === 'number' && hours <= 6;
      }).length +
      requests.filter((item) => {
        const hours = hoursUntil(item.expires_at);
        return typeof hours === 'number' && hours <= 6;
      }).length;

    const signature = `${waitingCount}:${endingSoonCount}`;
    const dateKey = new Date().toISOString().slice(0, 10);
    const briefCache = await readCache<DailyBriefCache>(
      `intent-connection-brief:${profile.id}`,
      DAILY_BRIEF_CACHE_MS,
    ).catch(() => null);
    const shouldShowBrief = briefCache?.dateKey !== dateKey;
    const cached = await readCache<ReminderCache>(`intent-response-reminder:${profile.id}`, REMINDER_CACHE_MS).catch(() => null);
    if (!shouldShowBrief && cached?.signature === signature && endingSoonCount === 0) return;

    if (shouldShowBrief) {
      await writeCache<DailyBriefCache>(`intent-connection-brief:${profile.id}`, { dateKey }).catch(() => undefined);
    }

    setReminder({ waitingCount, endingSoonCount, signalCount, requestCount, mode: shouldShowBrief ? 'brief' : 'reminder' });
    animateVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      void dismiss(false);
    }, 6200);
  }, [animateVisible, dismiss, profile?.id, shouldSuppress]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadReminder();
    }, 1100);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setTimeout(() => void loadReminder(), 700);
      }
    });
    return () => {
      clearTimeout(t);
      sub.remove();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [loadReminder]);

  if (!visible || !reminder) return null;

  const title =
    reminder.mode === 'brief'
      ? `${reminder.waitingCount} thoughtful ${reminder.waitingCount === 1 ? 'request' : 'requests'}`
      : reminder.endingSoonCount > 0
        ? `${reminder.endingSoonCount} ending soon`
        : `${reminder.waitingCount} waiting`;
  const body =
    reminder.mode === 'brief'
      ? reminder.endingSoonCount > 0
        ? `${reminder.endingSoonCount === 1 ? 'One' : reminder.endingSoonCount} ${reminder.endingSoonCount === 1 ? 'intention ends' : 'intentions end'} soon.`
        : 'Your Intent queue has something worth reviewing today.'
      : reminder.signalCount > 0 && reminder.requestCount > 0
        ? `${reminder.signalCount} Signal${reminder.signalCount === 1 ? '' : 's'} and ${reminder.requestCount} request${reminder.requestCount === 1 ? '' : 's'} need your decision.`
        : reminder.signalCount > 0
          ? `${reminder.signalCount} Signal${reminder.signalCount === 1 ? '' : 's'} waiting for your decision.`
          : `${reminder.requestCount} request${reminder.requestCount === 1 ? '' : 's'} waiting for your response.`;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          paddingTop: Math.max(insets.top, 12) + 14,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${body}`}
        onPress={openIntent}
        style={styles.card}
      >
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? ['rgba(19,168,168,0.18)', 'rgba(7,30,34,0.94)', 'rgba(139,92,255,0.10)']
              : ['rgba(255,250,244,0.96)', 'rgba(230,250,247,0.92)', 'rgba(139,92,255,0.08)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.iconShell}>
          {reminder.endingSoonCount > 0 ? (
            <MaterialCommunityIcons name="timer-alert-outline" size={22} color={theme.accent} />
          ) : (
            <SignalIcon size={27} color={theme.tint} accentColor={theme.accent} active />
          )}
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{reminder.mode === 'brief' ? 'Connection brief' : 'Intent queue'}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body} numberOfLines={1}>
            {body}
          </Text>
        </View>
        <View style={styles.reviewPill}>
          <Text style={styles.reviewText}>Review</Text>
          <MaterialCommunityIcons name="chevron-right" size={15} color={theme.tint} />
        </View>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss Intent reminder"
          onPress={(event) => {
            event.stopPropagation();
            void dismiss(true);
          }}
          style={styles.close}
        >
          <MaterialCommunityIcons name="close" size={14} color={theme.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    host: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 200,
      paddingHorizontal: 14,
    },
    card: {
      minHeight: 76,
      overflow: 'hidden',
      borderRadius: 26,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(244,232,208,0.15)' : 'rgba(15,61,62,0.10)',
      backgroundColor: isDark ? 'rgba(7,30,34,0.94)' : 'rgba(255,250,244,0.96)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingLeft: 12,
      paddingRight: 42,
      paddingVertical: 11,
      shadowColor: isDark ? '#13A8A8' : '#0F3D3E',
      shadowOpacity: isDark ? 0.18 : 0.10,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    iconShell: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(19,168,168,0.26)' : 'rgba(19,128,128,0.16)',
      backgroundColor: isDark ? 'rgba(19,168,168,0.08)' : 'rgba(255,255,255,0.72)',
    },
    copy: { flex: 1, minWidth: 0 },
    eyebrow: {
      color: theme.tint,
      fontSize: 9,
      lineHeight: 12,
      fontWeight: '900',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: 1,
      color: theme.text,
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '900',
    },
    body: {
      marginTop: 2,
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },
    reviewPill: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(19,168,168,0.20)' : 'rgba(19,128,128,0.14)',
      backgroundColor: isDark ? 'rgba(19,168,168,0.06)' : 'rgba(255,255,255,0.66)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingLeft: 10,
      paddingRight: 8,
    },
    reviewText: {
      color: theme.tint,
      fontSize: 11,
      fontWeight: '900',
    },
    close: {
      position: 'absolute',
      right: 10,
      top: 10,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.72,
      backgroundColor: isDark ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.38)',
    },
  });
