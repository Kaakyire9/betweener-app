import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  checkProfileHandleAvailability,
  getMyProfileHandleState,
  getProfileHandleErrorMessage,
  getProfileHandleReasonMessage,
  normalizeProfileHandleDraft,
  updateMyProfileHandle,
  validateProfileHandleFormat,
  type ProfileHandleState,
} from '@/lib/profile/profile-handle-service';

type Props = {
  visible: boolean;
  onClose: () => void;
  onUpdated?: (state: ProfileHandleState) => void | Promise<void>;
};

type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'owned' | 'unavailable';

type AvailabilityViewState = {
  status: AvailabilityStatus;
  message: string;
};

const INITIAL_AVAILABILITY: AvailabilityViewState = { status: 'idle', message: '' };

const formatChangeDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function ProfileHandleSheet({ visible, onClose, onUpdated }: Props) {
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? 'light') === 'dark';
  const theme = Colors[isDark ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, isDark, insets.bottom), [insets.bottom, isDark, theme]);
  const availabilityRequestRef = useRef(0);
  const [handleState, setHandleState] = useState<ProfileHandleState | null>(null);
  const [draft, setDraft] = useState('');
  const [searchable, setSearchable] = useState(true);
  const [availability, setAvailability] = useState<AvailabilityViewState>(INITIAL_AVAILABILITY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const loadHandleState = async () => {
    const requestId = ++availabilityRequestRef.current;
    setLoading(true);
    setLoadError('');
    setSaveMessage('');
    try {
      const nextState = await getMyProfileHandleState();
      if (requestId !== availabilityRequestRef.current) return;
      setHandleState(nextState);
      setDraft(nextState.username || '');
      setSearchable(nextState.username ? nextState.usernameSearchable : true);
      setAvailability(nextState.username
        ? { status: 'owned', message: 'This handle belongs to you.' }
        : INITIAL_AVAILABILITY);
    } catch (error) {
      if (requestId === availabilityRequestRef.current) {
        setLoadError(getProfileHandleErrorMessage(error));
      }
    } finally {
      if (requestId === availabilityRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      availabilityRequestRef.current += 1;
      setHandleState(null);
      setDraft('');
      setSearchable(true);
      setAvailability(INITIAL_AVAILABILITY);
      setLoadError('');
      setSaveMessage('');
      return;
    }
    void loadHandleState();
  // Loading is deliberately tied to sheet visibility only.
  }, [visible]);

  const normalizedDraft = normalizeProfileHandleDraft(draft);
  const currentUsername = handleState?.username || null;
  const handleChanged = normalizedDraft !== (currentUsername || '');
  const privacyChanged = Boolean(handleState) && searchable !== handleState.usernameSearchable;
  const formatError = validateProfileHandleFormat(normalizedDraft);
  const nextChangeDate = formatChangeDate(handleState?.nextChangeAt || null);

  useEffect(() => {
    if (!visible || loading || !handleState) return;

    const requestId = ++availabilityRequestRef.current;

    if (currentUsername && normalizedDraft === currentUsername) {
      setAvailability({ status: 'owned', message: 'This handle belongs to you.' });
      return;
    }

    if (formatError) {
      setAvailability({ status: 'unavailable', message: formatError });
      return;
    }

    if (currentUsername && !handleState.canRename) {
      setAvailability({
        status: 'unavailable',
        message: nextChangeDate
          ? `Your next handle change opens ${nextChangeDate}.`
          : 'Your handle is still inside its change window.',
      });
      return;
    }

    setAvailability({ status: 'checking', message: 'Checking this handle...' });
    const timer = setTimeout(() => {
      void checkProfileHandleAvailability(normalizedDraft)
        .then((result) => {
          if (requestId !== availabilityRequestRef.current) return;
          if (result.available) {
            setAvailability({ status: 'available', message: `@${result.username} is yours to claim.` });
          } else {
            setAvailability({
              status: 'unavailable',
              message: getProfileHandleReasonMessage(result.reason),
            });
          }
        })
        .catch((error) => {
          if (requestId === availabilityRequestRef.current) {
            setAvailability({ status: 'unavailable', message: getProfileHandleErrorMessage(error) });
          }
        });
    }, 360);

    return () => clearTimeout(timer);
  }, [currentUsername, formatError, handleState, loading, nextChangeDate, normalizedDraft, visible]);

  const canSaveHandle = handleChanged
    ? availability.status === 'available' && (!currentUsername || handleState?.canRename === true)
    : privacyChanged;
  const canSubmit = Boolean(handleState && !saving && canSaveHandle);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const nextState = await updateMyProfileHandle(normalizedDraft, searchable);
      setHandleState(nextState);
      setDraft(nextState.username || '');
      setSearchable(nextState.usernameSearchable);
      setAvailability({ status: 'owned', message: 'This handle belongs to you.' });
      setSaveMessage(handleChanged ? `@${nextState.username} is now yours.` : 'Your discoverability preference is saved.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      await onUpdated?.(nextState);
    } catch (error) {
      setSaveMessage(getProfileHandleErrorMessage(error));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const statusColor = availability.status === 'available' || availability.status === 'owned'
    ? theme.tint
    : availability.status === 'unavailable'
      ? theme.danger
      : theme.textMuted;
  const statusIcon = availability.status === 'available' || availability.status === 'owned'
    ? 'check-decagram-outline'
    : availability.status === 'unavailable'
      ? 'alert-circle-outline'
      : 'progress-clock';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={saving ? undefined : onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} />
        <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <BlurViewSafe intensity={46} tint={isDark ? 'dark' : 'light'} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Your Betweener handle</Text>
                <Text style={styles.title}>A name people remember.</Text>
                <Text style={styles.subtitle}>Your real name stays central. Your handle simply makes finding you easier.</Text>
              </View>
              <TouchableOpacity accessibilityLabel="Close handle settings" style={styles.closeButton} onPress={onClose} disabled={saving}>
                <MaterialCommunityIcons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={theme.tint} />
                <Text style={styles.loadingText}>Preparing your handle...</Text>
              </View>
            ) : loadError ? (
              <View style={styles.errorState}>
                <MaterialCommunityIcons name="at" size={30} color={theme.tint} />
                <Text style={styles.errorTitle}>Your handle is almost ready</Text>
                <Text style={styles.errorText}>{loadError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => void loadHandleState()}>
                  <Text style={styles.retryButtonText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <View style={styles.signatureCard}>
                  <View style={styles.orbitLarge} />
                  <View style={styles.orbitSmall} />
                  <View style={styles.signatureGlow} />
                  <Text style={styles.signatureLabel}>Your signature in Betweener</Text>
                  <Text style={styles.signatureHandle} numberOfLines={1} adjustsFontSizeToFit>
                    @{normalizedDraft || 'yourname'}
                  </Text>
                  <Text style={styles.signatureFootnote}>Recognisable. Searchable only when you choose.</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{currentUsername ? 'Edit your handle' : 'Claim your handle'}</Text>
                  <View style={[styles.inputShell, availability.status === 'available' && styles.inputShellAvailable]}>
                    <Text style={styles.atPrefix}>@</Text>
                    <TextInput
                      accessibilityLabel="Betweener handle"
                      value={draft}
                      onChangeText={(value) => {
                        setSaveMessage('');
                        setDraft(value.replace(/^@+/, '').toLowerCase());
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={24}
                      placeholder="yourname"
                      placeholderTextColor={theme.textMuted}
                      selectionColor={theme.tint}
                      style={styles.input}
                      textContentType="username"
                    />
                    {availability.status === 'checking' ? (
                      <ActivityIndicator size="small" color={theme.tint} />
                    ) : normalizedDraft ? (
                      <MaterialCommunityIcons name={statusIcon} size={20} color={statusColor} />
                    ) : null}
                  </View>
                  {availability.message ? (
                    <Text style={[styles.availabilityText, { color: statusColor }]}>{availability.message}</Text>
                  ) : null}
                  <Text style={styles.rulesText}>3–24 characters · letters, numbers, periods and underscores · no consecutive punctuation</Text>
                </View>

                <View style={styles.privacyCard}>
                  <View style={styles.privacyIcon}>
                    <MaterialCommunityIcons name="account-search-outline" size={21} color={theme.tint} />
                  </View>
                  <View style={styles.privacyCopy}>
                    <Text style={styles.privacyTitle}>Find me by @handle</Text>
                    <Text style={styles.privacyText}>Allow members to find and recognise you by this handle in eligible searches.</Text>
                  </View>
                  <Switch
                    accessibilityLabel="Allow people to find me by handle"
                    value={searchable}
                    onValueChange={(value) => {
                      setSaveMessage('');
                      setSearchable(value);
                    }}
                    trackColor={{ false: theme.outline, true: isDark ? '#007A7A' : '#72C9C5' }}
                    thumbColor={searchable ? theme.tint : theme.textMuted}
                  />
                </View>

                {currentUsername ? (
                  <View style={styles.promiseRow}>
                    <MaterialCommunityIcons name="shield-lock-outline" size={17} color={theme.accent} />
                    <Text style={styles.promiseText}>
                      {handleState?.canRename
                        ? 'Changing your handle starts a new 30-day protection window.'
                        : `Protected for ${handleState?.cooldownDaysRemaining || 0} more days. Your previous handle rests for 90 days after a rename.`}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.promiseRow}>
                    <MaterialCommunityIcons name="shield-check-outline" size={17} color={theme.accent} />
                    <Text style={styles.promiseText}>Handles are protected against reserved names, impersonation and rapid changes.</Text>
                  </View>
                )}

                {saveMessage ? (
                  <Text style={[styles.saveMessage, { color: saveMessage.startsWith('@') || saveMessage.includes('saved') ? theme.tint : theme.danger }]}>
                    {saveMessage}
                  </Text>
                ) : null}

                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={!canSubmit}
                  style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
                  onPress={() => void submit()}
                >
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <MaterialCommunityIcons name={currentUsername ? 'check' : 'at'} size={19} color="#fff" />
                      <Text style={styles.primaryButtonText}>
                        {handleChanged ? (currentUsername ? 'Change handle' : 'Claim this handle') : 'Save discoverability'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </BlurViewSafe>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean, bottomInset: number) => StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: isDark ? 'rgba(0,8,10,0.76)' : 'rgba(20,14,10,0.38)' },
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: '88%',
    maxHeight: 760,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Math.max(bottomInset, 14),
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: isDark ? 'rgba(91,193,187,0.28)' : 'rgba(0,128,128,0.22)',
    backgroundColor: isDark ? 'rgba(10,29,30,0.96)' : 'rgba(250,241,232,0.97)',
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: theme.outline, marginBottom: 13 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 15 },
  headerCopy: { flex: 1, gap: 4 },
  eyebrow: { color: theme.tint, fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 26, lineHeight: 32 },
  subtitle: { color: theme.textMuted, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 26 },
  errorTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, textAlign: 'center' },
  errorText: { color: theme.textMuted, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retryButton: { marginTop: 6, minHeight: 42, paddingHorizontal: 22, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint },
  retryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  content: { gap: 16, paddingBottom: 8 },
  signatureCard: { minHeight: 178, alignItems: 'center', justifyContent: 'center', padding: 22, borderRadius: 24, borderWidth: 1, borderColor: isDark ? 'rgba(155,124,200,0.46)' : 'rgba(125,91,166,0.34)', backgroundColor: isDark ? '#121C2D' : '#F0E8F6', overflow: 'hidden' },
  orbitLarge: { position: 'absolute', width: 260, height: 112, borderRadius: 130, borderWidth: 1, borderColor: isDark ? 'rgba(91,193,187,0.18)' : 'rgba(0,128,128,0.16)', transform: [{ rotate: '-9deg' }] },
  orbitSmall: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: isDark ? 'rgba(155,124,200,0.25)' : 'rgba(125,91,166,0.2)' },
  signatureGlow: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: isDark ? 'rgba(0,160,160,0.10)' : 'rgba(0,128,128,0.08)' },
  signatureLabel: { color: theme.tint, fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 1.35, textTransform: 'uppercase' },
  signatureHandle: { maxWidth: '100%', marginTop: 10, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 34, lineHeight: 42 },
  signatureFootnote: { marginTop: 9, color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, textAlign: 'center' },
  inputGroup: { gap: 7 },
  inputLabel: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  inputShell: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  inputShellAvailable: { borderColor: theme.tint },
  atPrefix: { color: theme.tint, fontFamily: 'Manrope_700Bold', fontSize: 18 },
  input: { flex: 1, minWidth: 0, color: theme.text, fontFamily: 'Manrope_600SemiBold', fontSize: 16, paddingVertical: 0 },
  availabilityText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, lineHeight: 16 },
  rulesText: { color: theme.textMuted, fontFamily: 'Manrope_400Regular', fontSize: 10, lineHeight: 15 },
  privacyCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  privacyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(0,160,160,0.12)' : 'rgba(0,128,128,0.10)' },
  privacyCopy: { flex: 1, gap: 3 },
  privacyTitle: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  privacyText: { color: theme.textMuted, fontFamily: 'Manrope_400Regular', fontSize: 10.5, lineHeight: 15 },
  promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 },
  promiseText: { flex: 1, color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 17 },
  saveMessage: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, textAlign: 'center' },
  primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, backgroundColor: theme.tint },
  primaryButtonDisabled: { opacity: 0.38 },
  primaryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 14 },
});
