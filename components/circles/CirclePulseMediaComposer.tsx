import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import {
  CIRCLE_PULSE_IMAGE_MAX_BYTES,
  CIRCLE_PULSE_VIDEO_MAX_BYTES,
  CIRCLE_PULSE_VIDEO_MAX_DURATION_MS,
  type CirclePulseEditorialMediaType,
} from '@/lib/circles/pulse/circle-pulse-media';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import type { CircleLoveSeatCandidate } from '@/lib/circles/pulse/circle-pulse-types';

type Props = {
  saving: boolean;
  uploadProgress?: number | null;
  subjectCandidates?: CircleLoveSeatCandidate[];
  onCancel: () => void;
  onPublish: (input: {
    uri: string;
    mediaType: CirclePulseEditorialMediaType;
    mimeType: string | null;
    fileSize: number | null;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    title: string;
    subtitle: string | null;
    body: string | null;
    provenanceType: 'original' | 'licensed' | 'member_submitted';
    rightsAttested: boolean;
    subjectProfileIds: string[];
  }) => void | Promise<void>;
};

type DraftMedia = {
  uri: string;
  mediaType: CirclePulseEditorialMediaType;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export default function CirclePulseMediaComposer({ saving, uploadProgress, subjectCandidates = [], onCancel, onPublish }: Props) {
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [draftMedia, setDraftMedia] = useState<DraftMedia | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [provenanceType, setProvenanceType] = useState<'original' | 'licensed' | 'member_submitted'>('original');
  const [rightsAttested, setRightsAttested] = useState(false);
  const [subjectProfileIds, setSubjectProfileIds] = useState<string[]>([]);

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
    const asset = result.assets[0];
    const maxBytes = mediaType === 'video' ? CIRCLE_PULSE_VIDEO_MAX_BYTES : CIRCLE_PULSE_IMAGE_MAX_BYTES;
    if (asset.fileSize != null && asset.fileSize > maxBytes) {
      setDraftMedia(null);
      setSelectionError(mediaType === 'video' ? 'Choose a video under 25 MB.' : 'Choose an image under 8 MB.');
      return;
    }
    if (mediaType === 'video' && asset.duration != null && asset.duration > CIRCLE_PULSE_VIDEO_MAX_DURATION_MS) {
      setDraftMedia(null);
      setSelectionError('Choose a video that is 60 seconds or shorter.');
      return;
    }
    setSelectionError(null);
    setDraftMedia({
      uri: asset.uri,
      mediaType,
      mimeType: asset.mimeType ?? null,
      fileSize: asset.fileSize ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      durationMs: asset.duration ?? null,
    });
  };

  const publish = () => {
    const nextTitle = title.trim();
    if (!draftMedia || !nextTitle || !rightsAttested || saving) return;
    void onPublish({
      ...draftMedia,
      title: nextTitle,
      subtitle: subtitle.trim() || null,
      body: body.trim() || null,
      provenanceType,
      rightsAttested,
      subjectProfileIds,
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
      {selectionError ? (
        <View style={styles.errorNotice} accessibilityRole="alert">
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={palette.danger} />
          <Text style={styles.errorText}>{selectionError}</Text>
        </View>
      ) : null}
      {saving && uploadProgress != null ? (
        <View
          style={styles.progressBlock}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(uploadProgress * 100) }}
        >
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(2, Math.round(uploadProgress * 100))}%` }]} />
          </View>
          <Text style={styles.progressText}>Uploading {Math.round(uploadProgress * 100)}%</Text>
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
      <Text style={styles.fieldLabel}>Source</Text>
      <View style={styles.choiceRow}>
        {([
          ['original', 'My original'],
          ['licensed', 'Licensed'],
          ['member_submitted', 'Member submission'],
        ] as const).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: provenanceType === value }}
            style={[styles.choiceChip, provenanceType === value && styles.choiceChipActive]}
            onPress={() => setProvenanceType(value)}
          >
            <Text style={styles.choiceText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {subjectCandidates.length > 0 ? (
        <>
          <Text style={styles.fieldLabel}>Recognisable people (approval required)</Text>
          <View style={styles.choiceRow}>
            {subjectCandidates.slice(0, 12).map((candidate) => {
              const selected = subjectProfileIds.includes(candidate.profileId);
              return (
                <Pressable
                  key={candidate.profileId}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  style={[styles.choiceChip, selected && styles.choiceChipActive]}
                  onPress={() => setSubjectProfileIds((current) => selected
                    ? current.filter((id) => id !== candidate.profileId)
                    : [...current, candidate.profileId])}
                >
                  <MaterialCommunityIcons name={selected ? 'check-circle' : 'account-outline'} size={14} color={palette.teal} />
                  <Text style={styles.choiceText}>{candidate.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: rightsAttested }}
        style={styles.attestation}
        onPress={() => setRightsAttested((current) => !current)}
      >
        <MaterialCommunityIcons name={rightsAttested ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={palette.teal} />
        <Text style={styles.attestationText}>I have permission to share this media and have identified recognisable Circle members.</Text>
      </Pressable>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} disabled={saving} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.publishButton, (!draftMedia || !title.trim() || !rightsAttested) && styles.publishButtonDisabled]} disabled={saving || !draftMedia || !title.trim() || !rightsAttested} onPress={publish}>
          <Text style={styles.publishText}>{saving ? 'Checking media' : 'Submit for review'}</Text>
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
  errorNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11, backgroundColor: palette.surfaceMuted },
  errorText: { flex: 1, color: palette.danger, fontSize: 11, fontWeight: '800' },
  progressBlock: { gap: 6 },
  progressTrack: { height: 5, overflow: 'hidden', borderRadius: 3, backgroundColor: palette.outline },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.teal },
  progressText: { color: palette.textSoft, fontSize: 10, fontWeight: '800' },
  input: { minHeight: 40, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: palette.outline, color: palette.text, fontSize: 12 },
  bodyInput: { minHeight: 72, textAlignVertical: 'top' },
  fieldLabel: { color: palette.textSoft, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choiceChip: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.surfaceMuted },
  choiceChipActive: { borderColor: palette.teal, backgroundColor: palette.tealSoft },
  choiceText: { color: palette.text, fontSize: 10, fontWeight: '800' },
  attestation: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 12, backgroundColor: palette.surfaceMuted },
  attestationText: { flex: 1, color: palette.textSoft, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: palette.outline },
  cancelText: { color: palette.text, fontSize: 11, fontWeight: '800' },
  publishButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18, backgroundColor: palette.teal },
  publishButtonDisabled: { opacity: 0.46 },
  publishText: { color: palette.tealInk, fontSize: 11, fontWeight: '900' },
});
