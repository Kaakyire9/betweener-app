import { AuthDebugPanel } from "@/components/auth-debug";
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { clearSignupSession, finalizeSignupPhoneVerification } from "@/lib/signup-tracking";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";
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

const BRAND_TEAL = '#0C6E7A';
const BRAND_OAT = '#F6F1E8';
const BRAND_LILAC = '#C9A7FF';
const BRAND_INK = '#0F172A';

const LOGO = require('../../assets/images/foreground-icon.png');

const REGIONS = [
  "Ahafo",
  "Ashanti",
  "Bono",
  "Bono East",
  "Central",
  "Eastern",
  "Greater Accra",
  "North East",
  "Northern",
  "Oti",
  "Savannah",
  "Upper East",
  "Upper West",
  "Volta",
  "Western",
  "Western North",
];
const TRIBES = [
  "Asante",
  "Fante",
  "Akuapem",
  "Akyem",
  "Brong (Bono)",
  "Kwahu",
  "Wassa",
  "Sefwi",
  "Nzema",
  "Ga",
  "Ewe",
  "Mole-Dagbon",
];
const RELIGIONS = ["Christian", "Muslim", "Traditionalist", "Other"];
const INTERESTS = [
  "Afrobeats",
  "Football",
  "Jollof",
  "Church",
  "Kumawood Movies",
];
const OCCUPATION_OPTIONS = [
  "Student",
  "Software Engineer",
  "Teacher",
  "Doctor",
  "Lawyer",
  "Nurse",
  "Business Owner",
  "Marketing",
  "Sales",
  "Designer",
  "Accountant",
  "Engineer",
  "Consultant",
  "Manager",
  "Artist",
  "Writer",
  "Photographer",
  "Chef",
  "Fitness Trainer",
  "Real Estate",
  "Healthcare",
  "Finance",
  "Other",
];

