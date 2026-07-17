import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: number;
  accent: string;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
  borderColor: string;
};

export default function ProfileInterestMetric({
  icon,
  label,
  value,
  accent,
  textColor,
  mutedColor,
  surfaceColor,
  borderColor,
}: Props) {
  return (
    <View style={[styles.container, { backgroundColor: surfaceColor, borderColor }]}>
      <View style={styles.topRow}>
        <View style={styles.visualWrap}>
          <View style={[styles.visualGlow, { backgroundColor: `${accent}18` }]} />
          <View style={[styles.visualOrbLarge, { backgroundColor: `${accent}22`, borderColor: `${accent}30` }]} />
          <View style={[styles.visualRing, { borderColor: `${accent}38` }]} />
          <View style={[styles.visualOrbSmall, { backgroundColor: `${accent}30`, borderColor: `${accent}40` }]} />
          <View style={[styles.iconChip, { backgroundColor: `${accent}14`, borderColor: `${accent}24` }]}>
            <MaterialCommunityIcons name={icon} size={13} color={accent} />
          </View>
        </View>
      </View>
      <Text style={[styles.value, { color: textColor }]}>{value}</Text>
      <Text style={[styles.label, { color: mutedColor }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '48.5%',
    minHeight: 126,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  visualWrap: {
    width: 54,
    height: 42,
    position: 'relative',
  },
  visualGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    left: 2,
    top: 0,
  },
  visualOrbLarge: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    left: 4,
    top: 4,
    borderWidth: 1,
  },
  visualRing: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    left: 24,
    top: 8,
    borderWidth: 1.5,
  },
  visualOrbSmall: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    left: 34,
    top: 18,
    borderWidth: 1,
  },
  iconChip: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  value: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 24,
    lineHeight: 28,
  },
  label: {
    marginTop: 4,
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
});
