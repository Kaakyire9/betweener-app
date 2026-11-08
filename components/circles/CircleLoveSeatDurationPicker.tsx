import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CircleLoveSeatDurationHours } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

const OPTIONS: CircleLoveSeatDurationHours[] = [12, 24, 48];

export default function CircleLoveSeatDurationPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CircleLoveSeatDurationHours;
  onChange: (value: CircleLoveSeatDurationHours) => void;
  disabled?: boolean;
}) {
  const palette = useCirclePulsePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View accessibilityRole="radiogroup" style={styles.options}>
      {OPTIONS.map((hours) => {
        const selected = value === hours;
        return (
          <Pressable
            key={hours}
            accessibilityRole="radio"
            accessibilityLabel={`${hours} hours`}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onChange(hours)}
          >
            <Text style={[styles.text, selected && styles.textSelected]}>{hours}h</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (palette: CirclePulsePalette) => StyleSheet.create({
  options: { flexDirection: 'row', gap: 8 },
  option: {
    minWidth: 54,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
  },
  optionSelected: { borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft },
  text: { color: palette.textMuted, fontSize: 11, fontWeight: '800' },
  textSelected: { color: palette.purple, fontWeight: '900' },
});
