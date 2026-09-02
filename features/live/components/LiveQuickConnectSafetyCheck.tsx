import {
  Ban,
  Check,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  LiveQuickConnectSafetyExperience,
  LiveQuickConnectSafetyReason,
} from '../application/index.ts';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

type Props = {
  visible: boolean;
  mandatory: boolean;
  otherName: string;
  busy: boolean;
  error: string | null;
  reportFirst?: boolean;
  onCancel: () => void;
  onSubmit: (
    experience: LiveQuickConnectSafetyExperience,
    reason: LiveQuickConnectSafetyReason | null,
    block: boolean,
  ) => void;
};

const REASONS: readonly { value: LiveQuickConnectSafetyReason; label: string }[] = [
  { value: 'requested_nudity', label: 'Requested nudity or sexual content' },
  { value: 'sexual_pressure', label: 'Sexual pressure or coercion' },
  { value: 'harassment_disrespect', label: 'Harassment or disrespect' },
  { value: 'hate_threats', label: 'Hate speech or threats' },
  { value: 'impersonation_deception', label: 'Impersonation or deception' },
  { value: 'other', label: 'Another safety concern' },
] as const;

export function LiveQuickConnectSafetyCheck({
  visible,
  mandatory,
  otherName,
  busy,
  error,
  reportFirst = false,
  onCancel,
  onSubmit,
}: Props) {
  const [experience, setExperience] = useState<LiveQuickConnectSafetyExperience | null>(null);
  const [reason, setReason] = useState<LiveQuickConnectSafetyReason | null>(null);
  const [block, setBlock] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setExperience(reportFirst ? 'safety_concern' : null);
    setReason(null);
    setBlock(reportFirst);
  }, [reportFirst, visible]);

  const chooseExperience = (next: LiveQuickConnectSafetyExperience) => {
    if (next === 'respectful') {
      onSubmit(next, null, false);
      return;
    }
    setExperience(next);
    setReason(null);
    setBlock(next === 'safety_concern');
  };
  const canSubmit = experience === 'uncomfortable'
    || (experience === 'safety_concern' && reason != null);

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => { if (!mandatory && !busy) onCancel(); }}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.icon}>
              {experience === 'safety_concern'
                ? <ShieldAlert color="#F2B6B6" size={22} />
                : <ShieldCheck color={LIVE_VISUAL.color.gold} size={22} />}
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>PRIVATE SAFETY CHECK</Text>
              <Text style={styles.title}>
                {experience === 'safety_concern' ? 'Tell us what happened' : 'How did this feel?'}
              </Text>
            </View>
            {!mandatory ? (
              <Pressable accessibilityLabel="Close safety check" accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.close}>
                <X color={LIVE_VISUAL.color.textMuted} size={19} />
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.privacy}>Your answer is private. {otherName} will never see it.</Text>

          <ScrollView bounces={false} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {experience == null ? (
              <>
                <View style={styles.choices}>
                  <Choice disabled={busy} icon={Check} label="Respectful" copy="Everything felt okay." onPress={() => chooseExperience('respectful')} />
                  <Choice disabled={busy} icon={ShieldCheck} label="Uncomfortable" copy="Keep us apart and let me choose whether to block." onPress={() => chooseExperience('uncomfortable')} />
                  <Choice danger disabled={busy} icon={ShieldAlert} label="Report a safety concern" copy="End the round and send it to Betweener Safety." onPress={() => chooseExperience('safety_concern')} />
                </View>
                {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>This could not be saved yet. Please try again.</Text> : null}
              </>
            ) : (
              <>
                {experience === 'safety_concern' ? (
                  <View style={styles.reasons}>
                    {REASONS.map((item) => (
                      <Pressable
                        key={item.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: reason === item.value }}
                        disabled={busy}
                        onPress={() => setReason(item.value)}
                        style={[styles.reason, reason === item.value && styles.reasonSelected]}
                      >
                        <View style={[styles.radio, reason === item.value && styles.radioSelected]} />
                        <Text style={styles.reasonText}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.supporting}>We will not pair you with {otherName} again when you block them.</Text>
                )}

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: block }}
                  disabled={busy}
                  onPress={() => setBlock((value) => !value)}
                  style={[styles.blockRow, block && styles.blockRowSelected]}
                >
                  <Ban color={block ? '#F8D8D5' : LIVE_VISUAL.color.textMuted} size={18} />
                  <View style={styles.blockCopy}>
                    <Text style={styles.blockTitle}>Block {otherName}</Text>
                    <Text style={styles.blockBody}>They cannot contact or match with you again.</Text>
                  </View>
                  <View style={[styles.checkbox, block && styles.checkboxSelected]}>
                    {block ? <Check color="#10201C" size={13} /> : null}
                  </View>
                </Pressable>

                {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>This could not be saved yet. Please try again.</Text> : null}

                <View style={styles.actions}>
                  {!mandatory ? (
                    <Pressable disabled={busy} onPress={onCancel} style={styles.secondaryButton}>
                      <Text style={styles.secondaryText}>Cancel</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canSubmit || busy}
                    onPress={() => experience && onSubmit(experience, reason, block)}
                    style={[styles.submitButton, (!canSubmit || busy) && styles.disabled]}
                  >
                    {busy ? <ActivityIndicator color="#10201C" size="small" /> : null}
                    <Text style={styles.submitText}>{experience === 'safety_concern' ? 'End & submit report' : 'Complete safety check'}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Choice({ icon: Icon, label, copy, danger = false, disabled = false, onPress }: {
  icon: typeof Check;
  label: string;
  copy: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.choice, danger && styles.choiceDanger, disabled && styles.disabled]}>
      <View style={[styles.choiceIcon, danger && styles.choiceIconDanger]}>
        <Icon color={danger ? '#F2B6B6' : LIVE_VISUAL.color.gold} size={18} />
      </View>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceTitle, danger && styles.choiceTitleDanger]}>{label}</Text>
        <Text style={styles.choiceBody}>{copy}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#020907CC' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: '#D7B56D45', backgroundColor: '#0B1B17', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D14', borderWidth: 1, borderColor: '#D7B56D40' },
  headerCopy: { flex: 1 },
  eyebrow: { color: LIVE_VISUAL.color.gold, fontSize: 9, letterSpacing: 1.6, fontFamily: 'Manrope_800ExtraBold' },
  title: { marginTop: 3, color: LIVE_VISUAL.color.text, fontSize: 21, fontFamily: 'Manrope_800ExtraBold' },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF0A' },
  privacy: { marginTop: 12, color: LIVE_VISUAL.color.textMuted, fontSize: 11, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  content: { paddingTop: 16, paddingBottom: 8 },
  choices: { gap: 10 },
  choice: { minHeight: 72, borderRadius: 22, borderWidth: 1, borderColor: '#29413B', backgroundColor: '#10231F', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceDanger: { borderColor: '#7A3B3B', backgroundColor: '#2B1C1B' },
  choiceIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D12' },
  choiceIconDanger: { backgroundColor: '#7A3B3B35' },
  choiceCopy: { flex: 1 },
  choiceTitle: { color: LIVE_VISUAL.color.text, fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  choiceTitleDanger: { color: '#F8D8D5' },
  choiceBody: { marginTop: 3, color: LIVE_VISUAL.color.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  reasons: { gap: 8 },
  reason: { minHeight: 45, borderRadius: 17, borderWidth: 1, borderColor: '#29413B', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reasonSelected: { borderColor: '#D7B56D88', backgroundColor: '#D7B56D12' },
  radio: { width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: '#6F827C' },
  radioSelected: { borderWidth: 4, borderColor: LIVE_VISUAL.color.gold },
  reasonText: { flex: 1, color: LIVE_VISUAL.color.text, fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  supporting: { color: LIVE_VISUAL.color.textMuted, fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_500Medium' },
  blockRow: { marginTop: 14, minHeight: 66, borderRadius: 20, borderWidth: 1, borderColor: '#29413B', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockRowSelected: { borderColor: '#8C4C4C', backgroundColor: '#421F1F66' },
  blockCopy: { flex: 1 },
  blockTitle: { color: LIVE_VISUAL.color.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  blockBody: { marginTop: 2, color: LIVE_VISUAL.color.textMuted, fontSize: 9, lineHeight: 13, fontFamily: 'Manrope_500Medium' },
  checkbox: { width: 21, height: 21, borderRadius: 7, borderWidth: 1, borderColor: '#6F827C', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { borderColor: LIVE_VISUAL.color.gold, backgroundColor: LIVE_VISUAL.color.gold },
  actions: { marginTop: 16, flexDirection: 'row', gap: 9 },
  secondaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, borderColor: '#FFFFFF20', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: LIVE_VISUAL.color.textMuted, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  submitButton: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: LIVE_VISUAL.color.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  submitText: { color: '#10201C', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  error: { marginTop: 10, color: '#F2B6B6', fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  disabled: { opacity: 0.45 },
});
