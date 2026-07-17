import { Colors } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { VerificationBadge } from '../VerificationBadge';

type Theme = typeof Colors.light;

type VerificationCallout = {
  title: string;
  subtitle: string;
  action: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

type Props = {
  theme: Theme;
  verificationLevel: number;
  verificationCallout: VerificationCallout;
  onPress?: () => void;
};

const withAlpha = (hex: string, alpha: number) => {
  const clamped = Math.max(0, Math.min(1, alpha));
  const channel = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${channel}`;
};

export default function TrustVerificationCompactCard({
  theme,
  verificationLevel,
  verificationCallout,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={[styles.card, { backgroundColor: theme.backgroundSubtle, borderColor: withAlpha(theme.text, 0.08) }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Trust & Verification</Text>
        <View style={[styles.actionPill, { backgroundColor: withAlpha(theme.tint, 0.12), borderColor: withAlpha(theme.tint, 0.22) }]}>
          <Text style={[styles.actionText, { color: theme.tint }]}>{verificationCallout.action}</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={theme.tint} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(theme.tint, 0.12), borderColor: withAlpha(theme.tint, 0.22) }]}>
          {verificationLevel > 0 ? (
            <VerificationBadge level={verificationLevel} size="medium" variant="betweener" />
          ) : (
            <MaterialCommunityIcons name={verificationCallout.icon} size={18} color={theme.tint} />
          )}
        </View>

        <View style={styles.copy}>
          <Text style={[styles.copyTitle, { color: theme.text }]}>{verificationCallout.title}</Text>
          <Text style={[styles.copySubtitle, { color: theme.textMuted }]} numberOfLines={2}>
            {verificationCallout.subtitle}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
  },
  actionPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  copyTitle: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  copySubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
  },
});
