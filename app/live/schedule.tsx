import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  LIVE_EVENT_TEASER_MAX_SECONDS,
  LIVE_EVENT_TEASER_MAX_DURATION_MS,
  getLiveEventMediaUrl,
  liveRepository,
  removeLiveEventMedia,
  uploadLiveEventPoster,
  uploadLiveEventTeaser,
} from '@/features/live/application/index.ts';
import {
  LIVE_CREATION_STEPS,
  LiveCreationMomentStep,
  LiveCreationProgress,
  LiveCreationReviewStep,
  LiveCreationRoomStep,
  LiveCreationStoryStep,
  clearLiveCreationDraft,
  createLiveCreationDraft,
  createLiveCreationDraftFromSession,
  getLiveCreationStepError,
  getLiveCreationStorageKey,
  loadLiveCreationDraft,
  saveLiveCreationDraft,
  trimLiveTeaser,
  toScheduleLiveStudioInput,
  toUpdateLiveStudioInput,
  updateLiveCreationDraft,
  type LiveCreationDraft,
  type LiveCreationStep,
} from '@/features/live/creation/index.ts';
import { useLiveSessions } from '@/features/live/hooks/index.ts';
import { useAuth } from '@/lib/auth-context';

type StudioParams = {
  circleId?: string;
  circleName?: string;
  sessionId?: string;
  duplicateSessionId?: string;
  initialStep?: LiveCreationStep;
};

const asParam = (value: string | string[] | undefined) => typeof value === 'string' ? value : null;

