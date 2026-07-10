import {
  type PremiumOnboardingStepConfig,
  type PremiumOnboardingVariant,
} from "./premium-onboarding.types";

const GLOBAL_GLOBE = require("../../assets/images/onboarding/global-globe.png");
const GHANA_GATE = require("../../assets/images/onboarding/ghana-gate-cropped.png");

export const PREMIUM_ONBOARDING_GLOBAL_REGIONS = [
  "Greater London",
  "England",
  "Scotland",
  "Wales",
  "North America",
  "Europe",
  "Africa",
  "Asia",
  "Oceania",
] as const;

export const PREMIUM_ONBOARDING_GHANA_REGIONS = [
  "Ahafo",
  "Ashanti",
  "Bono",
  "Bono East",
  "Central",
  "Eastern",
  "Greater Accra",
  "North East",
  "Northern",
  "Oti",
  "Savannah",
  "Upper East",
  "Upper West",
  "Volta",
  "Western",
  "Western North",
] as const;

export const PREMIUM_ONBOARDING_ROOTS_OPTIONS = [
  "Akan",
  "Ewe",
  "Ga",
  "Fante",
  "Mole-Dagbon",
  "Yoruba",
  "Caribbean",
  "African",
  "Mixed",
  "Other",
] as const;

export const PREMIUM_ONBOARDING_TRIBES = [
  "African",
  "Caribbean",
  "European",
  "Latin American",
  "Middle Eastern",
  "Asian",
  "Mixed",
  "Other",
] as const;

export const PREMIUM_ONBOARDING_INTERESTS = [
  "Music",
  "Travel",
  "Faith",
  "Fitness",
  "Food",
  "Culture",
  "Books",
  "Business",
  "Art",
  "Family",
  "Nature",
  "Film",
  "Sport",
] as const;

export const PREMIUM_ONBOARDING_OCCUPATIONS = [
  "Entrepreneur",
  "Student",
  "Engineer",
  "Designer",
  "Doctor",
  "Teacher",
  "Marketing Manager",
  "Nurse",
  "Business Owner",
  "Other",
] as const;

export const PREMIUM_ONBOARDING_INTENTS = [
  { value: "Something serious", label: "Something serious" },
  { value: "A meaningful relationship", label: "A meaningful relationship" },
  { value: "Open to seeing where it goes", label: "Open to seeing where it goes" },
  { value: "Friendship first", label: "Friendship first" },
] as const;

export const PREMIUM_ONBOARDING_ROOTS_VISIBILITY = [
  { value: "VISIBLE", label: "Visible on my profile" },
  { value: "MATCHES_ONLY", label: "Matches only" },
  { value: "HIDDEN", label: "Keep private" },
] as const;

export const PREMIUM_ONBOARDING_ROUTE_META = {
  global: {
    modeLabel: "BETWEENER",
    cta: "Begin",
    welcomeTitle: "Where worlds apart feel closer.",
    welcomeSubtitle: "Let's shape a profile that feels like you.",
    completeSubtitle: "Your Betweener story starts here.",
    asset: GLOBAL_GLOBE,
    dark: true,
  },
  ghana: {
    modeLabel: "BETWEENER GHANA",
    cta: "Begin",
    welcomeTitle: "Connection begins closer to home.",
    welcomeSubtitle: "Let's shape a profile around who you are and where your story comes from.",
    completeSubtitle: "Your story, your roots, your next connection.",
    asset: GHANA_GATE,
    dark: false,
  },
} as const;

export function getPremiumOnboardingSteps(
  variant: PremiumOnboardingVariant,
): PremiumOnboardingStepConfig[] {
  return [
    {
      key: "welcome",
      title: PREMIUM_ONBOARDING_ROUTE_META[variant].welcomeTitle,
      subtitle: PREMIUM_ONBOARDING_ROUTE_META[variant].welcomeSubtitle,
    },
    {
      key: "name",
      title: "What should we call you?",
      subtitle: "Use the name you want people to know you by.",
    },
    {
      key: "about",
      title: "A little about you",
      subtitle: "These details help us shape the right discovery experience.",
    },
    {
      key: "occupation",
      title: "What do you do?",
      subtitle: "Work is one part of the story. Choose what fits best.",
    },
    {
      key: "bio",
      title: "In your own words",
      subtitle: "Say something that feels like you.",
    },
    {
      key: "photo",
      title: "Choose the portrait that opens the room.",
      subtitle: "Clear face, natural light, and a first impression people can trust.",
    },
    variant === "ghana"
      ? {
          key: "current_location",
          title: "Where in Ghana feels like home?",
          subtitle: "Choose your region first.",
        }
      : {
          key: "current_location",
          title: "Where are you now?",
          subtitle: "This helps Betweener shape nearby and relevant discovery.",
        },
    variant === "ghana"
      ? {
          key: "roots",
          title: "Your roots",
          subtitle: "Choose the communities or identities that feel part of your story.",
        }
      : {
          key: "roots",
          title: "Where does your story come from?",
          subtitle: "Add your roots if they're part of how you connect.",
        },
    {
      key: "values",
      title: "What matters to you?",
      subtitle: "Share what feels important. You're always in control.",
    },
    {
      key: "interests",
      title: "What brings you to life?",
      subtitle: "Choose a few things you'd genuinely enjoy sharing.",
    },
    {
      key: "relationship_intent",
      title: "What are you hoping to find?",
      subtitle: "Choose what feels true for you right now.",
    },
    {
      key: "dating_preferences",
      title: "Who are you open to meeting?",
      subtitle: "You can adjust this anytime.",
    },
    {
      key: "complete",
      title: "You're ready.",
      subtitle: PREMIUM_ONBOARDING_ROUTE_META[variant].completeSubtitle,
    },
  ];
}
