import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { LockKeyhole, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/hooks/useReduceMotion.ts';
import type { LiveChemistrySnapshot } from '../application/index.ts';
import { liveChemistryAction, liveChemistryContextLine } from '../domain/live-chemistry.ts';
import { LIVE_PRIVATE_SPARK_MOTION } from '../motion/live-private-spark-motion.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = {
  required: boolean;
  snapshot: LiveChemistrySnapshot | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onOfferReveal: () => void;
  onReady: () => void;
  onRetry: () => void;
};

const ORBIT_STARS = [
  { x: -58, y: -42, size: 3 },
  { x: 66, y: -30, size: 4 },
  { x: 54, y: 51, size: 3 },
  { x: -68, y: 38, size: 4 },
] as const;

export function LiveChemistryOverlay({
  required, snapshot, loading, busy, error, onOfferReveal, onReady, onRetry,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const [dismissed, setDismissed] = useState(snapshot?.state === 'revealed');
  const revealedHapticRef = useRef<string | null>(null);
  const sourceKey = snapshot ? `${snapshot.sourceKind}:${snapshot.sourceId}` : 'pending';
  const action = liveChemistryAction(snapshot);
  const context = useMemo(() => snapshot ? [
    snapshot.otherPersonContext.age == null ? null : `Age ${snapshot.otherPersonContext.age}`,
    snapshot.otherPersonContext.city?.trim() ? snapshot.otherPersonContext.city.trim() : null,
    snapshot.otherPersonContext.lookingFor?.trim()
      ? snapshot.otherPersonContext.lookingFor.trim()
      : null,
    ...snapshot.otherPersonContext.values.map((value) => liveChemistryContextLine(value)),
  ].filter((value): value is string => Boolean(value)) : [], [snapshot]);

  useEffect(() => {
    setDismissed(snapshot?.state === 'revealed');
    reveal.setValue(0);
    entrance.stopAnimation();
    orbit.stopAnimation();
    breathe.stopAnimation();
    if (reduceMotion) {
      entrance.setValue(1);
      orbit.setValue(0.16);
      breathe.setValue(0.5);
      return undefined;
    }

    entrance.setValue(0);
    const entranceAnimation = Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: LIVE_PRIVATE_SPARK_MOTION.chemistryEntranceMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(Animated.timing(orbit, {
        toValue: 1,
        duration: 14_000,
        easing: Easing.linear,
        useNativeDriver: true,
      })),
      Animated.loop(Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2_200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2_200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
    ]);
    entranceAnimation.start();
    return () => entranceAnimation.stop();
    // The source key deliberately restarts the cinematic language for a new room.
  }, [sourceKey, reduceMotion]);

  useEffect(() => {
    if (snapshot?.state !== 'revealed' || dismissed) return;
    if (reduceMotion) {
      reveal.setValue(1);
      setDismissed(true);
      return;
    }
    if (revealedHapticRef.current !== sourceKey) {
      revealedHapticRef.current = sourceKey;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: LIVE_PRIVATE_SPARK_MOTION.chemistryRevealMs,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setDismissed(true);
    });
    return () => animation.stop();
  }, [dismissed, reduceMotion, reveal, snapshot?.state, sourceKey]);

  if (!required || snapshot?.state === 'ended' || (snapshot?.state === 'revealed' && dismissed)) return null;
  const name = snapshot?.otherPersonContext.fullName?.trim() || 'Your conversation';
  const rootOpacity = Animated.multiply(
    entrance,
    reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  );
  const contentOpacity = entrance.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0, 1] });
  const contentTranslateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });
  const curtainOpacity = entrance.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 0.82, 0.58] });

  return (
    <Animated.View
      accessibilityLabel="Chemistry First. The private conversation is concealed until both people choose to reveal."
      style={[
        styles.overlay,
        {
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 28),
        },
        {
          opacity: rootOpacity,
          transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }],
        },
      ]}
      pointerEvents="auto"
    >
      <LinearGradient
        colors={visual.isDark
          ? ['#03100EF7', '#0A211DF8', '#15152AF8']
          : ['#EFF5F1FA', '#E6F0ECFA', '#EEE8F5FA']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[
        styles.curtain,
        styles.curtainLeft,
        {
          opacity: curtainOpacity,
          transform: [{ translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }) }],
        },
      ]} />
      <Animated.View style={[
        styles.curtain,
        styles.curtainRight,
        {
          opacity: curtainOpacity,
          transform: [{ translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }],
        },
      ]} />

      <Animated.View style={[
        styles.halo,
        {
          opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.38] }),
          transform: [
            { scale: entrance.interpolate({ inputRange: [0, 0.62, 1], outputRange: [0.54, 1.08, 1] }) },
            { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) },
          ],
        },
      ]} />
      <Animated.View style={[
        styles.orbit,
        {
          opacity: entrance,
          transform: [{ rotate: orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        },
      ]}>
        {ORBIT_STARS.map((star, index) => (
          <View
            key={`${star.x}:${star.y}`}
            style={[
              styles.orbitStar,
              {
                width: star.size,
                height: star.size,
                borderRadius: star.size / 2,
                backgroundColor: index % 2 === 0 ? visual.color.teal : visual.color.purple,
                transform: [{ translateX: star.x }, { translateY: star.y }],
              },
            ]}
          />
        ))}
      </Animated.View>

      <Animated.View style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          fadingEdgeLength={18}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <Animated.View style={[
            styles.icon,
            { transform: [{ scale: entrance.interpolate({ inputRange: [0, 0.52, 0.76, 1], outputRange: [0.58, 0.58, 1.12, 1] }) }] },
          ]}>
            <Sparkles color={visual.color.purple} size={22} strokeWidth={1.8} />
            <View style={styles.lockBadge}><LockKeyhole color={visual.color.oat} size={9} strokeWidth={2.2} /></View>
          </Animated.View>
          <Text style={styles.eyebrow}>CHEMISTRY FIRST</Text>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.copy}>Meet the person before the picture.</Text>
          <Text style={styles.promise}>Stay with the conversation before the full picture appears.</Text>
          {context.length ? (
            <View style={styles.contextRow}>
              {context.slice(0, 5).map((item, index) => (
                <View key={`${item}:${index}`} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <Animated.View style={[
          styles.actionArea,
          {
            opacity: entrance.interpolate({ inputRange: [0, 0.58, 1], outputRange: [0, 0, 1] }),
            transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          },
        ]}>
          {loading || (!snapshot && !error) ? (
            <View accessibilityLabel="Preparing Chemistry First" style={styles.loadingMark}>
              {[0, 1, 2].map((index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.loadingDot,
                    {
                      opacity: breathe.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: index === 1 ? [0.35, 1, 0.35] : [0.74, 0.4, 0.74],
                      }),
                      transform: [{ translateY: breathe.interpolate({
                        inputRange: [0, 1],
                        outputRange: index === 1 ? [2, -2] : [-1, 1],
                      }) }],
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorArea}>
              <Text style={styles.error}>This private reveal could not be verified yet. Video remains protected.</Text>
              <Pressable disabled={busy} onPress={onRetry} style={styles.retryButton}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
          {!error && !loading && snapshot && action === 'offer_reveal' ? (
            <Pressable disabled={busy} onPress={onOfferReveal} style={[styles.button, busy && styles.disabled]}>
              <Text style={styles.buttonText}>{busy ? 'Offering…' : 'Offer the reveal'}</Text>
            </Pressable>
          ) : null}
          {!error && !loading && snapshot && action === 'mark_ready' ? (
            <Pressable disabled={busy} onPress={onReady} style={[styles.button, busy && styles.disabled]}>
              <Text style={styles.buttonText}>{busy ? 'Holding…' : 'Reveal when we both agree'}</Text>
            </Pressable>
          ) : null}
          {!error && !loading && snapshot && action === 'waiting' ? (
            <View style={styles.waiting}>
              <View style={styles.waitingPulse} />
              <Text style={styles.waitingText}>Keep talking a little longer.</Text>
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 16 },
  curtain: { position: 'absolute', top: '-8%', bottom: '-8%', width: '58%', borderWidth: 0.75, borderColor: `${visual.color.purple}24`, backgroundColor: visual.isDark ? '#10201DD6' : '#F6F3F0D9' },
  curtainLeft: { left: '-4%', borderTopRightRadius: 160, borderBottomRightRadius: 160 },
  curtainRight: { right: '-4%', borderTopLeftRadius: 160, borderBottomLeftRadius: 160 },
  halo: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: visual.color.purpleSoft, borderWidth: 1, borderColor: `${visual.color.purple}24`, shadowColor: visual.color.purple, shadowOpacity: 0.42, shadowRadius: 70 },
  orbit: { position: 'absolute', width: 178, height: 178, borderRadius: 89, borderWidth: 0.75, borderColor: `${visual.color.teal}38`, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  orbitStar: { position: 'absolute', shadowColor: visual.color.oat, shadowOpacity: 0.72, shadowRadius: 6 },
  content: { width: '100%', maxWidth: 390, maxHeight: '100%', flex: 1, alignItems: 'center' },
  scroll: { width: '100%', flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingTop: 2, paddingBottom: 8 },
  icon: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: `${visual.color.purple}70`, backgroundColor: visual.color.purpleSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 13, shadowColor: visual.color.purple, shadowOpacity: 0.28, shadowRadius: 18 },
  lockBadge: { position: 'absolute', right: -2, bottom: -2, width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal, borderWidth: 1, borderColor: visual.color.surface },
  eyebrow: { color: visual.color.purple, fontSize: 10, letterSpacing: 2.6, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: visual.color.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 31, lineHeight: 38, textAlign: 'center', marginTop: 9 },
  copy: { color: visual.color.text, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, fontFamily: 'Manrope_700Bold' },
  promise: { maxWidth: 300, color: visual.color.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 4, fontFamily: 'Manrope_500Medium' },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 16 },
  chip: { borderWidth: 0.75, borderColor: `${visual.color.teal}4D`, backgroundColor: visual.color.surfaceTranslucent, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, maxWidth: '100%' },
  chipText: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  actionArea: { width: '100%', minHeight: 58, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 7 },
  loadingMark: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, borderRadius: 20, backgroundColor: visual.color.surfaceTranslucent, borderWidth: 0.75, borderColor: visual.color.borderStrong },
  loadingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: visual.color.purple },
  button: { width: '100%', maxWidth: 292, minHeight: 48, borderRadius: 24, backgroundColor: visual.color.purple, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', shadowColor: visual.color.purple, shadowOpacity: 0.24, shadowRadius: 18, elevation: 7 },
  buttonText: { color: visual.color.accentContrast, fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.55 },
  waiting: { minHeight: 44, borderRadius: 22, borderWidth: 0.75, borderColor: `${visual.color.purple}66`, backgroundColor: visual.color.purpleSoft, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 9 },
  waitingPulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: visual.color.purple, shadowColor: visual.color.purple, shadowOpacity: 0.8, shadowRadius: 7 },
  waitingText: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_700Bold' },
  errorArea: { alignItems: 'center' },
  error: { color: visual.color.danger, fontSize: 11, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  retryButton: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: visual.color.borderStrong },
  retryText: { color: visual.color.purple, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
});
