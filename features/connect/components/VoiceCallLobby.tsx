import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import type { VoicePeer } from '../voice/voice-types';

export function VoiceCallLobby({ peer, eligible, pending, error, setup, onStart, onClose }: {
  peer: VoicePeer | null; eligible: boolean; pending: boolean; error: string | null; setup?: React.ReactNode; onStart(): void; onClose(): void;
}) {
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.brand}>BETWEENER CONNECT</Text>
    <View style={styles.identity}>{peer?.avatar ? <Image source={{ uri: peer.avatar }} style={styles.avatar} contentFit="cover" /> : <View style={[styles.avatar, styles.initial]}><Text style={styles.letter}>{peer?.name.charAt(0) || 'B'}</Text></View>}
      <Text accessibilityRole="header" style={styles.name}>{peer?.name || 'Your connection'}</Text>
      <Text style={styles.copy}>Make space for a real conversation.</Text>
      <Text accessibilityLiveRegion="polite" style={styles.note}>{pending ? 'Checking voice calling permission…' : eligible ? 'They’ll choose whether to answer. Your camera stays off.' : error || 'Voice calling is not available for this connection.'}</Text>
    </View>
    {setup}
    <Pressable accessibilityRole="button" accessibilityLabel="Start voice call" accessibilityState={{ disabled: !eligible || pending }} disabled={!eligible || pending} onPress={onStart} style={[styles.start, (!eligible || pending) && styles.disabled]}>
      <Ionicons name="call" size={23} color={Colors.dark.text} /><Text style={styles.action}>Voice call</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel voice invitation" onPress={onClose} style={styles.back}><Text style={styles.note}>Not now</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: Colors.dark.background }, content: { flexGrow: 1, padding: 30, alignItems: 'center', gap: 20 },
  brand: { color: Colors.dark.secondary, fontSize: 12, letterSpacing: 2, fontFamily: 'Manrope_600SemiBold', marginTop: 15 }, identity: { flexGrow: 1, minHeight: 240, justifyContent: 'center', alignItems: 'center', gap: 18 },
  avatar: { width: 130, height: 130, borderRadius: 65, borderWidth: 2, borderColor: Colors.dark.accent }, initial: { backgroundColor: Colors.dark.backgroundSubtle, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 46, color: Colors.dark.secondary, fontFamily: 'Manrope_600SemiBold' }, name: { fontSize: 30, color: Colors.dark.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  copy: { fontSize: 17, color: Colors.dark.text, textAlign: 'center' }, note: { color: Colors.dark.textMuted, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  start: { minHeight: 60, width: '100%', maxWidth: 340, borderRadius: 30, backgroundColor: Colors.dark.tint, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  action: { color: Colors.dark.text, fontSize: 17, fontFamily: 'Manrope_600SemiBold' }, back: { minHeight: 48, justifyContent: 'center' }, disabled: { opacity: 0.4 } });
