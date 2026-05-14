import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useOfflineSyncStatus } from '@/hooks/useOfflineSyncStatus';

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

export default function OfflineSyncStatusPill() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { pendingCount, failedCount, readyCount, loading, retryNow } = useOfflineSyncStatus();

  const copy = useMemo(() => {
    if (loading) return null;
    if (failedCount > 0) {
      return {
        icon: 'alert-circle-outline' as const,
        title: 'Sync issue',
        body: `${failedCount} action${failedCount === 1 ? '' : 's'} need review`,
        tone: 'danger' as const,
      };
    }
    if (pendingCount > 0) {
      const waiting = pendingCount - readyCount;
      return {
        icon: readyCount > 0 ? 'cloud-sync-outline' as const : 'clock-outline' as const,
        title: `${pendingCount} waiting`,
        body: waiting > 0 ? 'Will retry shortly' : 'Sending when connected',
        tone: 'pending' as const,
      };
    }
    return null;
  }, [failedCount, loading, pendingCount, readyCount]);

  if (!copy) return null;

  const accent = copy.tone === 'danger' ? theme.danger : theme.tint;

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom: Math.max(insets.bottom + 74, 88) }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => void retryNow()}
        style={[
          styles.pill,
          {
            backgroundColor: theme.background,
            borderColor: withAlpha(accent, 0.28),
            shadowColor: theme.text,
          },
        ]}
      >
        <LinearGradient
          colors={[withAlpha(accent, 0.24), withAlpha(theme.accent, 0.14)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(accent, 0.14), borderColor: withAlpha(accent, 0.22) }]}>
          <MaterialCommunityIcons name={copy.icon} size={17} color={accent} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {copy.title}
          </Text>
          <Text style={[styles.body, { color: theme.textMuted }]} numberOfLines={1}>
            {copy.body}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 760,
    alignItems: 'center',
  },
  pill: {
    minHeight: 46,
    maxWidth: 250,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    minWidth: 0,
  },
  title: {
    fontSize: 12.5,
    fontFamily: 'Archivo_700Bold',
  },
  body: {
    marginTop: 1,
    fontSize: 10.5,
    fontFamily: 'Manrope_500Medium',
  },
});
