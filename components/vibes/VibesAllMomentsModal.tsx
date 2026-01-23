import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MomentUser } from '@/hooks/useMoments';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Segment = 'forYou' | 'nearby' | 'activeNow';
type SortMode = 'recent' | 'active';

type VibesAllMomentsModalProps = {
  visible: boolean;
  onClose: () => void;
  users: MomentUser[];
  currentUserId?: string | null;
  onPressUser: (userId: string) => void;
};

const buildSegmentIds = async (userId: string, segment: Segment) => {
  const limit = 50;
  try {
    if (segment === 'nearby') {
      const scored = await supabase.rpc('get_recs_nearby_scored', { p_user_id: userId, p_limit: limit });
      const { data } = !scored.error ? scored : await supabase.rpc('get_recs_nearby', { p_user_id: userId, p_limit: limit });
      return Array.isArray(data) ? data.map((p: any) => String(p.id)) : [];
    }
    if (segment === 'activeNow') {
      const scored = await supabase.rpc('get_recs_active_scored', { p_user_id: userId, p_window_minutes: 30 });
      const { data } = !scored.error ? scored : await supabase.rpc('get_recs_active', { p_user_id: userId, p_window_minutes: 30 });
      return Array.isArray(data) ? data.map((p: any) => String(p.id)) : [];
    }
    const scored = await supabase.rpc('get_recs_for_you_scored', { p_user_id: userId, p_limit: limit });
    const { data } = !scored.error ? scored : await supabase.rpc('get_recs_for_you', { p_user_id: userId, p_limit: limit });
    return Array.isArray(data) ? data.map((p: any) => String(p.id)) : [];
  } catch {
    return [];
  }
};

const formatTimeAgo = (iso?: string) => {
  if (!iso) return 'Just now';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'Just now';
  const diff = Date.now() - time;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function VibesAllMomentsModal({
  visible,
  onClose,
  users,
  currentUserId,
  onPressUser,
}: VibesAllMomentsModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [segment, setSegment] = useState<Segment>('forYou');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [search, setSearch] = useState('');
  const [segmentIds, setSegmentIds] = useState<Record<Segment, Set<string>>>({
    forYou: new Set(),
    nearby: new Set(),
    activeNow: new Set(),
  });

  useEffect(() => {
    if (!visible || !currentUserId) return;
    let cancelled = false;
    const fetchSegments = async () => {
      const [forYou, nearby, activeNow] = await Promise.all([
        buildSegmentIds(currentUserId, 'forYou'),
        buildSegmentIds(currentUserId, 'nearby'),
        buildSegmentIds(currentUserId, 'activeNow'),
      ]);
      if (cancelled) return;
      setSegmentIds({
        forYou: new Set(forYou),
        nearby: new Set(nearby),
        activeNow: new Set(activeNow),
      });
    };
    void fetchSegments();
    return () => {
      cancelled = true;
    };
  }, [visible, currentUserId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const ids = segmentIds[segment];
    let list = users.filter((u) => u.moments.length > 0);
    if (ids.size > 0) {
      list = list.filter((u) => ids.has(String(u.userId)) || u.isOwn);
    }
    if (needle) {
      list = list.filter((u) => u.name.toLowerCase().includes(needle));
    }
    list = list.sort((a, b) => {
      const aTime = a.latestMoment ? new Date(a.latestMoment.created_at).getTime() : 0;
      const bTime = b.latestMoment ? new Date(b.latestMoment.created_at).getTime() : 0;
      if (sortMode === 'active') {
        const aActive = segmentIds.activeNow.has(String(a.userId));
        const bActive = segmentIds.activeNow.has(String(b.userId));
        if (aActive !== bActive) return aActive ? -1 : 1;
      }
      return bTime - aTime;
    });
    return list;
  }, [users, search, segment, segmentIds, sortMode]);

  const renderItem = useCallback(
    ({ item }: { item: MomentUser }) => {
      const lastAt = item.latestMoment?.created_at;
      return (
        <TouchableOpacity style={styles.row} onPress={() => onPressUser(item.userId)} activeOpacity={0.85}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.rowInfo}>
            <Text style={styles.rowName}>{item.isOwn ? 'Your Moment' : item.name}</Text>
            <Text style={styles.rowMeta}>{`${item.moments.length} moments • ${formatTimeAgo(lastAt)}`}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
        </TouchableOpacity>
      );
    },
    [onPressUser, styles, theme.textMuted],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>All Moments</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.segmentRow}>
            {(['forYou', 'nearby', 'activeNow'] as Segment[]).map((seg) => (
              <TouchableOpacity
                key={seg}
                style={[styles.segmentPill, segment === seg && styles.segmentPillActive]}
                onPress={() => setSegment(seg)}
                activeOpacity={0.85}
              >
                <Text style={[styles.segmentText, segment === seg && styles.segmentTextActive]}>
                  {seg === 'forYou' ? 'For You' : seg === 'nearby' ? 'Nearby' : 'Active Now'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.searchRow}>
            <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name"
              placeholderTextColor={theme.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            <TouchableOpacity onPress={() => setSortMode(sortMode === 'recent' ? 'active' : 'recent')} activeOpacity={0.85}>
              <View style={styles.sortPill}>
                <MaterialCommunityIcons name="sort" size={14} color={theme.tint} />
                <Text style={styles.sortText}>{sortMode === 'recent' ? 'Recent' : 'Active now'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.userId}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => {
  const surface = theme.background;
  const outline = theme.outline;
  const pillBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    backdropPress: { flex: 1 },
    sheet: {
      backgroundColor: surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 20,
      borderWidth: 1,
      borderColor: outline,
      maxHeight: '85%',
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 18, fontWeight: '800', color: theme.text },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: pillBg,
    },
    segmentRow: { flexDirection: 'row', marginBottom: 12 },
    segmentPill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      alignItems: 'center',
      marginRight: 6,
      backgroundColor: pillBg,
    },
    segmentPillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    segmentText: { fontSize: 12, fontWeight: '700', color: theme.text },
    segmentTextActive: { color: '#fff' },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: outline,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: pillBg,
      marginBottom: 12,
    },
    searchInput: { flex: 1, marginLeft: 6, color: theme.text },
    sortPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#fff',
    },
    sortText: { marginLeft: 4, fontSize: 11, fontWeight: '700', color: theme.tint },
    listContent: { paddingBottom: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: outline,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: theme.backgroundSubtle },
    avatarFallback: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: outline,
    },
    avatarFallbackText: { fontWeight: '700', color: theme.text },
    rowInfo: { flex: 1 },
    rowName: { fontSize: 14, fontWeight: '700', color: theme.text },
    rowMeta: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
  });
};
