import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import type { VoiceRoute, VoiceViewState } from '../voice/voice-types';

interface Props {
  state: VoiceViewState; onAccept(): void; onDecline(): void; onHangup(): void;
  onMute(): void; onRoute(route: VoiceRoute): void;
}
const colors = Colors.dark;
const labels: Record<VoiceRoute, string> = { earpiece: 'Phone', speaker: 'Speaker', bluetooth: 'Bluetooth', wired: 'Headphones' };
function Control({ label, icon, onPress, danger = false, selected = false, disabled = false }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress(): void; danger?: boolean; selected?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }}
    disabled={disabled} onPress={onPress} style={[styles.control, danger && styles.danger, selected && styles.selected, disabled && styles.disabled]}>
    <Ionicons name={icon} color={colors.text} size={25} /><Text style={styles.label}>{label}</Text>
  </Pressable>;
}
export function VoiceCallControls({ state, onAccept, onDecline, onHangup, onMute, onRoute }: Props) {
  const [routesOpen, setRoutesOpen] = useState(false);
  if (['ENDED', 'FAILED', 'IDLE'].includes(state.phase)) return null;
  const invited = state.incoming && state.phase === 'RINGING';
  const media = ['ACTIVE', 'CONNECTING', 'RECONNECTING'].includes(state.phase);
  return <View style={styles.root}>
    {routesOpen && media && <View accessibilityLabel="Available audio outputs" style={styles.outputs}>
      {state.routes.map((route) => <Pressable key={route} accessibilityRole="radio" accessibilityLabel={`Use ${labels[route]}`}
        accessibilityState={{ checked: state.route === route }} onPress={() => { setRoutesOpen(false); onRoute(route); }} style={styles.output}>
        <Text style={styles.label}>{labels[route]}{state.route === route ? ' ✓' : ''}</Text>
      </Pressable>)}
    </View>}
    <View style={styles.row}>
      {invited ? <>
        <Control label="Decline" icon="call-outline" danger onPress={onDecline} disabled={state.busy} />
        <Control label="Accept" icon="call" selected onPress={onAccept} disabled={state.busy} />
      </> : <>
        {media && <Control label={state.muted ? 'Unmute' : 'Mute'} icon={state.muted ? 'mic-off-outline' : 'mic-outline'} selected={state.muted} onPress={onMute} disabled={!state.foreground || state.busy} />}
        <Control label={media ? 'End call' : 'Cancel'} icon="call-outline" danger onPress={onHangup} disabled={state.phase === 'ENDING'} />
        {media && <Control label={state.routes.includes(state.route) ? labels[state.route] : 'Audio output'} icon="volume-high-outline" selected={state.route === 'speaker'} disabled={!state.routes.length || !state.foreground || (!!state.audioSetupStage && state.audioSetupStage !== 'ready')} onPress={() => setRoutesOpen(!routesOpen)} />}
      </>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 18, width: '100%', alignItems: 'center' }, row: { flexDirection: 'row', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  control: { minWidth: 82, minHeight: 82, borderRadius: 28, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.backgroundSubtle, borderWidth: 1, borderColor: colors.outline },
  danger: { backgroundColor: '#9F343F', borderColor: colors.danger }, selected: { backgroundColor: colors.tint, borderColor: colors.secondary },
  disabled: { opacity: 0.45 }, label: { color: colors.text, fontSize: 13, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  outputs: { width: '100%', maxWidth: 330, borderRadius: 20, backgroundColor: colors.backgroundSubtle, padding: 8 },
  output: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12 },
});
