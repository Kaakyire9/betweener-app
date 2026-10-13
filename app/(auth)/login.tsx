import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthBottomSheet } from '@/components/auth/AuthBottomSheet';
import { AuthMethodIcon, AuthMethodOption } from '@/components/auth/AuthMethodOption';
import { AUTH_PALETTE, AuthScreenFrame } from '@/components/auth/AuthScreenFrame';
import { APP_SCHEME } from '@/config/app-identity';
import {
  clearPendingAuthFlow,
  clearPendingAuthProvider,
  isTrustedAuthCallbackUrl,
  LAST_DEEP_LINK_URL_KEY,
  markPendingAuthFlow,
  markPendingAuthProvider,
} from '@/lib/auth-callback';
import {
  beginSignInMethodAttempt,
  cancelSignInMethodAttempt,
  completeSignInMethodAttempt,
  forgetSignInMethodOnDevice,
  readLastSignInMethod,
  SIGN_IN_METHOD_LABELS,
  type LastSignInMethod,
} from '@/lib/auth/last-sign-in-method';
import { haptics } from '@/lib/haptics';
import { setSignupIdentityHints } from '@/lib/signup-tracking';
import { supabase } from '@/lib/supabase';
import { addBreadcrumb } from '@/lib/telemetry/sentry';

type LoadingProvider = Extract<LastSignInMethod, 'google' | 'apple'>;

const isAppleAuthCancelled = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const anyErr = error as { code?: string; message?: string };
  return (
    anyErr.code === 'ERR_CANCELED' ||
    anyErr.code === 'ERR_CANCELLED' ||
    (typeof anyErr.message === 'string' && anyErr.message.toLowerCase().includes('canceled'))
  );
};

