import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CallControlButton } from './CallControlButton';

/** Selection only. Changing the camera mode never starts capture or answers a call. */
export function VideoIncomingControls({ cameraOn, busy, onCameraChange, onAnswer, onDecline }: {
  cameraOn: boolean; busy: boolean; onCameraChange?(on: boolean): void; onAnswer(): void; onDecline(): void;
}) {
  return <View style={styles.row}>
    <CallControlButton lounge label="Decline" icon="call-outline" danger disabled={busy} onPress={onDecline} />
    {onCameraChange && <Pressable accessibilityRole="switch" accessibilityLabel="Camera on when answering"
      accessibilityHint="Choose whether your camera starts after you answer. Your camera is off while ringing."
      accessibilityState={{ checked: cameraOn, disabled: busy }} disabled={busy} onPress={() => onCameraChange(!cameraOn)}
      style={({ pressed }) => [styles.camera, cameraOn && styles.selected, busy && styles.disabled, pressed && styles.pressed]}>
      <Ionicons accessible={false} name={cameraOn ? 'videocam-outline' : 'videocam-off-outline'} size={26} color="#E4F3EB" />
    </Pressable>}
    <CallControlButton lounge label={cameraOn ? 'Answer video call' : 'Answer with camera off'} displayLabel="Answer"
      icon={cameraOn ? 'videocam' : 'call'} selected disabled={busy} onPress={onAnswer} />
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', gap: 8, width: '100%' },
  camera: { minWidth: 52, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, borderWidth: 1,
    borderColor: '#68898F', backgroundColor: 'rgba(186,204,224,0.08)', marginBottom: 24 },
  selected: { borderColor: '#98DDD6', backgroundColor: 'rgba(69,179,174,0.18)' }, disabled: { opacity: 0.4 }, pressed: { opacity: 0.7 },
});
