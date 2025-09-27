import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  TouchableOpacity,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { PanGestureHandler, PanGestureHandlerGestureEvent, PanGestureHandlerStateChangeEvent, State, GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Mock data for daily matches
const MOCK_MATCHES = [
  {
    id: '1',
    name: 'Akosua',
    age: 24,
    tagline: 'Adventure seeker & foodie 🌟',
    bio: 'Love exploring new places and trying different cuisines. Looking for someone to share life\'s beautiful moments with.',
    location: 'Accra, Greater Accra',
    tribe: 'Akan',
    religion: 'Christian',
    interests: ['Travel', 'Food', 'Music', 'Dancing'],
    avatar_url: 'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face',
    distance: '2.3 km away',
    lastActive: '2 hours ago',
    isActiveNow: false,
  },
  {
    id: '2',
    name: 'Kwame',
    age: 27,
    tagline: 'Tech enthusiast & gym lover 💪',
    bio: 'Software developer by day, fitness enthusiast by evening. Looking for someone who shares my passion for growth.',
    location: 'Kumasi, Ashanti',
    tribe: 'Akan',
    religion: 'Christian',
    interests: ['Technology', 'Fitness', 'Reading', 'Movies'],
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&crop=face',
    distance: '15.7 km away',
    lastActive: 'Active now',
    isActiveNow: true,
  },
  {
    id: '3',
    name: 'Ama',
    age: 22,
    tagline: 'Artist with a kind heart 🎨',
    bio: 'I paint emotions and capture moments. Seeking someone who appreciates art and believes in genuine connections.',
    location: 'Cape Coast, Central',
    tribe: 'Fante',
    religion: 'Christian',
    interests: ['Art', 'Photography', 'Nature', 'Music'],
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&crop=face',
    distance: '8.2 km away',
    lastActive: '1 hour ago',
    isActiveNow: false,
  },
];

const TAB_OPTIONS = [
  { id: 'nearby', label: 'Nearby', icon: 'map-marker' },
  { id: 'active', label: 'Active Now', icon: 'circle' },
  { id: 'recommended', label: 'Recommended', icon: 'heart' },
];

export default function ExploreScreen() {
  const { profile } = useAuth();
  const fontsLoaded = useAppFonts();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('recommended');
  const [dailyMatches, setDailyMatches] = useState(MOCK_MATCHES);
  
  // Animation values
  const cardAnimations = useRef(
    MOCK_MATCHES.map(() => ({
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
      rotate: new Animated.Value(0),
      scale: new Animated.Value(1),
      opacity: new Animated.Value(1),
    }))
  ).current;
  
  const backgroundParallax = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  
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
    animateCardExit('right');
    // Add haptic feedback or success animation
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
      {/* Header with tabs */}
      <View style={styles.header}>
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
              {tab.id === 'active' && (
                <View style={styles.activeDot} />
              )}
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.matchCounter}>
          <Text style={styles.matchCounterText}>
            {currentIndex + 1} / {dailyMatches.length}
          </Text>
          <Text style={styles.dailyMatchesLabel}>Daily Curated</Text>
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
                  styles.card,
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
                <TouchableOpacity 
                  style={styles.cardContent}
                  onPress={() => handleProfileTap(match.id)}
                  activeOpacity={0.95}
                >
                  <Image source={{ uri: match.avatar_url }} style={styles.profileImage} />
                  
                  {/* Gradient overlay */}
                  <View style={styles.gradientOverlay} />
                  
                  {/* Profile info */}
                  <View style={styles.profileInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{match.name}, {match.age}</Text>
                      {match.isActiveNow && (
                        <View style={styles.activeIndicator}>
                          <View style={styles.activeDotSmall} />
                          <Text style={styles.activeText}>Active</Text>
                        </View>
                      )}
                    </View>
                    
                    <Text style={styles.tagline}>{match.tagline}</Text>
                    
                    <View style={styles.locationRow}>
                      <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
                      <Text style={styles.location}>{match.distance}</Text>
                    </View>
                    
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
  
  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    position: 'absolute',
    width: screenWidth - 40,
    height: screenHeight * 0.65,
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
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
    paddingVertical: 24,
    backgroundColor: '#fff',
    gap: 24,
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
});