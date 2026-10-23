import { Colors } from '@/constants/theme';
import type { RelationshipGistManualCoverDraft } from '@/features/relationship-gists/editorial/relationship-gist-manual-cover';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export function RelationshipGistManualCoverField({
  value,
  onChange,
  disabled = false,
}: {
  value: RelationshipGistManualCoverDraft | null;
  onChange: (value: RelationshipGistManualCoverDraft | null) => void;
  disabled?: boolean;
}) {
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos access needed', 'Allow photo access to choose a Relationship Gist cover.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 2],
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri || !asset.width || !asset.height) {
      Alert.alert('Image unavailable', 'Choose another image whose dimensions can be verified.');
      return;
    }
    onChange({ uri: asset.uri, width: asset.width, height: asset.height, altText: value?.altText ?? '' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>EDITORIAL COVER · OPTIONAL</Text>
          <Text style={styles.title}>Add your own image</Text>
          <Text style={styles.body}>Choose and crop a 3:2 image. It stays private until this revision is published.</Text>
        </View>
        <Pressable
          disabled={disabled}
          style={[styles.button, disabled && styles.disabled]}
          onPress={() => void pickImage()}
          accessibilityRole="button"
          accessibilityLabel={value ? 'Replace Relationship Gist cover image' : 'Choose Relationship Gist cover image'}
        >
          <MaterialCommunityIcons name="image-plus" size={17} color="#FFFFFF" />
          <Text style={styles.buttonText}>{value ? 'Replace' : 'Choose image'}</Text>
        </Pressable>
      </View>

      {value ? (
        <View style={styles.previewCard}>
          <Image source={{ uri: value.uri }} style={styles.preview} contentFit="cover" accessibilityLabel={value.altText || 'Selected editorial cover preview'} />
          <TextInput
            editable={!disabled}
            value={value.altText}
            onChangeText={(altText) => onChange({ ...value, altText })}
            placeholder="Describe the image for screen readers"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            maxLength={300}
            accessibilityLabel="Relationship Gist cover alternative text"
          />
          <View style={styles.previewActions}>
            <Text style={styles.meta}>{value.width}×{value.height} · converted to private WebP on upload</Text>
            <Pressable disabled={disabled} onPress={() => onChange(null)} accessibilityRole="button">
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (theme: (typeof Colors)[keyof typeof Colors]) => StyleSheet.create({
  container: { gap: 10, marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  copy: { flex: 1, gap: 3 },
  eyebrow: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 9, letterSpacing: 1 },
  title: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 20 },
  body: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 11, lineHeight: 16 },
  button: { minHeight: 38, paddingHorizontal: 11, borderRadius: 11, backgroundColor: theme.tint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 10 },
  previewCard: { gap: 8 },
  preview: { width: '100%', aspectRatio: 1.5, borderRadius: 11, backgroundColor: theme.background },
  input: { minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: theme.outline, color: theme.text, backgroundColor: theme.background, fontFamily: 'Archivo_400Regular', fontSize: 11 },
  previewActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  meta: { flex: 1, color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 9, lineHeight: 14 },
  remove: { color: theme.danger, fontFamily: 'Archivo_700Bold', fontSize: 10 },
});
