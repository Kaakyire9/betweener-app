import { router, useLocalSearchParams } from 'expo-router';
import { Camera, CameraOff, ChevronLeft, Mic, MicOff, MoreHorizontal, Radio, UserRoundPlus, X } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  LiveConnectionBanner,
  LiveConversationPanel,
  StreamLiveStage,
} from '@/features/live/components/index.ts';
import { useLiveMediaSession, useLiveSessionController } from '@/features/live/hooks/index.ts';
import { useAuth } from '@/lib/auth-context';

export default function LiveSessionScreen() {
  const params = useLocalSearchParams<{ sessionId?: string; startAudio?: string; startVideo?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const { user } = useAuth();
  const controller = useLiveSessionController(sessionId);
  const media = useLiveMediaSession(sessionId);
  const joinSession = controller.join;
  const busyAction = controller.busyAction;
  const mediaState = media.state;
  const joinMedia = media.join;
  const snapshot = controller.snapshot;
  const me = snapshot?.me ?? null;
  const canPublish = snapshot?.capabilities.includes('live.publish') === true;
  const canManageStage = snapshot?.capabilities.includes('live.manage_stage') === true;
  const isLive = snapshot?.session.status === 'live';
  const hasRequestedSeat = me?.state === 'stage_requested';
  const isOnStage = me?.state === 'on_stage' || me?.role === 'host';
  const requestedStartAudio = params.startAudio === '1';
  const requestedStartVideo = params.startVideo === '1';

  useEffect(() => {
    if (!isLive || busyAction !== null) return;
    if (me && !['confirmed', 'invited', 'waitlisted', 'left', 'temporarily_disconnected'].includes(me.state)) return;
    void joinSession();
  }, [busyAction, isLive, joinSession, me]);

  useEffect(() => {
    if (!snapshot || !isLive || !me || mediaState !== 'idle') return;
    if (!['audience', 'stage_requested', 'on_stage'].includes(me.state) && me.role !== 'host') return;
    void joinMedia({
      mode: isOnStage ? 'backstage' : 'audience',
      audioEnabled: isOnStage && requestedStartAudio,
      videoEnabled: isOnStage && requestedStartVideo,
    });
  }, [isLive, isOnStage, joinMedia, me, mediaState, requestedStartAudio, requestedStartVideo, snapshot]);

  const attendeeCount = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.audienceCount + snapshot.stage.length;
  }, [snapshot]);

  const close = async () => {
    await media.leave();
    if (me && !['left', 'removed', 'banned'].includes(me.state)) await controller.leave();
    router.back();
  };

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
        router.push({ pathname: '/live/backstage/[sessionId]', params: { sessionId } });
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
            <Pressable onPress={() => router.back()} style={styles.iconButton}><ChevronLeft size={25} color="#FFF7EC" /></Pressable>
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
            <Pressable onPress={() => router.back()} style={styles.iconButton}><ChevronLeft size={25} color="#FFF7EC" /></Pressable>
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
              onPress={() => router.push({ pathname: '/live/backstage/[sessionId]', params: { sessionId } })}
              style={styles.primaryButton}
            ><Text style={styles.primaryText}>Enter private backstage</Text></Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => void close()} style={styles.iconButton}><X size={22} color="#FFF7EC" /></Pressable>
          <View style={styles.roomCopy}>
            <View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text><Text style={styles.viewerText}>{attendeeCount} in room</Text></View>
            <Text numberOfLines={1} style={styles.roomTitle}>{snapshot.session.title}</Text>
          </View>
          <Pressable style={styles.iconButton}><MoreHorizontal size={21} color="#FFF7EC" /></Pressable>
        </View>
        <LiveConnectionBanner state={controller.state} />

        <View style={styles.stage}>
          {media.bindings ? <StreamLiveStage bindings={media.bindings} /> : (
            <View style={styles.stageLoading}>
              <ActivityIndicator color="#D7B56D" />
              <Text style={styles.stageLoadingText}>{media.state === 'failed' ? 'Tap refresh to rejoin the room.' : 'Entering quietly…'}</Text>
            </View>
          )}
          {media.state === 'failed' ? (
            <Pressable
              onPress={() => void media.join({ mode: isOnStage ? 'backstage' : 'audience', audioEnabled: false, videoEnabled: false })}
              style={styles.mediaRetry}
            ><Text style={styles.mediaRetryText}>Rejoin</Text></Pressable>
          ) : null}
        </View>

        {canManageStage && (snapshot.seatRequests.length > 0 || snapshot.backstage.length > 0) ? (
          <View style={styles.hostRail}>
            <Text style={styles.hostRailTitle}>STAGE DESK</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hostRailContent}>
              {snapshot.seatRequests.map((request) => (
                <View key={request.id} style={styles.seatCard}>
                  <Text numberOfLines={1} style={styles.seatName}>{request.fullName || 'Member'}</Text>
                  <View style={styles.seatActions}>
                    <Pressable onPress={() => void controller.resolveSeat(request.id, false)}><Text style={styles.passText}>Pass</Text></Pressable>
                    <Pressable onPress={() => void controller.resolveSeat(request.id, true)} style={styles.approveButton}><Text style={styles.approveText}>Invite</Text></Pressable>
                  </View>
                </View>
              ))}
              {snapshot.backstage.map((participant) => (
                <View key={participant.id} style={styles.seatCard}>
                  <Text numberOfLines={1} style={styles.seatName}>{participant.fullName || 'Member'} is ready</Text>
                  <View style={styles.seatActions}>
                    <Pressable onPress={() => void controller.setOnStage(participant.userId, true)} style={styles.approveButton}>
                      <Text style={styles.approveText}>Bring on stage</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {snapshot.stage.filter((participant) => participant.role !== 'host').map((participant) => (
                <View key={`stage-${participant.id}`} style={styles.seatCard}>
                  <Text numberOfLines={1} style={styles.seatName}>{participant.fullName || 'Member'} · on stage</Text>
                  <View style={styles.seatActions}>
                    <Pressable onPress={() => void controller.moderateParticipant(participant.userId, participant.microphoneMutedByModerator ? 'unmute' : 'mute')}>
                      <Text style={styles.passText}>{participant.microphoneMutedByModerator ? 'Allow mic' : 'Mute'}</Text>
                    </Pressable>
                    <Pressable onPress={() => void controller.setOnStage(participant.userId, false)} style={styles.approveButton}>
                      <Text style={styles.approveText}>To audience</Text>
                    </Pressable>
                    <Pressable onPress={() => void controller.moderateParticipant(participant.userId, 'remove')}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <LiveConversationPanel
          comments={snapshot.comments}
          disabled={controller.busyAction !== null || controller.state === 'offline'}
          onComment={controller.createComment}
          onReaction={controller.createReaction}
        />

        <View style={styles.controls}>
          {canPublish ? (
            <>
              <Pressable onPress={() => void media.setAudioEnabled(!media.audioEnabled)} style={[styles.control, !media.audioEnabled && styles.controlOff]}>
                {media.audioEnabled ? <Mic size={20} color="#102522" /> : <MicOff size={20} color="#F9ECE1" />}
              </Pressable>
              <Pressable onPress={() => void media.setVideoEnabled(!media.videoEnabled)} style={[styles.control, !media.videoEnabled && styles.controlOff]}>
                {media.videoEnabled ? <Camera size={20} color="#102522" /> : <CameraOff size={20} color="#F9ECE1" />}
              </Pressable>
            </>
          ) : (
            <Pressable
              disabled={controller.busyAction !== null}
              onPress={() => void (hasRequestedSeat ? controller.withdrawSeat() : controller.requestSeat())}
              style={[styles.seatRequest, hasRequestedSeat && styles.seatRequestActive]}
            >
              <UserRoundPlus size={18} color={hasRequestedSeat ? '#D7B56D' : '#0D2522'} />
              <Text style={[styles.seatRequestText, hasRequestedSeat && styles.seatRequestTextActive]}>
                {hasRequestedSeat ? 'Request sent' : 'Ask to join stage'}
              </Text>
            </Pressable>
          )}
          {canManageStage && snapshot.session.createdByUserId === user?.id ? (
            <Pressable onPress={() => void controller.transitionSession('ending')} style={styles.endButton}><Text style={styles.endText}>End room</Text></Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#071310' },
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#071310', gap: 18 },
  errorTitle: { color: '#FFF7EC', fontSize: 21, fontFamily: 'PlayfairDisplay_700Bold' },
  retry: { paddingHorizontal: 20, height: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: '#D7B56D' },
  retryText: { color: '#102522', fontFamily: 'Manrope_700Bold' },
  header: { minHeight: 67, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#091614' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#152421', borderWidth: 1, borderColor: '#2D413D' },
  roomCopy: { flex: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E75C69' },
  liveText: { color: '#FF818C', fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  viewerText: { color: '#839692', fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  roomTitle: { color: '#FFF6EB', fontSize: 16, fontFamily: 'Archivo_700Bold', marginTop: 3 },
  stage: { height: '42%', minHeight: 250, position: 'relative', backgroundColor: '#091413' },
  stageLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stageLoadingText: { color: '#A7B7B3', fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  mediaRetry: { position: 'absolute', alignSelf: 'center', bottom: 18, paddingHorizontal: 18, height: 40, justifyContent: 'center', borderRadius: 20, backgroundColor: '#D7B56D' },
  mediaRetryText: { color: '#102522', fontFamily: 'Manrope_700Bold' },
  hostRail: { backgroundColor: '#12211E', paddingVertical: 11 },
  hostRailTitle: { color: '#D7B56D', fontSize: 10, letterSpacing: 1.3, fontFamily: 'Manrope_800ExtraBold', paddingHorizontal: 16 },
  hostRailContent: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  seatCard: { width: 190, borderRadius: 14, padding: 11, backgroundColor: '#1B302C', borderWidth: 1, borderColor: '#38514B' },
  seatName: { color: '#FFF7EC', fontSize: 12, fontFamily: 'Manrope_700Bold' },
  seatActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginTop: 8 },
  passText: { color: '#A7B7B3', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  removeText: { color: '#FFAAA3', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  approveButton: { paddingHorizontal: 11, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: '#D7B56D' },
  approveText: { color: '#102522', fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  controls: { minHeight: 70, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#091614', borderTopWidth: 1, borderTopColor: '#263A36' },
  control: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  controlOff: { backgroundColor: '#59302F' },
  seatRequest: { height: 46, borderRadius: 23, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#D7B56D' },
  seatRequestActive: { backgroundColor: '#172A27', borderWidth: 1, borderColor: '#8F7A50' },
  seatRequestText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  seatRequestTextActive: { color: '#D7B56D' },
  endButton: { height: 42, borderRadius: 21, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: '#472424' },
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
