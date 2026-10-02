import { Colors } from '@/constants/theme';
import type { ChatMediaRejectionNotice } from '@/lib/chat/moderation/chat-media-rejection-notice';
import { captureMessage } from '@/lib/telemetry/sentry';
import { openExternalUrl, TRUST_LINKS } from '@/lib/trust-links';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Theme = typeof Colors.light;
type DismissReason = 'auto' | 'choose_another' | 'continued' | 'manual';

type Props = {
  notice: ChatMediaRejectionNotice;
  theme: Theme;
  isDark: boolean;
  onDismiss: (reason: DismissReason) => void;
  onChooseAnother: () => void;
  autoDismissMs?: number;
  dismissWhenContinued?: boolean;
};

export const CHAT_MEDIA_SAFETY_NOTICE_AUTO_DISMISS_MS = 8_000;

const withAlpha = (hex: string, alpha: number) => {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const channel = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${value}${channel}`;
};

export default function ChatMediaSafetyNotice({
  notice,
  theme,
  isDark,
  onDismiss,
  onChooseAnother,
  autoDismissMs = CHAT_MEDIA_SAFETY_NOTICE_AUTO_DISMISS_MS,
  dismissWhenContinued = false,
}: Props) {
  const [whyVisible, setWhyVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;
  const dismissedRef = useRef(false);
  const completeDismissRef = useRef<(() => void) | null>(null);
  const onDismissRef = useRef(onDismiss);
  const onChooseAnotherRef = useRef(onChooseAnother);

  onDismissRef.current = onDismiss;
  onChooseAnotherRef.current = onChooseAnother;

  const styles = useMemo(() => createStyles(theme, isDark), [isDark, theme]);

  const finishDismiss = useCallback((reason: DismissReason, after?: () => void) => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    const complete = () => {
      captureMessage('chat_media_rejection_dismissed', {
        surface: 'chat',
        attachment_type: notice.attachmentType,
        reason_code_category: notice.reasonCategory,
        view_once: notice.viewOnce,
        dismiss_reason: reason,
      });
      onDismissRef.current(reason);
      after?.();
    };
    completeDismissRef.current = complete;
    if (reduceMotionRef.current) {
      completeDismissRef.current = null;
      complete();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      const pending = completeDismissRef.current;
      completeDismissRef.current = null;
      pending?.();
    });
  }, [notice.attachmentType, notice.reasonCategory, notice.viewOnce, progress]);

  useEffect(() => {
    dismissedRef.current = false;
    let active = true;
    const updateReduceMotion = (enabled: boolean) => {
      if (!active) return;
      reduceMotionRef.current = enabled;
      setReduceMotion(enabled);
      if (enabled) {
        progress.stopAnimation();
        if (dismissedRef.current && completeDismissRef.current) {
          progress.setValue(0);
          const pending = completeDismissRef.current;
          completeDismissRef.current = null;
          pending();
        } else {
          progress.setValue(1);
        }
      }
    };
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!active) return;
        updateReduceMotion(enabled);
        if (enabled) return;
        progress.setValue(0);
        Animated.timing(progress, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      })
      .catch(() => {
        if (!active) return;
        progress.setValue(1);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', updateReduceMotion);
    captureMessage('chat_media_moderation_rejected_ui_shown', {
      surface: 'chat',
      attachment_type: notice.attachmentType,
      reason_code_category: notice.reasonCategory,
      view_once: notice.viewOnce,
    });
    return () => {
      active = false;
      completeDismissRef.current = null;
      progress.stopAnimation();
      subscription.remove();
    };
  }, [notice.id, notice.attachmentType, notice.reasonCategory, notice.viewOnce, progress]);

  useEffect(() => {
    if (whyVisible || dismissedRef.current) return undefined;
    const timer = setTimeout(() => finishDismiss('auto'), autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, finishDismiss, whyVisible]);

  useEffect(() => {
    if (dismissWhenContinued) finishDismiss('continued');
  }, [dismissWhenContinued, finishDismiss]);

  const chooseAnother = useCallback(() => {
    captureMessage('chat_media_rejection_choose_another', {
      surface: 'chat',
      attachment_type: notice.attachmentType,
      reason_code_category: notice.reasonCategory,
      view_once: notice.viewOnce,
    });
    setWhyVisible(false);
    finishDismiss('choose_another', () => onChooseAnotherRef.current());
  }, [finishDismiss, notice]);

  const openWhy = useCallback(() => {
    captureMessage('chat_media_rejection_why_opened', {
      surface: 'chat',
      attachment_type: notice.attachmentType,
      reason_code_category: notice.reasonCategory,
      view_once: notice.viewOnce,
    });
    setWhyVisible(true);
  }, [notice]);

  return (
    <>
      <Animated.View
        testID="chat-media-safety-notice"
        accessible
        accessibilityRole="alert"
        accessibilityLabel="Photo not sent. This photo doesn't meet Betweener's media guidelines."
        style={[
          styles.card,
          {
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.iconSurface}>
          <MaterialCommunityIcons name="shield-alert-outline" size={20} color={theme.tint} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Photo not sent</Text>
          <Text style={styles.body}>This photo doesn’t meet Betweener’s media guidelines.</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose another photo"
              hitSlop={8}
              onPress={chooseAnother}
              style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
            >
              <Text style={styles.primaryActionText}>Choose another</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Learn why this photo was not sent"
              hitSlop={8}
              onPress={openWhy}
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.actionPressed]}
            >
              <Text style={styles.secondaryActionText}>Learn why</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <Modal
        transparent
        visible={whyVisible}
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setWhyVisible(false)}
      >
        <Pressable
          testID="chat-media-safety-why-backdrop"
          style={styles.backdrop}
          onPress={() => setWhyVisible(false)}
        >
          <Pressable
            testID="chat-media-safety-why-sheet"
            accessibilityViewIsModal
            style={styles.sheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.handle} />
            <View style={styles.sheetIcon}>
              <MaterialCommunityIcons name="shield-outline" size={24} color={theme.tint} />
            </View>
            <Text style={styles.sheetTitle}>Why wasn’t my photo sent?</Text>
            <Text style={styles.sheetBody}>
              Betweener doesn’t allow nudity, explicit sexual content, prohibited contact promotion,
              or certain unsafe material in chat attachments.
            </Text>
            <Text style={styles.sheetSecondary}>Choose another photo to continue your conversation.</Text>
            <Pressable style={styles.sheetPrimaryButton} onPress={chooseAnother} accessibilityRole="button">
              <Text style={styles.sheetPrimaryButtonText}>Choose another photo</Text>
            </Pressable>
            <Pressable
              style={styles.sheetButton}
              onPress={() => void openExternalUrl(TRUST_LINKS.communityGuidelines)}
              accessibilityRole="link"
            >
              <Text style={styles.sheetButtonText}>View Community Guidelines</Text>
            </Pressable>
            <Pressable style={styles.sheetButton} onPress={() => setWhyVisible(false)} accessibilityRole="button">
              <Text style={styles.sheetButtonText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  card: {
    marginHorizontal: 18,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 11,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: withAlpha(theme.tint, isDark ? 0.2 : 0.16),
    backgroundColor: theme.backgroundSubtle,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.2 : 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  iconSurface: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.1),
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: theme.text, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  body: { color: theme.textMuted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  primaryAction: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: 13,
    backgroundColor: theme.tint,
  },
  primaryActionText: { color: Colors.light.background, fontSize: 14, fontWeight: '700' },
  secondaryAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 },
  secondaryActionText: { color: theme.tint, fontSize: 14, fontWeight: '600' },
  actionPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.outline,
    backgroundColor: theme.backgroundSubtle,
  },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: theme.outline, marginBottom: 18 },
  sheetIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(theme.tint, 0.14) },
  sheetTitle: { color: theme.text, fontSize: 21, lineHeight: 27, fontWeight: '700', marginTop: 14 },
  sheetBody: { color: theme.text, fontSize: 15, lineHeight: 22, marginTop: 10 },
  sheetSecondary: { color: theme.textMuted, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  sheetPrimaryButton: { minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint },
  sheetPrimaryButtonText: { color: Colors.light.background, fontSize: 15, fontWeight: '700' },
  sheetButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  sheetButtonText: { color: theme.tint, fontSize: 15, fontWeight: '600' },
});
