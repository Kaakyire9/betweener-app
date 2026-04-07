import { useAuth } from '@/lib/auth-context';
import { PhoneVerificationService } from '@/lib/phone-verification';
import { logger } from '@/lib/telemetry/logger';
import { Colors } from '@/constants/theme';
import countryData from '@/data/countries.json';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SectionList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

interface PhoneVerificationProps {
  onVerificationComplete: (success: boolean, score: number) => void;
  onCancel: () => void;
  userId?: string | null;
  allowAnonymous?: boolean;
  onPhoneVerified?: (phoneNumber: string) => void;
  onRecoveryRequired?: (details: { phoneNumber: string; code?: string; error?: string }) => void | Promise<void>;
  signupSessionId?: string | null;
  countryLabel?: string;
  dialCode?: string;
  introMessage?: string;
}

export const PhoneVerification: React.FC<PhoneVerificationProps> = ({
  onVerificationComplete,
  onCancel,
  userId,
  allowAnonymous = false,
  onPhoneVerified,
  onRecoveryRequired,
  signupSessionId,
  countryLabel = 'Ghana',
  dialCode = '+233',
  introMessage,
}) => {
  const { user, session } = useAuth();
  const theme = useMemo(() => Colors.light, []);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState({
    label: countryLabel,
    dial: dialCode,
  });
  const [recoveryPrompt, setRecoveryPrompt] = useState<{
    visible: boolean;
    phoneNumber: string | null;
    error?: string;
    code?: string;
  }>({
    visible: false,
    phoneNumber: null,
  });
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [_verificationSid, setVerificationSid] = useState('');
  const [loading, setLoading] = useState(false);

  const countryOptions = useMemo(() => countryData, []);
  const knownCallingCodes = useMemo(() => {
    // Extract unique calling codes (digits only) and sort longest-first for prefix matching.
    const set = new Set<string>();
    for (const item of countryOptions as any[]) {
      const d = String(item?.dial || '').replace(/[^\d]/g, '');
      if (d) set.add(d);
    }
    return Array.from(set).sort((a, b) => b.length - a.length);
  }, [countryOptions]);

  const dialDigits = selectedCountry.dial.replace(/[^\d]/g, '');
  const compactCountryLabel = useMemo(() => {
    const compactMap: Record<string, string> = {
      'United Kingdom': 'UK',
      'United States': 'US',
      'United Arab Emirates': 'UAE',
      'South Africa': 'S. Africa',
    };
    return compactMap[selectedCountry.label] ?? selectedCountry.label;
  }, [selectedCountry.label]);

  const promptCountryMismatch = async (args: {
    enteredDigits: string;
    enteredCallingCode: string;
    inferredCountryLabel?: string;
    inferredDial?: string;
  }): Promise<'switch' | 'use' | 'edit'> => {
    const inferredLabel = args.inferredCountryLabel || `+${args.enteredCallingCode}`;
    const inferredDial = args.inferredDial || `+${args.enteredCallingCode}`;

    const title = 'Check your country code';
    const message =
      `Your number looks like ${inferredLabel} (${inferredDial}), ` +
      `but you selected ${selectedCountry.label} (${selectedCountry.dial}).\n\n` +
      `Switch the country code to match?`;

    return await new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Edit', style: 'cancel', onPress: () => resolve('edit') },
        { text: `Use ${inferredDial}`, onPress: () => resolve('use') },
        { text: 'Switch', style: 'default', onPress: () => resolve('switch') },
      ]);
    });
  };

  const maybeResolveInternationalOverride = async (): Promise<{
    e164: string | null;
    cancelled: boolean;
  }> => {
    // If user typed a full international number (e.g. 44756...) while the selected dial is different,
    // prompt to switch instead of silently constructing a wrong E.164 number.
    const enteredDigits = String(phoneNumber || '').replace(/[^\d]/g, '');
    if (!enteredDigits) return { e164: null, cancelled: false };
    if (enteredDigits.startsWith('0')) return { e164: null, cancelled: false }; // local national format
    if (enteredDigits.length < 11) return { e164: null, cancelled: false }; // too short to be full intl

    const enteredCallingCode = knownCallingCodes.find((cc) => enteredDigits.startsWith(cc));
    if (!enteredCallingCode) return { e164: null, cancelled: false };
    if (dialDigits && enteredCallingCode === dialDigits) return { e164: null, cancelled: false }; // matches selection

    const inferred = (countryOptions as any[]).find(
      (c) => String(c?.dial || '').replace(/[^\d]/g, '') === enteredCallingCode
    );

    const action = await promptCountryMismatch({
      enteredDigits,
      enteredCallingCode,
      inferredCountryLabel: inferred?.label,
      inferredDial: inferred?.dial,
    });

    if (action === 'edit') return { e164: null, cancelled: true };

    const e164 = `+${enteredDigits}`;

    if (action === 'switch' && inferred?.dial) {
      // Make UI consistent with what we're about to send/store.
      setSelectedCountry({ label: inferred.label, dial: inferred.dial });
      setPhoneNumber(enteredDigits.slice(enteredCallingCode.length));
    }

    return { e164, cancelled: false };
  };

  const buildE164 = (dial: string, input: string) => {
    // Users sometimes paste full international numbers into the local field (e.g. +447... or 447...).
    // Build a sane E.164 number either way, without duplicating the country code.
    let digits = String(input || '').replace(/[^\d]/g, '');

    // Convert 00-prefix to international (e.g. 0044... -> 44...)
    if (digits.startsWith('00')) digits = digits.slice(2);

    const dialDigits = String(dial || '').replace(/[^\d]/g, '');
    const keepLeadingZero = dial === '+39'; // Italy exception

    // If the user already included the country code, don't prefix it again.
    if (dialDigits && digits.startsWith(dialDigits)) {
      return `+${digits}`;
    }

    // Heuristic: if the user entered a full international number (country calling code + national number),
    // trust it even if it doesn't match the currently selected dial code. This prevents cases like:
    // selected "+233" but user types "44756...." (UK number) which previously became "+23344756....".
    if (!digits.startsWith('0') && digits.length >= 11) {
      const matched = knownCallingCodes.find((cc) => digits.startsWith(cc));
      if (matched) return `+${digits}`;
    }

    // Otherwise treat it as a national number: strip trunk 0 for most countries.
    if (!keepLeadingZero && digits.startsWith('0')) digits = digits.slice(1);

    return `${dial}${digits}`;
  };

  useEffect(() => {
    setSelectedCountry({ label: countryLabel, dial: dialCode });
  }, [countryLabel, dialCode]);

  const topCountryCodes = useMemo(() => ['GB', 'US', 'CA', 'GH', 'NG'], []);
  const topCountries = useMemo(
    () => countryOptions.filter((item) => topCountryCodes.includes(item.code)),
    [countryOptions, topCountryCodes]
  );
  const otherCountries = useMemo(
    () => countryOptions.filter((item) => !topCountryCodes.includes(item.code)),
    [countryOptions, topCountryCodes]
  );

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    if (!query) return countryOptions;
    const clean = query.replace('+', '');
    return countryOptions.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.dial.replace('+', '').includes(clean)
    );
  }, [countryOptions, countrySearch]);
  const countrySections = useMemo(() => {
    const query = countrySearch.trim();
    if (query) {
      return [{ title: 'Results', data: filteredCountries }];
    }
    return [
      { title: 'Top countries', data: topCountries },
      { title: 'All countries', data: otherCountries },
    ];
  }, [countrySearch, filteredCountries, topCountries, otherCountries]);

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    const effectiveUserId = userId ?? user?.id ?? null;
    if (!effectiveUserId && !allowAnonymous) {
      Alert.alert('Error', 'Please sign in to verify your phone number.');
      return;
    }
    if (!effectiveUserId && allowAnonymous && !signupSessionId) {
      Alert.alert('Error', 'Signup session not ready. Please try again.');
      return;
    }

    setLoading(true);
    try {
      const override = await maybeResolveInternationalOverride();
      if (override.cancelled) {
        setLoading(false);
        return;
      }
      const fullNumber = override.e164 ?? buildE164(selectedCountry.dial, phoneNumber);
      const accessToken = session?.access_token ?? null;
      const result = await PhoneVerificationService.sendVerificationCode(
        fullNumber,
        effectiveUserId,
        signupSessionId ?? null,
        accessToken
      );
      logger.debug('[phone-ui] sendVerificationCode result', {
        success: result.success,
        hasSid: !!result.verificationSid,
        message: result.message,
        error: result.error,
      });
      
      if (result.success && result.verificationSid) {
        setVerificationSid(result.verificationSid);
        setStep('code');
        Alert.alert(
          'Code Sent',
          `A verification code has been sent to ${result.phoneNumber || fullNumber}`
        );
      } else if (result.code === 'phone_belongs_to_existing_account') {
        promptExistingAccountRecovery(fullNumber, result.error, result.code);
      } else {
        Alert.alert('Error', result.error || 'Failed to send verification code');
      }
    } catch (_error) {
      Alert.alert('Error', 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    const effectiveUserId = userId ?? user?.id ?? null;
    if (!effectiveUserId && !allowAnonymous) {
      Alert.alert('Error', 'Please sign in to verify your phone number.');
      return;
    }
    if (!effectiveUserId && allowAnonymous && !signupSessionId) {
      Alert.alert('Error', 'Signup session not ready. Please try again.');
      return;
    }

    setLoading(true);
    try {
      const fullNumber = buildE164(selectedCountry.dial, phoneNumber);
      const accessToken = session?.access_token ?? null;
      const result = await PhoneVerificationService.verifyCode(
        fullNumber,
        verificationCode,
        effectiveUserId,
        signupSessionId ?? null,
        accessToken
      );
      logger.debug('[phone-ui] verifyCode result', {
        success: result.success,
        verified: result.verified,
        confidenceScore: result.confidenceScore,
        message: result.message,
        error: result.error,
      });
      
      if (result.success && result.verified) {
        Alert.alert('Success', 'Phone number verified successfully!');
        // Ensure any async parent state (e.g. AsyncStorage phone number) is persisted before completion runs.
        try {
          await Promise.resolve(onPhoneVerified?.(fullNumber));
        } catch {
          // best-effort only
        }
        onVerificationComplete(true, result.confidenceScore || 0);
      } else if (result.code === 'phone_belongs_to_existing_account') {
        promptExistingAccountRecovery(fullNumber, result.error, result.code);
      } else {
        Alert.alert('Error', result.error || 'Invalid verification code');
        setVerificationCode('');
      }
    } catch (_error) {
      Alert.alert('Error', 'Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (text: string) => text.replace(/[^\d]/g, '');

  const closeRecoveryPrompt = () => {
    setRecoveryPrompt({ visible: false, phoneNumber: null });
  };

  const handleUseDifferentNumber = () => {
    setVerificationCode('');
    setStep('phone');
    closeRecoveryPrompt();
  };

  const handleRecoverAccount = () => {
    const fullNumber = recoveryPrompt.phoneNumber;
    setVerificationCode('');
    setStep('phone');
    closeRecoveryPrompt();
    if (!fullNumber) return;
    void Promise.resolve(
      onRecoveryRequired?.({
        phoneNumber: fullNumber,
        code: recoveryPrompt.code,
        error: recoveryPrompt.error,
      })
    );
  };

  const promptExistingAccountRecovery = (fullNumber: string, error?: string, code?: string) => {
    setRecoveryPrompt({
      visible: true,
      phoneNumber: fullNumber,
      error,
      code,
    });
  };


  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: 'transparent' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
    >
      <View style={styles.panelShadow} />
      <View style={[styles.panel, { backgroundColor: 'rgba(252, 246, 240, 0.92)' }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Verify your phone</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          bounces={false}
        >
          {step === 'phone' ? (
            <>
              <View style={styles.heroBlock}>
                <View style={[styles.eyebrowPill, { backgroundColor: 'rgba(0, 128, 128, 0.09)' }]}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={theme.tint} />
                  <Text style={[styles.eyebrowText, { color: theme.tint }]}>Secure verification</Text>
                </View>
                <Text style={[styles.promptTitle, { color: theme.text }]}>
                  Can we get your number?
                </Text>
                <Text style={[styles.description, styles.introText, { color: theme.textMuted }]}>
                  {introMessage ?? 'Add a verified number to protect your account and keep matches more trustworthy.'}
                </Text>
              </View>

              <View style={[styles.inputSurface, { borderColor: 'rgba(125, 91, 166, 0.08)' }]}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Mobile number</Text>
                <View style={[styles.phoneRow, { borderBottomColor: theme.outline }]}>
                  <TouchableOpacity
                    style={[styles.countryPill, { borderRightColor: theme.outline }]}
                    activeOpacity={0.8}
                    onPress={() => setCountryModalVisible(true)}
                  >
                    <View style={styles.countryCopy}>
                      <Text
                        style={[styles.countryText, { color: theme.text }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {compactCountryLabel}
                      </Text>
                      <Text style={[styles.countryCode, { color: theme.textMuted }]}>
                        {selectedCountry.dial}
                      </Text>
                    </View>
                    <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.phoneInput, { color: theme.text }]}
                    value={phoneNumber}
                    onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
                    placeholder="Phone number"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>

              <View style={styles.guidanceBlock}>
                <Text style={[styles.noticeText, { color: theme.textMuted }]}>
                  By entering your number, you agree to receive texts about your account, including
                  verification codes and important updates.
                </Text>
                {selectedCountry.dial === '+233' ? (
                  <Text style={[styles.noticeText, { color: theme.textMuted }]}>
                    Tip (Ghana): enter your number without the leading 0 (e.g. 246666647).
                  </Text>
                ) : null}
                <View style={[styles.helperCard, { backgroundColor: 'rgba(125, 91, 166, 0.07)' }]}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.accent} />
                  <Text style={[styles.helperText, { color: theme.accent }]}>
                    Confirm your country code matches your number before continuing.
                  </Text>
                </View>
                <Text style={[styles.noticeText, styles.noticeFinePrint, { color: theme.textMuted }]}>
                  Message frequency varies. Reply STOP to cancel.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.buttonWrap,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleSendCode}
                disabled={loading}
              >
                <LinearGradient
                  colors={loading ? ['#80b6b4', '#80b6b4'] : ['#0f8f8e', '#127f9e']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.button}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Next</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.heroBlock}>
                <View style={[styles.eyebrowPill, { backgroundColor: 'rgba(15, 186, 181, 0.09)' }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.tint} />
                  <Text style={[styles.eyebrowText, { color: theme.tint }]}>Enter verification code</Text>
                </View>
                <Text style={[styles.promptTitle, { color: theme.text }]}>Check your messages</Text>
                <Text style={[styles.description, styles.introText, { color: theme.textMuted }]}>
                  We sent a 6-digit code to {selectedCountry.dial} {phoneNumber}.
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Verification code</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.codeInput,
                    { borderColor: theme.outline, color: theme.text, backgroundColor: theme.backgroundSubtle },
                  ]}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="sms-otp"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[
                    styles.buttonWrap,
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={handleVerifyCode}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={loading ? ['#80b6b4', '#80b6b4'] : ['#0f8f8e', '#127f9e']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.button}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        <Text style={styles.buttonText}>Verify Code</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={() => setStep('phone')}
                  disabled={loading}
                >
                  <Text style={[styles.resendText, { color: theme.tint }]}>Change Phone Number</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
      <Modal
        visible={recoveryPrompt.visible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeRecoveryPrompt}
      >
        <View style={styles.modalRoot}>
          <TouchableWithoutFeedback onPress={closeRecoveryPrompt}>
            <View style={[styles.modalBackdrop, styles.recoveryBackdrop]} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.recoverySheetShadow} />
            <View style={styles.recoverySheet}>
              <LinearGradient
                colors={['rgba(18, 28, 27, 0.985)', 'rgba(17, 25, 25, 0.975)', 'rgba(15, 21, 21, 0.985)']}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.recoverySheetGradient}
              >
                <View style={[styles.recoveryHalo, { backgroundColor: 'rgba(15, 186, 181, 0.14)' }]} />
                <View style={[styles.recoveryHaloSecondary, { backgroundColor: 'rgba(255, 214, 153, 0.14)' }]} />
                <View style={styles.recoverySpark} />
                <View style={styles.recoverySparkSecondary} />
                <View style={styles.recoveryTopBar} />
                <View style={[styles.recoveryIconWrap, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)' }]}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.recoveryIconInner}
                  >
                    <Ionicons name="shield-checkmark-outline" size={22} color="#A8F1EE" />
                  </LinearGradient>
                </View>
                <Text style={styles.recoveryEyebrow}>ACCOUNT FOUND</Text>
                <Text style={styles.recoveryTitle}>This number is already in Betweener</Text>
                <Text style={styles.recoveryBody}>
                  It looks like this number is already protecting an older Betweener account. Recover that account or use a different number to create a new one.
                </Text>

                <TouchableOpacity style={styles.recoveryPrimaryWrap} onPress={handleRecoverAccount} activeOpacity={0.92}>
                  <LinearGradient
                    colors={['#2AD9D4', '#16C7C3', '#1797B1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.recoveryPrimaryButton}
                  >
                    <Text style={styles.recoveryPrimaryText}>Recover account</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.recoverySecondaryButton, { borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(255,255,255,0.055)' }]}
                  onPress={handleUseDifferentNumber}
                  activeOpacity={0.9}
                >
                  <Text style={styles.recoverySecondaryText}>Use a different number</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.recoveryTertiaryButton} onPress={closeRecoveryPrompt} activeOpacity={0.8}>
                  <Text style={styles.recoveryTertiaryText}>Not now</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Modal
        visible={countryModalVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setCountryModalVisible(false)}
      >
        <View style={styles.modalRoot}>
          <TouchableWithoutFeedback
            onPress={() => {
              setCountryModalVisible(false);
              setCountrySearch('');
            }}
          >
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: theme.text }]}>Choose country</Text>
              <TextInput
                style={[styles.searchInput, { borderColor: theme.outline, color: theme.text }]}
                placeholder="Search country or code"
                placeholderTextColor={theme.textMuted}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoFocus
              />
              <SectionList
                sections={countrySections}
                keyExtractor={(item) => `${item.label}-${item.dial}`}
                renderSectionHeader={({ section }) => (
                  <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>
                    {section.title}
                  </Text>
                )}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.countryRow, { borderBottomColor: theme.outline }]}
                    onPress={() => {
                      setSelectedCountry(item);
                      setCountryModalVisible(false);
                      setCountrySearch('');
                    }}
                  >
                    <Text style={[styles.countryRowText, { color: theme.text }]}>{item.label}</Text>
                    <Text style={[styles.countryRowDial, { color: theme.textMuted }]}>{item.dial}</Text>
                  </TouchableOpacity>
                )}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                stickySectionHeadersEnabled={false}
                contentContainerStyle={styles.sectionContent}
                style={styles.sectionList}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
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
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
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
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 34,
  },
  scrollArea: {
    flex: 1,
  },
  heroBlock: {
    marginBottom: 22,
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
    fontSize: 32,
    fontFamily: 'Archivo_700Bold',
    lineHeight: 38,
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  introText: {
    marginBottom: 0,
  },
  inputSurface: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    shadowColor: '#ffffff',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 12,
    borderRightWidth: 1,
    width: '42%',
    minWidth: 118,
    flexShrink: 0,
  },
  countryCopy: {
    flex: 1,
    minWidth: 0,
  },
  countryText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    flexShrink: 1,
  },
  countryCode: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontFamily: 'Manrope_500Medium',
    minWidth: 0,
  },
  guidanceBlock: {
    marginTop: 16,
    marginBottom: 22,
    gap: 10,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Manrope_400Regular',
  },
  noticeFinePrint: {
    fontSize: 12.5,
    opacity: 0.92,
  },
  helperText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_600SemiBold',
  },
  helperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  description: {
    fontSize: 15,
    textAlign: 'left',
    marginBottom: 28,
    lineHeight: 23,
    fontFamily: 'Manrope_500Medium',
  },
  inputContainer: {
    width: '100%',
    marginBottom: 26,
  },
  input: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 28,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 6,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  buttonWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0f8f8e',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  button: {
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.78,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Manrope_700Bold',
  },
  resendButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalKeyboard: {
    justifyContent: 'flex-end',
  },
  recoveryBackdrop: {
    backgroundColor: 'rgba(6, 14, 14, 0.58)',
  },
  recoverySheetShadow: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    top: 0,
    backgroundColor: 'rgba(4, 12, 12, 0.28)',
    borderRadius: 30,
    opacity: 0.48,
  },
  recoverySheet: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  recoverySheetGradient: {
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
  },
  recoveryHalo: {
    position: 'absolute',
    top: -10,
    left: -16,
    width: 180,
    height: 180,
    borderRadius: 999,
  },
  recoveryHaloSecondary: {
    position: 'absolute',
    right: -22,
    top: 60,
    width: 140,
    height: 140,
    borderRadius: 999,
  },
  recoverySpark: {
    position: 'absolute',
    right: 28,
    top: 22,
    width: 54,
    height: 54,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 224, 179, 0.16)',
    backgroundColor: 'rgba(255, 224, 179, 0.05)',
  },
  recoverySparkSecondary: {
    position: 'absolute',
    right: 44,
    top: 38,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 236, 204, 0.58)',
  },
  recoveryTopBar: {
    width: 44,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: 18,
  },
  recoveryIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  recoveryIconInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryEyebrow: {
    color: '#A8F1EE',
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  recoveryTitle: {
    color: '#FBF6F1',
    fontSize: 29,
    lineHeight: 34,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: -0.55,
    marginBottom: 12,
  },
  recoveryBody: {
    color: 'rgba(245, 239, 232, 0.8)',
    fontSize: 15.5,
    lineHeight: 24,
    fontFamily: 'Manrope_500Medium',
    marginBottom: 26,
  },
  recoveryPrimaryWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#18c8c3',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  recoveryPrimaryButton: {
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  recoveryPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontFamily: 'Manrope_700Bold',
  },
  recoverySecondaryButton: {
    minHeight: 55,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 8,
  },
  recoverySecondaryText: {
    color: '#F8F4EF',
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  recoveryTertiaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryTertiaryText: {
    color: 'rgba(244, 239, 232, 0.62)',
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  modalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  sectionList: {
    flexGrow: 0,
  },
  sectionContent: {
    paddingBottom: 8,
  },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 6,
  },
  countryRowText: {
    fontSize: 15,
    fontFamily: 'Manrope_600SemiBold',
  },
  countryRowDial: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
});
