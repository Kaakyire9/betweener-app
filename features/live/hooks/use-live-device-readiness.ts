import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { useCameraPermission } from 'react-native-vision-camera';

export type LiveDeviceReadiness = 'checking' | 'ready' | 'denied' | 'failed';

export const useLiveDeviceReadiness = () => {
  const cameraPermission = useCameraPermission();
  const [state, setState] = useState<LiveDeviceReadiness>('checking');

  const request = useCallback(async () => {
    setState('checking');
    try {
      const camera = cameraPermission.hasPermission
        ? true
        : await cameraPermission.requestPermission();
      const currentMicrophone = await getRecordingPermissionsAsync();
      const microphone = currentMicrophone.granted
        ? currentMicrophone
        : await requestRecordingPermissionsAsync();
      setState(camera && microphone.granted ? 'ready' : 'denied');
    } catch {
      setState('failed');
    }
  }, [cameraPermission.hasPermission, cameraPermission.requestPermission]);

  useEffect(() => {
    void request();
  }, [request]);

  return { state, request };
};
