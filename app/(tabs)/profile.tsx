import { DiasporaVerification } from "@/components/DiasporaVerification";
import PhotoGallery from "@/components/PhotoGallery";
import ProfileEditModal from "@/components/ProfileEditModal";
import { VerificationBadge } from "@/components/VerificationBadge";
import { VerificationNotifications } from "@/components/VerificationNotifications";
import { Colors } from "@/constants/theme";
import { useColorScheme, useColorSchemePreference } from "@/hooks/use-color-scheme";
import { useVerificationStatus } from "@/hooks/use-verification-status";
import { useAuth } from "@/lib/auth-context";
import { normalizeAiScorePercent, toRoundedPercentInt } from '@/lib/profile/ai-score';
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from "react-native-safe-area-context";

const { width: screenWidth } = Dimensions.get('window');
const DISTANCE_UNIT_KEY = 'distance_unit';

type DistanceUnit = 'auto' | 'km' | 'mi';

type NotificationPrefs = {
  push_enabled: boolean;
  inapp_enabled: boolean;
  messages: boolean;
  message_reactions: boolean;
  reactions: boolean;
  likes: boolean;
  superlikes: boolean;
  matches: boolean;
  moments: boolean;
  verification: boolean;
  announcements: boolean;
  preview_text: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_tz: string;
};

const DISTANCE_UNIT_OPTIONS: { value: DistanceUnit; label: string; subtitle?: string }[] = [
  { value: 'auto', label: 'Auto', subtitle: 'Recommended' },
  { value: 'km', label: 'Kilometers' },
  { value: 'mi', label: 'Miles' },
];

