import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  CameraOff,
  ChevronDown,
  ChevronLeft,
  Mic,
  MicOff,
  MoreHorizontal,
  Radio,
  SlidersHorizontal,
} from 'lucide-react-native';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  LiveConnectionBanner,
  LiveAudiencePreferences,
  LiveCompactHeader,
  LiveControlDock,
  LiveConversationPanel,
  LiveHostedMatchingPanel,
  LiveGlassSurface,
  LiveMediaStageBoundary,
  LiveMemberSummaryModal,
  LivePublicIntroductionCard,
  LiveQuickConnectPool,
  LiveQuickConnectStage,
  LiveRoomEventNotice,
  LiveStudioModal,
} from '@/features/live/components/index.ts';
import type { LiveRoomEventNoticeKind } from '@/features/live/components/index.ts';
import type { LiveMemberPreview } from '@/features/live/application/index.ts';
import { likeLiveMember } from '@/features/live/application/index.ts';
import type { StreamLiveStageProps } from '@/features/live/components/StreamLiveStage.tsx';
import {
  useLiveHostedMatching,
  useLiveMediaSession,
  useLiveQuickConnectHostControl,
  useLiveQuickConnectPool,
  useLiveSessionController,
} from '@/features/live/hooks/index.ts';
import { loadStreamVideoSdk } from '@/features/live/media/load-stream-video-sdk.ts';
import { useAuth } from '@/lib/auth-context';
import { useScopedScreenAwake } from '@/hooks/use-scoped-screen-awake';
import {
  getLiveExitDestination,
  getLiveReturnParams,
  isReturningToCircle,
  type LiveReturnRouteParams,
} from '@/features/live/navigation/live-navigation.ts';
import IntentRequestSheet from '@/components/IntentRequestSheet';

const StreamLiveStage = lazy(async () => {
  const [module, sdk] = await Promise.all([
    import('@/features/live/components/StreamLiveStage.tsx'),
    loadStreamVideoSdk(),
  ]);
  const BoundStreamLiveStage = (
    props: Omit<StreamLiveStageProps, 'sdk'>,
  ) => <module.StreamLiveStage {...props} sdk={sdk} />;
  BoundStreamLiveStage.displayName = 'BoundStreamLiveStage';
  return { default: BoundStreamLiveStage };
});

type LiveRoomNotice = {
  actionLabel: string;
  body: string;
  key: string;
  kind: LiveRoomEventNoticeKind;
  title: string;
};

