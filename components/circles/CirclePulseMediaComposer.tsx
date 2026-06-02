import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import type { CirclePulseEditorialMediaType } from '@/lib/circles/pulse/circle-pulse-media';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  saving: boolean;
  onCancel: () => void;
  onPublish: (input: {
    uri: string;
    mediaType: CirclePulseEditorialMediaType;
    title: string;
    subtitle: string | null;
    body: string | null;
  }) => void | Promise<void>;
};

type DraftMedia = {
  uri: string;
  mediaType: CirclePulseEditorialMediaType;
};

export default function CirclePulseMediaComposer({ saving, onCancel, onPublish }: Props) {
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [draftMedia, setDraftMedia] = useState<DraftMedia | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');

  const pickMedia = async (mediaType: CirclePulseEditorialMediaType) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showOpenSettingsPrompt(
        mediaType === 'video' ? 'Videos access' : 'Photos access',
        'Turn on photo library access in Settings so Betweener can upload Circle Media.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaType === 'video' ? 'videos' : 'images',
      allowsEditing: mediaType === 'video',
      quality: 0.9,
      videoMaxDuration: mediaType === 'video' ? 60 : undefined,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setDraftMedia({ uri: result.assets[0].uri, mediaType });
  };

  const publish = () => {
    const nextTitle = title.trim();
    if (!draftMedia || !nextTitle || saving) return;
    void onPublish({
      ...draftMedia,
      title: nextTitle,
      subtitle: subtitle.trim() || null,
      body: body.trim() || null,
    });
  };

  return (
    <View style={styles.composer}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons name="image-multiple-outline" size={19} color={palette.teal} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Circle Media</Text>
          <Text style={styles.title}>Share something useful</Text>
          <Text style={styles.subtitle}>Share one image or one short video per spotlight.</Text>
        </View>
      </View>
      <View style={styles.pickerRow}>
        <Pressable style={[styles.pickerButton, draftMedia?.mediaType === 'image' && styles.pickerButtonActive]} onPress={() => void pickMedia('image')}>
          <MaterialCommunityIcons name="image-outline" size={17} color={palette.teal} />
          <Text style={styles.pickerText}>Choose image</Text>
        </Pressable>
        <Pressable style={[styles.pickerButton, draftMedia?.mediaType === 'video' && styles.pickerButtonActive]} onPress={() => void pickMedia('video')}>
          <MaterialCommunityIcons name="play-circle-outline" size={17} color={palette.purple} />
          <Text style={styles.pickerText}>Choose video</Text>
        </Pressable>
      </View>
      {draftMedia ? (
        <View style={styles.previewShell}>
          {draftMedia.mediaType === 'image' ? (
            <Image source={{ uri: draftMedia.uri }} style={styles.previewImage} contentFit="cover" transition={120} />
          ) : (
            <View style={styles.videoPreview}>
              <MaterialCommunityIcons name="play-circle-outline" size={34} color={palette.purple} />
            </View>
          )}
          <View style={styles.previewBadge}>
            <MaterialCommunityIcons name={draftMedia.mediaType === 'video' ? 'movie-open-outline' : 'image-check-outline'} size={15} color={palette.overlayText} />
            <Text style={styles.previewBadgeText}>{draftMedia.mediaType === 'video' ? 'Short video' : 'Circle image'}</Text>
          </View>
        </View>
      ) : null}
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Headline"
        placeholderTextColor={palette.textFaint}
        maxLength={140}
        style={styles.input}
      />
      <TextInput
        value={subtitle}
        onChangeText={setSubtitle}
        placeholder="Optional context"
        placeholderTextColor={palette.textFaint}
        maxLength={240}
        style={styles.input}
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Optional note for members"
        placeholderTextColor={palette.textFaint}
        multiline
        maxLength={2000}
        style={[styles.input, styles.bodyInput]}
      />
      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} disabled={saving} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.publishButton, (!draftMedia || !title.trim()) && styles.publishButtonDisabled]} disabled={saving || !draftMedia || !title.trim()} onPress={publish}>
          <Text style={styles.publishText}>{saving ? 'Publishing' : 'Publish media'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (palette: CirclePulsePalette) => StyleSheet.create({
  composer: { gap: 10, marginTop: 7, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: palette.tealBorder, backgroundColor: palette.tealSoft },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  headerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.tealSoft },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { color: palette.teal, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: palette.text, fontSize: 14, fontWeight: '900' },
  subtitle: { color: palette.textSoft, fontSize: 11, lineHeight: 16 },
  pickerRow: { flexDirection: 'row', gap: 8 },
  pickerButton: { minHeight: 38, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 19, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.surfaceMuted },
  pickerButtonActive: { borderColor: palette.tealBorder, backgroundColor: palette.tealSoft },
  pickerText: { color: palette.text, fontSize: 11, fontWeight: '800' },
  previewShell: { height: 126, overflow: 'hidden', borderRadius: 15, borderWidth: 1, borderColor: palette.tealBorder, backgroundColor: palette.surfaceMuted },
  previewImage: { width: '100%', height: '100%' },
  videoPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.purpleSoft },
  previewBadge: { position: 'absolute', left: 9, bottom: 9, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(7,30,34,0.78)' },
  previewBadgeText: { color: palette.overlayText, fontSize: 10, fontWeight: '900' },
  input: { minHeight: 40, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: palette.outline, color: palette.text, fontSize: 12 },
  bodyInput: { minHeight: 72, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: palette.outline },
  cancelText: { color: palette.text, fontSize: 11, fontWeight: '800' },
  publishButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18, backgroundColor: palette.teal },
  publishButtonDisabled: { opacity: 0.46 },
  publishText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
});
