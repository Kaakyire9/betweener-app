import type { ProgramControllerSource, ProgramScene, ProgramState } from '@betweener/live-program-domain';
import { LinearGradient } from 'expo-linear-gradient';
import { Radio } from 'lucide-react-native';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';

import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const SCENE_LABELS: Record<ProgramScene, string> = {
  host_focus: 'Host Focus',
  host_plus_pool: 'Host & Room',
  pool_focus: 'Room Focus',
  pair_forming: 'Pair Forming',
  quick_connect_active: 'Connection Live',
  audience_pulse: 'Room Pulse',
  conversation_topic: 'Conversation Moment',
  odo_stage: 'Odo Stage',
  music_intermission: 'Betweener Music',
  branded_intermission: 'Betweener Live',
  session_closing: 'Closing Moment',
  screen_full: 'Screen',
  screen_plus_host: 'Screen & Host',
  screen_plus_pair: 'Screen & Pair',
  screen_plus_panel: 'Screen & Panel',
  screen_discussion: 'Screen Discussion',
  screen_plus_pool: 'Screen & Room',
  screen_plus_audience_pulse: 'Screen & Pulse',
  screen_plus_odo: 'Screen & Odo',
  dj_plus_pool: 'DJ & Room',
};

const SOURCE_LABELS: Record<ProgramControllerSource, string> = {
  odo: 'ODO DIRECTOR',
  mobile_host: 'HOST DIRECTION',
  studio_host: 'BETWEENER STUDIO',
  system: 'SAFE PROGRAMME',
};

export const liveProgramSceneLabel = (scene: ProgramScene): string => SCENE_LABELS[scene];

const transitionDuration = (
  transition: ProgramState['transition'],
  scene: ProgramScene,
): number => {
  if (transition === 'cut') return 160;
  if (transition === 'fade') return 760;
  if (['music_intermission', 'branded_intermission', 'session_closing'].includes(scene)) {
    return 680;
  }
  return scene.startsWith('screen_') ? 360 : 480;
};

/** Visual choreography for an already-authoritative Program update. */
export const LiveProgramTransition = memo(function LiveProgramTransition({
  program,
}: {
  program: ProgramState | null;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const veilProgress = useRef(new Animated.Value(0)).current;
  const cueProgress = useRef(new Animated.Value(0)).current;
  const previousVersionRef = useRef(program?.programVersion ?? null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const programVersion = program?.programVersion ?? null;
  const programScene = program?.scene ?? null;
  const programTransition = program?.transition ?? null;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const nextVersion = programVersion;
    const previousVersion = previousVersionRef.current;
    previousVersionRef.current = nextVersion;
    if (!programScene || !programTransition
      || previousVersion == null || nextVersion === previousVersion || reduceMotion) {
      veilProgress.setValue(0);
      cueProgress.setValue(0);
      return undefined;
    }

    const duration = transitionDuration(programTransition, programScene);
    veilProgress.setValue(1);
    cueProgress.setValue(1);
    const animation = Animated.parallel([
      Animated.timing(veilProgress, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(Math.min(1_100, Math.max(620, duration * 1.4))),
        Animated.timing(cueProgress, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [cueProgress, programScene, programTransition, programVersion, reduceMotion, veilProgress]);

  if (!program) return null;
  const maximumVeilOpacity = program.transition === 'fade'
    ? 0.78
    : program.transition === 'cut' ? 0.16 : 0.42;

  return (
    <View pointerEvents="none" style={styles.root}>
      <Animated.View style={[styles.veil, {
        opacity: veilProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, maximumVeilOpacity],
        }),
      }]}>
        <LinearGradient
          colors={[visual.color.canvas, visual.color.purpleSoft, visual.color.canvas]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.cue, {
        opacity: cueProgress,
        transform: [{ translateY: cueProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 0],
        }) }],
      }]}>
        <Radio color={visual.color.teal} size={12} />
        <View style={styles.cueCopy}>
          <Text style={styles.source}>{SOURCE_LABELS[program.controller.source]}</Text>
          <Text style={styles.scene}>{liveProgramSceneLabel(program.scene)}</Text>
        </View>
      </Animated.View>
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 8,
  },
  veil: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  cue: {
    position: 'absolute',
    top: 12,
    right: 12,
    minHeight: 38,
    maxWidth: '72%',
    paddingHorizontal: 12,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: visual.color.surfaceTranslucent,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
  },
  cueCopy: { minWidth: 0 },
  source: {
    color: visual.color.teal,
    fontSize: 7,
    letterSpacing: 1.25,
    fontFamily: 'Manrope_800ExtraBold',
  },
  scene: {
    marginTop: 1,
    color: visual.color.text,
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
  },
});
