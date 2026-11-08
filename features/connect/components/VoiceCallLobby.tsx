import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { VoicePeer } from '../voice/voice-types';
import type { ConnectMedia } from '../domain/connect';
import { CallPrivacyNotice } from './CallPrivacyNotice';
import { AudioCallCanvas } from './AudioCallCanvas';
import { AudioCallBrand, AudioCallIdentity } from './AudioCallIdentity';
import { AudioCallPortrait } from './AudioCallPortrait';

export function VoiceCallLobby({ peer, eligible, pending, error, setup, onStart, onClose, media = 'voice', encryptionRequired = false }: {
  encryptionRequired?: boolean; media?: ConnectMedia;
  peer: VoicePeer | null; eligible: boolean; pending: boolean; error: string | null; setup?: React.ReactNode; onStart(): void; onClose(): void;
}) {
  const video = media === 'video';
  return <AudioCallCanvas><SafeAreaView style={styles.fill}>
    <ScrollView contentContainerStyle={styles.content}>
      <AudioCallBrand />
      <AudioCallIdentity name={peer?.name || 'Your connection'} status={pending ? 'Preparing your invitation…' : video ? 'Video call' : 'Voice call'} />
      <AudioCallPortrait key={peer?.profileId} peer={peer} phase="IDLE" screenActive={false} motionAllowed={false} />
      <Text accessibilityLiveRegion="polite" style={styles.note}>{pending ? `Checking ${media} calling permission…` : eligible
        ? video ? 'Your camera opens when you start. Only you can see the preview until they answer.' : 'They’ll choose whether to answer. Your camera stays off.'
        : error || `${video ? 'Video' : 'Voice'} calling is not available for this connection.`}</Text>
      {setup}
      <CallPrivacyNotice required={encryptionRequired} />
    </ScrollView>
    <View style={styles.dock}><View style={styles.tray}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Start ${media} call`} accessibilityState={{ disabled: !eligible || pending }}
        disabled={!eligible || pending} onPress={onStart} style={[styles.start, (!eligible || pending) && styles.disabled]}>
        <Ionicons accessible={false} name={video ? 'videocam' : 'call'} size={23} color="#E3F0E7" /><Text style={styles.action}>{video ? 'Video call' : 'Voice call'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${media} invitation`} onPress={onClose} style={styles.back}><Text style={styles.note}>Not now</Text></Pressable>
    </View></View>
  </SafeAreaView></AudioCallCanvas>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, content: { flexGrow: 1, width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 18, alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  dock: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 16, paddingTop: 8 },
  tray: { width: '100%', alignItems: 'center', borderRadius: 32, padding: 16, borderWidth: 1, borderColor: 'rgba(130,217,212,0.30)', backgroundColor: 'rgba(24,60,64,0.72)' },
  note: { color: '#AFC9C2', fontSize: 13, lineHeight: 21, textAlign: 'center' },
  start: { minHeight: 58, width: '100%', borderRadius: 28, backgroundColor: '#008B8B', flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  action: { color: '#E3F0E7', fontSize: 16, fontFamily: 'Manrope_600SemiBold' }, back: { minHeight: 44, justifyContent: 'center' }, disabled: { opacity: 0.4 },
});
