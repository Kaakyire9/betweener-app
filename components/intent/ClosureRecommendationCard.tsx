import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import OfflineImage from '@/components/media/OfflineImage';
import { Colors } from '@/constants/theme';
import type { ClosureRecommendation } from '@/lib/intents/closure-to-clarity';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Theme = typeof Colors.light;

type ClosureRecommendationCardProps = {
  recommendation: ClosureRecommendation;
  theme: Theme;
  isDark: boolean;
  onViewProfile: () => void;
  onSendIntent: () => void;
};

const laneIcons = {
  similar_spark: 'creation-outline',
  better_timing: 'clock-check-outline',
  fresh_perspective: 'compass-outline',
} as const;

export default function ClosureRecommendationCard({
  recommendation,
  theme,
  isDark,
  onViewProfile,
  onSendIntent,
}: ClosureRecommendationCardProps) {
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const title = recommendation.age
    ? `${recommendation.name}, ${recommendation.age}`
    : recommendation.name;
  const initial = recommendation.name.trim().charAt(0).toUpperCase() || 'B';
  const accentColor =
    recommendation.lane === 'similar_spark'
      ? theme.secondary
      : recommendation.lane === 'better_timing'
        ? theme.tint
        : theme.accent;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
      <LinearGradient
        colors={[
          `${accentColor}${isDark ? '22' : '1C'}`,
          `${theme.accent}${isDark ? '14' : '10'}`,
          'transparent',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGlow}
      />

      <View style={styles.topRow}>
        <View style={[styles.lanePill, { borderColor: `${accentColor}55`, backgroundColor: `${accentColor}14` }]}>
          <MaterialCommunityIcons
            name={laneIcons[recommendation.lane]}
            size={15}
            color={accentColor}
          />
          <Text style={[styles.laneText, { color: accentColor }]}>
            {recommendation.laneLabel}
          </Text>
        </View>
        {recommendation.verified ? (
          <View style={[styles.verifiedPill, { borderColor: `${theme.tint}44`, backgroundColor: `${theme.tint}12` }]}>
            <MaterialCommunityIcons name="check-decagram" size={13} color={theme.tint} />
            <Text style={[styles.verifiedText, { color: theme.tint }]}>Verified</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.supportHeadline, { color: theme.text }]}>{recommendation.laneSupport}</Text>

      <Pressable onPress={onViewProfile} style={styles.profileRow}>
        {recommendation.avatarUrl ? (
          <OfflineImage uri={recommendation.avatarUrl} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: `${theme.accent}22` }]}>
            <Text style={[styles.avatarInitial, { color: theme.text }]}>{initial}</Text>
          </View>
        )}
        <View style={styles.profileCopy}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
          {recommendation.location ? (
            <Text style={[styles.location, { color: theme.textMuted }]} numberOfLines={1}>
              {recommendation.location}
            </Text>
          ) : null}
          <Text style={[styles.supportBody, { color: theme.textMuted }]} numberOfLines={3}>
            {recommendation.support}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textMuted} />
      </Pressable>

      {recommendation.chips.length > 0 ? (
        <View style={styles.chips}>
          {recommendation.chips.map((chip) => (
            <View
              key={chip}
              style={[
                styles.chip,
                { borderColor: theme.outline, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFFAA' },
              ]}
            >
              <Text style={[styles.chipText, { color: theme.textMuted }]}>{chip}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.reasons}>
        {recommendation.reasons.map((reason) => (
          <View key={reason} style={styles.reasonRow}>
            <View style={[styles.reasonDot, { backgroundColor: accentColor }]} />
            <Text style={[styles.reasonText, { color: theme.textMuted }]}>{reason}</Text>
          </View>
        ))}
      </View>

      <BlurViewSafe
        intensity={isDark ? 28 : 18}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.openerBox,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.58)',
            borderColor: theme.outline,
          },
        ]}
      >
        <Text style={[styles.openerLabel, { color: accentColor }]}>{recommendation.openerLabel}</Text>
        <Text style={[styles.openerText, { color: theme.text }]} numberOfLines={3}>
          {recommendation.opener}
        </Text>
      </BlurViewSafe>

      <View style={styles.actions}>
        <Pressable
          onPress={onViewProfile}
          style={({ pressed }) => [
            styles.viewButton,
            { borderColor: theme.outline, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.62)' },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.viewText, { color: theme.text }]}>View profile</Text>
        </Pressable>
        <Pressable
          onPress={onSendIntent}
          style={({ pressed }) => [styles.intentButton, { backgroundColor: theme.tint }, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="message-text-outline" size={17} color={Colors.light.background} />
          <Text style={styles.intentText}>{recommendation.actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: Theme, isDark: boolean) {
  return StyleSheet.create({
    card: {
      borderRadius: 24,
      borderWidth: 1,
      overflow: 'hidden',
      padding: 18,
      position: 'relative',
      shadowColor: '#051214',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.18 : 0.08,
      shadowRadius: 24,
      elevation: 4,
    },
    cardGlow: {
      ...StyleSheet.absoluteFill,
      opacity: isDark ? 1 : 0.92,
    },
    topRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    lanePill: {
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    laneText: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
    },
    verifiedPill: {
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    verifiedText: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.3,
    },
    supportHeadline: {
      fontSize: 21,
      fontFamily: 'PlayfairDisplay_700Bold',
      lineHeight: 28,
      marginBottom: 14,
      paddingRight: 8,
    },
    profileRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
    },
    avatar: {
      borderRadius: 18,
      height: 74,
      width: 74,
    },
    avatarFallback: {
      alignItems: 'center',
      borderRadius: 18,
      height: 74,
      justifyContent: 'center',
      width: 74,
    },
    avatarInitial: {
      fontFamily: 'PlayfairDisplay_700Bold',
      fontSize: 28,
    },
    profileCopy: {
      flex: 1,
      marginLeft: 14,
      minWidth: 0,
    },
    name: {
      fontSize: 18,
      fontFamily: 'Manrope_700Bold',
    },
    location: {
      fontSize: 13,
      marginTop: 4,
    },
    supportBody: {
      fontSize: 13.5,
      lineHeight: 20,
      marginTop: 8,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 16,
    },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    chipText: {
      fontSize: 11.5,
      fontFamily: 'Manrope_600SemiBold',
      letterSpacing: 0.2,
    },
    reasons: {
      gap: 8,
      marginTop: 16,
    },
    reasonRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 9,
    },
    reasonDot: {
      borderRadius: 4,
      height: 7,
      width: 7,
    },
    reasonText: {
      flex: 1,
      fontSize: 13.5,
      lineHeight: 20,
    },
    openerBox: {
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 18,
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    openerLabel: {
      fontSize: 10.5,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.8,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    openerText: {
      fontSize: 13.5,
      fontFamily: 'Manrope_500Medium',
      lineHeight: 21,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },
    viewButton: {
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
    },
    viewText: {
      fontSize: 13,
      fontFamily: 'Manrope_700Bold',
    },
    intentButton: {
      alignItems: 'center',
      borderRadius: 16,
      flex: 1.35,
      flexDirection: 'row',
      gap: 7,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 12,
    },
    intentText: {
      color: Colors.light.background,
      fontSize: 12.5,
      fontFamily: 'Manrope_800ExtraBold',
      letterSpacing: 0.2,
    },
    pressed: {
      opacity: 0.8,
    },
  });
}
