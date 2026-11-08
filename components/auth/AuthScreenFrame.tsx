import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

export const AUTH_PALETTE = {
  ink: '#172323',
  muted: Colors.light.textMuted,
  teal: Colors.light.tint,
  tealBright: '#0AA7A0',
  purple: Colors.light.accent,
  oat: Colors.light.background,
  line: Colors.light.outline,
  surface: 'rgba(255,255,255,0.91)',
  softTeal: 'rgba(0,128,128,0.08)',
  softPurple: 'rgba(125,91,166,0.09)',
} as const;

export function AuthScreenFrame({ children }: PropsWithChildren) {
  return (
    <LinearGradient
      colors={[AUTH_PALETTE.tealBright, AUTH_PALETTE.purple, AUTH_PALETTE.oat]}
      start={{ x: 0.08, y: 0.04 }}
      end={{ x: 0.95, y: 0.96 }}
      style={styles.gradient}
    >
      <View pointerEvents="none" style={styles.purpleGlow} />
      <View pointerEvents="none" style={styles.oatGlow} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.safeArea}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.panel}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  panel: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    padding: 24,
    backgroundColor: AUTH_PALETTE.surface,
    shadowColor: AUTH_PALETTE.ink,
    shadowOpacity: 0.17,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 7,
  },
  purpleGlow: {
    position: 'absolute',
    top: 90,
    left: '20%',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(125,91,166,0.2)',
  },
  oatGlow: {
    position: 'absolute',
    right: -70,
    bottom: -40,
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: 'rgba(255,245,234,0.4)',
  },
});
