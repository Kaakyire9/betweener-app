import { AuthDebugPanel } from "@/components/auth-debug";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: screenWidth } = Dimensions.get('window');

const REGIONS = ["Greater Accra", "Ashanti", "Volta", "Central"];
const TRIBES = ["Akan", "Ewe", "Ga-Adangbe", "Mole-Dagbani"];
const RELIGIONS = ["Christian", "Muslim", "Traditionalist", "Other"];
const INTERESTS = [
  "Afrobeats",
  "Football",
  "Jollof",
  "Church",
  "Kumawood Movies",
];

const ONBOARDING_STEPS = [
  { id: 'welcome', title: 'Welcome', subtitle: "Let's get started!" },
  { id: 'basic', title: 'Basic Info', subtitle: 'Tell us about yourself' },
  { id: 'photo', title: 'Profile Photo', subtitle: 'Show your best self' },
  { id: 'location', title: 'Location', subtitle: 'Where are you from?' },
  { id: 'preferences', title: 'Preferences', subtitle: 'What interests you?' },
  { id: 'dating', title: 'Dating', subtitle: 'Your ideal match' },
  { id: 'complete', title: 'Complete', subtitle: "You're all set!" }
];

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile, user, signOut } = useAuth();
  const fontsLoaded = useAppFonts();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState({
    fullName: "",
    age: "",
    gender: "",
    bio: "",
    region: "",
    tribe: "",
    religion: "",
    interests: [] as string[],
    minAgeInterest: "18",
    maxAgeInterest: "35",
  });

  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Animation values
  const progressAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const manipulatedImage = await manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 500, height: 500 } }],
          { compress: 0.8, format: SaveFormat.JPEG }
        );
        setImage(manipulatedImage.uri);
        setErrors((prev) => ({ ...prev, profilePic: "" }));
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const validateStep = (step: number) => {
    const newErrors: { [key: string]: string } = {};
    
    switch (step) {
      case 1: // Basic Info
        if (!form.fullName.trim()) newErrors.fullName = "Full name is required.";
        if (!form.age || Number(form.age) < 18) newErrors.age = "You must be at least 18.";
        if (!form.gender) newErrors.gender = "Gender is required.";
        if (!form.bio.trim()) newErrors.bio = "Bio is required.";
        break;
      case 2: // Photo
        if (!image) newErrors.profilePic = "Profile picture is required.";
        break;
      case 3: // Location
        if (!form.region) newErrors.region = "Region is required.";
        if (!form.tribe) newErrors.tribe = "Tribe is required.";
        if (!form.religion) newErrors.religion = "Religion is required.";
        break;
      case 4: // Preferences
        if (form.interests.length === 0) newErrors.interests = "Select at least one interest.";
        break;
      case 5: // Dating
        const minAge = Number(form.minAgeInterest);
        const maxAge = Number(form.maxAgeInterest);
        if (minAge < 18 || minAge > 99) newErrors.minAgeInterest = "Min age must be between 18 and 99.";
        if (maxAge < 18 || maxAge > 99) newErrors.maxAgeInterest = "Max age must be between 18 and 99.";
        if (minAge > maxAge) newErrors.maxAgeInterest = "Max age must be greater than or equal to min age.";
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 0) {
      nextStep();
      return;
    }
    
    if (validateStep(currentStep)) {
      if (currentStep === ONBOARDING_STEPS.length - 2) {
        // Last step - submit
        handleSubmit();
      } else {
        nextStep();
      }
    }
  };

  const handleSubmit = async () => {
    // Validate all steps before final submission
    for (let step = 1; step <= 5; step++) {
      if (!validateStep(step)) {
        setMessage("Please complete all required fields.");
        return;
      }
    }

    setLoading(true);
    setMessage("");

    try {
      console.log("Starting profile creation...");
      console.log("User from context:", user?.id, user?.email);

      // 1. Check if user is available from auth context
      if (!user) {
        throw new Error("User not authenticated. Please log in again.");
      }

      let imageUrl = null;

      // 2. Upload image
      if (image) {
        console.log("Uploading image...");
        const fileExt = image.split(".").pop() || "jpg";
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

        // Read file as array buffer for React Native
        const response = await fetch(image);
        const arrayBuffer = await response.arrayBuffer();
        const fileBody = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from("profiles")
          .upload(fileName, fileBody, {
            contentType: `image/${fileExt}`,
          });

        if (uploadError) {
          console.error("Image upload error:", uploadError);
          throw new Error(`Image upload failed: ${uploadError.message}`);
        }

        const { data } = supabase.storage.from("profiles").getPublicUrl(fileName);
        imageUrl = data.publicUrl;
        console.log("Image uploaded successfully:", imageUrl);
      }

      // 3. Create/update profile using auth context
      console.log("Creating profile...");
      const profileData = {
        id: user.id,
        user_id: user.id,
        full_name: form.fullName,
        age: Number(form.age),
        gender: form.gender.toUpperCase(),
        bio: form.bio,
        region: form.region,
        tribe: form.tribe,
        religion: form.religion.toUpperCase(),
        avatar_url: imageUrl,
        min_age_interest: Number(form.minAgeInterest),
        max_age_interest: Number(form.maxAgeInterest),
      };

      console.log("Profile data:", profileData);

      const { error: updateError } = await updateProfile(profileData);

      if (updateError) {
        console.error("Profile update error:", updateError);
        throw new Error(`Profile creation failed: ${updateError.message}`);
      }

      console.log("Profile created successfully!");
      setMessage("Profile saved! Redirecting...");
      // No need to manually navigate - AuthGuard will handle routing
    } catch (error: any) {
      console.error("Onboarding error:", error);
      setMessage(error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out? You'll need to log in again to complete your profile.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
              router.replace("/(auth)/login");
            } catch (error) {
              console.error("Sign out error:", error);
              Alert.alert("Error", "Failed to sign out. Please try again.");
            }
          },
        },
      ]
    );
  };

  // Animation effects
  useEffect(() => {
    const progress = (currentStep / (ONBOARDING_STEPS.length - 1)) * 100;
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [currentStep]);

  const nextStep = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -screenWidth,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      
      setCurrentStep(prev => prev + 1);
      setErrors({});
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: screenWidth,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      
      setCurrentStep(prev => prev - 1);
      setErrors({});
    }
  };

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <Animated.View 
          style={[
            styles.progressFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              })
            }
          ]} 
        />
      </View>
      <Text style={styles.progressText}>
        {currentStep + 1} of {ONBOARDING_STEPS.length}
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {currentStep > 0 && (
          <TouchableOpacity 
            onPress={prevStep} 
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.light.tint} />
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.headerCenter}>
        <Text style={styles.stepTitle}>{ONBOARDING_STEPS[currentStep].title}</Text>
        <Text style={styles.stepSubtitle}>{ONBOARDING_STEPS[currentStep].subtitle}</Text>
      </View>
      
      <View style={styles.headerRight}>
        <Pressable
          onPress={handleSignOut}
          style={styles.signOutButton}
          accessibilityLabel="Sign out"
        >
          <MaterialCommunityIcons name="logout" size={20} color="#ef4444" />
        </Pressable>
      </View>
    </View>
  );

  const renderWelcomeStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <View style={styles.welcomeContainer}>
        <MaterialCommunityIcons name="heart-multiple" size={80} color={Colors.light.tint} />
        <Text style={styles.welcomeTitle}>Welcome to Betweener!</Text>
        <Text style={styles.welcomeSubtitle}>
          Let's create your profile so you can start connecting with amazing people in Ghana.
        </Text>
        <View style={styles.welcomeFeatures}>
          <View style={styles.featureItem}>
            <MaterialCommunityIcons name="shield-check" size={24} color={Colors.light.tint} />
            <Text style={styles.featureText}>Safe & Secure</Text>
          </View>
          <View style={styles.featureItem}>
            <MaterialCommunityIcons name="account-heart" size={24} color={Colors.light.tint} />
            <Text style={styles.featureText}>Find Your Match</Text>
          </View>
          <View style={styles.featureItem}>
            <MaterialCommunityIcons name="map-marker" size={24} color={Colors.light.tint} />
            <Text style={styles.featureText}>Local Connections</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );

  const renderBasicInfoStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={[styles.input, errors.fullName && styles.inputError]}
            value={form.fullName}
            onChangeText={(text) => setForm((prev) => ({ ...prev, fullName: text }))}
            placeholder="Enter your full name"
            placeholderTextColor="#9ca3af"
          />
          {errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}
        </View>

        <View style={styles.inputRow}>
          <View style={[styles.inputContainer, { flex: 1 }]}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={[styles.input, errors.age && styles.inputError]}
              value={form.age}
              onChangeText={(text) => setForm((prev) => ({ ...prev, age: text }))}
              placeholder="Age"
              keyboardType="numeric"
              placeholderTextColor="#9ca3af"
            />
            {errors.age && <Text style={styles.errorText}>{errors.age}</Text>}
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderContainer}>
            {["Male", "Female", "Other"].map((gender) => (
              <TouchableOpacity
                key={gender}
                style={[
                  styles.genderOption,
                  form.gender === gender && styles.genderOptionSelected,
                ]}
                onPress={() => setForm((prev) => ({ ...prev, gender }))}
              >
                <Text
                  style={[
                    styles.genderText,
                    form.gender === gender && styles.genderTextSelected,
                  ]}
                >
                  {gender}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.gender && <Text style={styles.errorText}>{errors.gender}</Text>}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.textArea, errors.bio && styles.inputError]}
            value={form.bio}
            onChangeText={(text) => setForm((prev) => ({ ...prev, bio: text }))}
            placeholder="Tell us about yourself..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor="#9ca3af"
          />
          {errors.bio && <Text style={styles.errorText}>{errors.bio}</Text>}
        </View>
      </ScrollView>
    </Animated.View>
  );

  const renderPhotoStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <View style={styles.photoContainer}>
        <TouchableOpacity onPress={pickImage} style={styles.photoUpload}>
          <View style={styles.photoPreview}>
            {image ? (
              <Image source={{ uri: image }} style={styles.photoImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <MaterialCommunityIcons name="camera-plus" size={48} color="#9ca3af" />
                <Text style={styles.photoPlaceholderText}>Add Photo</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.photoHint}>
          Choose a clear photo of yourself. This will be your main profile picture.
        </Text>
        {errors.profilePic && <Text style={styles.errorText}>{errors.profilePic}</Text>}
      </View>
    </Animated.View>
  );

  const renderLocationStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Region</Text>
          <View style={styles.optionsGrid}>
            {REGIONS.map((region) => (
              <TouchableOpacity
                key={region}
                style={[
                  styles.gridOption,
                  form.region === region && styles.gridOptionSelected,
                ]}
                onPress={() => setForm((prev) => ({ ...prev, region }))}
              >
                <Text
                  style={[
                    styles.gridOptionText,
                    form.region === region && styles.gridOptionTextSelected,
                  ]}
                >
                  {region}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.region && <Text style={styles.errorText}>{errors.region}</Text>}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Tribe</Text>
          <View style={styles.optionsGrid}>
            {TRIBES.map((tribe) => (
              <TouchableOpacity
                key={tribe}
                style={[
                  styles.gridOption,
                  form.tribe === tribe && styles.gridOptionSelected,
                ]}
                onPress={() => setForm((prev) => ({ ...prev, tribe }))}
              >
                <Text
                  style={[
                    styles.gridOptionText,
                    form.tribe === tribe && styles.gridOptionTextSelected,
                  ]}
                >
                  {tribe}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.tribe && <Text style={styles.errorText}>{errors.tribe}</Text>}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Religion</Text>
          <View style={styles.optionsGrid}>
            {RELIGIONS.map((religion) => (
              <TouchableOpacity
                key={religion}
                style={[
                  styles.gridOption,
                  form.religion === religion && styles.gridOptionSelected,
                ]}
                onPress={() => setForm((prev) => ({ ...prev, religion }))}
              >
                <Text
                  style={[
                    styles.gridOptionText,
                    form.religion === religion && styles.gridOptionTextSelected,
                  ]}
                >
                  {religion}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.religion && <Text style={styles.errorText}>{errors.religion}</Text>}
        </View>
      </ScrollView>
    </Animated.View>
  );

  const renderPreferencesStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Interests</Text>
          <Text style={styles.inputHint}>Select what you're passionate about</Text>
          <View style={styles.interestsGrid}>
            {INTERESTS.map((interest) => (
              <TouchableOpacity
                key={interest}
                style={[
                  styles.interestChip,
                  form.interests.includes(interest) && styles.interestChipSelected,
                ]}
                onPress={() => toggleInterest(interest)}
              >
                <Text
                  style={[
                    styles.interestChipText,
                    form.interests.includes(interest) && styles.interestChipTextSelected,
                  ]}
                >
                  {interest}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.interests && <Text style={styles.errorText}>{errors.interests}</Text>}
        </View>
      </ScrollView>
    </Animated.View>
  );

  const renderDatingStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Age Preference</Text>
          <Text style={styles.inputHint}>What age range are you interested in?</Text>
          <View style={styles.ageRangeContainer}>
            <View style={styles.ageInputContainer}>
              <Text style={styles.ageLabel}>Min Age</Text>
              <TextInput
                style={[styles.ageInput, errors.minAgeInterest && styles.inputError]}
                value={form.minAgeInterest}
                onChangeText={(text) => setForm((prev) => ({ ...prev, minAgeInterest: text }))}
                keyboardType="numeric"
                textAlign="center"
              />
            </View>
            <Text style={styles.ageRangeText}>to</Text>
            <View style={styles.ageInputContainer}>
              <Text style={styles.ageLabel}>Max Age</Text>
              <TextInput
                style={[styles.ageInput, errors.maxAgeInterest && styles.inputError]}
                value={form.maxAgeInterest}
                onChangeText={(text) => setForm((prev) => ({ ...prev, maxAgeInterest: text }))}
                keyboardType="numeric"
                textAlign="center"
              />
            </View>
          </View>
          {(errors.minAgeInterest || errors.maxAgeInterest) && (
            <Text style={styles.errorText}>
              {errors.minAgeInterest || errors.maxAgeInterest}
            </Text>
          )}
        </View>
      </ScrollView>
    </Animated.View>
  );

  const renderCompleteStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <View style={styles.completeContainer}>
        <MaterialCommunityIcons name="check-circle" size={80} color="#10b981" />
        <Text style={styles.completeTitle}>Almost Done!</Text>
        <Text style={styles.completeSubtitle}>
          Review your information and create your profile to start your journey.
        </Text>
        {message && <Text style={styles.messageText}>{message}</Text>}
      </View>
    </Animated.View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderWelcomeStep();
      case 1: return renderBasicInfoStep();
      case 2: return renderPhotoStep();
      case 3: return renderLocationStep();
      case 4: return renderPreferencesStep();
      case 5: return renderDatingStep();
      case 6: return renderCompleteStep();
      default: return renderWelcomeStep();
    }
  };

  const renderActionButtons = () => (
    <View style={styles.actionContainer}>
      <TouchableOpacity
        style={[
          styles.nextButton,
          loading && styles.nextButtonDisabled,
        ]}
        onPress={handleNext}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.nextButtonText}>
              {currentStep === ONBOARDING_STEPS.length - 1 ? 'Create Profile' : 'Continue'}
            </Text>
            {currentStep < ONBOARDING_STEPS.length - 1 && (
              <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
            )}
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {renderProgressBar()}
        {renderHeader()}
        
        <View style={styles.content}>
          {__DEV__ && <AuthDebugPanel />}
          {renderCurrentStep()}
        </View>
        
        {renderActionButtons()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  
  // Progress Bar
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.light.tint,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerLeft: {
    width: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  stepTitle: {
    fontSize: 20,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 2,
  },
  signOutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContainer: {
    flex: 1,
    paddingTop: 32,
  },

  // Welcome Step
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  welcomeTitle: {
    fontSize: 32,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  welcomeSubtitle: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 48,
  },
  welcomeFeatures: {
    gap: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
  },

  // Form Elements
  inputContainer: {
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 16,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#111827',
  },
  textArea: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#111827',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: '#ef4444',
    marginTop: 4,
  },

  // Gender Selection
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  genderOptionSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  genderText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
  },
  genderTextSelected: {
    color: '#fff',
    fontFamily: 'Archivo_700Bold',
  },

  // Photo Upload
  photoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoUpload: {
    marginBottom: 24,
  },
  photoPreview: {
    width: 200,
    height: 200,
    borderRadius: 100,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  photoPlaceholderText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    marginTop: 8,
  },
  photoHint: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },

  // Grid Options
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridOption: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    minWidth: '45%',
    alignItems: 'center',
  },
  gridOptionSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  gridOptionText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
  },
  gridOptionTextSelected: {
    color: '#fff',
    fontFamily: 'Archivo_700Bold',
  },

  // Interests
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  interestChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  interestChipSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  interestChipText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#374151',
  },
  interestChipTextSelected: {
    color: '#fff',
    fontFamily: 'Archivo_700Bold',
  },

  // Age Range
  ageRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ageInputContainer: {
    flex: 1,
    alignItems: 'center',
  },
  ageLabel: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    marginBottom: 8,
  },
  ageInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    textAlign: 'center',
    minWidth: 80,
  },
  ageRangeText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
  },

  // Complete Step
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  completeTitle: {
    fontSize: 28,
    fontFamily: 'Archivo_700Bold',
    color: '#111827',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  completeSubtitle: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },

  // Action Buttons
  actionContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  nextButton: {
    backgroundColor: Colors.light.tint,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.light.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#fff',
  },

  // Message
  messageText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.light.tint,
    textAlign: 'center',
    marginTop: 16,
  },
});