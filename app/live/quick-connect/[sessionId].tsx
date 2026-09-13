import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Sparkles, Users } from 'lucide-react-native';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BetweenerLoader from '@/components/ui/BetweenerLoader.tsx';
import type {
  LiveParticipant,
  LiveQuickConnectPairing,
  LiveQuickConnectSafetyExperience,
  LiveQuickConnectSafetyReason,
  LiveQuickConnectSnapshot,
} from '@/features/live/application/index.ts';
import {
  LiveChemistryOverlay,
  LiveGlassSurface,
  LiveMediaStageBoundary,
  LiveQuickConnectControlDock,
  LiveQuickConnectSafetyCheck,
} from '@/features/live/components/index.ts';
import type { StreamLiveStageProps } from '@/features/live/components/StreamLiveStage.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from '@/features/live/components/live-visual-tokens.ts';
import {
  canRenderLiveChemistryStage,
  formatQuickConnectTime,
  quickConnectOutcomeCopy,
  quickConnectIsWaitingForHost,
  quickConnectQueueCopy,
  quickConnectQueueNeedsRejoin,
  quickConnectRemainingSeconds,
} from '@/features/live/domain/index.ts';
import { useLiveChemistry, useLiveMediaSession, useLiveQuickConnect } from '@/features/live/hooks/index.ts';
import { quickConnectAvailabilityCopy } from '@/features/live/domain/live-quick-connect.ts';
import { loadStreamVideoSdk } from '@/features/live/media/load-stream-video-sdk.ts';
import { requestLiveQuickConnectAdmission } from '@/features/live/media/request-live-quick-connect-admission.ts';
import {
  getLiveReturnParams,
  type LiveReturnRouteParams,
} from '@/features/live/navigation/live-navigation.ts';
import { useScopedScreenAwake } from '@/hooks/use-scoped-screen-awake';
import { useAuth } from '@/lib/auth-context';

type PairedQuickConnectSnapshot = LiveQuickConnectSnapshot & {
  pairing: LiveQuickConnectPairing;
};

const QuickConnectStage = lazy(async () => {
  const [module, sdk] = await Promise.all([
    import('@/features/live/components/StreamLiveStage.tsx'),
    loadStreamVideoSdk(),
  ]);
  const BoundStage = (props: Omit<StreamLiveStageProps, 'sdk'>) => (
    <module.StreamLiveStage {...props} sdk={sdk} />
  );
  BoundStage.displayName = 'QuickConnectStage';
  return { default: BoundStage };
});

const participant = (
  pairing: LiveQuickConnectPairing,
  currentUser: { id: string; profileId: string | null; fullName: string | null; avatarUrl: string | null },
  remote: boolean,
): LiveParticipant => {
  const person = remote
    ? {
        id: pairing.otherPerson.userId,
        profileId: pairing.otherPerson.profileId,
        fullName: pairing.otherPerson.fullName,
        avatarUrl: pairing.otherPerson.avatarUrl,
      }
    : currentUser;
  return {
    id: `quick-connect:${pairing.id}:${person.id}`,
    sessionId: pairing.id,
    userId: person.id,
    profileId: person.profileId ?? '',
    role: 'participant', state: 'private_spark', rsvpStatus: 'going',
    openToIntroductions: false, stageSlot: remote ? 1 : 0,
    connectionQualityState: 'unknown', microphoneMutedByModerator: false,
    fullName: person.fullName, avatarUrl: person.avatarUrl,
  };
};

