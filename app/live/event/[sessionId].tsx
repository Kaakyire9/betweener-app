import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ArrowLeft, CalendarClock, Check, Play, Sparkles, Users } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatLiveCountdown } from '@/features/live/components/LiveSessionCard.tsx';
import { LiveQuorumPoolingCard } from '@/features/live/components/index.ts';
import { getLiveEventMediaUrl, getLiveSessionPhase, liveRepository } from '@/features/live/application/index.ts';
import { useLiveQuorumPooling, useLiveSessions } from '@/features/live/hooks/index.ts';
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
  const player = useVideoPlayer(uri, (instance) => { instance.loop = true; instance.muted = false; });
  return <VideoView player={player} nativeControls contentFit="cover" style={styles.teaser} />;
}

export default function LiveEventScreen() {
  const params = useLocalSearchParams<{ sessionId: string } & LiveReturnRouteParams>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const { profile } = useAuth();
  const { sessions, loading, refresh } = useLiveSessions();
  const quorumPooling = useLiveQuorumPooling(sessionId);
  const [clock, setClock] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const session = useMemo(() => sessions.find((item) => item.id === sessionId), [sessionId, sessions]);
  const phase = session ? getLiveSessionPhase(session, clock) : 'upcoming';
  const isOwner = session?.createdByProfileId === profile?.id;
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
      router.push({
        pathname: '/live/[sessionId]',
        params: { sessionId: session.id, ...liveReturnParams },
      });
      return;
    }
    if (isOwner && phase === 'upcoming') {
      router.push({
        pathname: '/live/backstage/[sessionId]',
        params: { sessionId: session.id, ...liveReturnParams },
      });
    }
  };

  if (loading && !session) return <View style={styles.loading}><ActivityIndicator color="#E1BE70" /></View>;
  if (!session) return <View style={styles.loading}><Text style={styles.missing}>This Live event is not available.</Text><Pressable onPress={leaveEvent}><Text style={styles.link}>{returnsToCircle ? 'Return to Circle' : 'Return to Live Studio'}</Text></Pressable></View>;

  return (
    <LinearGradient colors={['#071310', '#0C211D', '#121713']} style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}><Pressable accessibilityLabel={returnsToCircle ? 'Back to Circle' : 'Back to Live Studio'} onPress={leaveEvent} style={styles.icon}><ArrowLeft size={21} color="#FFF7EC" /></Pressable><Text style={styles.headerTitle}>Live Event</Text></View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ImageBackground source={posterUrl ? { uri: posterUrl } : undefined} style={styles.hero} imageStyle={styles.heroImage}>
            <LinearGradient colors={['rgba(8,20,18,0.05)', 'rgba(8,20,18,0.96)']} style={styles.heroOverlay}>
              <View style={[styles.phasePill, phase === 'live' && styles.livePill]}><Text style={[styles.phaseText, phase === 'live' && styles.liveText]}>{phase === 'live' ? 'LIVE NOW' : phase === 'past' ? 'PAST LIVE' : formatLiveCountdown(session.scheduledStart, clock).toUpperCase()}</Text></View>
              <View style={styles.heroCopy}><Text style={styles.title}>{session.title}</Text><Text style={styles.description}>{session.description || 'A hosted room for intentional conversation and warmer introductions.'}</Text></View>
            </LinearGradient>
          </ImageBackground>

          <View style={styles.details}>
            <View style={styles.detailRow}><CalendarClock size={18} color="#E1BE70" /><View><Text style={styles.detailLabel}>{phase === 'past' ? 'ENDED' : 'STARTS'}</Text><Text style={styles.detailValue}>{formatDate(phase === 'past' ? session.endedAt : session.scheduledStart)}</Text></View></View>
            <View style={styles.statRow}>
              <View style={styles.stat}><Users size={18} color="#E1BE70" /><Text style={styles.statNumber}>{phase === 'past' ? session.totalAttendeeCount : reservationCount}</Text><Text style={styles.statLabel}>{phase === 'past' ? 'attended' : 'places saved'}</Text></View>
              <View style={styles.stat}><Sparkles size={18} color="#E1BE70" /><Text style={styles.statNumber}>{session.matchesMadeCount}</Text><Text style={styles.statLabel}>matches made</Text></View>
            </View>
          </View>

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
              onOpenSession={(nextSessionId) => router.push({
                pathname: '/live/event/[sessionId]',
                params: { sessionId: nextSessionId, ...liveReturnParams },
              })}
            />
          ) : null}

          {teaserUrl ? <View style={styles.teaserCard}><View style={styles.teaserHeading}><Play size={16} color="#E1BE70" /><Text style={styles.teaserTitle}>A glimpse of the room</Text></View><TeaserVideo uri={teaserUrl} /></View> : null}

          {phase === 'upcoming' && !isOwner ? <Pressable disabled={saving} onPress={() => void reserve()} style={[styles.primary, session.rsvpStatus === 'going' && styles.savedButton]}>{saving ? <ActivityIndicator color="#102522" /> : <><Check size={18} color="#102522" /><Text style={styles.primaryText}>{session.rsvpStatus === 'going' ? 'Place saved — tap to cancel' : 'Save my place'}</Text></>}</Pressable> : null}
          {isOwner && phase === 'upcoming' ? <Pressable onPress={enter} style={styles.primary}><Text style={styles.primaryText}>Open private backstage</Text></Pressable> : null}
          {phase === 'live' ? <Pressable onPress={enter} style={styles.primary}><Text style={styles.primaryText}>Enter Live room</Text></Pressable> : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, safe: { flex: 1 }, loading: { flex: 1, backgroundColor: '#071310', alignItems: 'center', justifyContent: 'center', gap: 15 }, missing: { color: '#FFF7EC', fontFamily: 'Manrope_700Bold' }, link: { color: '#E1BE70', fontFamily: 'Manrope_800ExtraBold' },
  header: { height: 66, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }, icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#152824', borderWidth: 1, borderColor: '#36514B' }, headerTitle: { color: '#FFF7EC', fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  content: { padding: 18, paddingBottom: 50, gap: 16 }, hero: { minHeight: 430, borderRadius: 30, overflow: 'hidden', backgroundColor: '#17322D' }, heroImage: { borderRadius: 30 }, heroOverlay: { flex: 1, padding: 20 }, phasePill: { alignSelf: 'flex-start', paddingHorizontal: 12, minHeight: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: 'rgba(10,31,27,0.86)', borderWidth: 1, borderColor: '#806F4A' }, livePill: { backgroundColor: '#E1BE70' }, phaseText: { color: '#E6CE94', fontSize: 9, letterSpacing: 1.3, fontFamily: 'Manrope_800ExtraBold' }, liveText: { color: '#102522' }, heroCopy: { marginTop: 'auto' }, title: { color: '#FFF9EF', fontSize: 38, lineHeight: 43, fontFamily: 'PlayfairDisplay_700Bold' }, description: { color: '#D0DDD9', fontSize: 13, lineHeight: 20, marginTop: 10, fontFamily: 'Manrope_500Medium' },
  details: { borderRadius: 25, padding: 18, backgroundColor: '#132622', borderWidth: 1, borderColor: '#38514B', gap: 18 }, detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, detailLabel: { color: '#8FA49F', fontSize: 8, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' }, detailValue: { color: '#FFF7EC', fontSize: 13, marginTop: 3, fontFamily: 'Manrope_700Bold' }, statRow: { flexDirection: 'row', gap: 10 }, stat: { flex: 1, borderRadius: 18, padding: 14, backgroundColor: '#0D1E1B' }, statNumber: { color: '#FFF7EC', fontSize: 23, marginTop: 8, fontFamily: 'PlayfairDisplay_700Bold' }, statLabel: { color: '#91A39F', fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  teaserCard: { borderRadius: 25, padding: 12, backgroundColor: '#132622', borderWidth: 1, borderColor: '#38514B' }, teaserHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }, teaserTitle: { color: '#F8F1E7', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' }, teaser: { height: 230, borderRadius: 18, overflow: 'hidden' },
  primary: { minHeight: 58, borderRadius: 29, paddingHorizontal: 20, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E1BE70' }, savedButton: { backgroundColor: '#BBD7CC' }, primaryText: { color: '#102522', fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
});
