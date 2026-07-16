import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type SignatureSystem = 'signal' | 'intent' | 'warm_intro' | 'love_seat';

type SignatureSystemBubbleProps = {
  system: SignatureSystem;
  inverted?: boolean;
  compact?: boolean;
};

const SYSTEM_COPY: Record<
  SignatureSystem,
  {
    eyebrow: string;
    title: string;
    body: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    steps: [string, string, string];
    activeStep: number;
  }
> = {
  signal: {
    eyebrow: 'Betweener signature · Signal',
    title: 'Show what stood out',
    body: 'More thoughtful than a Notice, lighter than an Intent. Choose a reason; add a note if it helps.',
    icon: 'broadcast',
    steps: ['Notice', 'Signal', 'Intent'],
    activeStep: 1,
  },
  intent: {
    eyebrow: 'Betweener signature · Intent',
    title: 'Ask with clarity',
    body: 'A direct request to connect. It stays open for 48 hours and only begins when they accept.',
    icon: 'message-draw',
    steps: ['Notice', 'Signal', 'Intent'],
    activeStep: 2,
  },
  warm_intro: {
    eyebrow: 'Circle signature · Warm Introduction',
    title: 'Introduced with context',
    body: 'A Circle host sees potential. You both choose privately before a connection opens.',
    icon: 'account-heart-outline',
    steps: ['Host suggests', 'Both agree', 'Connect'],
    activeStep: 0,
  },
  love_seat: {
    eyebrow: 'Circle signature · Love Seat',
    title: 'Be discovered in conversation',
    body: 'An opt-in Circle spotlight for thoughtful questions. You stay in control and may leave anytime.',
    icon: 'heart-circle-outline',
    steps: ['Opt in', 'Be featured', 'Leave anytime'],
    activeStep: 0,
  },
};

function SignatureSystemBubble({ system, inverted = false, compact = false }: SignatureSystemBubbleProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const copy = SYSTEM_COPY[system];
  const styles = useMemo(
    () => createStyles(theme, isDark, inverted, compact),
    [compact, inverted, isDark, theme],
  );

  return (
    <LinearGradientSafe
      colors={
        inverted
          ? ['rgba(244,232,208,0.34)', 'rgba(151,113,214,0.3)', 'rgba(19,168,168,0.3)']
          : isDark
            ? ['rgba(244,232,208,0.2)', 'rgba(155,124,200,0.28)', 'rgba(0,160,160,0.3)']
            : ['rgba(201,154,46,0.28)', 'rgba(125,91,166,0.22)', 'rgba(0,128,128,0.24)']
      }
      start={[0, 0]}
      end={[1, 1]}
      style={styles.border}
      accessibilityRole="summary"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
    >
      <View style={styles.surface}>
        <View style={styles.header}>
          <View style={styles.iconShell}>
            <MaterialCommunityIcons name={copy.icon} size={compact ? 15 : 17} color={styles.icon.color} />
          </View>
          <Text style={styles.eyebrow} numberOfLines={1}>{copy.eyebrow}</Text>
          <MaterialCommunityIcons name="star-four-points" size={11} color={styles.spark.color} />
        </View>

        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        <View style={styles.path} accessibilityLabel={`Connection path: ${copy.steps.join(', ')}`}>
          {copy.steps.map((step, index) => {
            const active = index === copy.activeStep;
            const completed = index < copy.activeStep;
            return (
              <View key={`${system}:${step}`} style={styles.pathItem}>
                <View style={[styles.pathDot, (active || completed) && styles.pathDotActive]}>
                  {completed ? (
                    <MaterialCommunityIcons name="check" size={8} color={styles.pathDotIcon.color} />
                  ) : null}
                </View>
                <Text style={[styles.pathLabel, active && styles.pathLabelActive]} numberOfLines={1}>{step}</Text>
                {index < copy.steps.length - 1 ? <View style={[styles.pathLine, completed && styles.pathLineActive]} /> : null}
              </View>
            );
          })}
        </View>
      </View>
    </LinearGradientSafe>
  );
}

export default memo(SignatureSystemBubble);

const createStyles = (
  theme: typeof Colors.light,
  isDark: boolean,
  inverted: boolean,
  compact: boolean,
) => {
  const text = inverted ? '#FFF9EF' : theme.text;
  const muted = inverted ? 'rgba(255,249,239,0.74)' : theme.textMuted;
  const accent = inverted ? '#F4E8D0' : theme.tint;

  return StyleSheet.create({
    border: {
      marginTop: compact ? 8 : 12,
      padding: 1,
      borderRadius: compact ? 17 : 20,
      shadowColor: inverted ? '#070F12' : theme.accent,
      shadowOpacity: isDark || inverted ? 0.18 : 0.1,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,
    },
    surface: {
      paddingHorizontal: compact ? 12 : 14,
      paddingVertical: compact ? 10 : 12,
      borderRadius: compact ? 16 : 19,
      backgroundColor: inverted
        ? 'rgba(7,24,29,0.82)'
        : isDark
          ? 'rgba(7,30,34,0.9)'
          : 'rgba(255,250,244,0.94)',
      overflow: 'hidden',
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    iconShell: {
      width: compact ? 25 : 28,
      height: compact ? 25 : 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: inverted ? 'rgba(244,232,208,0.35)' : `${theme.tint}42`,
      backgroundColor: inverted ? 'rgba(244,232,208,0.1)' : `${theme.tint}12`,
    },
    icon: { color: accent },
    spark: { color: inverted ? '#E4BE67' : '#C99A2E' },
    eyebrow: {
      flex: 1,
      color: accent,
      fontSize: compact ? 8 : 9,
      lineHeight: compact ? 11 : 12,
      fontWeight: '900',
      letterSpacing: 1.15,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: compact ? 7 : 8,
      color: text,
      fontSize: compact ? 14 : 15,
      lineHeight: compact ? 18 : 20,
      fontWeight: '900',
    },
    body: {
      marginTop: 3,
      color: muted,
      fontSize: compact ? 10 : 11,
      lineHeight: compact ? 14 : 16,
      fontWeight: '600',
    },
    path: { marginTop: compact ? 9 : 11, flexDirection: 'row', alignItems: 'center' },
    pathItem: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
    pathDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: inverted ? 'rgba(244,232,208,0.42)' : `${theme.textMuted}52`,
      backgroundColor: 'transparent',
    },
    pathDotActive: { borderColor: accent, backgroundColor: accent },
    pathDotIcon: { color: inverted ? '#163032' : '#FFFFFF' },
    pathLabel: {
      marginLeft: 5,
      color: muted,
      fontSize: compact ? 8 : 9,
      fontWeight: '700',
    },
    pathLabelActive: { color: text, fontWeight: '900' },
    pathLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      marginHorizontal: 5,
      backgroundColor: inverted ? 'rgba(244,232,208,0.2)' : `${theme.textMuted}28`,
    },
    pathLineActive: { backgroundColor: accent },
  });
};
