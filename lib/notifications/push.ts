import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

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
};

export const registerPushToken = async (userId: string) => {
  if (!userId) return;
  if (!Device.isDevice) {
    console.log('[push] physical device required for notifications');
    return;
  }

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('[push] permission not granted');
    return;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.log('[push] missing projectId');
    return;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResponse.data;
  if (!token) return;

  const deviceId = (Constants as any).deviceId || Device.osBuildId || null;
  const appVersion = Constants.nativeAppVersion || null;

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        device_id: deviceId,
        app_version: appVersion,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );

  if (error) {
    console.log('[push] token upsert error', error);
  }
};
