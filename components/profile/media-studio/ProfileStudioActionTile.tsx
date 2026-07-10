import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { type StudioTheme, withAlpha } from './model';

type Props = {
  theme: StudioTheme;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  meta?: string;
  disabled?: boolean;
  featured?: boolean;
  onPress: () => void;
};

export default function ProfileStudioActionTile({
  theme,
  title,
  subtitle,
  icon,
  meta,
  disabled,
  featured = false,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      style={[
        styles.actionTile,
        {
          backgroundColor: featured ? withAlpha(theme.tint, '12') : theme.background,
          borderColor: featured ? withAlpha(theme.tint, '34') : theme.outline,
          opacity: disabled ? 0.48 : 1,
        },
      ]}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.actionTileHeader}>
        <View style={[styles.actionTileIconWrap, { backgroundColor: featured ? withAlpha(theme.tint, '18') : theme.backgroundSubtle }]}>
          <MaterialCommunityIcons name={icon} size={17} color={featured ? theme.tint : theme.text} />
        </View>
        {meta ? (
          <View
            style={[
              styles.actionTileMetaPill,
              {
                backgroundColor: featured ? withAlpha(theme.tint, '14') : withAlpha(theme.textMuted, '0E'),
                borderColor: featured ? withAlpha(theme.tint, '26') : theme.outline,
              },
            ]}
          >
            <Text style={[styles.actionTileMetaText, { color: featured ? theme.tint : theme.textMuted }]}>{meta}</Text>
          </View>
        ) : (
          <MaterialCommunityIcons name="chevron-right" size={16} color={theme.textMuted} />
        )}
      </View>
      <View style={styles.actionTileCopy}>
        <Text style={[styles.actionTileTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.actionTileSubtitle, { color: theme.textMuted }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  actionTile: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 9,
  },
  actionTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionTileIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileMetaPill: {
    minHeight: 22,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileMetaText: {
    fontSize: 9.5,
    fontFamily: 'Manrope_700Bold',
  },
  actionTileCopy: {
    gap: 3,
  },
  actionTileTitle: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
  },
  actionTileSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Manrope_500Medium',
  },
});
