import { describe, expect, it } from '@jest/globals';

import type { AppVersionRule, InstalledAppVersion } from '@/lib/app-version/types';
import {
  compareInstalledToTarget,
  compareSemver,
  decideAppVersionRule,
} from '@/lib/app-version/version-compare';

const installed = (version: string, buildNumber: number): InstalledAppVersion => ({
  platform: 'ios',
  environment: 'production',
  version,
  buildNumber,
  versionKey: `ios:production:${version}(${buildNumber})`,
});

const rule = (updateMode: AppVersionRule['updateMode']): AppVersionRule => ({
  platform: 'ios',
  environment: 'production',
  latestVersion: '1.1.1',
  latestBuildNumber: 39,
  minimumSupportedVersion: '1.1.0',
  minimumSupportedBuildNumber: 38,
  updateMode,
  updateTitle: null,
  updateMessage: null,
  whatsNewTitle: null,
  whatsNewItems: [],
  storeUrl: 'https://apps.apple.com/app/betweener/id6753134347',
  softPromptCooldownHours: 72,
});

describe('app version release gate', () => {
  it('compares semantic versions before native build numbers', () => {
    expect(compareSemver('1.1.1', '1.1.0')).toBe(1);
    expect(compareInstalledToTarget('1.1.1', 1, '1.1.0', 999)).toBe(1);
    expect(compareInstalledToTarget('1.1.1', 38, '1.1.1', 39)).toBe(-1);
  });

  it('forces builds below the supported minimum regardless of release mode', () => {
    const decision = decideAppVersionRule(installed('1.0.9', 37), rule('silent'));
    expect(decision.status).toBe('force_update');
    expect(decision.isBelowMinimum).toBe(true);
  });

  it('soft-prompts a supported build that is behind latest', () => {
    const decision = decideAppVersionRule(installed('1.1.0', 38), rule('soft'));
    expect(decision.status).toBe('show_soft_update');
    expect(decision.isBelowMinimum).toBe(false);
  });

  it('honours force mode for every build behind latest', () => {
    const decision = decideAppVersionRule(installed('1.1.0', 38), rule('force'));
    expect(decision.status).toBe('force_update');
    expect(decision.isBelowMinimum).toBe(false);
  });

  it('does not prompt a current build', () => {
    expect(decideAppVersionRule(installed('1.1.1', 39), rule('force')).status).toBe('continue');
  });
});
