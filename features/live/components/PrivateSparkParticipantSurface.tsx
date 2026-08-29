import { LinearGradient } from 'expo-linear-gradient';
import { CameraOff, WifiOff } from 'lucide-react-native';
import { memo, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type PrivateSparkPresentationState =
  | 'normal'
  | 'chemistry_first_frosted'
  | 'camera_off'
  | 'reconnecting';

/**
 * Presentation-only wrapper around the stable native participant renderer.
 * Future Chemistry First treatments animate this overlay without remounting RTC.
 */
export const PrivateSparkParticipantSurface = memo(function PrivateSparkParticipantSurface({
  children,
  displayName,
  state = 'normal',
}: PropsWithChildren<{
  displayName: string;
  state?: PrivateSparkPresentationState;
}>) {
  return (
    <View style={styles.root}>
      {children}
      {state === 'chemistry_first_frosted' ? (
        <View pointerEvents="none" style={styles.frosted} />
      ) : null}
      {state === 'reconnecting' ? (
        <LinearGradient
          colors={['#071512E8', '#17352FEF']}
          style={styles.status}
        >
          <WifiOff color="#E5C882" size={18} />
          <Text style={styles.statusTitle}>{displayName} is reconnecting…</Text>
          <Text style={styles.statusCopy}>Keeping your private space ready.</Text>
        </LinearGradient>
      ) : null}
      {state === 'camera_off' ? (
        <View pointerEvents="none" style={styles.cameraHint}>
          <CameraOff color="#D6C7AC" size={10} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#0B1B18' },
  frosted: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#B9A5E466' },
  status: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  statusTitle: { marginTop: 10, color: '#FFF7EC', fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  statusCopy: { marginTop: 4, color: '#9DB2AC', fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  cameraHint: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#071310B8' },
});
