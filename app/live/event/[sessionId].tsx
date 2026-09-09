import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ArrowLeft, CalendarClock, Check, MoreHorizontal, Play, Sparkles, Users } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  ImageBackground,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLiveEventMediaUrl, getLiveSessionPhase, liveRepository } from '@/features/live/application/index.ts';
import {
  LiveEventManagementSheet,
  LiveHostPreparationCard,
  LiveQuorumPoolingCard,
  LiveSessionRecapCard,
} from '@/features/live/components/index.ts';
import { formatLiveCountdown } from '@/features/live/components/LiveSessionCard.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from '@/features/live/components/live-visual-tokens.ts';
import { useLiveQuorumPooling, useLiveSessionRecap, useLiveSessions } from '@/features/live/hooks/index.ts';
import {
  getLiveExitDestination,
  getLiveReturnParams,
  isReturningToCircle,
  type LiveReturnRouteParams,
} from '@/features/live/navigation/live-navigation.ts';
import { useAuth } from '@/lib/auth-context';

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value))
  : 'Date to be announced';

function TeaserVideo({ uri }: { uri: string }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const player = useVideoPlayer(uri, (instance) => { instance.loop = true; instance.muted = false; });
  return <VideoView player={player} nativeControls contentFit="cover" style={styles.teaser} />;
}

