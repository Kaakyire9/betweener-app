import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock, ChevronRight, Radio, Sparkles } from 'lucide-react-native';
import { memo, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { getLiveEventMediaUrl, partitionLiveLobbySessions, type LiveSessionSummary } from '../application/index.ts';
import { Colors } from '@/constants/theme.ts';

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
  const featuredSession = featuredLive ?? featuredUpcoming;
  const posterUrl = getLiveEventMediaUrl(featuredSession?.posterPath);
  const isHostGateway = hasHostLobby;
  const broadcastPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    let pulseLoop: Animated.CompositeAnimation | null = null;
    if (!featuredLive) {
      broadcastPulse.setValue(0);
      return;
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted) return;
      if (reduceMotion) {
        broadcastPulse.setValue(0.55);
        return;
      }
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(broadcastPulse, {
            toValue: 1,
            duration: 1300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(broadcastPulse, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.start();
    });
    return () => {
      mounted = false;
      pulseLoop?.stop();
    };
  }, [broadcastPulse, featuredLive]);

  const title = isHostGateway
    ? owned.length > 0 ? 'Your rooms, beautifully hosted.' : 'Create your first Live room.'
    : featuredLive
      ? featuredLive.title
      : featuredUpcoming
        ? `Next: ${featuredUpcoming.title}`
        : 'Hosted rooms with intention.';
  const body = isHostGateway
    ? 'Create, prepare, or rejoin from one private host lobby.'
    : featuredLive?.description
      || featuredUpcoming?.description
      || 'Curated stages, protected conversation, and warmer introductions.';

  const card = (
    <LinearGradient
      colors={posterUrl
        ? ['rgba(5,25,26,0.28)', 'rgba(5,22,23,0.82)', 'rgba(16,18,16,0.98)']
        : isDark ? [Colors.dark.backgroundSubtle, '#173432', Colors.dark.background] : [Colors.light.backgroundSubtle, '#E3F1ED', Colors.light.background]}
      locations={posterUrl ? [0, 0.5, 1] : undefined}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: isDark ? '#5BC1BB52' : '#0080804D' }]}
    >
      <View pointerEvents="none" style={[styles.ambientOrb, { backgroundColor: isDark ? 'rgba(20,184,178,0.16)' : 'rgba(12,158,152,0.1)' }]} />
      <View pointerEvents="none" style={[styles.purpleOrb, { backgroundColor: isDark ? '#9B7CC81F' : '#7D5BA614' }]} />
      <View style={styles.topRow}>
        <View style={styles.markStage}>
          <Animated.View
            style={[
              styles.markRing,
              { borderColor: isDark ? 'rgba(99,225,216,0.32)' : 'rgba(12,158,152,0.24)' },
              featuredLive && {
                opacity: broadcastPulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.08] }),
                transform: [{ scale: broadcastPulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.2] }) }],
              },
            ]}
          />
          <View style={[styles.mark, { backgroundColor: isDark ? '#20C4BD' : '#0C9E98' }]}>
            {isHostGateway ? <Sparkles size={19} color="#071B19" /> : <Radio size={19} color="#071B19" />}
          </View>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: isDark ? Colors.dark.tint : Colors.light.tint }]}>
            {isHostGateway ? 'YOUR LIVE STUDIO' : 'BETWEENER LIVE'}
          </Text>
          <Text numberOfLines={2} style={[styles.title, { color: isDark || posterUrl ? '#FFF7EB' : '#152D29' }]}>{title}</Text>
        </View>
      </View>

      <Text numberOfLines={2} style={[styles.body, { color: isDark || posterUrl ? '#B5C8C2' : '#58706A' }]}>{body}</Text>

      <View style={styles.bottomRail}>
        <View style={styles.statusRail}>
          {liveNow.length > 0 ? (
            <View style={styles.liveMeta}>
              <View style={styles.liveMetaDot} />
              <Text style={[styles.liveMetaText, { color: isDark || posterUrl ? '#F7C4CC' : '#B63E54' }]}>
                {liveNow.length} {liveNow.length === 1 ? 'room' : 'rooms'} live
              </Text>
              <Text style={[styles.exploreText, { color: isDark || posterUrl ? '#91AAA3' : '#667B75' }]}>
                {liveNow.length > 1 ? 'Featured now' : 'Open now'}
              </Text>
            </View>
          ) : (
            <View style={[styles.statusPill, { borderColor: isDark || posterUrl ? '#526A64' : '#C9C2AD' }]}>
              <CalendarClock size={12} color={isDark || posterUrl ? '#CDBAF0' : Colors.light.accent} />
              <Text style={[styles.statusText, { color: isDark || posterUrl ? '#E2D7F5' : Colors.light.accent }]}>
                {upcoming.length > 0 ? `${upcoming.length} UPCOMING` : 'EXPLORE'}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.destinationPill, featuredLive && styles.destinationPillLive, { borderColor: isDark || posterUrl ? '#5BC1BB47' : '#00808033' }]}>
          <Text style={[styles.destinationText, { color: featuredLive ? '#071B19' : isDark || posterUrl ? '#BFEAE6' : Colors.light.tint }]}>
            {featuredLive ? 'ENTER LIVE' : isHostGateway ? 'STUDIO' : 'OPEN'}
          </Text>
          <ChevronRight size={12} color={featuredLive ? '#071B19' : isDark || posterUrl ? '#BFEAE6' : Colors.light.tint} />
        </View>
      </View>
      {featuredUpcoming?.scheduledStart && !featuredLive ? (
        <Text numberOfLines={1} style={[styles.nextTime, { color: isDark || posterUrl ? '#91AAA3' : '#667B75' }]}>
          {sessionTime(featuredUpcoming.scheduledStart)}
        </Text>
      ) : null}
    </LinearGradient>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isHostGateway ? 'Open your Betweener Live Studio' : 'Explore Betweener Live rooms'}
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
    >
      {posterUrl ? (
        <ImageBackground source={{ uri: posterUrl }} style={styles.poster} imageStyle={styles.posterImage}>
          {card}
        </ImageBackground>
      ) : card}
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
  poster: { minHeight: 164 },
  posterImage: { borderRadius: 28 },
  card: { minHeight: 164, borderRadius: 28, borderWidth: 1, padding: 16, overflow: 'hidden' },
  ambientOrb: { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -92, right: -42 },
  purpleOrb: { position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: -76, left: 24 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  markStage: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  markRing: { position: 'absolute', width: 48, height: 48, borderRadius: 24, borderWidth: 1 },
  mark: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', shadowColor: '#20C4BD', shadowOpacity: 0.26, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  copy: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 9, letterSpacing: 1.7, fontFamily: 'Manrope_800ExtraBold' },
  title: { fontSize: 18, lineHeight: 22, fontFamily: 'PlayfairDisplay_700Bold' },
  body: { marginTop: 10, fontSize: 11, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  bottomRail: { minHeight: 30, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusRail: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusPill: { minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: '#465B55', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { color: '#A8BAB5', fontSize: 8, letterSpacing: 0.8, fontFamily: 'Manrope_800ExtraBold' },
  liveMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveMetaDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F0657A' },
  liveMetaText: { fontSize: 9, letterSpacing: 0.45, fontFamily: 'Manrope_800ExtraBold' },
  exploreText: { fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  destinationPill: { minHeight: 28, borderRadius: 14, borderWidth: 1, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(5,25,26,0.34)' },
  destinationPillLive: { backgroundColor: '#20C4BD', borderColor: '#5BE0D7' },
  destinationText: { fontSize: 8, letterSpacing: 0.9, fontFamily: 'Manrope_800ExtraBold' },
  nextTime: { marginTop: 8, textAlign: 'right', fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
});