export default function LiveSessionScreen() {
  const params = useLocalSearchParams<{
    sessionId?: string;
    startAudio?: string;
    startVideo?: string;
  } & LiveReturnRouteParams>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const liveReturnParams = useMemo(
    () => getLiveReturnParams(params),
    [params.returnCircleId, params.returnCircleTab],
  );
  const returnsToCircle = isReturningToCircle(liveReturnParams);
  const { profile, user } = useAuth();
  const controller = useLiveSessionController(sessionId, user?.id ?? null);
  const media = useLiveMediaSession(sessionId);
  const authorityExpectationRef = useRef<string | null>(null);
  const privateSparkHandoffRef = useRef<string | null>(null);
  const quickConnectPairingRouteRef = useRef<string | null>(null);
  const terminalExitHandledRef = useRef(false);
  const participantAdmissionInFlightRef = useRef(false);
  const participantAdmissionAttemptsRef = useRef(0);
  const participantAdmissionGenerationRef = useRef(0);
  const participantAdmissionRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectedParticipantCount, setConnectedParticipantCount] = useState<number | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [roomPulseExpanded, setRoomPulseExpanded] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [roomEventNotices, setRoomEventNotices] = useState<readonly LiveRoomNotice[]>([]);
  const [audiencePulseOpenRequest, setAudiencePulseOpenRequest] = useState(0);
  const [selectedMember, setSelectedMember] = useState<LiveMemberPreview | null>(null);
  const [intentMember, setIntentMember] = useState<LiveMemberPreview | null>(null);
  const [memberActionBusy, setMemberActionBusy] = useState(false);
  const [likedProfileIds, setLikedProfileIds] = useState<ReadonlySet<string>>(() => new Set());
  const [participantAdmissionReady, setParticipantAdmissionReady] = useState(false);
  const [participantAdmissionRetry, setParticipantAdmissionRetry] = useState(0);
  const announcedSeatRequestsRef = useRef(new Set<string>());
  const announcedAudiencePollRef = useRef<string | null>(null);
  const joinSession = controller.join;
  const mediaState = media.state;
  useScopedScreenAwake({
    enabled: mediaState === 'joined' || mediaState === 'reconnecting',
    reason: 'live_event',
    instanceId: `public:${sessionId}`,
  });
  const joinMedia = media.join;
  const snapshot = controller.snapshot;
  const hostedMatching = useLiveHostedMatching(
    sessionId,
    snapshot?.session.format === 'hosted_match_night' && snapshot.session.status === 'live',
  );
  const me = snapshot?.me ?? null;
  const canPublish = snapshot?.capabilities.includes('live.publish') === true;
  const canManageStage = snapshot?.capabilities.includes('live.manage_stage') === true;
  const canModerateComments = snapshot?.capabilities.includes('live.moderate_comments') === true;
  const isRoomHost = me?.role === 'host'
    || snapshot?.session.createdByUserId === user?.id;
  const isLive = snapshot?.session.status === 'live';
  const isQuickConnectLive = isLive && snapshot?.session.format === 'quick_connect';
  const quickConnectHost = useLiveQuickConnectHostControl(
    sessionId,
    isQuickConnectLive && isRoomHost,
  );
  const quickConnectPool = useLiveQuickConnectPool(
    sessionId,
    isQuickConnectLive && participantAdmissionReady,
  );
  const quickConnectLayout = quickConnectPool.snapshot?.stageLayout ?? 'stacked';
  const quickConnectPairingId = quickConnectPool.snapshot?.queue?.pairing?.id ?? null;
  const canManageStudio = canManageStage
    || hostedMatching.snapshot?.canManage === true
    || controller.audiencePulse.canManage
    || quickConnectHost.snapshot?.canManage === true
    || (isQuickConnectLive && isRoomHost);
  const hasRequestedSeat = me?.state === 'stage_requested';
  const isOnStage = me?.state === 'on_stage' || me?.role === 'host';
  const requestedStartAudio = params.startAudio === '1';
  const requestedStartVideo = params.startVideo === '1';
  const deviceNeedsAttention = media.state === 'joined' && media.error?.includes('_needs_attention') === true;
  const publicationReady = canPublish
    && media.publishAuthorized
    && media.authorityState === 'ready';
  const returnToLiveOrigin = useCallback(() => {
    router.dismissTo(getLiveExitDestination(liveReturnParams));
  }, [liveReturnParams]);
  const openLiveStudio = useCallback(() => {
    setStudioOpen(true);
    void Promise.all([
      hostedMatching.refresh(),
      quickConnectHost.refresh(),
      quickConnectPool.refresh(),
      controller.refresh(),
    ]);
  }, [controller.refresh, hostedMatching.refresh, quickConnectHost.refresh, quickConnectPool.refresh]);
  const enqueueRoomNotice = useCallback((notice: LiveRoomNotice) => {
    setRoomEventNotices((current) => (
      current.some((item) => item.key === notice.key)
        ? current
        : [...current, notice]
    ));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    announcedSeatRequestsRef.current.clear();
    announcedAudiencePollRef.current = null;
    quickConnectPairingRouteRef.current = null;
    setRoomEventNotices([]);
    setAudiencePulseOpenRequest(0);
  }, [sessionId]);

  useEffect(() => {
    if (!isQuickConnectLive || !quickConnectPairingId) return;
    if (quickConnectPairingRouteRef.current === quickConnectPairingId) return;
    quickConnectPairingRouteRef.current = quickConnectPairingId;

    void Promise.all([
      media.leave().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]).then(() => {
      if (quickConnectPairingRouteRef.current === quickConnectPairingId) {
        router.push({
          pathname: '/live/quick-connect/[sessionId]',
          params: { sessionId, ...liveReturnParams },
        });
      }
    });
  }, [isQuickConnectLive, liveReturnParams, media.leave, quickConnectPairingId, sessionId]);

  useEffect(() => {
    participantAdmissionGenerationRef.current += 1;
    participantAdmissionInFlightRef.current = false;
    participantAdmissionAttemptsRef.current = 0;
    setParticipantAdmissionReady(false);
    setParticipantAdmissionRetry(0);
    return () => {
      participantAdmissionGenerationRef.current += 1;
      if (participantAdmissionRetryTimerRef.current) {
        clearTimeout(participantAdmissionRetryTimerRef.current);
        participantAdmissionRetryTimerRef.current = null;
      }
    };
  }, [sessionId]);

  useEffect(() => {
    if (!canManageStage || !snapshot) return;
    const pendingRequests = snapshot.seatRequests.filter((request) => request.status === 'pending');
    const unseen = pendingRequests.filter((request) => {
      const eventKey = `${request.id}:${request.requestedAt}`;
      if (announcedSeatRequestsRef.current.has(eventKey)) return false;
      announcedSeatRequestsRef.current.add(eventKey);
      return true;
    });
    if (unseen.length === 0) return;

    const latest = unseen.at(-1);
    const waitingCount = pendingRequests.length;
    enqueueRoomNotice({
      actionLabel: 'Review',
      body: waitingCount === 1
        ? 'The request remains safely in Stage Desk.'
        : `${waitingCount} requests are waiting safely in Stage Desk.`,
      key: `stage-request:${latest?.id ?? waitingCount}:${latest?.requestedAt ?? ''}`,
      kind: 'stage_request',
      title: waitingCount === 1
        ? `${latest?.fullName || 'A guest'} would like to join`
        : `${waitingCount} guests would like to join`,
    });
  }, [canManageStage, enqueueRoomNotice, snapshot]);

  useEffect(() => {
    const activePoll = controller.audiencePulse.activePoll;
    const activePollId = activePoll?.id ?? null;
    if (activePollId === announcedAudiencePollRef.current) return;
    announcedAudiencePollRef.current = activePollId;
    if (!activePoll || controller.audiencePulse.canManage) return;

    enqueueRoomNotice({
      actionLabel: 'Respond',
      body: 'Your response is private and shapes the room conversation.',
      key: `audience-pulse:${activePoll.id}`,
      kind: 'audience_pulse',
      title: activePoll.prompt,
    });
  }, [controller.audiencePulse.activePoll, controller.audiencePulse.canManage, enqueueRoomNotice]);

  useEffect(() => {
    if (
      !snapshot
      || !isLive
      || participantAdmissionReady
      || participantAdmissionInFlightRef.current
      || me?.state === 'removed'
      || me?.state === 'banned'
      || me?.state === 'private_spark'
    ) return;

    participantAdmissionInFlightRef.current = true;
    participantAdmissionAttemptsRef.current += 1;
    const attempt = participantAdmissionAttemptsRef.current;
    const generation = participantAdmissionGenerationRef.current;
    void joinSession().then((joined) => {
      if (participantAdmissionGenerationRef.current !== generation) return;
      participantAdmissionInFlightRef.current = false;
      if (joined) {
        setParticipantAdmissionReady(true);
        return;
      }
      if (attempt >= 3 || participantAdmissionRetryTimerRef.current) return;
      participantAdmissionRetryTimerRef.current = setTimeout(() => {
        participantAdmissionRetryTimerRef.current = null;
        setParticipantAdmissionRetry((current) => current + 1);
      }, attempt * 1_250);
    });
  }, [isLive, joinSession, me?.state, participantAdmissionReady, participantAdmissionRetry, snapshot]);

  useEffect(() => {
    if (!snapshot || !isLive || !me || !participantAdmissionReady || mediaState !== 'idle') return;
    if (privateSparkHandoffRef.current) return;
    if (!['audience', 'stage_requested', 'on_stage'].includes(me.state) && me.role !== 'host') return;
    void joinMedia({
      mode: isOnStage ? 'backstage' : 'audience',
      audioEnabled: isOnStage && requestedStartAudio,
      videoEnabled: isOnStage && requestedStartVideo,
    });
  }, [
    isLive,
    isOnStage,
    joinMedia,
    me,
    mediaState,
    participantAdmissionReady,
    requestedStartAudio,
    requestedStartVideo,
    snapshot,
  ]);

  useEffect(() => {
    if (mediaState !== 'joined') {
      authorityExpectationRef.current = null;
      return;
    }
    if (media.publishAuthorized === canPublish || media.authorityState === 'syncing') return;
    const expectationKey = `${sessionId}:${canPublish ? 'publisher' : 'audience'}`;
    if (authorityExpectationRef.current === expectationKey) return;
    authorityExpectationRef.current = expectationKey;
    void media.reconcileAuthority(canPublish);
  }, [
    canPublish,
    media.authorityState,
    media.publishAuthorized,
    media.reconcileAuthority,
    mediaState,
    sessionId,
  ]);

  useEffect(() => {
    if (!media.bindings) setConnectedParticipantCount(null);
  }, [media.bindings]);

  useEffect(() => {
    const participantAccessEnded = me?.state === 'removed' || me?.state === 'banned';
    const mediaAccessEnded = media.error === 'live_admission_denied';
    if ((!participantAccessEnded && !mediaAccessEnded) || terminalExitHandledRef.current) return;

    terminalExitHandledRef.current = true;
    void media.leave();
    Alert.alert(
      me?.state === 'banned' ? 'Live access ended' : 'You were removed from this Live',
      me?.state === 'banned'
        ? 'A host or moderator has ended your access to this room.'
        : 'The host has ended your participation in this room.',
      [{
        text: returnsToCircle ? 'Return to Circle' : 'Return to Live Studio',
        onPress: returnToLiveOrigin,
      }],
      { cancelable: false },
    );
  }, [me?.state, media.error, media.leave, returnsToCircle, returnToLiveOrigin]);

  useEffect(() => {
    const privateSpark = hostedMatching.snapshot?.privateSpark;
    if (
      privateSpark?.state !== 'active'
      || !privateSpark.isParticipant
      || privateSparkHandoffRef.current === privateSpark.id
    ) return;

    privateSparkHandoffRef.current = privateSpark.id;
    void (async () => {
      // Release the public call before acquiring the private two-person call.
      // This prevents camera contention and guarantees that private media is
      // never published into the public room during the transition.
      await media.leave();
      router.replace({
        pathname: '/live/private-spark/[privateSparkId]',
        params: { privateSparkId: privateSpark.id, ...liveReturnParams },
      });
    })();
  }, [hostedMatching.snapshot?.privateSpark, liveReturnParams, media.leave]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleConnectedParticipantCountChange = useCallback((count: number) => {
    setConnectedParticipantCount(count);
  }, []);
  const handlePictureInPictureModeChange = useCallback((active: boolean) => {
    setIsPictureInPicture(active);
    if (!active) return;
    Keyboard.dismiss();
    setStudioOpen(false);
    setRoomPulseExpanded(false);
  }, []);
  const handleStageRequest = useCallback(async () => {
    const saved = await (hasRequestedSeat ? controller.withdrawSeat() : controller.requestSeat());
    if (saved) return;
    Alert.alert(
      'Seat request unavailable',
      'The stage may have just changed. Please try again in a moment.',
    );
  }, [controller.requestSeat, controller.withdrawSeat, hasRequestedSeat]);
  const maximumGuestSeats = Math.max(0, (snapshot?.session.maximumPublishers ?? 1) - 1);
  const occupiedGuestSeats = useMemo(() => {
    if (!snapshot) return 0;
    return new Set(
      [...snapshot.stage, ...snapshot.backstage]
        .filter((participant) => participant.role !== 'host')
        .map((participant) => participant.userId),
    ).size;
  }, [snapshot]);
  const availableGuestSeats = Math.max(
    0,
    Math.min(snapshot?.session.stageRequestCapacity ?? 0, maximumGuestSeats) - occupiedGuestSeats,
  );
  const handleIntroductionAvailability = useCallback((open: boolean) => {
    void hostedMatching.setAvailability(open).then((saved) => {
      if (saved) void controller.refresh();
    });
  }, [controller.refresh, hostedMatching.setAvailability]);
  const stageRequestSeat = useMemo<StreamLiveStageProps['requestSeat']>(() => {
    if (
      canPublish
      || !snapshot
      || (availableGuestSeats === 0 && !hasRequestedSeat)
    ) return null;
    return {
      state: hasRequestedSeat ? 'pending' : 'available',
      seatCount: hasRequestedSeat ? Math.max(1, availableGuestSeats) : availableGuestSeats,
      disabled: controller.busyAction === 'request-seat' || controller.busyAction === 'withdraw-seat',
      onPress: handleStageRequest,
    };
  }, [
    availableGuestSeats,
    canPublish,
    controller.busyAction,
    handleStageRequest,
    hasRequestedSeat,
    snapshot,
  ]);

  // The Supabase roster is durable admission state and may outlive an abrupt
  // disconnect. The public room count therefore comes from current Stream
  // transport presence. While the first presence snapshot arrives, the local
  // joined member is the only connection we can assert safely.
  const attendeeCount = connectedParticipantCount ?? (mediaState === 'joined' ? 1 : 0);
  const hostParticipant = snapshot?.stage.find((participant) => participant.role === 'host') ?? null;

  const close = useCallback(async () => {
    const shouldPersistLeave = me && !['left', 'removed', 'banned'].includes(me.state);
    await Promise.allSettled([
      media.leave(),
      shouldPersistLeave ? controller.leave() : Promise.resolve(),
    ]);
    returnToLiveOrigin();
  }, [controller.leave, me, media.leave, returnToLiveOrigin]);
  const confirmLeaveLive = useCallback(() => {
    Alert.alert(
      'Leave this Live?',
      'You can rejoin while the room is still live.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave Live', style: 'destructive', onPress: () => void close() },
      ],
    );
  }, [close]);
  const confirmLeaveStage = useCallback(() => {
    Alert.alert(
      'Leave the stage?',
      'You will stay in this Live and continue as a member of the audience.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave stage',
          style: 'destructive',
          onPress: () => void (async () => {
            const saved = await controller.leaveStage();
            if (!saved) {
              Alert.alert('Could not leave the stage', 'Please try again in a moment.');
              return;
            }
            await Promise.allSettled([
              media.setAudioEnabled(false),
              media.setVideoEnabled(false),
            ]);
          })(),
        },
      ],
    );
  }, [controller.leaveStage, media.setAudioEnabled, media.setVideoEnabled]);
  const requestSelectedMember = useCallback(() => {
    if (!selectedMember) return;
    setIntentMember(selectedMember);
    setSelectedMember(null);
  }, [selectedMember]);
  const likeSelectedMember = useCallback(async () => {
    const targetProfileId = selectedMember?.profileId;
    const viewerProfileId = profile?.id ? String(profile.id) : null;
    if (!targetProfileId || !viewerProfileId || !user?.id || memberActionBusy) return;
    setMemberActionBusy(true);
    try {
      await likeLiveMember({
        currentUserId: user.id,
        sessionId,
        targetProfileId,
        viewerProfileId,
      });
      setLikedProfileIds((current) => new Set([...current, targetProfileId]));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch {
      Alert.alert('Like not sent', 'Please check your connection and try again.');
    } finally {
      setMemberActionBusy(false);
    }
  }, [memberActionBusy, profile?.id, selectedMember?.profileId, sessionId, user?.id]);
  const dismissRoomNotice = useCallback(() => {
    setRoomEventNotices((current) => current.slice(1));
  }, []);
  const handleRoomNoticeAction = useCallback(() => {
    const notice = roomEventNotices[0];
    if (!notice) return;
    if (notice.kind === 'stage_request') {
      openLiveStudio();
    } else {
      setRoomPulseExpanded(true);
      setAudiencePulseOpenRequest((request) => request + 1);
    }
    setRoomEventNotices((current) => current.slice(1));
  }, [openLiveStudio, roomEventNotices]);

  if (!snapshot && controller.state === 'loading') {
    return <View style={styles.loading}><ActivityIndicator color="#D7B56D" /></View>;
  }
  if (!snapshot) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorTitle}>This room is unavailable.</Text>
        <Pressable onPress={() => void controller.refresh()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>
    );
  }

  if (!isLive) {
    const going = me?.rsvpStatus === 'going';
    const hostCanOpenBackstage = snapshot.capabilities.includes('live.start_session');
    const hostStatus = snapshot.session.status;
    const hostActionLabel = hostStatus === 'backstage'
      ? 'Enter private backstage'
      : hostStatus === 'confirmed'
        ? 'Open private backstage'
        : hostStatus === 'waiting_for_quorum'
          ? 'Confirm this room'
          : 'Prepare this room';
    const handleHostAction = () => {
      if (hostStatus === 'backstage') {
        router.push({
          pathname: '/live/backstage/[sessionId]',
          params: { sessionId, ...liveReturnParams },
        });
        return;
      }
      const nextStatus = hostStatus === 'confirmed'
        ? 'backstage'
        : hostStatus === 'scheduled'
          ? 'waiting_for_quorum'
          : 'confirmed';
      void controller.transitionSession(nextStatus);
    };
    return (
      <View style={styles.invitationRoot}>
        <SafeAreaView style={styles.invitationSafe}>
          <View style={styles.header}>
            <Pressable accessibilityLabel={returnsToCircle ? 'Back to Circle' : 'Back to Live Studio'} onPress={returnToLiveOrigin} style={styles.iconButton}><ChevronLeft size={25} color="#FFF7EC" /></Pressable>
            <View style={styles.scheduledPill}><Radio size={13} color="#D7B56D" /><Text style={styles.scheduledText}>SCHEDULED LIVE</Text></View>
            <View style={styles.iconButton}><MoreHorizontal size={21} color="#FFF7EC" /></View>
          </View>
          <View style={styles.invitationBody}>
            <Text style={styles.invitationEyebrow}>YOUR INVITATION</Text>
            <Text style={styles.invitationTitle}>{snapshot.session.title}</Text>
            <Text style={styles.invitationDescription}>{snapshot.session.description || 'A host-led room designed for intentional conversation and warmer introductions.'}</Text>
            <View style={styles.promiseCard}>
              <Text style={styles.promiseTitle}>What makes this room different</Text>
              <Text style={styles.promiseBody}>A protected four-seat stage, moderated conversation, no public rankings, and no attention-chasing mechanics.</Text>
            </View>
          </View>
          <View style={styles.invitationActions}>
            {hostCanOpenBackstage ? (
              <Pressable onPress={handleHostAction} style={styles.primaryButton}>
                <Text style={styles.primaryText}>{hostActionLabel}</Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={controller.busyAction !== null}
                onPress={() => void controller.rsvp(!going)}
                style={[styles.primaryButton, going && styles.goingButton, controller.busyAction !== null && styles.primaryButtonDisabled]}
              >
                <Text style={styles.primaryText}>{controller.busyAction === 'rsvp' ? 'Saving your place…' : going ? 'You’re going' : 'Save my place'}</Text>
              </Pressable>
            )}
            {controller.error ? (
              <Text accessibilityLiveRegion="polite" style={styles.actionError}>
                We couldn’t save that yet. Check your connection and try again.
              </Text>
            ) : null}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (me?.state === 'backstage' && me.role !== 'host') {
    return (
      <View style={styles.invitationRoot}>
        <SafeAreaView style={styles.invitationSafe}>
          <View style={styles.header}>
            <Pressable accessibilityLabel={returnsToCircle ? 'Back to Circle' : 'Back to Live Studio'} onPress={returnToLiveOrigin} style={styles.iconButton}><ChevronLeft size={25} color="#FFF7EC" /></Pressable>
            <View style={styles.scheduledPill}><Radio size={13} color="#D7B56D" /><Text style={styles.scheduledText}>HOST INVITATION</Text></View>
            <View style={styles.iconButton}><MoreHorizontal size={21} color="#FFF7EC" /></View>
          </View>
          <View style={styles.invitationBody}>
            <Text style={styles.invitationEyebrow}>YOUR SEAT IS READY</Text>
            <Text style={styles.invitationTitle}>Meet the host backstage.</Text>
            <Text style={styles.invitationDescription}>Check your camera and microphone privately. You will only appear publicly after the host brings you onto the stage.</Text>
          </View>
          <View style={styles.invitationActions}>
            <Pressable
              onPress={() => router.push({
                pathname: '/live/backstage/[sessionId]',
                params: { sessionId, ...liveReturnParams },
              })}
              style={styles.primaryButton}
            ><Text style={styles.primaryText}>Enter private backstage</Text></Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const renderMediaStage = () => (
    <>
      {media.bindings ? (
        <LiveMediaStageBoundary resetKey={`${sessionId}:${media.state}`}>
          <Suspense fallback={<ActivityIndicator color="#D7B56D" />}>
            <StreamLiveStage
              bindings={media.bindings}
              stageParticipants={snapshot.stage}
              localPublisherUserId={canPublish ? user?.id ?? null : null}
              onConnectedParticipantCountChange={handleConnectedParticipantCountChange}
              onPictureInPictureModeChange={handlePictureInPictureModeChange}
              requestSeat={stageRequestSeat}
            />
          </Suspense>
        </LiveMediaStageBoundary>
      ) : (
        <View style={styles.stageLoading}>
          <ActivityIndicator color="#D7B56D" />
          <Text style={styles.stageLoadingText}>
            {media.state === 'failed' ? 'Tap refresh to rejoin the room.' : 'Entering quietly…'}
          </Text>
        </View>
      )}
      {!isPictureInPicture && media.state === 'failed' ? (
        <Pressable
          onPress={() => void media.join({
            mode: isOnStage ? 'backstage' : 'audience',
            audioEnabled: isOnStage && requestedStartAudio,
            videoEnabled: isOnStage && requestedStartVideo,
          })}
          style={styles.mediaRetry}
        >
          <Text style={styles.mediaRetryText}>Rejoin</Text>
        </Pressable>
      ) : null}
      {!isPictureInPicture && deviceNeedsAttention ? (
        <View style={[styles.deviceNotice, isQuickConnectLive && styles.stageNoticeCompact]}>
          <Text style={styles.deviceNoticeText}>
            You’re in the room. {media.error?.includes('camera') ? 'Camera' : 'Microphone'} needs attention.
          </Text>
          <Pressable
            onPress={() => void (media.error?.includes('camera')
              ? media.setVideoEnabled(true)
              : media.setAudioEnabled(true))}
          >
            <Text style={styles.deviceRetryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {!isPictureInPicture && canPublish && !publicationReady ? (
        <View style={[styles.authorityNotice, isQuickConnectLive && styles.stageNoticeCompact]}>
          {media.authorityState === 'syncing' ? <ActivityIndicator color="#D7B56D" size="small" /> : null}
          <Text style={styles.authorityNoticeText}>
            {media.authorityState === 'failed'
              ? 'Stage controls need a quick refresh.'
              : 'Preparing your stage controls…'}
          </Text>
          {media.authorityState === 'failed' ? (
            <Pressable onPress={() => void media.reconcileAuthority(true)}>
              <Text style={styles.deviceRetryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={!isPictureInPicture}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoider}
      >
        {!isQuickConnectLive || isPictureInPicture ? (
          <View style={[styles.stageBackground, styles.fullStageBackground]}>
            {renderMediaStage()}
          </View>
        ) : null}
        {!isPictureInPicture && !isQuickConnectLive ? <LinearGradient
          colors={['#03100DE8', '#03100D12', '#03100D00', '#03100DCC']}
          locations={[0, 0.2, 0.56, 1]}
          pointerEvents="none"
          style={styles.stageScrim}
        /> : null}
        {!isPictureInPicture ? <SafeAreaView pointerEvents="box-none" style={styles.safe} edges={['top', 'bottom']}>
        <LiveCompactHeader
          attendeeCount={attendeeCount}
          hostAvatarUrl={hostParticipant?.avatarUrl ?? null}
          hostName={hostParticipant?.fullName ?? null}
          onLeave={isRoomHost ? () => void close() : confirmLeaveLive}
          roomTitle={snapshot.session.title}
        />
        <LiveConnectionBanner state={controller.state} />
        {roomEventNotices[0] && !keyboardVisible ? (
          <LiveRoomEventNotice
            actionLabel={roomEventNotices[0].actionLabel}
            body={roomEventNotices[0].body}
            kind={roomEventNotices[0].kind}
            onAction={handleRoomNoticeAction}
            onDismiss={dismissRoomNotice}
            title={roomEventNotices[0].title}
          />
        ) : null}

        {!keyboardVisible
          && snapshot.session.format === 'hosted_match_night'
          && hostedMatching.snapshot
          && !hostedMatching.snapshot.canManage ? (
          <LiveAudiencePreferences
            busy={hostedMatching.busyAction !== null}
            onChange={handleIntroductionAvailability}
            openToIntroductions={me?.openToIntroductions === true}
          />
        ) : null}

        {!keyboardVisible
          && snapshot.session.format === 'hosted_match_night'
          && hostedMatching.snapshot
          && !hostedMatching.snapshot.canManage ? (
          <LiveHostedMatchingPanel
            snapshot={hostedMatching.snapshot}
            currentUserId={user?.id ?? null}
            openToIntroductions={me?.openToIntroductions === true}
            busyAction={hostedMatching.busyAction}
            error={hostedMatching.error}
            onSetAvailability={handleIntroductionAvailability}
            onPropose={(userA, userB) => void hostedMatching.proposePair(userA, userB)}
            onRespond={(roundId, accept) => void hostedMatching.respond(roundId, accept)}
            onTransition={(roundId, targetState) => void hostedMatching.transition(roundId, targetState).then((saved) => {
              if (saved) void controller.refresh();
            })}
            onRespondPrivateSpark={(privateSparkId, accept) => void hostedMatching.respondPrivateSpark(privateSparkId, accept)}
            onEnterPrivateSpark={(privateSparkId) => router.push({
              pathname: '/live/private-spark/[privateSparkId]',
              params: { privateSparkId, ...liveReturnParams },
            })}
            onEndPrivateSpark={(privateSparkId) => void hostedMatching.endPrivateSpark(privateSparkId, 'host_safety_termination')}
            showAvailabilityControl={false}
          />
        ) : null}

        {hostedMatching.snapshot?.activeRound?.state === 'public_introduction' ? (
          <LivePublicIntroductionCard round={hostedMatching.snapshot.activeRound} />
        ) : null}

        {isQuickConnectLive && !keyboardVisible ? (
          <LiveQuickConnectStage
            hostSurface={renderMediaStage()}
            layout={quickConnectLayout}
            poolSurface={(
              <LiveQuickConnectPool
                busyAction={quickConnectPool.busyAction}
                currentUserId={user?.id ?? null}
                embedded
                error={quickConnectPool.error}
                initialLoading={quickConnectPool.initialLoading}
                layout={quickConnectLayout}
                onLayoutChange={(layout) => void quickConnectPool.setStageLayout(layout)}
                onLeave={() => void quickConnectPool.leave()}
                onOptIn={(connectionIntent) => void quickConnectPool.optIn(connectionIntent)}
                onSignalInterest={(profileId) => void quickConnectPool.signalInterest(profileId)}
                snapshot={quickConnectPool.snapshot}
              />
            )}
          />
        ) : <View pointerEvents="none" style={styles.overlaySpacer} />}

        <LiveGlassSurface
          intensity={28}
          style={[
            styles.conversationGlass,
            roomPulseExpanded && styles.conversationGlassExpanded,
            keyboardVisible && styles.conversationGlassKeyboard,
          ]}
        >
          <LiveConversationPanel
            comments={controller.comments}
            commentCount={controller.commentCount}
            currentUserId={user?.id ?? null}
            canModerate={canModerateComments}
            audiencePulse={controller.audiencePulse}
            pollBusy={controller.busyAction?.startsWith('audience-poll:') === true}
            disabled={controller.state === 'offline'}
            loadingEarlier={controller.loadingEarlierComments}
            onLoadEarlier={controller.loadEarlierComments}
            onComment={controller.createComment}
            onModerate={controller.moderateComment}
            onReport={controller.reportComment}
            onReaction={controller.createReaction}
            onOpenPoll={controller.openAudiencePoll}
            onVotePoll={controller.voteAudiencePoll}
            onClosePoll={controller.closeAudiencePoll}
            audiencePulseOpenRequest={audiencePulseOpenRequest}
            expanded={roomPulseExpanded}
            onExpandedChange={setRoomPulseExpanded}
            variant="glass"
            joinNotice={controller.joinNotice}
            onOpenMember={setSelectedMember}
          />
        </LiveGlassSurface>

        {!keyboardVisible && (canManageStudio || canPublish || canManageStage || (!isRoomHost && isOnStage)) ? <LiveControlDock style={styles.controls}>
          {!isRoomHost && isOnStage ? (
            <Pressable
              accessibilityLabel="Leave stage"
              accessibilityRole="button"
              onPress={confirmLeaveStage}
              style={styles.leaveButton}
            >
              <ChevronDown color="#FFD8D4" size={18} />
              <Text style={styles.leaveText}>Leave stage</Text>
            </Pressable>
          ) : null}
          {canManageStudio ? (
            <Pressable
              accessibilityLabel="Open private Live Studio"
              accessibilityRole="button"
              onPress={openLiveStudio}
              style={styles.studioButton}
            >
              <SlidersHorizontal size={18} color="#D7B56D" />
              <Text style={styles.studioText}>Live Studio</Text>
            </Pressable>
          ) : null}
          {canPublish ? (
            <>
              <Pressable disabled={!publicationReady} onPress={() => void media.setAudioEnabled(!media.audioEnabled)} style={[styles.control, !media.audioEnabled && styles.controlOff, !publicationReady && styles.controlDisabled]}>
                {media.audioEnabled ? <Mic size={20} color="#102522" /> : <MicOff size={20} color="#F9ECE1" />}
              </Pressable>
              <Pressable disabled={!publicationReady} onPress={() => void media.setVideoEnabled(!media.videoEnabled)} style={[styles.control, !media.videoEnabled && styles.controlOff, !publicationReady && styles.controlDisabled]}>
                {media.videoEnabled ? <Camera size={20} color="#102522" /> : <CameraOff size={20} color="#F9ECE1" />}
              </Pressable>
            </>
          ) : null}
          {canManageStage && snapshot.session.createdByUserId === user?.id ? (
            <Pressable onPress={() => void controller.transitionSession('ending')} style={styles.endButton}><Text style={styles.endText}>End room</Text></Pressable>
          ) : null}
        </LiveControlDock> : null}
        <LiveStudioModal
          visible={studioOpen && canManageStudio}
          onClose={() => setStudioOpen(false)}
          refreshing={hostedMatching.refreshing || quickConnectHost.refreshing || controller.state === 'loading' || controller.state === 'reconnecting'}
          onRefresh={() => void Promise.all([hostedMatching.refresh(), quickConnectHost.refresh(), controller.refresh()])}
          sessionId={sessionId}
          roomTitle={snapshot.session.title}
          stageDeskProps={{
            backstage: snapshot.backstage,
            onModerate: (userId, action) => void controller.moderateParticipant(userId, action),
            onResolveSeat: (requestId, approved) => void controller.resolveSeat(requestId, approved),
            onSetOnStage: (userId, onStage) => void controller.setOnStage(userId, onStage),
            maximumGuestSeats,
            occupiedGuestSeats,
            onSetStageRequestCapacity: (capacity) => void controller.setStageRequestCapacity(capacity),
            seatRequests: snapshot.seatRequests,
            stage: snapshot.stage,
            stageRequestsBusy: controller.busyAction === 'stage-intake',
            stageRequestCapacity: snapshot.session.stageRequestCapacity,
          }}
          quickConnectProps={isQuickConnectLive && isRoomHost ? {
            snapshot: quickConnectHost.snapshot,
            busyAction: quickConnectHost.busyAction,
            error: quickConnectHost.error,
            onConfigure: (roundSeconds, maxConcurrentPairs) => void quickConnectHost.configure(roundSeconds, maxConcurrentPairs),
            onControl: (action) => void quickConnectHost.control(action),
          } : null}
          matchingProps={hostedMatching.snapshot?.canManage ? {
            snapshot: hostedMatching.snapshot,
            currentUserId: user?.id ?? null,
            openToIntroductions: me?.openToIntroductions === true,
            busyAction: hostedMatching.busyAction,
            error: hostedMatching.error,
            onSetAvailability: (open) => void hostedMatching.setAvailability(open),
            onPropose: (userA, userB) => void hostedMatching.proposePair(userA, userB),
            onRespond: (roundId, accept) => void hostedMatching.respond(roundId, accept),
            onTransition: (roundId, targetState) => void hostedMatching.transition(roundId, targetState).then((saved) => {
              if (saved) void controller.refresh();
            }),
            onRespondPrivateSpark: (privateSparkId, accept) => void hostedMatching.respondPrivateSpark(privateSparkId, accept),
            onEnterPrivateSpark: (privateSparkId) => router.push({
              pathname: '/live/private-spark/[privateSparkId]',
              params: { privateSparkId, ...liveReturnParams },
            }),
            onEndPrivateSpark: (privateSparkId) => void hostedMatching.endPrivateSpark(privateSparkId, 'host_safety_termination'),
          } : null}
          pulseProps={{
            pulse: controller.audiencePulse,
            busy: controller.busyAction?.startsWith('audience-poll:') === true,
            disabled: controller.state === 'offline',
            onOpen: controller.openAudiencePoll,
            onVote: controller.voteAudiencePoll,
            onClose: controller.closeAudiencePoll,
          }}
        />
        <LiveMemberSummaryModal
          busy={memberActionBusy}
          isLiked={selectedMember ? likedProfileIds.has(selectedMember.profileId) : false}
          isSelf={selectedMember?.userId === user?.id || selectedMember?.profileId === profile?.id}
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          onLike={() => void likeSelectedMember()}
          onRequest={requestSelectedMember}
          roomTitle={snapshot.session.title}
          visible={selectedMember !== null}
        />
        <IntentRequestSheet
          defaultType="connect"
          metadata={{ source: 'live_room', live_session_id: sessionId }}
          onClose={() => setIntentMember(null)}
          onSent={() => setIntentMember(null)}
          recipientId={intentMember?.profileId ?? null}
          recipientName={intentMember?.fullName ?? null}
          visible={intentMember !== null}
        />
        </SafeAreaView> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#071310' },
  keyboardAvoider: { flex: 1 },
  safe: { flex: 1 },
  stageBackground: { position: 'absolute', top: 0, right: 0, left: 0, backgroundColor: '#071310' },
  fullStageBackground: { bottom: 0 },
  stageScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#071310', gap: 18 },
  errorTitle: { color: '#FFF7EC', fontSize: 21, fontFamily: 'PlayfairDisplay_700Bold' },
  retry: { paddingHorizontal: 20, height: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: '#D7B56D' },
  retryText: { color: '#102522', fontFamily: 'Manrope_700Bold' },
  header: { minHeight: 67, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#091614' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#08151299', borderWidth: 1, borderColor: '#FFFFFF24' },
  stageLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stageLoadingText: { color: '#A7B7B3', fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  mediaRetry: { position: 'absolute', alignSelf: 'center', top: '46%', paddingHorizontal: 18, height: 40, justifyContent: 'center', borderRadius: 20, backgroundColor: '#D7B56D' },
  mediaRetryText: { color: '#102522', fontFamily: 'Manrope_700Bold' },
  deviceNotice: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 126,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#172A27F2',
    borderWidth: 1,
    borderColor: '#7C6B45',
  },
  deviceNoticeText: { flex: 1, color: '#E9E2D8', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  deviceRetryText: { color: '#D7B56D', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  authorityNotice: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 126,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#172A27F2',
    borderWidth: 1,
    borderColor: '#7C6B45',
  },
  authorityNoticeText: { color: '#E9E2D8', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  stageNoticeCompact: { top: 10, left: 8, right: 8, minHeight: 38, paddingHorizontal: 10 },
  overlaySpacer: { flex: 1, minHeight: 10 },
  conversationGlass: { height: '27%', minHeight: 194, marginHorizontal: 12, marginBottom: 6, borderRadius: 24, backgroundColor: '#07151280' },
  conversationGlassExpanded: { height: '46%' },
  conversationGlassKeyboard: { flex: 1, height: 'auto', minHeight: 0, marginTop: 8, marginBottom: 4 },
  controls: { marginHorizontal: 12, marginBottom: 3 },
  studioButton: { height: 44, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#172A25', borderWidth: 1, borderColor: '#766842' },
  studioText: { color: '#E9D8B4', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  leaveButton: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#3B2525',
    borderWidth: 1,
    borderColor: '#A65E5E66',
  },
  leaveText: { color: '#FFD8D4', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  control: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  controlOff: { backgroundColor: '#59302F' },
  controlDisabled: { opacity: 0.45 },
  endButton: { height: 44, borderRadius: 22, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#472424' },
  endText: { color: '#FFD8D4', fontSize: 11, fontFamily: 'Manrope_700Bold' },
  invitationRoot: { flex: 1, backgroundColor: '#0A1715' },
  invitationSafe: { flex: 1 },
  scheduledPill: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#766842', backgroundColor: '#24271E' },
  scheduledText: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  invitationBody: { flex: 1, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' },
  invitationEyebrow: { color: '#D7B56D', fontSize: 10, letterSpacing: 2, fontFamily: 'Manrope_800ExtraBold' },
  invitationTitle: { color: '#FFF7EC', fontSize: 40, lineHeight: 47, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold', marginTop: 16 },
  invitationDescription: { color: '#A3B4AF', fontSize: 14, lineHeight: 22, textAlign: 'center', fontFamily: 'Manrope_500Medium', marginTop: 16 },
  promiseCard: { marginTop: 32, borderRadius: 24, padding: 20, backgroundColor: '#132522', borderWidth: 1, borderColor: '#345049' },
  promiseTitle: { color: '#F7EFE4', fontSize: 15, fontFamily: 'Archivo_700Bold' },
  promiseBody: { color: '#94A6A1', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium', marginTop: 7 },
  invitationActions: { padding: 20 },
  primaryButton: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  primaryButtonDisabled: { opacity: 0.55 },
  goingButton: { backgroundColor: '#82B5A5' },
  primaryText: { color: '#0E2723', fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  actionError: { color: '#F2AAA3', fontSize: 11, lineHeight: 17, textAlign: 'center', fontFamily: 'Manrope_600SemiBold', marginTop: 10 },
});
