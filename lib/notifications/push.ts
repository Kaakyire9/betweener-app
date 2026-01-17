import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
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

export const registerPushToken = async (userId: string) => {
  if (!userId) return;
  if (!Device.isDevice) {
    console.log('[push] physical device required for notifications');
    return;
  }

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
