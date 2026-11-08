import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { Colors } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { VibesAccessReason } from '@/lib/vibes/vibes-access-state';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Theme = typeof Colors.light;

type AccessCopy = {
  eyebrow: string;
  title: string;
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  primaryLabel: string;
};

const COPY: Record<VibesAccessReason, AccessCopy> = {
  visibility_off: {
    eyebrow: 'Discovery paused',
    title: 'Your profile is hidden',
    body: 'You are not appearing to other people, and Vibes stays private until you choose to return.',
    icon: 'eye-off-outline',
    primaryLabel: 'Make me visible',
  },
  matchmaking_mode: {
    eyebrow: 'Matchmaking mode',
    title: 'Your profile is private',
    body: 'Matchmaking mode keeps you out of discovery while you help friends find meaningful connections.',
    icon: 'account-heart-outline',
    primaryLabel: 'Review matchmaking',
  },
  moderation_hidden: {
    eyebrow: 'Profile attention',
    title: 'Your profile needs a quick review',
    body: 'Open your profile to see what needs attention. Discovery will return when your profile is ready.',
    icon: 'shield-account-outline',
    primaryLabel: 'Review my profile',
  },
  profile_incomplete: {
    eyebrow: 'Almost ready',
    title: 'Finish your story first',
    body: 'Complete your profile so every introduction begins with enough context, trust, and intention.',
    icon: 'account-edit-outline',
    primaryLabel: 'Complete my profile',
  },
  account_unavailable: {
    eyebrow: 'Discovery unavailable',
    title: 'Your account needs attention',
    body: 'Review your profile and account status before returning to Vibes.',
    icon: 'account-alert-outline',
    primaryLabel: 'Review my account',
  },
};

type Props = {
  reason: VibesAccessReason;
  theme: Theme;
  isDark: boolean;
  compact?: boolean;
  busy?: boolean;
  error?: string | null;
  onPrimaryPress: () => void;
  onSecondaryPress?: () => void;
};

export default function VibesAccessStateCard({
  reason,
  theme,
  isDark,
  compact = false,
  busy = false,
  error,
  onPrimaryPress,
  onSecondaryPress,
}: Props) {
  const copy = COPY[reason];
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 16)).current;
  const styles = useMemo(() => createStyles(theme, isDark), [isDark, theme]);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, reduceMotion, translateY]);

  return (
    <Animated.View
      style={[
        styles.container,
        compact ? styles.containerCompact : null,
        { opacity, transform: [{ translateY }] },
      ]}
      accessibilityLiveRegion="polite"
    >
      <LinearGradientSafe
        colors={isDark
          ? ['rgba(0,160,160,0.18)', 'rgba(125,91,166,0.12)']
          : ['rgba(0,128,128,0.12)', 'rgba(125,91,166,0.08)']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.iconHalo}>
        <View style={styles.iconCore}>
          <MaterialCommunityIcons name={copy.icon} size={compact ? 26 : 30} color={theme.tint} />
        </View>
      </View>
      <View style={styles.badge}>
        <View style={styles.badgeDot} />
        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
      </View>
      <Text style={[styles.title, compact ? styles.titleCompact : null]}>{copy.title}</Text>
      <Text style={[styles.body, compact ? styles.bodyCompact : null]}>{copy.body}</Text>

      {error ? (
        <View style={styles.errorPanel} accessibilityRole="alert">
          <MaterialCommunityIcons name="alert-circle-outline" size={17} color={theme.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryButton, busy ? styles.buttonDisabled : null]}
        onPress={onPrimaryPress}
        activeOpacity={0.86}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={copy.primaryLabel}
        accessibilityState={{ busy, disabled: busy }}
      >
        {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
          <MaterialCommunityIcons
            name={reason === 'visibility_off' ? 'eye-check-outline' : 'arrow-right'}
            size={19}
            color="#FFFFFF"
          />
        )}
        <Text style={styles.primaryButtonText}>
          {busy ? 'Opening Vibes…' : copy.primaryLabel}
        </Text>
      </TouchableOpacity>

      {onSecondaryPress ? (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onSecondaryPress}
          activeOpacity={0.78}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Review profile settings"
        >
          <Text style={styles.secondaryButtonText}>Review profile settings</Text>
          <MaterialCommunityIcons name="chevron-right" size={17} color={theme.textMuted} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.privacyRow}>
        <MaterialCommunityIcons name="shield-check-outline" size={15} color={theme.textMuted} />
        <Text style={styles.privacyText}>You stay in control of when your profile appears.</Text>
      </View>
    </Animated.View>
  );
}

const createStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: {
    width: '88%',
    maxWidth: 440,
    overflow: 'hidden',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(91,193,187,0.24)' : 'rgba(0,128,128,0.18)',
    backgroundColor: isDark ? 'rgba(17,31,31,0.97)' : 'rgba(255,252,248,0.98)',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    shadowColor: isDark ? '#000000' : '#183C3B',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: isDark ? 0.28 : 0.13,
    shadowRadius: 28,
    elevation: 12,
  },
  containerCompact: {
    width: '94%',
    borderRadius: 23,
    paddingHorizontal: 18,
    paddingTop: 19,
    paddingBottom: 16,
  },
  glow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    top: -88,
    right: -55,
    backgroundColor: isDark ? 'rgba(155,124,200,0.11)' : 'rgba(125,91,166,0.09)',
  },
  iconHalo: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(91,193,187,0.22)' : 'rgba(0,128,128,0.13)',
    backgroundColor: isDark ? 'rgba(0,160,160,0.08)' : 'rgba(0,128,128,0.055)',
    marginBottom: 13,
  },
  iconCore: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(0,160,160,0.13)' : 'rgba(255,255,255,0.84)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(155,124,200,0.24)' : 'rgba(125,91,166,0.15)',
    backgroundColor: isDark ? 'rgba(155,124,200,0.09)' : 'rgba(125,91,166,0.07)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginBottom: 12,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.accent,
  },
  eyebrow: {
    color: theme.accent,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.25,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.text,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  titleCompact: { fontSize: 21, lineHeight: 27 },
  body: {
    maxWidth: 350,
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 18,
  },
  bodyCompact: { fontSize: 13, lineHeight: 19, marginBottom: 15 },
  errorPanel: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: isDark ? 'rgba(248,113,113,0.09)' : 'rgba(220,38,38,0.06)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(248,113,113,0.18)' : 'rgba(220,38,38,0.12)',
  },
  errorText: { flex: 1, color: theme.danger, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  primaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: theme.tint,
    paddingHorizontal: 18,
    shadowColor: theme.tint,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.25 : 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.1 },
  secondaryButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginTop: 5,
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: theme.textMuted, fontSize: 12.5, fontWeight: '700' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  privacyText: { color: theme.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '500' },
});
