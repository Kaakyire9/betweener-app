export type PremiumOnboardingVariant = "global" | "ghana";

export type PremiumOnboardingStepKey =
  | "welcome"
  | "name"
  | "about"
  | "occupation"
  | "bio"
  | "photo"
  | "current_location"
  | "roots"
  | "values"
  | "interests"
  | "relationship_intent"
  | "dating_preferences"
  | "complete";

export type PremiumOnboardingStepConfig = {
  key: PremiumOnboardingStepKey;
  title: string;
  subtitle: string;
};

export type PremiumOnboardingFormState = {
  fullName: string;
  age: string;
  gender: "" | "FEMALE" | "MALE" | "OTHER";
  bio: string;
  occupation: string;
  currentCountry: string;
  originCountry: string;
  region: string;
  city: string;
  cityDistrict: string;
  cityLocalityGeonameId: number | null;
  cityAdmin1Code: string;
  cityLatitude: number | null;
  cityLongitude: number | null;
  tribe: string;
  roots: string[];
  rootsNote: string;
  rootsVisibility: "VISIBLE" | "MATCHES_ONLY" | "HIDDEN";
  religion: string;
  interests: string[];
  lookingFor: string;
  minAgeInterest: string;
  maxAgeInterest: string;
};
