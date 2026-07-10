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

test("global current location requires current country and region", () => {
  const errors = validatePremiumOnboardingStep({
    step: "current_location",
    form: { ...baseForm(), currentCountry: "", region: "" },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.equal(errors.currentCountry, "Choose where you live now.");
  assert.equal(errors.region, "Choose the closest region.");
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

