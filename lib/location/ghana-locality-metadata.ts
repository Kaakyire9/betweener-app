const GHANA_REGION_SEARCH_METADATA = {
  Ahafo: ["Goaso", "Mim", "Bechem"],
  Ashanti: ["Kumasi", "Obuasi", "Ejisu"],
  Bono: ["Sunyani", "Berekum", "Dormaa Ahenkro"],
  "Bono East": ["Techiman", "Kintampo", "Nkoranza"],
  Central: ["Cape Coast", "Kasoa", "Winneba"],
  Eastern: ["Koforidua", "Nkawkaw", "Akim Oda"],
  "Greater Accra": ["Accra", "Tema", "Madina"],
  "North East": ["Nalerigu", "Walewale", "Gambaga"],
  Northern: ["Tamale", "Yendi", "Savelugu"],
  Oti: ["Dambai", "Kete Krachi", "Jasikan"],
  Savannah: ["Damongo", "Salaga", "Bole"],
  "Upper East": ["Bolgatanga", "Navrongo", "Bawku"],
  "Upper West": ["Wa", "Jirapa", "Lawra"],
  Volta: ["Ho", "Hohoe", "Keta"],
  Western: ["Sekondi-Takoradi", "Tarkwa", "Axim"],
  "Western North": ["Sefwi Wiawso", "Bibiani", "Enchi"],
} as const satisfies Record<string, readonly string[]>;

export function getCuratedRegionSearchExamples(region?: string | null) {
  const key = String(region ?? "").trim();
  return key ? [...(GHANA_REGION_SEARCH_METADATA[key as keyof typeof GHANA_REGION_SEARCH_METADATA] ?? [])] : [];
}
