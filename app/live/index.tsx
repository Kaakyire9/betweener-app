import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, Plus, Radio, RefreshCw } from 'lucide-react-native';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LiveSessionCard } from '@/features/live/components/index.ts';
import { useLiveSessions } from '@/features/live/hooks/index.ts';

export default function LiveHomeScreen() {
  const { sessions, loading, error, canSchedule, refresh } = useLiveSessions();
  const liveNow = sessions.filter((session) => session.status === 'live');
  const upcoming = sessions.filter((session) => session.status !== 'live');

  return (
    <LinearGradient colors={['#081513', '#0E211E', '#151A17']} style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}>
            <ArrowLeft size={22} color="#F8F1E7" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>BETWEENER LIVE</Text>
            <Text style={styles.heading}>Rooms with intention.</Text>
          </View>
          <Pressable accessibilityLabel="Refresh Live rooms" onPress={() => void refresh()} style={styles.iconButton}>
            <RefreshCw size={19} color="#F8F1E7" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} tintColor="#D7B56D" />}
        >
          <View style={styles.intro}>
            <View style={styles.liveMark}><Radio size={18} color="#D7B56D" /></View>
            <Text style={styles.introTitle}>Hosted conversations. Warmer introductions.</Text>
            <Text style={styles.introBody}>
              Enter curated rooms where hosts protect the tone, audiences shape the pulse, and every stage seat has purpose.
            </Text>
          </View>
          {canSchedule ? (
            <Pressable onPress={() => router.push('/live/schedule')} style={styles.scheduleButton}>
              <Plus size={18} color="#102522" /><Text style={styles.scheduleText}>Schedule a curated room</Text>
            </Pressable>
          ) : null}

          {loading && !sessions.length ? (
            <View style={styles.center}><ActivityIndicator color="#D7B56D" /></View>
          ) : null}
          {error && !sessions.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Live rooms need a moment.</Text>
              <Text style={styles.emptyBody}>Your place is safe. Pull to refresh when the connection returns.</Text>
            </View>
          ) : null}

          {liveNow.length ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Live now</Text>
                <Text style={styles.sectionMeta}>{liveNow.length} open</Text>
              </View>
              {liveNow.map((session) => (
                <LiveSessionCard
                  key={session.id}
                  session={session}
                  onPress={() => router.push({ pathname: '/live/[sessionId]', params: { sessionId: session.id } })}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>On the horizon</Text>
              <Text style={styles.sectionMeta}>Public beta</Text>
            </View>
            {upcoming.length ? upcoming.map((session) => (
              <LiveSessionCard
                key={session.id}
                session={session}
                onPress={() => router.push({ pathname: '/live/[sessionId]', params: { sessionId: session.id } })}
              />
            )) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>The next room is being curated.</Text>
                <Text style={styles.emptyBody}>Live invitations will appear here when a verified host opens one for you.</Text>
              </View>
            )}
          </View>
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
  liveMark: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17332E', borderWidth: 1, borderColor: '#5B755D', marginBottom: 17 },
  introTitle: { color: '#FFF7EC', fontSize: 30, lineHeight: 37, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold', maxWidth: 340 },
  introBody: { color: '#9FB0AC', fontSize: 13, lineHeight: 21, textAlign: 'center', fontFamily: 'Manrope_500Medium', maxWidth: 350, marginTop: 12 },
  scheduleButton: { alignSelf: 'center', minHeight: 46, borderRadius: 23, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#D7B56D' },
  scheduleText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  section: { gap: 14, marginTop: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#F6EFE5', fontSize: 18, fontFamily: 'Archivo_700Bold' },
  sectionMeta: { color: '#859793', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  center: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 24, padding: 22, backgroundColor: '#13211F', borderWidth: 1, borderColor: '#29403B' },
  emptyTitle: { color: '#F8F1E7', fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  emptyBody: { color: '#92A39F', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_500Medium', marginTop: 7 },
});
