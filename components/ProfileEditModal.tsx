import { DiasporaVerification } from '@/components/DiasporaVerification';
import { VerificationBadge } from '@/components/VerificationBadge';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Predefined options for profile fields
const HEIGHT_OPTIONS = [
  "4'10\"", "4'11\"", "5'0\"", "5'1\"", "5'2\"", "5'3\"", "5'4\"", "5'5\"", 
  "5'6\"", "5'7\"", "5'8\"", "5'9\"", "5'10\"", "5'11\"", "6'0\"", "6'1\"", 
  "6'2\"", "6'3\"", "6'4\"", "6'5\"", "6'6\"", "Other"
];

const OCCUPATION_OPTIONS = [
  "Student", "Software Engineer", "Teacher", "Doctor", "Lawyer", "Nurse", 
  "Business Owner", "Marketing", "Sales", "Designer", "Accountant", "Engineer",
  "Consultant", "Manager", "Artist", "Writer", "Photographer", "Chef",
  "Fitness Trainer", "Real Estate", "Healthcare", "Finance", "Other"
];

const EDUCATION_OPTIONS = [
  "High School", "Some College", "Bachelor's Degree", "Master's Degree", 
  "PhD", "Trade School", "University of Ghana", "KNUST", "UCC", "UPSA",
  "Ashesi University", "Central University", "Valley View University", "Other"
];

const LOOKING_FOR_OPTIONS = [
  "Long-term relationship", "Short-term dating", "Friendship", "Networking",
  "Marriage", "Casual dating", "Something serious", "Let's see what happens",
  "Life partner", "Other"
];

// HIGH PRIORITY: Lifestyle options
const EXERCISE_FREQUENCY_OPTIONS = [
  "Daily", "Weekly", "Occasionally", "Never", "Other"
];

const SMOKING_OPTIONS = [
  "Never", "Socially", "Regularly", "Trying to Quit", "Other"
];

const DRINKING_OPTIONS = [
  "Never", "Socially", "Regularly", "Occasionally", "Other"
];

// HIGH PRIORITY: Family options
const HAS_CHILDREN_OPTIONS = [
  "No", "Yes - living with me", "Yes - not living with me", "Other"
];

const WANTS_CHILDREN_OPTIONS = [
  "Definitely", "Probably", "Not Sure", "Probably Not", "Never", "Other"
];

// HIGH PRIORITY: Personality options
const PERSONALITY_TYPE_OPTIONS = [
  "Introvert", "Extrovert", "Ambivert", "Not Sure", "Other"
];

const LOVE_LANGUAGE_OPTIONS = [
  "Words of Affirmation", "Quality Time", "Physical Touch", "Acts of Service", "Gifts", "Other"
];

// HIGH PRIORITY: Living situation options
const LIVING_SITUATION_OPTIONS = [
  "Own Place", "Rent Alone", "Roommates", "With Family", "Student Housing", "Other"
];

const PETS_OPTIONS = [
  "No Pets", "Dog Lover", "Cat Lover", "Other Pets", "Allergic to Pets", "Other"
];

// HIGH PRIORITY: Ghana-focused languages
const LANGUAGES_OPTIONS = [
  "English", "Twi", "Ga", "Ewe", "Fante", "Hausa", "Dagbani", "Gonja", "Nzema", "Kasem", "Dagaare", "French", "Arabic", "Other"
];

// DIASPORA: Country options (focusing on major Ghanaian diaspora locations)
const COUNTRY_OPTIONS = [
  "Ghana", "United States", "United Kingdom", "Canada", "Germany", "Netherlands", 
  "Italy", "Australia", "South Africa", "Nigeria", "Ivory Coast", "Burkina Faso", 
  "France", "Spain", "Belgium", "Sweden", "Norway", "Dubai", "Other"
];

const DIASPORA_STATUS_OPTIONS = [
  "LOCAL", "DIASPORA", "VISITING"
];

const FUTURE_GHANA_PLANS_OPTIONS = [
  "Planning to return permanently", "Visit annually", "Visit occasionally", 
  "Uncertain about return", "Staying abroad permanently", "Other"
];

interface ProfileEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (updatedProfile: any) => void;
}

const InlineVideoPreview = ({ uri, shouldPlay }: { uri: string; shouldPlay: boolean }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    if (shouldPlay) {
      try { p.play(); } catch {}
    }
  });

  useEffect(() => {
    if (shouldPlay) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [player, shouldPlay]);

  return <VideoView style={styles.videoPreview} player={player} contentFit="cover" nativeControls={false} />;
};

