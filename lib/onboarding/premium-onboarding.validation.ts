import { isValidGhanaCityTownValue } from "../location/ghana-locality-shared.ts";
import { resolveOtherValue } from "../profile/other-option.ts";
import { moderatePublicProfileText } from "../profile-guard/index.ts";

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

const PUBLIC_PROFILE_TEXT_ERROR =
  "Remove contact details, external links, payment requests, or promotional content to continue.";

const isAllowedPublicProfileText = (value: string) =>
  moderatePublicProfileText(value).allowed;

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
  } else if (step === "name" && form.fullName.trim().length > 80) {
    nextErrors.fullName = "Keep your name to 80 characters or fewer.";
  } else if (step === "name" && !isAllowedPublicProfileText(form.fullName)) {
    nextErrors.fullName = PUBLIC_PROFILE_TEXT_ERROR;
  }

  if (step === "about") {
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 18 || age > 99) {
      nextErrors.age = "Enter an age from 18 to 99.";
    }
    if (!form.gender) nextErrors.gender = "Choose an option to continue.";
  }

  if (step === "occupation" && !occupation) {
    nextErrors.occupation = "Choose what fits best, or add your own.";
  } else if (step === "occupation" && occupation.length > 80) {
    nextErrors.occupation = "Keep your occupation to 80 characters or fewer.";
  } else if (step === "occupation" && !isAllowedPublicProfileText(occupation)) {
    nextErrors.occupation = PUBLIC_PROFILE_TEXT_ERROR;
  }

  if (step === "bio" && !form.bio.trim()) {
    nextErrors.bio = "Add a few words that feel like you.";
  } else if (step === "bio" && form.bio.trim().length > 300) {
    nextErrors.bio = "Keep your introduction to 300 characters or fewer.";
  } else if (step === "bio" && !isAllowedPublicProfileText(form.bio)) {
    nextErrors.bio = PUBLIC_PROFILE_TEXT_ERROR;
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
      } else if (form.rootsNote.trim().length > 160) {
        nextErrors.rootsNote = "Keep your roots note to 160 characters or fewer.";
      } else if (form.rootsNote.trim() && !isAllowedPublicProfileText(form.rootsNote)) {
        nextErrors.rootsNote = PUBLIC_PROFILE_TEXT_ERROR;
      }
    } else if (variant === "global" && tribe.length > 80) {
      nextErrors.tribe = "Keep your cultural identity to 80 characters or fewer.";
    } else if (variant === "global" && tribe && !isAllowedPublicProfileText(tribe)) {
      nextErrors.tribe = PUBLIC_PROFILE_TEXT_ERROR;
    }
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
