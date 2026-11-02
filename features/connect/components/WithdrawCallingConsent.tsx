import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

export function WithdrawCallingConsent({ withdraw }: { withdraw(): Promise<void> }) {
  const [confirm, setConfirm] = useState(false), [status, setStatus] = useState<'idle' | 'pending' | 'saved' | 'failed'>('idle');
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current) return;
    pending.current = true; setStatus('pending'); setConfirm(false);
    try { await withdraw(); setStatus('saved'); } catch { setStatus('failed'); }
    finally { pending.current = false; }
  };
  return <View style={styles.root}>
    {status === 'idle' || status === 'failed' ? <Pressable accessibilityRole="button" accessibilityLabel="Turn off calling invitations"
      style={styles.button} onPress={() => setConfirm(true)}><Text style={styles.text}>Turn off calling invitations</Text></Pressable> : null}
    {confirm && <>
      <Text style={styles.text}>End this call and turn off voice and video invitations for your account? You can change them later in calling settings.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Confirm withdrawal of calling consent" onPress={() => { void submit(); }} style={styles.button}><Text style={styles.danger}>End and turn off invitations</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Keep calling invitations" onPress={() => setConfirm(false)} style={styles.button}><Text style={styles.text}>Keep invitations</Text></Pressable>
    </>}
    {status !== 'idle' && <Text accessibilityLiveRegion="polite" style={styles.text}>{status === 'saved' ? 'Calling invitations are off for your account.'
      : status === 'pending' ? 'Saving your calling preferences…' : 'Your calling preference change has not been confirmed. Try again when connected.'}</Text>}
  </View>;
}
const styles = StyleSheet.create({ root: { gap: 8 }, button: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' },
  text: { color: Colors.dark.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' }, danger: { color: Colors.dark.danger, fontSize: 14 } });
