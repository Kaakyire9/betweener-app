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
} from "@/lib/onboarding/premium-onboarding.submit";
import {
  completePremiumOnboardingV2,
  premiumOnboardingCompletionMessage,
} from "@/lib/onboarding/premium-onboarding.complete";
import { markPendingOnboardingCelebration } from "@/lib/onboarding/premium-onboarding.celebration";
import {
  clearPremiumOnboardingDraft,
  loadPremiumOnboardingDraft,
  savePremiumOnboardingDraft,
} from "@/lib/onboarding/premium-onboarding.draft";
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
import {
  guardAndPublishProfileMediaV1_2,
  isProfileMediaGuardV1_2Runtime,
  profileMediaGuardMessageV1_2,
} from "@/lib/profile/profile-media-guard-v1-2";
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
import * as Crypto from "expo-crypto";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ONBOARDING_RELIGION_OPTIONS = [
  ...RELIGION_OPTIONS,
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
] as const;

const createInitialForm = (): FormState => ({
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

const PROFILE_FIELD_STEP: Partial<Record<string, StepKey>> = {
  full_name: "name",
  age: "about",
  gender: "about",
  occupation: "occupation",
  bio: "bio",
  avatar_url: "photo",
  current_country: "current_location",
  location: "current_location",
  city: "current_location",
  region: "current_location",
  tribe: "roots",
  roots: "roots",
  roots_note: "roots",
  religion: "values",
  interests: "interests",
  looking_for: "relationship_intent",
  min_age_interest: "dating_preferences",
  max_age_interest: "dating_preferences",
};

const PROFILE_FIELD_FORM_KEY: Record<string, string> = {
  full_name: "fullName",
  avatar_url: "profilePic",
  current_country: "currentCountry",
  location: "city",
  roots_note: "rootsNote",
  looking_for: "lookingFor",
  min_age_interest: "minAgeInterest",
  max_age_interest: "maxAgeInterest",
};

export function PremiumOnboardingFlow({ variant }: { variant: Variant }) {
  const fontsLoaded = useAppFonts();
  const responsive = useResponsiveMetrics();
  const meta = PREMIUM_ONBOARDING_ROUTE_META[variant];
  const steps = useMemo(() => getPremiumOnboardingSteps(variant), [variant]);
  const styles = useMemo(() => createPremiumOnboardingStyles(responsive, meta.dark), [meta.dark, responsive]);
  const { user, profile, signOut, refreshProfile, phoneVerified } = useAuth();
  const [routeValidated, setRouteValidated] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [customOccupation, setCustomOccupation] = useState("");
  const [customTribe, setCustomTribe] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [approvedAvatar, setApprovedAvatar] = useState<{
    localUri: string;
    publicUrl: string;
  } | null>(null);
  const [photoChecking, setPhotoChecking] = useState(false);
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
  const [draftReady, setDraftReady] = useState(false);
  const [completionRequestId, setCompletionRequestId] = useState(() => Crypto.randomUUID());
  const progressAnim = useRef(new Animated.Value(0)).current;
  const transitionDirectionRef = useRef<"forward" | "back">("forward");
  const submitAttemptRef = useRef(0);
  const draftHydrationKeyRef = useRef<string | null>(null);
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
    if (!routeValidated || !user?.id) return;
    const hydrationKey = `${user.id}:${variant}`;
    if (draftHydrationKeyRef.current === hydrationKey) return;
    draftHydrationKeyRef.current = hydrationKey;
    setDraftReady(false);
    let active = true;

    void (async () => {
      try {
        const draft = await loadPremiumOnboardingDraft(user.id, variant);
        if (!active) return;
        if (draft) {
          setForm({ ...createInitialForm(), ...draft.form });
          setCustomOccupation(draft.customOccupation);
          setCustomTribe(draft.customTribe);
          const existingApprovedAvatar = String((profile as any)?.avatar_url || "").trim() || null;
          const approvedAvatarUrl = draft.approvedAvatarUrl || existingApprovedAvatar;
          const restoredImage = approvedAvatarUrl || draft.imageUri;
          setImage(restoredImage);
          setApprovedAvatar(
            approvedAvatarUrl
              ? { localUri: approvedAvatarUrl, publicUrl: approvedAvatarUrl }
              : null,
          );
          setCompletionRequestId(draft.completionRequestId);
          setStepIndex(Math.max(0, Math.min(draft.stepIndex, steps.length - 1)));
          logger.info("[onboarding] draft_restored", {
            variant,
            stepIndex: draft.stepIndex,
            ageMs: Date.now() - draft.savedAt,
          });
        } else {
          const existingApprovedAvatar = String((profile as any)?.avatar_url || "").trim();
          if (existingApprovedAvatar) {
            setImage(existingApprovedAvatar);
            setApprovedAvatar({
              localUri: existingApprovedAvatar,
              publicUrl: existingApprovedAvatar,
            });
          }
        }
      } catch (error) {
        logger.warn("[onboarding] draft_restore_failed", { variant, error });
      } finally {
        if (active) setDraftReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile, routeValidated, steps.length, user?.id, variant]);

  useEffect(() => {
    if (!draftReady || !user?.id || profileCreated) return;
    const timeout = setTimeout(() => {
      void savePremiumOnboardingDraft({
        userId: user.id,
        variant,
        stepIndex,
        form,
        customOccupation,
        customTribe,
        imageUri: approvedAvatar?.publicUrl ? null : image,
        approvedAvatarUrl: approvedAvatar?.publicUrl ?? null,
        completionRequestId,
      }).catch((error) => {
        logger.warn("[onboarding] draft_save_failed", { variant, error });
      });
    }, 350);
    return () => clearTimeout(timeout);
  }, [
    approvedAvatar?.publicUrl,
    completionRequestId,
    customOccupation,
    customTribe,
    draftReady,
    form,
    image,
    profileCreated,
    stepIndex,
    user?.id,
    variant,
  ]);

  useEffect(() => {
    if (!draftReady || image) return;
    const existingApprovedAvatar = String((profile as any)?.avatar_url || "").trim();
    if (!existingApprovedAvatar) return;
    setImage(existingApprovedAvatar);
    setApprovedAvatar({
      localUri: existingApprovedAvatar,
      publicUrl: existingApprovedAvatar,
    });
  }, [draftReady, image, profile]);

  useEffect(() => {
    if (routeValidated && variant === "ghana") {
      logger.info("[onboarding] ghana_onboarding_welcome_viewed", { variant });
    }
  }, [routeValidated, variant]);

  useEffect(() => {
    if (!draftReady || !currentStep) return;
    const viewedAt = Date.now();
    logger.info("[onboarding] step_viewed", {
      variant,
      stepKey: currentStep.key,
      stepIndex,
      resumed: stepIndex > 0,
    });
    const timeout = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(
        `${currentStep.title}. Step ${stepIndex + 1} of ${steps.length}.`,
      );
    }, 250);
    return () => {
      clearTimeout(timeout);
      logger.info("[onboarding] step_exited", {
        variant,
        stepKey: currentStep.key,
        stepIndex,
        dwellMs: Date.now() - viewedAt,
      });
    };
  }, [currentStep, draftReady, stepIndex, steps.length, variant]);

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
      if (!draftReady || form.fullName.trim()) return;
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
  }, [draftReady, form.fullName, profile?.full_name, user?.user_metadata]);

  useEffect(() => {
    if (!draftReady || variant !== "global" || form.currentCountry) return;
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
  }, [draftReady, form.currentCountry, variant]);

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
    setForm((prev) => {
      if (key === "age" && prev.minAgeInterest === "24" && prev.maxAgeInterest === "34") {
        const age = Number(value);
        if (Number.isInteger(age) && age >= 18 && age <= 99) {
          return {
            ...prev,
            age: value as FormState["age"],
            minAgeInterest: String(Math.max(18, age - 6)),
            maxAgeInterest: String(Math.min(99, age + 6)),
          };
        }
      }
      return { ...prev, [key]: value };
    });
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
            cityAdmin1Code: "",
            cityLatitude: null,
            cityLongitude: null,
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
            cityAdmin1Code: "",
            cityLatitude: "",
            cityLongitude: "",
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
        setApprovedAvatar(null);
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
    const firstError = Object.values(nextErrors).find(Boolean);
    if (firstError) {
      logger.info("[onboarding] step_validation_blocked", {
        variant,
        stepKey: step,
        fieldNames: Object.keys(nextErrors),
      });
      AccessibilityInfo.announceForAccessibility(firstError);
    }
    return Object.keys(nextErrors).length === 0;
  };

  const approveCurrentPhoto = async () => {
    if (!image) return false;
    if (!user?.id) {
      setErrors((prev) => ({ ...prev, profilePic: "Sign in again before verifying your photo." }));
      return false;
    }
    if (!isProfileMediaGuardV1_2Runtime()) return true;
    if (approvedAvatar?.localUri === image) return true;
    if (photoChecking) return false;
    if (/^https?:\/\//i.test(image)) {
      const message = "For your safety, choose this profile photo again so we can verify its original image.";
      setErrors((prev) => ({ ...prev, profilePic: message }));
      AccessibilityInfo.announceForAccessibility(message);
      return false;
    }

    const fileExt = image.split(/[?#]/)[0].split(".").pop()?.toLowerCase() || "jpg";
    const contentType = fileExt === "png" ? "image/png" : fileExt === "webp" ? "image/webp" : "image/jpeg";
    setPhotoChecking(true);
    setErrors((prev) => ({ ...prev, profilePic: "" }));

    try {
      const result = await Promise.race([
        guardAndPublishProfileMediaV1_2({
          userId: user.id,
          avatarUrl: image,
          heroImageUrl: null,
          photos: [],
          localItems: [{ localUri: image, fileName: `onboarding-avatar.${fileExt}`, contentType }],
          clientRequestId: `onboarding-photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(Object.assign(new Error("PROFILE_MEDIA_SCAN_UNAVAILABLE"), {
            code: "PROFILE_MEDIA_SCAN_UNAVAILABLE",
            retryable: true,
          })), 45_000);
        }),
      ]);
      if (!result.avatarUrl) {
        throw Object.assign(new Error("PROFILE_MEDIA_SCAN_UNAVAILABLE"), {
          code: "PROFILE_MEDIA_SCAN_UNAVAILABLE",
          retryable: true,
        });
      }
      setApprovedAvatar({ localUri: image, publicUrl: result.avatarUrl });
      return true;
    } catch (error) {
      const guardMessage = profileMediaGuardMessageV1_2(error)
        || "We couldn't verify this photo. Choose another photo or try again.";
      setErrors((prev) => ({ ...prev, profilePic: guardMessage }));
      logger.warn("[onboarding] photo_step_guard_rejected", {
        variant,
        code: String((error as any)?.code || "UNKNOWN"),
        reason: String((error as any)?.reason || "UNKNOWN"),
      });
      return false;
    } finally {
      setPhotoChecking(false);
    }
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

  const next = async () => {
    transitionDirectionRef.current = "forward";
    if (currentStep.key === "welcome") {
      if (variant === "ghana") logger.info("[onboarding] ghana_onboarding_started", { variant });
      void haptics.light();
      setStepIndex((value) => Math.min(value + 1, steps.length - 1));
      return;
    }
    if (!validateStep(currentStep.key)) return;
    if (currentStep.key === "photo" && !await approveCurrentPhoto()) return;
    if (currentStep.key === "complete") {
      void submit();
      return;
    }
    if (currentStep.key === "current_location") {
      currentLocationTelemetryRef.current.exitReason = "continue";
    }
    logger.info("[onboarding] step_completed", {
      variant,
      stepKey: currentStep.key,
      stepIndex,
    });
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
      if (user?.id) await clearPremiumOnboardingDraft(user.id, variant);
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
    if (approvedAvatar?.localUri === image) return approvedAvatar.publicUrl;
    const fileExt = image.split(/[?#]/)[0].split(".").pop()?.toLowerCase() || "jpg";
    const contentType = fileExt === "png" ? "image/png" : fileExt === "webp" ? "image/webp" : "image/jpeg";

    if (isProfileMediaGuardV1_2Runtime()) {
      const result = await withTimeout(
        "profile_media_guard",
        guardAndPublishProfileMediaV1_2({
          userId: user.id,
          avatarUrl: image,
          heroImageUrl: null,
          photos: [],
          localItems: [{ localUri: image, fileName: `onboarding-avatar.${fileExt}`, contentType }],
          clientRequestId: `onboarding-${debugId.toLowerCase()}-${attempt}`,
        }),
        45_000,
      );
      if (!result.avatarUrl) throw new Error("PROFILE_MEDIA_SCAN_UNAVAILABLE");
      return result.avatarUrl;
    }

    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const response = await withTimeout("image_fetch", fetch(image), 8000);
    const arrayBuffer = await withTimeout("image_arraybuffer", response.arrayBuffer(), 8000);
    const fileBody = new Uint8Array(arrayBuffer);
    const { error: uploadError } = await withTimeout(
      "image_upload",
      supabase.storage.from("profiles").upload(fileName, fileBody, { contentType }),
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
        let timeout: ReturnType<typeof setTimeout> | null = null;
        try {
          const result = await Promise.race([
            Promise.resolve(promise),
            new Promise<T>((_, reject) => {
              timeout = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
            }),
          ]);
          logger.debug("[onboarding] step ok", { debugId, attempt, label, ms: Date.now() - start });
          return result;
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      };

      watchdog = setTimeout(() => {
        if (submitAttemptRef.current !== attempt) return;
        setMessage("Still securely creating your profile. Please keep Betweener open.");
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

      const completion = await withTimeout(
        "profile_onboarding_v2",
        completePremiumOnboardingV2({
          updates: profileData,
          interestNames: form.interests,
          completionRequestId,
        }),
        35_000,
      );
      if (!completion.committed) throw new Error("ONBOARDING_COMPLETION_NOT_COMMITTED");

      await Promise.allSettled([
        markPendingOnboardingCelebration({
          userId: user.id,
          completionRequestId: completion.completionRequestId,
        }),
        clearPremiumOnboardingDraft(user.id, variant),
        finalizeSignupPhoneVerification(),
        clearSignupSession(),
      ]);
      setProfileCreated(true);
      setMessage("Profile ready.");
      logger.info("[onboarding] completion_committed", {
        variant,
        attempt,
        alreadyCompleted: completion.alreadyCompleted,
        interestCount: form.interests.length,
      });
      void haptics.success();
      setTimeout(() => {
        void (async () => {
           try {
             await Promise.race([refreshProfile(), new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
           } finally {
             router.replace({ pathname: "/(tabs)/vibes", params: { onboardingCelebration: "1" } });
           }
        })();
      }, 1500);
    } catch (error: any) {
      const mediaGuardMessage = profileMediaGuardMessageV1_2(error);
      if (mediaGuardMessage) {
        setErrors((current) => ({ ...current, profilePic: mediaGuardMessage }));
        setStepIndex(steps.findIndex((step) => step.key === "photo"));
        setMessage("");
        setSaveNetworkError(null);
        AccessibilityInfo.announceForAccessibility(mediaGuardMessage);
      } else if (error?.retryable === true || isLikelyNetworkError(error)) {
        setSaveNetworkError("We couldn't save your profile. Check your connection and try again.");
        setMessage("");
      } else {
        const completionMessage = premiumOnboardingCompletionMessage(error);
        const fieldNames = Array.isArray(error?.fieldNames) ? error.fieldNames : [];
        if (fieldNames.includes("avatar_url")) setApprovedAvatar(null);
        const targetField = fieldNames.find((field: string) => PROFILE_FIELD_STEP[field]);
        const targetStep = targetField ? PROFILE_FIELD_STEP[targetField] : null;
        if (targetStep) {
          const nextErrors = Object.fromEntries(
            fieldNames.map((field: string) => [PROFILE_FIELD_FORM_KEY[field] || field, completionMessage]),
          );
          setErrors(nextErrors);
          setStepIndex(steps.findIndex((step) => step.key === targetStep));
          setMessage("");
          AccessibilityInfo.announceForAccessibility(completionMessage);
        } else {
          setMessage(completionMessage);
        }
      }
      logger.error("[onboarding] submit failed", error, { debugId, attempt, variant, likelyNetwork: isLikelyNetworkError(error) });
    } finally {
      if (watchdog) clearTimeout(watchdog);
      setLoading(false);
    }
  };

  const renderError = (key: string) => (
    errors[key]
      ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorText}>
          {errors[key]}
        </Text>
      )
      : null
  );

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
            photoChecking={photoChecking}
            photoApproved={approvedAvatar?.localUri === image}
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
            religionOptions={ONBOARDING_RELIGION_OPTIONS}
            rootsVisibility={PREMIUM_ONBOARDING_ROOTS_VISIBILITY}
            onCurrentLocationAnalyticsEvent={
              currentStep.key === "current_location" ? handleCurrentLocationAnalyticsEvent : undefined
            }
          />
        );
      case "complete":
        return (
          <PremiumOnboardingCompleteStep
            saveNetworkError={saveNetworkError}
            loading={loading}
            profileCreated={profileCreated}
            avatarUri={approvedAvatar?.publicUrl || image}
            firstName={form.fullName.trim().split(/\s+/)[0] || null}
            message={message}
            onRetry={submit}
            styles={styles}
          />
        );
      default:
        return null;
    }
  };

  if (!fontsLoaded || !routeValidated || !draftReady) {
    return (
      <SafeAreaView style={[styles.background, styles.loadingCenter]}>
        <ActivityIndicator color={styles.tokens.accent.color} />
      </SafeAreaView>
    );
  }

  const isWelcomeStep = currentStep.key === "welcome";
  const isGhanaWelcomeStep = isWelcomeStep && variant === "ghana";
  const ctaText = stepIndex === 0
    ? meta.cta
    : currentStep.key === "complete"
      ? "Create my profile"
      : "Continue";
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
            loading={loading || photoChecking}
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
