export type RootsVisibilityValue = "VISIBLE" | "MATCHES_ONLY" | "HIDDEN";

export type RootsVisibilityOption = {
  value: RootsVisibilityValue;
  label: string;
  subtitle: string;
  icon: string;
};

export const GHANA_ROOT_OPTIONS = [
  "Akan",
  "Ewe",
  "Ga-Dangme",
  "Mole-Dagbani",
  "Guan",
  "Gurma",
  "Grusi",
  "Mande",
  "Mixed heritage",
  "Other",
] as const;

export const GLOBAL_ROOT_OPTIONS = [
  "African",
  "Caribbean",
  "European",
  "Latin American",
  "Middle Eastern",
  "Asian",
  "Mixed heritage",
  "Other",
] as const;

export const ROOTS_VISIBILITY_OPTIONS: readonly RootsVisibilityOption[] = [
  {
    value: "VISIBLE",
    label: "Visible on my profile",
    subtitle: "Anyone on Betweener can see this.",
    icon: "eye-outline",
  },
  {
    value: "MATCHES_ONLY",
    label: "Matches only",
    subtitle: "Only people you match with can see this.",
    icon: "account-heart-outline",
  },
  {
    value: "HIDDEN",
    label: "Keep private",
    subtitle: "Only you can see this.",
    icon: "lock-outline",
  },
] as const;
