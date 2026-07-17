import { Colors } from '@/constants/theme';
import {
  CLOSURE_REFLECTION_OPTIONS,
  type ClosureReflectionReason,
} from '@/lib/intents/closure-to-clarity';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Theme = typeof Colors.light;

type ClosureReflectionChipsProps = {
  selected: ClosureReflectionReason[];
  theme: Theme;
  isDark: boolean;
  disabled?: boolean;
  onChange: (selected: ClosureReflectionReason[]) => void;
};

export default function ClosureReflectionChips({
  selected,
  theme,
  isDark,
  disabled = false,
  onChange,
}: ClosureReflectionChipsProps) {
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const toggle = (reason: ClosureReflectionReason) => {
    if (disabled) return;
    if (selected.includes(reason)) {
      onChange(selected.filter((value) => value !== reason));
      return;
    }
    if (selected.length >= 2) return;
    onChange([...selected, reason]);
  };

  return (
    <View>
      <View style={styles.headingRow}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.tint }]}>PRIVATE REFLECTION</Text>
          <Text style={[styles.title, { color: theme.text }]}>What drew you in?</Text>
        </View>
        <View style={[styles.counterPill, { borderColor: theme.outline, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF99' }]}>
          <Text style={[styles.counter, { color: theme.textMuted }]}>{selected.length}/2</Text>
        </View>
      </View>
      <Text style={[styles.support, { color: theme.textMuted }]}>
        Choose up to two. This stays private and sharpens the direction, the explanation, and the opener.
      </Text>
      <View style={styles.chips}>
        {CLOSURE_REFLECTION_OPTIONS.map((option) => {
          const active = selected.includes(option.key);
          const unavailable = disabled || (!active && selected.length >= 2);
          return (
            <Pressable
              key={option.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active, disabled: unavailable }}
              disabled={unavailable}
              onPress={() => toggle(option.key)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: active ? theme.tint : theme.outline,
                  backgroundColor: active
                    ? theme.tint
                    : isDark
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(255,255,255,0.58)',
                },
                unavailable && styles.chipDisabled,
                pressed && !unavailable && styles.chipPressed,
              ]}
            >
              {active ? (
                <MaterialCommunityIcons name="check" size={15} color={Colors.light.background} />
              ) : null}
              <Text style={[styles.chipText, { color: active ? Colors.light.background : theme.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(_theme: Theme, _isDark: boolean) {
  return StyleSheet.create({
    headingRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    eyebrow: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 1.2,
    },
    title: {
      fontFamily: 'PlayfairDisplay_700Bold',
      fontSize: 26,
      marginTop: 4,
    },
    counterPill: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    counter: {
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
    },
    support: {
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
      marginTop: 16,
    },
    chip: {
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      minHeight: 42,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    chipDisabled: {
      opacity: 0.45,
    },
    chipPressed: {
      opacity: 0.8,
    },
    chipText: {
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
    },
  });
}
