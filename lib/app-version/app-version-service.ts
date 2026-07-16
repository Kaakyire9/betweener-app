import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Linking } from 'react-native';

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import type {
  AppVersionEnvironment,
  AppVersionRule,
  CachedVersionRuleState,
  InstalledAppVersion,
  SoftPromptDismissalState,
} from '@/lib/app-version/types';
import {
  compareInstalledToTarget,
} from '@/lib/app-version/version-compare';

export { decideAppVersionRule } from '@/lib/app-version/version-compare';

// Silent-first product policy:
// - normal releases stay quiet and rely on App Store / Play auto-update behavior
// - soft prompts are an intentional exception, not the default release path
// - force update remains available for unsupported or operationally unsafe builds
export const ENABLE_APP_VERSION_GATE = true;
export const ENABLE_SOFT_UPDATE_PROMPT = true;
export const ENABLE_FORCE_UPDATE_GATE = true;
export const ENABLE_WHATS_NEW_AFTER_UPDATE = true;

export const APP_VERSION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const VERSION_RULE_CACHE_KEY = 'app_version_rule_cache_v1';
const SOFT_PROMPT_DISMISSAL_KEY = 'app_version_soft_prompt_dismissal_v1';
const WHATS_NEW_SEEN_KEY = 'app_version_whats_new_seen_v1';

const DEFAULT_IOS_STORE_URL = 'https://apps.apple.com/app/betweener/id6753134347';
const DEFAULT_ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.aduboffour.betweener';

const normalizeStoreUrl = (value: unknown, platform: AppVersionRule['platform']): string => {
  const fallback = platform === 'android' ? DEFAULT_ANDROID_STORE_URL : DEFAULT_IOS_STORE_URL;
  const candidate = normalizeString(value);
  if (!candidate) return fallback;

  try {
    const parsed = new URL(candidate);
    const expectedHost = platform === 'android' ? 'play.google.com' : 'apps.apple.com';
    return parsed.protocol === 'https:' && parsed.hostname === expectedHost ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
};

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

const parseBuildNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === 'string') {
    const numeric = parseInt(value, 10);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  }
  return 0;
};

const normalizeString = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean).slice(0, 4);
};

export const normalizeAppVersionEnvironment = (value?: string | null): AppVersionEnvironment => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'development') return 'development';
  if (normalized === 'preview' || normalized === 'staging') return 'staging';
  return 'production';
};

export const getInstalledAppVersion = (): InstalledAppVersion => {
  const platform = Application.applicationId?.includes('.android')
    ? 'android'
    : (Application.applicationId ? Constants.platform?.ios ? 'ios' : 'android' : undefined);

  const nativeVersion =
    normalizeString(Application.nativeApplicationVersion) ||
    normalizeString(Constants.expoConfig?.version) ||
    '0.0.0';
  const nativeBuildNumber =
    parseBuildNumber(Application.nativeBuildVersion) ||
    parseBuildNumber((Constants.expoConfig as any)?.ios?.buildNumber) ||
    parseBuildNumber((Constants.expoConfig as any)?.android?.versionCode);
  const environment = normalizeAppVersionEnvironment(process.env.EXPO_PUBLIC_ENVIRONMENT);
  const resolvedPlatform: InstalledAppVersion['platform'] =
    (Constants.platform?.ios ? 'ios' : Constants.platform?.android ? 'android' : platform) === 'android'
      ? 'android'
      : 'ios';

  return {
    platform: resolvedPlatform,
    environment,
    version: nativeVersion,
    buildNumber: nativeBuildNumber,
    versionKey: `${resolvedPlatform}:${environment}:${nativeVersion}(${nativeBuildNumber})`,
  };
};

const normalizeRulePayload = (value: unknown, installed: InstalledAppVersion): AppVersionRule | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const platform = normalizeString(raw.platform, installed.platform);
  const environment = normalizeAppVersionEnvironment(normalizeString(raw.environment, installed.environment));
  const latestVersion = normalizeString(raw.latestVersion, installed.version);
  const latestBuildNumber = parseBuildNumber(raw.latestBuildNumber);
  const minimumSupportedVersion = normalizeString(raw.minimumSupportedVersion, latestVersion);
  const minimumSupportedBuildNumber = parseBuildNumber(raw.minimumSupportedBuildNumber);
  const updateMode = normalizeString(raw.updateMode, 'silent');

  if (platform !== 'ios' && platform !== 'android') return null;
  if (platform !== installed.platform || environment !== installed.environment) return null;
  if (updateMode !== 'silent' && updateMode !== 'soft' && updateMode !== 'force') return null;

  const storeUrl = normalizeStoreUrl(raw.storeUrl, platform);

  return {
    platform,
    environment,
    latestVersion,
    latestBuildNumber,
    minimumSupportedVersion,
    minimumSupportedBuildNumber,
    updateMode,
    updateTitle: normalizeString(raw.updateTitle) || null,
    updateMessage: normalizeString(raw.updateMessage) || null,
    whatsNewTitle: normalizeString(raw.whatsNewTitle) || null,
    whatsNewItems: normalizeStringArray(raw.whatsNewItems),
    storeUrl,
    softPromptCooldownHours: Math.max(1, parseBuildNumber(raw.softPromptCooldownHours) || 72),
  };
};

