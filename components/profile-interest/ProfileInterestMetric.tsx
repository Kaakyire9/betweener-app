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
      <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
        <MaterialCommunityIcons name={icon} size={18} color={accent} />
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
    borderRadius: 8,
    padding: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
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
