import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  LiveParticipant,
  LivePrivateSparkExitDecision,
} from '@/features/live/application/index.ts';
import {
  blockPrivateSparkParticipant,
  reportPrivateSparkParticipant,
  type PrivateSparkSafetyContext,
} from '@/features/live/application/private-spark-safety-service.ts';
import {
  LiveMediaStageBoundary,
  LiveChemistryOverlay,
  LivePrivateSparkControlDock,
  LivePrivateSparkConversationSheet,
  LivePrivateSparkEndSheet,
  LivePrivateSparkEntryMoment,
  LivePrivateSparkExitExperience,
  LivePrivateSparkHeader,
  LivePrivateSparkMilestoneToast,
  LivePrivateSparkOptionsSheet,
  type PrivateSparkOptionsView,
} from '@/features/live/components/index.ts';
import { deterministicConversationSparkProvider } from '@/features/live/conversation/conversation-spark-provider.ts';
import type { StreamLiveStageProps } from '@/features/live/components/StreamLiveStage.tsx';
import {
  useLiveMediaSession,
  useLiveChemistry,
  useLivePrivateSpark,
  useLivePrivateSparkCountdown,
  usePrivateSparkChrome,
  usePrivateSparkMilestones,
} from '@/features/live/hooks/index.ts';
import { canRenderLiveChemistryStage } from '@/features/live/domain/index.ts';
import { loadStreamVideoSdk } from '@/features/live/media/load-stream-video-sdk.ts';
import { requestLivePrivateSparkAdmission } from '@/features/live/media/request-live-private-spark-admission.ts';
import {
  getLiveExitDestination,
  getLiveReturnParams,
  type LiveReturnRouteParams,
} from '@/features/live/navigation/live-navigation.ts';
import { useAuth } from '@/lib/auth-context';
import { useScopedScreenAwake } from '@/hooks/use-scoped-screen-awake';

const PrivateSparkStage = lazy(async () => {
  const [module, sdk] = await Promise.all([
    import('@/features/live/components/StreamLiveStage.tsx'),
    loadStreamVideoSdk(),
  ]);
  const BoundStage = (props: Omit<StreamLiveStageProps, 'sdk'>) => (
    <module.StreamLiveStage {...props} sdk={sdk} />
  );
  BoundStage.displayName = 'PrivateSparkStage';
  return { default: BoundStage };
});

const toParticipant = (
  sparkId: string,
  person: {
    userId: string;
    profileId: string;
    fullName: string | null;
    avatarUrl: string | null;
  },
  stageSlot: number,
): LiveParticipant => ({
  id: `private-spark:${sparkId}:${person.userId}`,
  sessionId: sparkId,
  userId: person.userId,
  profileId: person.profileId,
  role: 'participant',
  state: 'private_spark',
  rsvpStatus: 'going',
  openToIntroductions: false,
  stageSlot,
  connectionQualityState: 'unknown',
  microphoneMutedByModerator: false,
  fullName: person.fullName,
  avatarUrl: person.avatarUrl,
});

