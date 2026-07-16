import type { AppVersionDecision, AppVersionRule, InstalledAppVersion } from '@/lib/app-version/types';

const normalizeSemver = (value: string) =>
  String(value || '0.0.0')
    .trim()
    .split('.')
    .map((part) => {
      const numeric = parseInt(part.replace(/[^\d].*$/, ''), 10);
      return Number.isFinite(numeric) ? numeric : 0;
    });

export function compareSemver(a: string, b: string): number {
  const left = normalizeSemver(a);
  const right = normalizeSemver(b);
  const maxLength = Math.max(left.length, right.length, 3);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

export function compareBuildNumber(a: number, b: number): number {
  const left = Number.isFinite(a) ? a : 0;
  const right = Number.isFinite(b) ? b : 0;
  if (left > right) return 1;
  if (left < right) return -1;
  return 0;
}

export function compareInstalledToTarget(
  installedVersion: string,
  installedBuildNumber: number,
  targetVersion: string,
  targetBuildNumber: number,
): number {
  const versionDelta = compareSemver(installedVersion, targetVersion);
  if (versionDelta !== 0) return versionDelta;
  return compareBuildNumber(installedBuildNumber, targetBuildNumber);
}

export function isBelowMinimumInstalledVersion(
  installed: InstalledAppVersion,
  rule: AppVersionRule,
): boolean {
  return (
    compareInstalledToTarget(
      installed.version,
      installed.buildNumber,
      rule.minimumSupportedVersion,
      rule.minimumSupportedBuildNumber,
    ) < 0
  );
}

export function isBehindLatestVersion(installed: InstalledAppVersion, rule: AppVersionRule): boolean {
  return (
    compareInstalledToTarget(
      installed.version,
      installed.buildNumber,
      rule.latestVersion,
      rule.latestBuildNumber,
    ) < 0
  );
}

export function decideAppVersionRule(
  installed: InstalledAppVersion,
  rule: AppVersionRule,
): AppVersionDecision {
  const belowMinimum = isBelowMinimumInstalledVersion(installed, rule);
  const behindLatest = isBehindLatestVersion(installed, rule);

  if (belowMinimum || (behindLatest && rule.updateMode === 'force')) {
    return {
      status: 'force_update',
      rule,
      installed,
      isBelowMinimum: belowMinimum,
      isBehindLatest: behindLatest,
    };
  }

  if (behindLatest && rule.updateMode === 'soft') {
    return {
      status: 'show_soft_update',
      rule,
      installed,
      isBelowMinimum: false,
      isBehindLatest: true,
    };
  }

  return {
    status: 'continue',
    rule,
    installed,
    isBelowMinimum: false,
    isBehindLatest: behindLatest,
  };
}
