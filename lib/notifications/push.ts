import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ensureFreshSession, supabase } from '@/lib/supabase';
import { captureMessage } from '@/lib/telemetry/sentry';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

const LOG_THROTTLE_MS = 60_000;
const PUSH_TOKEN_RETRY_DELAYS_MS = [0, 900, 2_400] as const;
const logLastAtByKey = new Map<string, number>();
const INSTALLATION_ID_PREFIX = 'betweener.push.installation-id';

type AppIdentity = {
  variant: 'staging' | 'production'
  bundleIdentifier: string
}

type PushRegistrationError = {
  status?: number | null
  code?: string | null
  message?: string | null
}

type PushRegistrationResult = {
  error: PushRegistrationError | null
}

const upsertPushTokenV2 = supabase.rpc as unknown as (
  functionName: 'upsert_push_token_v2',
  args: {
    p_user_id: string
    p_token: string
    p_platform: string
    p_device_id: string
    p_app_version: string | null
    p_app_environment: string
    p_application_id: string
    p_expo_project_id: string
    p_installation_id: string
  },
) => PromiseLike<PushRegistrationResult>;

const wait = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

const isTransientPushTokenError = (error: unknown) => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return (
    message.includes('fetchrequestcanceledexception') ||
    message.includes('request has been canceled') ||
    message.includes('request has been cancelled') ||
    message.includes('fetch failed') ||
    message.includes('network request failed')
  );
};

const getExpoPushTokenWithRetry = async (projectId: string) => {
  let lastError: unknown = null;

  for (const delayMs of PUSH_TOKEN_RETRY_DELAYS_MS) {
    if (delayMs > 0) await wait(delayMs);
    try {
      return await Notifications.getExpoPushTokenAsync({ projectId });
    } catch (error) {
      lastError = error;
      if (!isTransientPushTokenError(error)) throw error;
    }
  }

  throw lastError;
};

const logOnce = (key: string, context: Record<string, unknown>) => {
  const now = Date.now();
  const last = logLastAtByKey.get(key) || 0;
  if (now - last < LOG_THROTTLE_MS) return;
  logLastAtByKey.set(key, now);
  try {
    captureMessage(`[push] ${key}`, context);
  } catch {
    // best-effort only
  }
};

const getProjectId = () => {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.expoConfig?.extra?.projectId ||
    undefined
  );
};

const getPushAppIdentity = (): AppIdentity | null => {
  const configured = Constants.expoConfig?.extra?.appIdentity;
  const variant = String(configured?.variant || '').trim().toLowerCase();
  const bundleIdentifier = String(configured?.bundleIdentifier || '').trim();
  const nativeApplicationId = String(Application.applicationId || '').trim();
  if (
    (variant !== 'staging' && variant !== 'production')
    || !bundleIdentifier
    || !nativeApplicationId
    || bundleIdentifier !== nativeApplicationId
  ) {
    return null;
  }
  const expectedApplicationId = variant === 'staging'
    ? 'com.aduboffour.betweener.staging'
    : 'com.aduboffour.betweener';
  if (nativeApplicationId !== expectedApplicationId) return null;
  const expectedSupabaseProjectRef = variant === 'staging'
    ? 'xsgzxadwuxuziubglvps'
    : 'jbyblhithbqwojhwlenv';
  try {
    const supabaseHost = new URL(
      process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    ).hostname.toLowerCase();
    if (supabaseHost !== `${expectedSupabaseProjectRef}.supabase.co`) return null;
  } catch {
    return null;
  }
  return { variant, bundleIdentifier };
};

const getInstallationId = async (applicationId: string) => {
  const key = `${INSTALLATION_ID_PREFIX}.${applicationId}`;
  const existing = String(await SecureStore.getItemAsync(key) || '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return existing;
  }
  const installationId = Crypto.randomUUID();
  await SecureStore.setItemAsync(key, installationId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return installationId;
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    enableVibrate: true,
    enableLights: true,
  });

  // Dedicated channel for chat-style notifications (messages, reactions).
  // If the server sends `channelId: "messages"` but the channel doesn't exist,
  // Android may drop the notification on API 26+.
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#0EA5A4',
    enableVibrate: true,
    enableLights: true,
  });
};

