import { LinearGradient } from 'expo-linear-gradient';
import { Bot, Heart, Music2, Radio, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';

import type { ProgramScene } from '@betweener/live-program-domain';
import type { LiveProgramSnapshotV2 } from '../odo/show/odo-show-contracts.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const COPY: Partial<Record<ProgramScene, { eyebrow: string; title: string; body: string }>> = {
  odo_stage: {
    eyebrow: 'ODO · LIVE',
    title: 'Making room for the next connection.',
    body: 'The room stays live while Odo prepares the next thoughtful moment.',
  },
  music_intermission: {
    eyebrow: 'BETWEENER · INTERMISSION',
    title: 'A little room to breathe.',
    body: 'Stay close. The next connection is being prepared.',
  },
  branded_intermission: {
    eyebrow: 'BETWEENER · LIVE',
    title: 'Connection, thoughtfully paced.',
    body: 'The next programme moment will begin shortly.',
  },
  conversation_topic: {
    eyebrow: 'CONVERSATION TOPIC',
    title: 'A thoughtful question for the room.',
    body: 'Share only what feels comfortable. Listening counts too.',
  },
  audience_pulse: {
    eyebrow: 'ROOM PULSE',
    title: 'How is the room feeling?',
    body: 'A small signal helps the Host guide what comes next.',
  },
  session_closing: {
    eyebrow: 'ONE LAST MOMENT',
    title: 'Thank you for showing up.',
    body: 'The programme is closing, but a thoughtful connection can continue.',
  },
  pair_forming: {
    eyebrow: 'ODO · PAIRING',
    title: 'Finding the next thoughtful pairing.',
    body: 'Eligibility and private preferences are being checked before anyone is connected.',
  },
  quick_connect_active: {
    eyebrow: 'QUICK CONNECT · LIVE',
    title: 'A new conversation is underway.',
    body: 'The room stays together while the pair speaks privately.',
  },
};

const programCopy = (program: LiveProgramSnapshotV2) => {
  if (program.currentScene !== 'odo_stage') return COPY[program.currentScene];
  switch (program.showState) {
    case 'pair_forming':
      return COPY.pair_forming;
    case 'low_liquidity':
      return {
        eyebrow: 'ODO · READY',
        title: 'Waiting for the right connection.',
        body: 'The room stays open while another eligible person joins the pool.',
      };
    case 'draining':
      return {
        eyebrow: 'ODO · FINISHING',
        title: 'Letting this moment land.',
        body: 'Current conversations will finish before the programme moves on.',
      };
    case 'recovering':
      return {
        eyebrow: 'ODO · RECONNECTING',
        title: 'Keeping the room steady.',
        body: 'Odo is restoring the programme state without changing anyone’s private choices.',
      };
    default:
      return COPY.odo_stage;
  }
};

export function OdoProgramStage({ program }: { program: LiveProgramSnapshotV2 | null }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const copy = program ? programCopy(program) : null;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!copy || reduceMotion) { pulse.stopAnimation(); pulse.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [copy, pulse, reduceMotion]);

  const animatedStyle = useMemo(() => ({
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }],
  }), [pulse]);
  if (!copy || program?.enabled !== true) return null;
  const musicVisible = program.currentScene === 'music_intermission'
    && program.music.status !== 'stopped';

  return (
    <View accessibilityLabel={`${copy.eyebrow}. ${copy.title}`} pointerEvents="none" style={styles.root}>
      <LinearGradient
        colors={visual.isDark
          ? [visual.color.videoChrome, visual.color.surfaceSoft, visual.color.canvas]
          : [visual.color.surfaceRaised, visual.color.surfaceSoft, visual.color.canvas]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orbitLarge} />
      <View style={styles.orbitSmall} />
      <Animated.View style={[styles.mark, animatedStyle]}>
        {musicVisible
          ? <Music2 color={visual.color.purple} size={27} />
          : <Bot color={visual.color.purple} size={27} />}
      </Animated.View>
      <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <View style={styles.signalRow}>
        <Heart color={visual.color.purple} size={14} />
        <View style={styles.signalLine} />
        <Radio color={visual.color.teal} size={14} />
        <View style={styles.signalLine} />
        <Sparkles color={visual.color.purple} size={14} />
      </View>
      {musicVisible ? (
        <Text style={styles.track}>{program.music.title} · {program.music.artist}</Text>
      ) : null}
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 28, paddingVertical: 24 },
  orbitLarge: { position: 'absolute', width: 330, height: 330, borderRadius: 165, borderWidth: 1, borderColor: visual.color.borderStrong },
  orbitSmall: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 1, borderColor: visual.color.tealSoft },
  mark: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft, borderWidth: 1, borderColor: visual.color.purple, shadowColor: visual.color.purple, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 14, elevation: 4 },
  eyebrow: { marginTop: 18, color: visual.color.purple, fontSize: 9, letterSpacing: 2.2, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 9, maxWidth: 330, color: visual.color.oat, fontSize: 27, lineHeight: 34, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold' },
  body: { marginTop: 9, maxWidth: 320, color: visual.color.textMuted, fontSize: 12, lineHeight: 19, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  signalRow: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
  signalLine: { width: 28, height: 1, backgroundColor: visual.color.borderStrong },
  track: { marginTop: 14, color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
});
