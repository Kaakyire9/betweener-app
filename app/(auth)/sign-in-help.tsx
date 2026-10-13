import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthMethodIcon } from '@/components/auth/AuthMethodOption';
import { AUTH_PALETTE, AuthScreenFrame } from '@/components/auth/AuthScreenFrame';
import {
  readLastSignInMethod,
  SIGN_IN_METHOD_LABELS,
  type LastSignInMethod,
} from '@/lib/auth/last-sign-in-method';
import { haptics } from '@/lib/haptics';

const routeForMethod = (method: LastSignInMethod) => {
  if (method === 'password') return '/(auth)/password-login' as const;
  if (method === 'email_link') return '/(auth)/magic-link' as const;
  return '/(auth)/login' as const;
};

export default function SignInHelpScreen() {
  const router = useRouter();
  const [lastMethod, setLastMethod] = useState<LastSignInMethod | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    void readLastSignInMethod().then((record) => {
      if (active) setLastMethod(record?.method ?? null);
    });
    return () => {
      active = false;
    };
  }, []));

  const continueWithLastMethod = () => {
    if (!lastMethod) return;
    void haptics.tap();
    router.replace(routeForMethod(lastMethod));
  };

  const continueWithEmailLink = () => {
    const normalized = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      setEmailError('Enter the email address you may have used.');
      void haptics.error();
      return;
    }
    setEmailError('');
    void haptics.tap();
    router.push({
      pathname: '/(auth)/magic-link',
      params: { email: normalized, mode: 'signin' },
    });
  };

  const appleNeedsAndroidHelp = lastMethod === 'apple' && Platform.OS !== 'ios';

  return (
    <AuthScreenFrame>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
        onPress={() => {
          void haptics.tap();
          router.back();
        }}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="chevron-left" size={22} color={AUTH_PALETTE.ink} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <View style={styles.heroIcon}>
        <MaterialCommunityIcons name="account-key-outline" size={25} color={AUTH_PALETTE.teal} />
      </View>
      <Text style={styles.title}>Find your way back</Text>
      <Text style={styles.subtitle}>
        Start with the method remembered on this device. Betweener never reveals linked providers.
      </Text>

      {lastMethod ? (
        <View style={styles.rememberedCard}>
          <Text style={styles.eyebrow}>LAST USED ON THIS DEVICE</Text>
          <View style={styles.rememberedHeading}>
            <View style={styles.methodIconShell}>
              <AuthMethodIcon method={lastMethod} size={21} />
            </View>
            <Text style={styles.rememberedMethod}>{SIGN_IN_METHOD_LABELS[lastMethod]}</Text>
          </View>
          {appleNeedsAndroidHelp ? (
            <View style={styles.appleHelpNote}>
              <MaterialCommunityIcons name="information-outline" size={18} color={AUTH_PALETTE.purple} />
              <Text style={styles.appleHelpText}>
                Apple sign-in is available in the iOS app. If Apple hid your email, it may use a private-relay address.
              </Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={continueWithLastMethod}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
            >
              <Text numberOfLines={1} style={styles.primaryButtonText}>
                Continue with {SIGN_IN_METHOD_LABELS[lastMethod]}
              </Text>
              <MaterialCommunityIcons name="arrow-right" size={19} color="#fff" />
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.neutralCard}>
          <MaterialCommunityIcons name="history" size={20} color={AUTH_PALETTE.muted} />
          <View style={styles.neutralCopy}>
            <Text style={styles.neutralTitle}>No reliable history on this device</Text>
            <Text style={styles.helperText}>Choose a normal sign-in method and we’ll remember it after it succeeds.</Text>
          </View>
        </View>
      )}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Try email instead</Text>
        <Text style={styles.sectionCaption}>No password required</Text>
      </View>
      <View style={[styles.inputShell, emailError ? styles.inputShellError : null]}>
        <MaterialCommunityIcons name="email-outline" size={19} color={AUTH_PALETTE.muted} />
        <TextInput
          accessibilityLabel="Existing account email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (emailError) setEmailError('');
          }}
          onSubmitEditing={continueWithEmailLink}
          placeholder="Email address"
          placeholderTextColor="#879591"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="go"
          textContentType="emailAddress"
          style={styles.input}
        />
      </View>
      {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={continueWithEmailLink}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
      >
        <Text style={styles.secondaryButtonText}>Continue to email-link sign in</Text>
      </Pressable>

      <View style={styles.privacyNote}>
        <MaterialCommunityIcons name="shield-check-outline" size={17} color={AUTH_PALETTE.teal} />
        <Text style={styles.privacyText}>
          This will not create an account or confirm whether the address is registered.
        </Text>
      </View>

      <View style={styles.footerDivider} />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void haptics.tap();
          router.replace('/(auth)/login');
        }}
        style={({ pressed }) => [styles.utilityRow, pressed && styles.pressed]}
      >
        <View style={styles.utilityIcon}>
          <MaterialCommunityIcons name="tune-variant" size={18} color={AUTH_PALETTE.teal} />
        </View>
        <Text style={styles.utilityText}>See all sign-in options</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={AUTH_PALETTE.muted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void haptics.tap();
          router.push('/support-center');
        }}
        style={({ pressed }) => [styles.utilityRow, pressed && styles.pressed]}
      >
        <View style={styles.utilityIcon}>
          <MaterialCommunityIcons name="lifebuoy" size={18} color={AUTH_PALETTE.teal} />
        </View>
        <View style={styles.utilityCopy}>
          <Text style={styles.utilityText}>Open Betweener support</Text>
          <Text style={styles.utilityCaption}>For account recovery and ownership checks</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={AUTH_PALETTE.muted} />
      </Pressable>
    </AuthScreenFrame>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: -7,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  backText: { color: AUTH_PALETTE.ink, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  heroIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: AUTH_PALETTE.softTeal,
  },
  title: {
    marginTop: 13,
    color: AUTH_PALETTE.ink,
    fontFamily: 'Archivo_700Bold',
    fontSize: 28,
  },
  subtitle: {
    marginTop: 8,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  rememberedCard: {
    marginTop: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,128,128,0.19)',
    borderRadius: 21,
    backgroundColor: AUTH_PALETTE.softTeal,
  },
  eyebrow: {
    color: AUTH_PALETTE.teal,
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 10,
    letterSpacing: 1.25,
  },
  rememberedHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 10,
    marginBottom: 14,
  },
  methodIconShell: {
    width: 39,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  rememberedMethod: {
    flex: 1,
    color: AUTH_PALETTE.ink,
    fontFamily: 'Archivo_700Bold',
    fontSize: 19,
  },
  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: AUTH_PALETTE.teal,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13.5,
  },
  appleHelpNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: AUTH_PALETTE.softPurple,
  },
  appleHelpText: {
    flex: 1,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  neutralCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginTop: 18,
    padding: 15,
    borderRadius: 18,
    backgroundColor: 'rgba(95,112,108,0.07)',
  },
  neutralCopy: { flex: 1 },
  neutralTitle: { color: AUTH_PALETTE.ink, fontFamily: 'Archivo_700Bold', fontSize: 14 },
  helperText: {
    marginTop: 4,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 21,
    marginBottom: 10,
  },
  sectionTitle: { color: AUTH_PALETTE.ink, fontFamily: 'Archivo_700Bold', fontSize: 16 },
  sectionCaption: {
    color: AUTH_PALETTE.teal,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10.5,
  },
  inputShell: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: 'rgba(95,112,108,0.24)',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  inputShellError: { borderColor: '#BE123C' },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: AUTH_PALETTE.ink,
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
  },
  errorText: {
    marginTop: 7,
    color: '#BE123C',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: AUTH_PALETTE.teal,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  secondaryButtonText: {
    color: AUTH_PALETTE.teal,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13.5,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
  },
  privacyText: {
    flex: 1,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
    lineHeight: 17,
  },
  footerDivider: { height: 1, marginVertical: 16, backgroundColor: 'rgba(95,112,108,0.14)' },
  utilityRow: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 5,
  },
  utilityIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: AUTH_PALETTE.softTeal,
  },
  utilityCopy: { flex: 1 },
  utilityText: {
    flex: 1,
    color: AUTH_PALETTE.ink,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  utilityCaption: {
    marginTop: 2,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 10.5,
  },
  primaryPressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  secondaryPressed: { opacity: 0.66, transform: [{ scale: 0.994 }] },
  pressed: { opacity: 0.58 },
});
