import { usePathname, useRouter } from 'expo-router';
import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import type { VoiceController } from '../voice/voice-controller';

/** Foreground app notice only; does not register an OS calling service. */
export function ConnectIncomingNotice({ controller }: { controller: VoiceController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const router = useRouter(), pathname = usePathname(), insets = useSafeAreaInsets();
  if (!state.session || pathname.startsWith('/connect/voice')) return null;
  const incoming = state.incoming && state.phase === 'RINGING';
  const finished = ['ENDING', 'ENDED', 'FAILED'].includes(state.phase);
  const dismissible = controller.canDismissCompletedCall();
  if (!incoming && !finished) return null;
  return <View accessibilityLabel={incoming ? 'Incoming voice call notice' : 'Call cleanup notice'} style={[styles.card, { top: insets.top + 12 }]}>
    <Text style={styles.title}>{incoming ? `${state.peer?.name || 'Your connection'} is calling` : dismissible ? 'Voice call ended' : 'Call status needs attention'}</Text>
    <Text style={styles.caption}>{incoming ? 'Voice call · camera off' : dismissible ? 'View the call result or dismiss this notice.' : 'Check local shutdown and call termination status.'}</Text>
    <View style={styles.row}>
      {incoming && <Pressable accessibilityRole="button" accessibilityLabel="Accept incoming voice call" disabled={state.busy} onPress={() => {
        router.push({ pathname: '/connect/voice', params: { callId: state.session!.id } });
        void controller.accept();
      }} style={styles.button}><Text style={styles.action}>Accept</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="View voice call" onPress={() => router.push({ pathname: '/connect/voice', params: { callId: state.session!.id } })} style={styles.button}><Text style={styles.action}>{incoming ? 'View call' : 'View status'}</Text></Pressable>
      {incoming && <Pressable accessibilityRole="button" accessibilityLabel="Decline incoming voice call" onPress={() => { void controller.decline(); }} style={styles.button}><Text style={styles.caption}>Decline</Text></Pressable>}
      {!incoming && dismissible && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss completed call" onPress={() => { controller.dismissCompletedCall(); }} style={styles.button}><Text style={styles.action}>Done</Text></Pressable>}
    </View>
  </View>;
}
const styles = StyleSheet.create({ card: { position: 'absolute', left: 14, right: 14, padding: 18, gap: 9, borderRadius: 22, backgroundColor: Colors.dark.backgroundSubtle, borderWidth: 1, borderColor: Colors.dark.accent, zIndex: 2000, elevation: 12 },
  title: { color: Colors.dark.text, fontFamily: 'Manrope_600SemiBold', fontSize: 16 }, caption: { color: Colors.dark.textMuted, fontSize: 13 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  button: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' }, action: { color: Colors.dark.secondary, fontFamily: 'Manrope_600SemiBold' } });