const formatAppleFullName = (
  fullName?: AppleAuthentication.AppleAuthenticationFullName | null,
) => {
  const parts = [
    String(fullName?.givenName ?? '').trim(),
    String(fullName?.middleName ?? '').trim(),
    String(fullName?.familyName ?? '').trim(),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
};

export default function LoginScreen() {
  WebBrowser.maybeCompleteAuthSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ reason?: string }>();
  const [loadingProvider, setLoadingProvider] = useState<LoadingProvider | null>(null);
  const [lastMethod, setLastMethod] = useState<LastSignInMethod | null>(null);
  const [moreOptionsVisible, setMoreOptionsVisible] = useState(false);
  const showSessionExpiredNotice = params.reason === 'session_expired';
  const primaryMethod = lastMethod ?? 'google';

  useFocusEffect(useCallback(() => {
    let active = true;
    void readLastSignInMethod().then((record) => {
      if (active) setLastMethod(record?.method ?? null);
    });
    return () => {
      active = false;
    };
  }, []));

  useEffect(() => {
    void supabase.auth.getSession();
  }, []);

  useEffect(() => {
    if (!showSessionExpiredNotice) return;
    addBreadcrumb('[auth] session_expired_handoff_shown');
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[auth-recovery]', { event: 'session_expired_handoff_shown' });
    }
  }, [showSessionExpiredNotice]);

  const getRedirectUrl = () => makeRedirectUri({
    scheme: APP_SCHEME,
    path: 'auth/callback',
  });

  const waitForSession = async (timeoutMs = 6_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  };

  const handleGoogle = async (forceAccountChooser = false) => {
    setLoadingProvider('google');
    let attempt: Awaited<ReturnType<typeof beginSignInMethodAttempt>> | null = null;
    try {
      attempt = await beginSignInMethodAttempt('google');
      await markPendingAuthProvider('google', attempt.attemptId);
      await markPendingAuthFlow('oauth', attempt.attemptId);
      const redirectTo = getRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          ...(forceAccountChooser ? { queryParams: { prompt: 'select_account' } } : {}),
        },
      });
      if (error || !data?.url) throw error ?? new Error('Unable to start Google sign-in.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url && isTrustedAuthCallbackUrl(result.url)) {
        await AsyncStorage.setItem(LAST_DEEP_LINK_URL_KEY, result.url);
        router.replace('/(auth)/callback');
      } else {
        await clearPendingAuthFlow();
        await clearPendingAuthProvider();
        await cancelSignInMethodAttempt(attempt.attemptId);
      }
    } catch (error) {
      await clearPendingAuthProvider();
      await clearPendingAuthFlow();
      await cancelSignInMethodAttempt(attempt?.attemptId);
      console.error('[auth] google sign-in error', error);
      void haptics.error();
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleApple = async () => {
    if (Platform.OS !== 'ios') return;
    setLoadingProvider('apple');
    let attempt: Awaited<ReturnType<typeof beginSignInMethodAttempt>> | null = null;
    try {
      attempt = await beginSignInMethodAttempt('apple');
      await markPendingAuthProvider('apple', attempt.attemptId);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      await setSignupIdentityHints({
        name: formatAppleFullName(credential.fullName),
        email: credential.email ?? null,
      });
      if (!credential.identityToken) throw new Error('Apple sign-in failed to return a token.');

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;

      const hasSession = !!data.session?.user || await waitForSession();
      const { data: settled } = hasSession
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (!settled.session?.user) throw new Error('apple_session_empty');

      await completeSignInMethodAttempt({
        attemptId: attempt.attemptId,
        method: 'apple',
        sessionUserId: settled.session.user.id,
      });
      void haptics.success();
      router.replace('/(auth)/gate');
    } catch (error) {
      if (!isAppleAuthCancelled(error)) {
        console.error('[auth] apple sign-in error', error);
        void haptics.error();
      }
      await clearPendingAuthProvider();
      await cancelSignInMethodAttempt(attempt?.attemptId);
    } finally {
      setLoadingProvider(null);
    }
  };

  const continueWithMethod = async (
    method: LastSignInMethod,
    options?: { chooseGoogleAccount?: boolean },
  ) => {
    void haptics.tap();
    if (method === 'google') {
      await handleGoogle(options?.chooseGoogleAccount === true);
      return;
    }
    if (method === 'apple') {
      if (Platform.OS === 'ios') await handleApple();
      else router.push('/(auth)/sign-in-help');
      return;
    }
    if (method === 'email_link') {
      router.push('/(auth)/magic-link');
      return;
    }
    router.push('/(auth)/password-login');
  };

  const selectAlternative = (
    method: LastSignInMethod,
    options?: { chooseGoogleAccount?: boolean },
  ) => {
    setMoreOptionsVisible(false);
    requestAnimationFrame(() => {
      void continueWithMethod(method, options);
    });
  };

  const handleForgetDevice = () => {
    void haptics.warning();
    Alert.alert(
      'Forget sign-in reminder?',
      'This removes only the sign-in reminder stored on this device. It does not delete your account or sign out a provider account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            void Promise.all([
              forgetSignInMethodOnDevice(),
              clearPendingAuthFlow(),
              clearPendingAuthProvider(),
            ]).then(() => {
              setLastMethod(null);
              setMoreOptionsVisible(false);
              void haptics.success();
            });
          },
        },
      ],
    );
  };

  const primaryLabel = useMemo(() => {
    if (primaryMethod === 'google') return 'Continue with Google';
    if (primaryMethod === 'apple' && Platform.OS !== 'ios') return 'Apple sign-in help';
    if (primaryMethod === 'email_link') return 'Continue with email link';
    if (primaryMethod === 'password') return 'Continue with email and password';
    return 'Continue with Apple';
  }, [primaryMethod]);

  const primaryIsLoading = loadingProvider === primaryMethod;
  const interactionsDisabled = loadingProvider !== null;

  const renderPrimaryAction = () => {
    if (primaryMethod === 'apple' && Platform.OS === 'ios') {
      return (
        <View
          pointerEvents={interactionsDisabled ? 'none' : 'auto'}
          style={[styles.appleButtonWrap, interactionsDisabled && styles.disabled]}
        >
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={17}
            style={styles.appleButton}
            onPress={() => {
              void haptics.tap();
              void handleApple();
            }}
          />
          {primaryIsLoading ? (
            <View pointerEvents="none" style={styles.appleLoadingOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <Pressable
        accessibilityRole="button"
        disabled={interactionsDisabled}
        onPress={() => void continueWithMethod(primaryMethod)}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && !interactionsDisabled && styles.primaryButtonPressed,
          interactionsDisabled && styles.disabled,
        ]}
      >
        <View style={styles.primaryIconSlot}>
          {primaryIsLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <AuthMethodIcon method={primaryMethod} color="#fff" size={21} />
          )}
        </View>
        <Text numberOfLines={1} style={styles.primaryButtonText}>{primaryLabel}</Text>
        <View style={styles.primaryIconSlot} />
      </Pressable>
    );
  };

  return (
    <>
      <AuthScreenFrame>
        <View style={styles.brandWrap}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>Betweener</Text>
            <Text style={styles.brandGlyph}>*</Text>
          </View>
          <View style={styles.brandRule} />
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          {lastMethod
            ? 'Continue with the method remembered on this device.'
            : 'Choose a secure way to return to your account.'}
        </Text>

        {showSessionExpiredNotice ? (
          <View style={styles.noticeCard}>
            <MaterialCommunityIcons name="shield-refresh-outline" size={19} color={AUTH_PALETTE.teal} />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>Sign in again securely</Text>
              <Text style={styles.noticeBody}>
                Your previous session was closed. Your account and local sign-in reminder are unchanged.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.featureCard}>
          <Text style={styles.eyebrow}>
            {lastMethod ? 'LAST USED ON THIS DEVICE' : 'QUICK SIGN IN'}
          </Text>
          <View style={styles.methodHeading}>
            <View style={styles.methodIconShell}>
              <AuthMethodIcon method={primaryMethod} size={22} />
            </View>
            <View style={styles.methodCopy}>
              <Text style={styles.methodName}>{SIGN_IN_METHOD_LABELS[primaryMethod]}</Text>
              <Text style={styles.methodCaption}>
                {lastMethod ? 'Your remembered sign-in method' : 'A fast, secure place to start'}
              </Text>
            </View>
          </View>
          {renderPrimaryAction()}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={interactionsDisabled}
          onPress={() => {
            void haptics.tap();
            setMoreOptionsVisible(true);
          }}
          style={({ pressed }) => [
            styles.moreOptionsButton,
            pressed && styles.secondaryPressed,
            interactionsDisabled && styles.disabled,
          ]}
        >
          <MaterialCommunityIcons name="tune-variant" size={19} color={AUTH_PALETTE.teal} />
          <Text style={styles.moreOptionsText}>More sign-in options</Text>
          <MaterialCommunityIcons name="chevron-up" size={19} color={AUTH_PALETTE.teal} />
        </Pressable>

        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void haptics.tap();
            router.push('/(auth)/sign-in-help');
          }}
          style={({ pressed }) => [styles.helpLink, pressed && styles.linkPressed]}
        >
          <Text style={styles.helpText}>Need help finding your sign-in?</Text>
        </Pressable>

        <View style={styles.footerDivider} />
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void haptics.tap();
            router.push('/(auth)/welcome');
          }}
          style={({ pressed }) => [styles.createAccountLink, pressed && styles.linkPressed]}
        >
          <Text style={styles.createAccountText}>New here? Create an account</Text>
        </Pressable>
      </AuthScreenFrame>

      <AuthBottomSheet
        visible={moreOptionsVisible}
        title="More ways to sign in"
        subtitle={lastMethod === 'google'
          ? 'Choose another method or open Google’s account chooser.'
          : 'Choose another secure method. We only remember it after sign-in succeeds.'}
        onClose={() => setMoreOptionsVisible(false)}
      >
        {lastMethod === 'google' ? (
          <AuthMethodOption
            method="google"
            title="Use a different Google account"
            subtitle="Open Google’s account chooser"
            disabled={interactionsDisabled}
            onPress={() => selectAlternative('google', { chooseGoogleAccount: true })}
          />
        ) : primaryMethod !== 'google' ? (
          <AuthMethodOption
            method="google"
            title="Continue with Google"
            disabled={interactionsDisabled}
            onPress={() => selectAlternative('google', { chooseGoogleAccount: true })}
          />
        ) : null}

        {Platform.OS === 'ios' && primaryMethod !== 'apple' ? (
          <View
            pointerEvents={interactionsDisabled ? 'none' : 'auto'}
            style={[styles.sheetAppleWrap, interactionsDisabled && styles.disabled]}
          >
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={17}
              style={styles.appleButton}
              onPress={() => {
                setMoreOptionsVisible(false);
                requestAnimationFrame(() => {
                  void haptics.tap();
                  void handleApple();
                });
              }}
            />
          </View>
        ) : null}

        {primaryMethod !== 'email_link' ? (
          <AuthMethodOption
            method="email_link"
            title="Sign in with an email link"
            subtitle="No password required"
            disabled={interactionsDisabled}
            onPress={() => selectAlternative('email_link')}
          />
        ) : null}

        {primaryMethod !== 'password' ? (
          <AuthMethodOption
            method="password"
            title="Use email and password"
            disabled={interactionsDisabled}
            onPress={() => selectAlternative('password')}
          />
        ) : null}

        <View style={styles.sheetDivider} />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMoreOptionsVisible(false);
            void haptics.tap();
            router.push('/(auth)/sign-in-help');
          }}
          style={({ pressed }) => [styles.sheetUtility, pressed && styles.secondaryPressed]}
        >
          <MaterialCommunityIcons name="lifebuoy" size={19} color={AUTH_PALETTE.teal} />
          <Text style={styles.sheetUtilityText}>Sign-in help</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={AUTH_PALETTE.muted} />
        </Pressable>

        {lastMethod ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleForgetDevice}
            style={({ pressed }) => [styles.sheetUtility, pressed && styles.secondaryPressed]}
          >
            <MaterialCommunityIcons name="cellphone-remove" size={19} color={AUTH_PALETTE.muted} />
            <View style={styles.sheetUtilityCopy}>
              <Text style={styles.sheetUtilityText}>Forget sign-in reminder</Text>
              <Text style={styles.sheetUtilityCaption}>Only removes this device’s local hint</Text>
            </View>
          </Pressable>
        ) : null}
      </AuthBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  brandWrap: { alignItems: 'center', marginBottom: 17 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brand: {
    color: AUTH_PALETTE.ink,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 25,
    letterSpacing: 0.4,
  },
  brandGlyph: {
    marginTop: -7,
    color: AUTH_PALETTE.purple,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 13,
  },
  brandRule: {
    width: 54,
    height: 3,
    marginTop: 9,
    borderRadius: 999,
    backgroundColor: AUTH_PALETTE.purple,
    opacity: 0.58,
  },
  title: { color: AUTH_PALETTE.ink, fontFamily: 'Archivo_700Bold', fontSize: 29 },
  subtitle: {
    marginTop: 9,
    marginBottom: 22,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginBottom: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(0,128,128,0.16)',
    borderRadius: 17,
    backgroundColor: AUTH_PALETTE.softTeal,
  },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: AUTH_PALETTE.ink, fontFamily: 'Archivo_700Bold', fontSize: 14 },
  noticeBody: {
    marginTop: 3,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
  },
  featureCard: {
    padding: 17,
    borderWidth: 1,
    borderColor: 'rgba(0,128,128,0.19)',
    borderRadius: 22,
    backgroundColor: AUTH_PALETTE.softTeal,
  },
  eyebrow: {
    color: AUTH_PALETTE.teal,
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 10,
    letterSpacing: 1.3,
  },
  methodHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 15,
  },
  methodIconShell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  methodCopy: { flex: 1 },
  methodName: { color: AUTH_PALETTE.ink, fontFamily: 'Archivo_700Bold', fontSize: 19 },
  methodCaption: {
    marginTop: 3,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11.5,
  },
  primaryButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    borderRadius: 17,
    backgroundColor: AUTH_PALETTE.teal,
    shadowColor: AUTH_PALETTE.teal,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  primaryButtonPressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  primaryIconSlot: { width: 24, alignItems: 'center' },
  primaryButtonText: {
    flex: 1,
    paddingHorizontal: 8,
    color: '#fff',
    fontFamily: 'Archivo_700Bold',
    fontSize: 14.5,
    textAlign: 'center',
  },
  appleButtonWrap: { position: 'relative', height: 54 },
  appleButton: { width: '100%', height: 54 },
  appleLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.46)',
  },
  moreOptionsButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,128,128,0.28)',
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  moreOptionsText: {
    color: AUTH_PALETTE.teal,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  helpLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  helpText: {
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  footerDivider: { height: 1, marginTop: 8, backgroundColor: 'rgba(95,112,108,0.13)' },
  createAccountLink: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  createAccountText: {
    color: AUTH_PALETTE.teal,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13.5,
  },
  disabled: { opacity: 0.52 },
  secondaryPressed: { opacity: 0.66, transform: [{ scale: 0.994 }] },
  linkPressed: { opacity: 0.56 },
  sheetAppleWrap: { height: 54, marginBottom: 10 },
  sheetDivider: { height: 1, marginVertical: 5, backgroundColor: 'rgba(95,112,108,0.14)' },
  sheetUtility: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 9,
  },
  sheetUtilityCopy: { flex: 1 },
  sheetUtilityText: {
    flex: 1,
    color: AUTH_PALETTE.ink,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13.5,
  },
  sheetUtilityCaption: {
    marginTop: 2,
    color: AUTH_PALETTE.muted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
  },
});
