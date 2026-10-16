// @ts-nocheck
import { getCircleAccessLabel, getCircleScopeLabel } from '@/lib/circles/circle-display';

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

  it('keeps reach and access as separate member-facing labels', () => {
    const circle = {
      reach_scope: 'diaspora',
      access_policy: 'approval_required',
      country_name: 'Ghana',
    };

    expect(getCircleScopeLabel(circle)).toBe('Ghana diaspora');
    expect(getCircleAccessLabel(circle)).toBe('Approval required');
  });

  it('labels combined resident and diaspora reach clearly', () => {
    expect(getCircleScopeLabel({
      reach_scope: 'country',
      reach_scopes: ['country', 'diaspora'],
      country_name: 'Ghana',
    })).toBe('Ghana + diaspora');
  });
});
