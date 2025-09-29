import PhotoGallery from "@/components/PhotoGallery";
import ProfileEditModal from "@/components/ProfileEditModal";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: screenWidth } = Dimensions.get('window');

// Settings menu items
const SETTINGS_MENU_ITEMS = [
  {
    id: 'notifications',
    title: 'Notifications',
    icon: 'bell',
    color: Colors.light.tint
  },
  {
    id: 'privacy',
    title: 'Privacy & Safety',
    icon: 'shield-check',
    color: Colors.light.tint
  },
  {
    id: 'preferences',
    title: 'Dating Preferences',
    icon: 'heart',
    color: Colors.light.tint
  },
  {
    id: 'help',
    title: 'Help & Support',
    icon: 'help-circle',
    color: Colors.light.tint
  },
  {
    id: 'divider',
    type: 'divider'
  },
  {
    id: 'logout',
    title: 'Sign Out',
    icon: 'logout',
    color: '#ef4444'
  }
];

// Interactive prompts for profile
const PROFILE_PROMPTS = [
  {
    id: 'two_truths_lie',
    title: 'Two truths and a lie',
    responses: [
      'I speak three languages',
      'I once met a celebrity',
      'I can cook jollof rice perfectly'
    ]
  },
  {
    id: 'week_goal',
    title: 'This week I want to...',
    responses: [
      'Try a new restaurant',
      'Learn something new',
      'Connect with old friends'
    ]
  },
  {
    id: 'vibe_song',
    title: 'My current vibe song is...',
    responses: [
      '"Essence" by Wizkid',
      '"Soco" by Starboy',
      '"Ye" by Burna Boy'
    ]
  }
];

