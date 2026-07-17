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
  city: "",
  cityDistrict: "",
  cityLocalityGeonameId: null,
  cityAdmin1Code: "",
  cityLatitude: null,
  cityLongitude: null,
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
  assert.equal(payload.location, "England");
  assert.equal(payload.location_precision, "REGION");
  assert.equal(payload.origin_country, null);
  assert.equal(payload.onboarding_variant, "global");
  assert.equal(payload.age_preference_confirmed_at, payload.onboarding_completed_at);
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
  assert.equal(payload.onboarding_variant, "ghana");
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

test("global locality gracefully retries while the legacy Ghana-only FK is deployed", async () => {
  const payload = {
    ...buildPremiumOnboardingProfileData({
      variant: "global",
      form: {
        ...baseForm(),
        city: "Manchester",
        cityLocalityGeonameId: 2643123,
        cityAdmin1Code: "ENG",
      },
      customOccupation: "",
      customTribe: "",
      imageUrl: "https://cdn.test/avatar.jpg",
      phoneNumber: "+447700900123",
    }),
    locality_geoname_id: 2643123,
    locality_admin1_code: "ENG",
    locality_provider: "geonames",
  };

  const payloads = [];
  const updateProfile = async (nextPayload) => {
    payloads.push(nextPayload);
    if (payloads.length === 1) {
      return {
        error: {
          code: "23503",
          details: 'Key is not present in table "ghana_localities".',
          message: 'profiles_locality_geoname_id_fkey violated',
        },
      };
    }
    return { error: null };
  };

  const error = await updateProfileWithFallbacks(updateProfile, payload);

  assert.equal(error, null);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[1].locality_geoname_id, null);
  assert.equal(payloads[1].city, "Manchester");
  assert.equal(payloads[1].current_country_code, "GB");
});

test("onboarding submission remains compatible before the experience column is deployed", async () => {
  const payload = buildPremiumOnboardingProfileData({
    variant: "global",
    form: baseForm(),
    customOccupation: "",
    customTribe: "",
    imageUrl: "https://cdn.test/avatar.jpg",
    phoneNumber: "+447700900123",
  });

  const payloads = [];
  const updateProfile = async (nextPayload) => {
    payloads.push(nextPayload);
    if (payloads.length === 1) {
      return {
        error: {
          code: "PGRST204",
          message: "Could not find the 'onboarding_variant' column in the schema cache",
        },
      };
    }
    return { error: null };
  };

  const error = await updateProfileWithFallbacks(updateProfile, payload);

  assert.equal(error, null);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].onboarding_variant, "global");
  assert.equal("onboarding_variant" in payloads[1], false);
  assert.equal(payloads[1].current_country_code, "GB");
});

test("onboarding submission remains compatible before age confirmation is deployed", async () => {
  const payload = buildPremiumOnboardingProfileData({
    variant: "global",
    form: baseForm(),
    customOccupation: "",
    customTribe: "",
    imageUrl: "https://cdn.test/avatar.jpg",
    phoneNumber: "+447700900123",
  });

  const payloads = [];
  const updateProfile = async (nextPayload) => {
    payloads.push(nextPayload);
    if (payloads.length === 1) {
      return {
        error: {
          code: "PGRST204",
          message: "Could not find the 'age_preference_confirmed_at' column in the schema cache",
        },
      };
    }
    return { error: null };
  };

  const error = await updateProfileWithFallbacks(updateProfile, payload);

  assert.equal(error, null);
  assert.equal(payloads.length, 2);
  assert.equal("age_preference_confirmed_at" in payloads[1], false);
  assert.equal(payloads[1].min_age_interest, 28);
  assert.equal(payloads[1].max_age_interest, 40);
});
