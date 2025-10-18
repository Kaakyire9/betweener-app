import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerStateChangeEvent, State } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Enhanced Ghana diaspora discovery data
const ENHANCED_MATCHES = [
  {
    id: '1',
    name: 'Akosua',
    age: 24,
    tagline: 'Adventure seeker & foodie 🌟',
    bio: 'Love exploring new places and trying different cuisines. Looking for someone to share life\'s beautiful moments with.',
    location: 'London, UK',
    hometown: 'Kumasi, Ashanti',
    diasporaYears: 3,
    tribe: 'Akan',
    religion: 'Christian',
    education: 'Imperial College London',
    profession: 'Marketing Manager',
    languages: ['English', 'Twi'],
    interests: ['Travel', 'Highlife Music', 'Jollof Rice', 'Dancing', 'Photography'],
    culturalEvents: ['Ghana Independence Day', 'Homowo Festival'],
    avatar_url: 'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face',
    photos: [
      'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=600&fit=crop&crop=face'
    ],
    distance: '2.3 km away',
    lastActive: '2 hours ago',
    isActiveNow: false,
    isVerified: true,
    hasStatus: true,
    statusCount: 2,
    statusLastUpdated: '1 hour ago',
    verificationLevel: 2,
    compatibilityScore: 89,
    mutualConnections: 3,
    sharedInterests: ['Travel', 'Music', 'Food'],
    culturalAlignment: 92,
    relationshipGoals: 'Serious relationship',
    nextGhanaVisit: '2025-12-20',
  },
  {
    id: '2',
    name: 'Kwame',
    age: 27,
    tagline: 'Tech enthusiast & gym lover 💪',
    bio: 'Software developer by day, fitness enthusiast by evening. Looking for someone who shares my passion for growth.',
    location: 'Toronto, Canada',
    hometown: 'Accra, Greater Accra',
    diasporaYears: 5,
    tribe: 'Ga',
    religion: 'Christian',
    education: 'University of Toronto',
    profession: 'Software Engineer',
    languages: ['English', 'Ga', 'Twi'],
    interests: ['Technology', 'Fitness', 'Azonto', 'Football', 'Startups'],
    culturalEvents: ['Ghana Fest Toronto', 'Afrochella'],
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&crop=face',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=600&fit=crop&crop=face'
    ],
    distance: '15.7 km away',
    lastActive: 'Active now',
    isActiveNow: true,
    isVerified: true,
    hasStatus: true,
    statusCount: 1,
    statusLastUpdated: '30 minutes ago',
    verificationLevel: 3,
    compatibilityScore: 76,
    mutualConnections: 1,
    sharedInterests: ['Technology', 'Fitness'],
    culturalAlignment: 84,
    relationshipGoals: 'Long-term partnership',
    nextGhanaVisit: '2025-08-15',
  },
  {
    id: '3',
    name: 'Ama',
    age: 22,
    tagline: 'Artist with a kind heart 🎨',
    bio: 'I paint emotions and capture moments. Seeking someone who appreciates art and believes in genuine connections.',
    location: 'New York, USA',
    hometown: 'Cape Coast, Central',
    diasporaYears: 2,
    tribe: 'Fante',
    religion: 'Christian',
    education: 'NYU Tisch School of Arts',
    profession: 'Digital Artist',
    languages: ['English', 'Fante'],
    interests: ['Art', 'Photography', 'Kente Weaving', 'Nature', 'Adinkra Symbols'],
    culturalEvents: ['Ghana Day NYC', 'African Art Festival'],
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&crop=face',
    photos: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop&crop=face'
    ],
    distance: '8.2 km away',
    lastActive: '1 hour ago',
    isActiveNow: false,
    isVerified: false,
    hasStatus: false,
    statusCount: 0,
    statusLastUpdated: null,
    verificationLevel: 1,
    compatibilityScore: 94,
    mutualConnections: 5,
    sharedInterests: ['Art', 'Photography', 'Culture'],
    culturalAlignment: 97,
    relationshipGoals: 'Dating with purpose',
    nextGhanaVisit: '2025-07-01',
  },
  {
    id: '4',
    name: 'Kofi',
    age: 29,
    tagline: 'Business minded & family oriented 💼',
    bio: 'Building my empire while staying true to my roots. Looking for a queen who shares my vision and values.',
    location: 'Berlin, Germany',
    hometown: 'Tamale, Northern',
    diasporaYears: 4,
    tribe: 'Dagomba',
    religion: 'Muslim',
    education: 'ESMT Berlin',
    profession: 'Investment Banker',
    languages: ['English', 'Dagbani', 'German'],
    interests: ['Business', 'Travel', 'Traditional Music', 'Football', 'Real Estate'],
    culturalEvents: ['Damba Festival', 'Ghana Expo Berlin'],
    avatar_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=600&fit=crop&crop=face',
    photos: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=600&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=600&fit=crop&crop=face'
    ],
    distance: '12.1 km away',
    lastActive: '30 minutes ago',
    isActiveNow: true,
    isVerified: true,
    hasStatus: true,
    statusCount: 3,
    statusLastUpdated: '15 minutes ago',
    verificationLevel: 2,
    compatibilityScore: 82,
    mutualConnections: 2,
    sharedInterests: ['Business', 'Travel'],
    culturalAlignment: 88,
    relationshipGoals: 'Marriage minded',
    nextGhanaVisit: '2025-12-01',
  },
];

