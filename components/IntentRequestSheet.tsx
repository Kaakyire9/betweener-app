import { Colors } from '@/constants/theme';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import SignatureSystemBubble from '@/components/signature/SignatureSystemBubble';
import { showBetweenerAlert } from '@/components/ui/BetweenerAlertHost';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { createIntentRequestOfflineSafe } from '@/lib/intents/offline-actions';
import { isLikelyNetworkError } from '@/lib/network';
import { useResponsiveMetrics, type ResponsiveMetrics } from '@/lib/responsive';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

type IntentRequestType = 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';

type IntentRequestSheetProps = {
  visible: boolean;
  onClose: () => void;
  recipientId?: string | null;
  recipientName?: string | null;
  defaultType?: IntentRequestType;
  prefillMessage?: string | null;
  metadata?: Record<string, unknown>;
  onSent?: (requestId: string | null) => void;
};

const optionLabels: { type: IntentRequestType; label: string; subtitle: string; icon: string }[] = [
  { type: 'connect', label: 'Ask to chat', subtitle: 'Start a direct connection', icon: 'message-outline' },
  { type: 'like_with_note', label: 'Like with message', subtitle: 'Add a short message', icon: 'text-box-plus-outline' },
  { type: 'circle_intro', label: 'Circle intro', subtitle: 'Lead with your shared circle', icon: 'account-group-outline' },
];

