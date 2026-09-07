import { useLocalSearchParams, router } from 'expo-router';
import { Camera, CameraOff, ChevronLeft, Mic, MicOff, ShieldCheck, Wifi } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LiveBackstagePreview } from '@/features/live/components/index.ts';
import { useLiveDeviceReadiness, useLiveSessionController } from '@/features/live/hooks/index.ts';
import {
  getLiveReturnParams,
  type LiveReturnRouteParams,
} from '@/features/live/navigation/live-navigation.ts';

export default function LiveBackstageScreen() {
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
  const canOpenStage = controller.snapshot?.capabilities.includes('live.start_session') === true;
  const scheduledStartMs = controller.snapshot?.session.scheduledStart
    ? Date.parse(controller.snapshot.session.scheduledStart)
    : 0;
  const stageIsDue = !scheduledStartMs || scheduledStartMs <= clock;
  const startsIn = useMemo(() => {
    const remainingMinutes = Math.max(1, Math.ceil((scheduledStartMs - clock) / 60_000));
    if (remainingMinutes < 60) return `Available in ${remainingMinutes} min`;
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return `Available in ${hours}h${minutes ? ` ${minutes}m` : ''}`;
  }, [clock, scheduledStartMs]);

  useEffect(() => {
    if (!canOpenStage || stageIsDue) return;
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [canOpenStage, stageIsDue]);

  const returnToRoom = () => {
    router.replace({
      pathname: canOpenStage ? '/live/event/[sessionId]' : '/live/[sessionId]',
      params: { sessionId, ...liveReturnParams },
    });
  };

  const enterRoom = async () => {
    if (canOpenStage) {
      if (!stageIsDue) return;
      // Release Vision Camera before Stream requests the native capture
      // session. iOS otherwise intermittently rejects the immediate handoff.
      setCameraHandoff(true);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const transitioned = await controller.prepareAndStartSession();
      if (!transitioned) {
        setCameraHandoff(false);
        return;
      }
      router.replace({
        pathname: '/live/[sessionId]',
        params: {
          sessionId,
          startAudio: microphoneReady ? '1' : '0',
          startVideo: cameraReady ? '1' : '0',
          ...liveReturnParams,
        },
      });
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
              <ShieldCheck size={34} color="#D7B56D" />
              <Text style={styles.permissionTitle}>Camera and microphone access is needed.</Text>
              <Text style={styles.previewText}>Backstage stays private. These permissions let you check your setup before the host brings you on stage.</Text>
              <View style={styles.permissionActions}>
                <Pressable onPress={() => void devices.request()} style={styles.permissionButton}><Text style={styles.permissionButtonText}>Try again</Text></Pressable>
                <Pressable onPress={() => void Linking.openSettings()}><Text style={styles.settingsText}>Open settings</Text></Pressable>
              </View>
            </>
          ) : (
            <>
              <ActivityIndicator color="#D7B56D" />
              <Text style={styles.previewText}>Preparing your private preview…</Text>
            </>
          )}
        </View>
      )}
      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to Live room" onPress={returnToRoom} style={styles.icon}><ChevronLeft size={24} color="#FFF7EC" /></Pressable>
          <View style={styles.privatePill}><ShieldCheck size={14} color="#D7B56D" /><Text style={styles.privateText}>PRIVATE BACKSTAGE</Text></View>
          <View style={styles.icon}><Wifi size={18} color={controller.state === 'offline' || controller.state === 'error' ? '#E7A46B' : '#BFE0D7'} /></View>
        </View>
        <View style={styles.bottom}>
          <View style={styles.copy}>
            <Text style={styles.title}>Look and sound like yourself.</Text>
            <Text style={styles.body}>Only you can see this check. The host will bring you onto the public stage when the room is ready.</Text>
          </View>
          <View style={styles.controls}>
            <Pressable onPress={() => void toggleMicrophone()} style={[styles.control, !microphoneReady && styles.controlOff]}>
              {microphoneReady ? <Mic size={21} color="#102522" /> : <MicOff size={21} color="#FFF4E5" />}
            </Pressable>
            <Pressable onPress={() => void toggleCamera()} style={[styles.control, !cameraReady && styles.controlOff]}>
              {cameraReady ? <Camera size={21} color="#102522" /> : <CameraOff size={21} color="#FFF4E5" />}
            </Pressable>
          </View>
          <Pressable
            disabled={devices.state !== 'ready' || guestReady || (canOpenStage && !stageIsDue)}
            onPress={() => void enterRoom()}
            style={[styles.ready, (devices.state !== 'ready' || guestReady || (canOpenStage && !stageIsDue)) && styles.readyDisabled]}
          >
            <Text style={styles.readyText}>{canOpenStage ? (stageIsDue ? 'Open the public stage' : startsIn) : guestReady ? 'Ready · waiting for the host' : 'I’m ready for the room'}</Text>
          </Pressable>
          {controller.error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{controller.error.includes('live_session_not_due') ? 'This event is not due yet. The public stage will unlock at its scheduled time.' : 'That could not be completed yet. Check your connection and try again.'}</Text> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#071210' },
  previewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  previewText: { color: '#C7D4D1', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  permissionTitle: { color: '#FFF7EC', fontSize: 20, fontFamily: 'Archivo_700Bold', textAlign: 'center', paddingHorizontal: 28 },
  permissionActions: { marginTop: 10, alignItems: 'center', gap: 15 },
  permissionButton: { minHeight: 44, paddingHorizontal: 22, borderRadius: 22, justifyContent: 'center', backgroundColor: '#D7B56D' },
  permissionButtonText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  settingsText: { color: '#D7B56D', fontSize: 12, fontFamily: 'Manrope_700Bold' },
  header: { paddingHorizontal: 17, minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07121099', borderWidth: 1, borderColor: '#FFFFFF22' },
  privatePill: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#122925E8', borderWidth: 1, borderColor: '#806C44' },
  privateText: { color: '#F0D89F', fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  bottom: { marginTop: 'auto', paddingHorizontal: 20, paddingBottom: 10, backgroundColor: '#071210E8' },
  copy: { alignItems: 'center', paddingTop: 22 },
  title: { color: '#FFF7EC', fontSize: 27, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  body: { color: '#A6B5B1', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium', textAlign: 'center', maxWidth: 350, marginTop: 8 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginVertical: 20 },
  control: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  controlOff: { backgroundColor: '#5A2B2B' },
  ready: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  readyDisabled: { opacity: 0.45 },
  readyText: { color: '#102522', fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  errorText: { marginTop: 10, color: '#F0AAA5', fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
});
