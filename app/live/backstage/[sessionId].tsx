import { useLocalSearchParams, router } from 'expo-router';
import { Camera, CameraOff, ChevronLeft, Mic, MicOff, ShieldCheck, Wifi } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LiveBackstagePreview, LiveStepUpSheet } from '@/features/live/components/index.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from '@/features/live/components/live-visual-tokens.ts';
import { useLiveDeviceReadiness, useLiveSessionController } from '@/features/live/hooks/index.ts';
import {
  getLiveServerClockOffsetMs,
  getLivePublicationErrorCode,
  getLivePublicationErrorMessage,
  liveRepository,
  type LivePublicationControl,
} from '@/features/live/application/index.ts';
import {
  getLiveReturnParams,
  type LiveReturnRouteParams,
} from '@/features/live/navigation/live-navigation.ts';

export default function LiveBackstageScreen() {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const params = useLocalSearchParams<{ sessionId?: string } & LiveReturnRouteParams>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const liveReturnParams = useMemo(
    () => getLiveReturnParams(params),
    [params.returnCircleId, params.returnCircleTab],
  );
  const controller = useLiveSessionController(sessionId);
  const devices = useLiveDeviceReadiness();
  const [cameraReady, setCameraReady] = useState(true);
  const [microphoneReady, setMicrophoneReady] = useState(true);
  const [guestReady, setGuestReady] = useState(false);
  const [cameraHandoff, setCameraHandoff] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [publication, setPublication] = useState<LivePublicationControl | null>(null);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [stepUpVisible, setStepUpVisible] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const canOpenStage = controller.snapshot?.capabilities.includes('live.start_session') === true;
  const serverOffsetMs = useMemo(
    () => publication ? getLiveServerClockOffsetMs(publication.serverNow) : 0,
    [publication?.serverNow],
  );
  const authoritativeNow = clock + serverOffsetMs;
  const scheduledStartMs = publication?.scheduledStart
    ? Date.parse(publication.scheduledStart)
    : controller.snapshot?.session.scheduledStart
      ? Date.parse(controller.snapshot.session.scheduledStart)
    : 0;
  const stageIsDue = !scheduledStartMs || scheduledStartMs <= authoritativeNow;
  const studioControlled = publication?.broadcastAuthority === 'studio_producer';
  const startsIn = useMemo(() => {
    const remainingMinutes = Math.max(1, Math.ceil((scheduledStartMs - authoritativeNow) / 60_000));
    if (remainingMinutes < 60) return `Available in ${remainingMinutes} min`;
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return `Available in ${hours}h${minutes ? ` ${minutes}m` : ''}`;
  }, [authoritativeNow, scheduledStartMs]);

  const loadPublication = useCallback(async () => {
    if (!sessionId || !canOpenStage) return null;
    const next = await liveRepository.getPublicationControl(sessionId);
    setPublication(next);
    return next;
  }, [canOpenStage, sessionId]);

  useEffect(() => {
    if (!canOpenStage || !controller.snapshot) return;
    let active = true;
    setPublicationBusy(true);
    void loadPublication().then(async (next) => {
      if (!active || !next || ['backstage', 'live', 'ending'].includes(next.status)) return;
      try {
        const opened = await liveRepository.openBackstage(sessionId, next.version);
        if (active) setPublication(opened);
      } catch (nextError) {
        if (getLivePublicationErrorCode(nextError) === 'live_session_version_conflict') {
          const refreshed = await liveRepository.getPublicationControl(sessionId);
          if (active) setPublication(refreshed);
          return;
        }
        if (active) setPublicationError(getLivePublicationErrorMessage(nextError));
      }
    }).catch((nextError) => {
      if (active) setPublicationError(getLivePublicationErrorMessage(nextError));
    }).finally(() => {
      if (active) setPublicationBusy(false);
    });
    return () => { active = false; };
  }, [canOpenStage, controller.snapshot?.session.id, loadPublication, sessionId]);

  useEffect(() => {
    if (!canOpenStage || stageIsDue) return;
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [canOpenStage, stageIsDue]);

  useEffect(() => {
    const status = controller.snapshot?.session.status;
    if (status !== 'ended' && status !== 'cancelled') return;
    router.replace({
      pathname: '/live/event/[sessionId]',
      params: { sessionId, ...liveReturnParams },
    });
  }, [controller.snapshot?.session.status, liveReturnParams, sessionId]);

  const returnToRoom = () => {
    router.replace({
      pathname: canOpenStage ? '/live/event/[sessionId]' : '/live/[sessionId]',
      params: { sessionId, ...liveReturnParams },
    });
  };

  const continueIntoLive = useCallback(() => {
    router.replace({
      pathname: '/live/[sessionId]',
      params: {
        sessionId,
        startAudio: microphoneReady ? '1' : '0',
        startVideo: cameraReady ? '1' : '0',
        ...liveReturnParams,
      },
    });
  }, [cameraReady, liveReturnParams, microphoneReady, sessionId]);

  const openPublicStage = useCallback(async () => {
    if (!publication || publicationBusy) return false;
    setPublicationBusy(true);
    setPublicationError(null);
    try {
      const started = await liveRepository.startSession(sessionId, publication.version);
      setPublication(started);
      setStepUpVisible(false);
      return started.status === 'live' || started.status === 'ending';
    } catch (nextError) {
      const code = getLivePublicationErrorCode(nextError);
      if (code === 'live_step_up_required' || code === 'live_studio_step_up_required') {
        setStepUpVisible(true);
      } else if (code === 'live_session_version_conflict') {
        await loadPublication().catch(() => undefined);
      }
      setPublicationError(getLivePublicationErrorMessage(nextError));
      return false;
    } finally {
      setPublicationBusy(false);
    }
  }, [loadPublication, publication, publicationBusy, sessionId]);

  const startAfterVerification = useCallback(async () => {
    const latest = await liveRepository.getPublicationControl(sessionId);
    setPublication(latest);
    const started = await liveRepository.startSession(sessionId, latest.version);
    setPublication(started);
    setStepUpVisible(false);
    if (started.status === 'live' || started.status === 'ending') continueIntoLive();
  }, [continueIntoLive, sessionId]);

  const enterRoom = async () => {
    if (canOpenStage) {
      if (!stageIsDue || studioControlled || !publication) return;
      // Release Vision Camera before Stream requests the native capture
      // session. iOS otherwise intermittently rejects the immediate handoff.
      setCameraHandoff(true);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const transitioned = await openPublicStage();
      if (!transitioned) {
        setCameraHandoff(false);
        return;
      }
      continueIntoLive();
      return;
    }
    setGuestReady(true);
  };

  useEffect(() => {
    if (canOpenStage || controller.snapshot?.me?.state !== 'on_stage') return;
    router.replace({
      pathname: '/live/[sessionId]',
      params: {
        sessionId,
        startAudio: microphoneReady ? '1' : '0',
        startVideo: cameraReady ? '1' : '0',
        ...liveReturnParams,
      },
    });
  }, [cameraReady, canOpenStage, controller.snapshot?.me?.state, liveReturnParams, microphoneReady, sessionId]);

  const toggleCamera = async () => {
    const next = !cameraReady;
    setCameraReady(next);
  };
  const toggleMicrophone = async () => {
    const next = !microphoneReady;
    setMicrophoneReady(next);
  };

  return (
    <View style={styles.root}>
      {devices.state === 'ready' ? <LiveBackstagePreview active={cameraReady && !guestReady && !cameraHandoff} /> : (
        <View style={styles.previewPlaceholder}>
          {devices.state === 'denied' || devices.state === 'failed' ? (
            <>
              <ShieldCheck size={34} color={visual.teal} />
              <Text style={styles.permissionTitle}>Camera and microphone access is needed.</Text>
              <Text style={styles.previewText}>Backstage stays private. These permissions let you check your setup before entering the public stage.</Text>
              <View style={styles.permissionActions}>
                <Pressable onPress={() => void devices.request()} style={styles.permissionButton}><Text style={styles.permissionButtonText}>Try again</Text></Pressable>
                <Pressable onPress={() => void Linking.openSettings()}><Text style={styles.settingsText}>Open settings</Text></Pressable>
              </View>
            </>
          ) : (
            <>
              <ActivityIndicator color={visual.teal} />
              <Text style={styles.previewText}>Preparing your private preview…</Text>
            </>
          )}
        </View>
      )}
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to Live room" onPress={returnToRoom} style={styles.icon}><ChevronLeft size={24} color="#FFF7EC" /></Pressable>
          <View style={styles.privatePill}><ShieldCheck size={14} color={visual.purple} /><Text style={styles.privateText}>PRIVATE BACKSTAGE</Text></View>
          <View style={styles.icon}><Wifi size={18} color={controller.state === 'offline' || controller.state === 'error' ? '#E7A46B' : '#BFE0D7'} /></View>
        </View>
        <View style={styles.bottom}>
          <View style={styles.copy}>
            <Text style={styles.title}>{canOpenStage
              ? studioControlled ? 'You’re ready for Studio.' : stageIsDue ? 'Everything ready?' : 'Your private rehearsal room.'
              : 'Look and sound like yourself.'}</Text>
            <Text style={styles.body}>{canOpenStage
              ? studioControlled
                ? 'Your producer controls the public programme. Stay backstage and ready; Studio will open the room.'
                : stageIsDue
                ? 'Make one final check, then open the public stage when you are ready to welcome everyone.'
                : 'Check your frame, microphone, and connection now. The public stage will unlock at the scheduled time.'
              : 'Only you can see this check. The host will bring you onto the public stage when the room is ready.'}</Text>
          </View>
          <View style={styles.controls}>
            <Pressable onPress={() => void toggleMicrophone()} style={[styles.control, !microphoneReady && styles.controlOff]}>
              {microphoneReady ? <Mic size={21} color={visual.accentContrast} /> : <MicOff size={21} color="#FFFFFF" />}
            </Pressable>
            <Pressable onPress={() => void toggleCamera()} style={[styles.control, !cameraReady && styles.controlOff]}>
              {cameraReady ? <Camera size={21} color={visual.accentContrast} /> : <CameraOff size={21} color="#FFFFFF" />}
            </Pressable>
          </View>
          <Pressable
            disabled={devices.state !== 'ready' || guestReady || publicationBusy || (canOpenStage && (!stageIsDue || studioControlled || !publication))}
            onPress={() => void enterRoom()}
            style={[styles.ready, (devices.state !== 'ready' || guestReady || publicationBusy || (canOpenStage && (!stageIsDue || studioControlled || !publication))) && styles.readyDisabled]}
          >
            <Text style={styles.readyText}>{canOpenStage
              ? studioControlled
                ? 'Ready · waiting for Studio'
                : publicationBusy
                  ? 'Securing backstage…'
                  : stageIsDue ? 'Open the public stage' : startsIn
              : guestReady ? 'Ready · waiting for the host' : 'I’m ready for the room'}</Text>
          </Pressable>
          {publicationError || controller.error ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {publicationError ?? getLivePublicationErrorMessage(controller.error)}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
      <LiveStepUpSheet
        visible={stepUpVisible}
        actionLabel="Open public stage"
        onCancel={() => setStepUpVisible(false)}
        onVerified={startAfterVerification}
      />
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: visual.videoChrome },
  previewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  previewText: { color: '#DCE7E3', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  permissionTitle: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Archivo_700Bold', textAlign: 'center', paddingHorizontal: 28 },
  permissionActions: { marginTop: 10, alignItems: 'center', gap: 15 },
  permissionButton: { minHeight: 44, paddingHorizontal: 22, borderRadius: 22, justifyContent: 'center', backgroundColor: visual.teal },
  permissionButtonText: { color: visual.accentContrast, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  settingsText: { color: visual.teal, fontSize: 12, fontFamily: 'Manrope_700Bold' },
  header: { paddingHorizontal: 17, minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07121099', borderWidth: 1, borderColor: '#FFFFFF22' },
  privatePill: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#151025E8', borderWidth: 1, borderColor: visual.purple },
  privateText: { color: '#E2D7F5', fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  bottom: { marginTop: 'auto', paddingHorizontal: 20, paddingBottom: 10, backgroundColor: '#071210E8' },
  copy: { alignItems: 'center', paddingTop: 22 },
  title: { color: '#FFF7EC', fontSize: 27, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  body: { color: '#A6B5B1', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium', textAlign: 'center', maxWidth: 350, marginTop: 8 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginVertical: 20 },
  control: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal },
  controlOff: { backgroundColor: '#5A2B2B' },
  ready: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal },
  readyDisabled: { opacity: 0.45 },
  readyText: { color: visual.accentContrast, fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  errorText: { marginTop: 10, color: '#F0AAA5', fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
});
