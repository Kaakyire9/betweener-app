import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import { createMomentFromMedia, createTextMoment } from '@/lib/moments';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';

const pickerMediaTypeImages: ImagePicker.MediaType = 'images';
const pickerMediaTypeVideos: ImagePicker.MediaType = 'videos';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const MOMENT_PROMPTS = [
  'What changed your mind this week?',
  'What kind of home are you building?',
  'What are you ready for now?',
  'What felt peaceful today?',
];

export default function MomentCreateModal({ visible, onClose, onCreated }: Props) {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const placeholderColor = useMemo(() => withAlpha(theme.textMuted, 0.8), [theme.textMuted]);
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
      showOpenSettingsPrompt(
        'Photos access',
        'Turn on photo access in Settings so Betweener can upload a Moment from your library.',
      );
      setError('Permission needed to access photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: pickerMediaTypeImages,
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
      showOpenSettingsPrompt(
        'Camera access',
        'Turn on camera access in Settings so Betweener can record a Moment.',
      );
      setError('Camera permission is required to record a Moment.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: pickerMediaTypeVideos,
      videoMaxDuration: 15,
      allowsEditing: true,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
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

  const handlePickVideo = async () => {
    if (!user?.id) return;
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showOpenSettingsPrompt(
        'Videos access',
        'Turn on photo library access in Settings so Betweener can upload a video Moment.',
      );
      setError('Permission needed to access videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: pickerMediaTypeVideos,
      quality: 0.9,
      videoMaxDuration: 15,
      allowsEditing: true,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
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
            <Pressable style={styles.option} onPress={handlePickVideo} disabled={saving}>
              <MaterialCommunityIcons name="video-plus-outline" size={18} color={Colors.light.background} />
              <Text style={styles.optionText}>Pick Video</Text>
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
            <View style={styles.promptSection}>
              <Text style={styles.promptHeading}>Start with a signal</Text>
              <Text style={styles.promptCopy}>A thoughtful prompt makes it easier for the right person to reply well.</Text>
              <View style={styles.promptWrap}>
                {MOMENT_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    style={styles.promptChip}
                    onPress={() => {
                      setTextBody(prompt);
                      setError(null);
                    }}
                  >
                    <Text style={styles.promptChipText}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <TextInput
              value={textBody}
              onChangeText={setTextBody}
              style={styles.textArea}
              placeholder="Say something thoughtful..."
              placeholderTextColor={placeholderColor}
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
          placeholderTextColor={placeholderColor}
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
  return StyleSheet.create({
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
    promptSection: {
      marginBottom: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: withAlpha(theme.text, isDark ? 0.06 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.secondary, isDark ? 0.24 : 0.18),
    },
    promptHeading: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 13,
      marginBottom: 4,
    },
    promptCopy: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: 'Manrope_500Medium',
      marginBottom: 10,
    },
    promptWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    promptChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.secondary, isDark ? 0.14 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.secondary, isDark ? 0.26 : 0.2),
    },
    promptChipText: {
      color: theme.text,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
    },
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
