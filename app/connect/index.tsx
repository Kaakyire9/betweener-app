import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useConnectProduct } from '@/features/connect/components/ConnectProductProvider';
import { ConnectStatusScreen } from '@/features/connect/components/ConnectStatusScreen';
import type { ConnectSession } from '@/features/connect/domain/connect';
import type { ConnectProduct } from '@/features/connect/application/product-coordinator';
export default function ConnectInboxRoute() {
  const context = useConnectProduct(), router = useRouter();
  const [history, setHistory] = useState<{ product: ConnectProduct | null; rows: { call: ConnectSession; name: string }[]; error: string | null }>({ product: null, rows: [], error: null });
  const rows = history.product === context.product ? history.rows : [];
  const error = history.product === context.product ? history.error : null;
  useEffect(() => {
    let current = true;
    const product = context.product;
    if (!product) return;
    void product.services.api.getHistory(null, 20).then(async calls => {
      const result = await Promise.all(calls.map(async call => {
        const candidate = product.selfProfileId === call.caller_profile_id ? call.recipient_profile_id : call.caller_profile_id;
        const peer = await product.services.peer(candidate).catch(() => null);
        return { call, name: peer?.name || 'Your connection' };
      }));
      if (current) setHistory({ product, rows: result, error: null });
    }).catch(() => { if (current) setHistory({ product, rows: [], error: 'Call history is unavailable.' }); });
    return () => { current = false; };
  }, [context.product]);
  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/intent');
  if (!context.ui || context.status !== 'ready') return <ConnectStatusScreen onClose={close} />;
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.brand}>BETWEENER CONNECT</Text><Text accessibilityRole="header" style={styles.title}>Your conversations</Text>
    <Text style={styles.subtitle}>A voice can make the distance feel smaller.</Text>
    {error && <Text accessibilityRole="alert" style={styles.subtitle}>{error}</Text>}
    {!rows.length && !error && <Text style={styles.subtitle}>Start a voice invitation from an eligible conversation.</Text>}
    {rows.map(({ call, name }) => <Pressable accessibilityRole="button" accessibilityLabel={`View voice call with ${name}`} key={call.id} style={styles.card} onPress={() => router.push({ pathname: '/connect/voice', params: { callId: call.id } })}>
      <Text style={styles.name}>{name}</Text><Text style={styles.subtitle}>{call.state === 'RINGING' ? 'Voice invitation' : call.state === 'MISSED' ? 'Missed voice call' : 'Voice call'} · {new Date(call.created_at).toLocaleDateString()}</Text>
    </Pressable>)}
    <Pressable accessibilityRole="button" onPress={close} style={styles.card}><Text style={styles.name}>Back</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: Colors.dark.background }, content: { padding: 26, gap: 20 }, brand: { color: Colors.dark.secondary, letterSpacing: 2, fontSize: 12 },
  title: { color: Colors.dark.text, fontFamily: 'Manrope_600SemiBold', fontSize: 31 }, subtitle: { color: Colors.dark.textMuted, fontSize: 14, lineHeight: 22 },
  card: { padding: 20, gap: 8, backgroundColor: Colors.dark.backgroundSubtle, borderRadius: 22, minHeight: 60 }, name: { color: Colors.dark.text, fontFamily: 'Manrope_600SemiBold', fontSize: 17 } });
