import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  Alert,
  Linking,
  StatusBar,
  Share,
} from "react-native";
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { router, useLocalSearchParams } from "expo-router";

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Profile Data Types (same as profile screen but viewed externally)
type InteractivePrompt = {
  id: string;
  title: string;
  type: 'two_truths_lie' | 'weekly_goal' | 'current_vibe' | 'open_ended';
  content: string[];
  link?: string;
  lastUpdated: Date;
};

type Interest = {
  id: string;
  name: string;
  category: string;
  emoji: string;
};

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
  lastActive: string;
  isActiveNow: boolean;
  tribe?: string;
  religion?: string;
  interests: Interest[];
  prompts: InteractivePrompt[];
  compatibility: number; // 0-100 compatibility score
};

// Mock profile data (this would come from route params in real app)
const MOCK_VIEWED_PROFILE: UserProfile = {
  id: '2',
  name: 'Akosua',
  age: 24,
  location: 'Accra, Greater Accra',
  profilePicture: 'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face',
  photos: [
    'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=600&fit=crop',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=600&fit=crop',
  ],
  occupation: 'Marketing Specialist',
  education: 'University of Ghana',
  verified: true,
  bio: 'Adventure seeker & foodie 🌟 Love exploring new places and trying different cuisines. Looking for someone to share life\'s beautiful moments with.',
  distance: '2.3 km away',
  lastActive: '2 hours ago',
  isActiveNow: false,
  tribe: 'Akan',
  religion: 'Christian',
  compatibility: 85,
  interests: [
    { id: '1', name: 'Travel', category: 'Adventure', emoji: '✈️' },
    { id: '2', name: 'Food', category: 'Lifestyle', emoji: '🍽️' },
    { id: '3', name: 'Photography', category: 'Creative', emoji: '📸' },
    { id: '4', name: 'Dancing', category: 'Activity', emoji: '💃' },
    { id: '5', name: 'Art Galleries', category: 'Culture', emoji: '🎨' },
    { id: '6', name: 'Coffee', category: 'Lifestyle', emoji: '☕' },
  ],
  prompts: [
    {
      id: '1',
      title: 'Two truths and a lie',
      type: 'two_truths_lie',
      content: [
        'I\'ve visited 12 countries before turning 25',
        'I can make a perfect sourdough bread from scratch',
        'I once got lost in a forest for 6 hours while hiking'
      ],
      lastUpdated: new Date(Date.now() - 86400000 * 3),
    },
    {
      id: '2',
      title: 'This week I want to...',
      type: 'weekly_goal',
      content: ['Learn to make authentic jollof rice and explore the new art exhibition at the National Museum'],
      lastUpdated: new Date(Date.now() - 86400000),
    },
    {
      id: '3',
      title: 'My current vibe song is...',
      type: 'current_vibe',
      content: ['Somebody\'s Son by Tiwa Savage ft. Brandy'],
      link: 'https://open.spotify.com/track/1vBRyKpLW0Xh8dWe0qbMvG',
      lastUpdated: new Date(),
    },
  ],
};

