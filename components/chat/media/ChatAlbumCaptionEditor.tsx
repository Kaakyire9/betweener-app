import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const MAX_CAPTION_LENGTH = 2000;

type ChatAlbumCaptionEditorProps = {
  visible: boolean;
  initialCaption?: string | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (caption: string) => void;
};

export function ChatAlbumCaptionEditor({
  visible,
  initialCaption,
  saving = false,
  onClose,
  onSave,
}: ChatAlbumCaptionEditorProps) {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];
  const [caption, setCaption] = useState(initialCaption ?? '');

  useEffect(() => {
    if (visible) setCaption(initialCaption ?? '');
  }, [initialCaption, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose} />
        <View style={[styles.card, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
          <Text style={[styles.title, { color: theme.text }]}>Edit album caption</Text>
          <Text style={[styles.help, { color: theme.textMuted }]}>
            The caption applies to the whole album. Remove unsafe contact or solicitation details before retrying.
          </Text>
          <TextInput
            autoFocus
            multiline
            editable={!saving}
            maxLength={MAX_CAPTION_LENGTH}
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.background }]}
          />
          <Text style={[styles.counter, { color: theme.textMuted }]}>
            {caption.length}/{MAX_CAPTION_LENGTH}
          </Text>
          <View style={styles.actions}>
            <Pressable disabled={saving} onPress={onClose} style={styles.button}>
              <Text style={[styles.buttonText, { color: theme.textMuted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={() => onSave(caption)}
              style={[styles.button, styles.primaryButton, { backgroundColor: theme.tint }]}
            >
              {saving
                ? <ActivityIndicator size="small" color={theme.background} />
                : <Text style={[styles.buttonText, { color: theme.background }]}>Save & retry</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '700' },
  help: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  input: {
    minHeight: 112,
    maxHeight: 220,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  counter: { alignSelf: 'flex-end', fontSize: 12, marginTop: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12 },
  primaryButton: { minWidth: 116, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '700' },
});
