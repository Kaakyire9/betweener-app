import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
export function ConnectStatusScreen({ title = 'Voice, when you’re ready', message = 'Calling is not available yet.', onClose }: { title?: string; message?: string; onClose(): void }) {
  return <SafeAreaView style={styles.root}><View style={styles.content}>
    <Text style={styles.brand}>BETWEENER CONNECT</Text><Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Close Connect" onPress={onClose} style={styles.button}><Text style={styles.action}>Back</Text></Pressable>
  </View></SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: Colors.dark.background }, content: { flex: 1, padding: 28, gap: 22, justifyContent: 'center', alignItems: 'center' },
  brand: { color: Colors.dark.secondary, letterSpacing: 2, fontFamily: 'Manrope_600SemiBold', fontSize: 12 }, title: { color: Colors.dark.text, fontFamily: 'Manrope_600SemiBold', fontSize: 29, textAlign: 'center' },
  message: { color: Colors.dark.textMuted, lineHeight: 23, textAlign: 'center', maxWidth: 320 }, button: { minHeight: 48, borderRadius: 24, paddingHorizontal: 30, justifyContent: 'center', backgroundColor: Colors.dark.backgroundSubtle }, action: { color: Colors.dark.secondary, fontFamily: 'Manrope_600SemiBold' } });
