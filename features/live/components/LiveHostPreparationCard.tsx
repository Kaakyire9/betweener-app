import { Camera, Check, Mic, Settings2, Share2 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveSessionSummary } from '../application/index.ts';

export function LiveHostPreparationCard({
  session,
  onOpenBackstage,
  onManage,
  onShare,
}: {
  session: LiveSessionSummary;
  onOpenBackstage: () => void;
  onManage: () => void;
  onShare: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View><Text style={styles.eyebrow}>HOST PREPARATION</Text><Text style={styles.title}>Your room is held.</Text></View>
        <View style={styles.ready}><Check size={13} color="#102522" /><Text style={styles.readyText}>SCHEDULED</Text></View>
      </View>
      <Text style={styles.copy}>Enter private backstage to check the frame, microphone, connection, and room plan before guests see you.</Text>
      <View style={styles.readiness}>
        <View style={styles.readinessItem}><Camera size={16} color="#D7B56D" /><Text style={styles.readinessText}>Private camera preview</Text></View>
        <View style={styles.readinessItem}><Mic size={16} color="#D7B56D" /><Text style={styles.readinessText}>Mic and connection check</Text></View>
      </View>
      {session.scheduleRevision > 0 ? <Text style={styles.revision}>Schedule revision {session.scheduleRevision} · Guests were asked to reconfirm.</Text> : null}
      <Pressable onPress={onOpenBackstage} style={styles.primary}><Text style={styles.primaryText}>Open private backstage</Text></Pressable>
      <View style={styles.actions}>
        <Pressable onPress={onShare} style={styles.secondary}><Share2 size={16} color="#D7B56D" /><Text style={styles.secondaryText}>Share</Text></Pressable>
        <Pressable onPress={onManage} style={styles.secondary}><Settings2 size={16} color="#D7B56D" /><Text style={styles.secondaryText}>Manage</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 25, padding: 18, backgroundColor: '#132622', borderWidth: 1, borderColor: '#75633F' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: '#D7B56D', fontSize: 8, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: '#FFF7EC', fontSize: 23, marginTop: 3, fontFamily: 'PlayfairDisplay_700Bold' },
  ready: { minHeight: 26, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#D7B56D' },
  readyText: { color: '#102522', fontSize: 7, letterSpacing: 0.8, fontFamily: 'Manrope_800ExtraBold' },
  copy: { color: '#AFC0BC', fontSize: 10, lineHeight: 17, marginTop: 10, fontFamily: 'Manrope_500Medium' },
  readiness: { borderRadius: 17, padding: 13, marginTop: 14, gap: 10, backgroundColor: '#0D1E1B' },
  readinessItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  readinessText: { color: '#D7E1DE', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  revision: { color: '#E7CD91', fontSize: 9, lineHeight: 14, marginTop: 11, fontFamily: 'Manrope_700Bold' },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 15, backgroundColor: '#D7B56D' },
  primaryText: { color: '#102522', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 9 },
  secondary: { flex: 1, minHeight: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#3F5851' },
  secondaryText: { color: '#F0E9DE', fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
});
