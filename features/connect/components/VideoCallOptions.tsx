import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import type { VoiceScreenProps } from './VoiceCallScreen';
import { VoiceSafetyPanel } from './VoiceSafetyPanel';
import { CallControlButton } from './CallControlButton';
import type { VideoFit } from '../video/video-types';
import { CallContinuityControls } from './CallContinuityControls';

export function VideoCallOptions({ visible, onClose, fit, onFit, ...props }: VoiceScreenProps & {
  visible: boolean; onClose(): void; fit: VideoFit; onFit(): void;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.root}>
      <Pressable accessibilityLabel="Dismiss call options" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Call options</Text>
          <CallControlButton compact label="Close call options" icon="close" onPress={onClose} /></View>
        <ScrollView contentContainerStyle={styles.content}>
          <CallContinuityControls {...props} />
          {props.state.session?.media === 'video' && props.onDataSavingVideo && <Pressable accessibilityRole="switch" accessibilityLabel="Lower-data video"
            accessibilityState={{ checked: props.state.video?.quality === 'data_saver', disabled: props.state.video?.camera !== 'off' || props.state.video?.qualityChanging }}
            disabled={props.state.video?.camera !== 'off' || props.state.video?.qualityChanging} onPress={props.onDataSavingVideo} style={styles.fit}>
            <Text style={styles.link}>{props.state.video?.qualityChanging ? 'Changing video quality…' : props.state.video?.quality === 'data_saver' ? 'Lower-data video on' : 'Use lower-data video'}</Text>
            <Text style={styles.note}>Turn your camera off to change this. Applies to your next camera start.</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={fit === 'cover' ? 'Show entire video' : 'Fill screen with video'} onPress={onFit} style={styles.fit}>
            <Text style={styles.link}>{fit === 'cover' ? 'Show entire video' : 'Fill screen with video'}</Text>
            <Text style={styles.note}>{fit === 'cover' ? 'See the full frame without cropping.' : 'Let the video fill your screen.'}</Text>
          </Pressable>
          <VoiceSafetyPanel state={props.state} actions={props.safetyActions} flags={props.flags} />
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: '#112527', paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'center', marginTop: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  title: { fontFamily: 'Manrope_600SemiBold', color: Colors.dark.text, fontSize: 21 },
  content: { gap: 16, paddingBottom: 20 }, fit: { paddingVertical: 14, gap: 5, minHeight: 54 },
  link: { color: Colors.dark.secondary, fontSize: 15, fontFamily: 'Manrope_600SemiBold' }, note: { color: Colors.dark.textMuted, fontSize: 13 },
});
