import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/theme';
import type { MomentUser } from '@/hooks/useMoments';

type Props = {
  users: MomentUser[];
  isLoading?: boolean;
  onPressUser: (userId: string) => void;
  onPressCreate: () => void;
  onPressOwn?: () => void;
};

export default function MomentsRow({ users, isLoading, onPressUser, onPressCreate, onPressOwn }: Props) {
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
                    {user.avatarUrl ? (
                      <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarInitial}>{label.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  {isOwn && (
                    <View style={styles.plusBadge}>
                      <MaterialCommunityIcons name="plus" size={14} color="#fff" />
                    </View>
                  )}
                </LinearGradient>
              ) : (
                <View style={styles.ring}>
                  <View style={styles.innerRing}>
                    {user.avatarUrl ? (
                      <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarInitial}>{label.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  {isOwn && (
                    <View style={styles.plusBadge}>
                      <MaterialCommunityIcons name="plus" size={14} color="#fff" />
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 4,
  },
  title: {
    color: '#0f172a',
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
    borderColor: '#e5e7eb',
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
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#111827', fontFamily: 'Archivo_700Bold', fontSize: 18 },
  plusBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.light.tint,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { color: '#111827', fontSize: 12, fontFamily: 'Manrope_600SemiBold', marginTop: 6 },
});
