import { useAuth } from '@/lib/auth-context';
import { PhoneVerificationService } from '@/lib/phone-verification';
import { Colors, Fonts } from '@/constants/theme';
import countryData from '@/data/countries.json';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SectionList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  signupSessionId?: string | null;
  countryLabel?: string;
  dialCode?: string;
}

export const PhoneVerification: React.FC<PhoneVerificationProps> = ({
  onVerificationComplete,
  onCancel,
  userId,
  allowAnonymous = false,
  onPhoneVerified,
  signupSessionId,
  countryLabel = 'Ghana',
  dialCode = '+233',
}) => {
  const { user, session } = useAuth();
  const theme = useMemo(() => Colors.light, []);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState({
    label: countryLabel,
    dial: dialCode,
  });
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSid, setVerificationSid] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedCountry({ label: countryLabel, dial: dialCode });
  }, [countryLabel, dialCode]);

  const countryOptions = useMemo(() => countryData, []);
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
      const fullNumber = `${selectedCountry.dial}${phoneNumber}`;
      const accessToken = session?.access_token ?? null;
      const result = await PhoneVerificationService.sendVerificationCode(
        fullNumber,
        effectiveUserId,
        signupSessionId ?? null,
        accessToken
      );
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[phone-ui] sendVerificationCode result', result);
      }
      
      if (result.success && result.verificationSid) {
        setVerificationSid(result.verificationSid);
        setStep('code');
        Alert.alert(
          'Code Sent',
          `A verification code has been sent to ${result.phoneNumber || fullNumber}`
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to send verification code');
      }
    } catch (error) {
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
      const fullNumber = `${selectedCountry.dial}${phoneNumber}`;
      const accessToken = session?.access_token ?? null;
      const result = await PhoneVerificationService.verifyCode(
        fullNumber,
        verificationCode,
        effectiveUserId,
        signupSessionId ?? null,
        accessToken
      );
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[phone-ui] verifyCode result', result);
      }
      
      if (result.success && result.verified) {
        Alert.alert('Success', 'Phone number verified successfully!');
        // Ensure any async parent state (e.g. AsyncStorage phone number) is persisted before completion runs.
        try {
          await Promise.resolve(onPhoneVerified?.(fullNumber));
        } catch {
          // best-effort only
        }
        onVerificationComplete(true, result.confidenceScore || 0);
      } else {
        Alert.alert('Error', result.error || 'Invalid verification code');
        setVerificationCode('');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (text: string) => text.replace(/[^\d]/g, '');


  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <View style={[styles.panel, { backgroundColor: 'rgba(247, 236, 226, 0.86)' }]}>
        <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Phone Verification</Text>
        <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
        {step === 'phone' ? (
          <>
            <Text style={[styles.promptTitle, { color: theme.text }]}>
              Can we get your number?
            </Text>
            <View style={[styles.phoneRow, { borderBottomColor: theme.outline }]}>
              <TouchableOpacity
                style={[styles.countryPill, { borderRightColor: theme.outline }]}
                activeOpacity={0.8}
                onPress={() => setCountryModalVisible(true)}
              >
                <Text style={[styles.countryText, { color: theme.text }]}>{selectedCountry.label}</Text>
                <Text style={[styles.countryCode, { color: theme.textMuted }]}>{selectedCountry.dial}</Text>
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
            <Text style={[styles.noticeText, { color: theme.textMuted }]}>
              By entering your number, you agree to receive texts about your account, including
              verification codes and important updates.
            </Text>
            <View style={styles.helperRow}>
              <Ionicons name="information-circle-outline" size={14} color={theme.accent} />
              <Text style={[styles.helperText, { color: theme.accent }]}>
                Tip: Confirm your country code matches your number.
              </Text>
            </View>
            <Text style={[styles.noticeText, { color: theme.textMuted }]}>
              Message frequency varies. Reply STOP to cancel.
            </Text>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.tint },
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Next</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.promptTitle, { color: theme.text }]}>Enter your code</Text>
            <Text style={[styles.description, { color: theme.textMuted }]}>
              We sent a 6-digit code to {selectedCountry.dial} {phoneNumber}
            </Text>
            
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.text }]}>Verification Code</Text>
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
              
              {/* Confidence score intentionally hidden in UI (internal only). */}
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: theme.tint },
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleVerifyCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Verify Code</Text>
                  </>
                )}
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
        </View>
      </View>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 8,
  },
  panel: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Fonts?.sans,
    letterSpacing: 0.2,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  promptTitle: {
    fontSize: 30,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.2,
    marginBottom: 18,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 14,
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 12,
    borderRightWidth: 1,
  },
  countryText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  countryCode: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
    paddingHorizontal: 12,
    fontFamily: 'Manrope_500Medium',
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
    fontFamily: 'Manrope_400Regular',
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    fontFamily: 'Manrope_400Regular',
    fontStyle: 'italic',
  },
  helperRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  description: {
    fontSize: 16,
    textAlign: 'left',
    marginBottom: 30,
    lineHeight: 24,
    fontFamily: 'Manrope_400Regular',
  },
  inputContainer: {
    width: '100%',
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 4,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },
  resendButton: {
    padding: 12,
    alignItems: 'center',
  },
  resendText: {
    color: '#007AFF',
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
