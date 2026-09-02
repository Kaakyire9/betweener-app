import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  CIRCLE_ENTRY_PRIORITIES,
  CIRCLE_ENTRY_REASONS,
  toggleCircleEntryChoice,
} from '../domain/circle-entry-options';

type Props = {
  visible: boolean;
  circleName: string;
  saving?: boolean;
  onSave: (value: { reasons: string[]; priorities: string[]; optIntoDating: boolean }) => void;
  onSkip: () => void;
};

export function CircleEntryContextSheet({ visible, circleName, saving, onSave, onSkip }: Props) {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];
  const styles = createStyles(theme);
  const [reasons, setReasons] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [optIntoDating, setOptIntoDating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setReasons([]);
    setPriorities([]);
    setOptIntoDating(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <Pressable style={styles.backdrop} onPress={onSkip} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.icon}><MaterialCommunityIcons name="account-group-outline" size={24} color={theme.tint} /></View>
          <Text style={styles.eyebrow}>MAKE THIS CIRCLE YOURS</Text>
          <Text style={styles.title}>What brings you to {circleName}?</Text>
          <Text style={styles.body}>Choose up to three in each group. This helps shape your Circle experience and stays private.</Text>

          <Text style={styles.label}>I’m here to…</Text>
          <View style={styles.chips}>
            {CIRCLE_ENTRY_REASONS.map((item) => <Choice key={item} label={item} selected={reasons.includes(item)} styles={styles} onPress={() => setReasons(toggleCircleEntryChoice(reasons, item))} />)}
          </View>

          <Text style={styles.label}>What matters most?</Text>
          <View style={styles.chips}>
            {CIRCLE_ENTRY_PRIORITIES.map((item) => <Choice key={item} label={item} selected={priorities.includes(item)} styles={styles} onPress={() => setPriorities(toggleCircleEntryChoice(priorities, item))} />)}
          </View>

          <View style={styles.datingRow}>
            <View style={styles.datingCopy}>
              <Text style={styles.datingTitle}>Open to dating discovery here?</Text>
              <Text style={styles.datingBody}>Optional and private. Joining this Circle never opts you in.</Text>
            </View>
            <Switch value={optIntoDating} onValueChange={setOptIntoDating} trackColor={{ true: theme.tint }} />
          </View>

          <TouchableOpacity
            disabled={saving || reasons.length === 0 || priorities.length === 0}
            style={[styles.primary, (saving || reasons.length === 0 || priorities.length === 0) && styles.disabled]}
            onPress={() => onSave({ reasons, priorities, optIntoDating })}
          >
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Personalise my Circle'}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={saving} style={styles.skip} onPress={onSkip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Choice({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof createStyles> }) {
  return <TouchableOpacity style={[styles.choice, selected && styles.choiceSelected]} onPress={onPress}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></TouchableOpacity>;
}

const createStyles = (theme: typeof Colors.light) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.outline },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: theme.outline, marginTop: 10 },
  content: { padding: 22, paddingBottom: 34, gap: 14 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSubtle },
  eyebrow: { color: theme.tint, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 27, lineHeight: 33 },
  body: { color: theme.textMuted, fontSize: 14, lineHeight: 21 },
  label: { marginTop: 4, color: theme.text, fontWeight: '800', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 42, justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: theme.outline, paddingHorizontal: 13, backgroundColor: theme.backgroundSubtle },
  choiceSelected: { borderColor: theme.tint, backgroundColor: theme.tint },
  choiceText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  choiceTextSelected: { color: theme.background, fontWeight: '800' },
  datingRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.outline, padding: 15, backgroundColor: theme.backgroundSubtle },
  datingCopy: { flex: 1, gap: 4 },
  datingTitle: { color: theme.text, fontWeight: '800', fontSize: 14 },
  datingBody: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint, marginTop: 3 },
  primaryText: { color: theme.background, fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.45 },
  skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: theme.textMuted, fontWeight: '700' },
});
