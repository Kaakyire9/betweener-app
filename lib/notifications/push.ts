import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ensureFreshSession, supabase } from '@/lib/supabase';
import { captureMessage } from '@/lib/telemetry/sentry';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

const LOG_THROTTLE_MS = 60_000;
const logLastAtByKey = new Map<string, number>();

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
  if (!projectId) {
    console.log('[push] missing projectId');
    logOnce('missing_project_id', {
      hasEasProjectId: Boolean(Constants.easConfig?.projectId),
      hasExpoExtraEasProjectId: Boolean(Constants.expoConfig?.extra?.eas?.projectId),
      hasExpoExtraProjectId: Boolean(Constants.expoConfig?.extra?.projectId),
    });
    return;
  }

  let token: string | null = null;
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenResponse.data || null;
  } catch (e) {
    console.log('[push] getExpoPushToken error', e);
    logOnce('token_fetch_error', { message: String((e as any)?.message || e || 'token_fetch_error') });
    return;
  }
  if (!token) return;

  const deviceId = (Constants as any).deviceId || Device.osBuildId || null;
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

  const { error } = await supabase.rpc('upsert_push_token', {
    p_user_id: userId,
    p_token: token,
    p_platform: Platform.OS,
    p_device_id: deviceId,
    p_app_version: appVersion,
  });

  if (error) {
    console.log('[push] token upsert error', error);
    logOnce('upsert_error', {
      status: (error as any)?.status ?? null,
      code: (error as any)?.code ?? null,
      message: String((error as any)?.message || error),
      platform: Platform.OS,
      hasDeviceId: Boolean(deviceId),
      hasAppVersion: Boolean(appVersion),
    });
  } else {
    logOnce('registered', { platform: Platform.OS });
  }
};
