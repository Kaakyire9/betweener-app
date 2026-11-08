export type PremiumHeroVariant = 'man' | 'woman' | 'brand';

export function resolvePremiumHeroVariant(gender?: string | null): PremiumHeroVariant {
  const normalized = gender?.trim().toUpperCase();

  if (normalized === 'MALE' || normalized === 'MAN' || normalized === 'M') return 'woman';
  if (normalized === 'FEMALE' || normalized === 'WOMAN' || normalized === 'F') return 'man';

  return 'brand';
}
