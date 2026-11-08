import { Colors } from '@/constants/theme';
import type { StudioModule } from '@/features/studio/config/studio-modules';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  module: StudioModule;
  theme: typeof Colors.light;
  isDark: boolean;
  badge?: string | null;
  onCreate: () => void;
  onManage: () => void;
};

const TONE_COLORS: Record<StudioModule['tone'], string> = {
  teal: '#13A8A8',
  violet: '#A98ADB',
  gold: '#E4B94D',
  rose: '#F07896',
};

export function StudioModuleCard({ module, theme, isDark, badge, onCreate, onManage }: Props) {
  const tone = TONE_COLORS[module.tone];
  const styles = createStyles(theme, isDark);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: `${tone}1F`, borderColor: `${tone}45` }]}>
          <MaterialCommunityIcons name={module.icon} size={24} color={tone} />
        </View>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{module.title}</Text>
            {badge ? <Text style={[styles.badge, { color: tone }]}>{badge}</Text> : null}
          </View>
          <Text style={styles.detail}>{module.detail}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={module.actionLabel}
          onPress={onCreate}
          style={({ pressed }) => [styles.primaryAction, { backgroundColor: tone }, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="plus" size={17} color="#071E22" />
          <Text style={styles.primaryText}>{module.actionLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={module.manageLabel}
          onPress={onManage}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>{module.manageLabel}</Text>
          <MaterialCommunityIcons name="chevron-right" size={17} color={theme.text} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  card: {
    gap: 16,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.outline,
    backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.78)',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  icon: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 5 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  title: { color: theme.text, fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  badge: { fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Archivo_700Bold' },
  detail: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  primaryAction: { minHeight: 42, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryAction: { minHeight: 42, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: theme.outline },
  primaryText: { color: '#071E22', fontSize: 12, fontFamily: 'Archivo_700Bold' },
  secondaryText: { color: theme.text, fontSize: 12, fontFamily: 'Archivo_700Bold' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
