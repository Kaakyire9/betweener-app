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
  if (!state.session || pathname.startsWith('/connect/voice') || pathname.startsWith('/connect/video')) return null;
  const media = state.session.media === 'video' ? 'video' : 'voice';
  const callPath = media === 'video' ? '/connect/video' as const : '/connect/voice' as const;
  const incoming = state.incoming && state.phase === 'RINGING';
  const finished = ['ENDING', 'ENDED', 'FAILED'].includes(state.phase);
  const ongoing = state.minimized && ['ACTIVE', 'CONNECTING', 'RECONNECTING'].includes(state.phase);
  const dismissible = controller.canDismissCompletedCall();
  if (!incoming && !finished && !ongoing) return null;
  return <View accessibilityLabel={ongoing ? 'Ongoing call notice' : incoming ? `Incoming ${media} call notice` : 'Call cleanup notice'} style={[styles.card, { top: insets.top + 12 }]}>
    <Text style={styles.title}>{ongoing ? `On a ${media} call with ${state.peer?.name || 'your connection'}` : incoming ? `${state.peer?.name || 'Your connection'} is calling` : dismissible ? `${media === 'video' ? 'Video' : 'Voice'} call ended` : 'Call status needs attention'}</Text>
    <Text style={styles.caption}>{ongoing ? 'Your conversation continues. Open the call to use its controls.' : incoming ? `${media === 'video' ? 'Video' : 'Voice'} call · camera off · E2EE unavailable in staging` : dismissible ? 'View the call result or dismiss this notice.' : 'Check local shutdown and call termination status.'}</Text>
    <View style={styles.row}>
      {ongoing && <Pressable accessibilityRole="button" accessibilityLabel="End minimized call" style={styles.button} onPress={() => { void controller.hangup(); }}><Text style={styles.caption}>End call</Text></Pressable>}
      {incoming && <Pressable accessibilityRole="button" accessibilityLabel={`Accept incoming ${media} call`} disabled={state.busy} onPress={() => {
        router.push({ pathname: callPath, params: { callId: state.session!.id } });
        void controller.accept();
      }} style={styles.button}><Text style={styles.action}>Accept</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${media} call`} onPress={() => router.push({ pathname: callPath, params: { callId: state.session!.id } })} style={styles.button}><Text style={styles.action}>{incoming ? 'View call' : 'View status'}</Text></Pressable>
      {incoming && <Pressable accessibilityRole="button" accessibilityLabel={`Decline incoming ${media} call`} onPress={() => { void controller.decline(); }} style={styles.button}><Text style={styles.caption}>Decline</Text></Pressable>}
      {!incoming && dismissible && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss completed call" onPress={() => { controller.dismissCompletedCall(); }} style={styles.button}><Text style={styles.action}>Done</Text></Pressable>}
    </View>
  </View>;
}
const styles = StyleSheet.create({ card: { position: 'absolute', left: 14, right: 14, padding: 18, gap: 9, borderRadius: 22, backgroundColor: Colors.dark.backgroundSubtle, borderWidth: 1, borderColor: Colors.dark.accent, zIndex: 2000, elevation: 12 },
  title: { color: Colors.dark.text, fontFamily: 'Manrope_600SemiBold', fontSize: 16 }, caption: { color: Colors.dark.textMuted, fontSize: 13 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  button: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' }, action: { color: Colors.dark.secondary, fontFamily: 'Manrope_600SemiBold' } });
