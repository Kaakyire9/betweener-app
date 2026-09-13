import * as Haptics from 'expo-haptics';
import { Ellipsis } from 'lucide-react-native';
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion.ts';
import type { LiveReactionKind } from '../application/index.ts';
import {
  LIVE_MORE_REACTIONS,
  LIVE_PRIMARY_REACTIONS,
  type LiveReactionPresentation,
} from './live-reaction-presentation.ts';
import { LiveReactionGlyph } from './LiveReactionGlyph.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type ReactionButtonProps = {
  disabled?: boolean;
  presentation: LiveReactionPresentation;
  reduceMotion: boolean;
  showLabel?: boolean;
  onPress: (reaction: LiveReactionKind) => Promise<boolean>;
};

const ReactionButton = memo(function ReactionButton({
  disabled,
  presentation,
  reduceMotion,
  showLabel,
  onPress,
}: ReactionButtonProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const scale = useRef(new Animated.Value(1)).current;
  const ripple = useRef(new Animated.Value(0)).current;

  const react = useCallback(() => {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (!reduceMotion) {
      ripple.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.spring(scale, { toValue: 0.86, speed: 42, bounciness: 0, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true }),
        ]),
        Animated.timing(ripple, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]).start();
    }
    void onPress(presentation.kind).then((sent) => {
      if (!sent) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    });
  }, [disabled, onPress, presentation.kind, reduceMotion, ripple, scale]);

  const rippleStyle = {
    opacity: ripple.interpolate({
      inputRange: [0, 0.12, 1],
      outputRange: [0, 0.7, 0],
    }),
    transform: [{
      scale: ripple.interpolate({
        inputRange: [0, 1],
        outputRange: [0.7, 1.45],
      }),
    }],
  };

  return (
    <View style={showLabel ? styles.labelledButtonShell : undefined}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          accessibilityLabel={`Send ${presentation.label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(disabled) }}
          disabled={disabled}
          hitSlop={5}
          onPress={react}
          style={({ pressed }) => [
            styles.reaction,
            { borderColor: `${presentation.accent}3D` },
            pressed && styles.reactionPressed,
            disabled && styles.disabled,
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.reactionRipple, { borderColor: presentation.accent }, rippleStyle]}
          />
          <View style={[styles.reactionGlow, { backgroundColor: `${presentation.accent}14` }]} />
          <LiveReactionGlyph color={presentation.accent} kind={presentation.kind} size={18} />
        </Pressable>
      </Animated.View>
      {showLabel ? <Text style={styles.reactionLabel}>{presentation.label}</Text> : null}
    </View>
  );
});

type Props = {
  disabled?: boolean;
  feedback?: string | null;
  onReaction: (reaction: LiveReactionKind) => Promise<boolean>;
  trailing?: ReactNode;
};

export const LiveReactionPicker = memo(function LiveReactionPicker({
  disabled,
  feedback,
  onReaction,
  trailing,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [moreOpen, setMoreOpen] = useState(false);
  const reduceMotion = useReduceMotion();

  const toggleMore = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
    setMoreOpen((current) => !current);
  }, []);

  const selectMoreReaction = useCallback(async (reaction: LiveReactionKind) => {
    setMoreOpen(false);
    return onReaction(reaction);
  }, [onReaction]);

  return (
    <View style={styles.root}>
      {moreOpen ? (
        <View style={styles.tray}>
          <View style={styles.trayHeadingRow}>
            <Text style={styles.trayHeading}>MORE REACTIONS</Text>
            <Text style={styles.trayHint}>Shared live</Text>
          </View>
          <View style={styles.trayButtons}>
            {LIVE_MORE_REACTIONS.map((reaction) => (
              <ReactionButton
                key={reaction.kind}
                disabled={disabled}
                onPress={selectMoreReaction}
                presentation={reaction}
                reduceMotion={reduceMotion}
                showLabel
              />
            ))}
          </View>
        </View>
      ) : null}
      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>
      ) : null}
      <View style={styles.primaryRow}>
        {LIVE_PRIMARY_REACTIONS.map((reaction) => (
          <ReactionButton
            key={reaction.kind}
            disabled={disabled}
            onPress={onReaction}
            presentation={reaction}
            reduceMotion={reduceMotion}
          />
        ))}
        <Pressable
          accessibilityLabel={moreOpen ? 'Close more reactions' : 'Show more reactions'}
          accessibilityRole="button"
          hitSlop={5}
          onPress={toggleMore}
          style={({ pressed }) => [
            styles.moreButton,
            moreOpen && styles.moreButtonOpen,
            pressed && styles.reactionPressed,
          ]}
        >
          <Ellipsis color={moreOpen ? visual.color.teal : visual.color.textMuted} size={19} />
        </Pressable>
        {trailing}
      </View>
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { position: 'relative', zIndex: 20, paddingBottom: 10, gap: 7 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reaction: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: visual.isDark ? '#172A27B8' : '#FFFFFFB8', borderWidth: 0.75 },
  reactionGlow: { position: 'absolute', width: 24, height: 24, borderRadius: 12 },
  reactionRipple: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 1.25 },
  reactionPressed: { opacity: 0.78 },
  disabled: { opacity: 0.42 },
  moreButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.isDark ? '#172A27B8' : '#FFFFFFB8', borderWidth: 0.75, borderColor: visual.color.border },
  moreButtonOpen: { backgroundColor: visual.color.tealSoft, borderColor: visual.color.borderStrong },
  tray: { position: 'absolute', left: 0, right: 0, bottom: 52, zIndex: 40, borderRadius: 18, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 8, backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.borderStrong, shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  trayHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  trayHeading: { color: visual.color.teal, fontSize: 8, letterSpacing: 1.25, fontFamily: 'Manrope_800ExtraBold' },
  trayHint: { color: visual.color.textMuted, fontSize: 8, fontFamily: 'Manrope_600SemiBold' },
  trayButtons: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around' },
  labelledButtonShell: { width: 58, alignItems: 'center', gap: 3 },
  reactionLabel: { color: visual.color.textMuted, fontSize: 7, fontFamily: 'Manrope_600SemiBold' },
  feedback: { color: visual.color.dangerText, fontSize: 9, fontFamily: 'Manrope_600SemiBold', paddingHorizontal: 4 },
});
