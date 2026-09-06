import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useReduceMotion } from '@/hooks/useReduceMotion';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';

export type CircleDetailHeroMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

type Props = {
  name: string;
  purpose: string;
  description?: string | null;
  imageUrl?: string | null;
  hasCoverImage: boolean;
  kindLabel: string;
  scopeLabel: string;
  locationInsight?: string | null;
  memberCount: number;
  members: readonly CircleDetailHeroMember[];
  isMember: boolean;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  canEditCover: boolean;
  coverUpdating: boolean;
  onEditCover: () => void;
};

const avatarInitial = (name: string) => name.trim().charAt(0).toUpperCase() || 'B';

export default function CircleDetailHero({
  name,
  purpose,
  description,
  imageUrl,
  hasCoverImage,
  kindLabel,
  scopeLabel,
  locationInsight,
  memberCount,
  members,
  isMember,
  primaryActionLabel,
  onPrimaryAction,
  canEditCover,
  coverUpdating,
  onEditCover,
}: Props) {
  const reduceMotion = useReduceMotion();
  const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 440,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reduceMotion]);

  const visibleMembers = members.slice(0, 4);

  return (
    <Animated.View
      style={[
        styles.shell,
        {
          opacity: entrance,
          transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {imageUrl && hasCoverImage ? (
        <Image source={{ uri: imageUrl }} style={styles.cover} resizeMode="cover" />
      ) : null}
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientBottom} />
      {imageUrl && !hasCoverImage ? (
        <View pointerEvents="none" style={styles.watermarkShell}>
          <Image source={{ uri: imageUrl }} style={styles.watermark} resizeMode="cover" />
        </View>
      ) : null}
      <LinearGradient
        colors={hasCoverImage
          ? ['rgba(7,24,22,0.38)', 'rgba(7,24,22,0.82)', 'rgba(7,20,19,0.99)']
          : ['rgba(15,56,51,0.84)', 'rgba(16,35,32,0.98)', 'rgba(12,25,24,1)']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <View style={styles.badges}>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="shield-star-outline" size={13} color="#DCC481" />
            <Text style={styles.badgeText}>{kindLabel}</Text>
          </View>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="earth" size={13} color="#A7DDD2" />
            <Text style={styles.badgeText}>{scopeLabel}</Text>
          </View>
        </View>

        <View style={styles.identityCopy}>
          <Text style={styles.name} numberOfLines={3}>{name}</Text>
          <Text style={styles.purpose} numberOfLines={2}>{purpose}</Text>
          {description ? <Text style={styles.description} numberOfLines={2}>{description}</Text> : null}
          {locationInsight ? (
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color="#8FD4C8" />
              <Text style={styles.location} numberOfLines={1}>{locationInsight}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <View style={styles.socialProof}>
            {visibleMembers.length > 0 ? (
              <View style={styles.avatarStack}>
                {visibleMembers.map((member, index) => {
                  const avatarUrl = normalizeProfilePhotoUri(member.avatarUrl);
                  return (
                    <View key={member.id} style={[styles.avatarFrame, index > 0 && styles.avatarOverlap]}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                      ) : (
                        <Text style={styles.avatarInitial}>{avatarInitial(member.name)}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.peopleIcon}>
                <MaterialCommunityIcons name="account-group-outline" size={18} color="#BFE4DC" />
              </View>
            )}
            <View style={styles.socialCopy}>
              <Text style={styles.memberCount}>{memberCount} {memberCount === 1 ? 'member' : 'members'}</Text>
              <Text style={styles.memberStatus}>{isMember ? 'You belong here' : 'A shared-context community'}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryActionLabel}
              onPress={onPrimaryAction}
              style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name={isMember ? 'account-plus-outline' : 'account-multiple-plus-outline'}
                size={17}
                color="#112522"
              />
              <Text style={styles.primaryActionText}>{primaryActionLabel}</Text>
            </Pressable>
            {canEditCover ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Update Circle cover"
                disabled={coverUpdating}
                onPress={onEditCover}
                style={({ pressed }) => [styles.editAction, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name={coverUpdating ? 'loading' : 'image-edit-outline'} size={18} color="#F6EAD0" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 366,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#102D29',
    borderWidth: 1,
    borderColor: 'rgba(135,204,191,0.28)',
  },
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  ambientTop: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    right: -74,
    top: -86,
    backgroundColor: 'rgba(0,173,164,0.2)',
  },
  ambientBottom: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    left: -86,
    bottom: -102,
    backgroundColor: 'rgba(171,126,219,0.18)',
  },
  watermarkShell: {
    position: 'absolute',
    right: 22,
    top: 56,
    width: 126,
    height: 126,
    borderRadius: 63,
    padding: 5,
    backgroundColor: 'rgba(238,226,199,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(238,226,199,0.22)',
  },
  watermark: { width: '100%', height: '100%', borderRadius: 58, opacity: 0.24 },
  content: { minHeight: 366, padding: 22, justifyContent: 'space-between' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  badge: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(229,212,170,0.2)',
    backgroundColor: 'rgba(6,22,21,0.54)',
  },
  badgeText: { color: '#E9DDC3', fontSize: 9, letterSpacing: 0.72, fontFamily: 'Manrope_800ExtraBold' },
  identityCopy: { maxWidth: '92%', marginTop: 42 },
  name: { color: '#FFF7E9', fontSize: 36, lineHeight: 41, fontFamily: 'PlayfairDisplay_700Bold', textShadowColor: 'rgba(0,0,0,0.32)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  purpose: { color: '#F1E6D1', fontSize: 15, lineHeight: 22, marginTop: 11, fontFamily: 'Manrope_700Bold' },
  description: { color: '#B5C8C3', fontSize: 12, lineHeight: 19, marginTop: 7, fontFamily: 'Manrope_500Medium' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 },
  location: { flex: 1, color: '#9AD7CB', fontSize: 11, fontFamily: 'Manrope_700Bold' },
  footer: { gap: 16, marginTop: 25 },
  socialProof: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  avatarStack: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  avatarFrame: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#284640',
    borderWidth: 2,
    borderColor: '#102522',
  },
  avatarOverlap: { marginLeft: -10 },
  avatar: { width: '100%', height: '100%' },
  avatarInitial: { color: '#DDEBE7', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  peopleIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(113,194,179,0.15)' },
  socialCopy: { flex: 1, marginLeft: 10 },
  memberCount: { color: '#F2E8D5', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  memberStatus: { color: '#9EB4AE', fontSize: 9, marginTop: 2, fontFamily: 'Manrope_600SemiBold' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  primaryAction: {
    minHeight: 46,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 23,
    backgroundColor: '#DFC375',
  },
  primaryActionText: { color: '#112522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  editAction: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(246,234,208,0.3)',
    backgroundColor: 'rgba(7,23,21,0.66)',
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