export default function ProfileEditModal({ visible, onClose, onSave }: ProfileEditModalProps) {
  const { user, profile, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  
  // Original dropdown states
  const [showHeightPicker, setShowHeightPicker] = useState(false);
  const [showOccupationPicker, setShowOccupationPicker] = useState(false);
  const [showEducationPicker, setShowEducationPicker] = useState(false);
  const [showLookingForPicker, setShowLookingForPicker] = useState(false);
  
  // HIGH PRIORITY picker visibility states
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showSmokingPicker, setShowSmokingPicker] = useState(false);
  const [showDrinkingPicker, setShowDrinkingPicker] = useState(false);
  const [showHasChildrenPicker, setShowHasChildrenPicker] = useState(false);
  const [showWantsChildrenPicker, setShowWantsChildrenPicker] = useState(false);
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);
  const [showLoveLanguagePicker, setShowLoveLanguagePicker] = useState(false);
  const [showLivingSituationPicker, setShowLivingSituationPicker] = useState(false);
  const [showPetsPicker, setShowPetsPicker] = useState(false);
  const [showLanguagesPicker, setShowLanguagesPicker] = useState(false);
  
  // DIASPORA picker visibility states (simplified)
  const [showFutureGhanaPlansPicker, setShowFutureGhanaPlansPicker] = useState(false);
  
  // Original custom input states
  const [customHeight, setCustomHeight] = useState('');
  const [customOccupation, setCustomOccupation] = useState('');
  const [customEducation, setCustomEducation] = useState('');
  const [customLookingFor, setCustomLookingFor] = useState('');
  
  // HIGH PRIORITY custom input states
  const [customExercise, setCustomExercise] = useState('');
  const [customSmoking, setCustomSmoking] = useState('');
  const [customDrinking, setCustomDrinking] = useState('');
  const [customHasChildren, setCustomHasChildren] = useState('');
  const [customWantsChildren, setCustomWantsChildren] = useState('');
  const [customPersonality, setCustomPersonality] = useState('');
  const [customLoveLanguage, setCustomLoveLanguage] = useState('');
  const [customLivingSituation, setCustomLivingSituation] = useState('');
  const [customPets, setCustomPets] = useState('');
  const [customLanguage, setCustomLanguage] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);
  
  // DIASPORA custom input states (simplified)
  const [customFutureGhanaPlans, setCustomFutureGhanaPlans] = useState('');
  
  // Interests states
  const [availableInterests, setAvailableInterests] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [showInterestsPicker, setShowInterestsPicker] = useState(false);
  const [loadingInterests, setLoadingInterests] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    age: '',
    region: '',
    occupation: '',
    education: '',
    height: '',
    looking_for: '',
    avatar_url: '',
    photos: [] as string[],
    profile_video: '',
    // HIGH PRIORITY fields
    exercise_frequency: '',
    smoking: '',
    drinking: '',
    has_children: '',
    wants_children: '',
    personality_type: '',
    love_language: '',
    living_situation: '',
    pets: '',
    languages_spoken: [] as string[],
    // DIASPORA fields (read-only status, editable details only)
    willing_long_distance: false,
    years_in_diaspora: 0,
    last_ghana_visit: '',
    future_ghana_plans: '',
  });

  // Load current profile data when modal opens
  useEffect(() => {
    if (visible && profile) {
      setFormData({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        age: profile.age?.toString() || '',
        region: profile.region || '',
        occupation: (profile as any).occupation || '',
        education: (profile as any).education || '',
        height: (profile as any).height || '',
        looking_for: (profile as any).looking_for || '',
        avatar_url: profile.avatar_url || '',
        photos: (profile as any).photos || [],
        profile_video: (profile as any).profile_video || '',
        // HIGH PRIORITY fields
        exercise_frequency: (profile as any).exercise_frequency || '',
        smoking: (profile as any).smoking || '',
        drinking: (profile as any).drinking || '',
        has_children: (profile as any).has_children || '',
        wants_children: (profile as any).wants_children || '',
        personality_type: (profile as any).personality_type || '',
        love_language: (profile as any).love_language || '',
        living_situation: (profile as any).living_situation || '',
        pets: (profile as any).pets || '',
        languages_spoken: (profile as any).languages_spoken || [],
        // DIASPORA fields (preserve existing, don't override status)
        willing_long_distance: (profile as any).willing_long_distance || false,
        years_in_diaspora: (profile as any).years_in_diaspora || 0,
        last_ghana_visit: (profile as any).last_ghana_visit || '',
        future_ghana_plans: (profile as any).future_ghana_plans || '',
      });
      // Set selected languages for multi-select
      setSelectedLanguages((profile as any).languages_spoken || []);
    }
    
    // Load available interests and user's current interests when modal opens
    if (visible) {
      fetchAvailableInterests();
      fetchUserInterests();
    }
  }, [visible, profile]);

  useEffect(() => {
    let mounted = true;
    const resolvePreview = async () => {
      if (!visible) {
        if (mounted) setVideoPreviewUrl(null);
        return;
      }
      const path = formData.profile_video;
      if (!path) {
        if (mounted) setVideoPreviewUrl(null);
        return;
      }
      if (path.startsWith('http')) {
        if (mounted) setVideoPreviewUrl(path);
        return;
      }
      const { data, error } = await supabase.storage.from('profile-videos').createSignedUrl(path, 3600);
      if (!mounted) return;
      if (error || !data?.signedUrl) {
        setVideoPreviewUrl(null);
        return;
      }
      setVideoPreviewUrl(data.signedUrl);
    };
    void resolvePreview();
    return () => {
      mounted = false;
    };
  }, [formData.profile_video, visible]);

  const handleInputChange = (field: string, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Load user's current interests from profile_interests table
  const fetchUserInterests = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profile_interests')
        .select(`
          interests (
            name
          )
        `)
        .eq('profile_id', user.id);
      
      if (error) throw error;
      
      const userInterests = data?.map(item => (item as any).interests.name) || [];
      setSelectedInterests(userInterests);
    } catch (error) {
      console.error('Error fetching user interests:', error);
    }
  };

  // Save user interests to profile_interests table
  const saveUserInterests = async (interests: string[]) => {
    if (!user?.id) return;
    
    try {
      // First, delete existing interests for this user
      await supabase
        .from('profile_interests')
        .delete()
        .eq('profile_id', user.id);
      
      // Then insert new interests
      if (interests.length > 0) {
        // Get interest IDs
        const { data: interestData, error: interestError } = await supabase
          .from('interests')
          .select('id, name')
          .in('name', interests);
        
        if (interestError) throw interestError;
        
        // Insert profile_interests relationships
        const profileInterests = interestData?.map(interest => ({
          profile_id: user.id,
          interest_id: interest.id
        })) || [];
        
        if (profileInterests.length > 0) {
          const { error: insertError } = await supabase
            .from('profile_interests')
            .insert(profileInterests);
          
          if (insertError) throw insertError;
        }
      }
    } catch (error) {
      console.error('Error saving user interests:', error);
      throw error;
    }
  };

  // Fetch available interests from database
  const fetchAvailableInterests = async () => {
    try {
      setLoadingInterests(true);
      const { data, error } = await supabase
        .from('interests')
        .select('name')
        .order('name');
      
      if (error) throw error;
      
      const interestNames = data?.map(item => item.name) || [];
      setAvailableInterests(interestNames);
    } catch (error) {
      console.error('Error fetching interests:', error);
      // Fallback to default interests
      setAvailableInterests([
        'Music', 'Travel', 'Food', 'Dancing', 'Movies', 'Art',
        'Reading', 'Sports', 'Gaming', 'Cooking', 'Photography', 'Fitness',
        'Nature', 'Technology', 'Fashion', 'Writing', 'Singing', 'Comedy',
        'Business', 'Volunteering', 'Learning', 'Socializing', 'Adventure', 'Relaxing'
      ]);
    } finally {
      setLoadingInterests(false);
    }
  };

  const FieldPicker = ({ 
    title, 
    options, 
    visible, 
    onClose, 
    onSelect, 
    currentValue 
  }: {
    title: string;
    options: string[];
    visible: boolean;
    onClose: () => void;
    onSelect: (value: string) => void;
    currentValue: string;
  }) => (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.pickerContainer}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.pickerCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>{title}</Text>
          <View style={{ width: 60 }} />
        </View>
        
        <FlatList
          data={options}
          keyExtractor={(item) => item}
          style={styles.pickerList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.pickerItem,
                currentValue === item && styles.pickerItemSelected
              ]}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
            >
              <Text style={[
                styles.pickerItemText,
                currentValue === item && styles.pickerItemTextSelected
              ]}>
                {item}
              </Text>
              {currentValue === item && (
                <MaterialCommunityIcons name="check" size={20} color={Colors.light.tint} />
              )}
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );

  const pickImage = async (isAvatar: boolean = false) => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to upload photos.');
        return;
      }

      // Show action sheet for camera or gallery
      Alert.alert(
        'Select Photo',
        'Choose how you want to select a photo',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Camera', onPress: () => openCamera(isAvatar) },
          { text: 'Gallery', onPress: () => openGallery(isAvatar) },
        ]
      );
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request permissions');
    }
  };

  const openCamera = async (isAvatar: boolean) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: isAvatar ? [1, 1] : [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await handleImageUpload(result.assets[0].uri, isAvatar);
      }
    } catch (error) {
      console.error('Error opening camera:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const openGallery = async (isAvatar: boolean) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: isAvatar ? [1, 1] : [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await handleImageUpload(result.assets[0].uri, isAvatar);
      }
    } catch (error) {
      console.error('Error opening gallery:', error);
      Alert.alert('Error', 'Failed to open gallery');
    }
  };

  const handleImageUpload = async (uri: string, isAvatar: boolean) => {
    try {
      setUploading(true);

      if (!user?.id) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Get file extension and create file name
      const fileExtension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const timestamp = Date.now();
      const fileName = `${timestamp}.${fileExtension}`;
      const filePath = `${user.id}/${fileName}`;

      // For React Native, we need to read the file properly
      const response = await fetch(uri);
      const blob = await response.arrayBuffer();
      const uint8Array = new Uint8Array(blob);

      // Upload using the Uint8Array which Supabase accepts
      const { data, error } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, uint8Array, {
          contentType: `image/${fileExtension}`,
          upsert: false,
        });

      if (error) {
        console.error('Upload error details:', error);
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);

      if (isAvatar) {
        setFormData(prev => ({
          ...prev,
          avatar_url: publicUrl
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, publicUrl]
        }));
      }

      Alert.alert('Success', 'Photo uploaded successfully!');
    } catch (error) {
      console.error('Error uploading image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
      Alert.alert('Error', `Upload failed: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  const openVideoLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll permissions to upload videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 30,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      await handleVideoUpload(result.assets[0].uri);
    }
  };

  const openVideoCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera permissions to record a video.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 30,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      await handleVideoUpload(result.assets[0].uri);
    }
  };

  const pickProfileVideo = async () => {
    try {
      Alert.alert(
        'Select Video',
        'Choose how you want to add a profile video',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Camera', onPress: () => void openVideoCamera() },
          { text: 'Library', onPress: () => void openVideoLibrary() },
        ]
      );
    } catch (error) {
      console.error('Error picking video:', error);
      Alert.alert('Error', 'Failed to pick video');
    }
  };

  const handleVideoUpload = async (uri: string) => {
    try {
      setVideoUploading(true);

      if (!user?.id) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      const fileExtension = uri.split('.').pop()?.toLowerCase() || 'mp4';
      const timestamp = Date.now();
      const fileName = `profile-video-${timestamp}.${fileExtension}`;
      const filePath = `${user.id}/${fileName}`;
      const contentType = fileExtension === 'mov' ? 'video/quicktime' : 'video/mp4';

      const response = await fetch(uri);
      const blob = await response.arrayBuffer();
      const uint8Array = new Uint8Array(blob);

      const { error } = await supabase.storage
        .from('profile-videos')
        .upload(filePath, uint8Array, {
          contentType,
          upsert: false,
        });

      if (error) {
        console.error('Video upload error details:', error);
        throw error;
      }

      const previousPath = formData.profile_video;
      setFormData(prev => ({
        ...prev,
        profile_video: filePath,
      }));

      if (previousPath && !previousPath.startsWith('http') && previousPath !== filePath) {
        try {
          await supabase.storage.from('profile-videos').remove([previousPath]);
        } catch (removeError) {
          console.log('Failed to delete previous profile video', removeError);
        }
      }

      Alert.alert('Success', 'Profile video uploaded. Tap Save to apply.');
    } catch (error) {
      console.error('Error uploading video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload video';
      Alert.alert('Error', `Upload failed: ${errorMessage}`);
    } finally {
      setVideoUploading(false);
    }
  };

  const removeProfileVideo = () => {
    Alert.alert(
      'Remove Video',
      'Are you sure you want to remove your profile video?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setFormData(prev => ({
              ...prev,
              profile_video: '',
            }));
          },
        },
      ],
    );
  };

  const removePhoto = (index: number) => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setFormData(prev => ({
              ...prev,
              photos: prev.photos.filter((_, i) => i !== index)
            }));
          }
        }
      ]
    );
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      // Validate required fields
      if (!formData.full_name.trim()) {
        Alert.alert('Error', 'Please enter your name');
        return;
      }

      if (!formData.bio.trim()) {
        Alert.alert('Error', 'Please add a bio');
        return;
      }

      // Prepare update data (preserve required fields to avoid NOT NULL constraint violations)
      const updateData: any = {
        full_name: formData.full_name.trim(),
        bio: formData.bio.trim(),
        avatar_url: formData.avatar_url,
        photos: formData.photos,
        profile_video: formData.profile_video && formData.profile_video.trim() ? formData.profile_video.trim() : null,
        // Preserve existing required fields to avoid null constraint violations
        gender: profile?.gender || 'OTHER',
        age: profile?.age || 18,
        region: profile?.region || '',
        tribe: profile?.tribe || '',
        religion: profile?.religion || 'OTHER',
        min_age_interest: profile?.min_age_interest || 18,
        max_age_interest: profile?.max_age_interest || 35,
      };

      // Only include optional fields if they have values
      if (formData.age && formData.age.trim()) {
        updateData.age = parseInt(formData.age);
      }
      if (formData.region && formData.region.trim()) {
        updateData.region = formData.region.trim();
      }
      if (formData.occupation && formData.occupation.trim()) {
        updateData.occupation = formData.occupation.trim();
      }
      if (formData.education && formData.education.trim()) {
        updateData.education = formData.education.trim();
      }
      if (formData.height && formData.height.trim()) {
        updateData.height = formData.height.trim();
      }
      if (formData.looking_for && formData.looking_for.trim()) {
        updateData.looking_for = formData.looking_for.trim();
      }
      
      // HIGH PRIORITY fields
      if (formData.exercise_frequency && formData.exercise_frequency.trim()) {
        updateData.exercise_frequency = formData.exercise_frequency.trim();
      }
      if (formData.smoking && formData.smoking.trim()) {
        updateData.smoking = formData.smoking.trim();
      }
      if (formData.drinking && formData.drinking.trim()) {
        updateData.drinking = formData.drinking.trim();
      }
      if (formData.has_children && formData.has_children.trim()) {
        updateData.has_children = formData.has_children.trim();
      }
      if (formData.wants_children && formData.wants_children.trim()) {
        updateData.wants_children = formData.wants_children.trim();
      }
      if (formData.personality_type && formData.personality_type.trim()) {
        updateData.personality_type = formData.personality_type.trim();
      }
      if (formData.love_language && formData.love_language.trim()) {
        updateData.love_language = formData.love_language.trim();
      }
      if (formData.living_situation && formData.living_situation.trim()) {
        updateData.living_situation = formData.living_situation.trim();
      }
      if (formData.pets && formData.pets.trim()) {
        updateData.pets = formData.pets.trim();
      }
      if (formData.languages_spoken && formData.languages_spoken.length > 0) {
        updateData.languages_spoken = formData.languages_spoken;
      }
      
      // DIASPORA fields (enabled after migration)
      updateData.willing_long_distance = formData.willing_long_distance;
      if (formData.years_in_diaspora > 0) {
        updateData.years_in_diaspora = formData.years_in_diaspora;
      }
      if (formData.last_ghana_visit && formData.last_ghana_visit.trim()) {
        updateData.last_ghana_visit = formData.last_ghana_visit.trim();
      }
      if (formData.future_ghana_plans && formData.future_ghana_plans.trim()) {
        updateData.future_ghana_plans = formData.future_ghana_plans.trim();
      }

      // Update profile using auth context (this will refresh the UI automatically)
      console.log('Profile update data:', updateData);
      const { error } = await updateProfile(updateData);

      if (error) {
        console.error('Profile update error:', error);
        throw error;
      }

      // Save interests separately through profile_interests table
      if (selectedInterests.length > 0) {
        await saveUserInterests(selectedInterests);
      }

      Alert.alert('Success', 'Profile updated successfully!');
      onSave(updateData);
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.light.tint} />
            ) : (
              <Text style={styles.saveButton}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Avatar Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Photo</Text>
            <View style={styles.avatarContainer}>
              <Image
                source={{
                  uri: formData.avatar_url || 'https://images.unsplash.com/photo-1494790108755-2616c6ad7b85?w=400&h=600&fit=crop&crop=face'
                }}
                style={styles.avatar}
              />
              <TouchableOpacity
                style={styles.editAvatarButton}
                onPress={() => pickImage(true)}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="camera" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Basic Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.textInput}
                value={formData.full_name}
                onChangeText={(text) => handleInputChange('full_name', text)}
                placeholder="Enter your full name"
                maxLength={50}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Bio *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={formData.bio}
                onChangeText={(text) => handleInputChange('bio', text)}
                placeholder="Tell us about yourself..."
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.characterCount}>{formData.bio.length}/500</Text>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Age</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.age}
                  onChangeText={(text) => handleInputChange('age', text)}
                  placeholder="25"
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Height</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowHeightPicker(true)}
                >
                  <Text style={[
                    formData.height ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.height || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.height === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customHeight}
                    onChangeText={setCustomHeight}
                    placeholder="Enter your height"
                    maxLength={10}
                    onBlur={() => {
                      if (customHeight.trim()) {
                        handleInputChange('height', customHeight.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput
                style={styles.textInput}
                value={formData.region}
                onChangeText={(text) => handleInputChange('region', text)}
                placeholder="Accra, Ghana"
                maxLength={100}
              />
            </View>
          </View>

          {/* Professional Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Occupation</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowOccupationPicker(true)}
              >
                <Text style={[
                  formData.occupation ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {formData.occupation || 'Select your occupation'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
              </TouchableOpacity>
              
              {formData.occupation === 'Other' && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customOccupation}
                  onChangeText={setCustomOccupation}
                  placeholder="Enter your occupation"
                  maxLength={100}
                  onBlur={() => {
                    if (customOccupation.trim()) {
                      handleInputChange('occupation', customOccupation.trim());
                    }
                  }}
                />
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Education</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowEducationPicker(true)}
              >
                <Text style={[
                  formData.education ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {formData.education || 'Select your education'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
              </TouchableOpacity>
              
              {formData.education === 'Other' && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customEducation}
                  onChangeText={setCustomEducation}
                  placeholder="Enter your education"
                  maxLength={100}
                  onBlur={() => {
                    if (customEducation.trim()) {
                      handleInputChange('education', customEducation.trim());
                    }
                  }}
                />
              )}
            </View>
          </View>

          {/* Dating Preferences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dating Preferences</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Looking For</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowLookingForPicker(true)}
              >
                <Text style={[
                  formData.looking_for ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {formData.looking_for || 'What are you looking for?'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
              </TouchableOpacity>
              
              {formData.looking_for === 'Other' && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customLookingFor}
                  onChangeText={setCustomLookingFor}
                  placeholder="What are you looking for?"
                  maxLength={100}
                  onBlur={() => {
                    if (customLookingFor.trim()) {
                      handleInputChange('looking_for', customLookingFor.trim());
                    }
                  }}
                />
              )}
            </View>
          </View>

          {/* Lifestyle */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Lifestyle</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Exercise Frequency</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowExercisePicker(true)}
              >
                <Text style={[
                  formData.exercise_frequency ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {formData.exercise_frequency || 'How often do you exercise?'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
              </TouchableOpacity>
              
              {formData.exercise_frequency === 'Other' && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customExercise}
                  onChangeText={setCustomExercise}
                  placeholder="Enter your exercise frequency"
                  maxLength={50}
                  onBlur={() => {
                    if (customExercise.trim()) {
                      handleInputChange('exercise_frequency', customExercise.trim());
                    }
                  }}
                />
              )}
            </View>

            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Smoking</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowSmokingPicker(true)}
                >
                  <Text style={[
                    formData.smoking ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.smoking || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.smoking === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customSmoking}
                    onChangeText={setCustomSmoking}
                    placeholder="Smoking habits"
                    maxLength={50}
                    onBlur={() => {
                      if (customSmoking.trim()) {
                        handleInputChange('smoking', customSmoking.trim());
                      }
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Drinking</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowDrinkingPicker(true)}
                >
                  <Text style={[
                    formData.drinking ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.drinking || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.drinking === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customDrinking}
                    onChangeText={setCustomDrinking}
                    placeholder="Drinking habits"
                    maxLength={50}
                    onBlur={() => {
                      if (customDrinking.trim()) {
                        handleInputChange('drinking', customDrinking.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Family & Relationship */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Family & Relationship</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Have Children</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowHasChildrenPicker(true)}
                >
                  <Text style={[
                    formData.has_children ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.has_children || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.has_children === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customHasChildren}
                    onChangeText={setCustomHasChildren}
                    placeholder="Children status"
                    maxLength={50}
                    onBlur={() => {
                      if (customHasChildren.trim()) {
                        handleInputChange('has_children', customHasChildren.trim());
                      }
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Want Children</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowWantsChildrenPicker(true)}
                >
                  <Text style={[
                    formData.wants_children ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.wants_children || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.wants_children === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customWantsChildren}
                    onChangeText={setCustomWantsChildren}
                    placeholder="Future children"
                    maxLength={50}
                    onBlur={() => {
                      if (customWantsChildren.trim()) {
                        handleInputChange('wants_children', customWantsChildren.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Personality & Compatibility */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personality & Compatibility</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Personality</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowPersonalityPicker(true)}
                >
                  <Text style={[
                    formData.personality_type ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.personality_type || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.personality_type === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customPersonality}
                    onChangeText={setCustomPersonality}
                    placeholder="Personality type"
                    maxLength={50}
                    onBlur={() => {
                      if (customPersonality.trim()) {
                        handleInputChange('personality_type', customPersonality.trim());
                      }
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Love Language</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowLoveLanguagePicker(true)}
                >
                  <Text style={[
                    formData.love_language ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.love_language || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.love_language === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customLoveLanguage}
                    onChangeText={setCustomLoveLanguage}
                    placeholder="Love language"
                    maxLength={50}
                    onBlur={() => {
                      if (customLoveLanguage.trim()) {
                        handleInputChange('love_language', customLoveLanguage.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Living Situation & Preferences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Living & Preferences</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Living Situation</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowLivingSituationPicker(true)}
                >
                  <Text style={[
                    formData.living_situation ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.living_situation || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.living_situation === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customLivingSituation}
                    onChangeText={setCustomLivingSituation}
                    placeholder="Living situation"
                    maxLength={50}
                    onBlur={() => {
                      if (customLivingSituation.trim()) {
                        handleInputChange('living_situation', customLivingSituation.trim());
                      }
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Pets</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowPetsPicker(true)}
                >
                  <Text style={[
                    formData.pets ? styles.selectButtonText : styles.selectButtonPlaceholder
                  ]}>
                    {formData.pets || 'Select'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                </TouchableOpacity>
                
                {formData.pets === 'Other' && (
                  <TextInput
                    style={[styles.textInput, { marginTop: 8 }]}
                    value={customPets}
                    onChangeText={setCustomPets}
                    placeholder="Pet preference"
                    maxLength={50}
                    onBlur={() => {
                      if (customPets.trim()) {
                        handleInputChange('pets', customPets.trim());
                      }
                    }}
                  />
                )}
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Languages Spoken</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowLanguagesPicker(true)}
              >
                <Text style={[
                  selectedLanguages.length > 0 ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {selectedLanguages.length > 0 
                    ? selectedLanguages.length === 1 
                      ? selectedLanguages[0]
                      : `${selectedLanguages.length} languages selected`
                    : 'Select languages'
                  }
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
              </TouchableOpacity>
              
              {selectedLanguages.includes('Other') && (
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={customLanguage}
                  onChangeText={setCustomLanguage}
                  placeholder="Enter other language"
                  maxLength={50}
                  onBlur={() => {
                    if (customLanguage.trim()) {
                      const updatedLanguages = selectedLanguages.map(lang => 
                        lang === 'Other' ? customLanguage.trim() : lang
                      );
                      setSelectedLanguages(updatedLanguages);
                      handleInputChange('languages_spoken', updatedLanguages);
                    }
                  }}
                />
              )}
            </View>
          </View>

          {/* Interests Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests & Hobbies</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Select Your Interests</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowInterestsPicker(true)}
                disabled={loadingInterests}
              >
                <Text style={[
                  selectedInterests.length > 0 ? styles.selectButtonText : styles.selectButtonPlaceholder
                ]}>
                  {loadingInterests 
                    ? 'Loading interests...'
                    : selectedInterests.length > 0 
                      ? selectedInterests.length === 1 
                        ? selectedInterests[0]
                        : `${selectedInterests.length} interests selected`
                      : 'Choose your interests'
                  }
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {/* Selected Interests Preview */}
            {selectedInterests.length > 0 && (
              <View style={styles.interestsPreview}>
                {selectedInterests.map((interest, index) => (
                  <View key={index} style={styles.interestTag}>
                    <Text style={styles.interestText}>{interest}</Text>
                    <TouchableOpacity
                      style={styles.removeInterestButton}
                      onPress={() => {
                        const updated = selectedInterests.filter(i => i !== interest);
                        setSelectedInterests(updated);
                      }}
                    >
                      <MaterialCommunityIcons name="close" size={12} color="#666" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* DIASPORA Section - Detail Refinement Only */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location Details</Text>
            
            {/* Show current status (read-only) with verification */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Current Status</Text>
              <View style={styles.statusDisplay}>
                <View style={styles.statusRow}>
                  <Text style={styles.statusText}>
                    {(profile as any)?.diaspora_status === 'LOCAL' ? '🇬🇭 Living in Ghana' :
                     (profile as any)?.diaspora_status === 'DIASPORA' ? '🌍 Ghanaian abroad' :
                     (profile as any)?.diaspora_status === 'VISITING' ? '✈️ Visiting Ghana' : 'Not set'}
                  </Text>
                  {(profile as any)?.diaspora_status === 'DIASPORA' && (
                    <VerificationBadge 
                      level={(profile as any)?.verification_level || 0}
                      size="small"
                      showLabel
                      onPress={() => setIsVerificationModalVisible(true)}
                      style={{ marginLeft: 12 }}
                    />
                  )}
                </View>
                <Text style={styles.statusSubtext}>
                  Set during registration. Contact support to change.
                </Text>
              </View>
            </View>

            {/* Only show diaspora fields if user is abroad */}
            {(profile as any)?.diaspora_status === 'DIASPORA' && (
              <>
                {/* Years in Diaspora */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Years abroad</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formData.years_in_diaspora?.toString() || ''}
                    onChangeText={(text) => {
                      const years = parseInt(text) || 0;
                      setFormData(prev => ({ ...prev, years_in_diaspora: years }));
                    }}
                    placeholder="How many years abroad?"
                    keyboardType="numeric"
                  />
                </View>

                {/* Last Ghana Visit */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Last visit to Ghana</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formData.last_ghana_visit}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, last_ghana_visit: text }))}
                    placeholder="e.g., December 2024"
                  />
                </View>

                {/* Future Ghana Plans */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Future plans with Ghana</Text>
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => setShowFutureGhanaPlansPicker(true)}
                  >
                    <Text style={[
                      formData.future_ghana_plans ? styles.selectButtonText : styles.selectButtonPlaceholder
                    ]}>
                      {formData.future_ghana_plans || 'Your future plans'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Long Distance Preference - Only for diaspora users */}
            {(profile as any)?.diaspora_status === 'DIASPORA' && (
              <View style={styles.inputContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[
                      { 
                        width: 20, 
                        height: 20, 
                        borderRadius: 4, 
                        borderWidth: 2, 
                        borderColor: Colors.light.tint,
                        backgroundColor: formData.willing_long_distance ? Colors.light.tint : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10
                      }
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, willing_long_distance: !prev.willing_long_distance }))}
                  >
                    {formData.willing_long_distance && (
                      <MaterialCommunityIcons name="check" size={16} color="#fff" />
                    )}
                  </TouchableOpacity>
                  <Text style={styles.inputLabel}>Open to long-distance connections</Text>
                </View>
                <Text style={styles.statusSubtext}>
                  Connect with Ghanaians living in Ghana
                </Text>
              </View>
            )}
          </View>

          {/* Profile Video Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Profile Video</Text>
              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={pickProfileVideo}
                disabled={videoUploading}
              >
                <MaterialCommunityIcons
                  name="video-plus"
                  size={16}
                  color={videoUploading ? '#9ca3af' : Colors.light.tint}
                />
                <Text style={[
                  styles.addPhotoText,
                  { color: videoUploading ? '#9ca3af' : Colors.light.tint }
                ]}>
                  Upload Video
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.photoHint}>
              Add a short intro video (max 30s). This appears on your Explore card.
            </Text>

            {formData.profile_video ? (
              <View style={styles.videoRow}>
                <View style={styles.videoThumb}>
                  {videoPreviewUrl ? (
                    <InlineVideoPreview uri={videoPreviewUrl} shouldPlay={visible && !videoUploading} />
                  ) : (
                    <MaterialCommunityIcons name="play-circle" size={26} color="#e2e8f0" />
                  )}
                </View>
                <View style={styles.videoMeta}>
                  <Text style={styles.videoTitle}>Profile video ready</Text>
                  <Text style={styles.videoSub}>Tap Save to apply</Text>
                </View>
                <TouchableOpacity style={styles.videoRemove} onPress={removeProfileVideo}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.videoEmpty}>
                <MaterialCommunityIcons name="video-outline" size={20} color="#9ca3af" />
                <Text style={styles.videoEmptyText}>No profile video yet</Text>
              </View>
            )}
          </View>

          {/* Photos Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Additional Photos</Text>
              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={() => pickImage(false)}
                disabled={uploading || formData.photos.length >= 6}
              >
                <MaterialCommunityIcons 
                  name="plus" 
                  size={16} 
                  color={formData.photos.length >= 6 ? '#9ca3af' : Colors.light.tint} 
                />
                <Text style={[
                  styles.addPhotoText,
                  { color: formData.photos.length >= 6 ? '#9ca3af' : Colors.light.tint }
                ]}>
                  Add Photo
                </Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.photoHint}>
              Add up to 6 photos to showcase your personality (current: {formData.photos.length}/6)
            </Text>

            <View style={styles.photosGrid}>
              {formData.photos.map((photo, index) => (
                <View key={index} style={styles.photoContainer}>
                  <Image source={{ uri: photo }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={() => removePhoto(index)}
                  >
                    <MaterialCommunityIcons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              
              {/* Empty slots */}
              {Array.from({ length: 6 - formData.photos.length }).map((_, index) => (
                <TouchableOpacity
                  key={`empty-${index}`}
                  style={styles.emptyPhotoSlot}
                  onPress={() => pickImage(false)}
                  disabled={uploading}
                >
                  <MaterialCommunityIcons name="camera-plus" size={24} color="#9ca3af" />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 50 }} />
        </ScrollView>

        {/* Upload Progress */}
        {(uploading || videoUploading) && (
          <View style={styles.uploadingOverlay}>
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color={Colors.light.tint} />
              <Text style={styles.uploadingText}>
                {videoUploading ? 'Uploading video...' : 'Uploading photo...'}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* Height Picker */}
      <FieldPicker
        title="Select Height"
        options={HEIGHT_OPTIONS}
        visible={showHeightPicker}
        onClose={() => setShowHeightPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomHeight('');
          }
          handleInputChange('height', value);
        }}
        currentValue={formData.height}
      />

      {/* Occupation Picker */}
      <FieldPicker
        title="Select Occupation"
        options={OCCUPATION_OPTIONS}
        visible={showOccupationPicker}
        onClose={() => setShowOccupationPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomOccupation('');
          }
          handleInputChange('occupation', value);
        }}
        currentValue={formData.occupation}
      />

      {/* Education Picker */}
      <FieldPicker
        title="Select Education"
        options={EDUCATION_OPTIONS}
        visible={showEducationPicker}
        onClose={() => setShowEducationPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomEducation('');
          }
          handleInputChange('education', value);
        }}
        currentValue={formData.education}
      />

      {/* Looking For Picker */}
      <FieldPicker
        title="What are you looking for?"
        options={LOOKING_FOR_OPTIONS}
        visible={showLookingForPicker}
        onClose={() => setShowLookingForPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomLookingFor('');
          }
          handleInputChange('looking_for', value);
        }}
        currentValue={formData.looking_for}
      />

      {/* HIGH PRIORITY Pickers */}
      
      {/* Exercise Frequency Picker */}
      <FieldPicker
        title="Exercise Frequency"
        options={EXERCISE_FREQUENCY_OPTIONS}
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomExercise('');
          }
          handleInputChange('exercise_frequency', value);
        }}
        currentValue={formData.exercise_frequency}
      />

      {/* Smoking Picker */}
      <FieldPicker
        title="Smoking Habits"
        options={SMOKING_OPTIONS}
        visible={showSmokingPicker}
        onClose={() => setShowSmokingPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomSmoking('');
          }
          handleInputChange('smoking', value);
        }}
        currentValue={formData.smoking}
      />

      {/* Drinking Picker */}
      <FieldPicker
        title="Drinking Habits"
        options={DRINKING_OPTIONS}
        visible={showDrinkingPicker}
        onClose={() => setShowDrinkingPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomDrinking('');
          }
          handleInputChange('drinking', value);
        }}
        currentValue={formData.drinking}
      />

      {/* Has Children Picker */}
      <FieldPicker
        title="Do you have children?"
        options={HAS_CHILDREN_OPTIONS}
        visible={showHasChildrenPicker}
        onClose={() => setShowHasChildrenPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomHasChildren('');
          }
          handleInputChange('has_children', value);
        }}
        currentValue={formData.has_children}
      />

      {/* Wants Children Picker */}
      <FieldPicker
        title="Do you want children?"
        options={WANTS_CHILDREN_OPTIONS}
        visible={showWantsChildrenPicker}
        onClose={() => setShowWantsChildrenPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomWantsChildren('');
          }
          handleInputChange('wants_children', value);
        }}
        currentValue={formData.wants_children}
      />

      {/* Personality Type Picker */}
      <FieldPicker
        title="Personality Type"
        options={PERSONALITY_TYPE_OPTIONS}
        visible={showPersonalityPicker}
        onClose={() => setShowPersonalityPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomPersonality('');
          }
          handleInputChange('personality_type', value);
        }}
        currentValue={formData.personality_type}
      />

      {/* Love Language Picker */}
      <FieldPicker
        title="Love Language"
        options={LOVE_LANGUAGE_OPTIONS}
        visible={showLoveLanguagePicker}
        onClose={() => setShowLoveLanguagePicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomLoveLanguage('');
          }
          handleInputChange('love_language', value);
        }}
        currentValue={formData.love_language}
      />

      {/* Living Situation Picker */}
      <FieldPicker
        title="Living Situation"
        options={LIVING_SITUATION_OPTIONS}
        visible={showLivingSituationPicker}
        onClose={() => setShowLivingSituationPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomLivingSituation('');
          }
          handleInputChange('living_situation', value);
        }}
        currentValue={formData.living_situation}
      />

      {/* Pets Picker */}
      <FieldPicker
        title="Pet Preference"
        options={PETS_OPTIONS}
        visible={showPetsPicker}
        onClose={() => setShowPetsPicker(false)}
        onSelect={(value) => {
          if (value === 'Other') {
            setCustomPets('');
          }
          handleInputChange('pets', value);
        }}
        currentValue={formData.pets}
      />

      {/* Languages Multi-Select Picker */}
      <Modal visible={showLanguagesPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowLanguagesPicker(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Languages Spoken</Text>
            <TouchableOpacity onPress={() => {
              handleInputChange('languages_spoken', selectedLanguages);
              setShowLanguagesPicker(false);
            }}>
              <Text style={styles.saveButton}>Done</Text>
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={LANGUAGES_OPTIONS}
            keyExtractor={(item) => item}
            style={styles.pickerList}
            renderItem={({ item }) => {
              const isSelected = selectedLanguages.includes(item);
              return (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    isSelected && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    if (isSelected) {
                      setSelectedLanguages(prev => prev.filter(lang => lang !== item));
                    } else {
                      setSelectedLanguages(prev => [...prev, item]);
                    }
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    isSelected && styles.pickerItemTextSelected
                  ]}>
                    {item}
                  </Text>
                  {isSelected && (
                    <MaterialCommunityIcons name="check" size={20} color={Colors.light.tint} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Interests Multi-Select Picker */}
      <Modal visible={showInterestsPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowInterestsPicker(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Select Interests</Text>
            <TouchableOpacity onPress={() => {
              setShowInterestsPicker(false);
            }}>
              <Text style={styles.saveButton}>Done</Text>
            </TouchableOpacity>
          </View>
          
          {loadingInterests ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color={Colors.light.tint} />
              <Text style={styles.uploadingText}>Loading interests...</Text>
            </View>
          ) : (
            <FlatList
              data={availableInterests}
              keyExtractor={(item) => item}
              style={styles.pickerList}
              renderItem={({ item }) => {
                const isSelected = selectedInterests.includes(item);
                return (
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      isSelected && styles.pickerItemSelected
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedInterests(prev => prev.filter(interest => interest !== item));
                      } else {
                        setSelectedInterests(prev => [...prev, item]);
                      }
                    }}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      isSelected && styles.pickerItemTextSelected
                    ]}>
                      {item}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons name="check" size={20} color={Colors.light.tint} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Future Ghana Plans Picker Modal - Only for diaspora users */}
      {(profile as any)?.diaspora_status === 'DIASPORA' && (
        <Modal visible={showFutureGhanaPlansPicker} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => setShowFutureGhanaPlansPicker(false)}>
                <Text style={styles.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>Future Plans with Ghana</Text>
              <View style={{ width: 50 }} />
            </View>
            <FlatList
              style={styles.pickerList}
              data={FUTURE_GHANA_PLANS_OPTIONS}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    formData.future_ghana_plans === item && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setFormData(prev => ({ ...prev, future_ghana_plans: item }));
                    setShowFutureGhanaPlansPicker(false);
                    setCustomFutureGhanaPlans('');
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    formData.future_ghana_plans === item && styles.pickerItemTextSelected
                  ]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <View style={{ padding: 20 }}>
              <Text style={styles.inputLabel}>Or enter custom plans:</Text>
              <TextInput
                style={[styles.textInput, { marginTop: 8 }]}
                value={customFutureGhanaPlans}
                onChangeText={setCustomFutureGhanaPlans}
                placeholder="Describe your future plans"
              />
              {customFutureGhanaPlans.trim() !== '' && (
                <TouchableOpacity
                  style={[styles.pickerItem, { marginTop: 10 }]}
                  onPress={() => {
                    setFormData(prev => ({ ...prev, future_ghana_plans: customFutureGhanaPlans.trim() }));
                    setShowFutureGhanaPlansPicker(false);
                    setCustomFutureGhanaPlans('');
                  }}
                >
                  <Text style={styles.pickerItemText}>{customFutureGhanaPlans.trim()}</Text>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </Modal>
      )}

      {/* Diaspora Verification Modal */}
      <DiasporaVerification
        visible={isVerificationModalVisible}
        onClose={() => setIsVerificationModalVisible(false)}
        profile={profile}
        onVerificationUpdate={(level) => {
          // Update profile verification level in UI
          if (profile) {
            (profile as any).verification_level = level;
          }
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  cancelButton: {
    fontSize: 16,
    color: '#6b7280',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  content: {
    flex: 1,
  },
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
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  avatarContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#e5e7eb',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: '35%',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addPhotoText: {
    fontSize: 14,
    marginLeft: 4,
  },
  photoHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoContainer: {
    position: 'relative',
    width: 80,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#0f172a',
  },
  videoThumb: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
  },
  videoMeta: { marginLeft: 12, flex: 1 },
  videoTitle: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  videoSub: { color: '#cbd5f5', fontSize: 12, marginTop: 2 },
  videoRemove: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  videoEmptyText: { marginLeft: 8, color: '#6b7280', fontSize: 13 },
  removePhotoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPhotoSlot: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  uploadingText: {
    fontSize: 16,
    color: '#374151',
    marginTop: 12,
  },
  
  // Picker Styles
  pickerContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  pickerCancel: {
    fontSize: 16,
    color: '#6b7280',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  pickerList: {
    flex: 1,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  pickerItemSelected: {
    backgroundColor: '#f0f9ff',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#374151',
  },
  pickerItemTextSelected: {
    color: Colors.light.tint,
    fontWeight: '600',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    minHeight: 48,
  },
  selectButtonText: {
    fontSize: 16,
    color: '#374151',
  },
  selectButtonPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
  },
  
  // Interests styles
  interestsPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  interestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderColor: Colors.light.tint,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  interestText: {
    fontSize: 14,
    color: Colors.light.tint,
    fontWeight: '500',
  },
  removeInterestButton: {
    marginLeft: 6,
    padding: 2,
  },
  statusDisplay: {
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  statusSubtext: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
  },
});
