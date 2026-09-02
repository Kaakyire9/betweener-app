import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  LiveQuickConnectIntent,
  LiveQuickConnectPoolSnapshot,
} from '../application/index.ts';
import { paginateLiveQuickConnectPool } from '../domain/index.ts';
import { LiveQuickConnectConstellation } from './LiveQuickConnectConstellation.tsx';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

export type LiveQuickConnectPoolProps = {
  snapshot: LiveQuickConnectPoolSnapshot | null;
  currentUserId: string | null;
  busyAction: string | null;
  error: string | null;
  initialLoading: boolean;
  onOptIn: (connectionIntent: LiveQuickConnectIntent) => void;
  onLeave: () => void;
  onSignalInterest: (profileId: string) => void;
  layout: 'stacked' | 'side-by-side';
  onLayoutChange: (layout: 'stacked' | 'side-by-side') => void;
  embedded?: boolean;
};

const CONTROL_COPY: Record<LiveQuickConnectPoolSnapshot['controlState'], string> = {
  closed: 'Your place is held. The host opens each rotation.',
  open: 'Rotations are open. Eligible conversations form privately.',
  paused: 'Your place is held while new pairings are paused.',
  draining: 'The final conversations are being completed.',
  ended: "Tonight's rotation has ended.",
};

const INTENT_OPTIONS: readonly {
  value: LiveQuickConnectIntent;
  label: string;
  supporting: string;
}[] = [
  { value: 'serious', label: 'Serious dating', supporting: 'Clear interest and real effort.' },
  { value: 'long_term', label: 'Long-term', supporting: 'Build toward something steady.' },
  { value: 'marriage', label: 'Marriage-minded', supporting: 'Date with a future in view.' },
  { value: 'open', label: 'See where it goes', supporting: 'Leave room for chemistry.' },
];

const poolErrorCopy = (error: string | null): string | null => {
  if (!error) return null;
  if (error === 'live_quick_connect_safety_hold_active') {
    return 'Quick Connect is temporarily paused while Betweener Safety reviews recent private reports.';
  }
  if (error === 'live_quick_connect_preferences_required') {
    return 'Choose what you are hoping to find before joining.';
  }
  if (error === 'live_quick_connect_intent_invalid') {
    return 'Choose one of the available intentions before joining.';
  }
  return 'That could not be saved yet. Please try again.';
};

