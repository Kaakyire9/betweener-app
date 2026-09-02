import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CalendarClock, Film, ImagePlus, ShieldCheck, Sparkles, TimerReset, Trash2, UsersRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIVE_EVENT_TEASER_MAX_SECONDS, liveRepository, removeLiveEventMedia, uploadLiveEventPoster, uploadLiveEventTeaser } from '@/features/live/application/index.ts';
import type { LiveSessionFormat } from '@/features/live/domain/live-types.ts';
import { useAuth } from '@/lib/auth-context';

export default function ScheduleLiveScreen() {
  const params = useLocalSearchParams<{ circleId?: string; circleName?: string }>();
  const circleId = typeof params.circleId === 'string' ? params.circleId : null;
  const circleName = typeof params.circleName === 'string' ? params.circleName : null;
  const isCircleLive = Boolean(circleId);
  const { user, canPerformAuthenticatedWrites, isSessionRecoveryActive, retrySessionRecovery } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledStart, setScheduledStart] = useState(() => new Date(Date.now() + 86_400_000));
  const [format, setFormat] = useState<Extract<LiveSessionFormat, 'hosted_match_night' | 'quick_connect'>>('hosted_match_night');
  const [chemistryFirstEnabled, setChemistryFirstEnabled] = useState(false);
  const [minimumParticipants, setMinimumParticipants] = useState('2');
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [submitting, setSubmitting] = useState(false);
  const [poster, setPoster] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [teaser, setTeaser] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const formattedStart = useMemo(() => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(scheduledStart), [scheduledStart]);

  const changeDate = (_event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (value) setScheduledStart(value);
  };

  const pickPoster = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photos access needed', 'Allow photo access to add a Live event poster.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 5], quality: 0.88 });
    if (!result.canceled) setPoster(result.assets[0] ?? null);
  };

  const pickTeaser = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Videos access needed', 'Allow video access to add a short Live preview.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, videoMaxDuration: LIVE_EVENT_TEASER_MAX_SECONDS, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.duration || asset.duration < 1_000) {
      return Alert.alert('Preview unavailable', 'Choose a video whose duration can be verified on this device.');
    }
    if ((asset?.duration ?? 0) > LIVE_EVENT_TEASER_MAX_SECONDS * 1000) return Alert.alert('Keep it short', `Live previews can be up to ${LIVE_EVENT_TEASER_MAX_SECONDS} seconds.`);
    setTeaser(asset);
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (scheduledStart.getTime() < Date.now() + 10 * 60_000) {
      Alert.alert('Choose a later start', 'Schedule this Live at least 10 minutes from now so guests have time to save their place.');
      return;
    }
    setSubmitting(true);
    try {
      const sessionReady = canPerformAuthenticatedWrites
        || await retrySessionRecovery('live_schedule_manual_retry');
      if (!sessionReady) {
        Alert.alert(
          'Reconnect to schedule',
          'Your profile is safe, but Live needs an authenticated connection before a room can be created.'
        );
        return;
      }
      if (!user?.id) throw new Error('authentication_required');
      const scheduleInput = {
        title: cleanTitle,
        description: description.trim(),
        scheduledStart: scheduledStart.toISOString(),
        chemistryFirstEnabled,
      };
      const id = circleId
        ? await liveRepository.scheduleCircle({ ...scheduleInput, circleId, format: 'circle_live', minimumParticipants: Math.max(2, Math.min(100, Number.parseInt(minimumParticipants, 10) || 2)) })
        : await liveRepository.schedule({ ...scheduleInput, format });
      const uploadedPaths: string[] = [];
      try {
        const posterPath = poster ? await uploadLiveEventPoster({ userId: user.id, sessionId: id, uri: poster.uri }) : null;
        if (posterPath) uploadedPaths.push(posterPath);
        const teaserPath = teaser ? await uploadLiveEventTeaser({ userId: user.id, sessionId: id, uri: teaser.uri, mimeType: teaser.mimeType, fileSize: teaser.fileSize }) : null;
        if (teaserPath) uploadedPaths.push(teaserPath);
        if (posterPath || teaserPath) await liveRepository.updateEventMedia(id, {
          posterPath,
          teaserVideoPath: teaserPath,
          teaserDurationSeconds: teaserPath && teaser?.duration
            ? Math.ceil(teaser.duration / 1000)
            : null,
        });
      } catch {
        await removeLiveEventMedia(uploadedPaths);
        Alert.alert('Event scheduled', 'Your Live is safely scheduled, but its promotional media could not be added. You can still manage the event from your Studio.');
      }
      router.replace(circleId
        ? { pathname: '/circles/[id]', params: { id: circleId, tab: 'live' } }
        : '/live');
    } catch {
      Alert.alert('Room not scheduled', 'We could not securely create this room yet. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityLabel={isCircleLive ? 'Back to Circle' : 'Back to Live'} onPress={() => circleId ? router.replace({ pathname: '/circles/[id]', params: { id: circleId, tab: 'live' } }) : router.replace('/live')} style={styles.icon}><ArrowLeft size={22} color="#FFF7EC" /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>{isCircleLive ? 'CIRCLE LIVE' : 'YOUR LIVE STUDIO'}</Text><Text style={styles.heading}>{isCircleLive ? `Live in ${circleName || 'this Circle'}` : 'Create a Live room'}</Text></View>
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.promise}><ShieldCheck size={20} color="#D7B56D" /><Text style={styles.promiseText}>Four public seats maximum. No recording, gifting, or popularity rankings.</Text></View>
          <Text style={styles.label}>EVENT STORY</Text>
          <View style={styles.mediaRow}>
            <Pressable onPress={() => void pickPoster()} style={[styles.mediaCard, poster && styles.posterCard]}>
              {poster ? <Image source={{ uri: poster.uri }} style={styles.posterPreview} /> : <><ImagePlus size={24} color="#D7B56D" /><Text style={styles.mediaTitle}>Add poster</Text><Text style={styles.mediaHint}>4:5 works beautifully</Text></>}
            </Pressable>
            <Pressable onPress={() => void pickTeaser()} style={styles.mediaCard}>
              <Film size={24} color="#D7B56D" /><Text style={styles.mediaTitle}>{teaser ? 'Preview selected' : 'Add video preview'}</Text><Text style={styles.mediaHint}>{teaser ? 'Ready to publish' : 'Optional · 20s max'}</Text>
            </Pressable>
          </View>
          {poster || teaser ? <View style={styles.removeRow}>{poster ? <Pressable onPress={() => setPoster(null)} style={styles.remove}><Trash2 size={13} color="#D7B56D" /><Text style={styles.removeText}>Remove poster</Text></Pressable> : null}{teaser ? <Pressable onPress={() => setTeaser(null)} style={styles.remove}><Trash2 size={13} color="#D7B56D" /><Text style={styles.removeText}>Remove video</Text></Pressable> : null}</View> : null}
          {isCircleLive ? (
            <View style={styles.circleContext}><UsersRound size={20} color="#D7B56D" /><View style={styles.chemistryCopy}><Text style={styles.chemistryTitle}>Circle Live</Text><Text style={styles.chemistryDescription}>This creates a linked Gathering. Live remains the source of truth for quorum, room state, and recap.</Text></View></View>
          ) : <><Text style={styles.label}>LIVE FORMAT</Text>
          <View style={styles.formatRow}>
            <FormatCard
              active={format === 'hosted_match_night'}
              icon={<UsersRound size={20} color={format === 'hosted_match_night' ? '#102522' : '#D7B56D'} />}
              title="Hosted Match Night"
              description="A host curates the stage and thoughtful introductions."
              onPress={() => setFormat('hosted_match_night')}
            />
            <FormatCard
              active={format === 'quick_connect'}
              icon={<TimerReset size={20} color={format === 'quick_connect' ? '#102522' : '#D7B56D'} />}
              title="Quick Connect"
              description="Private three-minute conversations, paired by Betweener."
              onPress={() => setFormat('quick_connect')}
            />
          </View></>}
          <View style={styles.chemistryCard}>
            <View style={styles.chemistryIcon}><Sparkles size={18} color="#D7B56D" /></View>
            <View style={styles.chemistryCopy}>
              <Text style={styles.chemistryTitle}>Chemistry First</Text>
              <Text style={styles.chemistryDescription}>Let conversation lead. Faces reveal only when both people are ready.</Text>
            </View>
            <Switch
              accessibilityLabel="Enable Chemistry First"
              value={chemistryFirstEnabled}
              onValueChange={setChemistryFirstEnabled}
              trackColor={{ false: '#30443F', true: '#806F45' }}
              thumbColor={chemistryFirstEnabled ? '#F3D58B' : '#AFC0BC'}
            />
          </View>
          {isCircleLive ? <><Text style={styles.label}>MINIMUM PEOPLE</Text><TextInput value={minimumParticipants} onChangeText={(value) => setMinimumParticipants(value.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" maxLength={3} placeholder="2" placeholderTextColor="#71827E" style={styles.input} /><Text style={styles.fieldHint}>The Live confirms when this many places are saved. The host is not counted as a reservation.</Text></> : null}
          <Text style={styles.label}>ROOM TITLE</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="Ghana ↔ UK Match Night" placeholderTextColor="#71827E" style={styles.input} />
          <Text style={styles.label}>HOST NOTE</Text>
          <TextInput value={description} onChangeText={setDescription} maxLength={1000} multiline placeholder="Set the intention and tone for your guests." placeholderTextColor="#71827E" style={[styles.input, styles.multiline]} />
          <Text style={styles.label}>STARTS</Text>
          <Pressable onPress={() => setShowPicker(true)} style={styles.dateButton}><CalendarClock size={18} color="#D7B56D" /><Text style={styles.dateText}>{formattedStart}</Text></Pressable>
          {showPicker ? <DateTimePicker value={scheduledStart} minimumDate={new Date(Date.now() + 600_000)} mode="datetime" onChange={changeDate} textColor="#FFF7EC" /> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable disabled={!title.trim() || submitting || isSessionRecoveryActive} onPress={() => void submit()} style={[styles.submit, (!title.trim() || submitting || isSessionRecoveryActive) && styles.disabled]}>
            {submitting || isSessionRecoveryActive ? <ActivityIndicator color="#102522" /> : <Text style={styles.submitText}>Schedule Live</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function FormatCard({ active, icon, title, description, onPress }: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.formatCard, active && styles.formatCardActive]}
    >
      <View style={[styles.formatIcon, active && styles.formatIconActive]}>{icon}</View>
      <Text style={styles.formatTitle}>{title}</Text>
      <Text style={styles.formatDescription}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#081513' }, safe: { flex: 1 },
  header: { paddingHorizontal: 18, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#162724', borderWidth: 1, borderColor: '#304A45' },
  headerCopy: { flex: 1 }, eyebrow: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.8, fontFamily: 'Manrope_800ExtraBold' },
  heading: { color: '#FFF7EC', fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold' },
  form: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 24 },
  promise: { flexDirection: 'row', gap: 11, borderRadius: 20, padding: 16, backgroundColor: '#132522', borderWidth: 1, borderColor: '#345049', marginBottom: 26 },
  promiseText: { flex: 1, color: '#AFC0BC', fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  mediaRow: { flexDirection: 'row', gap: 10 },
  mediaCard: { flex: 1, minHeight: 142, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#13211F', borderWidth: 1, borderColor: '#3A504A' },
  posterCard: { padding: 0 }, posterPreview: { width: '100%', height: 142 },
  mediaTitle: { color: '#FFF7EC', fontSize: 11, marginTop: 9, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold' },
  mediaHint: { color: '#82938F', fontSize: 9, marginTop: 4, fontFamily: 'Manrope_500Medium' },
  removeRow: { flexDirection: 'row', gap: 12, marginTop: 9 }, remove: { flexDirection: 'row', alignItems: 'center', gap: 5 }, removeText: { color: '#D7B56D', fontSize: 9, fontFamily: 'Manrope_700Bold' },
  formatRow: { flexDirection: 'row', gap: 10 },
  formatCard: { flex: 1, minHeight: 156, borderRadius: 22, padding: 15, backgroundColor: '#13211F', borderWidth: 1, borderColor: '#30443F' },
  formatCardActive: { borderColor: '#D7B56D', backgroundColor: '#1B312C' },
  formatIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#203632', marginBottom: 12 },
  formatIconActive: { backgroundColor: '#D7B56D' },
  formatTitle: { color: '#FFF7EC', fontSize: 13, lineHeight: 17, fontFamily: 'Manrope_800ExtraBold', marginBottom: 7 },
  formatDescription: { color: '#AFC0BC', fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  chemistryCard: { minHeight: 86, marginTop: 14, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: '#564C37', backgroundColor: '#172622', flexDirection: 'row', alignItems: 'center', gap: 11 },
  circleContext: { minHeight: 86, marginTop: 14, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: '#564C37', backgroundColor: '#172622', flexDirection: 'row', alignItems: 'center', gap: 12 },
  chemistryIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#29392F' },
  chemistryCopy: { flex: 1 },
  chemistryTitle: { color: '#FFF7EC', fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  chemistryDescription: { color: '#AFC0BC', fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium', marginTop: 3 },
  label: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.6, fontFamily: 'Manrope_800ExtraBold', marginBottom: 8, marginTop: 14 },
  input: { minHeight: 54, borderRadius: 18, paddingHorizontal: 16, color: '#FFF7EC', backgroundColor: '#13211F', borderWidth: 1, borderColor: '#30443F', fontFamily: 'Manrope_500Medium' },
  multiline: { minHeight: 106, paddingTop: 15, textAlignVertical: 'top' },
  fieldHint: { color: '#82938F', fontSize: 9, lineHeight: 14, marginTop: 6, fontFamily: 'Manrope_500Medium' },
  dateButton: { minHeight: 54, borderRadius: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#13211F', borderWidth: 1, borderColor: '#30443F' },
  dateText: { color: '#FFF7EC', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  footer: { padding: 20 }, submit: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  disabled: { opacity: 0.45 }, submitText: { color: '#102522', fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
});
