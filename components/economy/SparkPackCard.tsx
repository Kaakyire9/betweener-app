import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ResolvedSparkPackage } from '@/lib/economy/store/spark-store-service';

type Props = {
  pack: ResolvedSparkPackage;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
};

export function SparkPackCard({ pack, disabled = false, busy = false, onPress }: Props) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
      <View style={styles.copy}>
        <View style={styles.amountRow}>
          <MaterialCommunityIcons name="heart-flash" size={20} color={theme.accent} />
          <Text style={[styles.amount, { color: theme.text }]}>{pack.amount.toLocaleString()} Sparks</Text>
        </View>
        <Text style={[styles.label, { color: theme.textMuted }]}>{pack.label}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Buy ${pack.amount.toLocaleString()} Sparks for ${pack.localizedPrice}`}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: disabled ? theme.outline : theme.tint },
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={styles.buttonText}>{busy ? 'Processing…' : pack.localizedPrice}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 104,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: { flex: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amount: { fontFamily: 'Manrope_700Bold', fontSize: 18 },
  label: { fontFamily: 'Manrope_500Medium', fontSize: 13, marginTop: 6 },
  button: {
    minWidth: 94,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 14 },
  pressed: { opacity: 0.82 },
});