const TAB_OPTIONS = [
  { id: 'recommended', label: 'For You', icon: 'heart', badge: null },
  { id: 'nearby', label: 'Nearby', icon: 'map-marker', badge: null },
  { id: 'active', label: 'Active Now', icon: 'circle-outline', badge: 'live', count: 4 },
  { id: 'hometown', label: 'Hometown', icon: 'home-heart', badge: null },
];

const DISCOVERY_INSIGHTS = [
  "3 new diaspora members in your city this week",
  "2 people from Kumasi are online now", 
  "Ghana Independence Day event: 8 attendees nearby",
  "5 verified members liked your profile",
  "12 active matches from your region today",
];

export default function ExploreScreen() {
  const { profile } = useAuth();
  const fontsLoaded = useAppFonts();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('recommended');
  const [dailyMatches, setDailyMatches] = useState(ENHANCED_MATCHES);
  const [showInsights, setShowInsights] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<{[key: string]: number}>({});
  
  // Animation values
  const cardAnimations = useRef(
    ENHANCED_MATCHES.map(() => ({
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
      rotate: new Animated.Value(0),
      scale: new Animated.Value(1),
      opacity: new Animated.Value(1),
      statusBlink: new Animated.Value(1),
    }))
  ).current;
  
  const backgroundParallax = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Status blinking animation
  useEffect(() => {
    const blinkAnimations = cardAnimations.map((anim, index) => {
      const match = ENHANCED_MATCHES[index];
      if (match?.hasStatus) {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim.statusBlink, {
              toValue: 0.4,
              duration: 1000,
              useNativeDriver: false,
            }),
            Animated.timing(anim.statusBlink, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: false,
            }),
          ])
        );
      }
      return null;
    }).filter(Boolean);

    blinkAnimations.forEach(animation => animation?.start());

    return () => {
      blinkAnimations.forEach(animation => animation?.stop());
    };
  }, []);
  
  useEffect(() => {
    // Initialize card stack with scaling effect
    cardAnimations.forEach((anim, index) => {
      if (index > currentIndex) {
        anim.scale.setValue(1 - (index - currentIndex) * 0.05);
        anim.translateY.setValue((index - currentIndex) * 10);
        anim.opacity.setValue(1 - (index - currentIndex) * 0.2);
      }
    });
  }, [currentIndex]);

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const handlePanGesture = Animated.event(
    [{ nativeEvent: { translationX: cardAnimations[currentIndex]?.translateX } }],
    { useNativeDriver: false }
  );

  const handlePanStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX, velocityX } = event.nativeEvent;
      
      if (Math.abs(translationX) > screenWidth * 0.3 || Math.abs(velocityX) > 1000) {
        // Swipe decision
        const direction = translationX > 0 ? 'right' : 'left';
        animateCardExit(direction);
      } else {
        // Snap back
        Animated.spring(cardAnimations[currentIndex].translateX, {
          toValue: 0,
          useNativeDriver: false,
        }).start();
      }
    }
  };

  const animateCardExit = (direction: 'left' | 'right') => {
    const currentCard = cardAnimations[currentIndex];
    const exitX = direction === 'right' ? screenWidth : -screenWidth;
    
    Animated.parallel([
      Animated.timing(currentCard.translateX, {
        toValue: exitX,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(currentCard.rotate, {
        toValue: direction === 'right' ? 30 : -30,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(currentCard.opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Move to next card
      if (currentIndex < dailyMatches.length - 1) {
        setCurrentIndex(prev => prev + 1);
        // Reset current card for potential reuse
        currentCard.translateX.setValue(0);
        currentCard.rotate.setValue(0);
        currentCard.opacity.setValue(1);
      }
    });

    // Animate next cards up
    for (let i = currentIndex + 1; i < cardAnimations.length; i++) {
      Animated.parallel([
        Animated.spring(cardAnimations[i].scale, {
          toValue: 1 - (i - currentIndex - 1) * 0.05,
          useNativeDriver: false,
        }),
        Animated.spring(cardAnimations[i].translateY, {
          toValue: (i - currentIndex - 1) * 10,
          useNativeDriver: false,
        }),
        Animated.spring(cardAnimations[i].opacity, {
          toValue: 1 - (i - currentIndex - 1) * 0.2,
          useNativeDriver: false,
        }),
      ]).start();
    }
  };

  const handleLike = () => {
    const currentMatch = dailyMatches[currentIndex];
    animateCardExit('right');
    
    // Show cultural appreciation message
    Alert.alert(
      "Akwaaba! 🇬🇭", 
      `You liked ${currentMatch.name}! They'll be notified.`,
      [{ text: "Great!", style: "default" }]
    );
  };

  const handleSuperLike = () => {
    const currentMatch = dailyMatches[currentIndex];
    animateCardExit('right');
    
    Alert.alert(
      "Me pɛ wo paa! 💫", 
      `You super-liked ${currentMatch.name} from ${currentMatch.hometown}! This shows serious interest.`,
      [{ text: "Wonderful!", style: "default" }]
    );
  };

  const handleReject = () => {
    animateCardExit('left');
  };

  const animateButtonPress = (callback: () => void) => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(callback);
  };

  const handleProfileTap = (profileId: string) => {
    router.push({
      pathname: '/profile-view',
      params: { profileId }
    });
  };

  const handleStatusTap = (profileId: string) => {
    // Navigate to profile with status view mode
    router.push({
      pathname: '/profile-view',
      params: { profileId, viewMode: 'status' }
    });
  };

  if (currentIndex >= dailyMatches.length) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.noMoreCardsContainer}>
            <MaterialCommunityIcons name="heart-outline" size={80} color={Colors.light.tint} />
            <Text style={styles.noMoreCardsTitle}>That's all for today!</Text>
            <Text style={styles.noMoreCardsSubtitle}>
              Come back tomorrow for 3 new curated matches
            </Text>
            <Text style={styles.qualityMessage}>
              Quality over quantity - we carefully select your best matches
            </Text>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  const currentMatch = dailyMatches[currentIndex];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
      {/* Enhanced Header with Discovery Insights */}
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View style={styles.headerTitle}>
            <Text style={styles.headerTitleText}>Discover</Text>
            <Text style={styles.headerSubtitle}>Ghana Diaspora Connections</Text>
          </View>
          
          <TouchableOpacity 
            style={styles.insightsButton}
            onPress={() => setShowInsights(!showInsights)}
          >
            <MaterialCommunityIcons 
              name="lightbulb-outline" 
              size={20} 
              color={Colors.light.tint} 
            />
          </TouchableOpacity>
        </View>

        {showInsights && (
          <View style={styles.insightsPanel}>
            <Text style={styles.insightsTitle}>Today's Insights</Text>
            {DISCOVERY_INSIGHTS.map((insight, index) => (
              <View key={index} style={styles.insightItem}>
                <MaterialCommunityIcons 
                  name="circle-small" 
                  size={16} 
                  color={Colors.light.tint} 
                />
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}
        
        <View style={styles.tabContainer}>
          {TAB_OPTIONS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                activeTab === tab.id && styles.activeTab,
              ]}
              onPress={() => setActiveTab(tab.id)}
            >
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={16}
                color={activeTab === tab.id ? '#fff' : Colors.light.tint}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.id && styles.activeTabText,
                ]}
              >
                {tab.label}
              </Text>
              {tab.count && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{tab.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.matchCounter}>
          <Text style={styles.matchCounterText}>
            {currentIndex + 1} / {dailyMatches.length}
          </Text>
          <Text style={styles.dailyMatchesLabel}>Smart Curated Matches</Text>
        </View>
      </View>

      {/* Card Stack */}
      <View style={styles.cardStack}>
        {dailyMatches.map((match, index) => {
          if (index < currentIndex) return null;
          
          const cardAnim = cardAnimations[index];
          const isCurrentCard = index === currentIndex;
          
          const rotateInterpolate = cardAnim.rotate.interpolate({
            inputRange: [-30, 0, 30],
            outputRange: ['-30deg', '0deg', '30deg'],
          });

          return (
            <PanGestureHandler
              key={match.id}
              onGestureEvent={isCurrentCard ? handlePanGesture : undefined}
              onHandlerStateChange={isCurrentCard ? handlePanStateChange : undefined}
              enabled={isCurrentCard}
            >
              <Animated.View
                style={[
                  styles.cardContainer,
                  {
                    transform: [
                      { translateX: cardAnim.translateX },
                      { translateY: cardAnim.translateY },
                      { rotate: rotateInterpolate },
                      { scale: cardAnim.scale },
                    ],
                    opacity: cardAnim.opacity,
                    zIndex: dailyMatches.length - index,
                  },
                ]}
              >
                {/* Status Ring - Outside the card */}
                {match.hasStatus && (
                  <Animated.View style={[styles.statusRing, { 
                    borderColor: match.statusCount > 1 ? '#10b981' : '#3b82f6',
                    opacity: cardAnim.statusBlink
                  }]} />
                )}
                
                {/* Main Card */}
                <View style={styles.card}>
                <TouchableOpacity 
                  style={styles.cardContent}
                  onPress={() => handleProfileTap(match.id)}
                  activeOpacity={0.95}
                >
                  {/* Profile Image Container */}
                  <View style={styles.profileImageContainer}>
                    <TouchableOpacity
                      style={styles.profileImageTouchable}
                      onPress={match.hasStatus ? () => handleStatusTap(match.id) : () => handleProfileTap(match.id)}
                      activeOpacity={0.9}
                    >
                      <Image source={{ uri: match.avatar_url }} style={styles.profileImage} />
                    </TouchableOpacity>
                    
                    {/* Status Count Indicator */}
                    {match.hasStatus && match.statusCount > 1 && (
                      <View style={styles.statusCountBadge}>
                        <Text style={styles.statusCountText}>{match.statusCount}</Text>
                      </View>
                    )}
                  </View>
                  
                  {/* Cultural & Verification Badges */}
                  {match.isVerified && (
                    <View style={styles.verificationBadge}>
                      <MaterialCommunityIcons name="check-decagram" size={12} color="#fff" />
                      <Text style={styles.verificationText}>Verified</Text>
                    </View>
                  )}
                  
                  {match.isActiveNow && (
                    <View style={styles.liveBadge}>
                      <Text style={styles.liveText}>Active Now</Text>
                    </View>
                  )}
                  
                  {/* Gradient overlay */}
                  <View style={styles.gradientOverlay} />
                  
                  {/* Profile info */}
                  <View style={styles.profileInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{match.name}, {match.age}</Text>
                    </View>
                    
                    <Text style={styles.tagline}>{match.tagline}</Text>
                    
                    <View style={styles.locationRow}>
                      <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
                      <Text style={styles.location}>{match.distance}</Text>
                    </View>
                    
                    {/* Cultural Information */}
                    {match.hometown && (
                      <View style={styles.culturalInfo}>
                        <MaterialCommunityIcons name="home-heart" size={14} color="#fff" />
                        <Text style={styles.culturalText}>From {match.hometown}</Text>
                      </View>
                    )}
                    
                    {match.location && (
                      <View style={styles.culturalInfo}>
                        <MaterialCommunityIcons name="map-marker-outline" size={14} color="#fff" />
                        <Text style={styles.culturalText}>Lives in {match.location.split(', ')[1] || match.location}</Text>
                      </View>
                    )}
                    
                    <View style={styles.interestsContainer}>
                      {match.interests.slice(0, 3).map((interest, idx) => (
                        <View key={idx} style={styles.interestTag}>
                          <Text style={styles.interestText}>{interest}</Text>
                        </View>
                      ))}
                      {match.interests.length > 3 && (
                        <View style={styles.moreTag}>
                          <Text style={styles.moreText}>+{match.interests.length - 3}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                </View>
              </Animated.View>
            </PanGestureHandler>
          );
        })}
      </View>

      {/* Action buttons */}
      <View style={styles.actionButtons}>
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => animateButtonPress(handleReject)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
        
        <TouchableOpacity style={styles.infoButton}>
          <MaterialCommunityIcons name="information" size={24} color={Colors.light.tint} />
        </TouchableOpacity>
        
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={styles.superLikeButton}
            onPress={() => animateButtonPress(handleSuperLike)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="star" size={24} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
        
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={styles.likeButton}
            onPress={() => animateButtonPress(handleLike)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="heart" size={28} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  
  // Enhanced Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    flex: 1,
  },
  headerTitleText: {
    fontSize: 24,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
    marginTop: 2,
  },
  insightsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  insightsPanel: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  insightsTitle: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    marginBottom: 12,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightText: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    flex: 1,
    marginLeft: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: Colors.light.tint,
  },
  tabText: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
  },
  activeTabText: {
    color: '#fff',
    fontFamily: 'Archivo_700Bold',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 6,
    minWidth: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 8,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
    lineHeight: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginLeft: 4,
  },
  matchCounter: {
    alignItems: 'center',
  },
  matchCounterText: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
  },
  dailyMatchesLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    marginTop: 2,
  },

  // Card Stack
  cardStack: {
    height: screenHeight * 0.55,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  cardContainer: {
    position: 'absolute',
    width: screenWidth - 40,
    height: screenHeight * 0.52,
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  cardContent: {
    flex: 1,
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  
  // Status Ring Styles
  profileImageContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  statusRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: '#10b981',
    zIndex: 1000,
  },
  profileImageTouchable: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  statusCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  statusCountText: {
    fontSize: 11,
    fontFamily: 'Archivo_700Bold',
    color: '#fff',
    lineHeight: 20,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },

  // Profile Info
  profileInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 32,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  name: {
    fontSize: 28,
    fontFamily: 'Archivo_700Bold',
    color: '#fff',
    flex: 1,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 4,
  },
  activeText: {
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
  },
  tagline: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
    marginBottom: 12,
    opacity: 0.9,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  location: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
    marginLeft: 4,
    opacity: 0.8,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  interestText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
  },
  moreTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  moreText: {
    fontSize: 12,
    fontFamily: 'Archivo_700Bold',
    color: '#fff',
    opacity: 0.7,
  },

  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 20,
    backgroundColor: '#fff',
    gap: 24,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  rejectButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  infoButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  // Super Like Button  
  superLikeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  likeButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },

  // No More Cards
  noMoreCardsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  noMoreCardsTitle: {
    fontSize: 24,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  noMoreCardsSubtitle: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  qualityMessage: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Cultural Badges
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    position: 'absolute',
    top: 12,
    right: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
    fontWeight: '600',
  },
  verificationBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  verificationText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
    marginLeft: 6,
  },
  culturalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  culturalText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
    marginLeft: 4,
    opacity: 0.9,
  },
});