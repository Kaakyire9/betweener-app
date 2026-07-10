import { isValidGhanaCityTownValue } from "../location/ghana-locality-shared.ts";
import { normalizeOtherText, replaceOtherInList, resolveOtherValue } from "../profile/other-option.ts";

import type {
  PremiumOnboardingFormState,
  PremiumOnboardingStepKey,
  PremiumOnboardingVariant,
} from "./premium-onboarding.types.ts";

type ValidatePremiumOnboardingStepArgs = {
  step: PremiumOnboardingStepKey;
  form: PremiumOnboardingFormState;
  variant: PremiumOnboardingVariant;
  customOccupation: string;
  customTribe: string;
  hasImage: boolean;
};

export function validatePremiumOnboardingStep({
  step,
  form,
  variant,
  customOccupation,
  customTribe,
  hasImage,
}: ValidatePremiumOnboardingStepArgs): Record<string, string> {
  const nextErrors: Record<string, string> = {};
  const occupation = resolveOtherValue(form.occupation, customOccupation);
  const tribe = resolveOtherValue(form.tribe, customTribe);
  const roots = replaceOtherInList(form.roots, form.rootsNote);
  const minAge = Number(form.minAgeInterest);
  const maxAge = Number(form.maxAgeInterest);

  if (step === "name" && !form.fullName.trim()) {
    nextErrors.fullName = "Add the name you'd like people to know you by.";
  }

  if (step === "about") {
    if (!form.age || Number(form.age) < 18) nextErrors.age = "You must be at least 18.";
    if (!form.gender) nextErrors.gender = "Choose an option to continue.";
  }

  if (step === "occupation" && !occupation) {
    nextErrors.occupation = "Choose what fits best, or add your own.";
  }

  if (step === "bio" && !form.bio.trim()) {
    nextErrors.bio = "Add a few words that feel like you.";
  }

  if (step === "photo" && !hasImage) {
    nextErrors.profilePic = "Choose a clear profile photo to continue.";
  }

  if (step === "current_location") {
    if (variant === "global" && !form.currentCountry) {
      nextErrors.currentCountry = "Choose where you live now.";
    }
    if (!form.region) {
      nextErrors.region = variant === "ghana" ? "Choose a Ghana region." : "Choose the closest region.";
    }
    if (variant === "ghana" && form.city.trim() && !isValidGhanaCityTownValue(form.city)) {
      nextErrors.city = "Add a city or town name, or leave it blank.";
    }
  }

  if (step === "roots") {
    if (variant === "global" && !tribe) {
      nextErrors.tribe = "Choose a cultural identity, or add your own.";
    }
    if (variant === "ghana") {
      if (roots.length === 0) nextErrors.roots = "Pick at least one root that matters to you.";
      if (form.roots.includes("Other") && !normalizeOtherText(form.rootsNote)) {
        nextErrors.rootsNote = "Tell us how you identify if you choose Other.";
      }
    }
  }

  if (step === "values" && !form.religion) {
    nextErrors.religion = "Choose what feels accurate for you.";
  }

  if (step === "interests" && form.interests.length === 0) {
    nextErrors.interests = "Choose at least one interest.";
  }

  if (step === "relationship_intent" && !form.lookingFor) {
    nextErrors.lookingFor = "Choose what feels true right now.";
  }

  if (step === "dating_preferences") {
    if (!Number.isFinite(minAge) || minAge < 18 || minAge > 99) {
      nextErrors.minAgeInterest = "Choose a minimum age from 18 to 99.";
    }
    if (!Number.isFinite(maxAge) || maxAge < 18 || maxAge > 99) {
      nextErrors.maxAgeInterest = "Choose a maximum age from 18 to 99.";
    }
    if (minAge > maxAge) {
      nextErrors.maxAgeInterest = "Keep the maximum age above the minimum.";
    }
  }

  return nextErrors;
}