const QUIET_HOURS_PRESETS = [
  { id: 'late', label: '22:00-08:00', start: '22:00:00', end: '08:00:00' },
  { id: 'night', label: '23:00-07:00', start: '23:00:00', end: '07:00:00' },
  { id: 'deep', label: '00:00-06:00', start: '00:00:00', end: '06:00:00' },
];

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
    id: 'admin',
    title: 'Admin Dashboard',
    icon: 'shield-account',
    color: '#FF9800',
    adminOnly: true
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
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const params = useLocalSearchParams();
  const { status: verificationStatus, refreshStatus } = useVerificationStatus(profile?.id);
  const { preference: themePreference, setPreference: setThemePreference } = useColorSchemePreference();
  const verificationLoading = verificationStatus?.loading ?? false;
  
  const [selectedPrompts, setSelectedPrompts] = useState<Record<string, number>>({
    two_truths_lie: 0,
    week_goal: 1,
    vibe_song: 2
  });
  
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [loadingInterests, setLoadingInterests] = useState(false);
  const [userPhotos, setUserPhotos] = useState<string[]>([]);
  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('auto');
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    push_enabled: true,
    inapp_enabled: true,
    messages: true,
    message_reactions: true,
    reactions: true,
    likes: true,
    superlikes: true,
    matches: true,
    moments: true,
    verification: true,
    announcements: false,
    preview_text: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '08:00:00',
    quiet_hours_tz: 'UTC',
  });
  const [notificationPrefsLoaded, setNotificationPrefsLoaded] = useState(false);

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

  const loadNotificationPrefs = useCallback(async () => {
    if (!user?.id) return;
    setNotificationPrefsLoaded(false);
    const { data, error } = await supabase
      .from('notification_prefs')
      .select(
        'push_enabled,inapp_enabled,messages,message_reactions,reactions,likes,superlikes,matches,moments,verification,announcements,preview_text,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_tz',
      )
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.log('[profile] notification prefs error', error);
      setNotificationPrefsLoaded(true);
      return;
    }
    if (data) {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setNotificationPrefs({
        push_enabled: Boolean(data.push_enabled),
        inapp_enabled: Boolean(data.inapp_enabled),
        messages: Boolean(data.messages),
        message_reactions: Boolean(data.message_reactions),
        reactions: Boolean(data.reactions),
        likes: Boolean(data.likes),
        superlikes: Boolean(data.superlikes),
        matches: Boolean(data.matches),
        moments: Boolean(data.moments),
        verification: Boolean(data.verification),
        announcements: Boolean(data.announcements),
        preview_text: Boolean(data.preview_text),
        quiet_hours_enabled: Boolean(data.quiet_hours_enabled),
        quiet_hours_start: data.quiet_hours_start ?? '22:00:00',
        quiet_hours_end: data.quiet_hours_end ?? '08:00:00',
        quiet_hours_tz: data.quiet_hours_tz ?? localTz,
      });
    }
    setNotificationPrefsLoaded(true);
  }, [user?.id]);

  useEffect(() => {
    void loadNotificationPrefs();
  }, [loadNotificationPrefs]);

  // Check if returning from full preview and should enter preview mode
  useEffect(() => {
    if (params.returnToPreview === 'true') {
      setIsPreviewMode(true);
      // Clear the parameter to avoid re-triggering
      router.replace('/(tabs)/profile');
    }
  }, [params.returnToPreview]);

  const loadDistanceUnit = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
      if (stored === 'auto' || stored === 'km' || stored === 'mi') {
        setDistanceUnit(stored);
      } else {
        setDistanceUnit('auto');
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadDistanceUnit();
  }, [loadDistanceUnit]);

  useEffect(() => {
    if (!showEditModal) {
      void loadDistanceUnit();
    }
  }, [showEditModal, loadDistanceUnit]);

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
    const params: Record<string, any> = { 
      profileId: profile?.id || 'preview',
      isPreview: 'true',
    };
    try {
      if (profile) {
        const aiScorePct = normalizeAiScorePercent((profile as any).aiScore ?? (profile as any).ai_score);
        const compatPct = toRoundedPercentInt(aiScorePct) ?? 100;
        const fallback = {
          id: profile.id,
          name: profile.full_name || profile.id,
          age: profile.age,
          location: profile.region || profile.location || '',
          avatar_url: profile.avatar_url,
          photos: (profile as any).photos,
          occupation: (profile as any).occupation,
          education: (profile as any).education,
          bio: profile.bio,
          tribe: (profile as any).tribe,
          religion: (profile as any).religion,
          distance: profile.region || '',
          interests: (profile as any).interests,
          is_active: true,
          compatibility: compatPct,
          aiScore: aiScorePct ?? compatPct,
          verified: !!(profile as any).verification_level,
        };
        params.fallbackProfile = encodeURIComponent(JSON.stringify(fallback));
      }
    } catch {}

    router.push({
      pathname: '/profile-view',
      params,
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
    } else if (itemId === 'admin') {
      router.push('/admin');
    } else if (itemId === 'notifications') {
      setShowNotificationsModal(true);
    } else {
      // Handle other settings navigation
      console.log(`Navigate to ${itemId}`);
    }
  };

  const persistNotificationPrefs = useCallback(
    async (next: NotificationPrefs) => {
      setNotificationPrefs(next);
      if (!user?.id) return;
      const { error } = await supabase
        .from('notification_prefs')
        .upsert(
          {
            user_id: user.id,
            ...next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (error) {
        console.log('[profile] notification prefs update error', error);
      }
    },
    [user?.id],
  );

  const updateNotificationPref = useCallback(
    async (key: keyof NotificationPrefs, value: boolean) => {
      const next = { ...notificationPrefs, [key]: value };
      await persistNotificationPrefs(next);
    },
    [notificationPrefs, persistNotificationPrefs],
  );

  const updateQuietHours = useCallback(
    async (enabled: boolean, start: string, end: string) => {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const next = {
        ...notificationPrefs,
        quiet_hours_enabled: enabled,
        quiet_hours_start: start,
        quiet_hours_end: end,
        quiet_hours_tz: localTz,
      };
      await persistNotificationPrefs(next);
    },
    [notificationPrefs, persistNotificationPrefs],
  );

  const quietHoursLabel = useCallback((value: string) => value.slice(0, 5), []);

  const activeQuietPreset = useMemo(() => {
    return QUIET_HOURS_PRESETS.find(
      (preset) =>
        preset.start === notificationPrefs.quiet_hours_start
        && preset.end === notificationPrefs.quiet_hours_end,
    );
  }, [notificationPrefs.quiet_hours_end, notificationPrefs.quiet_hours_start]);

  const quietHoursPreview = useMemo(() => {
    if (!notificationPrefs.quiet_hours_enabled) return null;
    const tzLabel = notificationPrefs.quiet_hours_tz || 'UTC';
    return `Quiet hours use ${tzLabel} time`;
  }, [notificationPrefs.quiet_hours_enabled, notificationPrefs.quiet_hours_tz]);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const timeStringToDate = useCallback((value: string) => {
    const [hour = '0', minute = '0'] = value.split(':');
    const date = new Date();
    date.setHours(Number(hour));
    date.setMinutes(Number(minute));
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  }, []);

  const dateToTimeString = useCallback((value: Date) => {
    const hh = value.getHours().toString().padStart(2, '0');
    const mm = value.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}:00`;
  }, []);

  const handleStartChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS !== 'ios') {
        setShowStartPicker(false);
      }
      if (event.type === 'dismissed' || !selected) return;
      void updateQuietHours(
        true,
        dateToTimeString(selected),
        notificationPrefs.quiet_hours_end,
      );
    },
    [dateToTimeString, notificationPrefs.quiet_hours_end, updateQuietHours],
  );

  const handleEndChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS !== 'ios') {
        setShowEndPicker(false);
      }
      if (event.type === 'dismissed' || !selected) return;
      void updateQuietHours(
        true,
        notificationPrefs.quiet_hours_start,
        dateToTimeString(selected),
      );
    },
    [dateToTimeString, notificationPrefs.quiet_hours_start, updateQuietHours],
  );


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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Verification Notifications */}
      {profile?.id && <VerificationNotifications />}
      
      {/* Animated Header */}
      <Animated.View
        style={[
          styles.header,
          {
            backgroundColor: theme.background,
            borderBottomColor: theme.outline,
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
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
              color={isPreviewMode ? '#fff' : theme.tint} 
            />
            <Text style={[styles.previewButtonText, isPreviewMode && styles.previewButtonTextActive, { color: isPreviewMode ? '#fff' : theme.tint }]}>
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
                  color={showSettingsDropdown ? '#fff' : theme.tint} 
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
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
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
            <View style={styles.themeSection}>
              <Text style={[styles.themeLabel, { color: theme.textMuted }]}>Theme</Text>
              <View style={styles.themePillRow}>
                {([
                  { id: 'light', label: 'Light' },
                  { id: 'dark', label: 'Dark' },
                  { id: 'system', label: 'System' },
                ] as const).map((option) => {
                  const active = themePreference === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.themePill,
                        { backgroundColor: theme.background, borderColor: theme.outline },
                        active && { backgroundColor: theme.tint + '20', borderColor: theme.tint },
                      ]}
                      onPress={() => setThemePreference(option.id)}
                    >
                      <Text
                        style={[
                          styles.themePillText,
                          { color: theme.text },
                          active && { color: theme.tint },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={[styles.dropdownDivider, { backgroundColor: theme.outline }]} />
            </View>

            {SETTINGS_MENU_ITEMS.filter(item => {
              // Hide admin option for regular users (you can add admin check here)
              if (item.adminOnly) {
                // Add your admin check logic here, for now showing to everyone
                // return user?.email === 'admin@betweener.com' || user?.email?.includes('admin');
                return true; // Show to everyone for testing
              }
              return true;
            }).map((item) => {
              if (item.type === 'divider') {
                return <View key={item.id} style={styles.dropdownDivider} />;
              }
              
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.dropdownItem,
                        { backgroundColor: theme.background },
                        item.id === 'logout' && { backgroundColor: theme.tint + '15' }
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
                      { color: theme.text },
                      item.id === 'logout' && { color: theme.tint }
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

      <Modal
        visible={showNotificationsModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.notificationModalBackdrop}>
          <View style={[styles.notificationModalCard, { backgroundColor: theme.background, borderColor: theme.outline }]}>
            <View style={styles.notificationModalHeader}>
              <Text style={[styles.notificationModalTitle, { color: theme.text }]}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotificationsModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.notificationModalContent}>
              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Core</Text>
                <NotificationToggle
                  label="Messages"
                  value={notificationPrefs.messages}
                  onValueChange={(val) => updateNotificationPref('messages', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Message reactions"
                  value={notificationPrefs.message_reactions}
                  onValueChange={(val) => updateNotificationPref('message_reactions', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Reactions"
                  value={notificationPrefs.reactions}
                  onValueChange={(val) => updateNotificationPref('reactions', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Likes"
                  value={notificationPrefs.likes}
                  onValueChange={(val) => updateNotificationPref('likes', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Superlikes"
                  value={notificationPrefs.superlikes}
                  onValueChange={(val) => updateNotificationPref('superlikes', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Matches"
                  value={notificationPrefs.matches}
                  onValueChange={(val) => updateNotificationPref('matches', val)}
                  theme={theme}
                />
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Control</Text>
                <NotificationToggle
                  label="Push notifications"
                  value={notificationPrefs.push_enabled}
                  onValueChange={(val) => updateNotificationPref('push_enabled', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="In-app notifications"
                  value={notificationPrefs.inapp_enabled}
                  onValueChange={(val) => updateNotificationPref('inapp_enabled', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Preview message text"
                  value={notificationPrefs.preview_text}
                  onValueChange={(val) => updateNotificationPref('preview_text', val)}
                  theme={theme}
                />
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Quiet hours</Text>
                <NotificationToggle
                  label="Silence pushes"
                  value={notificationPrefs.quiet_hours_enabled}
                  onValueChange={(val) =>
                    updateQuietHours(val, notificationPrefs.quiet_hours_start, notificationPrefs.quiet_hours_end)
                  }
                  theme={theme}
                />
                {notificationPrefs.quiet_hours_enabled ? (
                  <>
                    <Text style={[styles.quietHoursHint, { color: theme.textMuted }]}>
                      {`Window: ${quietHoursLabel(notificationPrefs.quiet_hours_start)}-${quietHoursLabel(notificationPrefs.quiet_hours_end)}`}
                    </Text>
                    {quietHoursPreview ? (
                      <Text style={[styles.quietHoursHint, { color: theme.textMuted }]}>
                        {quietHoursPreview}
                      </Text>
                    ) : null}
                    <View style={styles.quietHoursPills}>
                      {QUIET_HOURS_PRESETS.map((preset) => {
                        const active = activeQuietPreset?.id === preset.id;
                        return (
                          <TouchableOpacity
                            key={preset.id}
                            style={[
                              styles.quietHoursPill,
                              { backgroundColor: theme.background, borderColor: theme.outline },
                              active && { backgroundColor: theme.tint, borderColor: theme.tint },
                            ]}
                            onPress={() => updateQuietHours(true, preset.start, preset.end)}
                          >
                            <Text
                              style={[
                                styles.quietHoursPillText,
                                { color: theme.text },
                                active && { color: '#fff' },
                              ]}
                            >
                              {preset.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.quietHoursCustomRow}>
                      <TouchableOpacity
                        style={[
                          styles.quietHoursInput,
                          { borderColor: theme.outline, backgroundColor: theme.background },
                        ]}
                        onPress={() => setShowStartPicker(true)}
                      >
                        <Text style={[styles.quietHoursInputText, { color: theme.text }]}>
                          {quietHoursLabel(notificationPrefs.quiet_hours_start)}
                        </Text>
                      </TouchableOpacity>
                      <Text style={[styles.quietHoursDash, { color: theme.textMuted }]}>to</Text>
                      <TouchableOpacity
                        style={[
                          styles.quietHoursInput,
                          { borderColor: theme.outline, backgroundColor: theme.background },
                        ]}
                        onPress={() => setShowEndPicker(true)}
                      >
                        <Text style={[styles.quietHoursInputText, { color: theme.text }]}>
                          {quietHoursLabel(notificationPrefs.quiet_hours_end)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {showStartPicker ? (
                      <DateTimePicker
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        value={timeStringToDate(notificationPrefs.quiet_hours_start)}
                        onChange={handleStartChange}
                      />
                    ) : null}
                    {showEndPicker ? (
                      <DateTimePicker
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        value={timeStringToDate(notificationPrefs.quiet_hours_end)}
                        onChange={handleEndChange}
                      />
                    ) : null}
                  </>
                ) : null}
              </View>

              <View style={styles.notificationSection}>
                <Text style={[styles.notificationSectionTitle, { color: theme.text }]}>Optional</Text>
                <NotificationToggle
                  label="Moments"
                  value={notificationPrefs.moments}
                  onValueChange={(val) => updateNotificationPref('moments', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Verification updates"
                  value={notificationPrefs.verification}
                  onValueChange={(val) => updateNotificationPref('verification', val)}
                  theme={theme}
                />
                <NotificationToggle
                  label="Announcements"
                  value={notificationPrefs.announcements}
                  onValueChange={(val) => updateNotificationPref('announcements', val)}
                  theme={theme}
                />
              </View>

              {!notificationPrefsLoaded ? (
                <Text style={[styles.notificationLoading, { color: theme.textMuted }]}>Loading preferences...</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <View style={[styles.previewBanner, { backgroundColor: theme.tint + '15', borderBottomColor: theme.outline }]}>
          <MaterialCommunityIcons name="eye" size={16} color={theme.tint} />
          <View style={styles.previewBannerContent}>
            <Text style={styles.previewBannerText}>
              This is how others see your profile
            </Text>
            <TouchableOpacity style={styles.fullPreviewButton} onPress={openFullPreview}>
              <Text style={styles.fullPreviewButtonText}>View Full Preview</Text>
              <MaterialCommunityIcons name="arrow-right" size={14} color={theme.tint} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Animated.ScrollView
        style={[styles.scrollView, { backgroundColor: theme.background }]}
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
        <View style={[styles.profileHeader, { backgroundColor: theme.backgroundSubtle }]}> 
          <View style={styles.avatarContainer}>
            <Image
              source={{
                uri: profile?.avatar_url || 'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face'
              }}
              style={[styles.avatar, { borderColor: theme.background }]}
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
          
          <Text style={[styles.profileName, { color: theme.text }]}> {`${profile?.full_name || 'Your Name'}, ${profile?.age || 25}`}</Text>

          
          <View style={styles.locationContainer}>
            <MaterialCommunityIcons name="map-marker" size={16} color={theme.tint} />
            <Text style={[styles.locationText, { color: theme.textMuted }]}>
              {profile?.region || 'Accra'}, Ghana
            </Text>
          </View>
          
          <Text style={[styles.bio, { color: theme.text }]}> 
            {profile?.bio || 'Your bio will appear here...'}
          </Text>

          {/* Profile Details */}
          <View style={styles.profileDetails}>
            {/* Age and Height Row */}
            <View style={styles.detailRow}>
              {profile?.age && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="cake-variant" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{profile?.age ? `${profile.age} years old` : "Age not set"}</Text>
                </View>
              )}
              {(profile as any)?.height && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="human-male-height" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Height: {(profile as any).height}</Text>
                </View>
              )}
            </View>

            {(profile as any)?.kids && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="baby-face-outline" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Kids: {(profile as any).kids}</Text>
                </View>
              </View>
            )}

            {(profile as any)?.family_plans && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="home-heart" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Family Plans: {(profile as any).family_plans}</Text>
                </View>
              </View>
            )}

            {/* Occupation */}
            {(profile as any)?.occupation && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="briefcase" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).occupation}</Text>
                </View>
              </View>
            )}

            {/* Education */}
            {(profile as any)?.education && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="school" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).education}</Text>
                </View>
              </View>
            )}

            {/* Looking For */}
            {(profile as any)?.looking_for && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="heart-outline" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Looking for {(profile as any).looking_for}</Text>
                </View>
              </View>
            )}

            {/* DIASPORA: Location Information */}
            {(profile as any)?.current_country && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="map-marker" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>
                    {`Currently in ${(profile as any).current_country || 'Unknown'}${(profile as any).current_country === 'Ghana' ? ' 🇬🇭' : ''}`}
                  </Text>
                </View>
              </View>
            )}

            {/* Diaspora Status with Verification */}
            {(profile as any)?.diaspora_status && (profile as any).diaspora_status !== 'LOCAL' && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons 
                    name={(profile as any).diaspora_status === 'DIASPORA' ? 'airplane' : 'calendar-clock'} 
                    size={16} 
                    color={theme.tint} 
                  />
                  <Text style={[styles.detailText, { color: theme.text }]}>
                    {(profile as any).diaspora_status === 'DIASPORA' ? '🌍 Ghanaian abroad' : '✈️ Visiting Ghana'}
                  </Text>
                  {!verificationLoading && (
                    <VerificationBadge 
                      level={(profile as any)?.verification_level || 0}
                      size="small"
                      onPress={() => setIsVerificationModalVisible(true)}
                      style={{ marginLeft: 8 }}
                      rejectionStatus={verificationStatus?.hasRejection ? {
                        isRejected: true,
                        rejectionReason: verificationStatus.rejectionReason || undefined,
                        canResubmit: verificationStatus.canResubmit || true,
                      } : undefined}
                    />
                  )}
                </View>
              </View>
            )}

            {/* Years in Diaspora */}
            {(profile as any)?.years_in_diaspora && (profile as any).years_in_diaspora > 0 && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="calendar" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{profile?.years_in_diaspora ? `${profile.years_in_diaspora} years abroad` : "New diaspora member"}</Text>
                </View>
              </View>
            )}

            {/* Long Distance Preference */}
            {(profile as any)?.willing_long_distance && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="earth" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Open to long-distance connections</Text>
                </View>
              </View>
            )}

            {/* Future Ghana Plans */}
            {(profile as any)?.future_ghana_plans && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="compass" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).future_ghana_plans}</Text>
                </View>
              </View>
            )}

            {/* HIGH PRIORITY: Lifestyle Fields */}
            {(profile as any)?.exercise_frequency && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="dumbbell" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Exercises {(profile as any).exercise_frequency}</Text>
                </View>
              </View>
            )}

            {/* Smoking and Drinking Row */}
            <View style={styles.detailRow}>
              {(profile as any)?.smoking && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="smoking-off" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Smoking: {(profile as any).smoking}</Text>
                </View>
              )}
              {(profile as any)?.drinking && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="glass-cocktail" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Drinking: {(profile as any).drinking}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Family Fields */}
            {/* Children Row */}
            <View style={styles.detailRow}>
              {(profile as any)?.has_children && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="baby" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Children: {(profile as any).has_children}</Text>
                </View>
              )}
              {(profile as any)?.wants_children && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="heart-plus" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Wants: {(profile as any).wants_children}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Personality Fields */}
            {(profile as any)?.personality_type && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="account-circle" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).personality_type}</Text>
                </View>
              </View>
            )}

            {(profile as any)?.love_language && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="heart-multiple" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Love Language: {(profile as any).love_language}</Text>
                </View>
              </View>
            )}

            {/* HIGH PRIORITY: Living Situation Fields */}
            {/* Living and Pets Row */}
            <View style={styles.detailRow}>
              {(profile as any)?.living_situation && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="home" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).living_situation}</Text>
                </View>
              )}
              {(profile as any)?.pets && (
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="paw" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{(profile as any).pets}</Text>
                </View>
              )}
            </View>

            {/* HIGH PRIORITY: Languages */}
            {(profile as any)?.languages_spoken && (profile as any).languages_spoken.length > 0 && (
              <View style={styles.detailRow}>
                <View style={[styles.detailItem, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <MaterialCommunityIcons name="translate" size={16} color={theme.tint} />
                  <Text style={[styles.detailText, { color: theme.text }]}>
                    {`Languages: ${(profile as any).languages_spoken?.join(', ') || 'Not specified'}`}
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
          <View style={[styles.statsContainer, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline, borderWidth: 1, borderRadius: 16 }]}> 
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.text }]}>12</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Matches</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.outline }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.text }]}>3</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Chats</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.outline }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.text }]}>89%</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Match Rate</Text>
            </View>
          </View>
        )}

        {/* Photo Gallery Section */}
        <View style={[styles.section, { marginBottom: 0, paddingBottom: 10 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Photos
            </Text>
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
        <View style={[styles.section, { paddingTop: 5 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              About Me
            </Text>
            {!isPreviewMode && (
              <TouchableOpacity 
                style={[styles.editButton, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={theme.tint} />
                <Text style={[styles.editButtonText, { color: theme.tint }]}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            {PROFILE_PROMPTS.map((prompt) => (
              <View
                key={prompt.id}
                style={[
                  styles.promptCard,
                  { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
                ]}
              >
                <Text style={[styles.promptTitle, { color: theme.text }]}>{prompt.title}</Text>
                <View style={styles.promptOptions}>
                  {prompt.responses.map((response, index) => {
                    const selected = selectedPrompts[prompt.id] === index;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.promptOption,
                          { backgroundColor: theme.background, borderColor: theme.outline },
                          selected && { backgroundColor: theme.tint, borderColor: theme.tint },
                          isPreviewMode && styles.promptOptionPreview,
                        ]}
                        onPress={() => handlePromptSelect(prompt.id, index)}
                        disabled={isPreviewMode}
                      >
                        <Text
                          style={[
                            styles.promptOptionText,
                            { color: theme.text },
                            selected && styles.promptOptionTextSelected,
                          ]}
                        >
                          {response}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </Animated.View>
        </View>

        {/* Interests Section */}
        <View style={[styles.section, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline, borderWidth: 0 }]}> 
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Interests
            </Text>
            {!isPreviewMode && (
              <TouchableOpacity 
                style={[styles.editButton, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons name="pencil" size={16} color={theme.tint} />
                <Text style={[styles.editButtonText, { color: theme.tint }]}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.interestsContainer}>
            {loadingInterests ? (
              <Text style={styles.noInterestsText}>Loading interests...</Text>
            ) : userInterests.length > 0 ? (
              userInterests.map((interest: string, index: number) => (
                <View key={index} style={[styles.interestTag, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }] }>
                  <Text style={[styles.interestText, { color: theme.text }]}>{interest}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.noInterestsText, { color: theme.textMuted }]}>No interests added yet. Tap Edit to add your interests!</Text>
            )}
          </View>
        </View>

        {/* Distance Unit Section */}
        <View style={[styles.section, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline, borderWidth: 1 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Distance Unit
            </Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.textMuted }]}>Current</Text>
            <Text style={[styles.settingValue, { color: theme.text }] }>
              {(() => {
                const selected = DISTANCE_UNIT_OPTIONS.find((option) => option.value === distanceUnit);
                if (!selected) return 'Auto (Recommended)';
                return selected.subtitle ? `${selected.label} (${selected.subtitle})` : selected.label;
              })()}
            </Text>
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
      {showEditModal && (
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
      )}

      {/* Diaspora Verification Modal */}
      {isVerificationModalVisible && (
        <DiasporaVerification
          visible={isVerificationModalVisible}
          onClose={() => {
            setIsVerificationModalVisible(false);
            refreshStatus();
          }}
          profile={profile}
          onVerificationUpdate={(level) => {
            // Refresh profile to show updated verification level
            refreshProfile();
            refreshStatus();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function NotificationToggle({
  label,
  value,
  onValueChange,
  theme,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  theme: typeof Colors.light;
}) {
  return (
    <View style={styles.notificationToggleRow}>
      <Text style={[styles.notificationToggleLabel, { color: theme.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.outline, true: theme.tint }}
        thumbColor={Colors.light.background}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'PlayfairDisplay_700Bold',
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
    backgroundColor: 'transparent',
    borderWidth: 1,
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
    backgroundColor: 'transparent',
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
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
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
    fontFamily: 'PlayfairDisplay_700Bold',
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
    fontFamily: 'PlayfairDisplay_600SemiBold',
    color: Colors.light.tint,
  },
  
  // Stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
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
    backgroundColor: 'transparent',
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
    fontFamily: 'PlayfairDisplay_600SemiBold',
    color: '#111827',
  },
  
  // Buttons
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
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
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'transparent',
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
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
  
  // Distance Unit
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  settingLabel: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: '#6b7280',
  },
  settingValue: {
    fontSize: 16,
    fontFamily: 'Manrope_600SemiBold',
    color: '#111827',
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
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    zIndex: 998,
  },
  backdropTouchable: {
    flex: 1,
  },
  settingsDropdown: {
    position: 'absolute',
    top: 80,
    right: 20,
    backgroundColor: 'transparent',
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
    borderColor: 'transparent',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
    color: '#374151',
    flex: 1,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 4,
    marginHorizontal: 12,
  },
  themeSection: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  themeLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  themePillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  themePillText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    color: '#111827',
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
    backgroundColor: 'transparent',
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
  closeAdminButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
    zIndex: 1000,
  },
  notificationModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  notificationModalCard: {
    borderWidth: 1,
    borderRadius: 18,
    maxHeight: '80%',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  notificationModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  notificationModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  notificationModalContent: {
    paddingBottom: 10,
  },
  notificationSection: {
    marginBottom: 16,
  },
  notificationSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  notificationToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  notificationToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  notificationLoading: {
    fontSize: 12,
    marginTop: 8,
  },
  quietHoursHint: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  quietHoursPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quietHoursPill: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  quietHoursPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  quietHoursCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  quietHoursInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietHoursInputText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  quietHoursDash: {
    fontSize: 12,
    fontWeight: '600',
  },
});
