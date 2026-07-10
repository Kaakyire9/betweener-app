import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, "tmp", "ghana-geonames", "GH.txt");
const MIGRATION_OUTPUT_PATH = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260707_01_ghana_localities.sql",
);

const REGION_ORDER = [
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
];

const FEATURE_PRIORITY = {
  PPLC: 280,
  PPLA: 220,
  PPLA2: 205,
  PPLA3: 190,
  PPLA4: 175,
  PPLG: 160,
  PPL: 120,
  PPLL: 105,
  PPLX: 95,
  STLMT: 90,
};

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeSearchToken = (value) =>
  normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizeRegionLabel = (value) => {
  const trimmed = normalizeWhitespace(value).replace(/\s+Region$/i, "");
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  const overrides = {
    "greater accra": "Greater Accra",
    "north east": "North East",
    "upper east": "Upper East",
    "upper west": "Upper West",
    "bono east": "Bono East",
    "western north": "Western North",
  };

  if (overrides[lower]) return overrides[lower];

  return trimmed
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const normalizeDistrictLabel = (value) => normalizeWhitespace(value);

const parseRows = () => {
  const raw = fs.readFileSync(SOURCE_PATH, "utf8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [
        geonameid,
        name,
        asciiname,
        alternatenames,
        latitude,
        longitude,
        feature_class,
        feature_code,
        country_code,
        cc2,
        admin1_code,
        admin2_code,
        admin3_code,
        admin4_code,
        population,
        elevation,
        dem,
        timezone,
        modification_date,
      ] = line.split("\t");

      return {
        geonameid: Number(geonameid),
        name: normalizeWhitespace(name),
        asciiname: normalizeWhitespace(asciiname),
        alternatenames: normalizeWhitespace(alternatenames),
        latitude: Number(latitude),
        longitude: Number(longitude),
        feature_class: normalizeWhitespace(feature_class),
        feature_code: normalizeWhitespace(feature_code),
        country_code: normalizeWhitespace(country_code),
        cc2: normalizeWhitespace(cc2),
        admin1_code: normalizeWhitespace(admin1_code),
        admin2_code: normalizeWhitespace(admin2_code),
        admin3_code: normalizeWhitespace(admin3_code),
        admin4_code: normalizeWhitespace(admin4_code),
        population: Number(population || 0),
        elevation: normalizeWhitespace(elevation),
        dem: normalizeWhitespace(dem),
        timezone: normalizeWhitespace(timezone),
        modification_date: normalizeWhitespace(modification_date),
      };
    });
};

const buildAdminMaps = (rows) => {
  const regionByCode = new Map();
  const districtByCode = new Map();

  for (const row of rows) {
    if (row.feature_code === "ADM1" && row.admin1_code) {
      const normalized = normalizeRegionLabel(row.name);
      if (normalized && REGION_ORDER.includes(normalized)) {
        regionByCode.set(row.admin1_code, normalized);
      }
    }
  }

  for (const row of rows) {
    if (row.feature_code !== "ADM2" || !row.admin1_code || !row.admin2_code) continue;
    const region = regionByCode.get(row.admin1_code);
    if (!region) continue;
    districtByCode.set(`${row.admin1_code}:${row.admin2_code}`, normalizeDistrictLabel(row.name));
  }

  return { regionByCode, districtByCode };
};

const dedupeAliases = (row) => {
  const seen = new Set();
  const aliases = [];
  const canonical = normalizeSearchToken(row.name);
  const ascii = normalizeSearchToken(row.asciiname);

  for (const raw of row.alternatenames.split(",")) {
    const cleaned = normalizeWhitespace(raw);
    const normalized = normalizeSearchToken(cleaned);
    if (!cleaned || !normalized) continue;
    if (normalized === canonical || normalized === ascii) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push(cleaned);
    if (aliases.length >= 10) break;
  }

  return aliases;
};

const getRankWeight = (row) => {
  const base = FEATURE_PRIORITY[row.feature_code] ?? 80;
  const populationScore =
    row.population > 0 ? Math.min(180, Math.round(Math.log10(row.population + 1) * 24)) : 0;
  return base + populationScore;
};

