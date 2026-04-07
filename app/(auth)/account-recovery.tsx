import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RecoveryMethod = 'email' | 'google' | 'apple' | 'magic_link';

const METHOD_OPTIONS: { value: RecoveryMethod; label: string }[] = [
  { value: 'google', label: 'Google' },
  { value: 'apple', label: 'Apple' },
  { value: 'email', label: 'Email + password' },
  { value: 'magic_link', label: 'Email link' },
];

const METHOD_LABELS: Record<RecoveryMethod, string> = {
  google: 'Google',
  apple: 'Apple',
  email: 'Email + password',
  magic_link: 'Email link',
};

const normalizeMethod = (value?: string | string[] | null): RecoveryMethod => {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'google' || normalized === 'apple' || normalized === 'email' || normalized === 'magic_link') {
    return normalized;
  }
  return 'email';
};

const suggestPreviousMethod = (currentMethod: RecoveryMethod): RecoveryMethod => {
  if (currentMethod === 'apple') return 'google';
  if (currentMethod === 'google') return 'apple';
  return 'google';
};

export default function AccountRecoveryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const theme = useMemo(() => Colors.light, []);
  const phoneNumber = String(params.phoneNumber ?? '').trim();
  const currentMethod = normalizeMethod(params.currentMethod);
  const nextRoute = String(params.next ?? '').trim();
  const reason = String(params.reason ?? '').trim();
  const [previousMethod, setPreviousMethod] = useState<RecoveryMethod>(suggestPreviousMethod(currentMethod));
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [previousEmail, setPreviousEmail] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.email) {
      setContactEmail((current) => current || user.email || '');
    }
  }, [user?.email]);

  const isAuthenticated = !!user?.id;

  const handleGoBack = () => {
    router.replace({
      pathname: '/(auth)/verify-phone',
      params: {
        ...(nextRoute ? { next: nextRoute } : {}),
        ...(reason ? { reason } : {}),
      },
    });
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      router.replace('/(auth)/welcome');
      return;
    }

    if (!contactEmail.trim()) {
      Alert.alert('Add a contact email', 'Support needs an email address so they can reach you about the older account.');
      return;
    }

    setSubmitting(true);
    try {
      const note =
        details.trim() ||
        `Phone verification was blocked because ${phoneNumber || 'this number'} already protects an older Betweener account.`;

      const { data, error } = await supabase.rpc('rpc_request_account_recovery', {
        p_current_sign_in_method: currentMethod,
        p_previous_sign_in_method: previousMethod,
        p_contact_email: contactEmail.trim(),
        p_previous_account_email: previousEmail.trim() || null,
        p_note: note,
        p_evidence: {
          source: 'phone_verification_conflict',
          conflicting_phone_number: phoneNumber || null,
          current_email: user?.email ?? null,
        },
      });

      if (error || !data) {
        throw error ?? new Error('Unable to submit the recovery request.');
      }

      Alert.alert(
        'Recovery request sent',
        'Support will review this and help reconnect the right Betweener account.',
        [{ text: 'OK', onPress: handleGoBack }]
      );
    } catch (error: any) {
      Alert.alert('Unable to send request', error?.message ?? 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={[Colors.light.tint, Colors.light.accent, Colors.light.background]}
      start={{ x: 0.15, y: 0.08 }}
      end={{ x: 0.9, y: 0.96 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.panelShadow} />
          <View style={[styles.panel, { backgroundColor: 'rgba(252, 246, 240, 0.94)' }]}>
            <View style={styles.header}>
              <TouchableOpacity onPress={handleGoBack} style={styles.closeButton}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: theme.text }]}>Recover the right account</Text>
              <View style={styles.placeholder} />
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.heroBlock}>
                <View style={[styles.eyebrowPill, { backgroundColor: 'rgba(0, 128, 128, 0.09)' }]}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={theme.tint} />
                  <Text style={[styles.eyebrowText, { color: theme.tint }]}>Account protection</Text>
                </View>
                <Text style={[styles.promptTitle, { color: theme.text }]}>This number is already in Betweener</Text>
                <Text style={[styles.description, { color: theme.textMuted }]}>
                  {phoneNumber
                    ? `${phoneNumber} already protects an older Betweener account.`
                    : 'This number already protects an older Betweener account.'}{' '}
                  Recover that account instead, or go back and use a different number for a new one.
                </Text>
              </View>

              {!isAuthenticated ? (
                <View style={styles.section}>
                  <View style={[styles.infoCard, { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: theme.outline }]}>
                    <Text style={[styles.infoTitle, { color: theme.text }]}>Try the older sign-in method first</Text>
                    <Text style={[styles.infoText, { color: theme.textMuted }]}>
                      If you already had a Betweener account, sign in with the method you used before. If you want a fresh account, go back and use a different number.
                    </Text>
                  </View>

                  <TouchableOpacity style={styles.primaryWrap} onPress={() => router.replace('/(auth)/welcome')}>
                    <LinearGradient
                      colors={['#0f8f8e', '#127f9e']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryText}>Back to sign in</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.secondaryButton} onPress={handleGoBack}>
                    <Text style={[styles.secondaryText, { color: theme.text }]}>Use a different number</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={[styles.identityCard, { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: theme.outline }]}>
                    <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>You came in with</Text>
                    <View style={styles.identitySummaryRow}>
                      <View style={[styles.identityIconWrap, { backgroundColor: 'rgba(15, 186, 181, 0.12)' }]}>
                        <Ionicons name="person-circle-outline" size={18} color={theme.tint} />
                      </View>
                      <View style={styles.identitySummaryCopy}>
                        <Text style={[styles.identitySummaryTitle, { color: theme.text }]}>
                          {METHOD_LABELS[currentMethod]}
                        </Text>
                        <Text style={[styles.identitySummaryText, { color: theme.textMuted }]}>
                          This is the sign-in method you used just now.
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.identityCard, { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: theme.outline }]}>
                    <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Recover the older account under</Text>
                    <Text style={[styles.sectionIntro, { color: theme.textMuted }]}>
                      Pick the method that most likely belonged to your earlier Betweener account.
                    </Text>
                    <View style={styles.chipRow}>
                      {METHOD_OPTIONS.map((option) => {
                        const active = previousMethod === option.value;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            activeOpacity={0.9}
                            onPress={() => setPreviousMethod(option.value)}
                            style={[
                              styles.methodChip,
                              active && styles.methodChipActive,
                              {
                                backgroundColor: active ? 'rgba(15, 186, 181, 0.14)' : 'rgba(255,255,255,0.88)',
                                borderColor: active ? 'rgba(15, 186, 181, 0.45)' : theme.outline,
                              },
                            ]}
                          >
                            <Text style={[styles.methodChipText, { color: active ? theme.tint : theme.textMuted }]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={[styles.formCard, { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: theme.outline }]}>
                    <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>How support can help</Text>
                    <Text style={[styles.sectionIntro, { color: theme.textMuted }]}>
                      Leave the right contact details so we can reconnect the older account without guesswork.
                    </Text>

                    <View style={styles.formSection}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Contact email</Text>
                      <TextInput
                        value={contactEmail}
                        onChangeText={setContactEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        placeholder="support can reach you here"
                        placeholderTextColor={theme.textMuted}
                        style={[styles.input, styles.premiumInput, { borderColor: theme.outline, color: theme.text, backgroundColor: 'rgba(255,255,255,0.9)' }]}
                      />
                    </View>

                    <View style={styles.formSection}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Older account email (optional)</Text>
                      <TextInput
                        value={previousEmail}
                        onChangeText={setPreviousEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        placeholder="the email used on the older account"
                        placeholderTextColor={theme.textMuted}
                        style={[styles.input, styles.premiumInput, { borderColor: theme.outline, color: theme.text, backgroundColor: 'rgba(255,255,255,0.9)' }]}
                      />
                    </View>

                    <View style={styles.formSection}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Anything else to add? (optional)</Text>
                      <TextInput
                        value={details}
                        onChangeText={setDetails}
                        placeholder={`Example: I tried ${METHOD_LABELS[currentMethod]} today, but my older account was under ${METHOD_LABELS[previousMethod]}.`}
                        placeholderTextColor={theme.textMuted}
                        multiline
                        textAlignVertical="top"
                        style={[
                          styles.input,
                          styles.textArea,
                          styles.premiumInput,
                          { borderColor: theme.outline, color: theme.text, backgroundColor: 'rgba(255,255,255,0.9)' },
                        ]}
                      />
                    </View>
                  </View>

                  <TouchableOpacity style={styles.primaryWrap} onPress={handleSubmit} disabled={submitting}>
                    <LinearGradient
                      colors={submitting ? ['#80b6b4', '#80b6b4'] : ['#0f8f8e', '#127f9e']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.primaryButton}
                    >
                      {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Recover account</Text>}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.secondaryButton} onPress={handleGoBack} disabled={submitting}>
                    <Text style={[styles.secondaryText, { color: theme.text }]}>Use a different number</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  keyboardWrap: {
    flex: 1,
    paddingVertical: 8,
    position: 'relative',
  },
  panelShadow: {
    position: 'absolute',
    top: 22,
    left: 18,
    right: 18,
    bottom: 10,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.24)',
    opacity: 0.55,
  },
  panel: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(95, 112, 108, 0.12)',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(95, 112, 108, 0.12)',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.2,
  },
  placeholder: {
    width: 38,
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 34,
  },
  heroBlock: {
    marginBottom: 24,
  },
  eyebrowPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 16,
  },
  eyebrowText: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  promptTitle: {
    fontSize: 31,
    lineHeight: 38,
    marginBottom: 10,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: -0.4,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: 'Manrope_500Medium',
  },
  identityCard: {
    marginBottom: 18,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#ffffff',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  identitySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  identityIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identitySummaryCopy: {
    flex: 1,
  },
  identitySummaryTitle: {
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
    marginBottom: 2,
  },
  identitySummaryText: {
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: 'Manrope_500Medium',
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    marginBottom: 10,
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionIntro: {
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Manrope_500Medium',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  methodChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  methodChipActive: {
    shadowColor: '#0f8f8e',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  methodChipText: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
  },
  fieldLabel: {
    marginBottom: 10,
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
  },
  premiumInput: {
    shadowColor: '#ffffff',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  textArea: {
    minHeight: 120,
  },
  formCard: {
    marginBottom: 18,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#ffffff',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  formSection: {
    marginBottom: 16,
  },
  primaryWrap: {
    marginTop: 2,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0f8f8e',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Manrope_700Bold',
  },
  secondaryButton: {
    marginTop: 10,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(95, 112, 108, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.64)',
  },
  secondaryText: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#ffffff',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  infoTitle: {
    marginBottom: 8,
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Manrope_500Medium',
  },
});
