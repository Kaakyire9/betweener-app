import countryData from '../../data/countries.json' with { type: 'json' };

export type CountryOption = {
  label: string;
  dial: string;
  code: string;
};

export const COUNTRIES = countryData as CountryOption[];

export const TOP_COUNTRY_CODES = ['GB', 'US', 'CA', 'GH', 'NG'];

const normalizeCountryLabel = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'GB',
  britain: 'GB',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  usa: 'US',
  america: 'US',
  'united states of america': 'US',
  uae: 'AE',
};

export const findCountryByCode = (code?: string | null) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  return COUNTRIES.find((country) => country.code === normalized) ?? null;
};

export const findCountryByLabel = (label?: string | null) => {
  const normalized = normalizeCountryLabel(label);
  if (!normalized) return null;
  const aliasCode = COUNTRY_ALIASES[normalized];
  if (aliasCode) return findCountryByCode(aliasCode);
  return COUNTRIES.find((country) => normalizeCountryLabel(country.label) === normalized) ?? null;
};

export const getCountryCodeByName = (label?: string | null) =>
  findCountryByLabel(label)?.code ?? null;

export const inferCountryFromPhoneNumber = (phoneNumber?: string | null) => {
  let digits = String(phoneNumber || '').replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits) return null;

  const topRank = new Map(TOP_COUNTRY_CODES.map((code, index) => [code, index]));
  const sortedCountries = [...COUNTRIES].sort((a, b) => {
    const lengthDelta = b.dial.replace(/[^\d]/g, '').length - a.dial.replace(/[^\d]/g, '').length;
    if (lengthDelta !== 0) return lengthDelta;
    return (topRank.get(a.code) ?? 999) - (topRank.get(b.code) ?? 999);
  });

  return sortedCountries.find((country) => {
    const dialDigits = country.dial.replace(/[^\d]/g, '');
    return !!dialDigits && digits.startsWith(dialDigits);
  }) ?? null;
};

export const searchCountries = (query?: string | null) => {
  const normalized = normalizeCountryLabel(query);
  if (!normalized) return COUNTRIES;
  const dialQuery = normalized.replace(/[^\d]/g, '');
  return COUNTRIES.filter((country) => {
    const label = normalizeCountryLabel(country.label);
    const code = country.code.toLowerCase();
    const dial = country.dial.replace(/[^\d]/g, '');
    return (
      label.includes(normalized) ||
      code === normalized ||
      (!!dialQuery && dial.includes(dialQuery))
    );
  });
};

export const getPrioritizedCountries = (query?: string | null) => {
  const results = searchCountries(query);
  if (normalizeCountryLabel(query)) return results;

  const top = TOP_COUNTRY_CODES
    .map(findCountryByCode)
    .filter((country): country is CountryOption => !!country);
  const topCodes = new Set(top.map((country) => country.code));
  return [...top, ...results.filter((country) => !topCodes.has(country.code))];
};
