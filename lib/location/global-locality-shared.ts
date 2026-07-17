export type GlobalLocalitySuggestion = {
  geonameId: number;
  name: string;
  countryCode: string;
  countryName: string;
  admin1Code: string | null;
  admin1Name: string | null;
  latitude: number;
  longitude: number;
  population: number | null;
  featureCode: string | null;
  timezone: string | null;
  provider: "geonames" | string;
};

export const normalizeCountryCode = (value?: string | null) =>
  String(value || "").trim().toUpperCase().slice(0, 2);
