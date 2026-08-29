import { Image } from 'expo-image';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  LogOut,
  SlidersHorizontal,
  Sparkles,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  LiveQuickConnectPoolMember,
  LiveQuickConnectPoolSnapshot,
} from '../application/index.ts';
import { paginateLiveQuickConnectPool } from '../domain/index.ts';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

export type LiveQuickConnectPoolProps = {
  snapshot: LiveQuickConnectPoolSnapshot | null;
  currentUserId: string | null;
  busyAction: string | null;
  error: string | null;
  refreshing: boolean;
  onOptIn: () => void;
  onLeave: () => void;
  onSignalInterest: (profileId: string) => void;
  onOpenStudio: () => void;
  layout: 'stacked' | 'side-by-side';
  onLayoutChange: (layout: 'stacked' | 'side-by-side') => void;
};

const CONTROL_COPY: Record<LiveQuickConnectPoolSnapshot['controlState'], string> = {
  closed: 'Your place is held. The host opens each rotation.',
  open: 'Rotations are open. Eligible conversations form privately.',
  paused: 'Your place is held while new pairings are paused.',
  draining: 'The final conversations are being completed.',
  ended: "Tonight's rotation has ended.",
};

const ORBIT_POSITIONS = [
  { left: '50%', top: 3, marginLeft: -29 },
  { right: 5, top: 29 },
  { right: 5, bottom: 29 },
  { left: '50%', bottom: 3, marginLeft: -29 },
  { left: 5, bottom: 29 },
  { left: 5, top: 29 },
  { left: '18%', top: 12, marginLeft: -29 },
  { right: '18%', bottom: 12, marginRight: -29 },
] as const;

const orbitPosition = (index: number) => ORBIT_POSITIONS[index % ORBIT_POSITIONS.length];