export default function IntentRequestSheet({
  visible,
  onClose,
  recipientId,
  recipientName,
  defaultType,
  prefillMessage,
  metadata,
  onSent,
}: IntentRequestSheetProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const responsive = useResponsiveMetrics();
  const styles = useMemo(() => createStyles(theme, isDark, responsive), [theme, isDark, responsive]);
  const { profile, user } = useAuth();
  const myProfileId = profile?.id ? String(profile.id) : null;
  const snapshotOwnerIds = useMemo(
    () => [myProfileId, profile?.id ?? null, user?.id ?? null, (profile as any)?.user_id ?? null],
    [myProfileId, profile?.id, user?.id, profile],
  );
  const [selectedType, setSelectedType] = useState<IntentRequestType>('connect');
  const [message, setMessage] = useState('');
  const [suggestedPlace, setSuggestedPlace] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const allowCircle = metadata?.source === 'circles';
  const isSuggested = metadata?.source === 'intent_suggested';
  const circleName = useMemo(() => {
    const raw = typeof metadata?.circle_name === 'string' ? metadata.circle_name.trim() : '';
    return raw.length ? raw : null;
  }, [metadata]);
  const options = useMemo(
    () => {
      const base = allowCircle ? optionLabels : optionLabels.filter((opt) => opt.type !== 'circle_intro');
      if (!allowCircle) return base;
      return [...base].sort((left, right) => {
        if (left.type === 'circle_intro') return -1;
        if (right.type === 'circle_intro') return 1;
        return 0;
      });
    },
    [allowCircle],
  );

  useEffect(() => {
    if (visible) {
      const nextDefault =
        defaultType && options.some((option) => option.type === defaultType)
          ? defaultType
          : 'connect';
      setSelectedType(nextDefault);
      setMessage(typeof prefillMessage === 'string' ? prefillMessage : '');
      setSuggestedPlace('');
    }
  }, [defaultType, options, prefillMessage, visible]);

  const suggested = useMemo(() => {
    const raw = typeof prefillMessage === 'string' ? prefillMessage.trim() : '';
    return raw.length ? raw : null;
  }, [prefillMessage]);

  const handleSubmit = async () => {
    if (!recipientId) {
      showBetweenerAlert({
        title: 'Request',
        message: 'Select a profile to send a request.',
        tone: 'warning',
      });
      return;
    }
    if (!myProfileId) {
      showBetweenerAlert({
        title: 'Request',
        message: 'Please finish setting up your profile and try again.',
        tone: 'warning',
      });
      return;
    }
    setSubmitting(true);
    const requestPayload = {
      recipientId,
      type: selectedType,
      message: message.trim() ? message.trim() : null,
      suggestedTime: null,
      suggestedPlace: selectedType === 'date_request' && suggestedPlace.trim() ? suggestedPlace.trim() : null,
      metadata: metadata ?? {},
      actorProfileId: myProfileId,
      snapshotOwnerIds,
    };
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Premium guardrail: only 1 pending request per pair (any direction/type).
      // We still enforce this server-side, but checking here prevents confusing "success" states and double-taps.
      const { data: pendingBetween, error: pendingErr } = await supabase
        .from('intent_requests')
        .select('id,actor_id,recipient_id,type,expires_at,status')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .or(
          `and(actor_id.eq.${myProfileId},recipient_id.eq.${recipientId}),and(actor_id.eq.${recipientId},recipient_id.eq.${myProfileId})`,
        )
        .limit(1);
      if (pendingErr) throw pendingErr;
      if (Array.isArray(pendingBetween) && pendingBetween.length > 0) {
        const existing = pendingBetween[0] as any;
        const incoming = String(existing?.actor_id) === String(recipientId);
        const msg = incoming
          ? `You already have a request from ${recipientName || 'this person'}. Open Intent to respond.`
          : `You've already placed a request to ${recipientName || 'this person'}. Please wait for their response.`;
        showBetweenerAlert({
          title: 'Request pending',
          message: msg,
          tone: 'info',
        });
        return;
      }

      const result = await createIntentRequestOfflineSafe(requestPayload);
      if (result.status === 'queued') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showBetweenerAlert({
          title: 'Request queued',
          message: `Your request to ${recipientName || 'connect'} will send when you're back online.`,
          tone: 'success',
        });
        onSent?.(null);
        onClose();
        return;
      }
      if (result.requestId) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showBetweenerAlert({
          title: 'Request sent',
          message: `Your request to ${recipientName || 'connect'} is on the way.`,
          tone: 'success',
        });
        onSent?.(result.requestId);
        onClose();
      }
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        await createIntentRequestOfflineSafe(requestPayload);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showBetweenerAlert({
          title: 'Request queued',
          message: `Your request to ${recipientName || 'connect'} will send when you're back online.`,
          tone: 'success',
        });
        onSent?.(null);
        onClose();
        return;
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Supabase errors are often plain objects (not Error instances).
      const supaMessage =
        err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string'
          ? (err as any).message
          : null;
      const supaDetails =
        err && typeof err === 'object' && 'details' in err && typeof (err as any).details === 'string'
          ? (err as any).details
          : null;
      const msg = err instanceof Error ? err.message : supaMessage || 'Please try again.';
      // Friendly UX for common guardrail errors.
      const friendly =
        msg && /dating_not_eligible/i.test(msg)
          ? 'This dating action is not available for this profile right now.'
          : msg && /already have a request from them|open intent to respond/i.test(msg)
          ? `You already have a request from ${recipientName || 'this person'}. Open Intent to respond.`
          : msg && /already sent|already placed|request pending/i.test(msg)
            ? `You've already placed a request to ${recipientName || 'this person'}. Please wait for their response.`
            : msg && /already matched/i.test(msg)
              ? 'You are already matched. Continue the conversation in chat.'
              : null;
      showBetweenerAlert({
        title: 'Request failed',
        message: friendly ?? (supaDetails ? `${msg}\n\n${supaDetails}` : msg),
        tone: 'error',
      });
      // Surface the full object for debugging/telemetry.
      console.error('[intent] rpc_create_intent_request failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        Keyboard.dismiss();
        onClose();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropPress}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        />
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 6}
          style={{ width: '100%', justifyContent: 'flex-end' }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <BlurViewSafe
              intensity={40}
              tint={isDark ? 'dark' : 'light'}
              style={styles.sheet}
            >
              <View style={styles.handle} />
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetContent}
              >
              <View style={styles.header}>
                <Text style={styles.title}>{isSuggested ? 'Send intent' : 'Send request'}</Text>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    onClose();
                  }}
                  activeOpacity={0.85}
                  style={styles.closeButton}
                >
                  <MaterialCommunityIcons name="close" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>
                {recipientName ? `To ${recipientName}. ` : ''}
                {allowCircle
                  ? `${circleName ? `You both share ${circleName}. ` : 'You both share this Circle. '}Choose how you want to connect.`
                  : 'Choose how you want to connect.'}
              </Text>
              <SignatureSystemBubble system={allowCircle ? 'warm_intro' : 'intent'} compact />
              {allowCircle ? (
                <View style={styles.contextBanner}>
                  <MaterialCommunityIcons name="account-group-outline" size={15} color={theme.tint} />
                  <Text style={styles.contextBannerText}>
                    {circleName ? `Shared circle context will travel with this intro: ${circleName}.` : 'Shared circle context will travel with this intro.'}
                  </Text>
                </View>
              ) : null}

              <View style={styles.options}>
                {options.map((opt) => (
                  <TouchableOpacity
                    key={opt.type}
                    style={[styles.optionRow, selectedType === opt.type && styles.optionRowActive]}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectedType(opt.type);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.optionIcon, selectedType === opt.type && styles.optionIconActive]}>
                      <MaterialCommunityIcons name={opt.icon as any} size={18} color={theme.tint} />
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionTitle}>{opt.label}</Text>
                      <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Message (optional)</Text>
                {suggested ? (
                  <View style={styles.suggestedRow}>
                    <View style={styles.suggestedLeft}>
                      <MaterialCommunityIcons name="star-four-points" size={14} color={theme.tint} />
                      <Text style={styles.suggestedLabel}>Suggested opener</Text>
                    </View>
                    <View style={styles.suggestedActions}>
                      <TouchableOpacity
                        style={styles.suggestedAction}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setMessage(suggested);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.suggestedActionText}>Use</Text>
                      </TouchableOpacity>
                      {message.trim().length ? (
                        <TouchableOpacity
                          style={styles.suggestedAction}
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setMessage('');
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.suggestedActionText}>Clear</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Add a short message"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  multiline
                />
              </View>

              {selectedType === 'date_request' ? (
                <View style={styles.inputBlock}>
                  <Text style={styles.inputLabel}>Suggested place (optional)</Text>
                  <TextInput
                    value={suggestedPlace}
                    onChangeText={setSuggestedPlace}
                    placeholder="e.g., Coffee at Osu"
                    placeholderTextColor={theme.textMuted}
                    style={styles.input}
                  />
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={submitting}
              >
                <Text style={styles.submitText}>{submitting ? 'Sending...' : 'Send request'}</Text>
              </TouchableOpacity>
              </ScrollView>
            </BlurViewSafe>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean, responsive: ResponsiveMetrics) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(4, 10, 11, 0.58)' : 'rgba(31, 42, 42, 0.34)',
      justifyContent: 'flex-end',
    },
    backdropPress: { flex: 1 },
    sheet: {
      backgroundColor: isDark ? 'rgba(7, 30, 34, 0.82)' : 'rgba(255, 249, 243, 0.88)',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      maxHeight: Math.round(responsive.usableHeight * (responsive.compactHeight ? 0.82 : 0.74)),
      paddingHorizontal: responsive.compactWidth ? 14 : 16,
      paddingTop: responsive.compactHeight ? 10 : 12,
      paddingBottom: Math.max(responsive.insets.bottom + 8, Platform.OS === 'android' ? 10 : 16),
      borderWidth: 1,
      borderColor: isDark ? 'rgba(155, 124, 200, 0.34)' : 'rgba(125, 91, 166, 0.2)',
      borderBottomWidth: 0,
      overflow: 'hidden',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(156, 179, 174, 0.4)' : 'rgba(95, 112, 108, 0.28)',
      marginBottom: 10,
    },
    sheetContent: {
      paddingBottom: Platform.OS === 'android' ? 10 : 8,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 18, fontWeight: '800', color: theme.text },
    subtitle: { marginTop: 8, fontSize: 12, color: theme.textMuted },
    contextBanner: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 216, 216, 0.24)' : 'rgba(0, 128, 128, 0.16)',
      backgroundColor: isDark ? 'rgba(0, 160, 160, 0.1)' : 'rgba(0, 128, 128, 0.08)',
    },
    contextBannerText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      color: theme.textMuted,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(232, 240, 237, 0.1)' : 'rgba(95, 112, 108, 0.12)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.38)',
    },
    options: { marginTop: 14, gap: 10 },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(232, 240, 237, 0.08)' : 'rgba(95, 112, 108, 0.1)',
      backgroundColor: isDark ? 'rgba(21, 34, 34, 0.54)' : 'rgba(255, 255, 255, 0.32)',
    },
    optionRowActive: {
      borderColor: theme.tint,
      backgroundColor: isDark ? 'rgba(0, 160, 160, 0.14)' : 'rgba(0, 128, 128, 0.1)',
    },
    optionIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(232, 240, 237, 0.08)' : 'rgba(95, 112, 108, 0.1)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.42)',
    },
    optionIconActive: { borderColor: theme.tint },
    optionInfo: { flex: 1 },
    optionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    optionSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    inputBlock: { marginTop: 14 },
    inputLabel: { fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 6 },
    suggestedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 8,
    },
    suggestedLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    suggestedLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '700' },
    suggestedActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    suggestedAction: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(232, 240, 237, 0.08)' : 'rgba(95, 112, 108, 0.1)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.3)',
    },
    suggestedActionText: { color: theme.tint, fontWeight: '700', fontSize: 12 },
    input: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(232, 240, 237, 0.08)' : 'rgba(95, 112, 108, 0.1)',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 40,
      color: theme.text,
      backgroundColor: isDark ? 'rgba(21, 34, 34, 0.58)' : 'rgba(255, 255, 255, 0.32)',
    },
    submitButton: {
      marginTop: 16,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: theme.tint,
      alignItems: 'center',
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.26 : 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitText: { color: Colors.light.background, fontWeight: '700' },
  });
