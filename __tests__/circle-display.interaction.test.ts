// @ts-nocheck
import { getCircleScopeLabel } from '@/lib/circles/circle-display';

describe('Circle scope display labels', () => {
  it('shows Global without leaking the creator country', () => {
    expect(getCircleScopeLabel({
      visibility_scope: 'global',
      country_name: 'England',
      city: 'London',
    })).toBe('Global');
  });

  it('uses the typed city for local Circles', () => {
    expect(getCircleScopeLabel({
      visibility_scope: 'local',
      country_name: 'Ghana',
      city: 'Kumasi',
    })).toBe('Kumasi');
  });

  it('uses the country for country Circles', () => {
    expect(getCircleScopeLabel({
      visibility_scope: 'country',
      country_name: 'Ghana',
    })).toBe('Ghana');
  });
});
