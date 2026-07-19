export type GhanaCityTownSuggestion = {
  name: string;
  region: string;
  district?: string | null;
  population?: number | null;
  geonameId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  featureCode?: string | null;
};

const normalizeWhitespace = (value?: string | null) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const GHANA_REGIONS = [
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

export const normalizeGhanaRegionValue = (value?: string | null) => {
  const normalized = normalizeWhitespace(value).replace(/\s+region$/i, "").trim();
  if (!normalized) return "";
  return GHANA_REGIONS.find((region) => region.toLowerCase() === normalized.toLowerCase())
    ?? normalized;
};

const titleCaseToken = (token: string) =>
  token ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() : token;

const titleCaseWord = (word: string) =>
  word
    .split(/([-'`])/)
    .map((part) => (/^[-'`]$/.test(part) ? part : titleCaseToken(part)))
    .join("");

export const normalizeGhanaCityTownValue = (value?: string | null) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  if (normalized === normalized.toLowerCase()) {
    return normalized
      .split(" ")
      .map(titleCaseWord)
      .join(" ");
  }
  return normalized;
};

export const isValidGhanaCityTownValue = (value?: string | null) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return true;
  if (normalized.length > 80) return false;
  return /[\p{L}\p{N}]/u.test(normalized);
};
