import React, { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { ChatBackground } from '@/components/chat/ChatBackground';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Shares the conversation wallpaper, with a stable dark surface for call readability. */
export const AudioCallCanvas = memo(function AudioCallCanvas({ children }: { children: React.ReactNode }) {
  const tone = useColorScheme() === 'dark' ? 'dark' : 'light';
  return <View style={styles.root}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <ChatBackground tone={tone} intensity="subtle" />
    </View>
    <LinearGradient pointerEvents="none" accessible={false} colors={tone === 'dark'
      ? ['rgba(0,25,27,0.45)', 'rgba(0,28,30,0.24)', 'rgba(0,17,20,0.88)']
      : ['rgba(0,27,30,0.88)', 'rgba(0,34,36,0.80)', 'rgba(0,17,20,0.96)']}
      style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" accessible={false} style={styles.decoration}>
      <View style={[styles.orbit, styles.tealOrbit]} />
      <View style={[styles.orbit, styles.lilacOrbit]} />
    </View>
    {children}
  </View>;
});
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#001A1D' }, decoration: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  orbit: { position: 'absolute', width: 740, height: 320, borderRadius: 400, borderWidth: 1, transform: [{ rotate: '-28deg' }] },
  tealOrbit: { top: '32%', left: '-65%', borderColor: 'rgba(93,226,222,0.16)', backgroundColor: 'rgba(0,148,148,0.035)' },
  lilacOrbit: { top: '49%', right: '-70%', borderColor: 'rgba(194,159,240,0.16)', backgroundColor: 'rgba(155,124,200,0.025)' },
});
