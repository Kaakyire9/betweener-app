import {
  findCountryByLabel,
  getCountryCodeByName,
  inferCountryFromPhoneNumber,
  type CountryOption,
} from "../location/countries.ts";
import { normalizeGhanaCityTownValue } from "../location/ghana-locality-shared.ts";
import { isLegacyGhanaLocalityForeignKeyError } from "../location/locality-errors.ts";
import { normalizeOtherText, replaceOtherInList, resolveOtherValue } from "../profile/other-option.ts";
import { isReligionEnumError, normalizeReligionForProfile } from "../profile/religion.ts";

import type {
  PremiumOnboardingFormState,
  PremiumOnboardingVariant,
} from "./premium-onboarding.types.ts";

type BuildPremiumOnboardingProfileArgs = {
  variant: PremiumOnboardingVariant;
  form: PremiumOnboardingFormState;
  customOccupation: string;
  customTribe: string;
  imageUrl: string | null;
  phoneNumber: string | null;
};

export function getPremiumOnboardingLocationPrecision(input: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}) {
  if (input.city?.trim()) return "CITY" as const;
  if (input.region?.trim()) return "REGION" as const;
  if (input.country?.trim()) return "COUNTRY" as const;
  return null;
}

export function buildPremiumOnboardingLocationLabel(input: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}) {
  if (input.city?.trim()) return input.city.trim();
  if (input.region?.trim()) return input.region.trim();
  if (input.country?.trim()) return input.country.trim();
  return null;
}

export function isRootsVisibilityConstraintError(error: unknown) {
  const code = String((error as any)?.code || "");
  const message = String((error as any)?.message || "").toLowerCase();
  return code === "23514" && message.includes("profiles_roots_visibility_check");
}

export function buildPremiumOnboardingProfileData({
  variant,
  form,
  customOccupation,
  customTribe,
  imageUrl,
  phoneNumber,
}: BuildPremiumOnboardingProfileArgs) {
  const completedAt = new Date().toISOString();
  const resolvedOccupation = resolveOtherValue(form.occupation, customOccupation);
  const currentCountryIsGhana = variant === "ghana" || form.currentCountry.trim().toLowerCase() === "ghana";
  const originCountryIsGhana = variant === "ghana" || form.originCountry.trim().toLowerCase() === "ghana";
  const normalizedRoots = originCountryIsGhana ? replaceOtherInList(form.roots, form.rootsNote) : [];
  const resolvedTribe =
    originCountryIsGhana
      ? normalizedRoots[0] ?? null
      : resolveOtherValue(form.tribe, customTribe);
  const currentCountryName = variant === "ghana" ? "Ghana" : form.currentCountry.trim();
  const currentCountryOption: CountryOption | { label: string; code: string } | null =
    variant === "ghana"
      ? { label: "Ghana", code: "GH" }
      : findCountryByLabel(form.currentCountry) ?? inferCountryFromPhoneNumber(phoneNumber);
  const currentCountryCode =
    variant === "ghana"
      ? "GH"
      : currentCountryOption?.code ?? getCountryCodeByName(form.currentCountry);
  const originCountryName =
    variant === "ghana"
      ? "Ghana"
      : form.originCountry || (currentCountryName === "Ghana" ? "Ghana" : null);
  const originCountryCode =
    variant === "ghana"
      ? "GH"
      : form.originCountry
        ? getCountryCodeByName(form.originCountry)
        : currentCountryName === "Ghana"
          ? "GH"
          : null;
  const region = form.region.trim();
  const city = currentCountryIsGhana ? normalizeGhanaCityTownValue(form.city) : form.city.trim();

  if (!currentCountryName || !currentCountryCode) {
    throw new Error("Please choose where you live now before continuing.");
  }

  const location = buildPremiumOnboardingLocationLabel({
    city: city || null,
    region: region || null,
    country: currentCountryName,
  });
  const locationPrecision = getPremiumOnboardingLocationPrecision({
    city: city || null,
    region: region || null,
    country: currentCountryName,
  });

  return {
    full_name: form.fullName.trim(),
    age: Number(form.age),
    gender: form.gender as any,
    bio: form.bio.trim(),
    occupation: resolvedOccupation,
    region: region || null,
    tribe: resolvedTribe,
    roots: originCountryIsGhana && normalizedRoots.length > 0 ? normalizedRoots : null,
    roots_note: originCountryIsGhana ? normalizeOtherText(form.rootsNote) || null : null,
    roots_visibility: originCountryIsGhana ? form.rootsVisibility : "VISIBLE",
    religion: normalizeReligionForProfile(form.religion) as any,
    looking_for: form.lookingFor,
    avatar_url: imageUrl,
    phone_number: phoneNumber,
    phone_verified: true,
    min_age_interest: Number(form.minAgeInterest),
    max_age_interest: Number(form.maxAgeInterest),
    age_preference_confirmed_at: completedAt,
    city: city || null,
    locality_geoname_id: form.cityLocalityGeonameId ?? null,
    locality_district: currentCountryIsGhana ? normalizeGhanaCityTownValue(form.cityDistrict) || null : form.cityDistrict.trim() || null,
    locality_admin1_code: form.cityAdmin1Code || null,
    locality_provider: form.cityLocalityGeonameId ? "geonames" : null,
    latitude: form.cityLatitude,
    longitude: form.cityLongitude,
    location,
    location_precision: locationPrecision as any,
    current_country: currentCountryName,
    current_country_code: currentCountryCode,
    onboarding_variant: variant,
    origin_country: originCountryName,
    origin_country_code: originCountryCode,
    origin_country_source:
      form.originCountry || variant === "ghana"
        ? "explicit"
        : currentCountryName === "Ghana"
          ? "residence_backfill"
          : "unknown",
    years_in_diaspora: 0,
    profile_completed: true,
    identity_status: "active",
    onboarding_completed_at: completedAt,
    identity_finalized_at: completedAt,
  };
}

