import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { CalendarClock, CheckCircle2, Radio, Sparkles, UsersRound } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { getLiveEventMediaUrl, type CircleLiveCard, type CircleLiveSnapshot } from '../application/index.ts';
import { createCircleLiveReturnParams } from '../navigation/live-navigation.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = {
  circleId: string;
  circleName: string;
  canHost: boolean;
  snapshot: CircleLiveSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : 'Time to be announced';

const countdownLabel = (value: string | null) => {
  if (!value) return 'Date to be announced';
  const milliseconds = Math.max(0, new Date(value).getTime() - Date.now());
  const days = Math.floor(milliseconds / 86_400_000);
  if (days > 0) return `Starts in ${days}d`;
  const hours = Math.floor(milliseconds / 3_600_000);
  if (hours > 0) return `Starts in ${hours}h`;
  return milliseconds > 60_000 ? `Starts in ${Math.ceil(milliseconds / 60_000)}m` : 'Starting shortly';
};

const cardState = (session: CircleLiveCard) => {
  if (session.status === 'ended') return 'recap' as const;
  if (['live', 'backstage', 'ending'].includes(session.status)) return 'live' as const;
  return session.quorumStatus === 'confirmed' ? 'confirmed' as const : 'almost_ready' as const;
};

const stateCopy = (session: CircleLiveCard) => {
  const state = cardState(session);
  if (state === 'live') return { eyebrow: 'LIVE NOW', title: 'The Circle is together', icon: Radio };
  if (state === 'confirmed') return { eyebrow: 'TONIGHT IS CONFIRMED', title: 'The room is coming together', icon: CheckCircle2 };
  if (state === 'recap') return { eyebrow: 'LIVE RECAP', title: 'A warmer Circle moment', icon: Sparkles };
  return { eyebrow: 'ALMOST READY', title: 'A few more people make it viable', icon: UsersRound };
};

