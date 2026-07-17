import {
  type PremiumOnboardingStepConfig,
  type PremiumOnboardingVariant,
} from "./premium-onboarding.types";
import {
  GHANA_ROOT_OPTIONS,
  GLOBAL_ROOT_OPTIONS,
  ROOTS_VISIBILITY_OPTIONS,
} from "../profile/roots-options";

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

export const PREMIUM_ONBOARDING_ROOTS_OPTIONS = GHANA_ROOT_OPTIONS;

export const PREMIUM_ONBOARDING_TRIBES = GLOBAL_ROOT_OPTIONS;

export const PREMIUM_ONBOARDING_INTERESTS = [
  "Music",
  "Travel",
  "Fitness",
  "Food",
  "Culture",
  "Books",
  "Art",
  "Nature",
  "Film",
  "Sport",
  "Faith",
  "Family",
  "Business",
  "Cooking",
  "Dancing",
  "Photography",
  "Fashion",
  "Gaming",
  "Technology",
  "Entrepreneurship",
  "Live music",
  "Football",
  "Wellness",
  "Volunteering",
  "Podcasts",
  "Theatre",
  "Hiking",
  "Nightlife",
] as const;

export const PREMIUM_ONBOARDING_OCCUPATIONS = [
  "Entrepreneur",
  "Student",
  "Software Engineer",
  "Doctor",
  "Teacher",
  "Nurse",
  "Business Owner",
  "Accountant",
  "Architect",
  "Banking Professional",
  "Civil Engineer",
  "Content Creator",
  "Data Analyst",
  "Dentist",
  "Designer",
  "Electrician",
  "Fashion Designer",
  "Farmer or Agribusiness",
  "Government Employee",
  "Hospitality Professional",
  "Human Resources",
  "Lawyer",
  "Lecturer",
  "Marketing Professional",
  "Pharmacist",
  "Photographer",
  "Project Manager",
  "Public Service",
  "Skilled Trade",
  "Between roles",
  "Retired",
  "Prefer not to say",
] as const;

export const PREMIUM_ONBOARDING_INTENTS = [
  {
    value: "Something serious",
    label: "Committed relationship",
    description: "Building something lasting and exclusive.",
    icon: "heart-lock-outline",
  },
  {
    value: "A meaningful relationship",
    label: "Dating with intention",
    description: "Getting to know someone with real potential.",
    icon: "compass-outline",
  },
  {
    value: "Open to seeing where it goes",
    label: "Open to exploring",
    description: "Meeting naturally and seeing where it leads.",
    icon: "routes",
  },
  {
    value: "Friendship first",
    label: "Friendship first",
    description: "Starting with connection before expectations.",
    icon: "account-group-outline",
  },
  {
    value: "Still figuring it out",
    label: "Still figuring it out",
    description: "Open-minded and not ready to define it yet.",
    icon: "thought-bubble-outline",
  },
] as const;

export const PREMIUM_ONBOARDING_ROOTS_VISIBILITY = ROOTS_VISIBILITY_OPTIONS;

export const PREMIUM_ONBOARDING_ROUTE_META = {
  global: {
    modeLabel: "BETWEENER",
    cta: "Shape my world",
    welcomeTitle: "Where your world meets someone else's.",
    welcomeSubtitle: "A thoughtful profile, shaped around who you really are.",
    completeSubtitle: "Your Betweener story starts here.",
    asset: GLOBAL_GLOBE,
    dark: true,
  },
  ghana: {
    modeLabel: "BETWEENER GHANA",
    cta: "Shape my world",
    welcomeTitle: "Your story. Your roots. A new connection.",
    welcomeSubtitle: "Create a thoughtful profile shaped around who you are and where your story begins.",
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
          title: "Choose your place in Ghana.",
          subtitle: "Start with your region, then add a city or town only if it helps refine it.",
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
          subtitle: "Choose the communities, cultures, or identities that feel part of your story.",
        }
      : {
          key: "roots",
          title: "Where does your story come from?",
          subtitle: "Add your roots if they're part of how you connect.",
        },
    {
      key: "values",
      title: "What guides you?",
      subtitle: "Faith and worldview can shape how we connect. Share what feels true to you.",
    },
    {
      key: "interests",
      title: "What brings you to life?",
      subtitle: "Choose 3–5 things you'd genuinely enjoy sharing with someone.",
    },
    {
      key: "relationship_intent",
      title: "What are you hoping to find?",
      subtitle: "Choose the direction that feels most honest for you right now.",
    },
    {
      key: "dating_preferences",
      title: "Who are you open to meeting?",
      subtitle: "You can adjust this anytime.",
    },
    {
      key: "complete",
      title: "Everything begins here.",
      subtitle: PREMIUM_ONBOARDING_ROUTE_META[variant].completeSubtitle,
    },
  ];
}