const ensureCategories = async () => {
  // Categories are used for interactive notifications (actions).
  // We set them up early so "categoryId" from push payloads is recognized.
  try {
    await Notifications.setNotificationCategoryAsync('bt_message', [
      {
        identifier: 'OPEN_CHAT',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_message_reaction', [
      {
        identifier: 'OPEN_CHAT',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_match', [
      {
        identifier: 'OPEN_PROFILE',
        buttonTitle: 'View',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_system_message', [
      {
        identifier: 'OPEN_PROFILE',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_intent_request', [
      {
        identifier: 'OPEN_PROFILE',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_verification_outcome', [
      {
        identifier: 'OPEN_PROFILE',
        buttonTitle: 'Review',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_relationship_compass_ready', [
      {
        identifier: 'OPEN_COMPASS',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_moment_post', [
      {
        identifier: 'OPEN_MOMENTS',
        buttonTitle: 'View',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_moment_comment', [
      {
        identifier: 'OPEN_MOMENTS',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }

  try {
    await Notifications.setNotificationCategoryAsync('bt_moment_reaction', [
      {
        identifier: 'OPEN_MOMENTS',
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // best-effort only
  }
};

export const initPushNotificationUX = async () => {
  // Safe to call multiple times (idempotent on both platforms).
  await ensureAndroidChannel();
  await ensureCategories();
};

export const registerPushToken = async (userId: string) => {
  if (!userId) return;
  if (!Device.isDevice) {
    console.log('[push] physical device required for notifications');
    logOnce('not_device', { userIdPresent: true });
    return;
  }

  await initPushNotificationUX();

  const existingPerms = await Notifications.getPermissionsAsync();
  const existingStatus = (existingPerms as any)?.status ?? ((existingPerms as any)?.granted ? 'granted' : 'denied');
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const requestedPerms = await Notifications.requestPermissionsAsync();
    finalStatus = (requestedPerms as any)?.status ?? ((requestedPerms as any)?.granted ? 'granted' : 'denied');
  }
  if (String(finalStatus) !== 'granted') {
    console.log('[push] permission not granted');
    logOnce('permission_denied', { existingStatus, finalStatus });
    return;
  }

  const projectId = getProjectId();
  const appIdentity = getPushAppIdentity();
  if (!projectId || !appIdentity) {
    console.log('[push] missing or ambiguous application provenance');
    logOnce('missing_application_provenance', {
      hasEasProjectId: Boolean(Constants.easConfig?.projectId),
      hasExpoExtraEasProjectId: Boolean(Constants.expoConfig?.extra?.eas?.projectId),
      hasExpoExtraProjectId: Boolean(Constants.expoConfig?.extra?.projectId),
      hasNativeApplicationId: Boolean(Application.applicationId),
      hasConfiguredAppIdentity: Boolean(Constants.expoConfig?.extra?.appIdentity),
    });
    return;
  }

  let token: string | null = null;
  try {
    const tokenResponse = await getExpoPushTokenWithRetry(projectId);
    token = tokenResponse.data || null;
  } catch (e) {
    console.log('[push] getExpoPushToken error', e);
    logOnce('token_fetch_error', { message: String((e as any)?.message || e || 'token_fetch_error') });
    return;
  }
  if (!token) return;

  let installationId: string;
  try {
    installationId = await getInstallationId(appIdentity.bundleIdentifier);
  } catch (error) {
    logOnce('installation_id_unavailable', {
      message: String((error as any)?.message || error || 'installation_id_unavailable'),
    });
    return;
  }
  const appVersion = Constants.nativeAppVersion || null;

  // Ensure the auth token is warm before calling an authenticated-only RPC.
  try {
    const status = await Promise.race([
      ensureFreshSession(),
      new Promise<'failed'>((resolve) => setTimeout(() => resolve('failed'), 6500)),
    ]);
    if (status === 'no_session') {
      logOnce('no_session', { where: 'registerPushToken' });
      return;
    }
  } catch {
    // best-effort only
  }

  const { error } = appIdentity.variant === 'staging'
    ? await upsertPushTokenV2('upsert_push_token_v2', {
      p_user_id: userId,
      p_token: token,
      p_platform: Platform.OS,
      p_device_id: installationId,
      p_app_version: appVersion,
      p_app_environment: appIdentity.variant,
      p_application_id: appIdentity.bundleIdentifier,
      p_expo_project_id: projectId,
      p_installation_id: installationId,
    })
    : await supabase.rpc('upsert_push_token', {
      p_user_id: userId,
      p_token: token,
      p_platform: Platform.OS,
      p_device_id: installationId,
      p_app_version: appVersion,
    });

  if (error) {
    console.log('[push] token upsert error', error);
    logOnce('upsert_error', {
      status: (error as any)?.status ?? null,
      code: (error as any)?.code ?? null,
      message: String((error as any)?.message || error),
      platform: Platform.OS,
      hasInstallationId: Boolean(installationId),
      hasAppVersion: Boolean(appVersion),
    });
  } else {
    logOnce('registered', { platform: Platform.OS });
  }
};