const buildLocalityRows = (rows, adminMaps) => {
  const results = [];

  for (const row of rows) {
    if (row.feature_class !== "P") continue;

    const region = adminMaps.regionByCode.get(row.admin1_code);
    if (!region || !row.name) continue;

    const district = adminMaps.districtByCode.get(`${row.admin1_code}:${row.admin2_code}`) ?? null;
    const aliases = dedupeAliases(row);
    const normalizedName = normalizeSearchToken(row.name);
    const normalizedAliases = aliases
      .map((value) => normalizeSearchToken(value))
      .filter(Boolean);
    const searchText = [normalizedName, ...normalizedAliases].join(" ").trim();

    if (!normalizedName || !searchText) continue;

    results.push({
      geonameId: row.geonameid,
      name: row.name,
      region,
      district,
      latitude: row.latitude,
      longitude: row.longitude,
      population: Number.isFinite(row.population) ? row.population : 0,
      featureCode: row.feature_code || "PPL",
      aliases,
      normalizedName,
      normalizedAliases,
      normalizedRegion: normalizeSearchToken(region),
      searchText,
      rankWeight: getRankWeight(row),
    });
  }

  return results.sort((left, right) => {
    if (right.rankWeight !== left.rankWeight) return right.rankWeight - left.rankWeight;
    if (right.population !== left.population) return right.population - left.population;
    if (left.region !== right.region) return REGION_ORDER.indexOf(left.region) - REGION_ORDER.indexOf(right.region);
    if ((left.district || "") !== (right.district || "")) {
      return (left.district || "").localeCompare(right.district || "");
    }
    return left.name.localeCompare(right.name);
  });
};

const sqlString = (value) => {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
};

const sqlArray = (values) => {
  if (!values || values.length === 0) return "'{}'::text[]";
  return `ARRAY[${values.map((value) => sqlString(value)).join(", ")}]::text[]`;
};

const chunk = (items, size) => {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
};

