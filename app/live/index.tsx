import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Radio, RefreshCw } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LiveSessionCard } from '@/features/live/components/index.ts';
import { getLiveSessionPhase, partitionLiveLobbySessions } from '@/features/live/application/index.ts';
import { useLiveSessions } from '@/features/live/hooks/index.ts';
import { useAuth } from '@/lib/auth-context';

export default function LiveHomeScreen() {
  const { profile } = useAuth();
  const {
    sessions,
    loading,
    refreshing,
    recovering,
    error,
    canSchedule,
    authUnavailable,
    authStatus,
    refresh,
  } = useLiveSessions();
  const hasCompletedInitialFocusRef = useRef(false);

  useFocusEffect(useCallback(() => {
    if (!hasCompletedInitialFocusRef.current) {
      hasCompletedInitialFocusRef.current = true;
      return;
    }
    void refresh({ attemptRecovery: false });
  }, [refresh]));
  const {
    owned: ownedSessions,
    liveNow,
    upcoming,
    past,
    hasHostLobby,
  } = partitionLiveLobbySessions(sessions, profile?.id, canSchedule);
  const ownedLive = ownedSessions.filter((session) => getLiveSessionPhase(session) === 'live');
  const ownedUpcoming = ownedSessions.filter((session) => getLiveSessionPhase(session) === 'upcoming');
  const liveSessions = [...ownedLive, ...liveNow];
  const upcomingSessions = [...ownedUpcoming, ...upcoming];
  const showEmptyCatalogue = !loading && !authUnavailable && !error && sessions.length === 0;
  const connectionCopy = authStatus === 'offline_authenticated'
    ? 'Live needs a connection before rooms can be opened or created.'
    : 'We are securely restoring your session. Ghana Meets has not been removed.';
  const openSession = (session: (typeof sessions)[number]) => {
    const phase = getLiveSessionPhase(session);
    if (phase !== 'live') {
      router.push({ pathname: '/live/event/[sessionId]', params: { sessionId: session.id } });
      return;
    }
    router.push({ pathname: '/live/[sessionId]', params: { sessionId: session.id } });
  };

  return (
    <LinearGradient colors={['#081513', '#0E211E', '#151A17']} style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to Circles" onPress={() => router.replace('/(tabs)/circles')} style={styles.iconButton}>
            <ArrowLeft size={22} color="#F8F1E7" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>BETWEENER LIVE</Text>
            <Text style={styles.heading}>{hasHostLobby ? 'Your Live Studio.' : 'Rooms with intention.'}</Text>
          </View>
          <Pressable accessibilityLabel="Refresh Live rooms" disabled={refreshing || recovering} onPress={() => void refresh()} style={styles.iconButton}>
            <RefreshCw size={19} color="#F8F1E7" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing || recovering} onRefresh={() => void refresh()} tintColor="#D7B56D" />}
        >
          <View style={[styles.intro, hasHostLobby && styles.hostIntro]}>
            <View style={styles.liveMark}><Radio size={18} color="#D7B56D" /></View>
            <Text style={styles.introTitle}>
              {hasHostLobby ? 'Create the room. Protect the tone.' : 'Hosted conversations. Warmer introductions.'}
            </Text>
            <Text style={styles.introBody}>
              {hasHostLobby
                ? 'Create, prepare, or rejoin a room from one private host lobby. Chemistry First is always your choice.'
                : 'Enter curated rooms where hosts protect the tone, audiences shape the pulse, and every stage seat has purpose.'}
            </Text>
          </View>
          {canSchedule ? (
            <View style={styles.studioCard}>
              <View style={styles.studioTopRow}>
                <View>
                  <Text style={styles.studioEyebrow}>PRIVATE HOST LOBBY</Text>
                  <Text style={styles.studioTitle}>A room begins with intention.</Text>
                </View>
                <View style={styles.studioCount}><Text style={styles.studioCountText}>{ownedSessions.length}</Text></View>
              </View>
              <Text style={styles.studioBody}>Choose the format, schedule the moment, and decide whether Chemistry First shapes the room.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/live/schedule')} style={styles.scheduleButton}>
                <Plus size={18} color="#102522" /><Text style={styles.scheduleText}>Create a Live room</Text>
              </Pressable>
            </View>
          ) : null}

          {loading && !sessions.length ? (
            <View style={styles.center}><ActivityIndicator color="#D7B56D" /></View>
          ) : null}
          {authUnavailable && !sessions.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{recovering ? 'Restoring your Live access…' : 'Reconnect to Live.'}</Text>
              <Text style={styles.emptyBody}>{connectionCopy}</Text>
              <Pressable disabled={recovering} onPress={() => void refresh()} style={styles.retryButton}>
                {recovering ? <ActivityIndicator size="small" color="#102522" /> : <Text style={styles.retryText}>Try again securely</Text>}
              </Pressable>
            </View>
          ) : error && !sessions.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Live rooms need a moment.</Text>
              <Text style={styles.emptyBody}>Your place is safe. Pull to refresh when the connection returns.</Text>
              <Pressable onPress={() => void refresh()} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
            </View>
          ) : null}

          {liveSessions.length ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Live now</Text>
                <Text style={styles.sectionMeta}>{liveSessions.length} open</Text>
              </View>
              {liveSessions.map((session) => (
                <LiveSessionCard
                  key={session.id}
                  session={session}
                  onPress={() => openSession(session)}
                />
              ))}
            </View>
          ) : null}

          {!authUnavailable && (!error || sessions.length > 0) ? <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Live</Text>
              <Text style={styles.sectionMeta}>{upcomingSessions.length ? `${upcomingSessions.length} upcoming` : 'On the horizon'}</Text>
            </View>
            {upcomingSessions.length ? upcomingSessions.map((session) => (
              <LiveSessionCard
                key={session.id}
                session={session}
                onPress={() => openSession(session)}
              />
            )) : showEmptyCatalogue ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{canSchedule ? 'Your studio is ready.' : 'The next room is being curated.'}</Text>
                <Text style={styles.emptyBody}>{canSchedule ? 'Create a room when the moment feels right.' : 'Live invitations will appear here when a verified host opens one for you.'}</Text>
              </View>
            ) : null}
          </View> : null}

          {past.length ? <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Past Live</Text>
              <Text style={styles.sectionMeta}>Your room history</Text>
            </View>
            {past.map((session) => <LiveSessionCard key={session.id} session={session} onPress={() => openSession(session)} />)}
          </View> : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#D7B56D', fontSize: 10, letterSpacing: 2, fontFamily: 'Manrope_800ExtraBold' },
  heading: { color: '#FFF7EC', fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 2 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#162724', borderWidth: 1, borderColor: '#304A45' },
  content: { paddingHorizontal: 18, paddingBottom: 56 },
  intro: { paddingVertical: 26, alignItems: 'center' },
  hostIntro: { paddingBottom: 20 },
  liveMark: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17332E', borderWidth: 1, borderColor: '#5B755D', marginBottom: 17 },
  introTitle: { color: '#FFF7EC', fontSize: 30, lineHeight: 37, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold', maxWidth: 340 },
  introBody: { color: '#9FB0AC', fontSize: 13, lineHeight: 21, textAlign: 'center', fontFamily: 'Manrope_500Medium', maxWidth: 350, marginTop: 12 },
  studioCard: { borderRadius: 26, borderWidth: 1, borderColor: '#4B5F50', backgroundColor: '#142824', padding: 19, gap: 12 },
  studioTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  studioEyebrow: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.6, fontFamily: 'Manrope_800ExtraBold' },
  studioTitle: { color: '#FFF7EC', fontSize: 20, marginTop: 4, fontFamily: 'PlayfairDisplay_700Bold' },
  studioCount: { minWidth: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#203B35', borderWidth: 1, borderColor: '#536C5B' },
  studioCountText: { color: '#E8D09A', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  studioBody: { color: '#9FB0AC', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium' },
  scheduleButton: { alignSelf: 'flex-start', minHeight: 46, borderRadius: 23, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#D7B56D', marginTop: 2 },
  scheduleText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  section: { gap: 14, marginTop: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#F6EFE5', fontSize: 18, fontFamily: 'Archivo_700Bold' },
  sectionMeta: { color: '#859793', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  center: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 24, padding: 22, backgroundColor: '#13211F', borderWidth: 1, borderColor: '#29403B' },
  emptyTitle: { color: '#F8F1E7', fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  emptyBody: { color: '#92A39F', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium', marginTop: 7 },
  retryButton: { alignSelf: 'flex-start', minHeight: 40, borderRadius: 20, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D', marginTop: 16 },
  retryText: { color: '#102522', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
});
