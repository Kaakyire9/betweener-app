import { X } from 'lucide-react-native';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useReduceMotion } from '@/hooks/useReduceMotion';
import {
  LIVE_REACTION_KINDS,
  type LiveReactionKind,
  type LiveReactionSummary,
} from '../application/index.ts';
import { LIVE_REACTION_PRESENTATION } from './live-reaction-presentation.ts';
import { LiveReactionGlyph } from './LiveReactionGlyph.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const formatCompactUnit = (value: number, suffix: string) => {
  const rounded = value >= 100
    ? Math.floor(value)
    : Math.round(value * 10) / 10;
  return `${rounded}${suffix}`;
};

export const formatLiveReactionCount = (count: number): string => {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return formatCompactUnit(count / 1_000, 'K');
  if (count < 1_000_000_000) return formatCompactUnit(count / 1_000_000, 'M');
  return formatCompactUnit(count / 1_000_000_000, 'B');
};

type ReactionRow = {
  kind: LiveReactionKind;
  count: number;
};

type Props = {
  summary: LiveReactionSummary;
  accentColor?: string;
};

export const LiveReactionSummaryChip = memo(function LiveReactionSummaryChip({
  summary,
  accentColor,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const reduceMotion = useReduceMotion();
  const countMotion = useRef(new Animated.Value(1)).current;
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const rows = useMemo<readonly ReactionRow[]>(() => (
    LIVE_REACTION_KINDS
      .map((kind) => ({ kind, count: summary.counts[kind] }))
      .filter((row) => row.count > 0)
      .sort((left, right) => right.count - left.count)
  ), [summary.counts]);
  const leaders = rows.slice(0, 2);
  const formattedTotal = formatLiveReactionCount(summary.totalCount);
  const reactionLabel = summary.totalCount === 1 ? 'reaction' : 'reactions';

  useEffect(() => {
    if (summary.totalCount <= 0 || reduceMotion) {
      countMotion.setValue(1);
      return undefined;
    }
    countMotion.setValue(0);
    const animation = Animated.spring(countMotion, {
      toValue: 1,
      speed: 22,
      bounciness: 5,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [countMotion, reduceMotion, summary.totalCount]);

  if (summary.totalCount <= 0) return null;

  const countStyle = {
    opacity: countMotion,
    transform: [{
      translateY: countMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [4, 0],
      }),
    }],
  };

  return (
    <>
      <Pressable
        accessibilityLabel={`${summary.totalCount} room ${reactionLabel}. View reaction mix.`}
        accessibilityRole="button"
        hitSlop={6}
        onPress={() => setBreakdownOpen(true)}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: `${accentColor ?? visual.color.purple}38` },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.leaders}>
          {leaders.map((row, index) => (
            <View
              key={row.kind}
              style={[
                styles.leader,
                index > 0 && styles.leaderOverlap,
              ]}
            >
              <LiveReactionGlyph
                color={LIVE_REACTION_PRESENTATION[row.kind].accent}
                kind={row.kind}
                size={11}
              />
            </View>
          ))}
        </View>
        <Animated.Text style={[styles.chipCount, countStyle]}>{formattedTotal}</Animated.Text>
        <Text style={styles.chipLabel}>{reactionLabel}</Text>
      </Pressable>

      <Modal
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setBreakdownOpen(false)}
        statusBarTranslucent
        transparent
        visible={breakdownOpen}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close reaction mix"
            accessibilityRole="button"
            onPress={() => setBreakdownOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeading}>
              <View style={styles.sheetHeadingCopy}>
                <Text style={styles.eyebrow}>ROOM SIGNAL</Text>
                <Text style={styles.title}>Reaction mix</Text>
                <Text style={styles.subtitle}>
                  {formattedTotal} {reactionLabel} shared anonymously
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close reaction mix"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setBreakdownOpen(false)}
                style={styles.closeButton}
              >
                <X color={visual.color.text} size={18} />
              </Pressable>
            </View>
            <View style={styles.mixList}>
              {rows.map((row) => {
                const presentation = LIVE_REACTION_PRESENTATION[row.kind];
                const share = Math.max(4, (row.count / summary.totalCount) * 100);
                return (
                  <View key={row.kind} style={styles.mixRow}>
                    <View style={[styles.mixGlyph, { backgroundColor: `${presentation.accent}1F` }]}>
                      <LiveReactionGlyph color={presentation.accent} kind={row.kind} size={17} />
                    </View>
                    <View style={styles.mixBody}>
                      <View style={styles.mixCopy}>
                        <Text style={styles.mixLabel}>{presentation.label}</Text>
                        <Text style={styles.mixCount}>{formatLiveReactionCount(row.count)}</Text>
                      </View>
                      <View style={styles.track}>
                        <View
                          style={[
                            styles.fill,
                            { backgroundColor: presentation.accent, width: `${share}%` },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={styles.privacy}>A shared room signal — never a member leaderboard.</Text>
          </View>
        </View>
      </Modal>
    </>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  chip: {
    minHeight: 27,
    maxWidth: 118,
    paddingHorizontal: 8,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: visual.isDark ? '#172B28D9' : '#FFFFFFD9',
    borderWidth: 1,
  },
  pressed: { opacity: 0.72 },
  leaders: { flexDirection: 'row', alignItems: 'center', marginRight: 2 },
  leader: {
    width: 14,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderOverlap: { marginLeft: -3 },
  chipCount: { color: visual.color.text, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  chipLabel: { color: visual.color.textMuted, fontSize: 8, fontFamily: 'Manrope_600SemiBold' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: visual.color.scrim },
  sheet: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: visual.color.surface,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    marginBottom: 17,
    borderRadius: 2,
    backgroundColor: visual.color.borderStrong,
  },
  sheetHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sheetHeadingCopy: { flex: 1, paddingRight: 18 },
  eyebrow: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.8, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 4, color: visual.color.text, fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  subtitle: { marginTop: 4, color: visual.color.textMuted, fontSize: 11, fontFamily: 'Manrope_500Medium' },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.surfaceRaised,
    borderWidth: 1,
    borderColor: visual.color.border,
  },
  mixList: { marginTop: 22, gap: 15 },
  mixRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mixGlyph: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  mixBody: { flex: 1, gap: 6 },
  mixCopy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mixLabel: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_700Bold' },
  mixCount: { color: visual.color.textMuted, fontSize: 11, fontFamily: 'Manrope_700Bold' },
  track: { height: 3, overflow: 'hidden', borderRadius: 2, backgroundColor: visual.color.surfaceRaised },
  fill: { height: 3, borderRadius: 2 },
  privacy: { marginTop: 22, color: visual.color.textMuted, fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
});
