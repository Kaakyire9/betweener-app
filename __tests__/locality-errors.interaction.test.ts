import { describe, expect, it } from '@jest/globals';

import { isLegacyGhanaLocalityForeignKeyError } from '@/lib/location/locality-errors';

describe('locality persistence errors', () => {
  it('identifies the obsolete Ghana-only profile locality foreign key', () => {
    expect(
      isLegacyGhanaLocalityForeignKeyError({
        code: '23503',
        details: 'Key is not present in table "ghana_localities".',
        message: 'profiles_locality_geoname_id_fkey violated',
      }),
    ).toBe(true);
  });

  it('does not hide unrelated foreign-key failures', () => {
    expect(
      isLegacyGhanaLocalityForeignKeyError({
        code: '23503',
        message: 'profiles_user_id_fkey violated',
      }),
    ).toBe(false);
  });
});
