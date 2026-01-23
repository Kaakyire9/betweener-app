import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type IntentRequestType = 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';

type IntentRequestSheetProps = {
  visible: boolean;
  onClose: () => void;
  recipientId?: string | null;
  recipientName?: string | null;
  metadata?: Record<string, unknown>;
};

const optionLabels: { type: IntentRequestType; label: string; subtitle: string; icon: string }[] = [
  { type: 'connect', label: 'Ask to chat', subtitle: 'Start a direct connection', icon: 'message-outline' },
  { type: 'date_request', label: 'Ask on a date', subtitle: 'Suggest a plan', icon: 'calendar-heart' },
  { type: 'like_with_note', label: 'Like with note', subtitle: 'Add a short note', icon: 'text-box-plus-outline' },
  { type: 'circle_intro', label: 'Circle intro', subtitle: 'Contextual connect', icon: 'account-group-outline' },
];

export default function IntentRequestSheet({
  visible,
  onClose,
  recipientId,
  recipientName,
  metadata,
}: IntentRequestSheetProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [selectedType, setSelectedType] = useState<IntentRequestType>('connect');
  const [message, setMessage] = useState('');
  const [suggestedPlace, setSuggestedPlace] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const allowCircle = metadata?.source === 'circles';
  const options = useMemo(
    () => (allowCircle ? optionLabels : optionLabels.filter((opt) => opt.type !== 'circle_intro')),
    [allowCircle],
  );

  useEffect(() => {
    if (visible) {
      setSelectedType('connect');
      setMessage('');
      setSuggestedPlace('');
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!recipientId) {
      Alert.alert('Request', 'Select a profile to send a request.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('rpc_create_intent_request', {
        p_recipient_id: recipientId,
        p_type: selectedType,
        p_message: message.trim() ? message.trim() : null,
        p_suggested_time: null,
        p_suggested_place: selectedType === 'date_request' && suggestedPlace.trim() ? suggestedPlace.trim() : null,
        p_metadata: metadata ?? {},
      });
      if (error) throw error;
      if (data) {
        Alert.alert('Request sent', `Your request to ${recipientName || 'connect'} is on the way.`);
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      Alert.alert('Request failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
          style={{ width: '100%' }}
        >
          <View style={styles.sheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetContent}
            >
              <View style={styles.header}>
                <Text style={styles.title}>Send Request</Text>
                <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.closeButton}>
                  <MaterialCommunityIcons name="close" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>Choose how you want to connect.</Text>

              <View style={styles.options}>
                {options.map((opt) => (
                  <TouchableOpacity
                    key={opt.type}
                    style={[styles.optionRow, selectedType === opt.type && styles.optionRowActive]}
                    onPress={() => setSelectedType(opt.type)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.optionIcon, selectedType === opt.type && styles.optionIconActive]}>
                      <MaterialCommunityIcons name={opt.icon as any} size={18} color={theme.tint} />
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionTitle}>{opt.label}</Text>
                      <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Message (optional)</Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Add a short note"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  multiline
                />
              </View>

              {selectedType === 'date_request' ? (
                <View style={styles.inputBlock}>
                  <Text style={styles.inputLabel}>Suggested place (optional)</Text>
                  <TextInput
                    value={suggestedPlace}
                    onChangeText={setSuggestedPlace}
                    placeholder="e.g., Coffee at Osu"
                    placeholderTextColor={theme.textMuted}
                    style={styles.input}
                  />
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={submitting}
              >
                <Text style={styles.submitText}>{submitting ? 'Sending...' : 'Send request'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    backdropPress: { flex: 1 },
    sheet: {
      backgroundColor: theme.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 20,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    sheetContent: {
      paddingBottom: 12,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 18, fontWeight: '800', color: theme.text },
    subtitle: { marginTop: 8, fontSize: 12, color: theme.textMuted },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
    },
    options: { marginTop: 14, gap: 10 },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    optionRowActive: {
      borderColor: theme.tint,
      backgroundColor: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(236, 253, 245, 0.7)',
    },
    optionIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    optionIconActive: { borderColor: theme.tint },
    optionInfo: { flex: 1 },
    optionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    optionSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    inputBlock: { marginTop: 14 },
    inputLabel: { fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: theme.outline,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 40,
      color: theme.text,
      backgroundColor: theme.backgroundSubtle,
    },
    submitButton: {
      marginTop: 16,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: theme.tint,
      alignItems: 'center',
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitText: { color: Colors.light.background, fontWeight: '700' },
  });