export async function updateProfileWithFallbacks(
  updateProfile: (payload: any) => Promise<{ error?: { message?: string } | null } | any>,
  profileData: Record<string, unknown>,
) {
  let workingProfileData = { ...profileData };
  let { error: updateError } = await updateProfile(workingProfileData as any);

  const missingOnboardingVariantColumn =
    updateError &&
    String((updateError as any)?.code ?? '').toUpperCase() === 'PGRST204' &&
    String((updateError as any)?.message ?? '').toLowerCase().includes('onboarding_variant');

  if (missingOnboardingVariantColumn) {
    const { onboarding_variant: _unsupportedVariant, ...compatibleProfileData } = workingProfileData;
    workingProfileData = compatibleProfileData;
    ({ error: updateError } = await updateProfile(workingProfileData as any));
  }

  const missingAgePreferenceConfirmationColumn =
    updateError &&
    String((updateError as any)?.code ?? '').toUpperCase() === 'PGRST204' &&
    String((updateError as any)?.message ?? '').toLowerCase().includes('age_preference_confirmed_at');

  if (missingAgePreferenceConfirmationColumn) {
    const {
      age_preference_confirmed_at: _unsupportedAgePreferenceConfirmation,
      ...compatibleProfileData
    } = workingProfileData;
    workingProfileData = compatibleProfileData;
    ({ error: updateError } = await updateProfile(workingProfileData as any));
  }

  if (
    updateError &&
    workingProfileData.current_country_code !== "GH" &&
    workingProfileData.locality_geoname_id != null &&
    isLegacyGhanaLocalityForeignKeyError(updateError)
  ) {
    workingProfileData = {
      ...workingProfileData,
      locality_geoname_id: null,
      locality_admin1_code: null,
      locality_provider: null,
    };
    ({ error: updateError } = await updateProfile(workingProfileData as any));
  }

  if (updateError && workingProfileData.roots_visibility === "MATCHES_ONLY" && isRootsVisibilityConstraintError(updateError)) {
    workingProfileData = { ...workingProfileData, roots_visibility: "HIDDEN" };
    ({ error: updateError } = await updateProfile(workingProfileData as any));
  }

  if (updateError && workingProfileData.religion !== "OTHER" && isReligionEnumError(updateError)) {
    workingProfileData = { ...workingProfileData, religion: "OTHER" as any };
    ({ error: updateError } = await updateProfile(workingProfileData as any));
  }

  return updateError ?? null;
}
