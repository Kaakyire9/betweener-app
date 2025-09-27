import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";

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
  const { signOut, user, profile } = useAuth();
  const fontsLoaded = useAppFonts();
  
  const [selectedPrompts, setSelectedPrompts] = useState<Record<string, number>>({
    two_truths_lie: 0,
    week_goal: 1,
    vibe_song: 2
  });
  
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  
  // Animation values
  const scrollY = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

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
              <TouchableOpacity style={styles.editAvatarButton}>
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
              <TouchableOpacity style={styles.addButton}>
                <MaterialCommunityIcons name="plus" size={20} color={Colors.light.tint} />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoGallery}>
            {!isPreviewMode && (
              <TouchableOpacity style={styles.addPhotoCard}>
                <MaterialCommunityIcons name="camera-plus" size={32} color="#9ca3af" />
                <Text style={styles.addPhotoText}>Add Photo</Text>
              </TouchableOpacity>
            )}
            
            {/* Mock photos */}
            {[1, 2, 3].map((item) => (
              <View key={item} style={styles.photoCard}>
                <Image
                  source={{
                    uri: `https://images.unsplash.com/photo-150${item}003211169-0a1dd7228f2d?w=300&h=400&fit=crop&crop=face`
                  }}
                  style={styles.photoImage}
                />
                {!isPreviewMode && (
                  <TouchableOpacity style={styles.deletePhotoButton}>
                    <MaterialCommunityIcons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Interactive Prompts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>About Me</Text>
            {!isPreviewMode && (
              <TouchableOpacity style={styles.editButton}>
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
              <TouchableOpacity style={styles.editButton}>
                <MaterialCommunityIcons name="pencil" size={16} color={Colors.light.tint} />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.interestsContainer}>
            {['Music', 'Travel', 'Food', 'Dancing', 'Movies', 'Art'].map((interest) => (
              <View key={interest} style={styles.interestTag}>
                <Text style={styles.interestText}>{interest}</Text>
              </View>
            ))}
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
});