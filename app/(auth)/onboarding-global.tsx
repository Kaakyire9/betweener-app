import { useAppFonts } from "@/constants/fonts";
import Notice from "@/components/ui/Notice";
import { useAuth } from "@/lib/auth-context";
import { haptics } from "@/lib/haptics";
import {
  getCountryCodeByName,
  getPrioritizedCountries,
  findCountryByLabel,
  inferCountryFromPhoneNumber,
  type CountryOption,
} from "@/lib/location/countries";
import { toFlagEmoji } from "@/lib/location/location-display";
import { isLikelyNetworkError } from "@/lib/network";
import { useStepValidationGuidance } from "@/lib/onboarding/use-step-validation-guidance";
import { normalizeOtherText, resolveOtherValue } from "@/lib/profile/other-option";
import { RELIGION_LABELS, isReligionEnumError, normalizeReligionForProfile } from "@/lib/profile/religion";
import { type ResponsiveMetrics, useResponsiveMetrics } from "@/lib/responsive";
import { captureSignupContext, clearSignupSession, consumeSignupMetadata, finalizeSignupPhoneVerification, getSignupPhoneState } from "@/lib/signup-tracking";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/telemetry/logger";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const BRAND_TEAL = '#0C6E7A';
const BRAND_LILAC = '#C9A7FF';
const BRAND_INK = '#0F172A';

const LOGO = require('../../assets/images/foreground-icon.png');

const REGIONS = [
  "Africa",
  "North America",
  "South America",
  "Europe",
  "Asia",
  "Oceania",
  "Middle East",
];
const TRIBES = [
  "African",
  "Caribbean",
  "European",
  "Latin American",
  "Middle Eastern",
  "Asian",
  "Mixed",
  "Other",
];
const RELIGIONS = RELIGION_LABELS;
const INTERESTS = [
  "Music",
  "Travel",
  "Food",
  "Fitness",
  "Movies",
  "Gaming",
  "Reading",
  "Art",
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
  {
    id: 'welcome',
    title: '🌍 Where worlds apart feel closer',
    subtitle: 'A more intentional way to meet',
  },
  { id: 'basic', title: 'Basic Info', subtitle: 'Tell us about yourself' },
  { id: 'photo', title: 'Profile Photo', subtitle: 'Show your best self' },
  { id: 'location', title: 'Location', subtitle: 'Where are you from?' },
  { id: 'preferences', title: 'Preferences', subtitle: 'What interests you?' },
  { id: 'dating', title: 'Dating', subtitle: 'Your ideal match' },
  { id: 'complete', title: 'Complete', subtitle: "You're all set!" }
];

