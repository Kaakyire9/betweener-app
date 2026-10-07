import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { type CommerceTheme, useCommerceTheme } from '@/components/economy/CommerceVisuals';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { Motion } from '@/lib/motion';
import type { PremiumPlan } from '@/lib/subscriptions';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type MembershipTierVisual = {
  plan: PremiumPlan;
  label: string;
  tagline: string;
  accent: string;
  icon: IconName;
  benefits: string[];
};

type Props = {
  tier: MembershipTierVisual;
  selected: boolean;
  current: boolean;
  onPress: () => void;
};

export function MembershipTierCard({ tier, selected, current, onPress }: Props) {
  const theme = useCommerceTheme();
  const reduceMotion = useReduceMotion();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const selection = useSharedValue(selected ? 1 : 0);
  const gold = tier.plan === 'GOLD';
  const silver = tier.plan === 'SILVER';

  useEffect(() => {
    selection.value = reduceMotion
      ? withTiming(selected ? 1 : 0, { duration: Motion.duration.fast })
      : withSpring(selected ? 1 : 0, { ...Motion.spring, damping: 19, stiffness: 175 });
  }, [reduceMotion, selected, selection]);

  const selectionStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(selection.value, [0, 1], [0, -2]) },
      { scale: interpolate(selection.value, [0, 1], [1, 1.006]) },
    ] as const,
  }));

  return (
    <Animated.View style={selectionStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.shell,
          selected && { borderColor: tier.accent },
          gold && selected && styles.goldSelected,
          pressed && styles.pressed,
        ]}
      >
      <LinearGradient
        colors={theme.mode === 'dark'
          ? gold
            ? ['rgba(167,108,10,0.34)', 'rgba(43,32,12,0.20)', 'rgba(9,29,30,0.88)']
            : silver
              ? ['rgba(207,227,232,0.15)', 'rgba(14,53,56,0.40)', 'rgba(9,29,30,0.88)']
              : ['rgba(13,69,71,0.42)', 'rgba(9,29,30,0.88)']
          : gold
            ? ['rgba(230,180,65,0.36)', 'rgba(255,254,250,0.98)']
            : silver
              ? ['rgba(104,154,153,0.25)', 'rgba(255,254,250,0.98)']
              : ['rgba(29,171,158,0.22)', 'rgba(255,254,250,0.98)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.icon, { borderColor: `${tier.accent}66` }]}>
        <MaterialCommunityIcons name={tier.icon} size={25} color={tier.accent} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{tier.label}</Text>
          {current ? (
            <View style={[styles.badge, { borderColor: tier.accent }]}>
              <Text style={[styles.badgeText, { color: tier.accent }]}>CURRENT</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.tagline}>{tier.tagline}</Text>
        <View style={styles.chips}>
          {tier.benefits.slice(0, 3).map((benefit) => (
            <View key={benefit} style={styles.chip}>
              <Text numberOfLines={1} style={styles.chipText}>{benefit}</Text>
            </View>
          ))}
        </View>
      </View>
        <MaterialCommunityIcons name={selected ? 'chevron-down' : 'chevron-right'} size={23} color={tier.accent} />
      </Pressable>
    </Animated.View>
  );
}

function createStyles(theme: CommerceTheme) {
  return StyleSheet.create({
  shell: {
    minHeight: 122,
    overflow: 'hidden',
    padding: 15,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: theme.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.panel,
    shadowColor: theme.shadow,
    shadowOpacity: theme.mode === 'light' ? 0.11 : 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: theme.mode === 'light' ? 3 : 0,
  },
  goldSelected: { shadowColor: theme.gold, shadowOpacity: theme.mode === 'dark' ? 0.30 : 0.18, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  icon: { width: 50, height: 50, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.iconSurface },
  copy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 23 },
  tagline: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, marginTop: 2 },
  badge: { minHeight: 24, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: 'Archivo_700Bold', fontSize: 8, letterSpacing: 0.7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  chip: { maxWidth: '48%', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: theme.chip },
  chipText: { color: theme.text, fontFamily: 'Manrope_500Medium', fontSize: 8.5 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.992 }] },
  });
}
