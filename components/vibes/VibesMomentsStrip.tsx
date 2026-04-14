import { Colors } from '@/constants/theme';
import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MomentUser } from '@/hooks/useMoments';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';
import type { MomentRelationshipContext } from '@/types/moment-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  FlatList,
  Image,
} from 'react-native';

const COLLAPSE_KEY = 'vibes:momentsCollapsed';
const MAX_VISIBLE = 10;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type VibesMomentsStripProps = {
  users: MomentUser[];
  hasMyActiveMoment: boolean;
  showEmptyState: boolean;
  relationshipContextByProfileId?: Record<string, MomentRelationshipContext>;
  onPressMyMoment: () => void;
  onPressUserMoment: (userId: string) => void;
  onPressSeeAll: () => void;
  onPressPostMoment: () => void;
  variant?: 'inline' | 'floating';
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  expandedAsHeaderOnly?: boolean;
  bodyOnly?: boolean;
};

export default function VibesMomentsStrip({
  users,
  hasMyActiveMoment: _hasMyActiveMoment,
  showEmptyState,
  relationshipContextByProfileId,
  onPressMyMoment,
  onPressUserMoment,
  onPressSeeAll,
  onPressPostMoment,
  variant = 'inline',
  collapsed: collapsedProp,
  onCollapsedChange,
  expandedAsHeaderOnly = false,
  bodyOnly = false,
}: VibesMomentsStripProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const isFloating = variant === 'floating';
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [animatedCount, setAnimatedCount] = useState(1);
  const [previousAnimatedCount, setPreviousAnimatedCount] = useState<number | null>(null);
  const countRollAnim = useRef(new Animated.Value(1)).current;
  const currentCountRef = useRef(1);
  const isControlled = typeof collapsedProp === 'boolean';

  const hasMySlot = users.some((u) => u.isOwn);
  const momentCount = users.filter((u) => !u.isOwn && u.moments.length > 0).length;
  const defaultCollapsed = isFloating ? true : !(hasMySlot || momentCount > 0);
  const storageKey = isFloating ? `${COLLAPSE_KEY}:floating:v2` : COLLAPSE_KEY;
  const loopMax = Math.max(1, Math.min(9, momentCount));
  const collapsed = isControlled ? Boolean(collapsedProp) : internalCollapsed;

  useEffect(() => {
    if (isControlled) return;
    let cancelled = false;
    const loadCollapsed = async () => {
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (cancelled) return;
        if (stored === 'true' || stored === 'false') {
          setInternalCollapsed(stored === 'true');
          return;
        }
      } catch {
        // ignore
      }
      setInternalCollapsed(defaultCollapsed);
    };
    void loadCollapsed();
    return () => {
      cancelled = true;
    };
  }, [defaultCollapsed, isControlled, storageKey]);

  useEffect(() => {
    const nextInitial = Math.max(1, Math.min(loopMax, 1));
    currentCountRef.current = nextInitial;
    setAnimatedCount(nextInitial);
    setPreviousAnimatedCount(null);
    countRollAnim.setValue(1);
  }, [loopMax]);

  useEffect(() => {
    if (!(collapsed && loopMax > 1 && momentCount <= 9)) {
      setPreviousAnimatedCount(null);
      countRollAnim.setValue(1);
      return;
    }

    const tick = () => {
      const previous = currentCountRef.current;
      const next = previous >= loopMax ? 1 : previous + 1;
      setPreviousAnimatedCount(previous);
      setAnimatedCount(next);
      currentCountRef.current = next;
      countRollAnim.setValue(0);
      Animated.timing(countRollAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setPreviousAnimatedCount(null);
      });
    };

    const interval = setInterval(tick, 1450);

    return () => clearInterval(interval);
  }, [collapsed, countRollAnim, loopMax, momentCount]);

  const toggleCollapsed = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !collapsed;
    if (!isControlled) {
      setInternalCollapsed(next);
      AsyncStorage.setItem(storageKey, String(next)).catch(() => {});
    }
    onCollapsedChange?.(next);
  };

  const displayUsers = useMemo(() => {
    if (users.length <= MAX_VISIBLE) return users;
    return users.slice(0, MAX_VISIBLE);
  }, [users]);

  const extraCount = Math.max(0, users.length - displayUsers.length);
  const collapsedCountLabel = momentCount > 9 ? '9+' : String(animatedCount);
  const previousCountLabel =
    previousAnimatedCount == null ? null : momentCount > 9 ? '9+' : String(previousAnimatedCount);
  const countCurrentAnimatedStyle: any =
    previousAnimatedCount == null
      ? null
      : {
          opacity: countRollAnim,
          transform: [
            {
              translateY: countRollAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
            {
              scale: countRollAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.96, 1],
              }),
            },
          ],
        };
  const countPreviousAnimatedStyle: any =
    previousAnimatedCount == null
      ? null
      : {
          opacity: countRollAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
          transform: [
            {
              translateY: countRollAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -12],
              }),
            },
            {
              scale: countRollAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.96],
              }),
            },
          ],
        };

  const renderCountBadge = (floating = false) => (
    <View style={[styles.countBadge, floating && styles.floatingCountBadge]}>
      <View style={styles.countViewport}>
        {previousCountLabel ? (
          <Animated.Text style={[styles.countText, styles.countTextAnimated, countPreviousAnimatedStyle]}>
            {previousCountLabel}
          </Animated.Text>
        ) : null}
        {previousAnimatedCount == null ? (
          <Text style={styles.countText}>{collapsedCountLabel}</Text>
        ) : (
          <Animated.Text style={[styles.countText, styles.countTextAnimated, countCurrentAnimatedStyle]}>
            {collapsedCountLabel}
          </Animated.Text>
        )}
      </View>
    </View>
  );

  if (isFloating && showEmptyState) {
    return (
      <View style={styles.floatingRow}>
        <TouchableOpacity style={[styles.collapsedInner, styles.floatingInner]} onPress={onPressPostMoment} activeOpacity={0.88}>
          <View>
            <Text style={styles.eyebrow}>Community pulse</Text>
            <Text style={styles.title}>Moments</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPressPostMoment} activeOpacity={0.88} style={[styles.seeAllPill, styles.floatingSeeAllPill]}>
          <MaterialCommunityIcons name="plus" size={14} color={theme.tint} style={{ marginRight: 6 }} />
          <Text style={styles.seeAllText}>Share</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isFloating && collapsed) {
    return (
      <View style={styles.floatingRow}>
        <TouchableOpacity style={[styles.collapsedInner, styles.floatingInner]} onPress={toggleCollapsed} activeOpacity={0.88}>
          <View>
            <Text style={styles.eyebrow}>Community pulse</Text>
            <Text style={styles.title}>Moments</Text>
          </View>
          {momentCount > 0 ? renderCountBadge(true) : null}
          <MaterialCommunityIcons name="chevron-down" size={18} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPressSeeAll} activeOpacity={0.88} style={[styles.seeAllPill, styles.floatingSeeAllPill]}>
          <MaterialCommunityIcons name="arrow-top-right" size={14} color={theme.tint} style={{ marginRight: 6 }} />
          <Text style={styles.seeAllText}>See all</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showEmptyState) {
    return (
      <LinearGradientSafe
        colors={isDark ? ['rgba(20,36,35,0.96)', 'rgba(10,20,24,0.98)'] : ['#ffffff', '#f5fbfa']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.emptyShell}
      >
        <View style={styles.emptyHeader}>
          <View style={styles.emptyHeaderLeft}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="star-four-points" size={18} color={theme.secondary} />
            </View>
            <View style={styles.emptyCopyWrap}>
              <Text style={styles.eyebrow}>Community pulse</Text>
              <Text style={styles.emptyTitle}>Moments</Text>
              <Text style={styles.emptyText}>Share a moment to warm up discovery.</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.postButton} onPress={onPressPostMoment} activeOpacity={0.85}>
            <Text style={styles.postButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </LinearGradientSafe>
    );
  }

  if (collapsed || expandedAsHeaderOnly) {
    return (
      <View style={styles.collapsedRow}>
        <TouchableOpacity style={styles.collapsedInner} onPress={toggleCollapsed} activeOpacity={0.85}>
          <View>
              <Text style={styles.eyebrow}>Community pulse</Text>
              <Text style={styles.title}>Moments</Text>
          </View>
          {momentCount > 0 ? renderCountBadge() : null}
          <MaterialCommunityIcons name={collapsed ? "chevron-down" : "chevron-up"} size={18} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPressSeeAll} activeOpacity={0.85} style={styles.seeAllPill}>
          <MaterialCommunityIcons name="send" size={14} color={theme.tint} style={{ marginRight: 6 }} />
          <Text style={styles.seeAllText}>See all</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderItem = ({ item }: { item: MomentUser }) => {
    const fullLabel = item.isOwn ? 'Your Moment' : item.name;
    const hasMoment = item.moments.length > 0;
    const label = item.isOwn ? (hasMoment ? 'You' : 'Share') : String(item.name || 'Member').trim().split(/\s+/)[0] || 'Member';
    const showPlus = item.isOwn && !hasMoment;
    const relationshipContext =
      !item.isOwn && item.profileId ? relationshipContextByProfileId?.[String(item.profileId)] ?? null : null;
    const statusText = item.isOwn ? (hasMoment ? 'Live now' : 'Post now') : relationshipContext?.cue || 'Fresh';
    const initial = fullLabel ? fullLabel[0]?.toUpperCase() : 'M';
    const safeAvatarUrl = getSafeRemoteImageUri(item.avatarUrl);

      return (
      <TouchableOpacity
        style={[styles.avatarItem, isFloating && styles.avatarItemFloating]}
        activeOpacity={0.85}
        onPress={() => (item.isOwn ? onPressMyMoment() : onPressUserMoment(item.userId))}
      >
        <View style={[styles.avatarOuter, isFloating && styles.avatarOuterFloating, hasMoment && styles.avatarActive]}>
          {safeAvatarUrl ? (
            <Image source={{ uri: safeAvatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>
        {showPlus ? (
          <View style={styles.plusBadge}>
            <MaterialCommunityIcons name="plus" size={12} color="#fff" />
          </View>
        ) : null}
        <Text style={[styles.avatarLabel, isFloating && styles.avatarLabelFloating]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.avatarMeta, isFloating && styles.avatarMetaFloating]} numberOfLines={1}>
          {statusText}
        </Text>
      </TouchableOpacity>
    );
  };

  if (bodyOnly) {
    if (collapsed || showEmptyState) {
      return null;
    }

    return (
      <LinearGradientSafe
        colors={isDark ? ['rgba(20,36,35,0.64)', 'rgba(10,20,24,0.70)'] : ['rgba(255,255,255,0.70)', 'rgba(245,251,250,0.66)']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.floatingBody}
      >
        <View style={styles.listRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, styles.listContentFloating]}
          >
            {displayUsers.map((item) => (
              <View key={item.userId}>{renderItem({ item })}</View>
            ))}
          </ScrollView>
          {extraCount > 0 ? (
            <TouchableOpacity style={[styles.morePill, styles.morePillFloating]} onPress={onPressSeeAll} activeOpacity={0.88}>
              <Text style={styles.moreText}>{`+${extraCount}`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradientSafe>
    );
  }

  return (
    <LinearGradientSafe
      colors={isDark ? ['rgba(20,36,35,0.96)', 'rgba(10,20,24,0.98)'] : ['#ffffff', '#f5fbfa']}
      start={[0, 0]}
      end={[1, 1]}
      style={styles.strip}
    >
      <View style={styles.stripHeader}>
        <View style={styles.stripTitleBlock}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>Community pulse</Text>
            {momentCount > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{momentCount > 9 ? '9+' : String(momentCount)}</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity style={styles.stripTitleRow} onPress={toggleCollapsed} activeOpacity={0.85}>
            <Text style={styles.title}>Moments</Text>
            <MaterialCommunityIcons name="chevron-up" size={16} color={theme.text} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          <Text style={styles.stripSubtitle}>Fresh signals from people already on your radar.</Text>
        </View>
        <TouchableOpacity onPress={onPressSeeAll} activeOpacity={0.85} style={styles.seeAllPill}>
          <MaterialCommunityIcons name="arrow-top-right" size={14} color={theme.tint} style={{ marginRight: 6 }} />
          <Text style={styles.seeAllText}>See all</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listRow}>
        <FlatList
          data={displayUsers}
          keyExtractor={(item) => item.userId}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={5}
          maxToRenderPerBatch={8}
          removeClippedSubviews={false}
          contentContainerStyle={styles.listContent}
        />
        {extraCount > 0 ? (
          <TouchableOpacity style={styles.morePill} onPress={onPressSeeAll} activeOpacity={0.85}>
            <Text style={styles.moreText}>{`+${extraCount} more`}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </LinearGradientSafe>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => {
  const surface = theme.backgroundSubtle;
  const outline = theme.outline;
  const pillBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';
  const shellBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  return StyleSheet.create({
    strip: {
      marginHorizontal: 20,
      marginTop: 4,
      marginBottom: 0,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: shellBorder,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.22 : 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    stripHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
    stripTitleBlock: { flex: 1, paddingRight: 12 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
    stripTitleRow: { flexDirection: 'row', alignItems: 'center' },
    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: theme.secondary,
    },
    title: { fontSize: 18, fontWeight: '800', color: theme.text },
    stripSubtitle: {
      marginTop: 5,
      fontSize: 12,
      lineHeight: 17,
      color: theme.textMuted,
      fontWeight: '600',
      maxWidth: 220,
    },
    seeAllPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: pillBg,
    },
    seeAllText: { fontSize: 12, fontWeight: '700', color: theme.tint },
    listRow: { flexDirection: 'row', alignItems: 'flex-start' },
    listContent: { alignItems: 'flex-start', paddingRight: 12, paddingTop: 2 },
    avatarItem: { width: 76, alignItems: 'center', marginRight: 14 },
    avatarOuter: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 3,
      borderColor: 'rgba(240,210,160,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.92)',
    },
    avatarActive: {
      borderColor: '#f3c784',
      shadowColor: '#f3c784',
      shadowOpacity: isDark ? 0.28 : 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    avatarImage: { width: 56, height: 56, borderRadius: 28 },
    avatarPlaceholder: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? '#1f2937' : '#e2e8f0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontSize: 14, fontWeight: '700', color: theme.textMuted },
    avatarLabel: {
      fontSize: 12,
      color: theme.text,
      marginTop: 8,
      textAlign: 'center',
      fontWeight: '700',
    },
    avatarMeta: {
      marginTop: 2,
      fontSize: 10,
      color: theme.textMuted,
      textAlign: 'center',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    plusBadge: {
      position: 'absolute',
      right: 4,
      top: 40,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#f59e0b',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.background,
    },
    morePill: {
      marginLeft: 8,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: pillBg,
    },
    moreText: { fontSize: 12, fontWeight: '700', color: theme.text },
    emptyShell: {
      marginHorizontal: 20,
      marginTop: 2,
      marginBottom: 0,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: shellBorder,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.18 : 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    emptyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    emptyHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    emptyCopyWrap: {
      flex: 1,
    },
    emptyIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
      borderWidth: 1,
      borderColor: outline,
      marginRight: 10,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 2 },
    emptyText: { flex: 1, fontSize: 12, color: theme.textMuted, lineHeight: 17 },
    postButton: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    postButtonText: { color: '#fff', fontWeight: '700', fontSize: 11 },
    collapsedRow: {
      marginHorizontal: 20,
      marginTop: 4,
      marginBottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    collapsedInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: outline,
    },
    floatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    floatingInner: {
      flex: 1,
      borderRadius: 22,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(12,24,28,0.62)' : 'rgba(255,255,255,0.68)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)',
    },
    floatingBody: {
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginTop: 2,
      borderWidth: 1,
      borderColor: shellBorder,
      backgroundColor: isDark ? 'rgba(12,24,28,0.38)' : 'rgba(255,255,255,0.52)',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.12 : 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 7,
      transform: [{ translateY: 0 }],
    },
    floatingStrip: {
      marginHorizontal: 0,
      marginTop: 0,
      marginBottom: 0,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: 'transparent',
    },
    floatingSeeAllPill: {
      backgroundColor: isDark ? 'rgba(12,24,28,0.62)' : 'rgba(255,255,255,0.68)',
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)',
    },
    floatingCountBadge: {
      backgroundColor: isDark ? 'rgba(17,197,198,0.18)' : 'rgba(17,197,198,0.14)',
      borderColor: isDark ? 'rgba(17,197,198,0.34)' : 'rgba(17,197,198,0.22)',
    },
    listContentFloating: {
      paddingTop: 0,
      paddingRight: 6,
    },
    avatarItemFloating: {
      width: 54,
      marginRight: 8,
    },
    avatarOuterFloating: {
      width: 46,
      height: 46,
      borderRadius: 23,
    },
    avatarLabelFloating: {
      marginTop: 3,
      fontSize: 9,
    },
    avatarMetaFloating: {
      fontSize: 7,
      letterSpacing: 0.24,
    },
    morePillFloating: {
      marginTop: 4,
    },
    countBadge: {
      marginLeft: 8,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 11,
      backgroundColor: isDark ? 'rgba(17,197,198,0.14)' : 'rgba(17,197,198,0.12)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(17,197,198,0.26)' : 'rgba(17,197,198,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    countViewport: {
      minWidth: 10,
      height: 12,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    countText: { color: theme.tint, fontSize: 11, fontWeight: '800' },
    countTextAnimated: {
      position: 'absolute',
      left: 0,
      right: 0,
      textAlign: 'center',
    },
  });
};
