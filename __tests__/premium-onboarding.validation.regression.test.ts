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

test("age is bounded to the supported adult discovery range", () => {
  const tooHigh = validatePremiumOnboardingStep({
    step: "about",
    form: { ...baseForm(), age: "100" },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });
  assert.equal(tooHigh.age, "Enter an age from 18 to 99.");
});

test("global cultural identity and faith can remain private", () => {
  const rootsErrors = validatePremiumOnboardingStep({
    step: "roots",
    form: { ...baseForm(), originCountry: "Nigeria", tribe: "" },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });
  const valuesErrors = validatePremiumOnboardingStep({
    step: "values",
    form: { ...baseForm(), religion: "" },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.deepEqual(rootsErrors, {});
  assert.deepEqual(valuesErrors, {});
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

test("bio step blocks contact details before advancing", () => {
  const errors = validatePremiumOnboardingStep({
    step: "bio",
    form: { ...baseForm(), bio: "WhatsApp me at +44 7700 900123" },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.match(errors.bio, /Remove contact details/i);
});

test("bio step allows ordinary numbers and profile text", () => {
  const errors = validatePremiumOnboardingStep({
    step: "bio",
    form: { ...baseForm(), bio: "I moved here in 2024 and have 2 dogs." },
    variant: "global",
    customOccupation: "",
    customTribe: "",
    hasImage: true,
  });

  assert.equal("bio" in errors, false);
});

test("custom occupation and roots text use the same step-level guard", () => {
  const occupationErrors = validatePremiumOnboardingStep({
    step: "occupation",
    form: { ...baseForm(), occupation: "Other" },
    variant: "global",
    customOccupation: "Visit example.com",
    customTribe: "",
    hasImage: true,
  });
  const rootsErrors = validatePremiumOnboardingStep({
    step: "roots",
    form: { ...baseForm(), originCountry: "Nigeria", roots: [], tribe: "Other" },
    variant: "global",
    customOccupation: "",
    customTribe: "tester@example.com",
    hasImage: true,
  });

  assert.match(occupationErrors.occupation, /Remove contact details/i);
  assert.match(rootsErrors.tribe, /Remove contact details/i);
});
