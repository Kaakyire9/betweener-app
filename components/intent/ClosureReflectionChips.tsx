import {
  CLOSURE_REFLECTION_OPTIONS,
  type ClosureReflectionReason,
} from '@/lib/intents/closure-to-clarity';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type ClosureReflectionChipsProps = {
  selected: ClosureReflectionReason[];
  disabled?: boolean;
  onChange: (selected: ClosureReflectionReason[]) => void;
};

export default function ClosureReflectionChips({
  selected,
  disabled = false,
  onChange,
}: ClosureReflectionChipsProps) {
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
          <Text style={styles.eyebrow}>PRIVATE REFLECTION</Text>
          <Text style={styles.title}>What drew you in?</Text>
        </View>
        <Text style={styles.counter}>{selected.length}/2</Text>
      </View>
      <Text style={styles.support}>
        Choose up to two. This stays private and only shapes your recommendations.
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
                active && styles.chipActive,
                unavailable && styles.chipDisabled,
                pressed && !unavailable && styles.chipPressed,
              ]}
            >
              {active ? (
                <MaterialCommunityIcons name="check" size={15} color="#061E22" />
              ) : null}
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#63D7D3',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#F6EFE3',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 25,
    marginTop: 4,
  },
  counter: {
    color: 'rgba(246,239,227,0.58)',
    fontSize: 12,
    fontWeight: '700',
  },
  support: {
    color: 'rgba(246,239,227,0.66)',
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
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(99,215,211,0.24)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: '#63D7D3',
    borderColor: '#63D7D3',
  },
  chipDisabled: {
    opacity: 0.42,
  },
  chipPressed: {
    opacity: 0.76,
  },
  chipText: {
    color: 'rgba(246,239,227,0.82)',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#061E22',
  },
});
