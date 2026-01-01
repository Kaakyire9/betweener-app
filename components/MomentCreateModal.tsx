import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { createMomentFromMedia, createTextMoment } from '@/lib/moments';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function MomentCreateModal({ visible, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'menu' | 'text'>('menu');
  const [textBody, setTextBody] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setMode('menu');
    setTextBody('');
    setCaption('');
    setError(null);
    onClose();
  };

  const handlePickPhoto = async () => {
    if (!user?.id) return;
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Permission needed to access photos.');
      return;
    }
    const rawImageType =
      (ImagePicker as any).MediaType?.Images ??
      (ImagePicker as any).MediaTypeOptions?.Images ??
      'images';
    const imageType = String(rawImageType).toLowerCase();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [imageType],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setSaving(true);
    const res = await createMomentFromMedia({ userId: user.id, type: 'photo', uri: result.assets[0].uri, caption });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    Alert.alert('Moment posted', 'Your Moment is live for 24 hours.');
    onCreated();
    close();
  };

  const handleRecordVideo = async () => {
    if (!user?.id) return;
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission is required to record a Moment.');
      return;
    }
    const rawVideoType =
      (ImagePicker as any).MediaType?.Videos ??
      (ImagePicker as any).MediaTypeOptions?.Videos ??
      'videos';
    const videoType = String(rawVideoType).toLowerCase();
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: [videoType],
      videoMaxDuration: 15,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setSaving(true);
    const res = await createMomentFromMedia({ userId: user.id, type: 'video', uri: result.assets[0].uri, caption });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    Alert.alert('Moment posted', 'Your Moment is live for 24 hours.');
    onCreated();
    close();
  };

  const handleCreateText = async () => {
    if (!user?.id) return;
    const trimmed = textBody.trim();
    if (!trimmed) {
      setError('Add a short text Moment.');
      return;
    }
    setSaving(true);
    const res = await createTextMoment({ userId: user.id, type: 'text', textBody: trimmed, caption });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    Alert.alert('Moment posted', 'Your Moment is live for 24 hours.');
    onCreated();
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Post a Moment</Text>
          <Pressable onPress={close} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={18} color="#fff" />
          </Pressable>
        </View>

        {mode === 'menu' ? (
          <>
            <Pressable style={styles.option} onPress={handleRecordVideo} disabled={saving}>
              <MaterialCommunityIcons name="video" size={18} color="#fff" />
              <Text style={styles.optionText}>{saving ? 'Uploading...' : 'Record Video (15s max)'}</Text>
            </Pressable>
            <Pressable style={styles.option} onPress={handlePickPhoto} disabled={saving}>
              <MaterialCommunityIcons name="image" size={18} color="#fff" />
              <Text style={styles.optionText}>Pick Photo</Text>
            </Pressable>
            <Pressable style={styles.option} onPress={() => setMode('text')} disabled={saving}>
              <MaterialCommunityIcons name="format-quote-close" size={18} color="#fff" />
              <Text style={styles.optionText}>Text Moment</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              value={textBody}
              onChangeText={setTextBody}
              style={styles.textArea}
              placeholder="Say something..."
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={240}
            />
            <Pressable style={styles.primaryButton} onPress={handleCreateText} disabled={saving}>
              <Text style={styles.primaryText}>{saving ? 'Posting...' : 'Post Text Moment'}</Text>
            </Pressable>
          </>
        )}

        <TextInput
          value={caption}
          onChangeText={setCaption}
          style={styles.captionInput}
          placeholder="Optional caption"
          placeholderTextColor="#6b7280"
          maxLength={80}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Text style={styles.helperText}>Moments expire in 24 hours.</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '22%',
    backgroundColor: '#0b1220',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { color: '#fff', fontFamily: 'Archivo_700Bold', fontSize: 18 },
  closeButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  optionText: { color: '#e5e7eb', fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
  textArea: {
    minHeight: 120,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    padding: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontFamily: 'Manrope_500Medium',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  captionInput: {
    marginTop: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontFamily: 'Manrope_500Medium',
  },
  helperText: { color: '#6b7280', fontSize: 12, marginTop: 10, fontFamily: 'Manrope_500Medium' },
  errorText: { color: '#f87171', fontSize: 12, marginTop: 8, fontFamily: 'Manrope_500Medium' },
});
