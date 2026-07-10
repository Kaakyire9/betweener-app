// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPremiumOnboardingProfileData,
  updateProfileWithFallbacks,
} from "../lib/onboarding/premium-onboarding.submit.ts";

const baseForm = () => ({
  fullName: "Nana",
  age: "28",
  gender: "FEMALE",
  bio: "Thoughtful and clear.",
  occupation: "Engineer",
  currentCountry: "United Kingdom",
  originCountry: "",
  region: "England",
  tribe: "African",
  roots: ["Akan"],
  rootsNote: "",
  rootsVisibility: "MATCHES_ONLY",
  religion: "Christian",
  interests: ["Music"],
  lookingFor: "Something serious",
  minAgeInterest: "28",
  maxAgeInterest: "40",
});

test("global payload preserves explicit residence and optional Ghana backfill rules", () => {
  const payload = buildPremiumOnboardingProfileData({
    variant: "global",
    form: baseForm(),
    customOccupation: "",
    customTribe: "",
    imageUrl: "https://cdn.test/avatar.jpg",
    phoneNumber: "+447700900123",
  });

  assert.equal(payload.current_country, "United Kingdom");
  assert.equal(payload.current_country_code, "GB");
  assert.equal(payload.location, "England, United Kingdom");
  assert.equal(payload.location_precision, "REGION");
  assert.equal(payload.origin_country, null);
});

test("ghana payload stays country-locked and normalizes roots", () => {
  const payload = buildPremiumOnboardingProfileData({
    variant: "ghana",
    form: {
      ...baseForm(),
      currentCountry: "",
      originCountry: "",
      region: "Ashanti",
      tribe: "",
      roots: ["Other"],
      rootsNote: "Asante",
    },
    customOccupation: "",
    customTribe: "",
    imageUrl: "https://cdn.test/avatar.jpg",
    phoneNumber: "+233201234567",
  });

  assert.equal(payload.current_country, "Ghana");
  assert.equal(payload.current_country_code, "GH");
  assert.deepEqual(payload.roots, ["Asante"]);
  assert.equal(payload.tribe, "Asante");
  assert.equal(payload.origin_country_source, "explicit");
});

test("roots visibility fallback retries with HIDDEN", async () => {
  const payload = buildPremiumOnboardingProfileData({
    variant: "ghana",
    form: baseForm(),
    customOccupation: "",
    customTribe: "",
    imageUrl: "https://cdn.test/avatar.jpg",
    phoneNumber: "+233201234567",
  });

  let calls = 0;
  const updateProfile = async (nextPayload) => {
    calls += 1;
    if (calls === 1) {
      return {
        error: {
          code: "23514",
          message: "profiles_roots_visibility_check violated",
        },
      };
    }
    return { error: null, payload: nextPayload };
  };

  const error = await updateProfileWithFallbacks(updateProfile, payload);

  assert.equal(error, null);
  assert.equal(calls, 2);
});

