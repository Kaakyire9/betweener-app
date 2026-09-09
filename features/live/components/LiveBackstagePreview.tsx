import { CameraOff } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera as VisionCamera,
  useCameraDevice,
} from 'react-native-vision-camera';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

type LiveBackstagePreviewProps = {
  active: boolean;
};

/**
 * Device-local camera preview. It has no RTC client, token or network path and
 * therefore cannot publish backstage media accidentally.
 */
export const LiveBackstagePreview = memo(function LiveBackstagePreview({
  active,
}: LiveBackstagePreviewProps) {
  const device = useCameraDevice('front');

  if (!active) {
    return (
      <View style={styles.fallback}>
        <CameraOff size={38} color={LIVE_VISUAL.teal} />
        <Text style={styles.fallbackTitle}>Camera is off</Text>
        <Text style={styles.fallbackBody}>Your private preview remains on this device.</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.fallback}>
        <CameraOff size={38} color={LIVE_VISUAL.teal} />
        <Text style={styles.fallbackTitle}>Front camera unavailable</Text>
        <Text style={styles.fallbackBody}>Try closing another app that may be using the camera.</Text>
      </View>
    );
  }

  return (
    <View style={styles.canvas}>
      <VisionCamera
        device={device}
        isActive
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.vignette} />
    </View>
  );
});

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#071210' },
  vignette: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#03100D1A',
    borderWidth: 1,
    borderColor: LIVE_VISUAL.tealSoft,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 30,
    backgroundColor: '#10201D',
  },
  fallbackTitle: {
    color: '#FFF7EC',
    fontSize: 20,
    fontFamily: 'Archivo_700Bold',
  },
  fallbackBody: {
    color: '#A6B5B1',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'Manrope_500Medium',
  },
});