const STEP_FIELD_ORDER = {
  1: ["fullName", "age", "gender", "bio", "occupation"],
  2: ["profilePic"],
  3: ["currentCountry", "region", "tribe", "religion"],
  4: ["interests"],
  5: ["minAgeInterest", "maxAgeInterest"],
} as const;

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile, user, profile, signOut, refreshProfile, phoneVerified } = useAuth();
  const fontsLoaded = useAppFonts();
  const responsive = useResponsiveMetrics();
  const styles = useMemo(() => createStyles(responsive), [responsive]);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [customOccupation, setCustomOccupation] = useState("");
  const [customTribe, setCustomTribe] = useState("");
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countryPickerTarget, setCountryPickerTarget] = useState<"current" | "origin">("current");
  const [countrySearch, setCountrySearch] = useState("");
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
    currentCountry: "",
    originCountry: "",
  });

  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [profileCreated, setProfileCreated] = useState(false);
  const [saveNetworkError, setSaveNetworkError] = useState<string | null>(null);
  const [submitDebugId, setSubmitDebugId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const submitAttemptRef = useRef(0);
  const { errorSummary, onFieldLayout, revealValidationErrors, setStepScrollRef } =
    useStepValidationGuidance({
      currentStep,
      errors,
      fieldOrderByStep: STEP_FIELD_ORDER,
      scrollOffset: 28,
    });
  const selectedCountry = useMemo(
    () => findCountryByLabel(form.currentCountry),
    [form.currentCountry],
  );
  const selectedOriginCountry = useMemo(
    () => findCountryByLabel(form.originCountry),
    [form.originCountry],
  );
  const countryPickerData = useMemo(
    () => getPrioritizedCountries(countrySearch),
    [countrySearch],
  );
  const selectedCountryFlag = selectedCountry ? toFlagEmoji(selectedCountry.code) : '';
  const selectedOriginCountryFlag = selectedOriginCountry ? toFlagEmoji(selectedOriginCountry.code) : '';

  useEffect(() => {
    let active = true;

    const deriveNameFromMetadata = () => {
      const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = String(metadata.full_name ?? metadata.name ?? "").trim();
      if (fullName) return fullName;

      const givenName = String(metadata.given_name ?? "").trim();
      const familyName = String(metadata.family_name ?? "").trim();
      const combinedName = [givenName, familyName].filter(Boolean).join(" ").trim();
      if (combinedName) return combinedName;

      return "";
    };

    void (async () => {
      if (form.fullName.trim()) return;
      const signupMetadata = await consumeSignupMetadata();
      if (!active) return;

      const nextFullName =
        String(profile?.full_name ?? "").trim() ||
        String(signupMetadata.auth_name ?? "").trim() ||
        deriveNameFromMetadata();

      if (!nextFullName) return;
      setForm((prev) => (prev.fullName.trim() ? prev : { ...prev, fullName: nextFullName }));
    })();

    return () => {
      active = false;
    };
  }, [form.fullName, profile?.full_name, user?.app_metadata?.provider, user?.email, user?.user_metadata]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (form.currentCountry) return;
      try {
        const phoneState = await getSignupPhoneState();
        if (!active) return;
        const phoneCountry = inferCountryFromPhoneNumber(phoneState.phoneNumber);
        if (phoneCountry) {
          setForm((prev) => (prev.currentCountry ? prev : { ...prev, currentCountry: phoneCountry.label }));
          return;
        }

        const context = await captureSignupContext();
        if (!active) return;
        const detectedCountry = String(context?.ipInfo?.country || '').trim();
        if (!detectedCountry) return;
        const exactOption = findCountryByLabel(detectedCountry);
        if (exactOption) {
          setForm((prev) => (prev.currentCountry ? prev : { ...prev, currentCountry: exactOption.label }));
        }
      } catch {
        // best-effort only
      }
    })();
    return () => {
      active = false;
    };
  }, [form.currentCountry]);

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
    } catch (_error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const validateStep = (step: number) => {
    const newErrors: { [key: string]: string } = {};
    const resolvedOccupation = resolveOtherValue(form.occupation, customOccupation);
    const resolvedTribe = resolveOtherValue(form.tribe, customTribe);
    
    switch (step) {
      case 1: // Basic Info
        if (!form.fullName.trim()) newErrors.fullName = "Full name is required.";
        if (!form.age || Number(form.age) < 18) newErrors.age = "You must be at least 18.";
        if (!form.gender) newErrors.gender = "Gender is required.";
        if (!form.bio.trim()) newErrors.bio = "Bio is required.";
        if (!resolvedOccupation)
          newErrors.occupation = "Please enter your occupation.";
        break;
      case 2: // Photo
        if (!image) newErrors.profilePic = "Profile picture is required.";
        break;
      case 3: // Location
        if (!form.region) newErrors.region = "Region is required.";
        if (!resolvedTribe) newErrors.tribe = "Please enter your cultural background.";
        if (!form.religion) newErrors.religion = "Religion is required.";
        if (!form.currentCountry) {
          newErrors.currentCountry = "Please select your current country.";
        }
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
    if (Object.keys(newErrors).length > 0) {
      revealValidationErrors(step, newErrors);
    }
    return Object.keys(newErrors).length === 0;
  };

  const renderValidationNotice = () =>
    errorSummary ? (
      <Notice
        title="Finish the highlighted details"
        message={errorSummary}
        icon="alert-circle-outline"
        actionLabel="Show me"
        onAction={() => revealValidationErrors(currentStep, errors)}
      />
    ) : null;

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
        setCurrentStep(step);
        setMessage("");
        return;
      }
    }

    const attempt = ++submitAttemptRef.current;
    const debugId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    setSubmitDebugId(debugId);

    setLoading(true);
    setMessage("");
    setSaveNetworkError(null);

    let watchdog: ReturnType<typeof setTimeout> | null = null;

    try {
      logger.info("[onboarding] submit start", {
        debugId,
        attempt,
        step: ONBOARDING_STEPS[currentStep]?.id ?? currentStep,
        platform: Platform.OS,
        hasUser: !!user?.id,
        hasImage: !!image,
      });

      const withTimeout = async <T,>(label: string, promise: PromiseLike<T>, ms: number): Promise<T> => {
        const start = Date.now();
        const result = await Promise.race([
          Promise.resolve(promise),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms)
          ),
        ]);
        logger.debug("[onboarding] step ok", { debugId, attempt, label, ms: Date.now() - start });
        return result;
      };

      // Hard stop for the "stuck spinner" problem: if we haven't finished in 25s,
      // surface a retry UI and log a breadcrumb for Sentry.
      watchdog = setTimeout(() => {
        if (submitAttemptRef.current !== attempt) return;
        logger.warn("[onboarding] submit watchdog timeout", { debugId, attempt });
        setSaveNetworkError("This is taking longer than expected. Please check your connection and tap Retry.");
        setMessage("");
        setLoading(false);
      }, 25_000);

      const signupPhoneState = await withTimeout("signup_phone_state", getSignupPhoneState(), 4000);
      const isPhoneVerified = phoneVerified || signupPhoneState.verified;
      let phoneNumber: string | null = signupPhoneState.phoneNumber ?? null;

      if (isPhoneVerified && !phoneNumber && user?.id) {
        // Prefer profiles as source of truth; avoid RPC calls here (can hang on mobile networks).
        try {
          const { data: phoneRow, error: phoneRowError } = await Promise.race([
            supabase
              .from("profiles")
              .select("phone_number")
              .eq("user_id", user.id)
              .limit(1)
              .maybeSingle(),
            new Promise<{ data: null; error: Error }>((resolve) =>
              setTimeout(() => resolve({ data: null, error: new Error("phone_number_timeout") }), 2500)
            ),
          ]);
          if (!phoneRowError) {
            const serverPhone = (phoneRow as { phone_number?: string | null } | null)?.phone_number ?? null;
            if (serverPhone) phoneNumber = serverPhone;
          }
        } catch {
          // best-effort only
        }
      }

      if (!isPhoneVerified) {
        Alert.alert(
          "Phone verification required",
          "Please verify your phone number before creating your profile."
        );
        router.replace({
          pathname: "/(auth)/verify-phone",
          params: {
            next: encodeURIComponent("/(auth)/onboarding"),
            reason: "required_for_access",
          },
        });
        return;
      }

      const { data: existingPhoneProfile, error: phoneLookupError } = phoneNumber
        ? await withTimeout(
            "phone_lookup",
            supabase
              .from("profiles")
              .select("user_id")
              .eq("phone_number", phoneNumber)
              .is("deleted_at", null)
              .maybeSingle(),
            8000
          )
        : { data: null, error: null };

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
        const response = await withTimeout("image_fetch", fetch(image), 8000);
        const arrayBuffer = await withTimeout("image_arraybuffer", response.arrayBuffer(), 8000);
        const fileBody = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await withTimeout(
          "image_upload",
          supabase.storage.from("profiles").upload(fileName, fileBody, {
            contentType: `image/${fileExt}`,
          }),
          20_000
        );

        if (uploadError) {
          throw new Error(`Image upload failed: ${uploadError.message}`);
        }

        const { data } = supabase.storage.from("profiles").getPublicUrl(fileName);
        imageUrl = data.publicUrl;
      }

      // Safety check for gender field
      if (!form.gender || form.gender.trim() === '') {
        Alert.alert("Error", "Please select your gender before continuing.");
        return;
      }

      const resolvedCurrentCountryOption =
        findCountryByLabel(form.currentCountry) ??
        inferCountryFromPhoneNumber(phoneNumber);
      const resolvedCurrentCountry =
        resolvedCurrentCountryOption?.label ?? form.currentCountry.trim();
      const resolvedCurrentCountryCode =
        resolvedCurrentCountryOption?.code ?? getCountryCodeByName(form.currentCountry);

      if (!resolvedCurrentCountry || !resolvedCurrentCountryCode) {
        Alert.alert("Error", "Please select your current country before continuing.");
        return;
      }
      
      const profileData = {
        full_name: form.fullName,
        age: Number(form.age),
        gender: form.gender.toUpperCase() as any,
        bio: form.bio,
        occupation: resolveOtherValue(form.occupation, customOccupation),
        region: null,
        tribe: resolveOtherValue(form.tribe, customTribe),
        religion: normalizeReligionForProfile(form.religion) as any,
        avatar_url: imageUrl,
        phone_number: phoneNumber,
        phone_verified: true,
        min_age_interest: Number(form.minAgeInterest),
        max_age_interest: Number(form.maxAgeInterest),
        city: null,
        location: resolvedCurrentCountry,
        location_precision: "CITY" as const,
        current_country: resolvedCurrentCountry,
        current_country_code: resolvedCurrentCountryCode,
        origin_country: form.originCountry || (resolvedCurrentCountry === "Ghana" ? "Ghana" : null),
        origin_country_code: form.originCountry
          ? getCountryCodeByName(form.originCountry)
          : resolvedCurrentCountry === "Ghana"
            ? "GH"
            : null,
        origin_country_source: form.originCountry ? "explicit" : resolvedCurrentCountry === "Ghana" ? "residence_backfill" : "unknown",
        years_in_diaspora: 0,
        profile_completed: true,
        identity_status: "active",
        onboarding_completed_at: new Date().toISOString(),
        identity_finalized_at: new Date().toISOString(),
      };

      let { error: updateError } = await withTimeout("profile_upsert", updateProfile(profileData), 20_000);

      if (updateError && profileData.religion !== "OTHER" && isReligionEnumError(updateError)) {
        logger.warn("[onboarding-global] religion_enum_value_not_supported", {
          debugId,
          attempt,
          religion: profileData.religion,
        });
        ({ error: updateError } = await withTimeout(
          "profile_upsert_religion_fallback",
          updateProfile({ ...profileData, religion: "OTHER" as any }),
          20_000
        ));
      }

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

      await withTimeout("finalize_signup_verification", finalizeSignupPhoneVerification(), 6000);
      await withTimeout("clear_signup_session", clearSignupSession(), 4000);
      setMessage("Profile created successfully! Welcome to Betweener!");
      void haptics.success();
      
      setProfileCreated(true);
      
      // Best-effort refresh so the auth guard doesn't bounce us back into onboarding.
      // Never block navigation indefinitely.
      setTimeout(() => {
        void (async () => {
          try {
            await Promise.race([refreshProfile(), new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
          } catch (e) {
            logger.warn("[onboarding] refreshProfile failed", { debugId, attempt, error: String((e as any)?.message || e) });
          } finally {
            try {
              router.dismissAll();
              router.replace("/(tabs)/vibes");
            } catch (e) {
              logger.error("[onboarding] navigation failed", e, { debugId, attempt });
            }
          }
        })();
      }, 600);
    } catch (error: any) {
      if (isLikelyNetworkError(error)) {
        setSaveNetworkError("We couldn't save your profile. Check your connection and try again.");
        setMessage("");
      } else {
        setMessage(error?.message || "An error occurred");
      }
      logger.error("[onboarding] submit failed", error, {
        debugId,
        attempt,
        step: ONBOARDING_STEPS[currentStep]?.id ?? currentStep,
        likelyNetwork: isLikelyNetworkError(error),
      });
    } finally {
      if (watchdog) clearTimeout(watchdog);
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
              name={isDone ? 'check-circle' : isActive ? 'circle-slice-8' : 'circle-outline'}
              size={isActive ? 20 : 17}
              color={isDone || isActive ? BRAND_TEAL : 'rgba(15,23,42,0.22)'}
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
                  name="star-four-points"
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
        {currentStep === 0 ? (
          <>
            <Text style={styles.stepKicker}>Welcome</Text>
            <Text style={styles.stepTitle}>{ONBOARDING_STEPS[currentStep].title}</Text>
            <Text style={styles.stepSubtitle}>{ONBOARDING_STEPS[currentStep].subtitle}</Text>
          </>
        ) : (
          <>
            <Text style={styles.stepKicker}>{`Step ${currentStep + 1} of ${ONBOARDING_STEPS.length}`}</Text>
            <Text style={styles.stepTitle}>{ONBOARDING_STEPS[currentStep].title}</Text>
            <Text style={styles.stepSubtitle}>{ONBOARDING_STEPS[currentStep].subtitle}</Text>
          </>
        )}
      </View>
      
      <View style={styles.headerRight}>
      </View>
    </View>
  );

  const renderWelcomeStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.welcomeScrollContent}>
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

          <TouchableOpacity
            style={[styles.welcomeSignOutLink, signingOut && styles.welcomeSignOutLinkDisabled]}
            onPress={() => void handleWelcomeSignOut()}
            disabled={signingOut}
            accessibilityLabel="Sign out"
          >
            {signingOut ? (
              <ActivityIndicator size="small" color={BRAND_TEAL} />
            ) : (
              <Text style={styles.welcomeSignOutText}>Using the wrong account? Sign out</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Animated.View>
  );

  const handleWelcomeSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await haptics.light();
      await clearSignupSession();
      await signOut();
      router.replace("/(auth)/welcome");
    } catch (error) {
      logger.error("[onboarding-global] welcome_sign_out_failed", { error });
      Alert.alert("Sign out failed", "Unable to sign out right now. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const renderBasicInfoStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView
        ref={(node) => setStepScrollRef(1, node)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.formScrollContent}
      >
        {renderValidationNotice()}
        <View style={styles.formCard}>
          <LinearGradient
            colors={["rgba(255,255,255,0.96)", "rgba(238,226,212,0.96)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.formCardInner}
          >
            <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(1, "fullName", event)}>
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
              <View
                style={[styles.inputContainer, { flex: 1 }]}
                onLayout={(event) => onFieldLayout(1, "age", event)}
              >
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

            <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(1, "gender", event)}>
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

            <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(1, "bio", event)}>
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

            <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(1, "occupation", event)}>
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
                    if (normalizeOtherText(text)) {
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
      {renderValidationNotice()}
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

  const selectCountry = (country: CountryOption) => {
    setForm((prev) => (
      countryPickerTarget === "origin"
        ? { ...prev, originCountry: country.label }
        : { ...prev, currentCountry: country.label }
    ));
    if (countryPickerTarget === "current") {
      setErrors((prev) => ({ ...prev, currentCountry: "" }));
    }
    setCountrySearch("");
    setCountryModalVisible(false);
  };

  const renderCountryPicker = () => (
    <Modal
      visible={countryModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setCountryModalVisible(false)}
    >
      <SafeAreaView style={styles.countryModal}>
        <View style={styles.countryModalHeader}>
          <TouchableOpacity onPress={() => setCountryModalVisible(false)} style={styles.countryModalClose}>
            <MaterialCommunityIcons name="close" size={22} color={BRAND_INK} />
          </TouchableOpacity>
          <Text style={styles.countryModalTitle}>
            {countryPickerTarget === "origin" ? "Origin country" : "Current country"}
          </Text>
          <View style={styles.countryModalClose} />
        </View>

        <View style={styles.countrySearchWrap}>
          <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
          <TextInput
            value={countrySearch}
            onChangeText={setCountrySearch}
            placeholder="Search country or code"
            placeholderTextColor="#94A3B8"
            autoCapitalize="words"
            autoCorrect={false}
            style={styles.countrySearchInput}
          />
        </View>

        <FlatList
          data={countryPickerData}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.countryListContent}
          ListHeaderComponent={
            countrySearch.trim() ? null : (
              <Text style={styles.countryListHeader}>Suggested and all countries</Text>
            )
          }
          renderItem={({ item }) => {
            const selected =
              (countryPickerTarget === "origin" ? selectedOriginCountry?.code : selectedCountry?.code) === item.code;
            const flag = toFlagEmoji(item.code);
            return (
              <TouchableOpacity
                onPress={() => selectCountry(item)}
                style={[styles.countryRow, selected && styles.countryRowSelected]}
              >
                <Text style={styles.countryFlag}>{flag}</Text>
                <View style={styles.countryRowText}>
                  <Text style={styles.countryName}>{item.label}</Text>
                  <Text style={styles.countryDial}>{item.dial}</Text>
                </View>
                {selected ? <MaterialCommunityIcons name="check-circle" size={20} color={BRAND_TEAL} /> : null}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );

  const renderLocationStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView ref={(node) => setStepScrollRef(3, node)} showsVerticalScrollIndicator={false}>
        {renderValidationNotice()}
        <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(3, "currentCountry", event)}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Current Country</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>Required</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.countrySelect, errors.currentCountry && styles.inputError]}
            onPress={() => {
              setCountryPickerTarget("current");
              setCountryModalVisible(true);
            }}
            activeOpacity={0.88}
          >
            <View style={styles.countrySelectLeft}>
              <Text style={styles.countrySelectFlag}>{selectedCountryFlag || '--'}</Text>
              <View style={styles.countrySelectCopy}>
                <Text style={[styles.countrySelectText, !form.currentCountry && styles.countrySelectPlaceholder]}>
                  {form.currentCountry || 'Select current country'}
                </Text>
                <Text style={styles.countrySelectHint}>
                  {selectedCountry ? `${selectedCountry.dial} - ${selectedCountry.code}` : 'Used for discovery and location display'}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={22} color={BRAND_TEAL} />
          </TouchableOpacity>
          <Text style={styles.countryHelperText}>
            We may suggest this from your verified phone. Change it if you currently live elsewhere.
          </Text>
          {errors.currentCountry && <Text style={styles.errorText}>{errors.currentCountry}</Text>}
        </View>

        <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(3, "region", event)}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Origin Country</Text>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeText}>Optional</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.countrySelect}
            onPress={() => {
              setCountryPickerTarget("origin");
              setCountryModalVisible(true);
            }}
            activeOpacity={0.88}
          >
            <View style={styles.countrySelectLeft}>
              <Text style={styles.countrySelectFlag}>{selectedOriginCountryFlag || '--'}</Text>
              <View style={styles.countrySelectCopy}>
                <Text style={[styles.countrySelectText, !form.originCountry && styles.countrySelectPlaceholder]}>
                  {form.originCountry || 'Select origin country'}
                </Text>
                <Text style={styles.countrySelectHint}>
                  {selectedOriginCountry
                    ? `${selectedOriginCountry.dial} - ${selectedOriginCountry.code}`
                    : 'Helps us connect diaspora with shared roots'}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={22} color={BRAND_TEAL} />
          </TouchableOpacity>
          <Text style={styles.countryHelperText}>
            This is where your roots are from, not necessarily where you live now.
          </Text>
        </View>

        <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(3, "tribe", event)}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Global Region</Text>
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
          <Text style={styles.countryHelperText}>
            This helps with diaspora matching. It is not used as your displayed location.
          </Text>
          {errors.region && <Text style={styles.errorText}>{errors.region}</Text>}
        </View>

        <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(3, "religion", event)}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Cultural background</Text>
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
                onPress={() => {
                  setForm((prev) => ({ ...prev, tribe }));
                  setErrors((prev) => ({ ...prev, tribe: "" }));
                  if (tribe !== "Other") {
                    setCustomTribe("");
                  }
                }}
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
          {form.tribe === "Other" ? (
            <TextInput
              style={[
                styles.input,
                focusedField === "customTribe" && styles.inputFocused,
                errors.tribe && styles.inputError,
              ]}
              value={customTribe}
              onChangeText={(text) => {
                setCustomTribe(text);
                if (normalizeOtherText(text)) {
                  setErrors((prev) => ({ ...prev, tribe: "" }));
                }
              }}
              placeholder="Enter your cultural background"
              placeholderTextColor="#9ca3af"
              onFocus={() => setFocusedField("customTribe")}
              onBlur={() => setFocusedField(null)}
            />
          ) : null}
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
      {renderCountryPicker()}
    </Animated.View>
  );

  const renderPreferencesStep = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView ref={(node) => setStepScrollRef(4, node)} showsVerticalScrollIndicator={false}>
        {renderValidationNotice()}
        <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(4, "interests", event)}>
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>Interests</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>Required</Text>
            </View>
          </View>
          <Text style={styles.inputHint}>{"Select what you're passionate about"}</Text>
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
      <ScrollView ref={(node) => setStepScrollRef(5, node)} showsVerticalScrollIndicator={false}>
        {renderValidationNotice()}
        <View style={styles.inputContainer} onLayout={(event) => onFieldLayout(5, "minAgeInterest", event)}>
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
        {saveNetworkError ? (
          <Notice
            title="No connection"
            message={saveNetworkError}
            actionLabel={loading ? "Saving..." : "Retry"}
            onAction={loading ? undefined : handleSubmit}
          />
        ) : null}
        {(saveNetworkError || message) && submitDebugId ? (
          <Text style={styles.debugText}>Debug ID: {submitDebugId}</Text>
        ) : null}
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
      colors={['#EEE0D1', '#FFF8F1', '#E8F5F2']}
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

