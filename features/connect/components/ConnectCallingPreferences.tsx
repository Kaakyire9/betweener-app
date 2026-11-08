import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnectProduct } from './ConnectProductProvider';
import type { ConnectProduct } from '../application/product-coordinator';
import { useCallingPreferences } from '../hooks/use-calling-preferences';

export function ConnectCallingPreferences() {
  const c = useConnectProduct();
  if (!c.ui || c.status !== 'ready' || !c.product) return null;
  return <BoundPreferences key={c.product.authGeneration} product={c.product} />;
}
function BoundPreferences({ product }: { product: ConnectProduct }) {
  const dark = useColorScheme() === 'dark';
  const { value, busy, error, refresh, setVoice, setVideo } = useCallingPreferences(product.services.preferences);
  const color = dark ? '#F4EEE7' : '#173C3F';
  return <View style={[styles.root, { backgroundColor: dark ? '#123239' : '#EDF5F1' }]}>
    <Text style={[styles.title, { color }]}>Your calling preferences</Text>
    <View style={styles.row}><Text style={[styles.text, { color }]}>Allow eligible voice invitations</Text><Switch accessibilityLabel="Allow eligible voice invitations" disabled={!value || busy}
      value={value?.voice ?? false} onValueChange={v => { void setVoice(v); }} trackColor={{ true: '#138F91' }} /></View>
    {product.flags?.videoCalling === true && <View style={styles.row}><Text style={[styles.text, { color }]}>Allow eligible video invitations</Text><Switch accessibilityLabel="Allow eligible video invitations" disabled={!value || busy}
      value={value?.video ?? false} onValueChange={v => { void setVideo(v); }} trackColor={{ true: '#138F91' }} /></View>}
    <Text style={[styles.text, { color }]}>A verified match or your separate, explicit Intent approval is still required. {product.flags?.videoCalling === true ? 'Voice and video permissions are separate. Your camera starts only when you turn it on.' : 'Video stays off in this milestone.'}</Text>
    {error && <Text accessibilityRole="alert" style={[styles.text, { color }]}>Preferences could not be confirmed. No saved change is assumed.</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void refresh(); }} style={styles.refresh}><Text style={{ color }}>Refresh calling preferences</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ root: { padding: 16, borderRadius: 20, gap: 10, marginVertical: 10 }, title: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, text: { fontSize: 13, lineHeight: 20, flexShrink: 1 }, refresh: { minHeight: 44, justifyContent: 'center' } });
