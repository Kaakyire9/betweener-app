import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import type { ConnectProduct } from '../application/product-coordinator';
import { useCallingPreferences } from '../hooks/use-calling-preferences';

/** Both participants act through their own authenticated session; reads never grant consent. */
export function ConnectVoiceSetup({ product, peerId, matched, onEligibility }: {
  product: ConnectProduct; peerId: string; matched: boolean; onEligibility(eligible: boolean): void;
}) {
  const { value: preferences, busy: preferencesBusy, error: preferencesError, refresh: refreshPreferences, setVoice }
    = useCallingPreferences(product.services.preferences, { autoLoad: false });
  const [verified, setVerified] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const mounted = useRef(false), mutation = useRef(false), sequence = useRef(0);
  const load = useCallback(async () => {
    const read = ++sequence.current;
    try {
      const [prefs, proof] = await Promise.all([refreshPreferences(), matched ? product.services.relationship.verified(peerId) : Promise.resolve(true)]);
      if (!prefs) throw new Error('connect_unavailable');
      if (!mounted.current || read !== sequence.current) return;
      setVerified(proof); setError(false);
      if (matched && !proof) onEligibility(false);
    } catch {
      if (mounted.current && read === sequence.current) { setVerified(null); setError(true); onEligibility(false); }
    }
  }, [matched, onEligibility, peerId, product, refreshPreferences]);
  useEffect(() => {
    mounted.current = true; void load();
    const timer = setInterval(() => { if (!mutation.current) void load(); }, 5000);
    return () => { mounted.current = false; ++sequence.current; clearInterval(timer); };
  }, [load]);
  const change = async (command: () => Promise<unknown>, reload = true) => {
    if (mutation.current) return;
    mutation.current = true; ++sequence.current; setBusy(true); setError(false);
    try { await command(); if (mounted.current && reload) await load(); }
    catch { if (mounted.current) { setError(true); onEligibility(false); } }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={styles.card}>
    <View style={styles.row}><Text style={styles.text}>Allow voice invitations</Text><Switch accessibilityLabel="Allow voice invitations in this account"
      value={preferences?.voice ?? false} disabled={!preferences || busy || preferencesBusy} onValueChange={voice => {
        if (preferences) void change(async () => {
          if (!await setVoice(voice)) throw Error('connect_unavailable');
          if (mounted.current && !voice) onEligibility(false);
        }, false);
      }} /></View>
    <Text style={styles.note}>You choose whether to answer each call. Your camera stays off.</Text>
    {matched && verified === false && <>
      <Text style={styles.text}>{waiting ? 'Waiting for the other person to confirm.' : 'Both of you need to confirm this connection before your first voice call.'}</Text>
      {!waiting && <Pressable accessibilityRole="button" accessibilityLabel="Confirm this connection for calling" disabled={busy}
        style={styles.button} onPress={() => { void change(async () => {
          const complete = await product.services.relationship.confirm(peerId);
          if (mounted.current) setWaiting(!complete);
        }); }}><Text style={styles.action}>Confirm this connection</Text></Pressable>}
      <Text style={styles.note}>The other person can open the phone button in this chat to confirm from their account.</Text>
    </>}
    {(error || preferencesError) && <Text accessibilityRole="alert" style={styles.note}>Your calling settings could not be confirmed. Refresh before trying again.</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="Refresh voice calling setup" disabled={busy} style={styles.button} onPress={() => { void load(); }}><Text style={styles.action}>Refresh calling setup</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ card: { width: '100%', padding: 16, borderRadius: 20, gap: 10, backgroundColor: Colors.dark.backgroundSubtle },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, text: { color: Colors.dark.text, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  note: { color: Colors.dark.textMuted, fontSize: 13, lineHeight: 19 }, button: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 }, action: { color: Colors.dark.secondary, fontSize: 14 } });