const CircleLiveCardView = ({ circleId, session }: { circleId: string; session: CircleLiveCard }) => {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const state = cardState(session);
  const copy = stateCopy(session);
  const Icon = copy.icon;
  const saved = Math.min(session.attendanceCount, session.minimumAttendance);
  const posterUrl = getLiveEventMediaUrl(session.posterPath);
  const content = (
    <LinearGradient colors={posterUrl ? ['rgba(10,34,30,0.35)', 'rgba(10,24,21,0.97)'] : ['#173933', '#101B19']} style={styles.card}>
      <View style={styles.stateRow}>
        <View style={[styles.icon, state === 'live' && styles.liveIcon]}><Icon size={18} color={state === 'live' ? visual.accentContrast : '#CDBAF0'} /></View>
        <View style={styles.stateCopy}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.stateTitle}>{copy.title}</Text>
        </View>
      </View>
      <Text style={styles.title}>{session.title}</Text>
      {session.description ? <Text numberOfLines={2} style={styles.description}>{session.description}</Text> : null}
      {state === 'recap' ? (
        <View style={styles.metrics}>
          <Text style={styles.metric}>{session.totalAttendeeCount} attended</Text>
          <Text style={styles.metric}>{session.matchesMadeCount} matches made</Text>
        </View>
      ) : (
        <>
          <View style={styles.timeRow}><CalendarClock size={14} color={visual.teal} /><Text style={styles.time}>{dateLabel(session.scheduledStart)} · {countdownLabel(session.scheduledStart)}</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progress, { width: `${Math.min(100, (saved / session.minimumAttendance) * 100)}%` }]} /></View>
          <Text style={styles.progressText}>{session.attendanceCount} of {session.minimumAttendance} places saved</Text>
        </>
      )}
      <Text style={styles.cta}>{state === 'live' ? 'Enter Live room' : state === 'recap' ? 'View Live outcome' : session.viewerRsvpStatus === 'going' ? 'Your place is saved' : 'View and save a place'} →</Text>
    </LinearGradient>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${session.title}`}
      onPress={() => router.push({
        pathname: '/live/event/[sessionId]',
        params: {
          sessionId: session.sessionId,
          ...createCircleLiveReturnParams(circleId, 'live'),
        },
      })}
      style={({ pressed }) => [styles.cardShell, pressed && styles.pressed]}
    >
      {posterUrl ? <ImageBackground source={{ uri: posterUrl }} style={styles.poster}>{content}</ImageBackground> : content}
    </Pressable>
  );
};

export const CircleLiveSection = memo(function CircleLiveSection({ circleId, circleName, canHost, snapshot, loading, error, refresh }: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const canSchedule = canHost && snapshot?.canSchedule === true;
  const active = snapshot?.sessions.filter((session) => session.status !== 'ended') ?? [];
  const recaps = snapshot?.sessions.filter((session) => session.status === 'ended').slice(0, 3) ?? [];

  const schedule = () => router.push({
    pathname: '/live/schedule',
    params: { circleId, circleName },
  });

  if (loading && !snapshot) return <View style={styles.loading}><ActivityIndicator color={visual.teal} /></View>;
  if (error && !snapshot) return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Circle Live could not load</Text>
      <Pressable onPress={() => void refresh()}><Text style={styles.retry}>Try again</Text></Pressable>
    </View>
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.heading}>Live in {circleName}</Text><Text style={styles.support}>Gather the Circle for intentional conversation and hosted introductions.</Text></View>
        {canSchedule ? <Pressable onPress={schedule} style={styles.schedule}><Text style={styles.scheduleText}>Schedule</Text></Pressable> : null}
      </View>
      {active.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Radio size={24} color={visual.teal} /></View>
          <Text style={styles.emptyTitle}>No Circle Live scheduled</Text>
          <Text style={styles.emptyBody}>When a host schedules one, its Gathering and quorum progress will appear here.</Text>
          {canSchedule ? <Pressable onPress={schedule} style={styles.primary}><Text style={styles.primaryText}>Create Circle Live</Text></Pressable> : null}
        </View>
      ) : active.map((session) => <CircleLiveCardView key={session.sessionId} circleId={circleId} session={session} />)}
      {recaps.length > 0 ? <Text style={styles.recapHeading}>Recent Live moments</Text> : null}
      {recaps.map((session) => <CircleLiveCardView key={session.sessionId} circleId={circleId} session={session} />)}
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  section: { gap: 14 }, loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, headerCopy: { flex: 1 }, heading: { color: visual.text, fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' }, support: { color: visual.textMuted, fontSize: 11, lineHeight: 17, marginTop: 4, fontFamily: 'Manrope_500Medium' },
  schedule: { borderRadius: 18, backgroundColor: visual.teal, paddingHorizontal: 15, paddingVertical: 10 }, scheduleText: { color: visual.accentContrast, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  cardShell: { borderRadius: 24, overflow: 'hidden' }, pressed: { opacity: 0.92 }, poster: { minHeight: 230 }, card: { minHeight: 230, borderRadius: 24, borderWidth: 1, borderColor: '#466159', padding: 18 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#243A34' }, liveIcon: { backgroundColor: visual.teal }, stateCopy: { flex: 1 }, eyebrow: { color: '#9CDDD7', fontSize: 8, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' }, stateTitle: { color: '#EAF1EE', fontSize: 14, marginTop: 2, fontFamily: 'Manrope_700Bold' },
  title: { color: '#FFF7EC', fontSize: 25, lineHeight: 30, marginTop: 16, fontFamily: 'PlayfairDisplay_700Bold' }, description: { color: '#B9C8C4', fontSize: 11, lineHeight: 17, marginTop: 6, fontFamily: 'Manrope_500Medium' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 }, time: { color: '#E5D4AA', fontSize: 10, fontFamily: 'Manrope_600SemiBold' }, progressTrack: { height: 5, borderRadius: 3, backgroundColor: '#30433E', marginTop: 14, overflow: 'hidden' }, progress: { height: 5, borderRadius: 3, backgroundColor: '#9FD3C5' }, progressText: { color: '#91A6A0', fontSize: 9, marginTop: 7, fontFamily: 'Manrope_600SemiBold' },
  metrics: { flexDirection: 'row', gap: 16, marginTop: 16 }, metric: { color: '#C7D5D1', fontSize: 10, fontFamily: 'Manrope_700Bold' }, cta: { color: '#CDBAF0', fontSize: 11, marginTop: 16, textAlign: 'right', fontFamily: 'Manrope_800ExtraBold' },
  empty: { borderRadius: 24, borderWidth: 1, borderColor: visual.border, backgroundColor: visual.surface, padding: 22, alignItems: 'center' }, emptyIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: visual.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, emptyTitle: { color: visual.text, fontSize: 16, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold' }, emptyBody: { color: visual.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7, fontFamily: 'Manrope_500Medium' }, primary: { marginTop: 16, borderRadius: 20, backgroundColor: visual.teal, paddingHorizontal: 18, paddingVertical: 11 }, primaryText: { color: visual.accentContrast, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' }, retry: { color: visual.teal, marginTop: 12, fontFamily: 'Manrope_700Bold' }, recapHeading: { color: visual.teal, fontSize: 10, letterSpacing: 1.2, marginTop: 8, fontFamily: 'Manrope_800ExtraBold' },
});
