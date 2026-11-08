import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export type GatheringFormat = 'physical' | 'online' | 'hybrid';

type CircleOption = { id: string; name: string };

type Props = {
  visible: boolean;
  title: string;
  description: string;
  date: string;
  time: string;
  city: string;
  venue: string;
  format: GatheringFormat;
  circleId: string | null;
  circles: CircleOption[];
  editing: boolean;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onVenueChange: (value: string) => void;
  onFormatChange: (value: GatheringFormat) => void;
  onCircleChange: (value: string | null) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const FORMATS: GatheringFormat[] = ['physical', 'online', 'hybrid'];

export function GatheringComposer(props: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = createStyles(theme);

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <KeyboardAvoidingView style={styles.keyboardWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.card} onPress={() => undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>{props.editing ? 'Edit Gathering' : 'Create Gathering'}</Text>
              <Text style={styles.subtitle}>Plan the experience here. Community review remains separate when required.</Text>
              <TextInput value={props.title} onChangeText={props.onTitleChange} placeholder="Gathering title" placeholderTextColor={theme.textMuted} style={styles.input} returnKeyType="next" />
              <TextInput value={props.description} onChangeText={props.onDescriptionChange} placeholder="What is this Gathering for?" placeholderTextColor={theme.textMuted} multiline style={[styles.input, styles.multiline]} />
              {props.circles.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options} keyboardShouldPersistTaps="handled">
                  <Pressable style={[styles.pill, !props.circleId && styles.pillActive]} onPress={() => props.onCircleChange(null)}><Text style={[styles.pillText, !props.circleId && styles.pillTextActive]}>General</Text></Pressable>
                  {props.circles.map((circle) => (
                    <Pressable key={circle.id} style={[styles.pill, props.circleId === circle.id && styles.pillActive]} onPress={() => props.onCircleChange(circle.id)}>
                      <Text style={[styles.pillText, props.circleId === circle.id && styles.pillTextActive]}>{circle.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.options}>
                {FORMATS.map((item) => (
                  <Pressable key={item} style={[styles.pill, props.format === item && styles.pillActive]} onPress={() => props.onFormatChange(item)}>
                    <Text style={[styles.pillText, props.format === item && styles.pillTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.row}>
                <TextInput value={props.date} onChangeText={props.onDateChange} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textMuted} style={[styles.input, styles.rowInput]} returnKeyType="next" />
                <TextInput value={props.time} onChangeText={props.onTimeChange} placeholder="HH:MM" placeholderTextColor={theme.textMuted} style={[styles.input, styles.rowInput]} returnKeyType="next" />
              </View>
              <TextInput value={props.city} onChangeText={props.onCityChange} placeholder="City" placeholderTextColor={theme.textMuted} style={styles.input} returnKeyType={props.format === 'online' ? 'done' : 'next'} />
              {props.format !== 'online' ? <TextInput value={props.venue} onChangeText={props.onVenueChange} placeholder="Venue name" placeholderTextColor={theme.textMuted} style={styles.input} returnKeyType="done" /> : null}
              <View style={styles.actions}>
                <Pressable style={styles.secondaryButton} onPress={props.onClose}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
                <Pressable style={styles.primaryButton} disabled={props.saving} onPress={props.onSubmit}><Text style={styles.primaryText}>{props.saving ? 'Submitting' : props.editing ? 'Save and resubmit' : 'Submit for review'}</Text></Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.7)' },
  keyboardWrap: { maxHeight: '92%', justifyContent: 'center' },
  card: { maxHeight: '100%', borderRadius: 24, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.outline },
  content: { padding: 20, gap: 12 },
  title: { color: theme.text, fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  subtitle: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  input: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 15, color: theme.text, backgroundColor: theme.backgroundSubtle, borderWidth: 1, borderColor: theme.outline, fontFamily: 'Manrope_500Medium' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 38, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline },
  pillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
  pillText: { color: theme.textMuted, fontSize: 11, fontFamily: 'Archivo_700Bold' },
  pillTextActive: { color: '#071E22' },
  row: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 9, marginTop: 4 },
  secondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline },
  primaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint },
  secondaryText: { color: theme.text, fontSize: 12, fontFamily: 'Archivo_700Bold' },
  primaryText: { color: '#071E22', fontSize: 12, fontFamily: 'Archivo_700Bold' },
});