export default function LiveEventScreen() {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const params = useLocalSearchParams<{ sessionId: string } & LiveReturnRouteParams>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const { profile } = useAuth();
  const { sessions, loading, refresh } = useLiveSessions();
  const quorumPooling = useLiveQuorumPooling(sessionId);
  const [clock, setClock] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const session = useMemo(() => sessions.find((item) => item.id === sessionId), [sessionId, sessions]);
  const phase = session ? getLiveSessionPhase(session, clock) : 'upcoming';
  const recap = useLiveSessionRecap(sessionId, phase === 'past' && session?.status === 'ended');
  const isOwner = session?.createdByProfileId === profile?.id;
  const isDue = Boolean(session?.scheduledStart && Date.parse(session.scheduledStart) <= clock);
  const posterUrl = getLiveEventMediaUrl(session?.posterPath);
  const teaserUrl = getLiveEventMediaUrl(session?.teaserVideoPath);
  const reservationCount = quorumPooling.snapshot?.quorum.attendanceCount ?? session?.reservationCount ?? 0;
  const liveReturnParams = useMemo(
    () => getLiveReturnParams(params),
    [params.returnCircleId, params.returnCircleTab],
  );
  const returnsToCircle = isReturningToCircle(liveReturnParams);
  const leaveEvent = useCallback(() => {
    router.dismissTo(getLiveExitDestination(liveReturnParams));
  }, [liveReturnParams]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveEvent();
      return true;
    });
    return () => subscription.remove();
  }, [leaveEvent]);

  const reserve = async () => {
    if (!session || saving) return;
    setSaving(true);
    try {
      await liveRepository.rsvp(session.id, session.rsvpStatus !== 'going');
      await refresh({ attemptRecovery: false });
    } finally { setSaving(false); }
  };

  const enter = () => {
    if (!session) return;
    if (phase === 'live') {
      router.push({ pathname: '/live/[sessionId]', params: { sessionId: session.id, ...liveReturnParams } });
      return;
    }
    if (isOwner && phase === 'upcoming') {
      router.push({ pathname: '/live/backstage/[sessionId]', params: { sessionId: session.id, ...liveReturnParams } });
    }
  };

  const shareEvent = async () => {
    if (!session) return;
    await Share.share({
      title: session.title,
      message: `${session.title}\n${formatDate(session.scheduledStart)}\nhttps://getbetweener.com/live/${session.id}`,
    });
  };

  const cancelEvent = async (reason: Parameters<typeof liveRepository.cancelStudio>[2]) => {
    if (!session || lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      await liveRepository.cancelStudio(session.id, session.version, reason);
      setManagementOpen(false);
      await refresh({ attemptRecovery: false });
    } catch {
      Alert.alert('Live not cancelled', 'The event may have changed elsewhere. Refresh it and try again.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const archiveEvent = () => {
    if (!session || lifecycleBusy) return;
    Alert.alert('Archive this Live?', 'It will leave your Studio list, while its safety record remains retained.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Archive',
        onPress: async () => {
          setLifecycleBusy(true);
          try {
            await liveRepository.archiveStudio(session.id, session.version);
            setManagementOpen(false);
            leaveEvent();
          } catch {
            Alert.alert('Live not archived', 'Refresh the event and try again.');
          } finally {
            setLifecycleBusy(false);
          }
        },
      },
    ]);
  };

  if (loading && !session) return <View style={styles.loading}><ActivityIndicator color={visual.teal} /></View>;
  if (!session) return <View style={styles.loading}><Text style={styles.missing}>This Live event is not available.</Text><Pressable onPress={leaveEvent}><Text style={styles.link}>{returnsToCircle ? 'Return to Circle' : 'Return to Live Studio'}</Text></Pressable></View>;

  const cancelled = session.status === 'cancelled';
  return (
    <LinearGradient colors={visual.isDark ? [visual.canvas, visual.surfaceSoft, visual.canvas] : [visual.canvas, visual.bgSubtle, visual.surface]} style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable accessibilityLabel={returnsToCircle ? 'Back to Circle' : 'Back to Live Studio'} onPress={leaveEvent} style={styles.icon}><ArrowLeft size={21} color={visual.text} /></Pressable>
          <Text style={styles.headerTitle}>Live Event</Text>
          {isOwner ? <Pressable accessibilityLabel="Manage Live" onPress={() => setManagementOpen(true)} style={styles.manageIcon}><MoreHorizontal size={22} color={visual.text} /></Pressable> : null}
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ImageBackground source={posterUrl ? { uri: posterUrl } : undefined} style={styles.hero} imageStyle={styles.heroImage}>
            <LinearGradient colors={['rgba(8,20,18,0.05)', 'rgba(8,20,18,0.96)']} style={styles.heroOverlay}>
              <View style={[styles.phasePill, phase === 'live' && styles.livePill, cancelled && styles.cancelledPill]}>
                <Text style={[styles.phaseText, phase === 'live' && styles.liveText, cancelled && styles.cancelledText]}>
                  {cancelled ? 'CANCELLED' : phase === 'live' ? 'LIVE NOW' : phase === 'past' ? 'PAST LIVE' : formatLiveCountdown(session.scheduledStart, clock).toUpperCase()}
                </Text>
              </View>
              <View style={styles.heroCopy}><Text style={styles.title}>{session.title}</Text><Text style={styles.description}>{session.description || 'A hosted room for intentional conversation and warmer introductions.'}</Text></View>
            </LinearGradient>
          </ImageBackground>

          <View style={styles.details}>
            <View style={styles.detailRow}><CalendarClock size={18} color={visual.teal} /><View><Text style={styles.detailLabel}>{cancelled ? 'WAS SCHEDULED' : phase === 'past' ? 'ENDED' : 'STARTS'}</Text><Text style={styles.detailValue}>{formatDate(cancelled ? session.scheduledStart : phase === 'past' ? session.endedAt : session.scheduledStart)}</Text></View></View>
            <View style={styles.statRow}>
              <View style={styles.stat}><Users size={18} color={visual.teal} /><Text style={styles.statNumber}>{phase === 'past' ? session.totalAttendeeCount : reservationCount}</Text><Text style={styles.statLabel}>{phase === 'past' ? 'attended' : 'places saved'}</Text></View>
              <View style={styles.stat}><Sparkles size={18} color={visual.teal} /><Text style={styles.statNumber}>{session.matchesMadeCount}</Text><Text style={styles.statLabel}>introductions</Text></View>
            </View>
          </View>

          {cancelled ? <View style={styles.cancelledNotice}><Text style={styles.cancelledNoticeTitle}>This Live was cancelled</Text><Text style={styles.cancelledNoticeCopy}>The room is closed. Its details remain visible so guests are not left wondering what happened.</Text></View> : null}

          {session.status === 'ended' ? <LiveSessionRecapCard recap={recap.recap} loading={recap.loading} error={recap.error} onRetry={() => void recap.refresh()} /> : null}

          {phase === 'upcoming' && isDue && !isOwner ? (
            <View style={styles.dueNotice}>
              <Text style={styles.dueEyebrow}>THE ROOM IS DUE</Text>
              <Text style={styles.dueTitle}>The host is preparing the stage.</Text>
              <Text style={styles.dueCopy}>Stay here—the Enter Live button will appear as soon as the host opens the public room.</Text>
            </View>
          ) : null}

          {phase === 'upcoming' ? (
            <LiveQuorumPoolingCard
              snapshot={quorumPooling.snapshot}
              preview={quorumPooling.preview}
              loading={quorumPooling.loading}
              saving={quorumPooling.saving}
              error={quorumPooling.error}
              onSetPreference={(allowed) => void quorumPooling.setPreference(allowed)}
              onRespondOffer={(offerId, accept) => void quorumPooling.respondToOffer(offerId, accept)}
              onCreateDefaultRule={() => void quorumPooling.createDefaultRule()}
              onCreatePool={(candidateSessionId, ruleId) => void quorumPooling.createPool(candidateSessionId, ruleId)}
              onOpenSession={(nextSessionId) => router.push({ pathname: '/live/event/[sessionId]', params: { sessionId: nextSessionId, ...liveReturnParams } })}
            />
          ) : null}

          {teaserUrl ? <View style={styles.teaserCard}><View style={styles.teaserHeading}><Play size={16} color={visual.teal} /><Text style={styles.teaserTitle}>A glimpse of the room</Text></View><TeaserVideo uri={teaserUrl} /></View> : null}

          {phase === 'upcoming' && !isOwner ? (
            <Pressable disabled={saving} onPress={() => void reserve()} style={[styles.primary, session.rsvpStatus === 'going' && styles.savedButton]}>
              {saving ? <ActivityIndicator color={visual.accentContrast} /> : <><Check size={18} color={visual.accentContrast} /><Text style={styles.primaryText}>{session.rsvpStatus === 'going' ? 'Place saved — tap to cancel' : session.rsvpStatus === 'needs_reconfirmation' ? 'Confirm my place again' : 'Save my place'}</Text></>}
            </Pressable>
          ) : null}
          {isOwner && phase === 'upcoming' ? <LiveHostPreparationCard session={session} now={clock} onOpenBackstage={enter} onManage={() => setManagementOpen(true)} onShare={() => void shareEvent()} /> : null}
          {phase === 'live' ? <Pressable onPress={enter} style={styles.primary}><Text style={styles.primaryText}>Enter Live room</Text></Pressable> : null}
        </ScrollView>
        {isOwner ? (
          <LiveEventManagementSheet
            visible={managementOpen}
            session={session}
            busy={lifecycleBusy}
            onClose={() => setManagementOpen(false)}
            onEdit={() => { setManagementOpen(false); router.push({ pathname: '/live/schedule', params: { sessionId: session.id, initialStep: 'story' } }); }}
            onReschedule={() => { setManagementOpen(false); router.push({ pathname: '/live/schedule', params: { sessionId: session.id, initialStep: 'room' } }); }}
            onDuplicate={() => { setManagementOpen(false); router.push({ pathname: '/live/schedule', params: { duplicateSessionId: session.id } }); }}
            onCancel={(reason) => void cancelEvent(reason)}
            onArchive={archiveEvent}
          />
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  loading: { flex: 1, backgroundColor: visual.canvas, alignItems: 'center', justifyContent: 'center', gap: 15 },
  missing: { color: visual.text, fontFamily: 'Manrope_700Bold' },
  link: { color: visual.teal, fontFamily: 'Manrope_800ExtraBold' },
  header: { height: 66, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  manageIcon: { marginLeft: 'auto', width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  headerTitle: { color: visual.text, fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  content: { padding: 18, paddingBottom: 50, gap: 16 },
  hero: { minHeight: 430, borderRadius: 30, overflow: 'hidden', backgroundColor: visual.surfaceSoft },
  heroImage: { borderRadius: 30 },
  heroOverlay: { flex: 1, padding: 20 },
  phasePill: { alignSelf: 'flex-start', paddingHorizontal: 12, minHeight: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: 'rgba(10,31,27,0.86)', borderWidth: 1, borderColor: visual.teal },
  livePill: { backgroundColor: visual.teal },
  cancelledPill: { backgroundColor: visual.dangerSoft, borderColor: visual.danger },
  phaseText: { color: '#FFFFFF', fontSize: 9, letterSpacing: 1.3, fontFamily: 'Manrope_800ExtraBold' },
  liveText: { color: visual.accentContrast },
  cancelledText: { color: visual.dangerText },
  heroCopy: { marginTop: 'auto' },
  title: { color: '#FFF9EF', fontSize: 38, lineHeight: 43, fontFamily: 'PlayfairDisplay_700Bold' },
  description: { color: '#D0DDD9', fontSize: 13, lineHeight: 20, marginTop: 10, fontFamily: 'Manrope_500Medium' },
  details: { borderRadius: 25, padding: 18, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border, gap: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailLabel: { color: visual.textMuted, fontSize: 8, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  detailValue: { color: visual.text, fontSize: 13, marginTop: 3, fontFamily: 'Manrope_700Bold' },
  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: 18, padding: 14, backgroundColor: visual.surfaceSoft },
  statNumber: { color: visual.text, fontSize: 23, marginTop: 8, fontFamily: 'PlayfairDisplay_700Bold' },
  statLabel: { color: visual.textMuted, fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  cancelledNotice: { borderRadius: 22, padding: 17, backgroundColor: visual.dangerSoft, borderWidth: 1, borderColor: visual.danger },
  cancelledNoticeTitle: { color: visual.dangerText, fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  cancelledNoticeCopy: { color: visual.textMuted, fontSize: 10, lineHeight: 16, marginTop: 5, fontFamily: 'Manrope_500Medium' },
  dueNotice: { borderRadius: 22, padding: 17, backgroundColor: visual.tealSoft, borderWidth: 1, borderColor: visual.borderStrong },
  dueEyebrow: { color: visual.teal, fontSize: 8, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  dueTitle: { color: visual.text, fontSize: 16, marginTop: 5, fontFamily: 'PlayfairDisplay_700Bold' },
  dueCopy: { color: visual.textMuted, fontSize: 10, lineHeight: 16, marginTop: 5, fontFamily: 'Manrope_500Medium' },
  teaserCard: { borderRadius: 25, padding: 12, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  teaserHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  teaserTitle: { color: visual.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  teaser: { height: 230, borderRadius: 18, overflow: 'hidden' },
  primary: { minHeight: 58, borderRadius: 29, paddingHorizontal: 20, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal },
  savedButton: { backgroundColor: visual.teal },
  primaryText: { color: visual.accentContrast, fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
});
