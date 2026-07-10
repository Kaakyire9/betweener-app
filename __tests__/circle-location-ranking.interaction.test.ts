// @ts-nocheck
import { getCircleLocationAffinity } from "@/lib/location/location-intelligence";
import { scoreCircleRelevance } from "@/lib/circles/circle-localization";

describe("circle location ranking", () => {
  it("keeps same-city circles ahead of broader same-country circles", () => {
    const profile = {
      city: "Kumasi",
      region: "Ashanti",
      current_country: "Ghana",
      current_country_code: "GH",
    };

    const sameCityCircle = {
      id: "same-city",
      status: "approved",
      visibility_scope: "local",
      city: "Kumasi",
      region: "Ashanti",
      country_name: "Ghana",
      country_code: "GH",
      member_count: 40,
      active_this_week_count: 8,
    };

    const sameCountryCircle = {
      id: "same-country",
      status: "approved",
      visibility_scope: "country",
      city: "Accra",
      region: "Greater Accra",
      country_name: "Ghana",
      country_code: "GH",
      member_count: 40,
      active_this_week_count: 8,
    };

    expect(scoreCircleRelevance(sameCityCircle, profile, "near_me")).toBeGreaterThan(
      scoreCircleRelevance(sameCountryCircle, profile, "near_me"),
    );
  });

  it("matches diaspora circles without requiring diaspora_status on the profile", () => {
    const profile = {
      city: "London",
      region: "England",
      current_country: "United Kingdom",
      current_country_code: "GB",
    };

    const circle = {
      city: null,
      region: "Greater Accra",
      country_name: "Ghana",
      country_code: "GH",
      visibility_scope: "diaspora",
      diaspora_tags: ["ghana", "uk"],
    };

    expect(getCircleLocationAffinity(circle, profile, "diaspora")).toEqual(
      expect.objectContaining({
        reasonCode: "diaspora_circle",
      }),
    );
  });

  it("still gives a diaspora fallback signal from tags even outside diaspora scope", () => {
    const profile = {
      city: "Berlin",
      region: "Berlin",
      current_country: "Germany",
      current_country_code: "DE",
    };

    const circle = {
      city: null,
      region: "Ashanti",
      country_name: "Ghana",
      country_code: "GH",
      visibility_scope: "country",
      diaspora_tags: ["germany"],
    };

    expect(getCircleLocationAffinity(circle, profile, "global")).toEqual(
      expect.objectContaining({
        reasonCode: "diaspora_circle",
      }),
    );
  });
});
