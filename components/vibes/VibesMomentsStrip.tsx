import { Colors } from '@/constants/theme';
import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MomentUser } from '@/hooks/useMoments';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
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
  onPressMyMoment: () => void;
  onPressUserMoment: (userId: string) => void;
  onPressSeeAll: () => void;
  onPressPostMoment: () => void;
};

export default function VibesMomentsStrip({
  users,
  hasMyActiveMoment: _hasMyActiveMoment,
  showEmptyState,
  onPressMyMoment,
  onPressUserMoment,
  onPressSeeAll,
  onPressPostMoment,
}: VibesMomentsStripProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [collapsed, setCollapsed] = useState(false);

  const hasMySlot = users.some((u) => u.isOwn);
  const momentCount = users.filter((u) => !u.isOwn && u.moments.length > 0).length;
  const defaultCollapsed = !(hasMySlot || momentCount > 0);

  useEffect(() => {
    let cancelled = false;
    const loadCollapsed = async () => {
      try {
        const stored = await AsyncStorage.getItem(COLLAPSE_KEY);
        if (cancelled) return;
        if (stored === 'true' || stored === 'false') {
          setCollapsed(stored === 'true');
          return;
        }
      } catch {
        // ignore
      }
      setCollapsed(defaultCollapsed);
    };
    void loadCollapsed();
    return () => {
      cancelled = true;
    };
  }, [defaultCollapsed]);

  const toggleCollapsed = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => {
      const next = !prev;
      AsyncStorage.setItem(COLLAPSE_KEY, String(next)).catch(() => {});
      return next;
    });
  };

  const displayUsers = useMemo(() => {
    if (users.length <= MAX_VISIBLE) return users;
    return users.slice(0, MAX_VISIBLE);
  }, [users]);

  const extraCount = Math.max(0, users.length - displayUsers.length);

  if (collapsed) {
    return (
      <View style={styles.collapsedRow}>
        <TouchableOpacity style={styles.collapsedInner} onPress={toggleCollapsed} activeOpacity={0.85}>
          <View>
              <Text style={styles.eyebrow}>Community pulse</Text>
              <Text style={styles.title}>Moments</Text>
          </View>
          {momentCount > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{momentCount}</Text>
            </View>
          ) : null}
          <MaterialCommunityIcons name="chevron-down" size={18} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPressSeeAll} activeOpacity={0.85} style={styles.seeAllPill}>
          <MaterialCommunityIcons name="send" size={14} color={theme.tint} style={{ marginRight: 6 }} />
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

  const renderItem = ({ item }: { item: MomentUser }) => {
    const label = item.isOwn ? 'Your Moment' : item.name;
    const hasMoment = item.moments.length > 0;
    const showPlus = item.isOwn && !hasMoment;
    const initial = label ? label[0]?.toUpperCase() : 'M';

    return (
      <TouchableOpacity
        style={styles.avatarItem}
        activeOpacity={0.85}
        onPress={() => (item.isOwn ? onPressMyMoment() : onPressUserMoment(item.userId))}
      >
        <View style={[styles.avatarOuter, hasMoment && styles.avatarActive]}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
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
        <Text style={styles.avatarLabel} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradientSafe
      colors={isDark ? ['rgba(20,36,35,0.96)', 'rgba(10,20,24,0.98)'] : ['#ffffff', '#f5fbfa']}
      start={[0, 0]}
      end={[1, 1]}
      style={styles.strip}
    >
      <View style={styles.stripHeader}>
        <View>
          <Text style={styles.eyebrow}>Community pulse</Text>
          <TouchableOpacity style={styles.stripTitleRow} onPress={toggleCollapsed} activeOpacity={0.85}>
            <Text style={styles.title}>Moments</Text>
            <MaterialCommunityIcons name="chevron-up" size={16} color={theme.text} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onPressSeeAll} activeOpacity={0.85} style={styles.seeAllPill}>
          <MaterialCommunityIcons name="send" size={14} color={theme.tint} style={{ marginRight: 6 }} />
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
          removeClippedSubviews
          contentContainerStyle={styles.listContent}
        />
        {extraCount > 0 ? (
          <TouchableOpacity style={styles.morePill} onPress={onPressSeeAll} activeOpacity={0.85}>
            <Text style={styles.moreText}>{`+${extraCount}`}</Text>
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
      marginTop: 6,
      marginBottom: 4,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: shellBorder,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.18 : 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    stripHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    stripTitleRow: { flexDirection: 'row', alignItems: 'center' },
    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: theme.secondary,
      marginBottom: 2,
    },
    title: { fontSize: 15, fontWeight: '800', color: theme.text },
    seeAllPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: pillBg,
    },
    seeAllText: { fontSize: 12, fontWeight: '700', color: theme.tint },
    listRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center' },
    listContent: { alignItems: 'center', paddingRight: 12 },
    avatarItem: { width: 62, alignItems: 'center', marginRight: 12 },
    avatarOuter: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 3,
      borderColor: 'rgba(240,210,160,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarActive: { borderColor: '#f3c784' },
    avatarImage: { width: 46, height: 46, borderRadius: 23 },
    avatarPlaceholder: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: isDark ? '#1f2937' : '#e2e8f0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontSize: 14, fontWeight: '700', color: theme.textMuted },
    avatarLabel: { fontSize: 11, color: theme.text, marginTop: 4, textAlign: 'center' },
    plusBadge: {
      position: 'absolute',
      right: 0,
      top: 30,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#f59e0b',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.background,
    },
    morePill: {
      marginLeft: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
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
      borderRadius: 20,
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
    emptyTitle: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 1 },
    emptyText: { flex: 1, fontSize: 11, color: theme.textMuted, lineHeight: 14 },
    postButton: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    postButtonText: { color: '#fff', fontWeight: '700', fontSize: 11 },
    collapsedRow: {
      marginHorizontal: 20,
      marginTop: 8,
      marginBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    collapsedInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: outline,
    },
    countBadge: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: theme.tint,
    },
    countText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  });
};
