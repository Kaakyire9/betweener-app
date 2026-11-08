import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import type { VoiceViewState } from '../voice/voice-types';
export function CallContinuityControls({ state, onBackgroundAudio, onMinimize }: {
  state: VoiceViewState; onBackgroundAudio?(): void; onMinimize?(): void;
}) {
  if (state.phase !== 'ACTIVE') return null;
  return <View style={styles.root}>
    {onBackgroundAudio && <Pressable accessibilityRole="switch" accessibilityLabel="Continue audio in background"
      accessibilityState={{ checked: state.backgroundAudio === 'enabled', disabled: state.backgroundAudio === 'starting' }}
      disabled={state.backgroundAudio === 'starting'} style={styles.button} onPress={onBackgroundAudio}>
      <Text style={styles.link}>{state.backgroundAudio === 'starting' ? 'Preparing background audio…'
        : state.backgroundAudio === 'enabled' ? 'Background audio on' : 'Continue audio in background'}</Text>
    </Pressable>}
    {onMinimize && <Pressable accessibilityRole="button" accessibilityLabel="Minimize call" onPress={onMinimize} style={styles.button}><Text style={styles.link}>Return to chat</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({ root: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, link: { color: Colors.dark.secondary, fontSize: 13 } });
