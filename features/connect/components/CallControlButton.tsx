import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors } from '@/constants/theme';

export function CallControlButton({ label, icon, onPress, danger = false, selected = false, disabled = false, compact = false, lounge = false, displayLabel }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress(): void;
  danger?: boolean; selected?: boolean; disabled?: boolean; compact?: boolean;
  lounge?: boolean; displayLabel?: string;
}) {
  if (lounge && !compact) return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.lounge, disabled && styles.disabled, pressed && styles.pressed]}>
    <LinearGradient colors={danger ? ['#F77A82', '#CE3343', '#8F2434'] : selected ? ['#64D9D0', '#267F86', '#8C70B1'] : ['#35666B', '#193B43', '#514664']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.disc, { borderColor: danger ? '#FF9099' : selected ? '#A2E5DE' : '#638D92' }]}>
      <Ionicons accessible={false} name={icon} color="#F3F2E9" size={28} style={danger ? { transform: [{ rotate: '135deg' }] } : undefined} />
    </LinearGradient>
    <Text style={styles.loungeLabel}>{displayLabel ?? label}</Text>
  </Pressable>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }}
    disabled={disabled} onPress={onPress} hitSlop={compact ? 3 : undefined}
    style={({ pressed }) => [styles.control, compact && styles.compact, danger && (compact ? styles.compactDanger : styles.danger),
      selected && (compact ? styles.compactSelected : styles.selected), disabled && styles.disabled, pressed && styles.pressed]}>
    <Ionicons name={icon} color={selected && compact && !danger ? '#102B2D' : Colors.dark.text} size={compact ? 23 : 25}
      style={compact && danger ? { transform: [{ rotate: '135deg' }] } : undefined} />
    {!compact && <Text style={styles.label}>{label}</Text>}
  </Pressable>;
}
const styles = StyleSheet.create({
  lounge: { minWidth: 70, minHeight: 88, maxWidth: 120, alignItems: 'center', gap: 8 },
  disc: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  loungeLabel: { color: '#E1E9E0', fontSize: 13, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  control: { minWidth: 82, minHeight: 82, borderRadius: 28, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.dark.backgroundSubtle, borderWidth: 1, borderColor: Colors.dark.outline },
  compact: { minWidth: 46, minHeight: 46, width: 46, height: 48, borderRadius: 24, padding: 0, borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.12)' },
  danger: { backgroundColor: '#9F343F', borderColor: Colors.dark.danger }, compactDanger: { backgroundColor: '#D93C50' },
  selected: { backgroundColor: Colors.dark.tint, borderColor: Colors.dark.secondary }, compactSelected: { backgroundColor: '#D1F4ED' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 },
  label: { color: Colors.dark.text, fontSize: 13, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
});