function QuickConnectConversation({
  snapshot,
  onDecide,
  onLeave,
  onSafetyCheck,
  onSafetyComplete,
  onMediaPairingStart,
  onMediaConnectionChange,
  onRefresh,
  onPictureInPictureModeChange,
  busy,
  error,
}: {
  snapshot: PairedQuickConnectSnapshot;
  onDecide: (decision: 'continue' | 'friendship' | 'not_this_time') => void;
  onLeave: () => void;
  onSafetyCheck: (
    experience: LiveQuickConnectSafetyExperience,
    reason: LiveQuickConnectSafetyReason | null,
    block: boolean,
  ) => Promise<boolean>;
  onSafetyComplete: () => void;
  onMediaPairingStart: (pairingId: string) => void;
  onMediaConnectionChange: (connected: boolean) => void;
  onRefresh: () => void;
  onPictureInPictureModeChange: (active: boolean) => void;
  busy: boolean;
  error: string | null;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const pairing = snapshot.pairing;
  const { user, profile } = useAuth();
  const media = useLiveMediaSession(pairing.id, requestLiveQuickConnectAdmission);
  const chemistryRequired = pairing.chemistryFirstEnabled;
  const chemistry = useLiveChemistry({
    kind: 'quick_connect',
    id: pairing.id,
    enabled: chemistryRequired,
  });
  const chemistryRevealed = canRenderLiveChemistryStage(
    chemistryRequired,
    chemistry.snapshot,
  );
  const videoIntentRef = useRef(true);
  const [remaining, setRemaining] = useState(0);
  const [pictureInPictureActive, setPictureInPictureActive] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reportFirst, setReportFirst] = useState(false);
  const participants = useMemo(() => user ? [
    participant(pairing, {
      id: user.id,
      profileId: profile?.id ?? null,
      fullName: profile?.full_name ?? 'You',
      avatarUrl: profile?.avatar_url ?? null,
    }, false),
    participant(pairing, {
      id: user.id, profileId: profile?.id ?? null,
      fullName: profile?.full_name ?? 'You', avatarUrl: profile?.avatar_url ?? null,
    }, true),
  ] : [], [pairing, profile?.avatar_url, profile?.full_name, profile?.id, user]);
  useScopedScreenAwake({
    enabled: media.state === 'joined' || media.state === 'reconnecting',
    reason: 'live_event',
    instanceId: `quick-connect:${pairing.id}`,
  });

  useEffect(() => {
    onMediaPairingStart(pairing.id);
  }, [onMediaPairingStart, pairing.id]);

  useEffect(() => {
    if (media.state !== 'idle' || !['active', 'reconnect_grace'].includes(pairing.state)) return;
    void media.join({
      mode: 'quick_connect',
      audioEnabled: true,
      videoEnabled: chemistryRevealed && videoIntentRef.current,
    });
  }, [chemistryRevealed, media.join, media.state, pairing.state]);

  useEffect(() => {
    if (media.state !== 'joined' || !chemistryRevealed || media.videoEnabled) return;
    void media.setVideoEnabled(videoIntentRef.current);
  }, [chemistryRevealed, media.setVideoEnabled, media.state, media.videoEnabled]);

  useEffect(() => {
    if (['active', 'reconnect_grace'].includes(pairing.state)) return;
    void media.leave();
  }, [media.leave, pairing.state]);

  useEffect(() => {
    if (media.state === 'joined') {
      onMediaConnectionChange(true);
      return;
    }
    if (media.state === 'failed' || media.state === 'reconnecting') {
      onMediaConnectionChange(false);
    }
  }, [media.state, onMediaConnectionChange]);

  useEffect(() => {
    const observedAt = Date.now();
    const update = () => setRemaining(
      quickConnectRemainingSeconds(snapshot, Date.now() - observedAt),
    );
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [snapshot]);

  useEffect(() => {
    if (remaining !== 0 || pairing.state !== 'active') return;
    const timer = setTimeout(onRefresh, 800);
    return () => clearTimeout(timer);
  }, [onRefresh, pairing.state, remaining]);

  const completed = ['completed', 'round_incomplete', 'cancelled'].includes(pairing.state);
  const safetyRequired = completed && !pairing.safetyReviewed;

  useEffect(() => {
    if (!safetyRequired) return;
    setReportFirst(false);
    setSafetyOpen(true);
  }, [safetyRequired]);

  const submitSafetyCheck = useCallback(async (
    experience: LiveQuickConnectSafetyExperience,
    reason: LiveQuickConnectSafetyReason | null,
    block: boolean,
  ) => {
    const saved = await onSafetyCheck(experience, reason, block);
    if (!saved) return;
    setSafetyOpen(false);
    onSafetyComplete();
  }, [onSafetyCheck, onSafetyComplete]);
  const handlePictureInPictureModeChange = useCallback((active: boolean) => {
    setPictureInPictureActive(active);
    onPictureInPictureModeChange(active);
  }, [onPictureInPictureModeChange]);

  const stageContent = media.bindings ? (
    <LiveMediaStageBoundary resetKey={pairing.id}>
      <Suspense fallback={(
        <BetweenerLoader
          fullScreen={false}
          label="Bringing your conversation into focus"
          sublabel="Keeping this space private…"
        />
      )}>
        <QuickConnectStage
          bindings={media.bindings}
          stageParticipants={participants}
          localPublisherUserId={user?.id ?? null}
          constrainMultiStage={false}
          presentation="private_spark"
          visualsConcealed={!chemistryRevealed}
          onPictureInPictureModeChange={handlePictureInPictureModeChange}
        />
      </Suspense>
    </LiveMediaStageBoundary>
  ) : (
    <View style={styles.stageLoading}>
      {media.state === 'failed' ? (
        <>
          <Text style={styles.panelTitle}>Your conversation needs a moment.</Text>
          <Text style={styles.muted}>Your place is being held while you reconnect.</Text>
          <Pressable style={styles.outlineButton} onPress={() => void media.join({
            mode: 'quick_connect',
            audioEnabled: true,
            videoEnabled: chemistryRevealed && videoIntentRef.current,
          })}>
            <Text style={styles.outlineButtonText}>Reconnect</Text>
          </Pressable>
        </>
      ) : (
        <BetweenerLoader
          fullScreen={false}
          label="Opening your conversation"
          sublabel={pairing.state === 'reconnect_grace'
            ? 'Holding your place quietly…'
            : 'Preparing a private space for two…'}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.conversation, pictureInPictureActive && styles.pictureInPictureConversation]}>
      <View style={[styles.timerPill, pictureInPictureActive && styles.pictureInPictureHidden]}>
        <Text style={styles.timerText}>{formatQuickConnectTime(remaining)}</Text>
      </View>
      <View style={[styles.stage, pictureInPictureActive && styles.pictureInPictureStage]}>
        {stageContent}
        {!pictureInPictureActive ? (
          <LiveChemistryOverlay
            required={chemistryRequired}
            snapshot={chemistry.snapshot}
            loading={chemistry.loading}
            busy={chemistry.busy}
            error={chemistry.error}
            onOfferReveal={() => void chemistry.offerReveal()}
            onReady={() => void chemistry.markReady()}
            onRetry={() => void chemistry.refresh()}
          />
        ) : null}
      </View>
      {!pictureInPictureActive && pairing.odoConversationSpark && !completed ? (
        <LiveGlassSurface style={styles.odoSparkCard}>
          <View style={styles.odoSparkHeading}>
            <Sparkles color={visual.purple} size={14} />
            <Text style={styles.odoSparkLabel}>A SPARK FROM ODO</Text>
          </View>
          <Text style={styles.odoSparkContext}>{pairing.odoConversationSpark.context}</Text>
          <Text style={styles.odoSparkQuestion}>{pairing.odoConversationSpark.question}</Text>
        </LiveGlassSurface>
      ) : null}
      {!pictureInPictureActive ? (
        <LiveQuickConnectControlDock
          audioEnabled={media.audioEnabled}
          busy={media.state === 'preparing' || media.state === 'reconnecting'}
          onLeave={onLeave}
          onReport={() => {
            setReportFirst(true);
            setSafetyOpen(true);
          }}
          onToggleAudio={() => void media.setAudioEnabled(!media.audioEnabled)}
          onToggleVideo={() => {
            if (!chemistryRevealed) return;
            videoIntentRef.current = !media.videoEnabled;
            void media.setVideoEnabled(!media.videoEnabled);
          }}
          videoEnabled={chemistryRevealed && media.videoEnabled}
        />
      ) : null}
      {!pictureInPictureActive ? (
        <LiveGlassSurface style={styles.decisionPanel}>
          {completed ? (
            <>
              <Text style={styles.panelTitle}>Round complete</Text>
              <Text style={styles.panelCopy}>{quickConnectOutcomeCopy(pairing.sharedOutcome)}</Text>
              <Pressable style={styles.primaryButton} onPress={onRefresh}><Text style={styles.primaryButtonText}>Meet someone new</Text></Pressable>
            </>
          ) : pairing.myDecision ? (
            <>
              <Text style={styles.panelTitle}>Your choice is private.</Text>
              <Text style={styles.panelCopy}>We will only share an outcome when both choices are in.</Text>
            </>
          ) : (
            <>
              <Text style={styles.panelTitle}>How should this conversation continue?</Text>
              <Text style={styles.panelCopy}>Your choice stays private.</Text>
              <View style={styles.decisionRow}>
                <Pressable disabled={busy} style={styles.decisionButton} onPress={() => onDecide('continue')}><Text style={styles.decisionText}>Continue</Text></Pressable>
                <Pressable disabled={busy} style={styles.decisionButton} onPress={() => onDecide('friendship')}><Text style={styles.decisionText}>Friendship</Text></Pressable>
                <Pressable disabled={busy} style={styles.decisionButton} onPress={() => onDecide('not_this_time')}><Text style={styles.decisionText}>Not this time</Text></Pressable>
              </View>
            </>
          )}
          {error ? <Text style={styles.error}>That choice could not be saved yet. Try again.</Text> : null}
        </LiveGlassSurface>
      ) : null}
      <LiveQuickConnectSafetyCheck
        busy={busy}
        error={error}
        mandatory={safetyRequired}
        onCancel={() => setSafetyOpen(false)}
        onSubmit={(experience, reason, block) => void submitSafetyCheck(experience, reason, block)}
        otherName={pairing.otherPerson.fullName?.trim().split(/\s+/)[0] || 'this person'}
        reportFirst={reportFirst}
        visible={safetyOpen}
      />
    </View>
  );
}

export default function LiveQuickConnectScreen() {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const params = useLocalSearchParams<{ sessionId?: string } & LiveReturnRouteParams>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const liveReturnParams = useMemo(
    () => getLiveReturnParams(params),
    [params.returnCircleId, params.returnCircleTab],
  );
  const controller = useLiveQuickConnect(sessionId);
  const [pictureInPictureActive, setPictureInPictureActive] = useState(false);
  const queueCopy = quickConnectQueueCopy(controller.snapshot, controller.error);
  const waitingForHost = quickConnectIsWaitingForHost(controller.error);
  const queueNeedsRejoin = quickConnectQueueNeedsRejoin(controller.snapshot);
  const returnToLive = useCallback(() => {
    router.replace({
      pathname: '/live/[sessionId]',
      params: { sessionId, ...liveReturnParams },
    });
  }, [liveReturnParams, sessionId]);
  const endRound = useCallback(async () => {
    await controller.leave().catch(() => undefined);
  }, [controller.leave]);
  const pendingSafety = Boolean(
    controller.snapshot?.pairing
    && ['completed', 'round_incomplete', 'cancelled'].includes(controller.snapshot.pairing.state)
    && !controller.snapshot.pairing.safetyReviewed,
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pendingSafety) return true;
      if (controller.snapshot?.pairing) {
        void endRound();
        return true;
      }
      returnToLive();
      return true;
    });
    return () => subscription.remove();
  }, [controller.snapshot?.pairing, endRound, pendingSafety, returnToLive]);

  const handleBack = useCallback(() => {
    if (pendingSafety) return;
    if (controller.snapshot?.pairing) {
      void endRound();
      return;
    }
    returnToLive();
  }, [controller.snapshot?.pairing, endRound, pendingSafety, returnToLive]);
  return (
    <LinearGradient colors={visual.isDark ? [visual.canvas, visual.surfaceSoft, visual.canvas] : [visual.canvas, visual.bgSubtle, visual.surface]} style={styles.root}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <SafeAreaView edges={pictureInPictureActive ? [] : undefined} style={styles.safe}>
        <LiveGlassSurface style={[styles.header, pictureInPictureActive && styles.pictureInPictureHidden]}>
          <Pressable accessibilityLabel="Back to Live room" accessibilityState={{ disabled: pendingSafety }} disabled={pendingSafety} onPress={handleBack} style={[styles.roundButton, pendingSafety && styles.disabled]}><ArrowLeft color={visual.text} size={22} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>QUICK CONNECT</Text><Text style={styles.headerTitle}>A thoughtful three minutes</Text></View>
          <View style={styles.liveDot} />
        </LiveGlassSurface>
        {controller.loading && !controller.snapshot ? (
          <View style={styles.center}>
            <BetweenerLoader
              fullScreen={false}
              label="Finding your Quick Connect"
              sublabel="Preparing the next thoughtful introduction…"
            />
          </View>
        ) : controller.snapshot?.pairing ? (
          <QuickConnectConversation
            snapshot={controller.snapshot}
            busy={controller.busy}
            error={controller.error}
            onRefresh={() => void controller.refresh()}
            onDecide={(decision) => void controller.decide(decision)}
            onLeave={() => void endRound()}
            onSafetyCheck={(experience, reason, block) => controller.submitSafetyCheck(
              controller.snapshot!.pairing!.id,
              experience,
              reason,
              block,
            )}
            onSafetyComplete={returnToLive}
            onMediaPairingStart={controller.beginMediaPairing}
            onMediaConnectionChange={controller.reportMediaConnected}
            onPictureInPictureModeChange={setPictureInPictureActive}
          />
        ) : (
          <View style={styles.center}>
            <View style={styles.waitIcon}><Users color={visual.teal} size={30} /></View>
            <Text style={styles.waitTitle}>{queueCopy.title}</Text>
            <Text style={styles.waitCopy}>{queueCopy.body}</Text>
            {controller.error && !waitingForHost ? (
              <Text style={styles.error}>{quickConnectAvailabilityCopy(controller.error)}</Text>
            ) : null}
            <Pressable
              style={styles.outlineButton}
              onPress={() => void (
                (controller.error && !waitingForHost) || queueNeedsRejoin
                  ? controller.retryJoin()
                  : controller.refresh()
              )}
            >
              <Sparkles color={visual.teal} size={17} />
              <Text style={styles.outlineButtonText}>
                {waitingForHost
                  ? 'Check rotation'
                  : controller.error
                    ? 'Try again'
                    : queueNeedsRejoin
                      ? 'Reconnect'
                      : 'Refresh'}
              </Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { flex: 1 }, safe: { flex: 1 },
  header: { minHeight: 64, marginHorizontal: 16, marginTop: 5, marginBottom: 8, paddingHorizontal: 8, borderRadius: 24, borderColor: visual.borderStrong, flexDirection: 'row', alignItems: 'center', gap: 11 },
  roundButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 0.75, borderColor: visual.border, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surfaceRaised },
  headerCopy: { flex: 1 }, eyebrow: { color: visual.teal, fontSize: 8, fontFamily: 'Manrope_800ExtraBold', letterSpacing: 1.7 },
  headerTitle: { color: visual.text, fontSize: 16, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: visual.teal, shadowColor: visual.teal, shadowOpacity: 0.45, shadowRadius: 6 },
  conversation: { flex: 1, paddingHorizontal: 16, paddingBottom: 14 },
  pictureInPictureConversation: { paddingHorizontal: 0, paddingBottom: 0, overflow: 'hidden', backgroundColor: '#06110F' },
  pictureInPictureHidden: { display: 'none' },
  pictureInPictureStage: { minHeight: 0, maxHeight: '100%', borderRadius: 0, borderWidth: 0 },
  timerPill: { alignSelf: 'center', borderWidth: 0.75, borderColor: visual.borderStrong, backgroundColor: visual.tealSoft, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, marginBottom: 10 },
  timerText: { color: visual.teal, fontSize: 15, fontFamily: 'Manrope_800ExtraBold', fontVariant: ['tabular-nums'] },
  stage: { flex: 1, minHeight: 330, maxHeight: 620, borderRadius: 28, overflow: 'hidden', borderWidth: 0.75, borderColor: visual.borderStrong, backgroundColor: visual.videoChrome },
  stageLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  odoSparkCard: { marginTop: 10, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 12, borderColor: visual.purple, borderWidth: 1 },
  odoSparkHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  odoSparkLabel: { color: visual.purple, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  odoSparkContext: { marginTop: 7, color: visual.textMuted, fontSize: 11, lineHeight: 16 },
  odoSparkQuestion: { marginTop: 3, color: visual.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  decisionPanel: { borderRadius: 26, padding: 16, marginTop: 12 },
  panelTitle: { color: visual.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  panelCopy: { color: visual.textMuted, fontSize: 13, textAlign: 'center', marginTop: 5 },
  decisionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  decisionButton: { flex: 1, minHeight: 48, borderRadius: 18, borderWidth: 1, borderColor: visual.purple, backgroundColor: visual.purpleSoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  decisionText: { color: visual.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  primaryButton: { borderRadius: 999, backgroundColor: visual.teal, paddingVertical: 14, marginTop: 14, alignItems: 'center' },
  primaryButtonText: { color: visual.accentContrast, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, gap: 14 },
  waitIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: visual.teal, backgroundColor: visual.tealSoft, alignItems: 'center', justifyContent: 'center' },
  waitTitle: { color: visual.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  waitCopy: { color: visual.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 390 },
  muted: { color: visual.textMuted, fontSize: 14, textAlign: 'center' },
  outlineButton: { minHeight: 46, borderRadius: 999, borderWidth: 1, borderColor: visual.teal, paddingHorizontal: 22, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  outlineButtonText: { color: visual.text, fontWeight: '700' },
  error: { color: visual.dangerText, fontSize: 12, textAlign: 'center', marginTop: 10 },
  disabled: { opacity: 0.42 },
});
