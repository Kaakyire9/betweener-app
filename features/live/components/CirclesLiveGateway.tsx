import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock, ChevronRight, Radio, Sparkles } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { partitionLiveLobbySessions, type LiveSessionSummary } from '../application/index.ts';

type CirclesLiveGatewayProps = {
  sessions: readonly LiveSessionSummary[];
  canSchedule: boolean;
  viewerProfileId?: string | null;
  isDark: boolean;
  onPress: () => void;
};

const sessionTime = (value: string | null) => {
  if (!value) return 'Time to be announced';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

export const CirclesLiveGateway = memo(function CirclesLiveGateway({
  sessions,
  canSchedule,
  viewerProfileId,
  isDark,
  onPress,
}: CirclesLiveGatewayProps) {
  const { liveNow, upcoming, owned, hasHostLobby } = useMemo(
    () => partitionLiveLobbySessions(sessions, viewerProfileId, canSchedule),
    [canSchedule, sessions, viewerProfileId],
  );
  const featuredLive = liveNow[0] ?? null;
  const featuredUpcoming = upcoming[0] ?? null;
  const isHostGateway = hasHostLobby;

  const title = isHostGateway
    ? owned.length > 0 ? 'Your rooms, beautifully hosted.' : 'Create your first Live room.'
    : featuredLive
      ? `${featuredLive.title} is live now.`
      : featuredUpcoming
        ? `Next: ${featuredUpcoming.title}`
        : 'Hosted rooms with intention.';
  const body = isHostGateway
    ? 'Create, prepare, or rejoin from one private host lobby.'
    : featuredLive?.description
      || featuredUpcoming?.description
      || 'Curated stages, protected conversation, and warmer introductions.';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isHostGateway ? 'Open your Betweener Live Studio' : 'Explore Betweener Live rooms'}
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={isDark ? ['#102B27', '#101E1C', '#191B17'] : ['#FFF9EE', '#F3E7CD', '#E8F3EF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: isDark ? '#42635B' : '#CDBB8A' }]}
      >
        <View style={styles.topRow}>
          <View style={[styles.mark, { backgroundColor: isDark ? '#14B8B2' : '#0C9E98' }]}>
            {isHostGateway ? <Sparkles size={21} color="#071B19" /> : <Radio size={21} color="#071B19" />}
          </View>
          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: isDark ? '#DDBF78' : '#7D5F1E' }]}>
              {isHostGateway ? 'YOUR LIVE STUDIO' : 'BETWEENER LIVE'}
            </Text>
            <Text numberOfLines={2} style={[styles.title, { color: isDark ? '#FFF7EB' : '#152D29' }]}>{title}</Text>
          </View>
          <View style={[styles.arrow, { backgroundColor: isDark ? '#18332F' : '#FFFDF7' }]}>
            <ChevronRight size={19} color={isDark ? '#DDBF78' : '#147E78'} />
          </View>
        </View>

        <Text numberOfLines={2} style={[styles.body, { color: isDark ? '#A9BBB6' : '#58706A' }]}>{body}</Text>

        <View style={styles.statusRail}>
          <View style={[styles.statusPill, liveNow.length > 0 && styles.livePill]}>
            <Radio size={12} color={liveNow.length > 0 ? '#09201D' : isDark ? '#92A59F' : '#60736E'} />
            <Text style={[styles.statusText, liveNow.length > 0 && styles.livePillText]}>
              {liveNow.length} LIVE
            </Text>
          </View>
          <View style={[styles.statusPill, { borderColor: isDark ? '#465B55' : '#C9C2AD' }]}>
            <CalendarClock size={12} color={isDark ? '#DDBF78' : '#7D5F1E'} />
            <Text style={[styles.statusText, { color: isDark ? '#E7D7B1' : '#6B5527' }]}>
              {upcoming.length > 0 ? `${upcoming.length} UPCOMING` : 'CREATE OR EXPLORE'}
            </Text>
          </View>
          {featuredUpcoming?.scheduledStart ? (
            <Text numberOfLines={1} style={[styles.nextTime, { color: isDark ? '#829691' : '#667B75' }]}>
              {sessionTime(featuredUpcoming.scheduledStart)}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  shell: {
    borderRadius: 28,
    shadowColor: '#062B27',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.992 }] },
  card: { minHeight: 166, borderRadius: 28, borderWidth: 1, padding: 18, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  mark: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 9, letterSpacing: 1.7, fontFamily: 'Manrope_800ExtraBold' },
  title: { fontSize: 18, lineHeight: 23, fontFamily: 'Archivo_700Bold' },
  arrow: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  body: { marginTop: 13, fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_500Medium' },
  statusRail: { minHeight: 30, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusPill: { minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: '#465B55', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  livePill: { backgroundColor: '#DDBF78', borderColor: '#E7CF96' },
  statusText: { color: '#A8BAB5', fontSize: 8, letterSpacing: 0.8, fontFamily: 'Manrope_800ExtraBold' },
  livePillText: { color: '#09201D' },
  nextTime: { flex: 1, textAlign: 'right', fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
});
