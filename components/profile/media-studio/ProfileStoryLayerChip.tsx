import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  layerStateAccent,
  layerStateLabel,
  slotIconName,
  type ProfileStoryLayer,
  type StudioTheme,
  withAlpha,
} from './model';

type Props = {
  theme: StudioTheme;
  layer: ProfileStoryLayer;
  onPress: () => void;
};

export default function ProfileStoryLayerChip({ theme, layer, onPress }: Props) {
  const accent = layerStateAccent(theme, layer.state);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.storyLayerChip, { backgroundColor: theme.backgroundSubtle, borderColor: withAlpha(accent, '28') }]}
    >
      <View style={styles.storyLayerTopRow}>
        <View style={[styles.storyLayerIconWrap, { backgroundColor: withAlpha(accent, '12') }]}>
          <MaterialCommunityIcons name={slotIconName(layer.key)} size={15} color={accent} />
        </View>
        <View style={[styles.storyLayerStatePill, { backgroundColor: withAlpha(accent, '10'), borderColor: withAlpha(accent, '18') }]}>
          <Text style={[styles.storyLayerStateText, { color: accent }]}>{layerStateLabel(layer)}</Text>
        </View>
      </View>
      <View style={styles.storyLayerBottomRow}>
        <Text style={[styles.storyLayerLabel, { color: theme.text }]}>{layer.label}</Text>
        <MaterialCommunityIcons name="chevron-right" size={15} color={withAlpha(theme.textMuted, 'AA')} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  storyLayerChip: {
    width: '48%',
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 9,
  },
  storyLayerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  storyLayerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  storyLayerIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyLayerLabel: {
    fontSize: 13.5,
    fontFamily: 'Manrope_700Bold',
  },
  storyLayerStatePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  storyLayerStateText: {
    fontSize: 9,
    fontFamily: 'Manrope_700Bold',
  },
});