export default function LivePrivateSparkScreen() {
  const params = useLocalSearchParams<{ privateSparkId?: string } & LiveReturnRouteParams>();
  const privateSparkId = typeof params.privateSparkId === 'string' ? params.privateSparkId : '';
  const liveReturnParams = useMemo(
    () => getLiveReturnParams(params),
    [params.returnCircleId, params.returnCircleTab],
  );
  const { user } = useAuth();
  const controller = useLivePrivateSpark(privateSparkId);
  const media = useLiveMediaSession(privateSparkId, requestLivePrivateSparkAdmission);
  const spark = controller.spark;
  const chemistryRequired = spark?.chemistryFirstEnabled === true;
  const chemistry = useLiveChemistry({
    kind: 'private_spark',
    id: privateSparkId,
    enabled: Boolean(privateSparkId && spark && chemistryRequired),
  });
  const chemistryRevealed = canRenderLiveChemistryStage(
    chemistryRequired,
    chemistry.snapshot,
  );
  useScopedScreenAwake({
    enabled: media.state === 'joined' || media.state === 'reconnecting',
    reason: 'live_event',
    instanceId: `private-spark:${privateSparkId}`,
  });
  const timeoutHandledRef = useRef(false);
  const returnMediaIntentRef = useRef({ audioEnabled: true, videoEnabled: true });
  const [entryVisible, setEntryVisible] = useState(true);
  const [endSheetVisible, setEndSheetVisible] = useState(false);
  const [conversationVisible, setConversationVisible] = useState(false);
  const [conversationIndex, setConversationIndex] = useState(0);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [optionsView, setOptionsView] = useState<PrivateSparkOptionsView>('menu');
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const remainingSeconds = useLivePrivateSparkCountdown(spark?.activeExpiresAt ?? null);
  const milestone = usePrivateSparkMilestones(remainingSeconds);
  const participants = useMemo(() => spark ? [
    toParticipant(spark.id, spark.participantA, 0),
    toParticipant(spark.id, spark.participantB, 1),
  ] : [], [spark]);
  const otherPerson = spark?.participantA.userId === user?.id
    ? spark.participantB
    : spark?.participantA ?? null;
  const prompts = useMemo(() => deterministicConversationSparkProvider.getPrompts({
    serverSpark: spark?.conversationSpark ?? null,
  }), [spark?.conversationSpark]);
  const prompt = prompts[conversationIndex % prompts.length];
  const chrome = usePrivateSparkChrome({
    keepVisible: entryVisible
      || endSheetVisible
      || conversationVisible
      || optionsVisible
      || milestone !== null
      || media.state === 'reconnecting'
      || media.state === 'failed'
      || media.error !== null,
  });

  useEffect(() => {
    setEntryVisible(true);
    setConversationIndex(0);
  }, [privateSparkId]);

  useEffect(() => {
    if (spark?.state !== 'active' || media.state !== 'idle') return;
    void media.join({
      mode: 'private_spark',
      audioEnabled: true,
      videoEnabled: chemistryRevealed && returnMediaIntentRef.current.videoEnabled,
    });
  }, [chemistryRevealed, media.join, media.state, spark?.state]);

  useEffect(() => {
    if (media.state !== 'joined' || !chemistryRevealed || media.videoEnabled) return;
    void media.setVideoEnabled(returnMediaIntentRef.current.videoEnabled);
  }, [chemistryRevealed, media.setVideoEnabled, media.state, media.videoEnabled]);

  useEffect(() => {
    if (!spark || spark.state === 'active') return;
    void media.leave();
  }, [media.leave, spark]);

  useEffect(() => {
    if (media.state !== 'joined') return;
    returnMediaIntentRef.current = {
      audioEnabled: media.audioEnabled,
      videoEnabled: chemistryRevealed
        ? media.videoEnabled
        : returnMediaIntentRef.current.videoEnabled,
    };
  }, [chemistryRevealed, media.audioEnabled, media.state, media.videoEnabled]);

  const returnToLive = useCallback(() => {
    if (spark?.sessionId) {
      const { audioEnabled, videoEnabled } = returnMediaIntentRef.current;
      router.replace({
        pathname: '/live/[sessionId]',
        params: {
          sessionId: spark.sessionId,
          startAudio: audioEnabled ? '1' : '0',
          startVideo: videoEnabled ? '1' : '0',
          ...liveReturnParams,
        },
      });
    } else {
      router.dismissTo(getLiveExitDestination(liveReturnParams));
    }
  }, [liveReturnParams, spark?.sessionId]);

  const finishConversation = useCallback(async (reason = 'conversation_complete') => {
    await media.leave();
    await controller.end(reason);
  }, [controller, media]);

  const leave = useCallback(async () => {
    await finishConversation('participant_left');
    returnToLive();
  }, [finishConversation, returnToLive]);

  const requestLeave = useCallback(() => {
    chrome.reveal();
    setEndSheetVisible(true);
  }, [chrome]);

  useEffect(() => {
    if (spark?.state !== 'active' || remainingSeconds !== 0 || timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    void finishConversation('session_timeout');
  }, [finishConversation, remainingSeconds, spark?.state]);

  const safetyContext = useMemo<PrivateSparkSafetyContext | null>(() => (
    spark && otherPerson ? {
      privateSparkId: spark.id,
      liveSessionId: spark.sessionId,
      reportedUserId: otherPerson.userId,
      reportedProfileId: otherPerson.profileId,
    } : null
  ), [otherPerson, spark]);

  const reportParticipant = useCallback(async (reason: string) => {
    if (!safetyContext || safetyBusy) return;
    setSafetyBusy(true);
    setSafetyMessage(null);
    try {
      await reportPrivateSparkParticipant(safetyContext, reason);
      setOptionsVisible(false);
      setOptionsView('menu');
      setSafetyMessage('Report received. Thank you for looking after the community.');
    } catch {
      setSafetyMessage('That report could not be sent yet. Please try again.');
    } finally {
      setSafetyBusy(false);
    }
  }, [safetyBusy, safetyContext]);

  const blockParticipant = useCallback(async () => {
    if (!user?.id || !otherPerson || safetyBusy) return;
    setSafetyBusy(true);
    setSafetyMessage(null);
    try {
      await blockPrivateSparkParticipant(user.id, otherPerson.userId);
      await leave();
    } catch {
      setSafetyMessage('That person could not be blocked yet. Please try again.');
      setSafetyBusy(false);
    }
  }, [leave, otherPerson, safetyBusy, user?.id]);

  const completeEntryMoment = useCallback(() => {
    setEntryVisible(false);
  }, []);
  const handlePictureInPictureModeChange = useCallback((active: boolean) => {
    setIsPictureInPicture(active);
    if (!active) return;
    setEntryVisible(false);
    setEndSheetVisible(false);
    setConversationVisible(false);
    setOptionsVisible(false);
  }, []);

  const headerTranslateY = chrome.progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });
  const dockTranslateY = chrome.progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  const submitExitDecision = useCallback((decision: LivePrivateSparkExitDecision) => {
    void controller.submitExit(decision);
  }, [controller]);

  const openMutualChat = useCallback(() => {
    if (!otherPerson) return;
    router.replace({
      pathname: '/chat/[id]',
      params: {
        id: otherPerson.profileId,
        peerUserId: otherPerson.userId,
        userName: otherPerson.fullName?.trim() || 'Your connection',
        userAvatar: otherPerson.avatarUrl?.trim() || '',
      },
    });
  }, [otherPerson]);

  if (controller.loading && !spark) {
    return <View style={styles.center}><ActivityIndicator color="#D7B56D" /></View>;
  }
  if (!spark || !spark.isParticipant) {
    return (
      <View style={styles.center}>
        <LockKeyhole color="#D7B56D" size={28} />
        <Text style={styles.stateTitle}>This private room is unavailable.</Text>
        <Pressable onPress={returnToLive} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Return to Live</Text>
        </Pressable>
      </View>
    );
  }
  if (spark.state !== 'active') {
    if (spark.activeExpiresAt) {
      return (
        <LivePrivateSparkExitExperience
          busy={controller.busy}
          error={controller.error}
          myDecision={spark.myExitDecision}
          onDecision={submitExitDecision}
          onOpenChat={openMutualChat}
          onReturn={returnToLive}
          otherName={otherPerson?.fullName?.trim() || 'your connection'}
          outcome={spark.exitOutcome}
        />
      );
    }
    return (
      <View style={styles.center}>
        <LockKeyhole color="#D7B56D" size={28} />
        <Text style={styles.stateTitle}>Private Spark has ended.</Text>
        <Text style={styles.stateCopy}>Your conversation stayed between the two of you.</Text>
        <Pressable onPress={returnToLive} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Return to Live</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        {media.bindings && chemistryRevealed ? (
          <LiveMediaStageBoundary resetKey={`${privateSparkId}:${media.state}`}>
            <Suspense fallback={<ActivityIndicator color="#D7B56D" />}>
              <PrivateSparkStage
                bindings={media.bindings}
                stageParticipants={participants}
                localPublisherUserId={user?.id ?? null}
                constrainMultiStage
                presentation="private_spark"
                onPictureInPictureModeChange={handlePictureInPictureModeChange}
              />
            </Suspense>
          </LiveMediaStageBoundary>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color="#D7B56D" />
            <Text style={styles.stateCopy}>Opening your private room…</Text>
            {media.state === 'failed' ? (
              <Pressable
                onPress={() => void media.join({
                  mode: 'private_spark',
                  audioEnabled: true,
                  videoEnabled: chemistryRevealed && returnMediaIntentRef.current.videoEnabled,
                })}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        )}
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
      </View>

      {!isPictureInPicture ? <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={chrome.reveal}
        style={styles.videoTapTarget}
      /> : null}

      {!isPictureInPicture ? <LinearGradient
        pointerEvents="none"
        colors={['#06110FCC', '#06110F00', '#06110F00', '#06110FEA']}
        locations={[0, 0.18, 0.68, 1]}
        style={styles.atmosphere}
      /> : null}

      {!isPictureInPicture ? <SafeAreaView edges={['top', 'bottom']} pointerEvents="box-none" style={styles.overlay}>
        <Animated.View
          pointerEvents={chrome.visible ? 'auto' : 'none'}
          style={{ opacity: chrome.progress, transform: [{ translateY: headerTranslateY }] }}
        >
          <LivePrivateSparkHeader
          avatarUrl={otherPerson?.avatarUrl?.trim() || null}
          name={otherPerson?.fullName?.trim() || 'your connection'}
          onLeave={requestLeave}
          onOptions={() => {
            chrome.reveal();
            setOptionsView('menu');
            setOptionsVisible(true);
          }}
          remainingSeconds={remainingSeconds}
          />
        </Animated.View>
        <View style={styles.statusLane}>
          <LivePrivateSparkMilestoneToast milestone={milestone} />
          {media.state === 'reconnecting' ? (
            <View style={styles.connectionPill}>
              <Text style={styles.connectionText}>Reconnecting your private room…</Text>
            </View>
          ) : null}
          {safetyMessage ? (
            <Pressable onPress={() => setSafetyMessage(null)} style={styles.connectionPill}>
              <Text style={styles.connectionText}>{safetyMessage}</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.overlaySpacer} />
        <Animated.View
          pointerEvents={chrome.visible ? 'auto' : 'none'}
          style={{ opacity: chrome.progress, transform: [{ translateY: dockTranslateY }] }}
        >
          <LivePrivateSparkControlDock
            audioEnabled={media.audioEnabled}
            onConversationSpark={() => {
              chrome.reveal();
              setConversationVisible(true);
            }}
            onEnd={() => {
              chrome.reveal();
              setEndSheetVisible(true);
            }}
            onToggleAudio={() => {
              chrome.reveal();
              void media.setAudioEnabled(!media.audioEnabled);
            }}
            onToggleVideo={() => {
              chrome.reveal();
              if (!chemistryRevealed) return;
              returnMediaIntentRef.current.videoEnabled = !media.videoEnabled;
              void media.setVideoEnabled(!media.videoEnabled);
            }}
            videoEnabled={chemistryRevealed && media.videoEnabled}
          />
        </Animated.View>
      </SafeAreaView> : null}

      {!isPictureInPicture && media.state === 'joined' && entryVisible ? (
        <LivePrivateSparkEntryMoment
          onComplete={completeEntryMoment}
          reduceMotion={chrome.reduceMotion}
        />
      ) : null}

      {!isPictureInPicture ? <><LivePrivateSparkEndSheet
        onCancel={() => setEndSheetVisible(false)}
        onConfirm={() => {
          setEndSheetVisible(false);
          void finishConversation();
        }}
        visible={endSheetVisible}
      />
      <LivePrivateSparkConversationSheet
        onAnother={() => setConversationIndex((current) => (current + 1) % prompts.length)}
        onClose={() => setConversationVisible(false)}
        prompt={prompt}
        visible={conversationVisible}
      />
      <LivePrivateSparkOptionsSheet
        busy={safetyBusy}
        onBlock={() => void blockParticipant()}
        onClose={() => {
          setOptionsVisible(false);
          setOptionsView('menu');
        }}
        onLeave={() => void leave()}
        onReport={(reason) => void reportParticipant(reason)}
        onViewChange={setOptionsView}
        view={optionsView}
        visible={optionsVisible}
      /></> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06110F' },
  stage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  atmosphere: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  videoTapTarget: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  statusLane: { alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 24 },
  connectionPill: { minHeight: 34, paddingHorizontal: 13, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#161D1BDD', borderWidth: 1, borderColor: '#E1B86C3D' },
  connectionText: { color: '#F3E7D5', fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  overlaySpacer: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28, backgroundColor: '#06110F' },
  stateTitle: { color: '#FFF7EC', fontSize: 21, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold' },
  stateCopy: { color: '#A6BAB4', fontSize: 12, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  secondaryButton: { marginTop: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D7B56D88' },
  secondaryText: { color: '#E7C77F', fontSize: 12, fontFamily: 'Manrope_700Bold' },
});