export const fetchRemoteAppVersionRule = async (
  installed: InstalledAppVersion,
): Promise<AppVersionRule | null> => {
  const { data, error } = await supabase.rpc('rpc_get_app_version_rule' as never, {
    p_platform: installed.platform,
    p_environment: installed.environment,
  } as never);

  if (error) {
    throw error;
  }

  return normalizeRulePayload(data, installed);
};

export const isInstalledVersionAtOrAboveLatest = (
  installed: InstalledAppVersion,
  rule: AppVersionRule,
): boolean =>
  compareInstalledToTarget(
    installed.version,
    installed.buildNumber,
    rule.latestVersion,
    rule.latestBuildNumber,
  ) >= 0;

export const shouldThrottleAppVersionCheck = (checkedAt: number | null, now = Date.now()) =>
  checkedAt !== null && now - checkedAt < APP_VERSION_CHECK_INTERVAL_MS;

export const readCachedAppVersionRule = async (): Promise<CachedVersionRuleState | null> => {
  try {
    const raw = await AsyncStorage.getItem(VERSION_RULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedVersionRuleState;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.checkedAt !== 'number') return null;
    const installed = getInstalledAppVersion();
    const normalizedRule = normalizeRulePayload(parsed.rule, installed);
    if (!normalizedRule) return null;
    return { checkedAt: parsed.checkedAt, rule: normalizedRule };
  } catch {
    return null;
  }
};

export const writeCachedAppVersionRule = async (state: CachedVersionRuleState) => {
  await AsyncStorage.setItem(VERSION_RULE_CACHE_KEY, JSON.stringify(state));
};

export const readSoftPromptDismissal = async (): Promise<SoftPromptDismissalState | null> => {
  try {
    const raw = await AsyncStorage.getItem(SOFT_PROMPT_DISMISSAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SoftPromptDismissalState;
    if (!parsed || typeof parsed.versionKey !== 'string' || typeof parsed.dismissedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeSoftPromptDismissal = async (state: SoftPromptDismissalState) => {
  await AsyncStorage.setItem(SOFT_PROMPT_DISMISSAL_KEY, JSON.stringify(state));
};

export const hasSoftPromptCooldownElapsed = (
  rule: AppVersionRule,
  dismissal: SoftPromptDismissalState | null,
  installed: InstalledAppVersion,
  now = Date.now(),
) => {
  if (!dismissal) return true;
  if (dismissal.versionKey !== installed.versionKey) return true;
  return now - dismissal.dismissedAt >= rule.softPromptCooldownHours * 60 * 60 * 1000;
};

export const readWhatsNewSeenVersion = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(WHATS_NEW_SEEN_KEY);
  } catch {
    return null;
  }
};

export const writeWhatsNewSeenVersion = async (versionKey: string) => {
  await AsyncStorage.setItem(WHATS_NEW_SEEN_KEY, versionKey);
};

export const shouldShowWhatsNew = (
  rule: AppVersionRule,
  installed: InstalledAppVersion,
  lastSeenVersionKey: string | null,
) => {
  if (!ENABLE_WHATS_NEW_AFTER_UPDATE) return false;
  if (rule.whatsNewItems.length === 0) return false;
  if (!isInstalledVersionAtOrAboveLatest(installed, rule)) return false;
  return lastSeenVersionKey !== installed.versionKey;
};

export const shouldBypassForceUpdateForCurrentBuild = (installed: InstalledAppVersion) =>
  isDev || installed.environment !== 'production';

export const openAppVersionStoreUrl = async (rule: AppVersionRule): Promise<boolean> => {
  const nativeStoreUrl =
    rule.platform === 'ios'
      ? 'itms-apps://apps.apple.com/app/id6753134347'
      : 'market://details?id=com.aduboffour.betweener';

  try {
    await Linking.openURL(nativeStoreUrl);
    return true;
  } catch (nativeError) {
    try {
      await Linking.openURL(rule.storeUrl);
      return true;
    } catch (webError) {
      logger.error('[app-version] open_store_url_failed', webError, {
        nativeError,
        nativeStoreUrl,
        storeUrl: rule.storeUrl,
      });
      return false;
    }
  }
};