const createStyles = (responsive: ResponsiveMetrics) => StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  
  // Progress Bar
  progressContainer: {
    marginHorizontal: responsive.compactWidth ? 12 : 16,
    marginTop: responsive.compactHeight ? 6 : 10,
    marginBottom: responsive.compactHeight ? 6 : 8,
    paddingHorizontal: responsive.space(14, { min: 12, max: 16 }),
    paddingTop: responsive.space(12, { min: 9, max: 13 }),
    paddingBottom: responsive.space(12, { min: 9, max: 13 }),
    borderRadius: responsive.compactWidth ? 22 : 24,
    overflow: 'hidden',
  },

  progressBand: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 24,
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
    height: 5,
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
    gap: responsive.space(10, { min: 7, max: 11 }),
    marginTop: responsive.space(10, { min: 7, max: 11 }),
    position: 'relative',
  },
  progressHeartWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressHeartActive: {
    backgroundColor: 'rgba(12,110,122,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(12,110,122,0.20)',
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
    marginHorizontal: responsive.compactWidth ? 12 : 16,
    marginTop: responsive.compactHeight ? 0 : 2,
    paddingHorizontal: responsive.space(14, { min: 12, max: 16 }),
    paddingVertical: responsive.space(12, { min: 9, max: 13 }),
    borderRadius: responsive.compactWidth ? 22 : 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.60)',
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  headerLeft: {
    width: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    minWidth: 72,
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  signOutButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND_TEAL,
  },
  signOutText: {
    fontSize: responsive.font(13, { min: 12, max: 14 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_TEAL,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.86)',
  },
  stepTitle: {
    fontSize: responsive.font(22, { min: 19, max: 23 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
    textAlign: 'center',
  },
  stepKicker: {
    fontSize: responsive.font(11, { min: 10, max: 12 }),
    fontFamily: 'Manrope_700Bold',
    color: BRAND_TEAL,
    textAlign: 'center',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: responsive.font(14, { min: 13, max: 15 }),
    fontFamily: 'Manrope_400Regular',
    color: '#445160',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 20,
  },
  // Content
  content: {
    flex: 1,
    paddingHorizontal: responsive.compactWidth ? 12 : 16,
  },
  stepContainer: {
    flex: 1,
    paddingTop: responsive.compactHeight ? 12 : 18,
  },
  formScrollContent: {
    paddingBottom: responsive.space(24, { min: 18, max: 28 }),
  },
  welcomeScrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === 'android' ? 12 : 0,
  },

    // Welcome Step
  welcomeContainer: {
    flex: 1,
    justifyContent: Platform.OS === 'android' ? 'flex-start' : 'center',
    alignItems: 'center',
    paddingHorizontal: responsive.compactWidth ? 14 : 20,
    paddingBottom: Platform.OS === 'android' ? 8 : 0,
  },
  heroCard: {
    width: '100%',
    marginTop: responsive.compactHeight ? 6 : 12,
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
    paddingVertical: responsive.compactHeight ? 24 : 36,
    paddingHorizontal: responsive.compactWidth ? 18 : 24,
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
    width: responsive.compactHeight ? 102 : 120,
    height: responsive.compactHeight ? 102 : 120,
    borderRadius: responsive.compactHeight ? 31 : 36,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(201,167,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: responsive.space(16, { min: 12, max: 18 }),
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
    width: responsive.compactHeight ? 78 : 92,
    height: responsive.compactHeight ? 78 : 92,
  },
  gradientTitleWrap: {
    marginTop: 6,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientTitleText: {
    fontSize: responsive.font(44, { min: 36, max: 46 }),
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
    fontSize: responsive.font(16, { min: 14, max: 17 }),
    fontFamily: 'Manrope_400Regular',
    color: '#445160',
    textAlign: 'center',
  },
  featureChipsRow: {
    marginTop: responsive.compactHeight ? 14 : Platform.OS === 'android' ? 16 : 22,
    gap: responsive.space(10, { min: 8, max: 12 }),
    width: '100%',
  },
  featureChip: {
    minHeight: responsive.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsive.space(10, { min: 8, max: 12 }),
    paddingVertical: responsive.space(12, { min: 9, max: 13 }),
    paddingHorizontal: responsive.space(16, { min: 14, max: 18 }),
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
    fontSize: responsive.font(13, { min: 12, max: 14 }),
    fontFamily: 'Archivo_700Bold',
    color: '#2f3a45',
  },
  welcomeSignOutLink: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeSignOutLinkDisabled: {
    opacity: 0.7,
  },
  welcomeSignOutText: {
    fontSize: responsive.font(13, { min: 12, max: 14 }),
    fontFamily: 'Manrope_600SemiBold',
    color: '#5A6772',
    textAlign: 'center',
  },

  // Form Elements
  formCard: {
    borderRadius: 30,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.58)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 9,
  },
  formCardInner: {
    borderRadius: 28,
    paddingHorizontal: responsive.compactWidth ? 14 : 18,
    paddingVertical: responsive.compactHeight ? 16 : 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,250,245,0.62)',
  },
  inputContainer: {
    marginBottom: responsive.space(20, { min: 15, max: 22 }),
    padding: responsive.space(12, { min: 10, max: 14 }),
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  inputRow: {
    flexDirection: 'row',
    gap: responsive.space(16, { min: 10, max: 18 }),
  },
  label: {
    fontSize: responsive.font(16, { min: 15, max: 17 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
    marginBottom: 8,
  },
  labelInline: {
    fontSize: responsive.font(16, { min: 15, max: 17 }),
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
    fontSize: responsive.font(11, { min: 10, max: 12 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_TEAL,
    letterSpacing: 0.3,
  },
  optionalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(100,116,139,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.18)',
  },
  optionalBadgeText: {
    fontSize: responsive.font(11, { min: 10, max: 12 }),
    fontFamily: 'Archivo_700Bold',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  inputHint: {
    fontSize: responsive.font(14, { min: 13, max: 15 }),
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 18,
    paddingHorizontal: responsive.space(16, { min: 14, max: 18 }),
    paddingVertical: responsive.space(14, { min: 12, max: 15 }),
    fontSize: responsive.font(16, { min: 15, max: 17 }),
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
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 18,
    paddingHorizontal: responsive.space(16, { min: 14, max: 18 }),
    paddingVertical: responsive.space(14, { min: 12, max: 15 }),
    fontSize: responsive.font(16, { min: 15, max: 17 }),
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
    fontSize: responsive.font(12, { min: 12, max: 13 }),
    fontFamily: 'Manrope_400Regular',
    color: '#ef4444',
    marginTop: 4,
  },

  // Gender Selection
  genderContainer: {
    flexDirection: 'row',
    gap: responsive.space(12, { min: 8, max: 14 }),
  },
  genderOption: {
    flex: 1,
    paddingVertical: responsive.space(14, { min: 12, max: 15 }),
    paddingHorizontal: responsive.space(16, { min: 10, max: 18 }),
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
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
    backgroundColor: 'rgba(12,110,122,0.12)',
    borderColor: BRAND_TEAL,
  },
  genderText: {
    fontSize: responsive.font(16, { min: 14, max: 17 }),
    fontFamily: 'Manrope_400Regular',
    color: '#334155',
  },
  genderTextSelected: {
    color: BRAND_TEAL,
    fontFamily: 'Archivo_700Bold',
  },

  // Photo Upload
  photoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoUpload: {
    marginBottom: responsive.space(24, { min: 18, max: 28 }),
  },
  photoPreview: {
    width: responsive.compactHeight ? 196 : 228,
    height: responsive.compactHeight ? 244 : 284,
    borderRadius: responsive.compactHeight ? 30 : 34,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
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
    fontSize: responsive.font(16, { min: 15, max: 17 }),
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    marginTop: 8,
  },
  photoHint: {
    fontSize: responsive.font(14, { min: 13, max: 15 }),
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: responsive.compactWidth ? 18 : 32,
  },

  countrySelect: {
    minHeight: 66,
    borderRadius: 22,
    paddingHorizontal: responsive.space(16, { min: 14, max: 18 }),
    paddingVertical: responsive.space(11, { min: 10, max: 13 }),
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  countrySelectLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countrySelectFlag: {
    minWidth: 30,
    fontSize: 22,
    textAlign: 'center',
  },
  countrySelectCopy: {
    flex: 1,
    minWidth: 0,
  },
  countrySelectText: {
    fontSize: responsive.font(16, { min: 15, max: 17 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
  },
  countrySelectPlaceholder: {
    color: '#64748B',
    fontFamily: 'Manrope_500Medium',
  },
  countrySelectHint: {
    marginTop: 3,
    fontSize: responsive.font(12, { min: 11, max: 13 }),
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
  },
  countryHelperText: {
    marginTop: 8,
    fontSize: responsive.font(12, { min: 11, max: 13 }),
    lineHeight: 17,
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
  },
  countryModal: {
    flex: 1,
    backgroundColor: '#FFF8F1',
  },
  countryModalHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.08)',
  },
  countryModalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryModalTitle: {
    fontSize: responsive.font(17, { min: 16, max: 18 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
  },
  countrySearchWrap: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  countrySearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: responsive.font(15, { min: 14, max: 16 }),
    fontFamily: 'Manrope_500Medium',
    color: BRAND_INK,
  },
  countryListContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 28,
  },
  countryListHeader: {
    marginBottom: 8,
    fontSize: responsive.font(12, { min: 11, max: 13 }),
    fontFamily: 'Manrope_700Bold',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  countryRow: {
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countryRowSelected: {
    borderColor: BRAND_TEAL,
    backgroundColor: 'rgba(12,110,122,0.10)',
  },
  countryFlag: {
    width: 30,
    fontSize: 22,
    textAlign: 'center',
  },
  countryRowText: {
    flex: 1,
    minWidth: 0,
  },
  countryName: {
    fontSize: responsive.font(15, { min: 14, max: 16 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
  },
  countryDial: {
    marginTop: 2,
    fontSize: responsive.font(12, { min: 11, max: 13 }),
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
  },

  // Grid Options
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: responsive.space(12, { min: 8, max: 14 }),
  },
  gridOption: {
    paddingVertical: responsive.space(12, { min: 10, max: 13 }),
    paddingHorizontal: responsive.space(20, { min: 14, max: 22 }),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    minWidth: '45%',
    alignItems: 'center',
  },
  gridOptionSelected: {
    backgroundColor: 'rgba(12,110,122,0.12)',
    borderColor: BRAND_TEAL,
  },
  gridOptionText: {
    fontSize: responsive.font(14, { min: 13, max: 15 }),
    fontFamily: 'Manrope_400Regular',
    color: '#334155',
  },
  gridOptionTextSelected: {
    color: BRAND_TEAL,
    fontFamily: 'Archivo_700Bold',
  },

  // Interests
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: responsive.space(12, { min: 8, max: 14 }),
  },
  interestChip: {
    paddingVertical: responsive.space(10, { min: 8, max: 11 }),
    paddingHorizontal: responsive.space(16, { min: 13, max: 18 }),
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  interestChipSelected: {
    backgroundColor: 'rgba(12,110,122,0.12)',
    borderColor: BRAND_TEAL,
  },
  interestChipText: {
    fontSize: responsive.font(14, { min: 13, max: 15 }),
    fontFamily: 'Manrope_400Regular',
    color: '#334155',
  },
  interestChipTextSelected: {
    color: BRAND_TEAL,
    fontFamily: 'Archivo_700Bold',
  },

  // Age Range
  ageRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsive.space(16, { min: 10, max: 18 }),
  },
  ageInputContainer: {
    flex: 1,
    alignItems: 'center',
  },
  ageLabel: {
    fontSize: responsive.font(14, { min: 13, max: 15 }),
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    marginBottom: 8,
  },
  ageInput: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 12,
    paddingVertical: responsive.space(14, { min: 12, max: 15 }),
    paddingHorizontal: responsive.space(16, { min: 14, max: 18 }),
    fontSize: responsive.font(18, { min: 16, max: 19 }),
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
    fontSize: responsive.font(16, { min: 15, max: 17 }),
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
  },

  // Complete Step
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: responsive.compactWidth ? 16 : 20,
  },
  completeTitle: {
    fontSize: responsive.font(28, { min: 25, max: 30 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
    textAlign: 'center',
    marginTop: responsive.space(24, { min: 18, max: 28 }),
    marginBottom: responsive.space(16, { min: 12, max: 18 }),
  },
  completeSubtitle: {
    fontSize: responsive.font(16, { min: 15, max: 17 }),
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: responsive.space(32, { min: 24, max: 36 }),
  },

  // Action Buttons
  actionContainer: {
    paddingHorizontal: responsive.compactWidth ? 12 : 16,
    paddingVertical: responsive.compactHeight ? 12 : 16,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.08)',
  },
  nextButton: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonGradient: {
    paddingVertical: responsive.space(17, { min: 15, max: 18 }),
    paddingHorizontal: responsive.space(24, { min: 20, max: 26 }),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextButtonText: {
    fontSize: responsive.font(16, { min: 15, max: 17 }),
    fontFamily: 'Archivo_700Bold',
    color: '#fff',
  },

  // Message
  messageText: {
    fontSize: responsive.font(14, { min: 13, max: 15 }),
    fontFamily: 'Manrope_400Regular',
    color: BRAND_LILAC,
    textAlign: 'center',
    marginTop: 16,
  },
  debugText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    color: 'rgba(15,23,42,0.55)',
    textAlign: 'center',
    marginTop: 10,
  },

  // Diaspora Location Styles
  locationChoiceContainer: {
    gap: responsive.space(16, { min: 12, max: 18 }),
  },
  locationChoice: {
    padding: responsive.space(20, { min: 16, max: 22 }),
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
    fontSize: responsive.font(32, { min: 28, max: 34 }),
    marginBottom: responsive.space(8, { min: 6, max: 10 }),
  },
  locationChoiceText: {
    fontSize: responsive.font(18, { min: 16, max: 19 }),
    fontFamily: 'Archivo_700Bold',
    color: BRAND_INK,
    marginBottom: 4,
  },
  locationChoiceTextSelected: {
    color: BRAND_LILAC,
  },
  locationChoiceSubtext: {
    fontSize: responsive.font(14, { min: 13, max: 15 }),
    fontFamily: 'Manrope_400Regular',
    color: '#52606D',
    textAlign: 'center',
  },

  // Checkbox Styles
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: responsive.space(12, { min: 10, max: 14 }),
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
    fontSize: responsive.font(16, { min: 15, max: 17 }),
    fontFamily: 'Manrope_400Regular',
    color: '#334155',
    flex: 1,
  },
});
