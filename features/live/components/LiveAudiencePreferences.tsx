import { Check, ChevronRight, Sparkles, UsersRound, X } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveGlassSurface } from './LiveGlassSurface.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type LiveAudiencePreferencesProps = {
  openToIntroductions: boolean;
  busy: boolean;
  onChange: (open: boolean) => void;
};

/**
 * Audience-only preferences stay deliberately separate from public-stage
 * admission. The compact chip preserves the Live canvas; the private sheet
 * gives consent choices enough context without turning them into stage UI.
 */
export function LiveAudiencePreferences({
  openToIntroductions,
  busy,
  onChange,
}: LiveAudiencePreferencesProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  const choose = (next: boolean) => {
    if (busy || next === openToIntroductions) {
      setVisible(false);
      return;
    }
    onChange(next);
    setVisible(false);
  };

  return (
    <>
      <Pressable
        accessibilityHint="Opens your private matching preferences for this Live"
        accessibilityLabel={openToIntroductions ? 'Introductions on' : 'Audience only'}
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.chipPressable, pressed && styles.pressed]}
      >
        <LiveGlassSurface intensity={34} style={styles.chip}>
          <View style={[styles.chipIcon, openToIntroductions && styles.chipIconOpen]}>
            {openToIntroductions
              ? <Sparkles size={14} color={visual.color.purple} />
              : <UsersRound size={14} color={visual.color.textMuted} />}
          </View>
          <View style={styles.chipCopy}>
            <Text style={styles.chipEyebrow}>MY LIVE MODE</Text>
            <Text style={styles.chipLabel}>
              {openToIntroductions ? 'Open to introductions' : 'Audience only'}
            </Text>
          </View>
          <ChevronRight size={16} color={visual.color.textMuted} />
        </LiveGlassSurface>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setVisible(false)}
        transparent
        visible={visible}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close Live preferences"
            onPress={() => setVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <LiveGlassSurface intensity={74} style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View style={styles.headerCopy}>
                  <Text style={styles.sheetEyebrow}>PRIVATE TO YOU</Text>
                  <Text style={styles.sheetTitle}>How would you like to join?</Text>
                </View>
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  onPress={() => setVisible(false)}
                  style={styles.closeButton}
                >
                  <X size={19} color={visual.color.text} />
                </Pressable>
              </View>

              <Text style={styles.sheetIntro}>
                Choose whether the host may privately suggest a thoughtful introduction during this room.
              </Text>

              <PreferenceOption
                active={openToIntroductions}
                description="The host may suggest one private, consent-based introduction."
                disabled={busy}
                icon={<Sparkles size={19} color={visual.color.purple} />}
                onPress={() => choose(true)}
                title="Open to introductions"
              />
              <PreferenceOption
                active={!openToIntroductions}
                description="Enjoy the room without appearing in the Match Desk."
                disabled={busy}
                icon={<UsersRound size={19} color={visual.color.textMuted} />}
                onPress={() => choose(false)}
                title="Audience only"
              />

              <View style={styles.consentNote}>
                <Text style={styles.consentText}>
                  This never puts you on stage. Stage requests are always a separate choice.
                </Text>
              </View>
            </LiveGlassSurface>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PreferenceOption({
  active,
  description,
  disabled,
  icon,
  onPress,
  title,
}: {
  active: boolean;
  description: string;
  disabled: boolean;
  icon: ReactNode;
  onPress: () => void;
  title: string;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        active && styles.optionActive,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.optionIcon}>{icon}</View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <View style={[styles.selection, active && styles.selectionActive]}>
        {active ? <Check size={14} color={visual.color.accentContrast} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  chipPressable: { alignSelf: 'center', maxWidth: '88%' },
  chip: {
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: visual.color.surfaceTranslucent,
    borderColor: visual.color.border,
  },
  chipIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised },
  chipIconOpen: { backgroundColor: visual.color.purpleSoft, borderWidth: 1, borderColor: visual.color.borderStrong },
  chipCopy: { flexShrink: 1 },
  chipEyebrow: { color: visual.color.textMuted, fontSize: 7, letterSpacing: 1.25, fontFamily: 'Manrope_800ExtraBold' },
  chipLabel: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_700Bold' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: visual.color.scrim },
  sheetWrap: { paddingHorizontal: 12 },
  sheet: { borderRadius: 30, padding: 18, gap: 11, backgroundColor: visual.color.surfaceTranslucent, borderColor: visual.color.borderStrong },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1 },
  sheetEyebrow: { color: visual.color.purple, fontSize: 9, letterSpacing: 1.8, fontFamily: 'Manrope_800ExtraBold' },
  sheetTitle: { marginTop: 3, color: visual.color.text, fontSize: 23, fontFamily: 'PlayfairDisplay_700Bold' },
  closeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  sheetIntro: { color: visual.color.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium', marginBottom: 2 },
  option: { minHeight: 78, borderRadius: 20, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  optionActive: { backgroundColor: visual.color.purpleSoft, borderColor: visual.color.borderStrong },
  optionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surface },
  optionCopy: { flex: 1, gap: 3 },
  optionTitle: { color: visual.color.text, fontSize: 14, fontFamily: 'Manrope_700Bold' },
  optionDescription: { color: visual.color.textMuted, fontSize: 11, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  selection: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.color.border },
  selectionActive: { backgroundColor: visual.color.purple, borderColor: visual.color.purple },
  consentNote: { marginTop: 2, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, backgroundColor: visual.color.tealSoft },
  consentText: { color: visual.color.textMuted, textAlign: 'center', fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});
