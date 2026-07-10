import { supabase } from "@/lib/supabase";
import { type GhanaCityTownSuggestion } from "@/lib/location/ghana-locality-shared";

type SearchArgs = {
  region?: string | null;
  query?: string | null;
  limit?: number;
};

const normalizeWhitespace = (value?: string | null) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const SEARCH_CACHE = new Map<string, GhanaCityTownSuggestion[]>();

const dedupeSuggestions = (rows: GhanaCityTownSuggestion[]): GhanaCityTownSuggestion[] => {
  const unique = new Map<string, GhanaCityTownSuggestion>();

  for (const row of rows) {
    const name = normalizeWhitespace(row.name);
    if (!name) continue;

    const key =
      row.geonameId != null
        ? `id:${row.geonameId}`
        : [
            name.toLowerCase(),
            normalizeWhitespace(row.region).toLowerCase(),
            normalizeWhitespace(row.district).toLowerCase(),
          ].join(":");
    const rowDistrict = normalizeWhitespace(row.district) || null;
    const existing = unique.get(key);

    if (!existing) {
      unique.set(key, {
        ...row,
        name,
        district: rowDistrict,
      });
      continue;
    }

    const rowPopulation = row.population ?? 0;
    const existingPopulation = existing.population ?? 0;
    const existingDistrict = normalizeWhitespace(existing.district) || null;

    if ((!existingDistrict && rowDistrict) || rowPopulation > existingPopulation) {
      unique.set(key, {
        ...row,
        name,
        district: rowDistrict,
      });
      continue;
    }

    if (!existing.population && rowPopulation > 0) {
      unique.set(key, {
        ...existing,
        population: rowPopulation,
      });
    }
  }

  return Array.from(unique.values());
};

export async function searchGhanaLocalities({
  region,
  query,
  limit = 40,
}: SearchArgs): Promise<GhanaCityTownSuggestion[]> {
  const normalizedRegion = normalizeWhitespace(region);
  if (!normalizedRegion) return [];
  const normalizedQuery = normalizeWhitespace(query) || null;
  const normalizedLimit = Math.max(1, Math.min(limit, 120));
  const cacheKey = `${normalizedRegion}::${normalizedQuery ?? "__empty__"}::${normalizedLimit}`;
  const cached = SEARCH_CACHE.get(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const { data, error } = await supabase.rpc("search_ghana_localities", {
      p_region: normalizedRegion,
      p_query: normalizedQuery,
      p_limit: normalizedLimit,
    });

    if (error) throw error;

    if (Array.isArray(data)) {
      const deduped = dedupeSuggestions(
        data
          .map((row) => ({
            name: String((row as any)?.name || "").trim(),
            region: String((row as any)?.region || normalizedRegion).trim(),
            district: String((row as any)?.district || "").trim() || null,
            population: Number((row as any)?.population || 0) || null,
            geonameId:
              typeof (row as any)?.geoname_id === "number"
                ? (row as any).geoname_id
                : Number((row as any)?.geoname_id || 0) || null,
            latitude:
              typeof (row as any)?.latitude === "number"
                ? (row as any).latitude
                : Number((row as any)?.latitude || 0) || null,
            longitude:
              typeof (row as any)?.longitude === "number"
                ? (row as any).longitude
                : Number((row as any)?.longitude || 0) || null,
            featureCode: String((row as any)?.feature_code || "").trim() || null,
          }))
          .filter((row) => row.name.length > 0),
      );
      SEARCH_CACHE.set(cacheKey, deduped);
      return deduped;
    }
  } catch {
    return [];
  }

  return [];
}
