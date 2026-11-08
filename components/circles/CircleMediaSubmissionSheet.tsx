import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createCirclePulseEditorialMedia } from '@/lib/circles/pulse/circle-pulse-service';
import type { CircleLoveSeatCandidate } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import CirclePulseMediaComposer from './CirclePulseMediaComposer';

type Props = {
  visible: boolean;
  circleId: string;
  actorProfileId: string | null;
  subjectCandidates: CircleLoveSeatCandidate[];
  onClose: () => void;
};

export default function CircleMediaSubmissionSheet({ visible, circleId, actorProfileId, subjectCandidates, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const palette = useCirclePulsePalette();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const submit = async (input: Parameters<typeof createCirclePulseEditorialMedia>[2]) => {
    if (!actorProfileId || saving) return;
    setSaving(true);
    setProgress(0);
    try {
      await createCirclePulseEditorialMedia(circleId, actorProfileId, input, {
        delivery: 'submission',
        onUploadProgress: setProgress,
      });
      Alert.alert('Sent privately to the hosts', 'Your media will appear only after safety checks, any named-member approvals, and host review.');
      onClose();
    } catch (error) {
      Alert.alert('Circle Media', error instanceof Error ? error.message : 'Your media could not be submitted right now.');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: palette.surface }]}>
            <CirclePulseMediaComposer
              saving={saving}
              uploadProgress={progress}
              subjectCandidates={subjectCandidates}
              onCancel={onClose}
              onPublish={submit}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { maxHeight: '92%', padding: 14, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
});
