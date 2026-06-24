import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MomentUser } from '@/hooks/useMoments';
import OfflineImage from '@/components/media/OfflineImage';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';

type Props = {
  users: MomentUser[];
  isLoading?: boolean;
  onPressUser: (userId: string) => void;
  onPressCreate: () => void;
  onPressOwn?: () => void;
};

export default function MomentsRow({ users, isLoading, onPressUser, onPressCreate, onPressOwn }: Props) {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = React.useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  if (!users || users.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Moments</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {users.map((user) => {
          const hasMoment = user.moments && user.moments.length > 0;
          const isOwn = user.isOwn;
          const label = isOwn ? 'Your Moment' : user.name;
          const safeAvatarUrl = getSafeRemoteImageUri(user.avatarUrl);
          const avatarFallback = (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{label.slice(0, 1).toUpperCase()}</Text>
            </View>
          );
          const onPress = isOwn
            ? () => {
                if (onPressOwn) {
                  onPressOwn();
                  return;
                }
                if (!hasMoment) {
                  onPressCreate();
                  return;
                }
                Alert.alert('Your Moment', 'What would you like to do?', [
                  { text: 'View', onPress: () => onPressUser(user.userId) },
                  { text: 'Post a Moment', onPress: onPressCreate },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }
            : () => onPressUser(user.userId);

          return (
            <TouchableOpacity
              key={user.userId}
              style={styles.item}
              onPress={onPress}
              activeOpacity={0.8}
            >
              {hasMoment ? (
                <LinearGradient
                  colors={['#f59e0b', '#f43f5e', '#22d3ee']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.ring, styles.ringActive]}
                >
                  <View style={styles.innerRing}>
                    <OfflineImage
                      uri={safeAvatarUrl}
                      style={styles.avatar}
                      contentFit="cover"
                      fallback={avatarFallback}
                    />
                  </View>
                  {isOwn && (
                    <View style={styles.plusBadge}>
                      <MaterialCommunityIcons name="plus" size={14} color={Colors.light.background} />
                    </View>
                  )}
                </LinearGradient>
              ) : (
                <View style={styles.ring}>
                  <View style={styles.innerRing}>
                    <OfflineImage
                      uri={safeAvatarUrl}
                      style={styles.avatar}
                      contentFit="cover"
                      fallback={avatarFallback}
                    />
                  </View>
                  {isOwn && (
                    <View style={styles.plusBadge}>
                      <MaterialCommunityIcons name="plus" size={14} color={Colors.light.background} />
                    </View>
                  )}
                </View>
              )}
              <Text style={styles.label} numberOfLines={1}>
                {isLoading ? 'Loading...' : label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 4,
  },
  title: {
    color: theme.text,
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    marginBottom: 10,
  },
  scrollContent: { gap: 14, paddingRight: 12 },
  item: { alignItems: 'center', width: 78 },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringActive: {
    shadowColor: '#f59e0b',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderColor: 'transparent',
  },
  innerRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: isDark ? withAlpha(theme.background, 0.88) : theme.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.backgroundSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 18 },
  plusBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.tint,
    borderWidth: 2,
    borderColor: isDark ? theme.background : Colors.light.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { color: theme.text, fontSize: 12, fontFamily: 'Manrope_600SemiBold', marginTop: 6 },
});