export function LiveQuickConnectPool({
  snapshot,
  currentUserId,
  busyAction,
  error,
  refreshing,
  onOptIn,
  onLeave,
  onSignalInterest,
  onOpenStudio,
  layout,
  onLayoutChange,
}: LiveQuickConnectPoolProps) {
  const glow = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1_800, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1_800, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [glow]);

  const poolPage = useMemo(
    () => paginateLiveQuickConnectPool(snapshot?.members ?? [], page),
    [page, snapshot?.members],
  );

  if (!snapshot) {
    return refreshing ? (
      <View style={styles.loading}>
        <ActivityIndicator color={LIVE_VISUAL.color.gold} size="small" />
      </View>
    ) : null;
  }

  const poolCount = snapshot.members.length;
  const pairingActive = snapshot.queue?.pairing != null;

  return (
    <View style={styles.shell}>
      <View style={styles.headingRow}>
        <View style={styles.headingIcon}>
          <UsersRound color={LIVE_VISUAL.color.gold} size={15} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>QUICK CONNECT POOL</Text>
          <Text style={styles.heading}>{poolCount} {poolCount === 1 ? 'person' : 'people'} ready</Text>
        </View>
        {snapshot.isHost ? (
          <View style={styles.hostActions}>
            <View style={styles.layoutToggle}>
              <Pressable
                accessibilityLabel="Show host and pool stacked"
                accessibilityRole="button"
                accessibilityState={{ selected: layout === 'stacked' }}
                onPress={() => onLayoutChange('stacked')}
                style={[styles.layoutButton, layout === 'stacked' && styles.layoutButtonSelected]}
              >
                <Text style={styles.layoutIcon}>≡</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Show host and pool side by side"
                accessibilityRole="button"
                accessibilityState={{ selected: layout === 'side-by-side' }}
                onPress={() => onLayoutChange('side-by-side')}
                style={[styles.layoutButton, layout === 'side-by-side' && styles.layoutButtonSelected]}
              >
                <Text style={styles.layoutIcon}>▥</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={onOpenStudio} style={styles.studioButton}>
              <SlidersHorizontal color={LIVE_VISUAL.color.gold} size={14} />
              <Text style={styles.studioText}>Manage</Text>
            </Pressable>
          </View>
        ) : null}
        {refreshing || busyAction ? <ActivityIndicator color={LIVE_VISUAL.color.gold} size="small" /> : null}
      </View>

      {!snapshot.isOptedIn ? (
        <View style={styles.optInRow}>
          <View style={styles.optInCopy}>
            <Text style={styles.optInTitle}>
              {snapshot.isHost ? 'Join your guests, if you choose.' : 'Meet someone, thoughtfully.'}
            </Text>
            <Text numberOfLines={3} style={styles.supporting}>
              Joining is explicit and private. Room roles do not change.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Join Quick Connect pool"
            accessibilityRole="button"
            disabled={!snapshot.canOptIn || busyAction != null}
            onPress={onOptIn}
            style={[styles.primaryButton, (!snapshot.canOptIn || busyAction != null) && styles.disabled]}
          >
            <UserRoundPlus color={LIVE_VISUAL.color.canvas} size={16} />
            <Text style={styles.primaryText}>Join pool</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.statusRow}>
          <Animated.View style={[styles.liveDot, {
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }],
          }]} />
          <Text numberOfLines={1} style={styles.statusText}>
            {pairingActive ? 'Your private conversation is ready' : CONTROL_COPY[snapshot.controlState]}
          </Text>
        </View>
      )}

      {poolCount > 0 ? (
        <>
          <View style={[styles.poolOrbit, layout === 'side-by-side' && styles.poolOrbitCompact]}>
            <View pointerEvents="none" style={styles.orbitRingOuter} />
            <View pointerEvents="none" style={styles.orbitRingInner} />
            <View pointerEvents="none" style={styles.orbitCore}>
              <Sparkles color={LIVE_VISUAL.color.gold} size={14} />
            </View>
            {poolPage.members.map((member, index) => (
              <PoolMember
                key={member.profileId}
                busy={busyAction === `interest:${member.profileId}`}
                canSignal={snapshot.isOptedIn}
                current={member.userId === currentUserId}
                index={index}
                member={member}
                onPress={() => onSignalInterest(member.profileId)}
              />
            ))}
          </View>

          {poolPage.pageCount > 1 ? (
            <View style={styles.paginationRow}>
              <Pressable
                accessibilityLabel="Previous Quick Connect guests"
                accessibilityRole="button"
                disabled={!poolPage.hasPrevious}
                onPress={() => setPage(poolPage.page - 1)}
                style={[styles.pageButton, !poolPage.hasPrevious && styles.disabled]}
              >
                <ChevronLeft color={LIVE_VISUAL.color.text} size={15} />
              </Pressable>
              <Text style={styles.pageText}>
                {poolPage.page + 1} / {poolPage.pageCount}
                {poolPage.remainingCount > 0 ? ` / +${poolPage.remainingCount} more` : ''}
              </Text>
              <Pressable
                accessibilityLabel="More Quick Connect guests"
                accessibilityRole="button"
                disabled={!poolPage.hasNext}
                onPress={() => setPage(poolPage.page + 1)}
                style={[styles.pageButton, !poolPage.hasNext && styles.disabled]}
              >
                <ChevronRight color={LIVE_VISUAL.color.text} size={15} />
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.emptyCopy}>The first person to join will appear here.</Text>
      )}

      {snapshot.isOptedIn ? (
        <Pressable
          accessibilityLabel="Leave Quick Connect pool"
          accessibilityRole="button"
          disabled={busyAction != null}
          onPress={onLeave}
          style={[styles.leaveButton, busyAction != null && styles.disabled]}
        >
          <LogOut color={LIVE_VISUAL.color.textMuted} size={13} />
          <Text style={styles.leaveText}>Leave pool</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          That could not be saved yet. Please try again.
        </Text>
      ) : null}
    </View>
  );
}