export default function ProfileViewScreen() {
  const { profile: currentUser } = useAuth();
  const fontsLoaded = useAppFonts();
  const params = useLocalSearchParams();
  
  // In real app, you'd get profile data from params or API
  const profileData = MOCK_VIEWED_PROFILE;
  
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showFullBio, setShowFullBio] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showCompatibility, setShowCompatibility] = useState(false);
  
  const scrollY = useRef(new Animated.Value(0)).current;
  const likeAnimation = useRef(new Animated.Value(0)).current;
  const compatibilityAnimation = useRef(new Animated.Value(0)).current;
  const photoAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Photo transition animation
    Animated.timing(photoAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // Show compatibility score after a delay
    setTimeout(() => {
      setShowCompatibility(true);
      Animated.spring(compatibilityAnimation, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }, 1000);
  }, []);

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const handleLike = () => {
    setIsLiked(!isLiked);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Animate heart
    Animated.sequence([
      Animated.timing(likeAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(likeAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    
    if (!isLiked) {
      // Show match notification if mutual like
      setTimeout(() => {
        Alert.alert(
          '🎉 It\'s a Match!',
          `You and ${profileData.name} liked each other!`,
          [
            { text: 'Keep Swiping', style: 'cancel' },
            { text: 'Send Message', onPress: () => router.push('/(tabs)/chat') },
          ]
        );
      }, 500);
    }
  };

  const handlePass = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleSuperLike = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('⭐ Super Like Sent!', `${profileData.name} will know you're really interested!`);
  };

  const handleReport = () => {
    Alert.alert(
      'Report Profile',
      'Why are you reporting this profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Inappropriate Photos', onPress: () => {} },
        { text: 'Fake Profile', onPress: () => {} },
        { text: 'Harassment', onPress: () => {} },
        { text: 'Other', onPress: () => {} },
      ]
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${profileData.name}'s profile on Betweener!`,
        // url: `betweener://profile/${profileData.id}`, // Deep link
      });
    } catch (error) {
      console.error(error);
    }
  };

  const openMusicLink = async (link: string) => {
    try {
      await Linking.openURL(link);
    } catch (error) {
      Alert.alert('Error', 'Could not open music link');
    }
  };

  const nextPhoto = () => {
    if (currentPhotoIndex < profileData.photos.length - 1) {
      photoAnimation.setValue(0);
      setCurrentPhotoIndex(currentPhotoIndex + 1);
      Animated.timing(photoAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const prevPhoto = () => {
    if (currentPhotoIndex > 0) {
      photoAnimation.setValue(0);
      setCurrentPhotoIndex(currentPhotoIndex - 1);
      Animated.timing(photoAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
      </TouchableOpacity>
      
      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.headerActionButton} onPress={handleShare}>
          <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerActionButton} onPress={handleReport}>
          <MaterialCommunityIcons name="flag" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPhotoGallery = () => (
    <View style={styles.photoContainer}>
      <Animated.Image
        source={{ uri: profileData.photos[currentPhotoIndex] }}
        style={[
          styles.mainPhoto,
          {
            opacity: photoAnimation,
            transform: [
              {
                scale: photoAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.95, 1],
                }),
              },
            ],
          },
        ]}
      />
      
      {/* Photo Navigation */}
      <View style={styles.photoNavigation}>
        <TouchableOpacity
          style={[styles.photoNavButton, styles.photoNavLeft]}
          onPress={prevPhoto}
          disabled={currentPhotoIndex === 0}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={currentPhotoIndex === 0 ? '#ffffff60' : '#fff'}
          />
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
      
      {/* Photo Indicators */}
      <View style={styles.photoIndicators}>
        {profileData.photos.map((_, index) => (
          <View
            key={index}
            style={[
              styles.photoIndicator,
              index === currentPhotoIndex && styles.photoIndicatorActive,
            ]}
          />
        ))}
      </View>
      
      {/* Profile Basic Info Overlay */}
      <View style={styles.profileOverlay}>
        <View style={styles.profileBasicInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.profileName}>
              {profileData.name}, {profileData.age}
            </Text>
            {profileData.verified && (
              <MaterialCommunityIcons name="check-decagram" size={20} color={Colors.light.tint} />
            )}
            {profileData.isActiveNow && (
              <View style={styles.activeIndicator}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Online</Text>
              </View>
            )}
          </View>
          
          <Text style={styles.profileLocation}>
            <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
            {' '}{profileData.distance}
          </Text>
          
          <Text style={styles.profileOccupation}>
            {profileData.occupation}
          </Text>
        </View>
        
        {/* Compatibility Score */}
        {showCompatibility && (
          <Animated.View
            style={[
              styles.compatibilityBadge,
              {
                opacity: compatibilityAnimation,
                transform: [
                  {
                    scale: compatibilityAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <MaterialCommunityIcons name="heart" size={16} color="#fff" />
            <Text style={styles.compatibilityText}>{profileData.compatibility}% Match</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );

  const renderBioSection = () => (
    <View style={styles.bioSection}>
      <Text style={styles.sectionTitle}>About {profileData.name}</Text>
      <TouchableOpacity onPress={() => setShowFullBio(!showFullBio)}>
        <Text
          style={styles.bioText}
          numberOfLines={showFullBio ? undefined : 3}
        >
          {profileData.bio}
        </Text>
        {profileData.bio.length > 150 && (
          <Text style={styles.showMoreText}>
            {showFullBio ? 'Show less' : 'Show more'}
          </Text>
        )}
      </TouchableOpacity>
      
      {/* Basic Details */}
      <View style={styles.detailsContainer}>
        <View style={styles.detailItem}>
          <MaterialCommunityIcons name="school" size={18} color={Colors.light.tint} />
          <Text style={styles.detailText}>{profileData.education}</Text>
        </View>
        <View style={styles.detailItem}>
          <MaterialCommunityIcons name="map-marker" size={18} color={Colors.light.tint} />
          <Text style={styles.detailText}>{profileData.location}</Text>
        </View>
        {profileData.tribe && (
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="account-group" size={18} color={Colors.light.tint} />
            <Text style={styles.detailText}>{profileData.tribe}</Text>
          </View>
        )}
        {profileData.religion && (
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="church" size={18} color={Colors.light.tint} />
            <Text style={styles.detailText}>{profileData.religion}</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderInterests = () => (
    <View style={styles.interestsSection}>
      <Text style={styles.sectionTitle}>Interests</Text>
      <View style={styles.interestsGrid}>
        {profileData.interests.map((interest) => (
          <View key={interest.id} style={styles.interestChip}>
            <Text style={styles.interestEmoji}>{interest.emoji}</Text>
            <Text style={styles.interestName}>{interest.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderPrompts = () => (
    <View style={styles.promptsSection}>
      <Text style={styles.sectionTitle}>Get to know {profileData.name}</Text>
      {profileData.prompts.map((prompt) => (
        <View key={prompt.id} style={styles.promptCard}>
          <Text style={styles.promptTitle}>{prompt.title}</Text>
          
          {prompt.type === 'two_truths_lie' ? (
            <View style={styles.truthLieContainer}>
              {prompt.content.map((item, index) => (
                <View key={index} style={styles.truthLieItem}>
                  <View style={styles.truthLieBullet} />
                  <Text style={styles.promptText}>{item}</Text>
                </View>
              ))}
              <Text style={styles.promptHint}>Can you guess which one is the lie?</Text>
            </View>
          ) : prompt.type === 'current_vibe' ? (
            <View style={styles.vibeContent}>
              <MaterialCommunityIcons name="music" size={20} color={Colors.light.tint} />
              <Text style={styles.promptText}>{prompt.content[0]}</Text>
              {prompt.link && (
                <TouchableOpacity
                  style={styles.musicLinkButton}
                  onPress={() => openMusicLink(prompt.link!)}
                >
                  <MaterialCommunityIcons name="spotify" size={16} color="#1db954" />
                  <Text style={styles.musicLinkText}>Listen</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text style={styles.promptText}>{prompt.content[0]}</Text>
          )}
        </View>
      ))}
    </View>
  );

  const renderActionButtons = () => (
    <View style={styles.actionButtonsContainer}>
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.passButton} onPress={handlePass}>
          <MaterialCommunityIcons name="close" size={28} color="#ef4444" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.superLikeButton} onPress={handleSuperLike}>
          <MaterialCommunityIcons name="star" size={24} color="#3b82f6" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.likeButton, isLiked && styles.likeButtonActive]}
          onPress={handleLike}
        >
          <Animated.View
            style={{
              transform: [
                {
                  scale: likeAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.3],
                  }),
                },
              ],
            }}
          >
            <MaterialCommunityIcons
              name={isLiked ? "heart" : "heart-outline"}
              size={32}
              color={isLiked ? "#fff" : Colors.light.tint}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {renderHeader()}
      
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {renderPhotoGallery()}
        {renderBioSection()}
        {renderInterests()}
        {renderPrompts()}
        
        {/* Bottom spacing for action buttons */}
        <View style={{ height: 120 }} />
      </ScrollView>
      
      {renderActionButtons()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },

  // Header
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
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Photo Gallery
  photoContainer: {
    height: screenHeight * 0.7,
    position: 'relative',
  },
  mainPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoNavigation: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  photoNavButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoNavLeft: {
    alignItems: 'flex-start',
    paddingLeft: 20,
  },
  photoNavRight: {
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  photoIndicators: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 6,
  },
  photoIndicator: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  photoIndicatorActive: {
    backgroundColor: '#fff',
  },

  // Profile Overlay
  profileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    paddingTop: 60,
  },
  profileBasicInfo: {
    marginBottom: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  profileName: {
    fontSize: 28,
    fontFamily: 'Archivo_700Bold',
    color: '#fff',
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  activeText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: '#fff',
  },
  profileLocation: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#e5e7eb',
    marginBottom: 2,
  },
  profileOccupation: {
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
    color: '#f3f4f6',
  },
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
  compatibilityText: {
    fontSize: 14,
    fontFamily: 'Archivo_700Bold',
    color: '#fff',
  },

  // Content Sections
  bioSection: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    marginBottom: 16,
  },
  bioText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
    lineHeight: 24,
  },
  showMoreText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.light.tint,
    marginTop: 8,
  },
  detailsContainer: {
    marginTop: 20,
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    fontSize: 15,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
  },

  // Interests
  interestsSection: {
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
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
  interestEmoji: {
    fontSize: 16,
  },
  interestName: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    color: '#374151',
  },

  // Prompts
  promptsSection: {
    backgroundColor: '#fff',
    padding: 20,
  },
  promptCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  promptTitle: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    marginBottom: 12,
  },
  promptText: {
    fontSize: 15,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
    lineHeight: 22,
  },
  truthLieContainer: {
    gap: 12,
  },
  truthLieItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  truthLieBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.tint,
    marginTop: 8,
  },
  promptHint: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 8,
  },
  vibeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  musicLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1db954' + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  musicLinkText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: '#1db954',
  },

  // Action Buttons
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
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
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
  likeButtonActive: {
    backgroundColor: Colors.light.tint,
  },
});