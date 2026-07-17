// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

import { validatePremiumOnboardingStep } from "../lib/onboarding/premium-onboarding.validation.ts";

const baseForm = () => ({
  fullName: "Nana",
  age: "28",
  gender: "FEMALE",
  bio: "Thoughtful and clear.",
  occupation: "Engineer",
  currentCountry: "United Kingdom",
  originCountry: "Ghana",
  region: "England",
  city: "Manchester",
  cityDistrict: "England",
  cityLocalityGeonameId: 2643123,
  cityAdmin1Code: "ENG",
  cityLatitude: 53.4808,
  cityLongitude: -2.2426,
  tribe: "African",
  roots: ["Akan"],
  rootsNote: "",
  rootsVisibility: "VISIBLE",
  religion: "Christian",
  interests: ["Music"],
  lookingFor: "Something serious",
  minAgeInterest: "28",
  maxAgeInterest: "40",
});

test("global current location requires current country and a city or region-only choice", () => {
  const errors = validatePremiumOnboardingStep({
    step: "current_location",
    form: { ...baseForm(), currentCountry: "", region: "", city: "", cityLocalityGeonameId: null },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.equal(errors.currentCountry, "Choose where you live now.");
  assert.equal(errors.city, "Choose your current city, or use region/state only.");
});

test("global current location accepts an explicit region-only choice", () => {
  const errors = validatePremiumOnboardingStep({
    step: "current_location",
    form: { ...baseForm(), city: "", cityLocalityGeonameId: null, region: "Greater Manchester" },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.equal("city" in errors, false);
  assert.equal("region" in errors, false);
});

test("ghana current location requires both region and city or town", () => {
  const errors = validatePremiumOnboardingStep({
    step: "current_location",
    form: { ...baseForm(), currentCountry: "Ghana", region: "Ashanti", city: "", cityLocalityGeonameId: null },
    variant: "ghana",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.equal(errors.city, "Choose your current city or town.");
});

test("ghana roots requires at least one root and note for Other", () => {
  const errors = validatePremiumOnboardingStep({
    step: "roots",
    form: { ...baseForm(), roots: ["Other"], rootsNote: "   " },
    variant: "ghana",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.equal(errors.rootsNote, "Tell us how you identify if you choose Other.");
});

test("dating preferences keep max above min", () => {
  const errors = validatePremiumOnboardingStep({
    step: "dating_preferences",
    form: { ...baseForm(), minAgeInterest: "40", maxAgeInterest: "30" },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.equal(errors.maxAgeInterest, "Keep the maximum age above the minimum.");
});

test("photo step only errors when no image exists", () => {
  const noImageErrors = validatePremiumOnboardingStep({
    step: "photo",
    form: baseForm(),
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: false,
  });
  const imageErrors = validatePremiumOnboardingStep({
    step: "photo",
    form: baseForm(),
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.equal(noImageErrors.profilePic, "Choose a clear profile photo to continue.");
  assert.equal("profilePic" in imageErrors, false);
});
