import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock, Check, Radio, Sparkles, Users } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { getLiveEventMediaUrl, getLiveSessionPhase, type LiveSessionSummary } from '../application/index.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const sessionTime = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : 'Time to be announced';

export const formatLiveCountdown = (value: string | null, now = Date.now()) => {
  if (!value) return 'Date to be announced';
  const difference = Math.max(0, new Date(value).getTime() - now);
  if (difference <= 60_000) return 'Starting shortly';
  const days = Math.floor(difference / 86_400_000);
  if (days > 0) return `Starts in ${days}d`;
  const hours = Math.floor(difference / 3_600_000);
  if (hours > 0) return `Starts in ${hours}h`;
  return `Starts in ${Math.ceil(difference / 60_000)}m`;
};

export const LiveSessionCard = memo(function LiveSessionCard({ session, onPress }: { session: LiveSessionSummary; onPress: () => void }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const phase = getLiveSessionPhase(session);
  const posterUrl = getLiveEventMediaUrl(session.posterPath);
  const isGoing = session.rsvpStatus === 'going';
  const needsReconfirmation = session.rsvpStatus === 'needs_reconfirmation';
  const isCancelled = session.status === 'cancelled';
  const content = (
    <LinearGradient colors={posterUrl ? ['rgba(5,17,15,0.08)', 'rgba(5,17,15,0.94)'] : ['#173933', '#111B1A']} locations={[0.12, 1]} style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.status, phase === 'live' && styles.liveStatus]}>
          {phase === 'live' ? <Radio size={13} color={visual.accentContrast} /> : <CalendarClock size={13} color={visual.teal} />}
          <Text style={[styles.statusText, phase === 'live' && styles.liveStatusText]}>{isCancelled ? 'CANCELLED' : phase === 'live' ? 'LIVE NOW' : phase === 'past' ? 'PAST LIVE' : needsReconfirmation ? 'TIME CHANGED' : formatLiveCountdown(session.scheduledStart).toUpperCase()}</Text>
        </View>
        <View style={styles.count}><Users size={14} color="#DDE8E4" /><Text style={styles.countText}>{phase === 'past' ? session.totalAttendeeCount : phase === 'upcoming' ? session.reservationCount : session.audienceCount + session.stageCount}</Text></View>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>{session.title}</Text>
        <Text numberOfLines={2} style={styles.description}>{session.description || 'A hosted room for warmer introductions and intentional conversation.'}</Text>
        {phase === 'upcoming' ? <Text style={styles.time}>{sessionTime(session.scheduledStart)}</Text> : null}
      </View>
      <View style={styles.footer}>
        {phase === 'past' ? <View style={styles.metrics}><Text style={styles.metric}>{session.totalAttendeeCount} attended</Text><Text style={styles.metric}><Sparkles size={12} color={visual.teal} /> {session.matchesMadeCount} introductions</Text></View> : <Text style={styles.meta}>{phase === 'live' ? `${session.stageCount}/${session.maximumPublishers} on stage` : `${session.reservationCount} places saved`}</Text>}
        <Text style={styles.cta}>{phase === 'live' ? 'Enter room →' : isCancelled ? 'View cancellation →' : phase === 'past' ? 'View outcome →' : isGoing ? 'Place saved ✓' : needsReconfirmation ? 'Reconfirm place →' : 'View event →'}</Text>
      </View>
      {isGoing && phase === 'upcoming' ? <View style={styles.saved}><Check size={12} color={visual.accentContrast} /></View> : null}
    </LinearGradient>
  );
  return <Pressable onPress={onPress} style={styles.shell} accessibilityRole="button">{posterUrl ? <ImageBackground source={{ uri: posterUrl }} style={styles.poster} imageStyle={styles.posterImage}>{content}</ImageBackground> : content}</Pressable>;
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  shell: { borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 9 }, poster: { minHeight: 264 }, posterImage: { borderRadius: 28 },
  card: { minHeight: 264, borderRadius: 28, borderWidth: 1, borderColor: '#49645D', padding: 20, overflow: 'hidden' }, topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { minHeight: 30, borderRadius: 15, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: visual.teal, backgroundColor: 'rgba(8,32,29,0.88)' }, liveStatus: { backgroundColor: visual.teal, borderColor: visual.teal }, statusText: { color: '#D5F3EF', fontSize: 9, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' }, liveStatusText: { color: visual.accentContrast },
  count: { minHeight: 30, borderRadius: 15, paddingHorizontal: 10, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(8,24,21,0.8)' }, countText: { color: '#F2F7F5', fontSize: 12, fontFamily: 'Manrope_700Bold' }, copy: { marginTop: 'auto' },
  title: { color: '#FFF9EF', fontSize: 29, lineHeight: 34, fontFamily: 'PlayfairDisplay_700Bold', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 7 }, description: { color: '#D5E0DC', fontSize: 12, lineHeight: 19, marginTop: 7, fontFamily: 'Manrope_500Medium' }, time: { color: '#CDBAF0', fontSize: 11, marginTop: 9, fontFamily: 'Manrope_700Bold' },
  footer: { paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, meta: { color: '#B7C7C3', fontSize: 10, fontFamily: 'Manrope_600SemiBold' }, metrics: { flexDirection: 'row', gap: 11, alignItems: 'center', flexShrink: 1 }, metric: { color: '#C5D3CF', fontSize: 10, fontFamily: 'Manrope_600SemiBold' }, cta: { color: '#CDBAF0', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  saved: { position: 'absolute', right: 18, bottom: 50, width: 24, height: 24, borderRadius: 12, backgroundColor: visual.purple, alignItems: 'center', justifyContent: 'center' },
});
