import { supabase } from "@/lib/supabase";
import { normalizeCountryCode, type GlobalLocalitySuggestion } from "./global-locality-shared";

const cache = new Map<string, GlobalLocalitySuggestion[]>();

export async function searchGlobalLocalities(input: {
  countryCode: string;
  query: string;
  limit?: number;
}): Promise<GlobalLocalitySuggestion[]> {
  const countryCode = normalizeCountryCode(input.countryCode);
  const query = input.query.replace(/\s+/g, " ").trim();
  const limit = Math.max(1, Math.min(input.limit ?? 20, 30));
  if (countryCode.length !== 2 || query.length < 2) return [];

  const key = `${countryCode}:${query.toLowerCase()}:${limit}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { data, error } = await supabase.functions.invoke("search-global-localities", {
    body: { countryCode, query, limit },
  });
  if (error) throw error;

  const results = Array.isArray(data?.results) ? (data.results as GlobalLocalitySuggestion[]) : [];
  cache.set(key, results);
  return results;
}
