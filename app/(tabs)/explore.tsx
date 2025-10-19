import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { ExploreService, type DiscoveryFilters, type ExploreProfile } from '@/lib/explore-service';
import { StatusService, type StatusRing } from '@/lib/status-service';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerStateChangeEvent, State } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const TAB_OPTIONS = [
  { id: 'recommended', label: 'For You', icon: 'heart', badge: null },
  { id: 'nearby', label: 'Nearby', icon: 'map-marker', badge: null },
  { id: 'active', label: 'Active Now', icon: 'circle-outline', badge: 'live', count: 4 },
  { id: 'hometown', label: 'Hometown', icon: 'home-heart', badge: null },
];

export default function ExploreScreen() {
  const { profile, user } = useAuth();
  const fontsLoaded = useAppFonts();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('recommended');
  const [dailyMatches, setDailyMatches] = useState<ExploreProfile[]>([]);
  const [statusRings, setStatusRings] = useState<StatusRing[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [showInsights, setShowInsights] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<{[key: string]: number}>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Location tracking (temporarily disabled)
  // const {
  //   currentLocation,
  //   manualUpdate: updateLocation,
  //   lastUpdate: locationLastUpdate
  // } = useLocationTracking({
  //   enableBackgroundTracking: true,
  //   updateInterval: 30 // Update every 30 minutes
  // });
  
  // Animation values
  const cardAnimations = useRef<Array<{
    translateX: Animated.Value;
    translateY: Animated.Value;
    rotate: Animated.Value;
    scale: Animated.Value;
    opacity: Animated.Value;
    statusBlink: Animated.Value;
  }>>([]).current;
  
  const backgroundParallax = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Initialize card animations when matches change
  useEffect(() => {
    if (dailyMatches.length > 0) {
      // Ensure we have enough animations for all matches
      while (cardAnimations.length < dailyMatches.length) {
        cardAnimations.push({
          translateX: new Animated.Value(0),
          translateY: new Animated.Value(0),
          rotate: new Animated.Value(0),
          scale: new Animated.Value(1),
          opacity: new Animated.Value(1),
          statusBlink: new Animated.Value(1),
        });
      }
    }
  }, [dailyMatches.length]);

  // Load initial data
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      console.log('🔍 Loading data for user:', user.id);
      setError(null);
      
      // Load discovery matches
      const filters: DiscoveryFilters = {
        diasporaStatus: activeTab === 'diaspora' ? 'DIASPORA' : 
                       activeTab === 'local' ? 'LOCAL' : 'ALL',
        isVerified: activeTab === 'verified'
      };
      
      const [matchesData, statusRingsData, insightsData] = await Promise.all([
        ExploreService.getDiscoveryMatches(user.id, filters, 10),
        StatusService.getStatusRings(user.id, 20),
        ExploreService.getDiscoveryInsights(user.id)
      ]);
      
      console.log('🔍 Discovery data loaded:', {
        matchesCount: matchesData.length,
        firstMatch: matchesData[0] ? {
          name: matchesData[0].full_name,
          hometown: matchesData[0].hometown,
          interests: matchesData[0].interests,
          photos: matchesData[0].photos?.length,
          region: matchesData[0].region,
          current_country: matchesData[0].current_country,
          fullObject: matchesData[0]
        } : null
      });
      
      setDailyMatches(matchesData);
      setStatusRings(statusRingsData);
      setInsights(insightsData);
      
    } catch (error) {
      console.error('❌ Error loading explore data:', error);
      setError('Failed to load discovery data');
      
      // Set empty data arrays on error - no mock data fallback
      setDailyMatches([]);
      setInsights([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, activeTab]);

  // Load data on mount and when tab changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh data
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Status blinking animation
  useEffect(() => {
    const blinkAnimations = cardAnimations.slice(0, dailyMatches.length).map((anim, index) => {
      const match = dailyMatches[index];
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
  }, [dailyMatches, cardAnimations]);
  
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

  // Loading state
  if (loading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={[styles.noMoreCardsContainer, { justifyContent: 'center' }]}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={[styles.noMoreCardsSubtitle, { marginTop: 16 }]}>
              Finding your perfect matches...
            </Text>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  // Error state
  if (error) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.noMoreCardsContainer}>
            <MaterialCommunityIcons name="alert-circle-outline" size={80} color="#ef4444" />
            <Text style={styles.noMoreCardsTitle}>Oops! Something went wrong</Text>
            <Text style={styles.noMoreCardsSubtitle}>{error}</Text>
            <TouchableOpacity 
              style={[styles.actionButtons, { marginTop: 20 }]}
              onPress={() => {
                setError(null);
                setLoading(true);
                loadData();
              }}
            >
              <Text style={styles.moreText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
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
        const currentCard = cardAnimations[currentIndex];
        if (currentCard) {
          Animated.spring(currentCard.translateX, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      }
    }
  };

  const animateCardExit = async (direction: 'left' | 'right') => {
    const currentCard = cardAnimations[currentIndex];
    if (!currentCard) return;
    
    const currentMatch = dailyMatches[currentIndex];
    const exitX = direction === 'right' ? screenWidth : -screenWidth;
    
    // Record the swipe in backend
    if (user?.id && currentMatch) {
      try {
        const action = direction === 'right' ? 'LIKE' : 'PASS';
        await ExploreService.recordSwipe(user.id, currentMatch.id, action);
        
        // Show feedback for likes
        if (direction === 'right') {
          // Could show match animation here if it's a match
          console.log(`Liked ${currentMatch.full_name}`);
        }
      } catch (error) {
        console.error('Error recording swipe:', error);
        // Continue with animation even if backend fails
      }
    }
    
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
      } else {
        // Load more matches when running low
        loadData();
      }
    });

    // Animate next cards up
    for (let i = currentIndex + 1; i < cardAnimations.length; i++) {
      const cardAnim = cardAnimations[i];
      if (cardAnim) {
        Animated.parallel([
          Animated.spring(cardAnim.scale, {
            toValue: 1 - (i - currentIndex - 1) * 0.05,
            useNativeDriver: false,
          }),
          Animated.spring(cardAnim.translateY, {
            toValue: (i - currentIndex - 1) * 10,
            useNativeDriver: false,
          }),
          Animated.spring(cardAnim.opacity, {
            toValue: 1 - (i - currentIndex - 1) * 0.2,
            useNativeDriver: false,
          }),
        ]).start();
      }
    }
  };

  const handleLike = () => {
    const currentMatch = dailyMatches[currentIndex];
    animateCardExit('right');
    
    // Show cultural appreciation message
    Alert.alert(
      "Akwaaba! 🇬🇭", 
      `You liked ${currentMatch.full_name}! They'll be notified.`,
      [{ text: "Great!", style: "default" }]
    );
  };

  const handleSuperLike = () => {
    const currentMatch = dailyMatches[currentIndex];
    animateCardExit('right');
    
    Alert.alert(
      "Me pɛ wo paa! 💫", 
      `You super-liked ${currentMatch.full_name} from ${currentMatch.hometown}! This shows serious interest.`,
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
        <ScrollView 
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.light.tint]}
              tintColor={Colors.light.tint}
            />
          }
          showsVerticalScrollIndicator={false}
        >
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
            {insights.map((insight, index) => (
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
              onPress={() => {
                setActiveTab(tab.id);
                setCurrentIndex(0);
                setLoading(true);
              }}
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

      {/* Status Rings */}
      {statusRings.length > 0 && (
        <View style={styles.statusContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statusScrollContent}
          >
            {statusRings.map((ring, index) => (
              <TouchableOpacity
                key={ring.userId}
                style={styles.statusRing}
                onPress={() => handleStatusTap(ring.userId)}
              >
                <View style={[
                  styles.statusImageContainer,
                  ring.hasUnviewedStatus && styles.statusRingUnviewed,
                  ring.isMyStatus && styles.statusRingMine
                ]}>
                  <Image
                    source={{ uri: ring.userAvatar || 'https://via.placeholder.com/60' }}
                    style={styles.statusImage}
                  />
                  {ring.statusCount > 1 && (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>{ring.statusCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.statusUserName} numberOfLines={1}>
                  {ring.isMyStatus ? 'Your story' : ring.userName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Card Stack */}
      <View style={styles.cardStack}>
        {dailyMatches.map((match, index) => {
          if (index < currentIndex) return null;
          
          const cardAnim = cardAnimations[index];
          if (!cardAnim) return null;
          
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
                  <Animated.View style={[styles.profileStatusRing, {
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
                  {match.verification_level > 0 && (
                    <View style={styles.verificationBadge}>
                      <MaterialCommunityIcons name="check-decagram" size={12} color="#fff" />
                      <Text style={styles.verificationText}>Verified</Text>
                    </View>
                  )}
                  
                  {match.online && (
                    <View style={styles.liveBadge}>
                      <Text style={styles.liveText}>Active Now</Text>
                    </View>
                  )}
                  
                  {/* Gradient overlay */}
                  <View style={styles.gradientOverlay} />
                  
                  {/* Profile info */}
                  <View style={styles.profileInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{match.full_name}, {match.age}</Text>
                    </View>
                    
                    <Text style={styles.tagline}>{match.bio}</Text>
                    
                    <View style={styles.locationRow}>
                      <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
                      <Text style={styles.location}>
                        {match.current_country || 'Unknown location'}
                      </Text>
                    </View>
                    
                    {/* Cultural Information */}
                    {match.hometown && (
                      <View style={styles.culturalInfo}>
                        <MaterialCommunityIcons name="home-heart" size={14} color="#fff" />
                        <Text style={styles.culturalText}>From {match.hometown}</Text>
                      </View>
                    )}
                    
                    {match.diaspora_status && (
                      <View style={styles.culturalInfo}>
                        <MaterialCommunityIcons name="earth" size={14} color="#fff" />
                        <Text style={styles.culturalText}>
                          {match.diaspora_status === 'LOCAL' ? 'Lives locally' : 
                           match.diaspora_status === 'DIASPORA' ? `Diaspora in ${match.current_country}` :
                           `Lives in ${match.current_country}`}
                        </Text>
                      </View>
                    )}
                    
                    {match.tribe && (
                      <View style={styles.culturalInfo}>
                        <MaterialCommunityIcons name="account-group" size={14} color="#fff" />
                        <Text style={styles.culturalText}>{match.tribe} tribe</Text>
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
        </ScrollView>
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
  profileStatusRing: {
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
    padding: 20,
    paddingBottom: 28,
    minHeight: 180, // Ensure minimum height for content
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
    marginBottom: 12,
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
    marginTop: 12,
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
    marginBottom: 10,
    // backgroundColor: 'rgba(255,255,255,0.1)', // Temporary debug background
  },
  culturalText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#fff',
    marginLeft: 4,
    opacity: 0.9,
  },
  statusContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  statusScrollContent: {
    paddingHorizontal: 4,
  },
  statusRing: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 70,
  },
  statusImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    position: 'relative',
  },
  statusRingUnviewed: {
    borderColor: Colors.light.tint,
    borderWidth: 3,
  },
  statusRingMine: {
    borderColor: '#10b981',
    borderWidth: 3,
  },
  statusImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  statusBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    color: '#fff',
    lineHeight: 12,
  },
  statusUserName: {
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 2,
  },
});