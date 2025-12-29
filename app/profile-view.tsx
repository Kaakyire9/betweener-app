import { useAppFonts } from '@/constants/fonts';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Match } from '@/types/match';
import MatchModal from '@/components/MatchModal';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Linking,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ProfileVideoModal from '@/components/ProfileVideoModal';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type Interest = { id: string; name: string; category: string; emoji: string };
type UserProfile = {
  id: string;
  name: string;
  age: number;
  location: string;
  profilePicture: string;
  photos: string[];
  occupation: string;
  education: string;
  verified: boolean;
  bio: string;
  distance: string;
  isActiveNow: boolean;
  tribe?: string;
  religion?: string;
  interests: Interest[];
  compatibility: number;
  aiScore?: number;
};

const getInterestEmoji = (interest: string): string => {
  const emojiMap: Record<string, string> = {
    Music: '🎵',
    Travel: '✈️',
    Food: '🍲',
    Dancing: '💃',
    Movies: '🎬',
    Art: '🎨',
    Reading: '📚',
    Sports: '🏅',
    Gaming: '🎮',
    Cooking: '👩‍🍳',
    Photography: '📷',
    Fitness: '💪',
    Nature: '🌿',
    Technology: '💡',
    Fashion: '👗',
    Writing: '✍️',
    Singing: '🎤',
    Comedy: '😂',
    Business: '💼',
    Volunteering: '🤝',
    Learning: '🧠',
    Socializing: '🥂',
    Adventure: '🧭',
    Relaxing: '😌',
  };
  return emojiMap[interest] || '💫';
};

