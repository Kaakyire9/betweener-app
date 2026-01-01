
import { useAppFonts } from '@/constants/fonts';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Match } from '@/types/match';
import MatchModal from '@/components/MatchModal';
import ProfileVideoModal from '@/components/ProfileVideoModal';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  Share,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const HERO_HEIGHT = screenHeight * 0.76;

type Interest = { id: string; name: string; category: string; emoji: string };
type UserProfile = {
  id: string;
  name: string;
  age: number;
  location: string;
  city?: string;
  region?: string;
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
  personalityType?: string;
  height?: string;
  lookingFor?: string;
  languages?: string[];
  currentCountry?: string;
  diasporaStatus?: string;
  willingLongDistance?: boolean;
  exerciseFrequency?: string;
  smoking?: string;
  drinking?: string;
  hasChildren?: string;
  wantsChildren?: string;
  locationPrecision?: string;
  interests: Interest[];
  compatibility: number;
  aiScore?: number;
};

const emoji = (...codes: number[]) => String.fromCodePoint(...codes);

const getInterestEmoji = (interest: string): string => {
  const emojiMap: Record<string, string> = {
    Music: emoji(0x1f3b5),
    Travel: emoji(0x2708),
    Food: emoji(0x1f354),
    Dancing: emoji(0x1f483),
    Movies: emoji(0x1f3ac),
    Art: emoji(0x1f3a8),
    Reading: emoji(0x1f4da),
    Sports: emoji(0x26bd),
    Gaming: emoji(0x1f3ae),
    Cooking: emoji(0x1f373),
    Photography: emoji(0x1f4f7),
    Fitness: emoji(0x1f4aa),
    Nature: emoji(0x1f33f),
    Technology: emoji(0x1f4bb),
    Fashion: emoji(0x1f457),
    Writing: emoji(0x270d),
    Singing: emoji(0x1f3a4),
    Comedy: emoji(0x1f602),
    Business: emoji(0x1f4bc),
    Volunteering: emoji(0x1f91d),
    Learning: emoji(0x1f4d6),
    Socializing: emoji(0x1f37b),
    Adventure: emoji(0x1f9ed),
    Relaxing: emoji(0x1f9d8),
  };
  return emojiMap[interest] || emoji(0x2728);
};

const HEADER_MAX_HEIGHT = 110;
const HEADER_MIN_HEIGHT = 64;
const PARALLAX_FACTOR = 0.35;
const SHIMMER_SPEED = 1200;
const TAP_ZONE_RATIO = 0.45;

