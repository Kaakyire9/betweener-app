import { Image } from 'expo-image';
import { Heart, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { LiveQuickConnectPoolMember } from '../application/index.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type PoolLayout = 'stacked' | 'side-by-side';
type MemberPhase = 'active' | 'exiting';
type ExitKind = 'departure' | 'pair';

type RenderedMember = {
  member: LiveQuickConnectPoolMember;
  index: number;
  phase: MemberPhase;
  exitKind: ExitKind;
};

export type LiveQuickConnectConstellationProps = {
  members: readonly LiveQuickConnectPoolMember[];
  currentUserId: string | null;
  canSignal: boolean;
  busyAction: string | null;
  layout: PoolLayout;
  pairingUserIds: readonly string[];
  pageMotion: Animated.Value;
  reduceMotion: boolean;
  onSignalInterest: (profileId: string) => void;
};

const MEMBER_EXIT_MS = 920;

const PORTRAIT_ORBIT_SLOTS = [
  { position: { left: '50%', top: '7%', marginLeft: -29 }, centre: { x: 0, y: 66 }, drift: { x: 2, y: 4 } },
  { position: { right: '8%', top: '38%' }, centre: { x: -72, y: 0 }, drift: { x: 4, y: 2 } },
  { position: { left: '50%', bottom: '5%', marginLeft: -29 }, centre: { x: 0, y: -66 }, drift: { x: 2, y: 4 } },
  { position: { left: '8%', top: '38%' }, centre: { x: 72, y: 0 }, drift: { x: 4, y: 2 } },
] as const;

const LANDSCAPE_ORBIT_SLOTS = [
  { position: { left: '5%', top: '18%' }, centre: { x: 118, y: 24 }, drift: { x: 4, y: 2 } },
  { position: { left: '29%', bottom: '4%' }, centre: { x: 48, y: -45 }, drift: { x: 3, y: 4 } },
  { position: { right: '29%', top: '4%' }, centre: { x: -48, y: 45 }, drift: { x: 3, y: 4 } },
  { position: { right: '5%', bottom: '18%' }, centre: { x: -118, y: -24 }, drift: { x: 4, y: 2 } },
] as const;

export const QUICK_CONNECT_POOL_STARS = [
  { position: { left: '9%', top: '18%' }, size: 3, color: '#7858D8' },
  { position: { left: '25%', top: '66%' }, size: 2, color: '#3AAE9C' },
  { position: { left: '45%', top: '27%' }, size: 4, color: '#9464EF' },
  { position: { right: '12%', top: '20%' }, size: 2, color: '#7D5BA6' },
  { position: { right: '20%', bottom: '16%' }, size: 3, color: '#694BBE' },
  { position: { left: '14%', bottom: '10%' }, size: 2, color: '#61B5A5' },
  { position: { right: '42%', top: '9%' }, size: 2, color: '#8ED7CA' },
  { position: { left: '39%', bottom: '7%' }, size: 2, color: '#B18AF2' },
] as const;

const slotFor = (index: number, layout: PoolLayout) => {
  const slots = layout === 'side-by-side' ? PORTRAIT_ORBIT_SLOTS : LANDSCAPE_ORBIT_SLOTS;
  return slots[index % slots.length];
};

const memberDataSignature = (members: readonly LiveQuickConnectPoolMember[]) => members
  .map((member) => [
    member.userId,
    member.profileId,
    member.fullName,
    member.avatarUrl,
    member.age,
    member.city,
    member.expressedInterest ? '1' : '0',
  ].join(':'))
  .join('|');

export function LiveQuickConnectConstellation({
  members,
  currentUserId,
  canSignal,
  busyAction,
  layout,
  pairingUserIds,
  pageMotion,
  reduceMotion,
  onSignalInterest,
}: LiveQuickConnectConstellationProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const atmosphere = useRef(new Animated.Value(0)).current;
  const orbitSpin = useRef(new Animated.Value(0)).current;
  const coreEnergy = useRef(new Animated.Value(0)).current;
  const pairingActive = pairingUserIds.length > 0;
  const pairingKey = pairingUserIds.join(':');
  const membersKey = memberDataSignature(members);
  const desiredIds = useMemo(() => new Set(members.map((member) => member.profileId)), [membersKey]);
  const pairingIds = useMemo(() => new Set(pairingUserIds), [pairingKey]);
  const [renderedMembers, setRenderedMembers] = useState<RenderedMember[]>(() => (
    members.map((member, index) => ({ member, index, phase: 'active', exitKind: 'departure' }))
  ));

  useEffect(() => {
    setRenderedMembers((previous) => {
      const active = members.map((member, index): RenderedMember => ({
        member,
        index,
        phase: 'active',
        exitKind: 'departure',
      }));
      const exiting = previous
        .filter((entry) => !desiredIds.has(entry.member.profileId))
        .map((entry): RenderedMember => ({
          ...entry,
          phase: 'exiting',
          exitKind: pairingIds.has(entry.member.userId) ? 'pair' : entry.exitKind,
        }));
      return [...active, ...exiting];
    });

    const timeout = setTimeout(() => {
      setRenderedMembers((current) => current.filter((entry) => (
        entry.phase === 'active' || desiredIds.has(entry.member.profileId)
      )));
    }, reduceMotion ? 20 : MEMBER_EXIT_MS);
    return () => clearTimeout(timeout);
  }, [desiredIds, members, membersKey, pairingIds, pairingKey, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      atmosphere.setValue(0.5);
      orbitSpin.setValue(0);
      return undefined;
    }
    const shimmer = Animated.loop(Animated.sequence([
      Animated.timing(atmosphere, {
        toValue: 1,
        duration: 3_600,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(atmosphere, {
        toValue: 0,
        duration: 3_600,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]));
    const rotation = Animated.loop(Animated.timing(orbitSpin, {
      toValue: 1,
      duration: 24_000,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    shimmer.start();
    rotation.start();
    return () => {
      shimmer.stop();
      rotation.stop();
    };
  }, [atmosphere, orbitSpin, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      coreEnergy.setValue(pairingActive ? 1 : 0);
      return;
    }
    if (pairingActive) {
      Animated.sequence([
        Animated.spring(coreEnergy, {
          toValue: 1,
          damping: 9,
          stiffness: 115,
          mass: 0.7,
          useNativeDriver: true,
        }),
        Animated.timing(coreEnergy, {
          toValue: 0.58,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    Animated.timing(coreEnergy, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [coreEnergy, pairingActive, reduceMotion]);

  const pageOpacity = pageMotion.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [0.2, 1, 0.2],
  });
  const pageTranslateX = pageMotion.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-54, 0, 54],
  });
  const pageScale = pageMotion.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [0.94, 1, 0.94],
  });

  return (
    <View style={[styles.constellation, layout === 'side-by-side' && styles.constellationPortrait]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.atmosphereGlow,
          {
            opacity: atmosphere.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.34] }),
            transform: [{ scale: atmosphere.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }],
          },
        ]}
      />

      {QUICK_CONNECT_POOL_STARS.map((star, index) => (
        <Animated.View
          key={`pool-star-${index}`}
          pointerEvents="none"
          style={[
            styles.poolStar,
            star.position,
            {
              width: star.size,
              height: star.size,
              borderRadius: star.size / 2,
              backgroundColor: star.color,
              opacity: atmosphere.interpolate({
                inputRange: [0, 1],
                outputRange: index % 2 === 0 ? [0.25, 0.95] : [0.9, 0.28],
              }),
              transform: [{
                translateY: atmosphere.interpolate({
                  inputRange: [0, 1],
                  outputRange: index % 2 === 0 ? [-2, 3] : [2, -3],
                }),
              }],
            },
          ]}
        />
      ))}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.orbitRingOuter,
          {
            transform: [
              { rotate: orbitSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
              { scale: coreEnergy.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
            ],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orbitRingInner,
          {
            opacity: atmosphere.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.88] }),
            transform: [{
              rotate: orbitSpin.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }),
            }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.coreRadiance,
          {
            opacity: coreEnergy.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.58] }),
            transform: [{ scale: coreEnergy.interpolate({ inputRange: [0, 1], outputRange: [0.72, 2.35] }) }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orbitCore,
          {
            transform: [
              { scale: atmosphere.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) },
              { scale: coreEnergy.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
            ],
          },
        ]}
      >
        <Sparkles color={visual.color.teal} size={14} />
      </Animated.View>

      <Animated.View
        style={[
          styles.membersLayer,
          {
            opacity: pageOpacity,
            transform: [{ translateX: pageTranslateX }, { scale: pageScale }],
          },
        ]}
      >
        {renderedMembers.map((entry) => (
          <ConstellationMember
            key={entry.member.profileId}
            busy={busyAction === `interest:${entry.member.profileId}`}
            canSignal={canSignal}
            current={entry.member.userId === currentUserId}
            exitKind={entry.exitKind}
            index={entry.index}
            layout={layout}
            member={entry.member}
            onPress={() => onSignalInterest(entry.member.profileId)}
            pairingActive={pairingActive}
            paired={pairingIds.has(entry.member.userId)}
            phase={entry.phase}
            reduceMotion={reduceMotion}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function ConstellationMember({
  member,
  current,
  canSignal,
  busy,
  index,
  layout,
  phase,
  exitKind,
  pairingActive,
  paired,
  reduceMotion,
  onPress,
}: {
  member: LiveQuickConnectPoolMember;
  current: boolean;
  canSignal: boolean;
  busy: boolean;
  index: number;
  layout: PoolLayout;
  phase: MemberPhase;
  exitKind: ExitKind;
  pairingActive: boolean;
  paired: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const entrance = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const pressed = useRef(new Animated.Value(0)).current;
  const pairing = useRef(new Animated.Value(0)).current;
  const recede = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const slot = slotFor(index, layout);

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return undefined;
    }
    const arrival = Animated.spring(entrance, {
      toValue: 1,
      delay: Math.min(index, 7) * 95,
      damping: 15,
      stiffness: 105,
      mass: 0.82,
      useNativeDriver: true,
    });
    arrival.start();
    return () => arrival.stop();
  }, [entrance, index, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || phase === 'exiting' || paired) {
      drift.setValue(0);
      breathe.setValue(0.45);
      return undefined;
    }
    const driftAnimation = Animated.loop(Animated.sequence([
      Animated.delay(220 + index * 170),
      Animated.timing(drift, {
        toValue: 1,
        duration: 1_700 + index * 130,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(drift, {
        toValue: -1,
        duration: 2_200 + index * 110,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(drift, {
        toValue: 0,
        duration: 1_450 + index * 90,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]));
    const breathAnimation = Animated.loop(Animated.sequence([
      Animated.delay(index * 260),
      Animated.timing(breathe, {
        toValue: 1,
        duration: 2_150 + index * 120,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(breathe, {
        toValue: 0,
        duration: 2_150 + index * 120,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]));
    driftAnimation.start();
    breathAnimation.start();
    return () => {
      driftAnimation.stop();
      breathAnimation.stop();
    };
  }, [breathe, drift, index, paired, phase, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      pairing.setValue(paired ? 1 : 0);
      recede.setValue(pairingActive && !paired ? 1 : 0);
      return;
    }
    if (paired) {
      Animated.sequence([
        Animated.spring(pairing, {
          toValue: 0.26,
          damping: 7,
          stiffness: 180,
          mass: 0.5,
          useNativeDriver: true,
        }),
        Animated.timing(pairing, {
          toValue: 1,
          duration: 680,
          delay: 120,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(pairing, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }
    Animated.timing(recede, {
      toValue: pairingActive && !paired ? 1 : 0,
      duration: pairingActive ? 360 : 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [paired, pairing, pairingActive, recede, reduceMotion]);

  useEffect(() => {
    if (phase !== 'exiting') {
      exit.setValue(0);
      return;
    }
    if (reduceMotion) {
      exit.setValue(1);
      return;
    }
    Animated.timing(exit, {
      toValue: 1,
      duration: exitKind === 'pair' ? 780 : 620,
      delay: exitKind === 'pair' ? 100 : 0,
      easing: exitKind === 'pair' ? Easing.inOut(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [exit, exitKind, phase, reduceMotion]);

  const setPressed = (value: number) => {
    if (reduceMotion) {
      pressed.setValue(value);
      return;
    }
    Animated.spring(pressed, {
      toValue: value,
      damping: 12,
      stiffness: 260,
      mass: 0.4,
      useNativeDriver: true,
    }).start();
  };

  const firstName = member.fullName?.trim().split(/\s+/)[0] || 'Guest';
  const meta = [member.age, member.city]
    .filter((value) => value != null && value !== '')
    .join(' / ');
  const outwardX = -slot.centre.x * 0.32;
  const outwardY = -slot.centre.y * 0.32;
  const departX = exitKind === 'pair' ? 0 : outwardX;
  const departY = exitKind === 'pair' ? 0 : outwardY;
  const opacity = Animated.multiply(
    entrance,
    Animated.multiply(
      recede.interpolate({ inputRange: [0, 1], outputRange: [1, 0.28] }),
      exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    ),
  );

  return (
    <Animated.View
      style={[
        styles.memberCell,
        slot.position,
        {
          opacity,
          transform: [
            {
              translateX: Animated.add(
                Animated.add(
                  entrance.interpolate({ inputRange: [0, 1], outputRange: [slot.centre.x, 0] }),
                  drift.interpolate({ inputRange: [-1, 1], outputRange: [-slot.drift.x, slot.drift.x] }),
                ),
                Animated.add(
                  pairing.interpolate({
                    inputRange: [0, 0.26, 1],
                    outputRange: [0, outwardX * 0.18, slot.centre.x],
                  }),
                  exit.interpolate({ inputRange: [0, 1], outputRange: [0, departX] }),
                ),
              ),
            },
            {
              translateY: Animated.add(
                Animated.add(
                  entrance.interpolate({ inputRange: [0, 1], outputRange: [slot.centre.y, 0] }),
                  drift.interpolate({ inputRange: [-1, 1], outputRange: [slot.drift.y, -slot.drift.y] }),
                ),
                Animated.add(
                  pairing.interpolate({
                    inputRange: [0, 0.26, 1],
                    outputRange: [0, outwardY * 0.18, slot.centre.y],
                  }),
                  exit.interpolate({ inputRange: [0, 1], outputRange: [0, departY] }),
                ),
              ),
            },
            { scale: entrance.interpolate({ inputRange: [0, 0.76, 1], outputRange: [0.72, 1.06, 1] }) },
            { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.992, 1.018] }) },
            { scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 1.075] }) },
            { scale: pairing.interpolate({ inputRange: [0, 0.26, 1], outputRange: [1, 1.14, 0.74] }) },
            { scale: recede.interpolate({ inputRange: [0, 1], outputRange: [1, 0.91] }) },
            { scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) },
            { rotate: exit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${index % 2 === 0 ? -7 : 7}deg`] }) },
          ],
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.memberAura,
          member.expressedInterest && styles.memberAuraInterested,
          {
            opacity: Animated.add(
              breathe.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.24] }),
              pairing.interpolate({ inputRange: [0, 1], outputRange: [0, 0.46] }),
            ),
            transform: [{ scale: Animated.add(
              breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.1] }),
              pairing.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] }),
            ) }],
          },
        ]}
      />
      <Pressable
        accessibilityLabel={current ? `${firstName}, you` : `Privately prioritise ${firstName}`}
        accessibilityRole="button"
        disabled={current || busy || !canSignal || phase === 'exiting'}
        hitSlop={6}
        onPress={onPress}
        onPressIn={() => setPressed(1)}
        onPressOut={() => setPressed(0)}
        style={[
          styles.member,
          current && styles.memberCurrent,
          member.expressedInterest && styles.memberInterested,
          paired && styles.memberPaired,
        ]}
      >
        <View style={styles.avatarFrame}>
          {member.avatarUrl ? (
            <Image contentFit="cover" source={{ uri: member.avatarUrl }} style={styles.avatar} transition={150} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {member.expressedInterest ? (
            <View style={styles.interestBadge}>
              <Heart color={visual.color.accentContrast} fill={visual.color.accentContrast} size={8} />
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.memberName}>{current ? 'You' : firstName}</Text>
        <Text numberOfLines={1} style={styles.memberMeta}>{meta || 'In the room'}</Text>
        {!current && canSignal ? (
          <View style={styles.privateAction}>
            {busy ? (
              <ActivityIndicator color={visual.color.purple} size={9} />
            ) : (
              <Sparkles color={visual.color.purple} size={9} />
            )}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  constellation: {
    flex: 1,
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  constellationPortrait: { minHeight: 132 },
  membersLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  atmosphereGlow: {
    position: 'absolute',
    width: 210,
    height: 130,
    borderRadius: 105,
    backgroundColor: visual.color.tealSoft,
  },
  poolStar: {
    position: 'absolute',
    shadowColor: visual.color.teal,
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  orbitRingOuter: {
    position: 'absolute',
    width: 178,
    height: 178,
    borderRadius: 89,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
    borderStyle: 'dashed',
  },
  orbitRingInner: {
    position: 'absolute',
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 1,
    borderColor: visual.color.tealSoft,
  },
  coreRadiance: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: visual.color.teal,
  },
  orbitCore: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.tealSoft,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
  },
  memberCell: { position: 'absolute', width: 58, alignItems: 'center' },
  memberAura: {
    position: 'absolute',
    top: -5,
    width: 68,
    height: 84,
    borderRadius: 24,
    backgroundColor: visual.color.teal,
  },
  memberAuraInterested: { backgroundColor: visual.color.purple },
  member: {
    width: 58,
    minHeight: 75,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: visual.color.border,
    backgroundColor: visual.color.surfaceTranslucent,
    paddingHorizontal: 3,
    paddingVertical: 5,
    shadowColor: visual.isDark ? '#000000' : visual.color.teal,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  memberCurrent: { borderColor: visual.color.teal, backgroundColor: visual.color.tealSoft },
  memberInterested: { borderColor: visual.color.purple },
  memberPaired: { borderColor: visual.color.purple, backgroundColor: visual.color.purpleSoft },
  avatarFrame: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
    padding: 1.5,
  },
  avatar: { width: '100%', height: '100%', borderRadius: 16 },
  avatarFallback: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.tealSoft,
  },
  avatarInitial: { color: visual.color.text, fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  interestBadge: {
    position: 'absolute',
    right: -3,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.purple,
  },
  memberName: {
    marginTop: 4,
    maxWidth: '100%',
    color: visual.color.text,
    fontSize: 8,
    fontFamily: 'Manrope_800ExtraBold',
  },
  memberMeta: {
    marginTop: 1,
    maxWidth: '100%',
    color: visual.color.textMuted,
    fontSize: 6.5,
    fontFamily: 'Manrope_600SemiBold',
  },
  privateAction: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.purpleSoft,
  },
});