function PoolMember({
  member,
  current,
  canSignal,
  busy,
  index,
  onPress,
}: {
  member: LiveQuickConnectPoolMember;
  current: boolean;
  canSignal: boolean;
  busy: boolean;
  index: number;
  onPress: () => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      delay: Math.min(index, 7) * 45,
      damping: 14,
      stiffness: 130,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [entrance, index]);

  const firstName = member.fullName?.trim().split(/\s+/)[0] || 'Guest';
  const meta = [member.age, member.city]
    .filter((value) => value != null && value !== '')
    .join(' / ');

  return (
    <Animated.View style={[styles.memberCell, orbitPosition(index), {
      opacity: entrance,
      transform: [
        { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
        { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
      ],
    }]}>
      <Pressable
        accessibilityLabel={current ? `${firstName}, you` : `Privately prioritise ${firstName}`}
        accessibilityRole="button"
        disabled={current || busy || !canSignal}
        onPress={onPress}
        style={[styles.member, current && styles.memberCurrent, member.expressedInterest && styles.memberInterested]}
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
              <Heart color={LIVE_VISUAL.color.text} fill={LIVE_VISUAL.color.text} size={8} />
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.memberName}>{current ? 'You' : firstName}</Text>
        <Text numberOfLines={1} style={styles.memberMeta}>{meta || 'In the room'}</Text>
        {!current && canSignal ? (
          <View style={styles.privateAction}>
            {busy ? (
              <ActivityIndicator color={LIVE_VISUAL.color.gold} size={9} />
            ) : (
              <Sparkles color={LIVE_VISUAL.color.gold} size={9} />
            )}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: { marginHorizontal: 16, gap: 8, borderRadius: 22, borderWidth: 1, borderColor: '#D7B56D45', backgroundColor: '#071714EE', padding: 11 },
  loading: { alignSelf: 'center', borderRadius: 999, backgroundColor: '#071714E8', padding: 10 },
  headingRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D18' },
  headingCopy: { flex: 1 },
  eyebrow: { color: LIVE_VISUAL.color.gold, fontSize: 7, letterSpacing: 1.35, fontFamily: 'Manrope_800ExtraBold' },
  heading: { marginTop: 1, color: LIVE_VISUAL.color.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  hostActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  layoutToggle: { height: 30, borderRadius: 15, flexDirection: 'row', alignItems: 'center', padding: 2, backgroundColor: '#FFFFFF0A', borderWidth: 1, borderColor: '#D7B56D30' },
  layoutButton: { width: 25, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  layoutButtonSelected: { backgroundColor: '#D7B56D2B' },
  layoutIcon: { color: LIVE_VISUAL.color.gold, fontSize: 13, lineHeight: 15, fontFamily: 'Manrope_800ExtraBold' },
  studioButton: { minHeight: 30, borderRadius: 15, borderWidth: 1, borderColor: '#D7B56D55', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10 },
  studioText: { color: LIVE_VISUAL.color.gold, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  optInRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  optInCopy: { flex: 1, minWidth: 0 },
  optInTitle: { color: LIVE_VISUAL.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold', marginBottom: 2 },
  supporting: { color: LIVE_VISUAL.color.textMuted, fontSize: 8, lineHeight: 12, fontFamily: 'Manrope_500Medium' },
  primaryButton: { minHeight: 36, borderRadius: 18, backgroundColor: LIVE_VISUAL.color.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12 },
  primaryText: { color: LIVE_VISUAL.color.canvas, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.4 },
  statusRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE_VISUAL.color.teal },
  statusText: { flex: 1, color: LIVE_VISUAL.color.textMuted, fontSize: 8, fontFamily: 'Manrope_600SemiBold' },
  poolOrbit: { height: 204, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  poolOrbitCompact: { height: 158 },
  orbitRingOuter: { position: 'absolute', width: 178, height: 178, borderRadius: 89, borderWidth: 1, borderColor: '#D7B56D35', borderStyle: 'dashed' },
  orbitRingInner: { position: 'absolute', width: 106, height: 106, borderRadius: 53, borderWidth: 1, borderColor: '#82B5A538' },
  orbitCore: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D16', borderWidth: 1, borderColor: '#D7B56D70' },
  memberCell: { position: 'absolute', width: 58, alignItems: 'center' },
  member: { width: 58, minHeight: 75, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#29413B', backgroundColor: '#0E211DF5', paddingHorizontal: 3, paddingVertical: 5 },
  memberCurrent: { borderColor: '#87B9AA55', backgroundColor: '#102923' },
  memberInterested: { borderColor: '#D7B56D88' },
  avatarFrame: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#D7B56D70', padding: 1.5 },
  avatar: { width: '100%', height: '100%', borderRadius: 16 },
  avatarFallback: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1B3932' },
  avatarInitial: { color: LIVE_VISUAL.color.text, fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  interestBadge: { position: 'absolute', right: -3, bottom: -2, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: LIVE_VISUAL.color.gold },
  memberName: { marginTop: 4, maxWidth: '100%', color: LIVE_VISUAL.color.text, fontSize: 8, fontFamily: 'Manrope_800ExtraBold' },
  memberMeta: { marginTop: 1, maxWidth: '100%', color: LIVE_VISUAL.color.textMuted, fontSize: 6.5, fontFamily: 'Manrope_600SemiBold' },
  privateAction: { position: 'absolute', right: 4, top: 4, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D1F' },
  paginationRow: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  pageButton: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF0B' },
  pageText: { minWidth: 72, color: LIVE_VISUAL.color.textMuted, fontSize: 8, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  emptyCopy: { color: LIVE_VISUAL.color.textMuted, fontSize: 8, textAlign: 'center', fontFamily: 'Manrope_500Medium', paddingVertical: 4 },
  leaveButton: { alignSelf: 'center', minHeight: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF0B', paddingHorizontal: 12 },
  leaveText: { color: LIVE_VISUAL.color.textMuted, fontSize: 8, fontFamily: 'Manrope_800ExtraBold' },
  error: { color: '#F2B6B6', fontSize: 8, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
});
