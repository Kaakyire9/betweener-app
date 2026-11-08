import type { ProgramSource } from '@betweener/live-program-domain';
import { BarChart3, Bot, Radio, Sparkles, UsersRound } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LIVE_VISUAL } from './live-visual-tokens.ts';

const COPY: Record<string, { eyebrow: string; title: string }> = {
  quick_connect_pool: {
    eyebrow: 'QUICK CONNECT',
    title: 'The room is gathering.',
  },
  active_pair: {
    eyebrow: 'ACTIVE PAIR',
    title: 'A thoughtful conversation is underway.',
  },
  audience_pulse: {
    eyebrow: 'ROOM PULSE',
    title: 'The room is shaping the moment.',
  },
  odo_stage: {
    eyebrow: 'ODO · LIVE',
    title: 'Thoughtful direction, in motion.',
  },
  branded_visual: {
    eyebrow: 'BETWEENER LIVE',
    title: 'Making room for connection.',
  },
};

const iconFor = (source: ProgramSource | undefined) => {
  if (source?.type === 'quick_connect_pool' || source?.type === 'active_pair') return UsersRound;
  if (source?.type === 'audience_pulse') return BarChart3;
  if (source?.type === 'odo_stage') return Bot;
  return Sparkles;
};

export const LiveProgramVisualSource = memo(function LiveProgramVisualSource({
  source,
}: {
  source: ProgramSource | undefined;
}) {
  const copy = source ? COPY[source.type] : undefined;
  const Icon = iconFor(source);
  const pulse = source?.type === 'audience_pulse';
  const pool = source?.type === 'quick_connect_pool';

  return (
    <View style={styles.root}>
      <View style={styles.ambient} />
      <View style={styles.orbit} />
      {pool ? (
        <View accessibilityLabel="Quick Connect room visualization" style={styles.constellation}>
          {[0, 1, 2, 3].map((item) => <View key={item} style={[styles.member, MEMBER_POSITIONS[item]]} />)}
          <View style={styles.constellationCore}><Radio color={LIVE_VISUAL.color.teal} size={17} /></View>
        </View>
      ) : pulse ? (
        <View accessibilityLabel="Room Pulse visualization" style={styles.pulseBars}>
          {[15, 29, 21, 37, 25, 33, 18].map((height, index) => (
            <View key={`${height}-${index}`} style={[styles.pulseBar, { height }]} />
          ))}
        </View>
      ) : (
        <View style={styles.iconShell}><Icon color={LIVE_VISUAL.color.teal} size={25} /></View>
      )}
      <Text style={styles.eyebrow}>{copy?.eyebrow ?? 'BETWEENER LIVE'}</Text>
      <Text numberOfLines={2} style={styles.title}>{copy?.title ?? 'Making room for connection.'}</Text>
      {source?.health === 'degraded' ? <Text style={styles.status}>Source recovering</Text> : null}
    </View>
  );
});

const MEMBER_POSITIONS = [
  { top: 0, left: 29 },
  { top: 29, right: 0 },
  { bottom: 0, left: 29 },
  { top: 29, left: 0 },
] as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 16,
    backgroundColor: '#09211D',
  },
  ambient: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#7658A72A',
  },
  orbit: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.borderStrong,
  },
  iconShell: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LIVE_VISUAL.color.tealSoft,
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.borderStrong,
  },
  constellation: { width: 82, height: 82 },
  constellationCore: {
    position: 'absolute',
    top: 25,
    left: 25,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#09211D',
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.teal,
  },
  member: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6F5A91',
    borderWidth: 1,
    borderColor: '#CDBAF066',
  },
  pulseBars: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pulseBar: { width: 4, borderRadius: 2, backgroundColor: LIVE_VISUAL.color.teal },
  eyebrow: {
    marginTop: 14,
    color: LIVE_VISUAL.color.teal,
    fontSize: 8,
    letterSpacing: 1.8,
    textAlign: 'center',
    fontFamily: 'Manrope_800ExtraBold',
  },
  title: {
    maxWidth: 260,
    marginTop: 7,
    color: '#FFF7EC',
    fontSize: 19,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  status: { marginTop: 7, color: '#AFC1BA', fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
});
