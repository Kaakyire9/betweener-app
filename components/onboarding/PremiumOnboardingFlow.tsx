import { useAppFonts } from "@/constants/fonts";
import { PremiumOnboardingDiscoveryStep } from "@/components/onboarding/steps/PremiumOnboardingDiscoveryStep";
import { PremiumOnboardingCompleteStep } from "@/components/onboarding/steps/PremiumOnboardingCompleteStep";
import { createPremiumOnboardingStyles } from "@/components/onboarding/PremiumOnboardingFlow.styles";
import { PremiumOnboardingCountryPickerModal } from "@/components/onboarding/steps/PremiumOnboardingCountryPickerModal";
import { PremiumOnboardingIdentityStep } from "@/components/onboarding/steps/PremiumOnboardingIdentityStep";
import { PremiumOnboardingProgressBar } from "@/components/onboarding/steps/PremiumOnboardingProgressBar";
import { PremiumOnboardingSignOutMenu } from "@/components/onboarding/steps/PremiumOnboardingSignOutMenu";
import { PremiumOnboardingStepFrame } from "@/components/onboarding/steps/PremiumOnboardingStepFrame";
import { PremiumOnboardingTopBar } from "@/components/onboarding/steps/PremiumOnboardingTopBar";
import { PremiumOnboardingWelcomeStep } from "@/components/onboarding/steps/PremiumOnboardingWelcomeStep";
import { useAuth } from "@/lib/auth-context";
import { haptics } from "@/lib/haptics";
import {
  getPremiumOnboardingSteps,
  PREMIUM_ONBOARDING_GHANA_REGIONS,
  PREMIUM_ONBOARDING_GLOBAL_REGIONS,
  PREMIUM_ONBOARDING_INTERESTS,
  PREMIUM_ONBOARDING_INTENTS,
  PREMIUM_ONBOARDING_OCCUPATIONS,
  PREMIUM_ONBOARDING_ROOTS_OPTIONS,
  PREMIUM_ONBOARDING_ROOTS_VISIBILITY,
  PREMIUM_ONBOARDING_ROUTE_META,
  PREMIUM_ONBOARDING_TRIBES,
} from "@/lib/onboarding/premium-onboarding.config";
import {
  buildPremiumOnboardingProfileData,
  updateProfileWithFallbacks,
} from "@/lib/onboarding/premium-onboarding.submit";
import {
  type PremiumOnboardingFormState as FormState,
  type PremiumOnboardingStepKey as StepKey,
  type PremiumOnboardingVariant as Variant,
} from "@/lib/onboarding/premium-onboarding.types";
import { validatePremiumOnboardingStep } from "@/lib/onboarding/premium-onboarding.validation";
import { resolveOnboardingVariant } from '@/lib/onboarding/onboarding-routing';
import {
  findCountryByLabel,
  getPrioritizedCountries,
  inferCountryFromPhoneNumber,
  type CountryOption,
} from "@/lib/location/countries";
import { isLikelyNetworkError } from "@/lib/network";
import { RELIGION_OPTIONS } from "@/lib/profile/religion";
import { useResponsiveMetrics } from "@/lib/responsive";
import {
  captureSignupContext,
  clearSignupSession,
  consumeSignupMetadata,
  finalizeSignupPhoneVerification,
  getSignupPhoneState,
  setSignupOnboardingVariant,
} from "@/lib/signup-tracking";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/telemetry/logger";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function PremiumOnboardingFlow({ variant }: { variant: Variant }) {
  const fontsLoaded = useAppFonts();
  const responsive = useResponsiveMetrics();
  const meta = PREMIUM_ONBOARDING_ROUTE_META[variant];
  const steps = useMemo(() => getPremiumOnboardingSteps(variant), [variant]);
  const styles = useMemo(() => createPremiumOnboardingStyles(responsive, meta.dark), [meta.dark, responsive]);
  const { updateProfile, user, profile, signOut, refreshProfile, phoneVerified } = useAuth();
  const [routeValidated, setRouteValidated] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<FormState>({
    fullName: "",
    age: "",
    gender: "",
    bio: "",
    occupation: "",
    currentCountry: "",
    originCountry: "",
    region: "",
    city: "",
    cityDistrict: "",
    cityLocalityGeonameId: null,
    cityAdmin1Code: "",
    cityLatitude: null,
    cityLongitude: null,
    tribe: "",
    roots: [],
    rootsNote: "",
    rootsVisibility: "VISIBLE",
    religion: "",
    interests: [],
    lookingFor: "",
    minAgeInterest: "24",
    maxAgeInterest: "34",
  });
  const [customOccupation, setCustomOccupation] = useState("");
  const [customTribe, setCustomTribe] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [saveNetworkError, setSaveNetworkError] = useState<string | null>(null);
  const [profileCreated, setProfileCreated] = useState(false);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countryPickerTarget, setCountryPickerTarget] = useState<"current" | "origin">("current");
  const [countrySearch, setCountrySearch] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutMenuVisible, setSignOutMenuVisible] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const transitionDirectionRef = useRef<"forward" | "back">("forward");
  const submitAttemptRef = useRef(0);
  const currentCountrySearchTrackedRef = useRef(false);
  const currentLocationTelemetryRef = useRef({
    enteredAt: 0,
    exitReason: null as string | null,
    regionSelected: false,
    pickerOpened: false,
    searched: false,
    localitySelected: false,
    lastRegion: null as string | null,
  });

  const currentStep = steps[stepIndex];
  const currentCountry = useMemo(() => findCountryByLabel(form.currentCountry), [form.currentCountry]);
  const originCountry = useMemo(() => findCountryByLabel(form.originCountry), [form.originCountry]);
  const countryData = useMemo(() => getPrioritizedCountries(countrySearch), [countrySearch]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const signupState = await getSignupPhoneState();
      if (!active) return;

      const phoneNumber = profile?.phone_number || signupState.phoneNumber || '';
      const phoneCountryCode = inferCountryFromPhoneNumber(phoneNumber)?.code ?? null;
      const target = resolveOnboardingVariant({
        explicitVariant: variant,
        profileVariant: (profile as any)?.onboarding_variant,
        countryLockPolicy: (profile as any)?.country_lock_policy,
        currentCountryCode: (profile as any)?.current_country_code,
        currentCountry: (profile as any)?.current_country,
        originCountryCode: (profile as any)?.origin_country_code,
        originCountry: (profile as any)?.origin_country,
        phoneCountryCode,
      });

      if (target !== variant) {
        await setSignupOnboardingVariant(target);
        if (!active) return;
        router.replace(`/(auth)/onboarding-${target}`);
        return;
      }

      await setSignupOnboardingVariant(target);
      if (!active) return;
      setRouteValidated(true);
    })();

    return () => {
      active = false;
    };
  }, [profile, variant]);

  useEffect(() => {
    if (routeValidated && variant === "ghana") {
      logger.info("[onboarding] ghana_onboarding_welcome_viewed", { variant });
    }
  }, [routeValidated, variant]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: stepIndex / Math.max(steps.length - 1, 1),
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [progressAnim, stepIndex, steps.length]);

  useEffect(() => {
    let active = true;
    const deriveNameFromMetadata = () => {
      const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = String(metadata.full_name ?? metadata.name ?? "").trim();
      if (fullName) return fullName;
      return [metadata.given_name, metadata.family_name].map((value) => String(value ?? "").trim()).filter(Boolean).join(" ");
    };

    void (async () => {
      if (form.fullName.trim()) return;
      const signupMetadata = await consumeSignupMetadata();
      if (!active) return;
      const nextFullName =
        String(profile?.full_name ?? "").trim() ||
        String(signupMetadata.auth_name ?? "").trim() ||
        deriveNameFromMetadata();
      if (nextFullName) setForm((prev) => (prev.fullName.trim() ? prev : { ...prev, fullName: nextFullName }));
    })();

    return () => {
      active = false;
    };
  }, [form.fullName, profile?.full_name, user?.user_metadata]);

  useEffect(() => {
    if (variant !== "global" || form.currentCountry) return;
    let active = true;
    void (async () => {
      try {
        const phoneState = await getSignupPhoneState();
        if (!active) return;
        const phoneCountry = inferCountryFromPhoneNumber(phoneState.phoneNumber);
        if (phoneCountry) {
          setForm((prev) => ({ ...prev, currentCountry: prev.currentCountry || phoneCountry.label }));
          return;
        }
        const context = await captureSignupContext();
        if (!active) return;
        const detectedCountry = String(context?.ipInfo?.country || "").trim();
        const exactOption = detectedCountry ? findCountryByLabel(detectedCountry) : null;
        if (exactOption) setForm((prev) => ({ ...prev, currentCountry: prev.currentCountry || exactOption.label }));
      } catch {
        // Best-effort only.
      }
    })();
    return () => {
      active = false;
    };
  }, [form.currentCountry, variant]);

  useEffect(() => {
    if (currentStep.key !== "current_location") return;

    const initialRegion = form.region.trim() || null;
    const initialHasCity = !!form.city.trim();

    currentLocationTelemetryRef.current = {
      enteredAt: Date.now(),
      exitReason: null,
      regionSelected: !!initialRegion,
      pickerOpened: false,
      searched: false,
      localitySelected: initialHasCity,
      lastRegion: initialRegion,
    };

    logger.info("[onboarding] current_location_step_viewed", {
      variant,
      stepIndex,
      hasRegion: !!initialRegion,
      hasCity: initialHasCity,
      region: initialRegion,
    });

    return () => {
      const snapshot = currentLocationTelemetryRef.current;
      logger.info("[onboarding] current_location_step_exit", {
        variant,
        stepIndex,
        exitReason: snapshot.exitReason ?? "untracked",
        dwellMs: snapshot.enteredAt ? Date.now() - snapshot.enteredAt : null,
        hasRegion: snapshot.regionSelected,
        hasCity: snapshot.localitySelected,
        region: snapshot.lastRegion ?? null,
        regionSelected: snapshot.regionSelected,
        pickerOpened: snapshot.pickerOpened,
        searched: snapshot.searched,
        localitySelected: snapshot.localitySelected,
      });
    };
  }, [currentStep.key, stepIndex, variant]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const setOption = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    void haptics.tap();
    setForm((prev) => {
      if (key === "region") {
        const nextRegion = String(value ?? "").trim();
        const previousRegion = String(prev.region ?? "").trim();
        if (nextRegion !== previousRegion) {
          return {
            ...prev,
            region: value as FormState["region"],
            city: "",
            cityDistrict: "",
            cityLocalityGeonameId: null,
          };
        }
      }
      return { ...prev, [key]: value };
    });
    setErrors((prev) => ({
      ...prev,
      [key]: "",
      ...(key === "region"
        ? {
            city: "",
            cityDistrict: "",
            cityLocalityGeonameId: null,
          }
        : {}),
    }));
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.88,
      });
      if (!result.canceled && result.assets[0]) {
        const manipulatedImage = await manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 720, height: 720 } }],
          { compress: 0.86, format: SaveFormat.JPEG },
        );
        setImage(manipulatedImage.uri);
        setErrors((prev) => ({ ...prev, profilePic: "" }));
      }
    } catch {
      Alert.alert("Photo unavailable", "We couldn't open your photo library. Please try again.");
    }
  };

  const validateStep = (step: StepKey) => {
    const nextErrors = validatePremiumOnboardingStep({
      step,
      form,
      variant,
      customOccupation,
      customTribe,
      hasImage: !!image,
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCurrentLocationAnalyticsEvent = (event: string, payload?: Record<string, unknown>) => {
    const nextRegion =
      typeof payload?.region === "string" && payload.region.trim()
        ? payload.region.trim()
        : form.region.trim() || null;

    switch (event) {
      case "region_selected":
        currentLocationTelemetryRef.current.regionSelected = true;
        currentLocationTelemetryRef.current.lastRegion = nextRegion;
        break;
      case "country_selected":
        currentLocationTelemetryRef.current.lastRegion = nextRegion;
        break;
      case "picker_opened":
      case "country_picker_opened":
        currentLocationTelemetryRef.current.pickerOpened = true;
        currentLocationTelemetryRef.current.lastRegion = nextRegion;
        break;
      case "search_started":
      case "country_search_started":
        currentLocationTelemetryRef.current.searched = true;
        currentLocationTelemetryRef.current.lastRegion = nextRegion;
        break;
      case "locality_selected":
        currentLocationTelemetryRef.current.localitySelected = true;
        currentLocationTelemetryRef.current.lastRegion = nextRegion;
        break;
      default:
        break;
    }

    logger.info(`[onboarding] current_location_${event}`, {
      variant,
      stepIndex,
      ...payload,
    });
  };

  const next = () => {
    transitionDirectionRef.current = "forward";
    if (currentStep.key === "welcome") {
      if (variant === "ghana") logger.info("[onboarding] ghana_onboarding_started", { variant });
      void haptics.light();
      setStepIndex((value) => Math.min(value + 1, steps.length - 1));
      return;
    }
    if (!validateStep(currentStep.key)) return;
    if (currentStep.key === "complete") {
      void submit();
      return;
    }
    if (currentStep.key === "current_location") {
      currentLocationTelemetryRef.current.exitReason = "continue";
    }
    setStepIndex((value) => Math.min(value + 1, steps.length - 1));
  };

  const back = () => {
    transitionDirectionRef.current = "back";
    if (currentStep.key === "current_location") {
      currentLocationTelemetryRef.current.exitReason = "back";
    }
    setErrors({});
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  const selectCountry = (country: CountryOption) => {
    if (countryPickerTarget === "current") {
      if (form.currentCountry !== country.label) {
        updateForm("region", "");
        updateForm("city", "");
        updateForm("cityDistrict", "");
        updateForm("cityLocalityGeonameId", null);
        updateForm("cityAdmin1Code", "");
        updateForm("cityLatitude", null);
        updateForm("cityLongitude", null);
      }
      updateForm("currentCountry", country.label);
      if (currentStep.key === "current_location") {
        handleCurrentLocationAnalyticsEvent("country_selected", {
          country: country.label,
          countryCode: country.code,
        });
      }
    } else {
      if (form.originCountry !== country.label) {
        updateForm("roots", []);
        updateForm("rootsNote", "");
        updateForm("tribe", "");
        setCustomTribe("");
      }
      updateForm("originCountry", country.label);
    }
    currentCountrySearchTrackedRef.current = false;
    setCountrySearch("");
    setCountryModalVisible(false);
  };

  const toggleInterest = (interest: string) => {
    setForm((prev) => {
      const selected = prev.interests.includes(interest);
      if (!selected && prev.interests.length >= 5) return prev;
      return {
        ...prev,
        interests: selected
          ? prev.interests.filter((item) => item !== interest)
          : [...prev.interests, interest],
      };
    });
    setErrors((prev) => ({ ...prev, interests: "" }));
  };

  const toggleRoot = (root: string) => {
    setForm((prev) => ({
      ...prev,
      roots: prev.roots.includes(root) ? prev.roots.filter((item) => item !== root) : [...prev.roots, root],
    }));
    setErrors((prev) => ({ ...prev, roots: "", rootsNote: "" }));
  };

  const handleWelcomeSignOut = async () => {
    if (signingOut) return;
    setSignOutMenuVisible(false);
    setSigningOut(true);
    try {
      if (variant === "ghana") logger.info("[onboarding] ghana_onboarding_sign_out_selected", { variant });
      await haptics.light();
      await clearSignupSession();
      await signOut();
      router.replace("/(auth)/welcome");
    } catch (error) {
      logger.error("[onboarding] welcome_sign_out_failed", { error, variant });
      Alert.alert("Sign out failed", "Unable to sign out right now. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const uploadImage = async (debugId: string, attempt: number, withTimeout: <T>(label: string, promise: PromiseLike<T>, ms: number) => Promise<T>) => {
    if (!image || !user?.id) return null;
    const fileExt = image.split(".").pop() || "jpg";
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const response = await withTimeout("image_fetch", fetch(image), 8000);
    const arrayBuffer = await withTimeout("image_arraybuffer", response.arrayBuffer(), 8000);
    const fileBody = new Uint8Array(arrayBuffer);
    const { error: uploadError } = await withTimeout(
      "image_upload",
      supabase.storage.from("profiles").upload(fileName, fileBody, { contentType: `image/${fileExt}` }),
      20_000,
    );
    if (uploadError) {
      logger.error("[onboarding] image_upload_failed", uploadError, { debugId, attempt, variant });
      throw new Error(`Image upload failed: ${uploadError.message}`);
    }
    return supabase.storage.from("profiles").getPublicUrl(fileName).data.publicUrl;
  };

  const submit = async () => {
    for (const step of steps.slice(1, -1)) {
      if (!validateStep(step.key)) {
        setStepIndex(steps.findIndex((item) => item.key === step.key));
        return;
      }
    }

    const attempt = ++submitAttemptRef.current;
    const debugId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    setLoading(true);
    setMessage("");
    setSaveNetworkError(null);

    let watchdog: ReturnType<typeof setTimeout> | null = null;
    try {
      logger.info("[onboarding] submit start", { debugId, attempt, variant, hasUser: !!user?.id, hasImage: !!image });
      const withTimeout = async <T,>(label: string, promise: PromiseLike<T>, ms: number): Promise<T> => {
        const start = Date.now();
        const result = await Promise.race([
          Promise.resolve(promise),
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms)),
        ]);
        logger.debug("[onboarding] step ok", { debugId, attempt, label, ms: Date.now() - start });
        return result;
      };

      watchdog = setTimeout(() => {
        if (submitAttemptRef.current !== attempt) return;
        setSaveNetworkError("This is taking longer than expected. Please check your connection and tap Retry.");
        setLoading(false);
      }, 25_000);

      if (!user) throw new Error("User not authenticated. Please log in again.");
      const signupPhoneState = await withTimeout("signup_phone_state", getSignupPhoneState(), 4000);
      const isPhoneVerified = phoneVerified || signupPhoneState.verified;
      let phoneNumber = signupPhoneState.phoneNumber ?? null;
      if (!isPhoneVerified) {
        Alert.alert("Phone verification required", "Please verify your phone number before creating your profile.");
        router.replace({
          pathname: "/(auth)/verify-phone",
          params: { next: encodeURIComponent(`/(auth)/onboarding?variant=${variant}`), reason: "required_for_access" },
        });
        return;
      }
      if (!phoneNumber) {
        const { data } = await withTimeout(
          "phone_profile_lookup",
          supabase.from("profiles").select("phone_number").eq("user_id", user.id).limit(1).maybeSingle(),
          3500,
        );
        phoneNumber = (data as { phone_number?: string | null } | null)?.phone_number ?? null;
      }
      if (phoneNumber) {
        const { data: existingPhoneProfile, error: phoneLookupError } = await withTimeout(
          "phone_lookup",
          supabase.from("profiles").select("user_id").eq("phone_number", phoneNumber).is("deleted_at", null).maybeSingle(),
          8000,
        );
        if (phoneLookupError && "code" in phoneLookupError && phoneLookupError.code !== "PGRST116") {
          throw new Error(`Phone lookup failed: ${phoneLookupError.message}`);
        }
        if (existingPhoneProfile?.user_id && existingPhoneProfile.user_id !== user.id) {
          Alert.alert("Phone already in use", "This phone number is already linked to another account.");
          await signOut();
          router.replace("/(auth)/login");
          return;
        }
      }

      const imageUrl = await uploadImage(debugId, attempt, withTimeout);
      const profileData = buildPremiumOnboardingProfileData({
        variant,
        form,
        customOccupation,
        customTribe,
        imageUrl,
        phoneNumber,
      });

      const updateError = await withTimeout(
        "profile_upsert",
        updateProfileWithFallbacks(updateProfile, profileData),
        20_000,
      );
      if (updateError) throw new Error(`Profile creation failed: ${updateError.message}`);

      if (variant === "ghana" && form.interests.length > 0) {
        let onboardingProfileId = profile?.id ?? null;
        if (!onboardingProfileId) {
          const { data: profileRow, error: profileLookupError } = await withTimeout(
            "profile_interest_profile_lookup",
            supabase.from("profiles").select("id").eq("user_id", user.id).single(),
            8000,
          );
          if (profileLookupError) throw new Error(`Interest profile lookup failed: ${profileLookupError.message}`);
          onboardingProfileId = profileRow?.id ?? null;
        }
        if (!onboardingProfileId) throw new Error("Unable to attach interests to your profile.");

        const { data: interestRows, error: interestLookupError } = await withTimeout(
          "profile_interest_lookup",
          supabase.from("interests").select("id,name").in("name", form.interests),
          8000,
        );
        if (interestLookupError) throw new Error(`Interest lookup failed: ${interestLookupError.message}`);
        const selectedInterestRows = interestRows ?? [];
        if (selectedInterestRows.length !== form.interests.length) {
          const found = new Set(selectedInterestRows.map((item) => item.name));
          const missing = form.interests.filter((name) => !found.has(name));
          logger.error("[onboarding] interest_catalog_out_of_sync", { variant, missing });
          throw new Error("Some selected interests are not available yet. Please try again after updating the app.");
        }

        const { error: interestDeleteError } = await withTimeout(
          "profile_interest_clear",
          supabase.from("profile_interests").delete().eq("profile_id", onboardingProfileId),
          8000,
        );
        if (interestDeleteError) throw new Error(`Interest update failed: ${interestDeleteError.message}`);

        const { error: interestInsertError } = await withTimeout(
          "profile_interest_insert",
          supabase.from("profile_interests").insert(
            selectedInterestRows.map((interest) => ({
              profile_id: onboardingProfileId as string,
              interest_id: interest.id,
            })),
          ),
          8000,
        );
        if (interestInsertError) throw new Error(`Interest update failed: ${interestInsertError.message}`);
      }

      await withTimeout("finalize_signup_verification", finalizeSignupPhoneVerification(), 6000);
      await withTimeout("clear_signup_session", clearSignupSession(), 4000);
      setProfileCreated(true);
      setMessage("Profile ready.");
      void haptics.success();
      setTimeout(() => {
        void (async () => {
          try {
            await Promise.race([refreshProfile(), new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
          } finally {
            router.dismissAll();
            router.replace({ pathname: "/(tabs)/vibes", params: { onboardingCelebration: "1" } });
          }
        })();
      }, 550);
    } catch (error: any) {
      if (isLikelyNetworkError(error)) {
        setSaveNetworkError("We couldn't save your profile. Check your connection and try again.");
        setMessage("");
      } else {
        setMessage(error?.message || "An error occurred");
      }
      logger.error("[onboarding] submit failed", error, { debugId, attempt, variant, likelyNetwork: isLikelyNetworkError(error) });
    } finally {
      if (watchdog) clearTimeout(watchdog);
      setLoading(false);
    }
  };

  const renderError = (key: string) => (errors[key] ? <Text style={styles.errorText}>{errors[key]}</Text> : null);

  const renderChoice = (label: string, selected: boolean, onPress: () => void, icon?: string) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.choicePill, selected && styles.choicePillSelected]}
      onPress={onPress}
    >
      {selected ? <MaterialCommunityIcons name="check" size={13} color={meta.dark ? "#071E22" : "#FFFFFF"} /> : null}
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]} numberOfLines={1}>
        {icon ? `${icon} ${label}` : label}
      </Text>
    </Pressable>
  );

  const renderStepBody = () => {
    switch (currentStep.key) {
      case "welcome":
        return <PremiumOnboardingWelcomeStep asset={meta.asset} dark={meta.dark} variant={variant} styles={styles} />;
      case "name":
      case "about":
      case "occupation":
      case "bio":
      case "photo":
        return (
          <PremiumOnboardingIdentityStep
            stepKey={currentStep.key}
            form={form}
            customOccupation={customOccupation}
            image={image}
            errors={errors}
            styles={styles}
            responsiveCompact={responsive.compactHeight}
            dark={meta.dark}
            setCustomOccupation={setCustomOccupation}
            updateForm={updateForm}
            setOption={setOption}
            pickImage={pickImage}
            renderError={renderError}
            renderChoice={renderChoice}
            occupations={PREMIUM_ONBOARDING_OCCUPATIONS}
          />
        );
      case "current_location":
      case "roots":
      case "values":
      case "interests":
      case "relationship_intent":
      case "dating_preferences":
        return (
          <PremiumOnboardingDiscoveryStep
            stepKey={currentStep.key}
            variant={variant}
            dark={meta.dark}
            form={form}
            currentCountryCode={currentCountry?.code ?? ""}
            customTribe={customTribe}
            errors={errors}
            styles={styles}
            responsiveCompact={responsive.compactHeight}
            setCustomTribe={setCustomTribe}
            updateForm={updateForm}
            setOption={setOption}
            toggleRoot={toggleRoot}
            toggleInterest={toggleInterest}
            openCurrentCountryPicker={() => {
              if (currentStep.key === "current_location") {
                handleCurrentLocationAnalyticsEvent("country_picker_opened", {
                  country: form.currentCountry.trim() || null,
                });
              }
              setCountryPickerTarget("current");
              setCountryModalVisible(true);
            }}
            openOriginCountryPicker={() => {
              setCountryPickerTarget("origin");
              setCountryModalVisible(true);
            }}
            renderError={renderError}
            renderChoice={renderChoice}
            globalRegions={PREMIUM_ONBOARDING_GLOBAL_REGIONS}
            ghanaRegions={PREMIUM_ONBOARDING_GHANA_REGIONS}
            rootsOptions={PREMIUM_ONBOARDING_ROOTS_OPTIONS}
            tribes={PREMIUM_ONBOARDING_TRIBES}
            interests={PREMIUM_ONBOARDING_INTERESTS}
            intents={PREMIUM_ONBOARDING_INTENTS}
            religionOptions={RELIGION_OPTIONS}
            rootsVisibility={PREMIUM_ONBOARDING_ROOTS_VISIBILITY}
            onCurrentLocationAnalyticsEvent={
              currentStep.key === "current_location" ? handleCurrentLocationAnalyticsEvent : undefined
            }
          />
        );
      case "complete":
        return (
          <PremiumOnboardingCompleteStep
            subtitle={currentStep.subtitle}
            saveNetworkError={saveNetworkError}
            loading={loading}
            message={message}
            onRetry={submit}
            styles={styles}
          />
        );
      default:
        return null;
    }
  };

  if (!fontsLoaded || !routeValidated) {
    return (
      <SafeAreaView style={[styles.background, styles.loadingCenter]}>
        <ActivityIndicator color={styles.tokens.accent.color} />
      </SafeAreaView>
    );
  }

  const isWelcomeStep = currentStep.key === "welcome";
  const isGhanaWelcomeStep = isWelcomeStep && variant === "ghana";
  const ctaText = stepIndex === 0 ? meta.cta : currentStep.key === "complete" ? "Enter Betweener" : "Continue";
  const primaryDisabled =
    currentStep.key === "current_location" &&
    variant === "ghana" &&
    (!form.region.trim() || !form.city.trim());

  return (
    <LinearGradient
      colors={meta.dark ? ["#031316", "#071E22", "#082C30"] : ["#F8F0E7", "#F4E8DC", "#FFF8EF"]}
      style={styles.background}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {!isWelcomeStep ? (
            <PremiumOnboardingProgressBar
              styles={styles}
              progress={progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              })}
            />
          ) : null}

          <PremiumOnboardingTopBar
            styles={styles}
            stepIndex={stepIndex}
            stepsLength={steps.length}
            signingOut={signingOut}
            onBack={back}
            onMorePress={() => {
              void haptics.light();
              setSignOutMenuVisible(true);
            }}
            onSignOut={() => void handleWelcomeSignOut()}
          />

          <PremiumOnboardingStepFrame
            styles={styles}
            isWelcomeStep={isWelcomeStep}
            isGhanaWelcomeStep={isGhanaWelcomeStep}
            stepKey={currentStep.key}
            modeLabel={meta.modeLabel}
            title={currentStep.title}
            subtitle={currentStep.subtitle}
            ctaText={ctaText}
            loading={loading}
            profileCreated={profileCreated}
            primaryDisabled={primaryDisabled}
            dark={meta.dark}
            body={renderStepBody()}
            onPrimaryPress={next}
            transitionDirection={transitionDirectionRef.current}
          />
          <PremiumOnboardingCountryPickerModal
            visible={countryModalVisible}
            title={countryPickerTarget === "origin" ? "Origin country" : "Current country"}
            dark={meta.dark}
            search={countrySearch}
            countries={countryData}
            selectedCode={(countryPickerTarget === "origin" ? originCountry?.code : currentCountry?.code) ?? undefined}
            styles={styles}
            onClose={() => setCountryModalVisible(false)}
            onSearchChange={(value) => {
              setCountrySearch(value);
              const normalized = value.trim();

              if (
                currentStep.key === "current_location" &&
                countryPickerTarget === "current" &&
                normalized.length >= 2 &&
                !currentCountrySearchTrackedRef.current
              ) {
                currentCountrySearchTrackedRef.current = true;
                handleCurrentLocationAnalyticsEvent("country_search_started", {
                  queryLength: normalized.length,
                });
              }

              if (normalized.length < 2) {
                currentCountrySearchTrackedRef.current = false;
              }
            }}
            onSelect={selectCountry}
          />
          <PremiumOnboardingSignOutMenu
            visible={signOutMenuVisible}
            signingOut={signingOut}
            styles={styles}
            onClose={() => setSignOutMenuVisible(false)}
            onSignOut={() => void handleWelcomeSignOut()}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
