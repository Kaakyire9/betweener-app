import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { ArrowLeft, CalendarClock, ShieldCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { liveRepository } from '@/features/live/application/index.ts';

export default function ScheduleLiveScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledStart, setScheduledStart] = useState(() => new Date(Date.now() + 86_400_000));
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [submitting, setSubmitting] = useState(false);
  const formattedStart = useMemo(() => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(scheduledStart), [scheduledStart]);

  const changeDate = (_event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (value) setScheduledStart(value);
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setSubmitting(true);
    try {
      const id = await liveRepository.schedule({
        title: cleanTitle,
        description: description.trim(),
        scheduledStart: scheduledStart.toISOString(),
      });
      router.replace({ pathname: '/live/[sessionId]', params: { sessionId: id } });
    } catch (error) {
      Alert.alert('Room not scheduled', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ArrowLeft size={22} color="#FFF7EC" /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>SELECTED HOSTS</Text><Text style={styles.heading}>Curate a Live room</Text></View>
        </View>
        <View style={styles.form}>
          <View style={styles.promise}><ShieldCheck size={20} color="#D7B56D" /><Text style={styles.promiseText}>Four public seats maximum. No recording, gifting, or popularity rankings.</Text></View>
          <Text style={styles.label}>ROOM TITLE</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="Ghana ↔ UK Match Night" placeholderTextColor="#71827E" style={styles.input} />
          <Text style={styles.label}>HOST NOTE</Text>
          <TextInput value={description} onChangeText={setDescription} maxLength={1000} multiline placeholder="Set the intention and tone for your guests." placeholderTextColor="#71827E" style={[styles.input, styles.multiline]} />
          <Text style={styles.label}>STARTS</Text>
          <Pressable onPress={() => setShowPicker(true)} style={styles.dateButton}><CalendarClock size={18} color="#D7B56D" /><Text style={styles.dateText}>{formattedStart}</Text></Pressable>
          {showPicker ? <DateTimePicker value={scheduledStart} minimumDate={new Date(Date.now() + 600_000)} mode="datetime" onChange={changeDate} textColor="#FFF7EC" /> : null}
        </View>
        <View style={styles.footer}>
          <Pressable disabled={!title.trim() || submitting} onPress={() => void submit()} style={[styles.submit, (!title.trim() || submitting) && styles.disabled]}>
            {submitting ? <ActivityIndicator color="#102522" /> : <Text style={styles.submitText}>Schedule Live</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#081513' }, safe: { flex: 1 },
  header: { paddingHorizontal: 18, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#162724', borderWidth: 1, borderColor: '#304A45' },
  headerCopy: { flex: 1 }, eyebrow: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.8, fontFamily: 'Manrope_800ExtraBold' },
  heading: { color: '#FFF7EC', fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  form: { flex: 1, paddingHorizontal: 22, paddingTop: 20 },
  promise: { flexDirection: 'row', gap: 11, borderRadius: 20, padding: 16, backgroundColor: '#132522', borderWidth: 1, borderColor: '#345049', marginBottom: 26 },
  promiseText: { flex: 1, color: '#AFC0BC', fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  label: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.6, fontFamily: 'Manrope_800ExtraBold', marginBottom: 8, marginTop: 14 },
  input: { minHeight: 54, borderRadius: 18, paddingHorizontal: 16, color: '#FFF7EC', backgroundColor: '#13211F', borderWidth: 1, borderColor: '#30443F', fontFamily: 'Manrope_500Medium' },
  multiline: { minHeight: 106, paddingTop: 15, textAlignVertical: 'top' },
  dateButton: { minHeight: 54, borderRadius: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#13211F', borderWidth: 1, borderColor: '#30443F' },
  dateText: { color: '#FFF7EC', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  footer: { padding: 20 }, submit: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  disabled: { opacity: 0.45 }, submitText: { color: '#102522', fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
});
