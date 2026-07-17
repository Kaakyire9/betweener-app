import { isValidGhanaCityTownValue } from "../location/ghana-locality-shared.ts";
import { resolveOtherValue } from "../profile/other-option.ts";

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
  const minAge = Number(form.minAgeInterest);
  const maxAge = Number(form.maxAgeInterest);
  const currentCountryIsGhana = variant === "ghana" || form.currentCountry.trim().toLowerCase() === "ghana";
  const originCountryIsGhana = variant === "ghana" || form.originCountry.trim().toLowerCase() === "ghana";

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
    const city = form.city.trim();
    const region = form.region.trim();
    if (variant === "global" && !form.currentCountry) {
      nextErrors.currentCountry = "Choose where you live now.";
    }
    if (currentCountryIsGhana && !region) {
      nextErrors.region = "Choose a Ghana region.";
    }
    if (currentCountryIsGhana && !city) {
      nextErrors.city = "Choose your current city or town.";
    } else if (currentCountryIsGhana && !isValidGhanaCityTownValue(city)) {
      nextErrors.city = "Choose a valid Ghana city or town.";
    }
    if (variant === "global" && !currentCountryIsGhana && !city && !region) {
      nextErrors.city = "Choose your current city, or use region/state only.";
    }
    if (variant === "global" && !currentCountryIsGhana && !city && region && region.length < 2) {
      nextErrors.region = "Add your current region or state.";
    }
    if (
      variant === "global" &&
      !currentCountryIsGhana &&
      city &&
      form.cityLocalityGeonameId == null
    ) {
      nextErrors.city = "Choose a city or town from the verified results.";
    }
  }

  if (step === "roots") {
    if (originCountryIsGhana) {
      if (form.roots.length === 0) {
        nextErrors.roots = "Choose at least one community or cultural root.";
      }
      if (form.roots.includes("Other") && !form.rootsNote.trim()) {
        nextErrors.rootsNote = "Tell us how you identify if you choose Other.";
      }
    } else if (variant === "global" && !tribe) {
      nextErrors.tribe = "Choose a cultural identity, or add your own.";
    }
  }

  if (step === "values" && !form.religion) {
    nextErrors.religion = "Choose what feels accurate for you.";
  }

  if (step === "interests" && form.interests.length < 3) {
    nextErrors.interests = "Choose at least 3 interests to shape your mix.";
  }
  if (step === "interests" && form.interests.length > 5) {
    nextErrors.interests = "Keep your mix to 5 interests.";
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