export default function ScheduleLiveScreen() {
  const params = useLocalSearchParams<StudioParams>();
  const circleIdParam = asParam(params.circleId);
  const circleName = asParam(params.circleName);
  const editSessionId = asParam(params.sessionId);
  const duplicateSessionId = asParam(params.duplicateSessionId);
  const sourceSessionId = editSessionId ?? duplicateSessionId;
  const isEditing = Boolean(editSessionId);
  const {
    user,
    canPerformAuthenticatedWrites,
    isSessionRecoveryActive,
    retrySessionRecovery,
  } = useAuth();
  const { sessions, loading: sessionsLoading } = useLiveSessions();
  const sourceSession = useMemo(
    () => sessions.find((session) => session.id === sourceSessionId),
    [sessions, sourceSessionId],
  );
  const [draft, setDraft] = useState<LiveCreationDraft | null>(null);
  const [step, setStep] = useState<LiveCreationStep>(
    params.initialStep && LIVE_CREATION_STEPS.includes(params.initialStep)
      ? params.initialStep
      : 'moment',
  );
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [poster, setPoster] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [teaser, setTeaser] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [posterRemoved, setPosterRemoved] = useState(false);
  const [teaserRemoved, setTeaserRemoved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const initializedKey = useRef<string | null>(null);
  const publicationComplete = useRef(false);
  const formScrollRef = useRef<ScrollView>(null);
  const hostNoteRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const circleId = sourceSession?.circleId ?? circleIdParam;
  const storageKey = user?.id ? getLiveCreationStorageKey(user.id, circleId) : null;

  useEffect(() => {
    if (!user?.id) return;
    const key = `${user.id}:${editSessionId ?? ''}:${duplicateSessionId ?? ''}:${circleIdParam ?? ''}`;
    if (initializedKey.current === key) return;
    if (sourceSessionId && sessionsLoading) return;

    if (sourceSessionId) {
      if (!sourceSession) return;
      initializedKey.current = key;
      setDraft(createLiveCreationDraftFromSession(sourceSession, Crypto.randomUUID(), {
        duplicate: Boolean(duplicateSessionId),
        circleName,
      }));
      return;
    }

    initializedKey.current = key;
    const nextStorageKey = getLiveCreationStorageKey(user.id, circleIdParam);
    let active = true;
    void loadLiveCreationDraft(nextStorageKey, circleIdParam).then((stored) => {
      if (!active) return;
      if (stored) {
        setDraft(stored);
        setRecovered(true);
      } else {
        setDraft(createLiveCreationDraft({
          clientRequestId: Crypto.randomUUID(),
          circleId: circleIdParam,
          circleName,
        }));
      }
    });
    return () => { active = false; };
  }, [circleIdParam, circleName, duplicateSessionId, editSessionId, sessionsLoading, sourceSession, sourceSessionId, user?.id]);

  useEffect(() => {
    if (!draft || !storageKey || isEditing || publicationComplete.current) return;
    const timer = setTimeout(() => { void saveLiveCreationDraft(storageKey, draft); }, 300);
    return () => clearTimeout(timer);
  }, [draft, isEditing, storageKey]);

  useEffect(() => () => {
    if (hostNoteRevealTimer.current) clearTimeout(hostNoteRevealTimer.current);
  }, []);

  const updateDraft = useCallback((updates: Partial<LiveCreationDraft>) => {
    setDraft((current) => current ? updateLiveCreationDraft(current, updates) : current);
  }, []);

  const revealHostNote = useCallback(() => {
    if (hostNoteRevealTimer.current) clearTimeout(hostNoteRevealTimer.current);
    hostNoteRevealTimer.current = setTimeout(() => {
      formScrollRef.current?.scrollToEnd({ animated: true });
      hostNoteRevealTimer.current = null;
    }, Platform.OS === 'ios' ? 260 : 120);
  }, []);

  const existingPosterUri = !posterRemoved ? getLiveEventMediaUrl(sourceSession?.posterPath) : null;
  const existingTeaserUri = !teaserRemoved ? getLiveEventMediaUrl(sourceSession?.teaserVideoPath) : null;
  const posterUri = poster?.uri ?? existingPosterUri;
  const teaserSelected = Boolean(teaser || existingTeaserUri);
  const stepIndex = LIVE_CREATION_STEPS.indexOf(step);
  const error = draft ? getLiveCreationStepError(draft, step) : null;
  const isLastStep = step === 'review';

  const pickPoster = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos access needed', 'Allow photo access to add a Live event poster.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.88,
    });
    if (!result.canceled) {
      setPoster(result.assets[0] ?? null);
      setPosterRemoved(false);
    }
  };

  const pickTeaser = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Videos access needed', 'Allow video access to add a short Live preview.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.duration || asset.duration < 1_000) {
      Alert.alert('Preview unavailable', 'Choose a video whose duration can be verified on this device.');
      return;
    }
    if (asset.duration > LIVE_EVENT_TEASER_MAX_DURATION_MS) {
      try {
        const trimmed = await trimLiveTeaser(asset);
        if (!trimmed) return;
        setTeaser(trimmed);
        setTeaserRemoved(false);
      } catch {
        Alert.alert(
          'Video editor unavailable',
          `We couldn't open the ${LIVE_EVENT_TEASER_MAX_SECONDS}-second editor. Update to the latest Betweener build and try again.`,
        );
      }
      return;
    }
    setTeaser(asset);
    setTeaserRemoved(false);
  };

  const goNext = () => {
    if (!draft) return;
    const stepError = getLiveCreationStepError(draft, step);
    if (stepError) return;
    setStep(LIVE_CREATION_STEPS[Math.min(stepIndex + 1, LIVE_CREATION_STEPS.length - 1)]!);
  };

  const discardDraft = () => {
    if (!draft || !storageKey) return;
    Alert.alert('Discard this draft?', 'The unpublished Studio draft on this device will be removed.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void clearLiveCreationDraft(storageKey);
          setDraft(createLiveCreationDraft({
            clientRequestId: Crypto.randomUUID(),
            circleId,
            circleName: draft.circleName,
          }));
          setPoster(null);
          setTeaser(null);
          setPosterRemoved(false);
          setTeaserRemoved(false);
          setStep('moment');
          setRecovered(false);
        },
      },
    ]);
  };

  const publish = async () => {
    if (!draft || submitting) return;
    const reviewError = getLiveCreationStepError(draft, 'review');
    if (reviewError) {
      Alert.alert('Studio needs one more detail', reviewError);
      return;
    }
    setSubmitting(true);
    setStageMessage(isEditing ? 'Saving the new version…' : 'Creating your room…');
    try {
      const sessionReady = canPerformAuthenticatedWrites
        || await retrySessionRecovery('live_studio_manual_retry');
      if (!sessionReady) {
        Alert.alert('Reconnect to publish', 'Your draft is safe on this device. Reconnect, then try again.');
        return;
      }
      if (!user?.id) throw new Error('authentication_required');

      let sessionId: string;
      if (isEditing) {
        if (!sourceSession) throw new Error('live_session_not_found');
        await liveRepository.updateStudio(toUpdateLiveStudioInput(draft, sourceSession));
        sessionId = sourceSession.id;
      } else {
        sessionId = await liveRepository.scheduleStudio(toScheduleLiveStudioInput(draft));
      }

      const uploadedPaths: string[] = [];
      const mediaChanged = Boolean(poster || teaser || posterRemoved || teaserRemoved);
      if (mediaChanged) {
        setStageMessage('Finishing the invitation…');
        try {
          let posterPath = posterRemoved ? null : sourceSession?.posterPath ?? null;
          let teaserPath = teaserRemoved ? null : sourceSession?.teaserVideoPath ?? null;
          let teaserDurationSeconds = teaserRemoved ? null : sourceSession?.teaserDurationSeconds ?? null;
          if (poster) {
            posterPath = await uploadLiveEventPoster({ userId: user.id, sessionId, uri: poster.uri });
            if (posterPath) uploadedPaths.push(posterPath);
          }
          if (teaser) {
            teaserPath = await uploadLiveEventTeaser({
              userId: user.id,
              sessionId,
              uri: teaser.uri,
              mimeType: teaser.mimeType,
              fileSize: teaser.fileSize,
            });
            if (teaserPath) uploadedPaths.push(teaserPath);
            teaserDurationSeconds = teaserPath && teaser.duration
              ? Math.ceil(teaser.duration / 1000)
              : null;
          }
          await liveRepository.updateEventMedia(sessionId, {
            posterPath,
            teaserVideoPath: teaserPath,
            teaserDurationSeconds,
          });
        } catch {
          await removeLiveEventMedia(uploadedPaths);
          Alert.alert('Room saved', 'The Live details are safe, but its promotional media could not be updated. You can retry from Studio.');
        }
      }

      publicationComplete.current = true;
      if (storageKey && !isEditing) {
        await clearLiveCreationDraft(storageKey).catch(() => undefined);
      }
      router.replace({
        pathname: '/live/event/[sessionId]',
        params: {
          sessionId,
          ...(circleId ? { returnCircleId: circleId, returnCircleTab: 'live' } : {}),
        },
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : '';
      if (message.includes('version_conflict')) {
        Alert.alert('This Live changed elsewhere', 'Return to the event, refresh it, and reopen Studio before saving again.');
      } else {
        Alert.alert(isEditing ? 'Changes not saved' : 'Room not scheduled', 'Your draft is safe. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
      setStageMessage(null);
    }
  };

  const leave = () => router.back();

  if (!draft) {
    const unavailable = sourceSessionId && !sessionsLoading && !sourceSession;
    return (
      <View style={styles.loading}>
        {unavailable ? <><Text style={styles.loadingTitle}>This Live cannot be opened in Studio.</Text><Pressable onPress={leave}><Text style={styles.loadingLink}>Go back</Text></Pressable></> : <ActivityIndicator color="#D7B56D" />}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Close Live Creation Studio" onPress={leave} style={styles.icon}>
            <ArrowLeft size={22} color="#FFF7EC" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>LIVE CREATION STUDIO</Text>
            <Text style={styles.heading}>{isEditing ? 'Refine your Live' : duplicateSessionId ? 'Create from Live' : 'Create a Live'}</Text>
          </View>
          {!isEditing ? (
            <Pressable accessibilityLabel="Discard Live draft" onPress={discardDraft} style={styles.discardIcon}>
              <Trash2 size={18} color="#D7B56D" />
            </Pressable>
          ) : null}
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={styles.studioBody}
        >
          <LiveCreationProgress current={step} />
          <ScrollView
            ref={formScrollRef}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            contentContainerStyle={styles.content}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {recovered ? <View style={styles.recovered}><Text style={styles.recoveredText}>Draft recovered from this device</Text></View> : null}
            {step === 'moment' ? <LiveCreationMomentStep draft={draft} onFormatChange={(format) => updateDraft({ format })} /> : null}
            {step === 'story' ? (
              <LiveCreationStoryStep
                draft={draft}
                posterUri={posterUri}
                teaserSelected={teaserSelected}
                onChange={updateDraft}
                onHostNoteFocus={revealHostNote}
                onPickPoster={() => void pickPoster()}
                onPickTeaser={() => void pickTeaser()}
                onRemovePoster={() => { setPoster(null); setPosterRemoved(true); }}
                onRemoveTeaser={() => { setTeaser(null); setTeaserRemoved(true); }}
              />
            ) : null}
            {step === 'room' ? (
              <LiveCreationRoomStep
                draft={draft}
                showPicker={showPicker}
                onShowPicker={() => setShowPicker(true)}
                onDateChange={(_event, date) => {
                  if (Platform.OS !== 'ios') setShowPicker(false);
                  if (date) updateDraft({ scheduledStart: date.toISOString() });
                }}
                onChange={updateDraft}
              />
            ) : null}
            {step === 'review' ? <LiveCreationReviewStep draft={draft} posterUri={posterUri} isEditing={isEditing} /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.footer}>
            {stepIndex > 0 ? (
              <Pressable disabled={submitting} onPress={() => setStep(LIVE_CREATION_STEPS[stepIndex - 1]!)} style={styles.backButton}>
                <ChevronLeft size={18} color="#E7D8B3" /><Text style={styles.backText}>Back</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={isLastStep ? (isEditing ? 'Save Live changes' : 'Schedule Live') : 'Continue'}
              disabled={Boolean(error) || submitting || isSessionRecoveryActive}
              onPress={isLastStep ? () => void publish() : goNext}
              style={[styles.primary, (error || submitting || isSessionRecoveryActive) && styles.disabled]}
            >
              {submitting || isSessionRecoveryActive ? <ActivityIndicator color="#102522" /> : (
                <><Text style={styles.primaryText}>{isLastStep ? (isEditing ? 'Save changes' : 'Schedule Live') : 'Continue'}</Text>{!isLastStep ? <ChevronRight size={18} color="#102522" /> : null}</>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        {stageMessage ? <View style={styles.stage}><Text style={styles.stageText}>{stageMessage}</Text></View> : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#081513' },
  safe: { flex: 1 },
  studioBody: { flex: 1 },
  loading: { flex: 1, backgroundColor: '#081513', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  loadingTitle: { color: '#FFF7EC', textAlign: 'center', fontSize: 16, fontFamily: 'Manrope_700Bold' },
  loadingLink: { color: '#D7B56D', fontFamily: 'Manrope_800ExtraBold' },
  header: { paddingHorizontal: 18, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#162724', borderWidth: 1, borderColor: '#304A45' },
  discardIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#162724' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#D7B56D', fontSize: 8, letterSpacing: 1.7, fontFamily: 'Manrope_800ExtraBold' },
  heading: { color: '#FFF7EC', fontSize: 24, fontFamily: 'PlayfairDisplay_700Bold' },
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 30 },
  recovered: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#18332D', paddingHorizontal: 11, paddingVertical: 7, marginBottom: 16 },
  recoveredText: { color: '#BFD9D0', fontSize: 9, fontFamily: 'Manrope_700Bold' },
  error: { color: '#FFB8AC', fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_700Bold', marginTop: 12 },
  footer: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#1F3732', backgroundColor: '#081513' },
  backButton: { minWidth: 90, height: 54, borderRadius: 27, paddingHorizontal: 18, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#40564F' },
  backText: { color: '#E7D8B3', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  primary: { flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  primaryText: { color: '#102522', fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.45 },
  stage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,15,13,0.86)', alignItems: 'center', justifyContent: 'center' },
  stageText: { color: '#FFF7EC', fontSize: 15, fontFamily: 'Manrope_800ExtraBold' },
});