const toSqlMigration = (localityRows) => {
  const header = `-- Generated from GeoNames Ghana country dump (GH.txt).\n-- Source: https://download.geonames.org/export/dump/GH.zip\n-- GeoNames export docs: https://download.geonames.org/export/dump/readme.txt\n-- Do not edit manually. Re-run scripts/generate-ghana-localities.mjs.\n\ndrop function if exists public.search_ghana_localities(text, text, integer);\n\ncreate table if not exists public.ghana_localities (\n  geoname_id bigint primary key,\n  name text not null,\n  region text not null,\n  district text,\n  latitude double precision not null,\n  longitude double precision not null,\n  population bigint not null default 0,\n  feature_code text not null,\n  normalized_name text not null,\n  normalized_aliases text[] not null default '{}'::text[],\n  normalized_region text not null,\n  search_text text not null,\n  rank_weight integer not null default 0,\n  refreshed_at timestamptz not null default timezone('utc'::text, now())\n);\n\nalter table public.ghana_localities enable row level security;\n\ncreate index if not exists idx_ghana_localities_region_rank\n  on public.ghana_localities (normalized_region, rank_weight desc, population desc, name);\n\ncreate index if not exists idx_ghana_localities_name\n  on public.ghana_localities (normalized_name, region);\n\n`;

  const insertStatements = chunk(localityRows, 500)
    .map((group) => {
      const values = group
        .map(
          (row) =>
            `  (${row.geonameId}, ${sqlString(row.name)}, ${sqlString(row.region)}, ${sqlString(
              row.district,
            )}, ${row.latitude}, ${row.longitude}, ${row.population}, ${sqlString(
              row.featureCode,
            )}, ${sqlString(row.normalizedName)}, ${sqlArray(row.normalizedAliases)}, ${sqlString(
              row.normalizedRegion,
            )}, ${sqlString(row.searchText)}, ${row.rankWeight}, timezone('utc'::text, now()))`,
        )
        .join(",\n");

      return `insert into public.ghana_localities (\n  geoname_id,\n  name,\n  region,\n  district,\n  latitude,\n  longitude,\n  population,\n  feature_code,\n  normalized_name,\n  normalized_aliases,\n  normalized_region,\n  search_text,\n  rank_weight,\n  refreshed_at\n)\nvalues\n${values}\non conflict (geoname_id) do update\n  set name = excluded.name,\n      region = excluded.region,\n      district = excluded.district,\n      latitude = excluded.latitude,\n      longitude = excluded.longitude,\n      population = excluded.population,\n      feature_code = excluded.feature_code,\n      normalized_name = excluded.normalized_name,\n      normalized_aliases = excluded.normalized_aliases,\n      normalized_region = excluded.normalized_region,\n      search_text = excluded.search_text,\n      rank_weight = excluded.rank_weight,\n      refreshed_at = excluded.refreshed_at;\n`;
    })
    .join("\n");

  const footer = `\ncreate or replace function public.search_ghana_localities(\n  p_region text default null,\n  p_query text default null,\n  p_limit integer default 40\n)\nreturns table (\n  name text,\n  region text,\n  district text,\n  population bigint,\n  latitude double precision,\n  longitude double precision,\n  feature_code text\n)\nlanguage sql\nstable\nsecurity definer\nset search_path = public, pg_catalog\nas $$\n  with input as (\n    select\n      nullif(regexp_replace(lower(btrim(coalesce(p_region, ''))), '\\s+', ' ', 'g'), '') as region_query,\n      nullif(regexp_replace(lower(btrim(regexp_replace(coalesce(p_query, ''), '[^a-zA-Z0-9\\s-]+', ' ', 'g'))), '\\s+', ' ', 'g'), '') as query_norm,\n      greatest(1, least(coalesce(p_limit, 40), 120)) as limit_value\n  ),\n  tokens as (\n    select\n      input.region_query,\n      input.query_norm,\n      array_remove(regexp_split_to_array(coalesce(input.query_norm, ''), '\\s+'), '') as query_tokens,\n      input.limit_value\n    from input\n  ),\n  ranked as (\n    select\n      locality.name,\n      locality.region,\n      locality.district,\n      locality.population,\n      locality.latitude,\n      locality.longitude,\n      locality.feature_code,\n      case\n        when tokenized.query_norm is null then locality.rank_weight\n        else (\n          case\n            when locality.normalized_name = tokenized.query_norm then 900\n            when tokenized.query_norm = any(locality.normalized_aliases) then 860\n            when locality.normalized_name like tokenized.query_norm || '%' then 780\n            when exists (\n              select 1\n              from unnest(locality.normalized_aliases) alias_value\n              where alias_value like tokenized.query_norm || '%'\n            ) then 740\n            when locality.search_text like '%' || tokenized.query_norm || '%' then 620\n            when not exists (\n              select 1\n              from unnest(tokenized.query_tokens) token\n              where token <> '' and locality.search_text not like '%' || token || '%'\n            ) then 540\n            else -100000\n          end + locality.rank_weight\n        )\n      end as search_score,\n      tokenized.limit_value\n    from public.ghana_localities locality\n    cross join tokens tokenized\n    where (tokenized.region_query is null or locality.normalized_region = tokenized.region_query)\n      and (\n        tokenized.query_norm is null\n        or locality.normalized_name like '%' || tokenized.query_norm || '%'\n        or locality.search_text like '%' || tokenized.query_norm || '%'\n        or exists (\n          select 1\n          from unnest(tokenized.query_tokens) token\n          where token <> '' and locality.normalized_name like token || '%'\n        )\n        or not exists (\n          select 1\n          from unnest(tokenized.query_tokens) token\n          where token <> '' and locality.search_text not like '%' || token || '%'\n        )\n      )\n  )\n  select\n    ranked.name,\n    ranked.region,\n    ranked.district,\n    ranked.population,\n    ranked.latitude,\n    ranked.longitude,\n    ranked.feature_code\n  from ranked\n  where ranked.search_score > -100000\n  order by ranked.search_score desc, ranked.population desc, ranked.name asc\n  limit (select limit_value from tokens limit 1);\n$$;\n\nrevoke all on table public.ghana_localities from public, anon, authenticated;\nrevoke all on function public.search_ghana_localities(text, text, integer) from public;\ngrant execute on function public.search_ghana_localities(text, text, integer) to authenticated;\n`;

  return `${header}${insertStatements}${footer}`;
};

const ensureParent = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const main = () => {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing source dataset: ${SOURCE_PATH}`);
  }

  const rows = parseRows();
  const adminMaps = buildAdminMaps(rows);
  const localityRows = buildLocalityRows(rows, adminMaps);

  ensureParent(MIGRATION_OUTPUT_PATH);
  fs.writeFileSync(MIGRATION_OUTPUT_PATH, toSqlMigration(localityRows), "utf8");

  console.log(
    JSON.stringify(
      {
        rows: localityRows.length,
        regions: REGION_ORDER.length,
        migrationOutput: path.relative(ROOT, MIGRATION_OUTPUT_PATH),
      },
      null,
      2,
    ),
  );
};

main();
