import * as Clipboard from 'expo-clipboard';
import { ShieldCheck, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  liveStepUpErrorMessage,
  prepareLiveStepUp,
  verifyLiveStepUp,
  type LiveStepUpPreparation,
} from '../security/live-step-up.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const qrSvg = (value: string) => {
  const prefix = 'data:image/svg+xml;utf-8,';
  if (!value.startsWith(prefix)) return value;
  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return value.slice(prefix.length);
  }
};

export function LiveStepUpSheet({
  visible,
  actionLabel,
  onCancel,
  onVerified,
}: {
  visible: boolean;
  actionLabel: string;
  onCancel: () => void;
  onVerified: () => Promise<void> | void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [preparation, setPreparation] = useState<LiveStepUpPreparation | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparationAttempt, setPreparationAttempt] = useState(0);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  useEffect(() => {
    if (!visible) {
      setPreparation(null);
      setCode('');
      setError(null);
      setBusy(false);
      return;
    }

    let active = true;
    setPreparation(null);
    setError(null);
    setBusy(true);
    void prepareLiveStepUp().then(async (next) => {
      if (!active) return;
      if (next.kind === 'satisfied') {
        await onVerifiedRef.current();
        return;
      }
      setPreparation(next);
    }).catch((nextError) => {
      if (active) setError(liveStepUpErrorMessage(nextError));
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [preparationAttempt, visible]);

  const verify = async () => {
    if (!preparation || preparation.kind === 'satisfied' || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyLiveStepUp(preparation, code);
      await onVerifiedRef.current();
    } catch (nextError) {
      setError(liveStepUpErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
          <View style={styles.header}>
            <View style={styles.icon}><ShieldCheck size={22} color={visual.teal} /></View>
            <Pressable accessibilityLabel="Close verification" onPress={onCancel} style={styles.close}>
              <X size={20} color="#D7E4E0" />
            </Pressable>
          </View>
          <Text style={styles.kicker}>SECURE LIVE CONTROL</Text>
          <Text style={styles.title}>Verify it’s you.</Text>
          <Text style={styles.copy}>
            {preparation?.kind === 'enrollment'
              ? 'Add Betweener Live to your authenticator once, then enter its current code.'
              : `Enter your authenticator code to ${actionLabel.toLowerCase()}.`}
          </Text>

          {preparation?.kind === 'enrollment' ? (
            <View style={styles.enrollment}>
              <View style={styles.qr}><SvgXml xml={qrSvg(preparation.qrCode)} width={184} height={184} /></View>
              <Text style={styles.securityNote}>Never share or screenshot this setup code.</Text>
              <View style={styles.setupActions}>
                <Pressable onPress={() => void Linking.openURL(preparation.uri)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Open authenticator</Text>
                </Pressable>
                <Pressable onPress={() => void Clipboard.setStringAsync(preparation.secret)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Copy setup key</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {busy && !preparation ? (
            <View accessibilityLiveRegion="polite" style={styles.loadingState}>
              <ActivityIndicator color={visual.teal} />
              <Text style={styles.loadingText}>Preparing secure verification…</Text>
            </View>
          ) : null}
          {preparation && preparation.kind !== 'satisfied' ? (
            <>
              <Text style={styles.label}>AUTHENTICATOR CODE</Text>
              <TextInput
                accessibilityLabel="Authenticator code"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                onSubmitEditing={() => void verify()}
                placeholder="000000"
                placeholderTextColor="#657773"
                style={styles.input}
                value={code}
              />
              <Pressable
                disabled={busy || code.length !== 6}
                onPress={() => void verify()}
                style={[styles.primary, (busy || code.length !== 6) && styles.disabled]}
              >
                {busy ? <ActivityIndicator color={visual.accentContrast} /> : (
                  <Text style={styles.primaryText}>{actionLabel}</Text>
                )}
              </Pressable>
            </>
          ) : null}
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          {error && !preparation ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPreparationAttempt((current) => current + 1)}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try verification again</Text>
            </Pressable>
          ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,8,8,0.76)' },
  sheet: { height: '82%', maxHeight: 720, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: '#082420', borderWidth: 1, borderColor: '#2D514B' },
  scroll: { flex: 1 },
  sheetContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 34 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C3430' },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#31534D' },
  kicker: { marginTop: 18, color: visual.teal, fontSize: 10, letterSpacing: 1.7, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 6, color: '#FFF7EC', fontSize: 31, fontFamily: 'PlayfairDisplay_700Bold' },
  copy: { marginTop: 8, color: '#B7C7C3', fontSize: 13, lineHeight: 20, fontFamily: 'Manrope_500Medium' },
  enrollment: { alignItems: 'center', marginTop: 18 },
  qr: { padding: 12, borderRadius: 20, backgroundColor: '#FFFFFF' },
  securityNote: { marginTop: 9, color: '#D8B79F', fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  setupActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondaryButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 21, justifyContent: 'center', borderWidth: 1, borderColor: '#3B625B' },
  secondaryText: { color: '#D7E4E0', fontSize: 11, fontFamily: 'Manrope_700Bold' },
  loadingState: { minHeight: 112, marginTop: 24, gap: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#0A2C28', borderWidth: 1, borderColor: '#31534D' },
  loadingText: { color: '#B7C7C3', fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  label: { marginTop: 22, color: '#AFC2BD', fontSize: 10, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' },
  input: { height: 56, marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: '#42645E', paddingHorizontal: 18, color: '#FFF7EC', fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  primary: { height: 54, marginTop: 16, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.teal },
  primaryText: { color: visual.accentContrast, fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.42 },
  error: { marginTop: 12, color: '#F0AAA5', fontSize: 11, lineHeight: 17, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  retryButton: { minHeight: 48, marginTop: 14, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3B625B' },
  retryText: { color: '#D7E4E0', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
});