export default function ProfileScreen() {
  const { signOut, user, profile, refreshProfile } = useAuth();
  const fontsLoaded = useAppFonts();
  const params = useLocalSearchParams();
  
  const [selectedPrompts, setSelectedPrompts] = useState<Record<string, number>>({
    two_truths_lie: 0,
    week_goal: 1,
    vibe_song: 2
  });
  
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [loadingInterests, setLoadingInterests] = useState(false);
  const [userPhotos, setUserPhotos] = useState<string[]>([]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      await fetchUserInterests();
      await loadUserPhotos();
      console.log('Profile manually refreshed');
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch user interests from profile_interests table
  const fetchUserInterests = async () => {
    if (!user?.id) return;
    
    try {
      setLoadingInterests(true);
      const { data, error } = await supabase
        .from('profile_interests')
        .select(`
          interests (
            name
          )
        `)
        .eq('profile_id', user.id);
      
      if (error) throw error;
      
      const interests = data?.map(item => (item as any).interests.name) || [];
      setUserInterests(interests);
    } catch (error) {
      console.error('Error fetching user interests:', error);
    } finally {
      setLoadingInterests(false);
    }
  };

  // Load user photos from profile and storage
  const loadUserPhotos = async () => {
    if (!user?.id) return;
    
    try {
      // First check if photos exist in profile.photos field
      const profilePhotos = (profile as any)?.photos || [];
      if (profilePhotos.length > 0) {
        setUserPhotos(profilePhotos);
        return;
      }

      // If no photos in profile, check storage folder
      const { data: files, error } = await supabase.storage
        .from('profile-photos')
        .list(`${user.id}/`, {
          limit: 10,
          sortBy: { column: 'created_at', order: 'asc' }
        });

      if (error) {
        console.error('Error loading photos:', error);
        return;
      }

      if (files && files.length > 0) {
        // Get public URLs for the photos
        const photoUrls = files
          .filter(file => file.name !== '.emptyFolderPlaceholder')
          .map(file => {
            const { data } = supabase.storage
              .from('profile-photos')
              .getPublicUrl(`${user.id}/${file.name}`);
            return data.publicUrl;
          });
        
        setUserPhotos(photoUrls);
      }
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  // Remove photo function
  const removePhoto = async (index: number) => {
    if (!user?.id || index < 0 || index >= userPhotos.length) return;
    
    try {
      const photoToRemove = userPhotos[index];
      
      // Remove from local state immediately for better UX
      const updatedPhotos = userPhotos.filter((_, i) => i !== index);
      setUserPhotos(updatedPhotos);
      
      // If photo is from storage, remove from storage
      if (photoToRemove.includes('profile-photos')) {
        // Extract filename from URL
        const urlParts = photoToRemove.split('/');
        const fileName = urlParts[urlParts.length - 1];
        
        const { error } = await supabase.storage
          .from('profile-photos')
          .remove([`${user.id}/${fileName}`]);
          
        if (error) {
          console.error('Error removing photo from storage:', error);
          // Revert local state on error
          setUserPhotos(userPhotos);
          return;
        }
      }
      
      // Update profile.photos field if it exists
      if ((profile as any)?.photos) {
        const { error } = await supabase
          .from('profiles')
          .update({ photos: updatedPhotos })
          .eq('id', profile.id);
          
        if (error) {
          console.error('Error updating profile photos:', error);
        }
      }
      
      console.log('Photo removed successfully');
    } catch (error) {
      console.error('Error removing photo:', error);
      // Revert local state on error
      loadUserPhotos();
    }
  };
  
  // Animation values
  const scrollY = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Load user interests and photos when component mounts or profile changes
  useEffect(() => {
    if (profile && user?.id) {
      fetchUserInterests();
      loadUserPhotos();
    }
  }, [profile, user?.id]);

  // Check if returning from full preview and should enter preview mode
  useEffect(() => {
    if (params.returnToPreview === 'true') {
      setIsPreviewMode(true);
      // Clear the parameter to avoid re-triggering
      router.replace('/(tabs)/profile');
    }
  }, [params.returnToPreview]);

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const handleSignOut = async () => {
    await signOut();
  };

  const handlePromptSelect = (promptId: string, index: number) => {
    if (isPreviewMode) return; // Don't allow changes in preview mode
    
    setSelectedPrompts(prev => ({
      ...prev,
      [promptId]: index
    }));
    
    // Add slight animation feedback
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.98,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const togglePreviewMode = () => {
    setIsPreviewMode(!isPreviewMode);
  };

  const openFullPreview = () => {
    // Navigate to the full profile view screen in preview mode
    router.push({
      pathname: '/profile-view',
      params: { 
        profileId: profile?.id || 'preview',
        isPreview: 'true'
      }
    });
  };

  const toggleSettingsDropdown = () => {
    const toValue = showSettingsDropdown ? 0 : 1;
    
    setShowSettingsDropdown(!showSettingsDropdown);
    
    Animated.parallel([
      Animated.timing(dropdownAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleSettingsItemPress = (itemId: string) => {
    toggleSettingsDropdown();
    
    if (itemId === 'logout') {
      handleSignOut();
    } else {
      // Handle other settings navigation
      console.log(`Navigate to ${itemId}`);
    }
  };

  const closeDropdown = () => {
    if (showSettingsDropdown) {
      toggleSettingsDropdown();
    }
  };

  // Header animation based on scroll
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.8],
    extrapolate: 'clamp',
  });

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Animated Header */}
      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>
            {isPreviewMode ? 'Profile Preview' : 'My Profile'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={[styles.previewButton, isPreviewMode && styles.previewButtonActive]} 
            onPress={togglePreviewMode}
          >
            <MaterialCommunityIcons 
              name={isPreviewMode ? "eye-off" : "eye"} 
              size={20} 
              color={isPreviewMode ? "#fff" : Colors.light.tint} 
            />
            <Text style={[styles.previewButtonText, isPreviewMode && styles.previewButtonTextActive]}>
              {isPreviewMode ? 'Edit' : 'Preview'}
            </Text>
          </TouchableOpacity>
          
          {!isPreviewMode && (
            <>
              <TouchableOpacity 
                style={[styles.settingsButton, showSettingsDropdown && styles.settingsButtonActive]} 
                onPress={toggleSettingsDropdown}
              >
                <MaterialCommunityIcons 
                  name={showSettingsDropdown ? "close" : "cog"} 
                  size={24} 
                  color={showSettingsDropdown ? "#fff" : Colors.light.tint} 
                />
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>

      {/* Settings Dropdown Overlay */}
      {showSettingsDropdown && (
        <>
          <Animated.View 
            style={[
              styles.dropdownBackdrop,
              {
                opacity: backdropAnim,
              }
            ]}
          >
            <TouchableOpacity 
              style={styles.backdropTouchable}
              onPress={closeDropdown}
              activeOpacity={1}
            />
          </Animated.View>
          
          <Animated.View
            style={[
              styles.settingsDropdown,
              {
                opacity: dropdownAnim,
                transform: [
                  {
                    translateY: dropdownAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-10, 0],
                    }),
                  },
                  {
                    scale: dropdownAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {SETTINGS_MENU_ITEMS.map((item) => {
              if (item.type === 'divider') {
                return <View key={item.id} style={styles.dropdownDivider} />;
              }
              
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.dropdownItem,
                    item.id === 'logout' && styles.dropdownItemDanger
                  ]}
                  onPress={() => handleSettingsItemPress(item.id)}
                >
                  <MaterialCommunityIcons 
                    name={item.icon as any} 
                    size={20} 
                    color={item.color} 
                  />
                  <Text 
                    style={[
                      styles.dropdownItemText,
                      item.id === 'logout' && styles.dropdownItemTextDanger
                    ]}
                  >
                    {item.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </>
      )}

      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <View style={styles.previewBanner}>
          <MaterialCommunityIcons name="eye" size={16} color={Colors.light.tint} />
          <View style={styles.previewBannerContent}>
            <Text style={styles.previewBannerText}>
              This is how others see your profile
            </Text>
            <TouchableOpacity style={styles.fullPreviewButton} onPress={openFullPreview}>
              <Text style={styles.fullPreviewButtonText}>View Full Preview</Text>
              <MaterialCommunityIcons name="arrow-right" size={14} color={Colors.light.tint} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Animated.ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        onTouchStart={closeDropdown}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.light.tint}
            colors={[Colors.light.tint]}
          />
        }
      >
        {/* Profile Header Section */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Image
              source={{
                uri: profile?.avatar_url || 'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face'
              }}
              style={styles.avatar}
            />
            {!isPreviewMode && (
              <TouchableOpacity 
                style={styles.editAvatarButton}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="camera" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.profileName}>
            {profile?.full_name || 'Your Name'}, {profile?.age || 25}
          </Text>
          
          <View style={styles.locationContainer}>
            <MaterialCommunityIcons name="map-marker" size={16} color={Colors.light.tint} />
            <Text style={styles.locationText}>
              {profile?.region || 'Accra'}, Ghana
            </Text>
          </View>
          
          <Text style={styles.bio}>
            {profile?.bio || 'Your bio will appear here...'}
          </Text>

          {/* Profile Details */}
          <View style={styles.profileDetails}>
            {/* Age and Height Row */}
            <View style={styles.detailRow}>
              {profile?.age && (
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="cake-variant" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>{profile.age} years old</Text>
                </View>
              )}
              {(profile as any)?.height && (
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="human-male-height" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>{(profile as any).height}</Text>
                </View>
              )}
            </View>

            {/* Occupation */}
            {(profile as any)?.occupation && (
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="briefcase" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>{(profile as any).occupation}</Text>
                </View>
              </View>
            )}

            {/* Education */}
            {(profile as any)?.education && (
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="school" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>{(profile as any).education}</Text>
                </View>
              </View>
            )}

            {/* Looking For */}
            {(profile as any)?.looking_for && (
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="heart-outline" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>Looking for {(profile as any).looking_for}</Text>
                </View>
              </View>
            )}

            {/* HIGH PRIORITY: Lifestyle Fields */}
            {(profile as any)?.exercise_frequency && (
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="dumbbell" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>Exercises {(profile as any).exercise_frequency}</Text>
                </View>
              </View>
            )}

            {/* Smoking and Drinking Row */}
            <View style={styles.detailRow}>
              {(profile as any)?.smoking && (
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="smoking-off" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>Smoking: {(profile as any).smoking}</Text>
                </View>
              )}
              {(profile as any)?.drinking && (
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="glass-cocktail" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>Drinking: {(profile as any).drinking}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Family Fields */}
            {/* Children Row */}
            <View style={styles.detailRow}>
              {(profile as any)?.has_children && (
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="baby" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>Children: {(profile as any).has_children}</Text>
                </View>
              )}
              {(profile as any)?.wants_children && (
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="heart-plus" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>Wants: {(profile as any).wants_children}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Personality Fields */}
            {(profile as any)?.personality_type && (
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="account-circle" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>{(profile as any).personality_type}</Text>
                </View>
              </View>
            )}

            {(profile as any)?.love_language && (
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="heart-multiple" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>Love Language: {(profile as any).love_language}</Text>
                </View>
              </View>
            )}

            {/* HIGH PRIORITY: Living Situation Fields */}
            {/* Living and Pets Row */}
            <View style={styles.detailRow}>
              {(profile as any)?.living_situation && (
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="home" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>{(profile as any).living_situation}</Text>
                </View>
              )}
              {(profile as any)?.pets && (
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="paw" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>{(profile as any).pets}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Languages */}
            {(profile as any)?.languages_spoken && (profile as any).languages_spoken.length > 0 && (
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="translate" size={16} color={Colors.light.tint} />
                  <Text style={styles.detailText}>
                    Languages: {(profile as any).languages_spoken.join(', ')}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Show compatibility score in preview mode */}
          {isPreviewMode && (
            <View style={styles.compatibilityContainer}>
              <MaterialCommunityIcons name="heart" size={20} color={Colors.light.tint} />
              <Text style={styles.compatibilityText}>85% Match</Text>
            </View>
          )}
        </View>

        {/* Quick Stats - Hidden in preview mode */}
        {!isPreviewMode && (
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>12</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>3</Text>
              <Text style={styles.statLabel}>Chats</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>89%</Text>
              <Text style={styles.statLabel}>Match Rate</Text>
            </View>
          </View>
        )}

        {/* Photo Gallery Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            {!isPreviewMode && (
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="plus" size={20} color={Colors.light.tint} />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <PhotoGallery
            photos={userPhotos.length > 0 ? userPhotos : [
              'https://images.unsplash.com/photo-1500003116-9aa12eeae7e2?w=300&h=400&fit=crop&crop=face',
              'https://images.unsplash.com/photo-1501003211169-0a1dd7228f2d?w=300&h=400&fit=crop&crop=face',
              'https://images.unsplash.com/photo-1502003119688-b3b9e7b2e1e8?w=300&h=400&fit=crop&crop=face'
            ]}
            canEdit={!isPreviewMode}
            onAddPhoto={() => setShowEditModal(true)}
            onRemovePhoto={removePhoto}
          />
        </View>

        {/* Interactive Prompts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>About Me</Text>
            {!isPreviewMode && (
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={Colors.light.tint} />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            {PROFILE_PROMPTS.map((prompt) => (
              <View key={prompt.id} style={styles.promptCard}>
                <Text style={styles.promptTitle}>{prompt.title}</Text>
                <View style={styles.promptOptions}>
                  {prompt.responses.map((response, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.promptOption,
                        selectedPrompts[prompt.id] === index && styles.promptOptionSelected,
                        isPreviewMode && styles.promptOptionPreview
                      ]}
                      onPress={() => handlePromptSelect(prompt.id, index)}
                      disabled={isPreviewMode}
                    >
                      <Text
                        style={[
                          styles.promptOptionText,
                          selectedPrompts[prompt.id] === index && styles.promptOptionTextSelected
                        ]}
                      >
                        {response}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </Animated.View>
        </View>

        {/* Interests Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Interests</Text>
            {!isPreviewMode && (
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={Colors.light.tint} />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.interestsContainer}>
            {loadingInterests ? (
              <Text style={styles.noInterestsText}>Loading interests...</Text>
            ) : userInterests.length > 0 ? (
              userInterests.map((interest: string, index: number) => (
                <View key={index} style={styles.interestTag}>
                  <Text style={styles.interestText}>{interest}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noInterestsText}>No interests added yet. Tap Edit to add your interests!</Text>
            )}
          </View>
        </View>

        {/* Action Buttons - Only show in preview mode */}
        {isPreviewMode && (
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.actionButton}>
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.infoButton}>
              <MaterialCommunityIcons name="information" size={24} color={Colors.light.tint} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.likeButton}>
              <MaterialCommunityIcons name="heart" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}



        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </Animated.ScrollView>

      {/* Profile Edit Modal */}
      <ProfileEditModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={async (updatedProfile) => {
          // Force refresh the profile to ensure UI is updated
          setRefreshing(true);
          try {
            await refreshProfile(); // This will update the profile state
            await loadUserPhotos(); // Reload photos after profile update
            console.log('Profile refreshed after save');
          } catch (error) {
            console.error('Error refreshing profile:', error);
          } finally {
            setRefreshing(false);
            setShowEditModal(false);
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.light.tint,
    gap: 6,
  },
  previewButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  previewButtonText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.light.tint,
  },
  previewButtonTextActive: {
    color: '#fff',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  settingsButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  
  // Preview Banner
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.tint + '15',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  previewBannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewBannerText: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.light.tint,
  },
  fullPreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fullPreviewButtonText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.light.tint,
  },
  
  // Scroll View
  scrollView: {
    flex: 1,
  },
  
  // Profile Header
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileName: {
    fontSize: 28,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    marginLeft: 4,
  },
  bio: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  compatibilityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.tint + '15',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    gap: 8,
  },
  compatibilityText: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: Colors.light.tint,
  },
  
  // Stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 20,
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontFamily: 'Archivo_700Bold',
    color: Colors.light.tint,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  
  // Sections
  section: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
  },
  
  // Buttons
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
    marginLeft: 4,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  editButtonText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
    marginLeft: 4,
  },
  
  // Photo Gallery
  photoGallery: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  addPhotoCard: {
    width: 120,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addPhotoText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    marginTop: 8,
  },
  photoCard: {
    position: 'relative',
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  deletePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Prompts
  promptCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
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
  promptOptions: {
    gap: 8,
  },
  promptOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  promptOptionSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  promptOptionPreview: {
    opacity: 0.8,
  },
  promptOptionText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
  },
  promptOptionTextSelected: {
    color: '#fff',
    fontFamily: 'Archivo_700Bold',
  },
  
  // Interests
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.light.tint,
  },
  interestText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
  },
  noInterestsText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  
  // Preview Actions
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 24,
    backgroundColor: '#fff',
    gap: 24,
    marginBottom: 8,
  },
  actionButton: {
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
  
  // Settings Dropdown
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    zIndex: 998,
  },
  backdropTouchable: {
    flex: 1,
  },
  settingsDropdown: {
    position: 'absolute',
    top: 80,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 999,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dropdownItemDanger: {
    backgroundColor: '#fef2f2',
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
    color: '#374151',
    flex: 1,
  },
  dropdownItemTextDanger: {
    color: '#ef4444',
    fontFamily: 'Manrope_600SemiBold',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 4,
    marginHorizontal: 12,
  },
  
  // Profile Details Styles
  profileDetails: {
    marginTop: 16,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailText: {
    fontSize: 14,
    color: '#475569',
    fontFamily: 'Manrope_500Medium',
  },
});