export function LiveQuickConnectPool({
  snapshot,
  currentUserId,
  busyAction,
  error,
  initialLoading,
  onOptIn,
  onLeave,
  onSignalInterest,
  layout,
  onLayoutChange,
  embedded = false,
}: LiveQuickConnectPoolProps) {
  const glow = useRef(new Animated.Value(0)).current;
  const pageMotion = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);
  const [pageAnimating, setPageAnimating] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [choosingIntent, setChoosingIntent] = useState(false);
  const [connectionIntent, setConnectionIntent] = useState<LiveQuickConnectIntent | null>(null);

  useEffect(() => {
    if (choosingIntent) return;
    setConnectionIntent(snapshot?.connectionIntent ?? null);
  }, [choosingIntent, snapshot?.connectionIntent]);

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
    if (reduceMotion) {
      glow.setValue(1);
      return undefined;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1_800, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1_800, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [glow, reduceMotion]);

  const poolPage = useMemo(
    () => paginateLiveQuickConnectPool(snapshot?.members ?? [], page),
    [page, snapshot?.members],
  );

  const changePage = (nextPage: number) => {
    if (pageAnimating || nextPage === poolPage.page) return;
    if (reduceMotion) {
      setPage(nextPage);
      return;
    }
    const exitDirection = nextPage > poolPage.page ? -1 : 1;
    setPageAnimating(true);
    Animated.timing(pageMotion, {
      toValue: exitDirection,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        setPageAnimating(false);
        return;
      }
      setPage(nextPage);
      pageMotion.setValue(-exitDirection);
      Animated.spring(pageMotion, {
        toValue: 0,
        damping: 17,
        stiffness: 125,
        mass: 0.75,
        useNativeDriver: true,
      }).start(() => setPageAnimating(false));
    });
  };

  if (!snapshot) {
    return initialLoading ? (
      <View style={styles.loading}>
        <ActivityIndicator color={LIVE_VISUAL.color.gold} size="small" />
      </View>
    ) : null;
  }

  const poolCount = snapshot.members.length;
  const pairingActive = snapshot.queue?.pairing != null;
  const pairingUserIds = snapshot.queue?.pairing
    ? [currentUserId, snapshot.queue.pairing.otherPerson.userId]
      .filter((userId): userId is string => Boolean(userId))
    : [];
  return (
    <View style={[styles.shell, embedded && styles.shellEmbedded]}>
      <View style={[styles.headingRow, layout === 'side-by-side' && styles.headingRowCompact]}>
        <View style={styles.headingIcon}>
          <UsersRound color={LIVE_VISUAL.color.gold} size={15} />
        </View>
        <View style={styles.headingCopy}>
          <Text numberOfLines={1} style={styles.eyebrow}>
            {layout === 'side-by-side' ? 'QUICK CONNECT' : 'QUICK CONNECT POOL'}
          </Text>
          <Text numberOfLines={1} style={styles.heading}>
            {poolCount} {layout === 'side-by-side' ? 'ready' : poolCount === 1 ? 'person ready' : 'people ready'}
          </Text>
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
                <View style={styles.stackedLayoutIcon}>
                  <View style={styles.layoutBar} />
                  <View style={styles.layoutBar} />
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel="Show host and pool side by side"
                accessibilityRole="button"
                accessibilityState={{ selected: layout === 'side-by-side' }}
                onPress={() => onLayoutChange('side-by-side')}
                style={[styles.layoutButton, layout === 'side-by-side' && styles.layoutButtonSelected]}
              >
                <View style={styles.sideLayoutIcon}>
                  <View style={styles.layoutColumn} />
                  <View style={styles.layoutColumn} />
                </View>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={styles.progressSlot}>
          {busyAction ? <ActivityIndicator color={LIVE_VISUAL.color.gold} size="small" /> : null}
        </View>
      </View>

      {snapshot.isHost ? (
        <View style={styles.statusRow}>
          <View style={styles.facilitatorDot} />
          <Text numberOfLines={1} style={styles.statusText}>Facilitating this rotation</Text>
        </View>
      ) : !snapshot.isOptedIn ? (
        <View style={[styles.optInRow, layout === 'side-by-side' && styles.optInRowCompact]}>
          {layout === 'stacked' ? <View style={styles.optInCopy}>
            <Text style={styles.optInTitle}>
              Meet someone, thoughtfully.
            </Text>
            <Text numberOfLines={3} style={styles.supporting}>
              Joining is explicit and private. Room roles do not change.
            </Text>
          </View> : null}
          <Pressable
            accessibilityLabel="Join Quick Connect pool"
            accessibilityRole="button"
            disabled={
              !snapshot.canOptIn
              || busyAction != null
              || (choosingIntent && connectionIntent == null)
            }
            onPress={() => {
              if (!choosingIntent) {
                setChoosingIntent(true);
                return;
              }
              if (connectionIntent) onOptIn(connectionIntent);
            }}
            style={[
              styles.primaryButton,
              layout === 'side-by-side' && styles.primaryButtonCompact,
              (!snapshot.canOptIn || busyAction != null || (choosingIntent && connectionIntent == null)) && styles.disabled,
            ]}
          >
            <UserRoundPlus color={LIVE_VISUAL.color.canvas} size={16} />
            <Text style={styles.primaryText}>{choosingIntent ? 'Confirm & join' : 'Join pool'}</Text>
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

      {!snapshot.isHost && !snapshot.isOptedIn && choosingIntent ? (
        <View style={styles.preferencePanel}>
          <Text style={styles.preferenceTitle}>What are you hoping to find?</Text>
          <Text style={styles.preferenceSupporting}>Choose one. It privately guides pairing priority.</Text>
          <View style={styles.preferenceOptions}>
            {INTENT_OPTIONS.map((option) => {
              const selected = connectionIntent === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setConnectionIntent(option.value)}
                  style={[styles.preferenceChip, selected && styles.preferenceChipSelected]}
                >
                  <Text style={[styles.preferenceChipText, selected && styles.preferenceChipTextSelected]}>
                    {option.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.preferenceChipSupporting, selected && styles.preferenceChipSupportingSelected]}
                  >
                    {option.supporting}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {poolCount > 0 ? (
        <>
          <LiveQuickConnectConstellation
            busyAction={busyAction}
            canSignal={snapshot.isOptedIn}
            currentUserId={currentUserId}
            layout={layout}
            members={poolPage.members}
            onSignalInterest={onSignalInterest}
            pageMotion={pageMotion}
            pairingUserIds={pairingUserIds}
            reduceMotion={reduceMotion}
          />

          {poolPage.pageCount > 1 ? (
            <View style={styles.paginationRow}>
              <Pressable
                accessibilityLabel="Previous Quick Connect guests"
                accessibilityRole="button"
                disabled={!poolPage.hasPrevious || pageAnimating}
                onPress={() => changePage(poolPage.page - 1)}
                style={[styles.pageButton, (!poolPage.hasPrevious || pageAnimating) && styles.disabled]}
              >
                <ChevronLeft color={LIVE_VISUAL.color.text} size={15} />
              </Pressable>
              <Text style={styles.pageText}>
                {poolPage.page + 1} of {poolPage.pageCount}
                {poolPage.remainingCount > 0 ? `  ·  ${poolPage.remainingCount} more` : ''}
              </Text>
              <Pressable
                accessibilityLabel="More Quick Connect guests"
                accessibilityRole="button"
                disabled={!poolPage.hasNext || pageAnimating}
                onPress={() => changePage(poolPage.page + 1)}
                style={[styles.pageButton, (!poolPage.hasNext || pageAnimating) && styles.disabled]}
              >
                <ChevronRight color={LIVE_VISUAL.color.text} size={15} />
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.emptyCopy}>The first person to join will appear here.</Text>
      )}

      {snapshot.isOptedIn && !snapshot.isHost ? (
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

      {poolErrorCopy(error) ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {poolErrorCopy(error)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { marginHorizontal: 16, gap: 8, borderRadius: 22, borderWidth: 1, borderColor: '#D7B56D45', backgroundColor: '#071714EE', padding: 11 },
  shellEmbedded: { flex: 1, minHeight: 0, marginHorizontal: 0, gap: 5, borderRadius: 0, borderWidth: 0, padding: 9, backgroundColor: '#071714' },
  loading: { alignSelf: 'center', borderRadius: 999, backgroundColor: '#071714E8', padding: 10 },
  headingRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingRowCompact: { minHeight: 29, gap: 5 },
  headingIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D18' },
  headingCopy: { flex: 1 },
  eyebrow: { color: LIVE_VISUAL.color.gold, fontSize: 7, letterSpacing: 1.35, fontFamily: 'Manrope_800ExtraBold' },
  heading: { marginTop: 1, color: LIVE_VISUAL.color.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  hostActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  progressSlot: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  layoutToggle: { height: 30, borderRadius: 15, flexDirection: 'row', alignItems: 'center', padding: 2, backgroundColor: '#FFFFFF0A', borderWidth: 1, borderColor: '#D7B56D30' },
  layoutButton: { width: 25, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  layoutButtonSelected: { backgroundColor: '#D7B56D2B' },
  stackedLayoutIcon: { width: 12, height: 12, justifyContent: 'space-between', paddingVertical: 1 },
  sideLayoutIcon: { width: 12, height: 12, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 1 },
  layoutBar: { width: 12, height: 4, borderRadius: 2, backgroundColor: LIVE_VISUAL.color.gold },
  layoutColumn: { width: 4, height: 12, borderRadius: 2, backgroundColor: LIVE_VISUAL.color.gold },
  optInRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  optInRowCompact: { minHeight: 31, justifyContent: 'flex-end' },
  optInCopy: { flex: 1, minWidth: 0 },
  optInTitle: { color: LIVE_VISUAL.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold', marginBottom: 2 },
  supporting: { color: LIVE_VISUAL.color.textMuted, fontSize: 8, lineHeight: 12, fontFamily: 'Manrope_500Medium' },
  primaryButton: { minHeight: 36, borderRadius: 18, backgroundColor: LIVE_VISUAL.color.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12 },
  primaryButtonCompact: { minHeight: 31, borderRadius: 16, paddingHorizontal: 10 },
  primaryText: { color: LIVE_VISUAL.color.canvas, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  preferencePanel: { gap: 6, borderRadius: 14, borderWidth: 1, borderColor: '#D7B56D32', backgroundColor: '#091714', padding: 9 },
  preferenceTitle: { color: LIVE_VISUAL.color.text, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  preferenceSupporting: { color: LIVE_VISUAL.color.textMuted, fontSize: 7, fontFamily: 'Manrope_500Medium' },
  preferenceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  preferenceChip: { minWidth: '47%', minHeight: 40, flexGrow: 1, justifyContent: 'center', gap: 1, borderRadius: 12, borderWidth: 1, borderColor: '#29413B', paddingHorizontal: 9, paddingVertical: 5 },
  preferenceChipSelected: { borderColor: LIVE_VISUAL.color.gold, backgroundColor: '#D7B56D' },
  preferenceChipText: { color: LIVE_VISUAL.color.textMuted, fontSize: 7, fontFamily: 'Manrope_700Bold' },
  preferenceChipTextSelected: { color: LIVE_VISUAL.color.canvas },
  preferenceChipSupporting: { color: '#839690', fontSize: 6, fontFamily: 'Manrope_500Medium' },
  preferenceChipSupportingSelected: { color: '#27433D' },
  disabled: { opacity: 0.4 },
  statusRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE_VISUAL.color.teal },
  facilitatorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE_VISUAL.color.gold },
  statusText: { flex: 1, color: LIVE_VISUAL.color.textMuted, fontSize: 8, fontFamily: 'Manrope_600SemiBold' },
  paginationRow: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  pageButton: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF0B' },
  pageText: { minWidth: 72, color: LIVE_VISUAL.color.textMuted, fontSize: 8, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  emptyCopy: { color: LIVE_VISUAL.color.textMuted, fontSize: 8, textAlign: 'center', fontFamily: 'Manrope_500Medium', paddingVertical: 4 },
  leaveButton: { alignSelf: 'center', minHeight: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF0B', paddingHorizontal: 12 },
  leaveText: { color: LIVE_VISUAL.color.textMuted, fontSize: 8, fontFamily: 'Manrope_800ExtraBold' },
  error: { color: '#F2B6B6', fontSize: 8, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
});
