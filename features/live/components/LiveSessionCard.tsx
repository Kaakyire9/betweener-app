import { LinearGradient } from 'expo-linear-gradient';
import { Radio, Users } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveSessionSummary } from '../application/index.ts';

const sessionTime = (value: string | null) => {
  if (!value) return 'Time to be announced';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
};

export const LiveSessionCard = memo(function LiveSessionCard({
  session,
  onPress,
}: { session: LiveSessionSummary; onPress: () => void }) {
  const isLive = session.status === 'live';
  return (
    <Pressable onPress={onPress} style={styles.shell} accessibilityRole="button">
      <LinearGradient
        colors={isLive ? ['#123B37', '#172821'] : ['#182725', '#111B1A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.topRow}>
          <View style={[styles.status, isLive && styles.liveStatus]}>
            <Radio size={13} color={isLive ? '#0C2825' : '#D7B56D'} />
            <Text style={[styles.statusText, isLive && styles.liveStatusText]}>
              {isLive ? 'LIVE NOW' : sessionTime(session.scheduledStart).toUpperCase()}
            </Text>
          </View>
          <View style={styles.count}>
            <Users size={14} color="#9EB0AC" />
            <Text style={styles.countText}>{session.audienceCount + session.stageCount}</Text>
          </View>
        </View>
        <Text style={styles.title}>{session.title}</Text>
        <Text numberOfLines={2} style={styles.description}>
          {session.description || 'A hosted room for warmer introductions and intentional conversation.'}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.meta}>{session.stageCount}/{session.maximumPublishers} on stage</Text>
          <Text style={styles.cta}>{isLive ? 'Enter room  →' : session.rsvpStatus === 'going' ? 'You’re going  ✓' : 'View invitation  →'}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  shell: { borderRadius: 28, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  card: { minHeight: 220, borderRadius: 28, borderWidth: 1, borderColor: '#31504A', padding: 21, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { minHeight: 30, borderRadius: 15, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#806F4A', backgroundColor: '#2A2B21' },
  liveStatus: { backgroundColor: '#D7B56D', borderColor: '#E4C988' },
  statusText: { color: '#E5D09E', fontSize: 9, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' },
  liveStatusText: { color: '#0C2825' },
  count: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  countText: { color: '#B7C5C1', fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  title: { color: '#FFF7EB', fontSize: 29, lineHeight: 35, marginTop: 28, fontFamily: 'PlayfairDisplay_700Bold' },
  description: { color: '#B7C5C1', fontSize: 13, lineHeight: 20, marginTop: 9, fontFamily: 'Manrope_500Medium' },
  footer: { marginTop: 'auto', paddingTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { color: '#82938F', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  cta: { color: '#E3C783', fontSize: 12, fontFamily: 'Manrope_700Bold' },
});