const ONBOARDING_STEPS = [
  { id: 'welcome', title: 'Where connection begins', subtitle: 'A more intentional way to meet' },
  { id: 'basic', title: 'Basic Info', subtitle: 'Tell us about yourself' },
  { id: 'photo', title: 'Profile Photo', subtitle: 'Show your best self' },
  { id: 'location', title: 'Location', subtitle: 'Where are you from?' },
  { id: 'preferences', title: 'Preferences', subtitle: 'What interests you?' },
  { id: 'dating', title: 'Dating', subtitle: 'Your ideal match' },
  { id: 'complete', title: 'Complete', subtitle: "You're all set!" }
];

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile, user, signOut, refreshProfile, phoneVerified } = useAuth();
  const fontsLoaded = useAppFonts();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [customOccupation, setCustomOccupation] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    age: "",
    gender: "",
    bio: "",
    occupation: "",
    region: "",
    tribe: "",
    religion: "",
    interests: [] as string[],
    minAgeInterest: "18",
    maxAgeInterest: "35",
    willingLongDistance: false,
  });

  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [profileCreated, setProfileCreated] = useState(false);

  // Animation values
  const progressAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const SLIDE_UP_DISTANCE = 18;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const burstShownRef = useRef(false);
  const [showBurst, setShowBurst] = useState(false);
  const burstAnims = useRef(Array.from({ length: 6 }, () => ({
    y: new Animated.Value(0),
    x: new Animated.Value(0),
    opacity: new Animated.Value(0),
    scale: new Animated.Value(0.6),
  }))).current;

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
        if (!form.occupation) newErrors.occupation = "Occupation is required.";
        if (form.occupation === "Other" && !customOccupation.trim())
          newErrors.occupation = "Please enter your occupation.";
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
      if (currentStep === ONBOARDING_STEPS.length - 1) {
        handleSubmit();
      } else {
        nextStep();
      }
    }
  };

  const handleSubmit = async () => {
    // Validate all steps before final submission
    for (let step = 1; step <= ONBOARDING_STEPS.length - 2; step++) {
      if (!validateStep(step)) {
        setMessage("Please complete all required fields.");
        return;
      }
    }

    setLoading(true);
    setMessage("");

    try {
      const { phoneNumber } = await getSignupPhoneState();
      if (!phoneNumber) {
        Alert.alert(
          "Phone number missing",
          "Please verify your phone number before creating your profile."
        );
        router.replace({
          pathname: "/(auth)/verify-phone",
          params: { next: encodeURIComponent("/(auth)/onboarding") },
        });
        return;
      }

      const { data: existingPhoneProfile, error: phoneLookupError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("phone_number", phoneNumber)
        .is("deleted_at", null)
        .maybeSingle();

      if (
        phoneLookupError &&
        "code" in phoneLookupError &&
        phoneLookupError.code !== "PGRST116"
      ) {
        throw new Error(`Phone lookup failed: ${phoneLookupError.message}`);
      }

      if (existingPhoneProfile?.user_id && existingPhoneProfile.user_id !== user?.id) {
        Alert.alert(
          "Phone already in use",
          "This phone number is already linked to another account. Please sign in or use a different number."
        );
        await signOut();
        router.replace("/(auth)/login");
        return;
      }

      // 1. Check if user is available from auth context
      if (!user) {
        throw new Error("User not authenticated. Please log in again.");
      }

      let imageUrl = null;

      // 2. Upload image
      if (image) {
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
          throw new Error(`Image upload failed: ${uploadError.message}`);
        }

        const { data } = supabase.storage.from("profiles").getPublicUrl(fileName);
        imageUrl = data.publicUrl;
      }

      // 3. Create/update profile using auth context
      const profilePreview = {
        fullName: form.fullName,
        age: form.age,
        gender: form.gender,
        bio: form.bio,
        occupation:
          form.occupation === "Other" && customOccupation.trim()
            ? customOccupation.trim()
            : form.occupation,
        region: form.region,
        tribe: form.tribe,
        religion: form.religion
      };
      
      // Safety check for gender field
      if (!form.gender || form.gender.trim() === '') {
        Alert.alert("Error", "Please select your gender before continuing.");
        return;
      }
      
      const profileData = {
        id: user.id,
        user_id: user.id,
        full_name: form.fullName,
        age: Number(form.age),
        gender: form.gender.toUpperCase(),
        bio: form.bio,
        occupation:
          form.occupation === "Other" && customOccupation.trim()
            ? customOccupation.trim()
            : form.occupation,
        region: form.region,
        tribe: form.tribe,
        religion: form.religion.toUpperCase(),
        avatar_url: imageUrl,
        phone_number: phoneNumber,
        phone_verified: true,
        min_age_interest: Number(form.minAgeInterest),
        max_age_interest: Number(form.maxAgeInterest),
        current_country: "Ghana, Africa",
        diaspora_status: "LOCAL" as const,
        willing_long_distance: form.willingLongDistance,
        years_in_diaspora: 0,
        profile_completed: true,
      };

      const { error: updateError } = await updateProfile(profileData);

      if (updateError) {
        if ("code" in updateError && updateError.code === "23505") {
          Alert.alert(
            "Phone already in use",
            "This phone number is already linked to another account. Please sign in or use a different number."
          );
          await signOut();
          router.replace("/(auth)/login");
          return;
        }
        throw new Error(`Profile creation failed: ${updateError.message}`);
      }

      await finalizeSignupPhoneVerification();
      await clearSignupSession();

      setMessage("Profile created successfully! Welcome to Betweener! 🎉");
      
      setProfileCreated(true);
      
      // Force refresh the auth context to ensure profile state is updated
      setTimeout(async () => {
        await refreshProfile();

        // Wait a bit longer to ensure database is fully updated
        await new Promise(resolve => setTimeout(resolve, 1000));
        router.dismissAll();
        router.replace("/(tabs)/vibes");
      }, 2000);
    } catch (error: any) {
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

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const isLast = currentStep === ONBOARDING_STEPS.length - 1;
    if (!isLast || burstShownRef.current) return;
    burstShownRef.current = true;
    setShowBurst(true);
    burstAnims.forEach((anim, idx) => {
      anim.x.setValue((idx - 2.5) * 6);
      anim.y.setValue(8);
      anim.opacity.setValue(0);
      anim.scale.setValue(0.6);
      Animated.sequence([
        Animated.delay(idx * 80),
        Animated.parallel([
          Animated.timing(anim.opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(anim.y, { toValue: -20 - idx * 6, duration: 900, useNativeDriver: true }),
          Animated.timing(anim.scale, { toValue: 1, duration: 260, useNativeDriver: true }),
        ]),
        Animated.timing(anim.opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    });
    const t = setTimeout(() => setShowBurst(false), 1400);
    return () => clearTimeout(t);
  }, [burstAnims, currentStep]);

  const nextStep = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SLIDE_UP_DISTANCE,
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
          toValue: SLIDE_UP_DISTANCE,
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
        <ActivityIndicator size="large" color={BRAND_LILAC} />
      </SafeAreaView>
    );
  }

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <LinearGradient
        colors={["rgba(255,255,255,0.7)", "rgba(239,230,219,0.45)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.progressBand}
      />
      <View style={styles.progressGlow}>
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
        >
          <LinearGradient
            colors={[BRAND_TEAL, BRAND_LILAC]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.progressFillGradient}
          />
        </Animated.View>
      </View>
    </View>
      <View style={styles.progressHeartsRow}>
        {ONBOARDING_STEPS.map((_, idx) => {
          const isDone = idx < currentStep;
          const isActive = idx === currentStep;
          const scaleStyle = isActive ? { transform: [{ scale: pulseAnim }] } : undefined;
          return (
            <Animated.View
              key={`heart-${idx}`}
              style={[
                styles.progressHeartWrap,
                isActive && styles.progressHeartActive,
                scaleStyle,
              ]}
            >
            <MaterialCommunityIcons
              name={isDone || isActive ? 'heart' : 'heart-outline'}
              size={isActive ? 24 : 20}
              color={isDone || isActive ? BRAND_LILAC : 'rgba(15,23,42,0.25)'}
            />
            </Animated.View>
          );
        })}
        {showBurst ? (
          <View style={styles.progressBurstLayer} pointerEvents="none">
            {burstAnims.map((anim, idx) => (
              <Animated.View
                key={`burst-${idx}`}
                style={{
                  position: 'absolute',
                  opacity: anim.opacity,
                  transform: [
                    { translateX: anim.x },
                    { translateY: anim.y },
                    { scale: anim.scale },
                  ],
                }}
              >
                <MaterialCommunityIcons
                  name="heart"
                  size={14}
                  color={BRAND_LILAC}
                />
              </Animated.View>
            ))}
          </View>
        ) : null}
      </View>
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
            <MaterialCommunityIcons name="arrow-left" size={24} color={BRAND_LILAC} />
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.headerCenter}>
        <Text style={styles.stepTitle}>{ONBOARDING_STEPS[currentStep].title}</Text>
        <Text style={styles.stepSubtitle}>{ONBOARDING_STEPS[currentStep].subtitle}</Text>
      </View>
      
      <View style={styles.headerRight} />
    </View>
  );

  const renderWelcomeStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}> 
      <View style={styles.welcomeContainer}>
        <View style={styles.heroCard}>
          <LinearGradient
            colors={["rgba(255,255,255,0.94)", "rgba(232,218,202,0.95)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCardInner}
          >
            <View style={styles.heroGlow} />
            <View style={styles.heroHalo} />
            <View style={styles.logoWrap}>
              <LinearGradient
                colors={["rgba(12,110,122,0.18)", "rgba(201,167,255,0.22)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGlow}
              />
              <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
            </View>

            <View style={styles.gradientTitleWrap}>
              <Text style={[styles.gradientTitleText, { color: BRAND_TEAL }]}>Betweener</Text>
              <Text style={[styles.gradientTitleText, styles.gradientTitleTop, { color: BRAND_LILAC }]}>Betweener</Text>
            </View>

            <View style={styles.titleUnderlineWrap}>
              <LinearGradient
                colors={[BRAND_TEAL, BRAND_LILAC]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.titleUnderline}
              />
            </View>

            <Text style={styles.taglineText}>Meaningful connection, in the in-between.</Text>
          </LinearGradient>
        </View>

        <View style={styles.featureChipsRow}>
          <View style={styles.featureChip}>
            <View style={styles.featureIconBubble}>
              <MaterialCommunityIcons name="shield-check" size={16} color={BRAND_LILAC} />
            </View>
            <Text style={styles.featureChipText}>Built on trust & privacy</Text>
          </View>
          <View style={styles.featureChip}>
            <View style={styles.featureIconBubble}>
              <MaterialCommunityIcons name="star-four-points" size={16} color={BRAND_LILAC} />
            </View>
            <Text style={styles.featureChipText}>Match beyond the swipe</Text>
          </View>
          <View style={styles.featureChip}>
            <View style={styles.featureIconBubble}>
              <MaterialCommunityIcons name="map-marker" size={16} color={BRAND_LILAC} />
            </View>
            <Text style={styles.featureChipText}>Intentional, real connections</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );

  const renderBasicInfoStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScrollContent}>
        <View style={styles.formCard}>
          <LinearGradient
            colors={["rgba(255,255,255,0.96)", "rgba(238,226,212,0.96)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.formCardInner}
          >
            <View style={styles.inputContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Name</Text>
                <View style={styles.requiredBadge}>
                  <Text style={styles.requiredBadgeText}>Required</Text>
                </View>
              </View>
              <TextInput
                style={[
                  styles.input,
                  focusedField === "fullName" && styles.inputFocused,
                  errors.fullName && styles.inputError,
                ]}
                value={form.fullName}
                onChangeText={(text) => setForm((prev) => ({ ...prev, fullName: text }))}
                placeholder="Enter your name"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedField("fullName")}
                onBlur={() => setFocusedField(null)}
              />
              {errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputContainer, { flex: 1 }]}>
                <View style={styles.labelRow}>
                  <Text style={styles.labelInline}>Age</Text>
                  <View style={styles.requiredBadge}>
                    <Text style={styles.requiredBadgeText}>Required</Text>
                  </View>
                </View>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === "age" && styles.inputFocused,
                    errors.age && styles.inputError,
                  ]}
                  value={form.age}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, age: text }))}
                  placeholder="Age"
                  keyboardType="numeric"
                  placeholderTextColor="#9ca3af"
                  onFocus={() => setFocusedField("age")}
                  onBlur={() => setFocusedField(null)}
                />
                {errors.age && <Text style={styles.errorText}>{errors.age}</Text>}
              </View>
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Gender</Text>
                <View style={styles.requiredBadge}>
                  <Text style={styles.requiredBadgeText}>Required</Text>
                </View>
              </View>
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
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Bio</Text>
                <View style={styles.requiredBadge}>
                  <Text style={styles.requiredBadgeText}>Required</Text>
                </View>
              </View>
              <TextInput
                style={[
                  styles.textArea,
                  focusedField === "bio" && styles.textAreaFocused,
                  errors.bio && styles.inputError,
                ]}
                value={form.bio}
                onChangeText={(text) => setForm((prev) => ({ ...prev, bio: text }))}
                placeholder="Tell us about yourself..."
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedField("bio")}
                onBlur={() => setFocusedField(null)}
              />
              {errors.bio && <Text style={styles.errorText}>{errors.bio}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Occupation</Text>
                <View style={styles.requiredBadge}>
                  <Text style={styles.requiredBadgeText}>Required</Text>
                </View>
              </View>
              <View style={styles.optionsGrid}>
                {OCCUPATION_OPTIONS.map((occupation) => (
                  <TouchableOpacity
                    key={occupation}
                    style={[
                      styles.gridOption,
                      form.occupation === occupation && styles.gridOptionSelected,
                    ]}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, occupation }));
                      setErrors((prev) => ({ ...prev, occupation: "" }));
                      if (occupation !== "Other") {
                        setCustomOccupation("");
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.gridOptionText,
                        form.occupation === occupation && styles.gridOptionTextSelected,
                      ]}
                    >
                      {occupation}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form.occupation === "Other" ? (
                <TextInput
                  style={[
                    styles.input,
                    focusedField === "customOccupation" && styles.inputFocused,
                    errors.occupation && styles.inputError,
                  ]}
                  value={customOccupation}
                  onChangeText={(text) => {
                    setCustomOccupation(text);
                    if (text.trim()) {
                      setErrors((prev) => ({ ...prev, occupation: "" }));
                    }
                  }}
                  placeholder="Enter your occupation"
                  placeholderTextColor="#9ca3af"
                  onFocus={() => setFocusedField("customOccupation")}
                  onBlur={() => setFocusedField(null)}
                />
              ) : null}
              {errors.occupation && (
                <Text style={styles.errorText}>{errors.occupation}</Text>
              )}
            </View>
          </LinearGradient>
        </View>
      </ScrollView>
    </Animated.View>
  );

  const renderPhotoStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
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
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.inputContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Current Country</Text>
          </View>
          <View style={styles.locationChip}>
            <Text style={styles.locationChipFlag}>🇬🇭</Text>
            <Text style={styles.locationChipText}>Ghana, Africa</Text>
          </View>
        </View>

        {/* Ghana-specific fields */}
        <View style={styles.inputContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>
              Region
            </Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>Required</Text>
            </View>
          </View>
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
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Tribe</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>Required</Text>
            </View>
          </View>
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
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Religion</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>Required</Text>
            </View>
          </View>
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
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.inputContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Interests</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>Required</Text>
            </View>
          </View>
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
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.inputContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Age Preference</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>Required</Text>
            </View>
          </View>
          <Text style={styles.inputHint}>What age range are you interested in?</Text>
          <View style={styles.ageRangeContainer}>
            <View style={styles.ageInputContainer}>
              <Text style={styles.ageLabel}>Min Age</Text>
              <TextInput
                style={[
                  styles.ageInput,
                  focusedField === "minAgeInterest" && styles.ageInputFocused,
                  errors.minAgeInterest && styles.inputError,
                ]}
                value={form.minAgeInterest}
                onChangeText={(text) => setForm((prev) => ({ ...prev, minAgeInterest: text }))}
                keyboardType="numeric"
                textAlign="center"
                onFocus={() => setFocusedField("minAgeInterest")}
                onBlur={() => setFocusedField(null)}
              />
            </View>
            <Text style={styles.ageRangeText}>to</Text>
            <View style={styles.ageInputContainer}>
              <Text style={styles.ageLabel}>Max Age</Text>
              <TextInput
                style={[
                  styles.ageInput,
                  focusedField === "maxAgeInterest" && styles.ageInputFocused,
                  errors.maxAgeInterest && styles.inputError,
                ]}
                value={form.maxAgeInterest}
                onChangeText={(text) => setForm((prev) => ({ ...prev, maxAgeInterest: text }))}
                keyboardType="numeric"
                textAlign="center"
                onFocus={() => setFocusedField("maxAgeInterest")}
                onBlur={() => setFocusedField(null)}
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
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.completeContainer}>
        <MaterialCommunityIcons name="check-circle" size={80} color={BRAND_LILAC} />
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
          (loading || profileCreated) && styles.nextButtonDisabled,
        ]}
        onPress={handleNext}
        disabled={loading || profileCreated}
      >
        <LinearGradient
          colors={[BRAND_TEAL, BRAND_LILAC]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.nextButtonGradient}
        >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : profileCreated ? (
          <>
            <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
            <Text style={styles.nextButtonText}>Profile Created!</Text>
          </>
        ) : (
          <>
            <Text style={styles.nextButtonText}>
              {currentStep === 0
                ? "Let's begin"
                : currentStep === ONBOARDING_STEPS.length - 1
                  ? "Finish"
                  : "Continue"}
            </Text>
            {currentStep > 0 && currentStep < ONBOARDING_STEPS.length - 1 ? (
              <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
            ) : (
              currentStep === ONBOARDING_STEPS.length - 1 ? (
                <MaterialCommunityIcons name="thumb-up" size={20} color="#fff" />
              ) : null
            )}
          </>
        )}
      
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <LinearGradient
      colors={['#E9DDCF', '#FFF5EE']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.background}
    >
      <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {renderProgressBar()}
        {renderHeader()}
        
        <View style={styles.content}>
          {renderCurrentStep()}
        </View>
        
        {renderActionButtons()}
      </KeyboardAvoidingView>
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  
  // Progress Bar
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },

  progressBand: {
    ...StyleSheet.absoluteFillObject,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    borderRadius: 16,
  },
  progressGlow: {
    borderRadius: 999,
    shadowColor: BRAND_LILAC,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(12,110,122,0.12)',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(201,167,255,0.25)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFillGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  progressHeartsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    position: 'relative',
  },
  progressHeartWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressHeartActive: {
    backgroundColor: 'rgba(201,167,255,0.12)',
  },
  progressBurstLayer: {
    position: 'absolute',
    right: 4,
    top: -18,
    width: 1,
    height: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.08)',
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
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
  },
  stepTitle: {
    fontSize: 20,
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#445160',
    textAlign: 'center',
    marginTop: 2,
  },
  signOutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(254,242,242,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
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
  formScrollContent: {
    paddingBottom: 24,
  },

    // Welcome Step
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  heroCard: {
    width: '100%',
    marginTop: 12,
    borderRadius: 28,
    padding: 2,
    backgroundColor: 'rgba(201,167,255,0.28)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 16,
  },
  heroCardInner: {
    borderRadius: 26,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -90,
    right: -90,
    backgroundColor: 'rgba(201,167,255,0.35)',
  },
  heroHalo: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    bottom: -80,
    left: -80,
    backgroundColor: 'rgba(12,110,122,0.22)',
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(201,167,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  logoGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  logoImage: {
    width: 92,
    height: 92,
  },
  gradientTitleWrap: {
    marginTop: 6,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientTitleText: {
    fontSize: 44,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.8,
    textAlign: 'center',
    textShadowColor: 'rgba(12,110,122,0.38)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  titleUnderlineWrap: {
    marginTop: 6,
    marginBottom: 4,
    width: 84,
    height: 4,
  },
  titleUnderline: {
    width: '100%',
    height: 4,
    borderRadius: 999,
    opacity: 0.9,
  },
  gradientTitleTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0.35,
    textShadowColor: 'rgba(201,167,255,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  taglineText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#445160',
    textAlign: 'center',
  },
  featureChipsRow: {
    marginTop: 22,
    gap: 10,
    width: '100%',
  },
  featureChip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  featureIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(201,167,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureChipText: {
    fontSize: 13,
    fontFamily: 'Archivo_700Bold',
    color: '#2f3a45',
  },

  // Form Elements
  formCard: {
    borderRadius: 24,
    padding: 2,
    backgroundColor: 'rgba(201,167,255,0.22)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  formCardInner: {
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'transparent',
  },
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
    color: BRAND_INK,
    marginBottom: 8,
  },
  labelInline: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  requiredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(12,110,122,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(12,110,122,0.22)',
  },
  requiredBadgeText: {
    fontSize: 11,
    fontFamily: 'Archivo_700Bold',
    color: BRAND_TEAL,
    letterSpacing: 0.3,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(12,110,122,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(12,110,122,0.22)',
    alignSelf: 'flex-start',
  },
  locationChipText: {
    fontSize: 13,
    fontFamily: 'Archivo_700Bold',
    color: BRAND_TEAL,
  },
  locationChipFlag: {
    fontSize: 16,
  },
  inputHint: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: BRAND_INK,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  inputFocused: {
    borderColor: BRAND_TEAL,
    shadowColor: BRAND_TEAL,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  textArea: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: BRAND_INK,
    minHeight: 100,
    textAlignVertical: 'top',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  textAreaFocused: {
    borderColor: BRAND_TEAL,
    shadowColor: BRAND_TEAL,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
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
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  genderOptionSelected: {
    backgroundColor: BRAND_LILAC,
    borderColor: BRAND_LILAC,
  },
  genderText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#334155',
  },
  genderTextSelected: {
    color: BRAND_INK,
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
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.18)',
  },
  photoPlaceholderText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    marginTop: 8,
  },
  photoHint: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
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
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.12)',
    minWidth: '45%',
    alignItems: 'center',
  },
  gridOptionSelected: {
    backgroundColor: BRAND_LILAC,
    borderColor: BRAND_LILAC,
  },
  gridOptionText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#334155',
  },
  gridOptionTextSelected: {
    color: BRAND_INK,
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
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.12)',
  },
  interestChipSelected: {
    backgroundColor: BRAND_LILAC,
    borderColor: BRAND_LILAC,
  },
  interestChipText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#334155',
  },
  interestChipTextSelected: {
    color: BRAND_INK,
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
    color: '#52606D',
    marginBottom: 8,
  },
  ageInput: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
    textAlign: 'center',
    minWidth: 80,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  ageInputFocused: {
    borderColor: BRAND_TEAL,
    shadowColor: BRAND_TEAL,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  ageRangeText: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
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
    color: BRAND_INK,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  completeSubtitle: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },

  // Action Buttons
  actionContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.08)',
  },
  nextButton: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    color: BRAND_LILAC,
    textAlign: 'center',
    marginTop: 16,
  },

  // Diaspora Location Styles
  locationChoiceContainer: {
    gap: 16,
  },
  locationChoice: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.12)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationChoiceSelected: {
    borderColor: BRAND_LILAC,
    backgroundColor: '#fef7ff',
  },
  locationEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  locationChoiceText: {
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
    marginBottom: 4,
  },
  locationChoiceTextSelected: {
    color: BRAND_LILAC,
  },
  locationChoiceSubtext: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    textAlign: 'center',
  },

  // Checkbox Styles
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.18)',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: BRAND_LILAC,
    borderColor: BRAND_LILAC,
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Archivo_700Bold',
  },
  checkboxLabel: {
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    color: '#334155',
    flex: 1,
  },
});
