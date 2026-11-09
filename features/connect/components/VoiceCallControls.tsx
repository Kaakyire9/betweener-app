import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import type { VoiceRoute, VoiceViewState } from '../voice/voice-types';
import { CallControlButton as Control } from './CallControlButton';

interface Props {
  state: VoiceViewState; onAccept(): void; onDecline(): void; onHangup(): void;
  onMute(): void; onRoute(route: VoiceRoute): void;
  compact?: boolean; leadingControls?: React.ReactNode;
}
const colors = Colors.dark;
const icons = { earpiece: 'phone-portrait-outline', speaker: 'volume-high-outline', bluetooth: 'bluetooth-outline', wired: 'headset-outline' } as const;
const labels: Record<VoiceRoute, string> = { earpiece: 'Phone', speaker: 'Speaker', bluetooth: 'Bluetooth', wired: 'Headphones' };
export function VoiceCallControls({ state, onAccept, onDecline, onHangup, onMute, onRoute, compact = false, leadingControls }: Props) {
  const [routesOpen, setRoutesOpen] = useState(false);
  if (['ENDED', 'FAILED', 'IDLE'].includes(state.phase)) return null;
  const invited = state.incoming && state.phase === 'RINGING';
  const media = ['ACTIVE', 'CONNECTING', 'RECONNECTING'].includes(state.phase);
  const selectedRoute = state.route && state.routes.includes(state.route) ? state.route : null;
  const output = media && <Control lounge={!compact} compact={compact} label={selectedRoute ? labels[selectedRoute] : 'Audio output'} icon={selectedRoute ? icons[selectedRoute] : 'volume-high-outline'} selected={!!selectedRoute && selectedRoute !== 'earpiece'} disabled={!state.routes.length || !state.foreground || (!!state.audioSetupStage && state.audioSetupStage !== 'ready')} onPress={() => setRoutesOpen(!routesOpen)} />;
  return <View style={styles.root}>
    {routesOpen && media && <View accessibilityLabel="Available audio outputs" style={styles.outputs}>
      {state.routes.map((route) => <Pressable key={route} accessibilityRole="radio" accessibilityLabel={`Use ${labels[route]}`}
        accessibilityState={{ checked: state.route === route }} onPress={() => { setRoutesOpen(false); onRoute(route); }} style={styles.output}>
        <Text style={styles.label}>{labels[route]}{state.route === route ? ' ✓' : ''}</Text>
      </Pressable>)}
    </View>}
    <View accessibilityLabel={compact ? 'Video call controls' : undefined} style={[styles.row, !compact && styles.audioRow, compact && !invited && styles.dock]}>
      {invited ? <>
        <Control lounge={!compact} label="Decline" icon="call-outline" danger onPress={onDecline} disabled={state.busy} />
        <Control lounge={!compact} displayLabel="Answer" label="Accept" icon="call" selected onPress={onAccept} disabled={state.busy} />
      </> : <>
        {leadingControls}
        {compact && output}
        {media && <Control lounge={!compact} compact={compact} label={state.muted ? 'Unmute' : 'Mute'} icon={state.muted ? 'mic-off-outline' : 'mic-outline'} selected={state.muted} onPress={onMute} disabled={!state.foreground || state.busy} />}
        {!compact && output}
        <Control lounge={!compact} compact={compact} displayLabel={state.phase === 'ENDING' ? 'Ending…' : undefined} label={media ? 'End call' : 'Cancel'} icon="call-outline" danger onPress={onHangup} disabled={state.phase === 'ENDING'} />
      </>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 18, width: '100%', alignItems: 'center' }, row: { flexDirection: 'row', gap: 16, justifyContent: 'center', flexWrap: 'wrap' },
  audioRow: { gap: 12 },
  dock: { flexWrap: 'nowrap', gap: 8, padding: 10, borderRadius: 40, backgroundColor: 'rgba(20,32,34,0.93)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  label: { color: colors.text, fontSize: 13, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  outputs: { width: '100%', maxWidth: 330, borderRadius: 20, backgroundColor: colors.backgroundSubtle, padding: 8 },
  output: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12 },
});