export default function ProfileViewScreen() {
  const { profile: currentUser } = useAuth();
  const fontsLoaded = useAppFonts();
  const params = useLocalSearchParams();
  const viewedProfileId = (params as any)?.profileId as string | undefined;

  const [fetchedProfile, setFetchedProfile] = useState<UserProfile | null>(null);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showFullBio, setShowFullBio] = useState(false);
  const likeAnimation = useRef(new Animated.Value(0)).current;
  const compatibilityAnimation = useRef(new Animated.Value(0)).current;
  const photoAnimation = useRef(new Animated.Value(0)).current;
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [celebrationMatch, setCelebrationMatch] = useState<Match | null>(null);

  const placeholderProfile: UserProfile = {
    id: viewedProfileId || 'preview',
    name: viewedProfileId ? 'Loading profile...' : 'Profile',
    age: 0,
    location: '',
    profilePicture: '',
    photos: [],
    occupation: '',
    education: '',
    verified: false,
    bio: '',
    distance: '',
    isActiveNow: false,
    compatibility: 80,
    aiScore: undefined,
    interests: [],
  };

  const isOwnProfilePreview = params.isPreview === 'true' && (params.profileId === currentUser?.id || params.profileId === 'preview');

  const baseProfileData: UserProfile = isOwnProfilePreview
    ? {
        id: currentUser?.id || 'preview',
        name: currentUser?.full_name || 'Your Name',
        age: currentUser?.age || 25,
        location: currentUser?.region || 'Your Location',
        profilePicture:
          currentUser?.avatar_url ||
          'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face',
        photos: (currentUser as any)?.photos || (currentUser?.avatar_url ? [currentUser.avatar_url] : []),
        occupation: (currentUser as any)?.occupation || '',
        education: (currentUser as any)?.education || '',
        verified: !!(currentUser as any)?.verification_level,
        bio: currentUser?.bio || '',
        distance: 'You',
        isActiveNow: true,
        compatibility: 100,
        aiScore: 100,
        interests: [],
      }
    : placeholderProfile;

  const parsedFallback = useMemo((): UserProfile | null => {
    const rawParam = (params as any)?.fallbackProfile as string | string[] | undefined;
    const raw = Array.isArray(rawParam) ? rawParam[0] : rawParam;
    if (!raw) return null;
    const candidates = [raw, (() => { try { return decodeURIComponent(raw); } catch { return raw; } })()];
    for (const cand of candidates) {
      try {
        const parsed = JSON.parse(cand || '{}');
        const photos = Array.isArray(parsed.photos) ? parsed.photos : parsed.avatar_url ? [parsed.avatar_url] : [];
        return {
          id: parsed.id || placeholderProfile.id,
          name: parsed.name || 'Profile',
          age: parsed.age || 0,
          location: parsed.location || '',
          profilePicture: parsed.avatar_url || photos[0] || '',
          photos,
          occupation: parsed.occupation || '',
          education: parsed.education || '',
          verified: !!parsed.verified,
          bio: parsed.bio || '',
          distance: parsed.distance || '',
          isActiveNow: !!parsed.is_active,
          compatibility:
            typeof parsed.compatibility === 'number'
              ? parsed.compatibility
              : typeof parsed.aiScore === 'number'
              ? Math.round(parsed.aiScore)
              : 75,
          aiScore: typeof parsed.aiScore === 'number' ? parsed.aiScore : undefined,
          tribe: parsed.tribe,
          religion: parsed.religion,
          interests: Array.isArray(parsed.interests)
            ? parsed.interests.map((n: any, idx: number) => ({
                id: `int-${idx}`,
                name: String(n),
                category: 'Interest',
                emoji: getInterestEmoji(String(n)),
              }))
            : [],
        } as UserProfile;
      } catch {
        // ignore and try next
      }
    }
    return null;
  }, [params, placeholderProfile.id]);

  const profileData = fetchedProfile ?? parsedFallback ?? (isOwnProfilePreview ? baseProfileData : placeholderProfile);

  // fetch from Supabase
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (isOwnProfilePreview) {
        setFetchedProfile(null);
        return;
      }
      if (!viewedProfileId) return;
      try {
        console.log('[profile-view] fetching profile', { viewedProfileId });
        const selectFull =
          'id, full_name, age, region, location, avatar_url, photos, occupation, education, bio, tribe, religion, is_active, online, verification_level, ai_score';
        const selectMinimal =
          'id, full_name, age, region, location, avatar_url, bio, tribe, religion, is_active, online, verification_level, ai_score';
        let data: any = null;
        let error: any = null;
        try {
          const res = await supabase.from('profiles').select(selectFull).eq('id', viewedProfileId).limit(1).single();
          data = res.data;
          error = res.error;
        } catch (e) {
          error = e;
        }
        if (error && (error.code === '42703' || String(error.message || '').includes('column'))) {
          try {
            const res2 = await supabase.from('profiles').select(selectMinimal).eq('id', viewedProfileId).limit(1).single();
          data = res2.data;
          error = res2.error;
        } catch (e) {
          error = e;
        }
      }
        if (error || !data) throw error || new Error('Profile not found');

        let interestsArr: Interest[] = [];
        try {
          const { data: piRows } = await supabase
            .from('profile_interests')
            .select('interest_id, interests!inner(name)')
            .eq('profile_id', viewedProfileId);
          if (Array.isArray(piRows) && piRows.length > 0) {
            const names = piRows.flatMap((r: any) =>
              Array.isArray(r.interests)
                ? r.interests.map((i: any) => i.name).filter(Boolean)
                : (r.interests && r.interests.name ? [r.interests.name] : []),
            );
            interestsArr = names.map((n: string, idx: number) => ({
              id: `int-${idx}`,
              name: n,
              category: 'Interest',
              emoji: getInterestEmoji(n),
            }));
            console.log('[profile-view] interests from profile_interests', { count: interestsArr.length });
          } else {
            // fallback: check if profile row has an interests array column
            const rawInterests = (data as any).interests;
            if (Array.isArray(rawInterests)) {
              interestsArr = rawInterests.map((n: any, idx: number) => ({
                id: `int-prof-${idx}`,
                name: String(n),
                category: 'Interest',
                emoji: getInterestEmoji(String(n)),
              }));
              console.log('[profile-view] interests from profiles.interests', { count: interestsArr.length });
            } else {
              console.log('[profile-view] no interests found on profile', {
                profileId: viewedProfileId,
                piRowsLength: Array.isArray(piRows) ? piRows.length : 'n/a',
                rawInterestsType: typeof rawInterests,
              });
            }
          }
        } catch (e) {
          console.log('[profile-view] interests fetch error', e);
        }

        const photos = Array.isArray((data as any).photos) ? (data as any).photos : data.avatar_url ? [data.avatar_url] : [];
        const aiScoreRaw = Number((data as any).ai_score);
        const aiScoreVal = Number.isFinite(aiScoreRaw) && aiScoreRaw > 0 ? aiScoreRaw : undefined;
        const mapped: UserProfile = {
          id: data.id,
          name: data.full_name || 'Profile',
          age: data.age || 0,
          location: data.location || data.region || '',
          profilePicture: data.avatar_url || photos[0] || '',
          photos,
          occupation: data.occupation || '',
          education: data.education || '',
          verified: !!data.verification_level,
          bio: data.bio || '',
          distance: data.region || data.location || '',
          isActiveNow: !!data.is_active || !!(data as any).online,
          compatibility: typeof aiScoreVal === 'number'
            ? Math.round(aiScoreVal)
            : typeof (data as any).compatibility === 'number'
            ? (data as any).compatibility
            : 75,
          aiScore: aiScoreVal,
          tribe: data.tribe || undefined,
          religion: data.religion || undefined,
          interests: interestsArr,
        };
        // Ensure we always have at least one photo if avatar is present
        if ((!mapped.photos || mapped.photos.length === 0) && mapped.profilePicture) {
          mapped.photos = [mapped.profilePicture];
        }
        console.log('[profile-view] mapped profile', {
          id: mapped.id,
          avatarUrl: data.avatar_url,
          rawPhotosType: Array.isArray((data as any).photos) ? 'array' : typeof (data as any).photos,
          hasAvatar: !!mapped.profilePicture,
          photos: mapped.photos?.length || 0,
          interests: mapped.interests?.length || 0,
          compatibility: mapped.compatibility,
          aiScore: mapped.aiScore,
        });
        if (mounted) setFetchedProfile(mapped);
      } catch (e) {
        console.log('[profile-view] fetch error', e);
        if (mounted) setFetchedProfile(null);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [isOwnProfilePreview, viewedProfileId]);

  useEffect(() => {
    Animated.timing(photoAnimation, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.spring(compatibilityAnimation, { toValue: 1, useNativeDriver: true }).start();
    }, 600);
    try {
      const v = (params as any)?.videoUrl;
      if (v) {
        setVideoModalUrl(String(v));
        setVideoModalVisible(true);
      }
    } catch {}
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({ message: `Check out ${profileData.name}'s profile on Betweener!` });
    } catch (error) {
      console.error(error);
    }
  };

  const recordSwipe = async (action: 'LIKE' | 'PASS' | 'SUPERLIKE') => {
    try {
      if (!currentUser?.id) {
        Alert.alert('Sign in required', 'Please sign in to continue.');
        return;
      }
      await supabase
        .from('swipes')
        .upsert([{ swiper_id: currentUser.id, target_id: profileData.id, action }], { onConflict: 'swiper_id,target_id' });
    } catch (e) {
      console.log('[profile-view] swipe error', e);
    }
  };

  const checkMutual = async () => {
    try {
      if (!currentUser?.id) return;
      const { data } = await supabase
        .from('swipes')
        .select('id')
        .eq('swiper_id', profileData.id)
        .eq('target_id', currentUser.id)
        .in('action', ['LIKE', 'SUPERLIKE'])
        .limit(1);
      if (data && data.length > 0) setCelebrationMatch(makeMatchObject());
    } catch (e) {
      console.log('[profile-view] mutual check error', e);
    }
  };

  const checkMatchAccepted = async () => {
    try {
      if (!currentUser?.id) return;
      const { data } = await supabase
        .from('matches')
        .select('id')
        .or(
          `and(user1_id.eq.${currentUser.id},user2_id.eq.${profileData.id},status.eq.ACCEPTED),and(user1_id.eq.${profileData.id},user2_id.eq.${currentUser.id},status.eq.ACCEPTED)`,
        )
        .limit(1);
      if (data && data.length > 0) setCelebrationMatch(makeMatchObject());
    } catch (e) {
      console.log('[profile-view] match check error', e);
    }
  };

  const handleLike = async () => {
    setIsLiked(!isLiked);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await recordSwipe('LIKE');
    await checkMutual();
    await checkMatchAccepted();
    Animated.sequence([
      Animated.timing(likeAnimation, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(likeAnimation, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const handlePass = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await recordSwipe('PASS');
    if (router.canGoBack?.()) router.back();
    else router.replace('/(tabs)/explore');
  };

  const handleSuperLike = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await recordSwipe('SUPERLIKE');
    await checkMutual();
    await checkMatchAccepted();
  };

  const nextPhoto = () => {
    if (currentPhotoIndex < profileData.photos.length - 1) {
      photoAnimation.setValue(0);
      setCurrentPhotoIndex((p) => p + 1);
      Animated.timing(photoAnimation, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  };

  const prevPhoto = () => {
    if (currentPhotoIndex > 0) {
      photoAnimation.setValue(0);
      setCurrentPhotoIndex((p) => p - 1);
      Animated.timing(photoAnimation, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => (router.canGoBack?.() ? router.back() : router.replace('/(tabs)/explore'))}>
        <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
      </TouchableOpacity>
      {!isOwnProfilePreview && (
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionButton} onPress={handleShare}>
            <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      {isOwnProfilePreview && (
        <View style={styles.previewIndicator}>
          <MaterialCommunityIcons name="eye" size={18} color="#fff" />
          <Text style={styles.previewIndicatorText}>Preview Mode</Text>
        </View>
      )}
    </View>
  );

  if (!fontsLoaded) return <View style={styles.container} />;

  const makeMatchObject = (): Match => ({
    id: profileData.id,
    name: profileData.name,
    age: profileData.age,
    tagline: profileData.bio,
    interests: (profileData.interests || []).map((i) => i.name),
    avatar_url: profileData.profilePicture || profileData.photos[0],
    distance: profileData.distance,
    isActiveNow: profileData.isActiveNow,
    lastActive: null as any,
    verified: profileData.verified,
    personalityTags: [],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {header}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.photoContainer}>
          {profileData.photos.length > 0 ? (
            <Animated.Image
              source={{ uri: profileData.photos[currentPhotoIndex] || profileData.profilePicture }}
              style={[
                styles.mainPhoto,
                {
                  opacity: photoAnimation,
                  transform: [
                    {
                      scale: photoAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }),
                    },
                  ],
                },
              ]}
            />
          ) : (
            <View style={[styles.mainPhoto, { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff' }}>No photo</Text>
            </View>
          )}

          <View style={styles.photoNavigation}>
            <TouchableOpacity style={[styles.photoNavButton, styles.photoNavLeft]} onPress={prevPhoto} disabled={currentPhotoIndex === 0}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={currentPhotoIndex === 0 ? '#ffffff60' : '#fff'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.photoNavButton, styles.photoNavRight]}
              onPress={nextPhoto}
              disabled={currentPhotoIndex === profileData.photos.length - 1}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={currentPhotoIndex === profileData.photos.length - 1 ? '#ffffff60' : '#fff'}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.photoIndicators}>
            {profileData.photos.map((_, index) => (
              <View key={index} style={[styles.photoIndicator, index === currentPhotoIndex && styles.photoIndicatorActive]} />
            ))}
          </View>

          <View style={styles.profileOverlay}>
            <View style={styles.profileBasicInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>
                  {profileData.name}, {profileData.age}
                </Text>
                {profileData.verified && <MaterialCommunityIcons name="check-decagram" size={20} color={Colors.light.tint} />}
                {profileData.isActiveNow && (
                  <View style={styles.activeIndicator}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeText}>Online</Text>
                  </View>
                )}
              </View>
              <Text style={styles.profileLocation}>
                <MaterialCommunityIcons name="map-marker" size={14} color="#fff" /> {profileData.distance || profileData.location}
              </Text>
              <Text style={styles.profileOccupation}>{profileData.occupation}</Text>
            </View>
            <Animated.View
              style={[
                styles.compatibilityBadge,
                {
                  opacity: compatibilityAnimation,
                  transform: [
                    {
                      scale: compatibilityAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
                    },
                  ],
                },
              ]}
            >
              <MaterialCommunityIcons name="heart" size={16} color="#fff" />
              <Text style={styles.compatibilityText}>{profileData.compatibility}% Match</Text>
            </Animated.View>
          </View>
        </View>

        <View style={styles.bioSection}>
          <Text style={styles.sectionTitle}>About {profileData.name}</Text>
          <TouchableOpacity onPress={() => setShowFullBio(!showFullBio)}>
            <Text style={styles.bioText} numberOfLines={showFullBio ? undefined : 3}>
              {profileData.bio || 'No bio yet.'}
            </Text>
            {profileData.bio && profileData.bio.length > 150 && (
              <Text style={styles.showMoreText}>{showFullBio ? 'Show less' : 'Show more'}</Text>
            )}
          </TouchableOpacity>
          <View style={styles.detailsContainer}>
            {profileData.education ? (
              <View style={styles.detailItem}>
                <MaterialCommunityIcons name="school" size={18} color={Colors.light.tint} />
                <Text style={styles.detailText}>{profileData.education}</Text>
              </View>
            ) : null}
            {profileData.location ? (
              <View style={styles.detailItem}>
                <MaterialCommunityIcons name="map-marker" size={18} color={Colors.light.tint} />
                <Text style={styles.detailText}>{profileData.location}</Text>
              </View>
            ) : null}
            {profileData.tribe ? (
              <View style={styles.detailItem}>
                <MaterialCommunityIcons name="account-group" size={18} color={Colors.light.tint} />
                <Text style={styles.detailText}>{profileData.tribe}</Text>
              </View>
            ) : null}
            {profileData.religion ? (
              <View style={styles.detailItem}>
                <MaterialCommunityIcons name="church" size={18} color={Colors.light.tint} />
                <Text style={styles.detailText}>{profileData.religion}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.interestsSection}>
          <Text style={styles.sectionTitle}>Interests</Text>
          <View style={styles.interestsGrid}>
            {(profileData.interests && profileData.interests.length > 0 ? profileData.interests : []).map((interest) => (
              <View key={interest.id} style={styles.interestChip}>
                <Text style={styles.interestEmoji}>{interest.emoji}</Text>
                <Text style={styles.interestName}>{interest.name}</Text>
              </View>
            ))}
            {(!profileData.interests || profileData.interests.length === 0) && (
              <Text style={{ color: '#6b7280' }}>No interests yet.</Text>
            )}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Match celebration modal */}
      <MatchModal
        visible={!!celebrationMatch}
        match={celebrationMatch}
        onClose={() => setCelebrationMatch(null)}
        onKeepDiscovering={() => setCelebrationMatch(null)}
        onSendMessage={(m) => {
          try {
            if (m?.id) {
              router.push({ pathname: '/chat/[id]', params: { id: String(m.id), userName: m.name, userAvatar: m.avatar_url, isOnline: String(!!m.isActiveNow) } });
            } else {
              router.push('/(tabs)/chat');
            }
          } catch (e) {
            console.log('Navigation to chat failed', e);
          }
          setCelebrationMatch(null);
        }}
      />

      {!isOwnProfilePreview && (
        <View style={styles.actionButtonsContainer}>
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.passButton} onPress={handlePass}>
              <MaterialCommunityIcons name="close" size={28} color="#ef4444" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.superLikeButton} onPress={handleSuperLike}>
              <MaterialCommunityIcons name="star" size={24} color="#3b82f6" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.likeButton, isLiked && styles.likeButtonActive]} onPress={handleLike}>
              <Animated.View
                style={{
                  transform: [
                    {
                      scale: likeAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }),
                    },
                  ],
                }}
              >
                <MaterialCommunityIcons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={32}
                  color={isLiked ? '#fff' : Colors.light.tint}
                />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ProfileVideoModal
        visible={videoModalVisible}
        videoUrl={videoModalUrl ?? undefined}
        onClose={() => {
          setVideoModalVisible(false);
          setVideoModalUrl(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scrollView: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  previewIndicatorText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', color: '#fff' },
  photoContainer: { height: screenHeight * 0.7, position: 'relative' },
  mainPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoNavigation: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  photoNavButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoNavLeft: { alignItems: 'flex-start', paddingLeft: 20 },
  photoNavRight: { alignItems: 'flex-end', paddingRight: 20 },
  photoIndicators: { position: 'absolute', top: 100, left: 20, right: 20, flexDirection: 'row', gap: 6 },
  photoIndicator: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 },
  photoIndicatorActive: { backgroundColor: '#fff' },
  profileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    paddingTop: 60,
  },
  profileBasicInfo: { marginBottom: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  profileName: { fontSize: 28, fontFamily: 'Archivo_700Bold', color: '#fff' },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  activeText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', color: '#fff' },
  profileLocation: { fontSize: 16, fontFamily: 'Manrope_400Regular', color: '#e5e7eb', marginBottom: 2 },
  profileOccupation: { fontSize: 16, fontFamily: 'Manrope_500Medium', color: '#f3f4f6' },
  compatibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  compatibilityText: { fontSize: 14, fontFamily: 'Archivo_700Bold', color: '#fff' },
  bioSection: { backgroundColor: '#fff', padding: 20, paddingTop: 30 },
  sectionTitle: { fontSize: 20, fontFamily: 'Archivo_700Bold', color: '#111827', marginBottom: 16 },
  bioText: { fontSize: 16, fontFamily: 'Manrope_400Regular', color: '#374151', lineHeight: 24 },
  showMoreText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: Colors.light.tint, marginTop: 8 },
  detailsContainer: { marginTop: 20, gap: 12 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailText: { fontSize: 15, fontFamily: 'Manrope_400Regular', color: '#6b7280' },
  interestsSection: { backgroundColor: '#f8fafc', padding: 20 },
  interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  interestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  interestEmoji: { fontSize: 16 },
  interestName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: '#374151' },
  actionButtonsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  actionButtons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
  passButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  superLikeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  likeButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.light.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 3,
    borderColor: Colors.light.tint,
  },
  likeButtonActive: { backgroundColor: Colors.light.tint },
});
