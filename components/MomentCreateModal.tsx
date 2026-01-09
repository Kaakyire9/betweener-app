import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { createMomentFromMedia, createTextMoment } from '@/lib/moments';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';

const getPickerMediaTypeImages = () =>
  ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;
const getPickerMediaTypeVideos = () =>
  ImagePicker.MediaType?.Videos ?? ImagePicker.MediaTypeOptions.Videos;

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function MomentCreateModal({ visible, onClose, onCreated }: Props) {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: getPickerMediaTypeImages(),
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
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: getPickerMediaTypeVideos(),
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
            <MaterialCommunityIcons name="close" size={18} color={Colors.light.background} />
          </Pressable>
        </View>

        {mode === 'menu' ? (
          <>
            <Pressable style={styles.option} onPress={handleRecordVideo} disabled={saving}>
              <MaterialCommunityIcons name="video" size={18} color={Colors.light.background} />
              <Text style={styles.optionText}>{saving ? 'Uploading...' : 'Record Video (15s max)'}</Text>
            </Pressable>
            <Pressable style={styles.option} onPress={handlePickPhoto} disabled={saving}>
              <MaterialCommunityIcons name="image" size={18} color={Colors.light.background} />
              <Text style={styles.optionText}>Pick Photo</Text>
            </Pressable>
            <Pressable style={styles.option} onPress={() => setMode('text')} disabled={saving}>
              <MaterialCommunityIcons name="format-quote-close" size={18} color={Colors.light.background} />
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
              placeholderTextColor={styles.placeholderColor}
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
          placeholderTextColor={styles.placeholderColor}
          maxLength={80}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Text style={styles.helperText}>Moments expire in 24 hours.</Text>
      </View>
    </Modal>
  );
}

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const createStyles = (theme: typeof Colors.light, isDark: boolean) => {
  const placeholderColor = withAlpha(theme.textMuted, 0.8);
  return StyleSheet.create({
    placeholderColor,
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: {
      position: 'absolute',
      left: 18,
      right: 18,
      top: '22%',
      backgroundColor: theme.background,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.24 : 0.14),
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    title: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 18 },
    closeButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: withAlpha(theme.text, isDark ? 0.16 : 0.12),
    },
    optionText: { color: theme.text, fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
    textArea: {
      minHeight: 120,
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
      padding: 12,
      color: theme.text,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      fontFamily: 'Manrope_500Medium',
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: theme.tint,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryText: { color: Colors.light.background, fontFamily: 'Manrope_700Bold' },
    captionInput: {
      marginTop: 12,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.backgroundSubtle,
      paddingHorizontal: 12,
      color: theme.text,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.12),
      fontFamily: 'Manrope_500Medium',
    },
    helperText: { color: theme.textMuted, fontSize: 12, marginTop: 10, fontFamily: 'Manrope_500Medium' },
    errorText: { color: theme.accent, fontSize: 12, marginTop: 8, fontFamily: 'Manrope_500Medium' },
  });
};