export default function ProfileViewPremiumScreen() {
  const { profile: currentUser } = useAuth();
  const fontsLoaded = useAppFonts();
  const params = useLocalSearchParams();
  const viewedProfileId = (params as any)?.profileId as string | undefined;

  const scrollY = useRef(new Animated.Value(0)).current;
  const likeAnimation = useRef(new Animated.Value(0)).current;
  const fadeInContent = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const carouselRef = useRef<FlatList<string>>(null);

  const [fetchedProfile, setFetchedProfile] = useState<UserProfile | null>(null);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showFullBio, setShowFullBio] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [celebrationMatch, setCelebrationMatch] = useState<Match | null>(null);

  const placeholderProfile: UserProfile = {
    id: viewedProfileId || 'preview',
    name: viewedProfileId ? 'Loading profile...' : 'Profile',
    age: 0,
    location: '',
    city: '',
    region: '',
    profilePicture: '',
    photos: [],
    occupation: '',
    education: '',
    verified: false,
    bio: '',
    distance: '',
    isActiveNow: false,
    personalityType: '',
    height: '',
    lookingFor: '',
    languages: [],
    currentCountry: '',
    diasporaStatus: '',
    willingLongDistance: false,
    exerciseFrequency: '',
    smoking: '',
    drinking: '',
    hasChildren: '',
    wantsChildren: '',
    locationPrecision: '',
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
        city: (currentUser as any)?.city,
        region: currentUser?.region,
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
        personalityType: (currentUser as any)?.personality_type,
        height: (currentUser as any)?.height,
        lookingFor: (currentUser as any)?.looking_for,
        languages: (currentUser as any)?.languages_spoken || [],
        currentCountry: (currentUser as any)?.current_country,
        diasporaStatus: (currentUser as any)?.diaspora_status,
        willingLongDistance: (currentUser as any)?.willing_long_distance,
        exerciseFrequency: (currentUser as any)?.exercise_frequency,
        smoking: (currentUser as any)?.smoking,
        drinking: (currentUser as any)?.drinking,
        hasChildren: (currentUser as any)?.has_children,
        wantsChildren: (currentUser as any)?.wants_children,
        locationPrecision: (currentUser as any)?.location_precision,
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
          city: parsed.city,
          region: parsed.region,
          profilePicture: parsed.avatar_url || photos[0] || '',
          photos,
          occupation: parsed.occupation || '',
          education: parsed.education || '',
          verified: !!parsed.verified,
          bio: parsed.bio || '',
          distance: parsed.distance || '',
          isActiveNow: !!parsed.is_active,
          personalityType: parsed.personality_type,
          height: parsed.height,
          lookingFor: parsed.looking_for,
          languages: parsed.languages_spoken || [],
          currentCountry: parsed.current_country,
          diasporaStatus: parsed.diaspora_status,
          willingLongDistance: parsed.willing_long_distance,
          exerciseFrequency: parsed.exercise_frequency,
          smoking: parsed.smoking,
          drinking: parsed.drinking,
          hasChildren: parsed.has_children,
          wantsChildren: parsed.wants_children,
          locationPrecision: parsed.location_precision,
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
        // ignore
      }
    }
    return null;
  }, [params, placeholderProfile.id]);

  const profileData = fetchedProfile ?? parsedFallback ?? (isOwnProfilePreview ? baseProfileData : placeholderProfile);
  const isLoading = !fetchedProfile && !parsedFallback && !isOwnProfilePreview;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (isOwnProfilePreview) {
        setFetchedProfile(null);
        return;
      }
      if (!viewedProfileId) return;
      try {
        const selectFull =
          'id, full_name, age, region, city, location, avatar_url, photos, occupation, education, bio, tribe, religion, personality_type, height, looking_for, languages_spoken, current_country, diaspora_status, willing_long_distance, exercise_frequency, smoking, drinking, has_children, wants_children, location_precision, is_active, online, verification_level, ai_score';
        const selectMinimal =
          'id, full_name, age, region, city, location, avatar_url, bio, tribe, religion, personality_type, is_active, online, verification_level, ai_score';
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
          const res2 = await supabase.from('profiles').select(selectMinimal).eq('id', viewedProfileId).limit(1).single();
          data = res2.data;
          error = res2.error;
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
                : r.interests?.name
                ? [r.interests.name]
                : [],
            );
            interestsArr = names.map((n: string, idx: number) => ({
              id: `int-${idx}`,
              name: n,
              category: 'Interest',
              emoji: getInterestEmoji(n),
            }));
          }
        } catch (e) {
          console.log('[profile-view-premium] interests fetch error', e);
        }

        const photos = Array.isArray((data as any).photos) ? (data as any).photos : data.avatar_url ? [data.avatar_url] : [];
        const aiScoreRaw = Number((data as any).ai_score);
        const aiScoreVal = Number.isFinite(aiScoreRaw) && aiScoreRaw > 0 ? aiScoreRaw : undefined;
        const mapped: UserProfile = {
          id: data.id,
          name: data.full_name || 'Profile',
          age: data.age || 0,
          location: data.location || data.region || '',
          city: data.city || undefined,
          region: data.region || undefined,
          profilePicture: data.avatar_url || photos[0] || '',
          photos,
          occupation: data.occupation || '',
          education: data.education || '',
          verified: !!data.verification_level,
          bio: data.bio || '',
          distance: data.region || data.location || '',
          isActiveNow: !!data.is_active || !!(data as any).online,
          personalityType: data.personality_type || undefined,
          height: data.height || undefined,
          lookingFor: data.looking_for || undefined,
          languages: Array.isArray((data as any).languages_spoken) ? (data as any).languages_spoken : undefined,
          currentCountry: data.current_country || undefined,
          diasporaStatus: data.diaspora_status || undefined,
          willingLongDistance: typeof data.willing_long_distance === 'boolean' ? data.willing_long_distance : undefined,
          exerciseFrequency: data.exercise_frequency || undefined,
          smoking: data.smoking || undefined,
          drinking: data.drinking || undefined,
          hasChildren: data.has_children || undefined,
          wantsChildren: data.wants_children || undefined,
          locationPrecision: data.location_precision || undefined,
          compatibility:
            typeof aiScoreVal === 'number'
              ? Math.round(aiScoreVal)
              : typeof (data as any).compatibility === 'number'
              ? (data as any).compatibility
              : 75,
          aiScore: aiScoreVal,
          tribe: data.tribe || undefined,
          religion: data.religion || undefined,
          interests: interestsArr,
        };
        if ((!mapped.photos || mapped.photos.length === 0) && mapped.profilePicture) {
          mapped.photos = [mapped.profilePicture];
        }
        if (mounted) {
          setFetchedProfile(mapped);
        }
      } catch (e) {
        console.log('[profile-view-premium] fetch error', e);
        if (mounted) setFetchedProfile(null);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [isOwnProfilePreview, viewedProfileId]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: SHIMMER_SPEED,
        // Layout values (width/height) are in the skeleton, so keep this on the JS driver to avoid native warnings.
        useNativeDriver: false,
      }),
    ).start();
  }, [shimmerAnim]);

  useEffect(() => {
    if (isLoading) {
      fadeInContent.setValue(0);
      return;
    }
    Animated.timing(fadeInContent, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeInContent, isLoading]);

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
      console.log('[profile-view-premium] swipe error', e);
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
      console.log('[profile-view-premium] mutual check error', e);
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
      console.log('[profile-view-premium] match check error', e);
    }
  };

  const handleLike = async () => {
    setIsLiked(!isLiked);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await recordSwipe('LIKE');
    await checkMutual();
    await checkMatchAccepted();
    Animated.sequence([
      Animated.timing(likeAnimation, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(likeAnimation, { toValue: 0, duration: 180, useNativeDriver: true }),
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

  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
    extrapolate: 'clamp',
  });

  const headerTitleOpacity = scrollY.interpolate({
    inputRange: [0, 40, 120],
    outputRange: [0, 0.25, 1],
    extrapolate: 'clamp',
  });

  const headerTitleTranslate = scrollY.interpolate({
    inputRange: [0, 90],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });

  const headerOverlayOpacity = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [0.1, 0.65],
    extrapolate: 'clamp',
  });

  const headerButtonOverlayOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0.15, 0.5],
    extrapolate: 'clamp',
  });

  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, -200 * PARALLAX_FACTOR],
    extrapolate: 'clamp',
  });

  const rippleOpacity = useRef(new Animated.Value(0)).current;

  const triggerRipple = () => {
    rippleOpacity.setValue(0.35);
    Animated.timing(rippleOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  };

  const scrollToPhoto = (index: number) => {
    if (index < 0 || index >= profileData.photos.length) return;
    carouselRef.current?.scrollToOffset({ offset: index * screenWidth, animated: true });
    setCurrentPhotoIndex(index);
  };

  const onPhotoTap = (side: 'left' | 'right') => {
    triggerRipple();
    if (side === 'left') {
      if (currentPhotoIndex > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        scrollToPhoto(currentPhotoIndex - 1);
      }
    } else {
      if (currentPhotoIndex < profileData.photos.length - 1) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        scrollToPhoto(currentPhotoIndex + 1);
      }
    }
  };

  const renderPhoto = ({ item }: { item: string }) => (
    <Pressable
      onPress={(e) => {
        const x = e.nativeEvent.locationX;
        if (x <= screenWidth * TAP_ZONE_RATIO) onPhotoTap('left');
        else if (x >= screenWidth * (1 - TAP_ZONE_RATIO)) onPhotoTap('right');
      }}
      style={{ width: screenWidth, height: HERO_HEIGHT }}
    >
      <Animated.Image
        source={{ uri: item }}
        style={[
          styles.mainPhoto,
          {
            transform: [{ translateY: heroTranslateY }, { scale: 1.02 }],
          },
        ]}
      />
      <Animated.View pointerEvents="none" style={[styles.rippleOverlay, { opacity: rippleOpacity }]} />
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={styles.topGradient} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bottomGradient} />
      {profileData.photos.length > 1 ? (
        <>
          <LinearGradient
            colors={['rgba(0,0,0,0.28)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideGradientLeft}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.28)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideGradientRight}
          />
        </>
      ) : null}
    </Pressable>
  );

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-screenWidth, screenWidth],
  });

  const ShimmerBlock = ({ style }: { style?: StyleProp<ViewStyle> }) => (
    <View style={[styles.skeletonBlockBase, style]}>
      <Animated.View style={[styles.shimmer, { transform: [{ translateX: shimmerTranslateX }] }]}>
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0)']} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );

  const Skeleton = () => (
    <View style={styles.skeletonContainer}>
      <View style={styles.skeletonSection}>
        <ShimmerBlock style={styles.skeletonTitle} />
        <ShimmerBlock style={[styles.skeletonLine, { width: '78%' }]} />
        <View style={styles.skeletonChipsRow}>
          {[0, 1, 2].map((i) => (
            <ShimmerBlock key={i} style={styles.skeletonChip} />
          ))}
        </View>
      </View>
      <View style={styles.skeletonSection}>
        <ShimmerBlock style={styles.skeletonTitleSmall} />
        <ShimmerBlock style={styles.skeletonLine} />
        <ShimmerBlock style={[styles.skeletonLine, { width: '86%' }]} />
      </View>
      <View style={styles.skeletonSection}>
        <ShimmerBlock style={styles.skeletonTitleSmall} />
        <ShimmerBlock style={[styles.skeletonLine, { width: '92%' }]} />
        <ShimmerBlock style={[styles.skeletonLine, { width: '64%' }]} />
      </View>
    </View>
  );

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#030712' }} />;
  }
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <Animated.ScrollView
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
      >
        <View style={styles.heroWrapper}>
          {isLoading ? (
            <ShimmerBlock style={styles.skeletonHeroFull} />
          ) : (
            <Animated.View style={{ flex: 1, opacity: fadeInContent }}>
              {profileData.photos.length > 0 ? (
                <>
                  <Animated.FlatList
                    ref={carouselRef}
                    data={profileData.photos}
                    keyExtractor={(uri, idx) => `${uri}-${idx}`}
                    renderItem={renderPhoto}
                    horizontal
                    pagingEnabled
                    snapToInterval={screenWidth}
                    decelerationRate="fast"
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                      setCurrentPhotoIndex(idx);
                    }}
                  />
                </>
              ) : (
                <View style={[styles.mainPhoto, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff' }}>No photo</Text>
                </View>
              )}

              <View style={styles.photoIndicatorsTop}>
                {profileData.photos.map((_, idx) => (
                  <View key={idx} style={[styles.photoIndicator, idx === currentPhotoIndex && styles.photoIndicatorActive]} />
                ))}
              </View>

              <View style={styles.profileOverlay}>
                <View style={styles.nameRow}>
                  <Text style={styles.profileName}>
                    {profileData.name}, {profileData.age}
                  </Text>
                  {profileData.verified && <MaterialCommunityIcons name="check-decagram" size={20} color={Colors.light.tint} />}
                  {profileData.isActiveNow && (
                    <View style={styles.activeBadge}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activeText}>Online</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.profileSub}>
                  <MaterialCommunityIcons name="map-marker" size={14} color="#e5e7eb" /> {profileData.distance || profileData.location}
                </Text>
                <Text style={styles.profileSub}>{profileData.occupation}</Text>
                <Animated.View
                  style={[
                    styles.compatibilityBadge,
                    {
                      transform: [
                        {
                          scale: likeAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
                        },
                      ],
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="heart" size={16} color="#fff" />
                  <Text style={styles.compatibilityText}>{profileData.compatibility}% Match</Text>
                </Animated.View>
              </View>
            </Animated.View>
          )}
        </View>

        <Animated.View style={{ opacity: isLoading ? 1 : fadeInContent }}>
          {isLoading ? (
            <Skeleton />
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>At a glance</Text>
                <View style={styles.chipsRow}>
                  {[profileData.region || profileData.city || profileData.location, profileData.tribe, profileData.religion, profileData.locationPrecision]
                    .filter(Boolean)
                    .map((val, idx) => (
                      <View key={`chip-${idx}`} style={styles.chip}>
                        <Text style={styles.chipText}>{String(val)}</Text>
                      </View>
                    ))}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>About {profileData.name}</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    if (profileData.bio && profileData.bio.length > 150) {
                      setShowFullBio((prev) => !prev);
                    }
                  }}
                >
                  <Text style={styles.bodyText} numberOfLines={showFullBio ? undefined : 3}>
                    {profileData.bio || 'No bio yet.'}
                  </Text>
                  {profileData.bio && profileData.bio.length > 150 && (
                    <Text style={styles.showMoreText}>{showFullBio ? 'Show less' : 'Show more'}</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Details</Text>
                {[
                  { label: 'Personality', value: profileData.personalityType },
                  { label: 'Occupation', value: profileData.occupation },
                  { label: 'Education', value: profileData.education },
                  { label: 'Height', value: profileData.height },
                  { label: 'Looking for', value: profileData.lookingFor },
                  { label: 'Country', value: profileData.currentCountry },
                  { label: 'Diaspora status', value: profileData.diasporaStatus },
                  { label: 'Willing long distance', value: typeof profileData.willingLongDistance === 'boolean' ? (profileData.willingLongDistance ? 'Yes' : 'No') : undefined },
                  { label: 'Exercise', value: profileData.exerciseFrequency },
                  { label: 'Smoking', value: profileData.smoking },
                  { label: 'Drinking', value: profileData.drinking },
                  { label: 'Has children', value: profileData.hasChildren },
                  { label: 'Wants children', value: profileData.wantsChildren },
                  { label: 'Languages', value: Array.isArray(profileData.languages) && profileData.languages.length > 0 ? profileData.languages.join(', ') : undefined },
                  { label: 'Location precision', value: profileData.locationPrecision },
                ]
                  .filter((row) => row.value)
                  .map((row, idx) => (
                    <View key={`${row.label}-${idx}`} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{row.label}</Text>
                      <Text style={styles.detailValue}>{row.value}</Text>
                    </View>
                  ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Interests</Text>
                <View style={styles.interestsGrid}>
                  {profileData.interests && profileData.interests.length > 0 ? (
                    profileData.interests.map((interest) => (
                      <View key={interest.id} style={styles.interestChip}>
                        <Text style={styles.interestEmoji}>{interest.emoji}</Text>
                        <Text style={styles.interestName}>{interest.name}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.bodySubtle}>No interests yet.</Text>
                  )}
                </View>
              </View>
              <View style={{ height: 140 }} />
            </>
          )}
        </Animated.View>
      </Animated.ScrollView>

      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.headerTint, { opacity: headerOverlayOpacity }]} />
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.headerButton} onPress={() => (router.canGoBack?.() ? router.back() : router.replace('/(tabs)/explore'))}>
            <Animated.View style={[styles.headerButtonOverlay, { opacity: headerButtonOverlayOpacity }]} />
            <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Animated.Text
            style={[
              styles.headerTitle,
              {
                opacity: headerTitleOpacity,
                transform: [{ translateY: headerTitleTranslate }],
              },
            ]}
            numberOfLines={1}
          >
            {profileData.name || 'Profile'}
          </Animated.Text>
          {isOwnProfilePreview ? (
            <View style={styles.previewIndicator}>
              <MaterialCommunityIcons name="eye" size={16} color="#fff" />
              <Text style={styles.previewIndicatorText}>Preview Mode</Text>
            </View>
          ) : (
            <View style={styles.headerActions}>
              {__DEV__ && (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() =>
                    router.push({
                      pathname: '/profile-view-premium',
                      params: { profileId: currentUser?.id || 'preview', isPreview: 'true' },
                    })
                  }
                  accessibilityLabel="Open premium preview"
                >
                  <Animated.View style={[styles.headerButtonOverlay, { opacity: headerButtonOverlayOpacity }]} />
                  <MaterialCommunityIcons name="star-four-points" size={18} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
                <Animated.View style={[styles.headerButtonOverlay, { opacity: headerButtonOverlayOpacity }]} />
                <MaterialCommunityIcons name="share-variant" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animated.View>

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
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.actionButtonsOverlay} />
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.passButton} onPress={handlePass}>
              <MaterialCommunityIcons name="close" size={26} color="#ef4444" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.superLikeButton} onPress={handleSuperLike}>
              <MaterialCommunityIcons name="star" size={22} color="#3b82f6" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.likeButton, isLiked && styles.likeButtonActive]} onPress={handleLike}>
              <Animated.View
                style={{
                  transform: [
                    {
                      scale: likeAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }),
                    },
                  ],
                }}
              >
                <MaterialCommunityIcons name={isLiked ? 'heart' : 'heart-outline'} size={30} color={isLiked ? '#fff' : Colors.light.tint} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ProfileVideoModal
        visible={videoModalVisible}
        onClose={() => {
          setVideoModalVisible(false);
          setVideoModalUrl(null);
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  heroWrapper: { position: 'relative', height: HERO_HEIGHT, backgroundColor: '#0b1220' },
  mainPhoto: { width: screenWidth, height: HERO_HEIGHT, resizeMode: 'cover' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 200 },
  sideGradientLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 26 },
  sideGradientRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 26 },
  photoIndicatorsTop: { position: 'absolute', top: 94, left: 18, right: 18, flexDirection: 'row', gap: 8 },
  photoIndicator: { width: 34, height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3 },
  photoIndicatorActive: { backgroundColor: '#fff' },
  profileOverlay: { position: 'absolute', bottom: 24, left: 20, right: 20, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  profileName: { fontSize: 30, color: '#fff', fontFamily: 'Archivo_700Bold', letterSpacing: 0.5 },
  profileSub: { color: '#e5e7eb', fontFamily: 'Manrope_500Medium', fontSize: 14 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10b981', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  activeText: { fontSize: 12, color: '#fff', fontFamily: 'Manrope_700Bold' },
  compatibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginTop: 6,
    shadowColor: '#ef4444',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  compatibilityText: { fontSize: 14, color: '#fff', fontFamily: 'Archivo_700Bold' },
  card: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  sectionTitle: { color: '#f9fafb', fontSize: 18, fontFamily: 'Archivo_700Bold', marginBottom: 10 },
  bodyText: { color: '#d1d5db', fontSize: 15, lineHeight: 22, fontFamily: 'Manrope_500Medium' },
  bodySubtle: { color: '#9ca3af', fontSize: 14, fontFamily: 'Manrope_500Medium' },
  showMoreText: { color: Colors.light.tint, fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  chipText: { color: '#e5e7eb', fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  detailLabel: { color: '#9ca3af', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  detailValue: { color: '#f9fafb', fontSize: 13, fontFamily: 'Manrope_500Medium', flexShrink: 1, textAlign: 'right' },
  interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  interestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  interestEmoji: { fontSize: 16 },
  interestName: { color: '#e5e7eb', fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
  actionButtonsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: 'rgba(8,10,14,0.55)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
  },
  actionButtonsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,8,12,0.35)',
  },
  actionButtons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18 },
  passButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  superLikeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#3b82f6',
  },
  likeButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.light.tint,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  likeButtonActive: { backgroundColor: '#be185d' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
  },
  headerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18 },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  headerButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerActions: { flexDirection: 'row', gap: 10 },
  headerTitle: { color: '#f9fafb', fontSize: 16, fontFamily: 'Archivo_700Bold', flex: 1, textAlign: 'center' },
  headerTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,9,14,0.7)',
  },
  previewIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  previewIndicatorText: { color: '#fff', fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  rippleOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.06)' },
  skeletonContainer: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 },
  skeletonSection: { marginTop: 16, gap: 8 },
  skeletonBlockBase: { backgroundColor: '#111827', borderRadius: 14, overflow: 'hidden' },
  skeletonHeroFull: { width: '100%', height: '100%', borderRadius: 0 },
  skeletonTitle: { height: 18, width: '60%' },
  skeletonTitleSmall: { height: 16, width: '42%' },
  skeletonLine: { height: 14, width: '100%' },
  skeletonChipsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  skeletonChip: { width: 72, height: 24, borderRadius: 999 },
  shimmer: { ...StyleSheet.absoluteFillObject },
});

