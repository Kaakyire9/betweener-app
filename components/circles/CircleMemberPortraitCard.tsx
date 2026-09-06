import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageStyle } from 'react-native';

import { isPortraitHeroMediaSuitable } from '@/lib/circles/portrait-media';
import { useCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

export type CircleMemberPortrait = {
  profileId: string;
  name: string;
  age?: number | null;
  avatarUrl?: string | null;
  location?: string | null;
  roleLabel?: string | null;
  presenceLabel?: string | null;
  isOnline?: boolean;
  isNew?: boolean;
  isSelf?: boolean;
  conversationLabel?: string | null;
  conversationSpark?: string | null;
  conversationKind?: 'prompt' | 'moment' | 'arrival' | 'community' | null;
  conversationId?: string | null;
};

type Props = {
  member: CircleMemberPortrait;
  featured?: boolean;
  mediaPresentation?: 'cover' | 'portrait-guarded';
  primaryActionLabel?: string | null;
  primaryActionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onOpenProfile: (profileId: string) => void;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string | null;
  onSecondaryAction?: () => void;
  onManage?: () => void;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'member';

const MEDIA_FILL_STYLE: ImageStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
const MEDIA_PENDING_STYLE: ImageStyle = { opacity: 0 };

const withHaptic = (callback?: () => void) => () => {
  if (process.env.NODE_ENV !== 'test') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
  callback?.();
};

export default function CircleMemberPortraitCard({
  member,
  featured = false,
  mediaPresentation = 'cover',
  primaryActionLabel,
  primaryActionIcon = 'hand-wave-outline',
  onOpenProfile,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  onManage,
}: Props) {
  const palette = useCirclePulsePalette();
  const displayName = `${member.name}${member.age ? `, ${member.age}` : ''}`;
  const avatarUrl = member.avatarUrl?.trim() || null;
  const protectsPortrait = featured && mediaPresentation === 'portrait-guarded';
  const [approvedPortraitUrl, setApprovedPortraitUrl] = useState<string | null>(null);
  const portraitMediaReady = !protectsPortrait || approvedPortraitUrl === avatarUrl;
  const showPortraitFallback = !avatarUrl || (protectsPortrait && !portraitMediaReady);
  const initials = member.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'B';

  const contextIcon = member.conversationKind === 'prompt'
    ? 'comment-question-outline'
    : member.conversationKind === 'moment'
      ? 'image-multiple-outline'
      : member.conversationKind === 'arrival'
        ? 'creation-outline'
        : 'account-group-outline';

  return (
    <View
      style={[
        styles.shell,
        featured ? styles.featuredShell : styles.gridShell,
        { borderColor: featured ? palette.purpleBorder : palette.outline, backgroundColor: palette.surface },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${member.name} profile`}
        style={[styles.portrait, featured ? styles.featuredPortrait : styles.gridPortrait]}
        onPress={withHaptic(() => onOpenProfile(member.profileId))}
      >
        {showPortraitFallback ? (
          <LinearGradient colors={palette.warmIntroGradient} style={[StyleSheet.absoluteFill, styles.fallback]}>
            <View style={[styles.fallbackOrbit, featured && styles.featuredFallbackOrbit]} />
            <View style={[styles.fallbackMonogram, featured && styles.featuredFallbackMonogram, { borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft }]}>
              <Text style={[styles.fallbackInitials, featured && styles.featuredFallbackInitials, { color: palette.purple }]}>{initials}</Text>
            </View>
          </LinearGradient>
        ) : null}
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={[
              MEDIA_FILL_STYLE,
              protectsPortrait && !portraitMediaReady && MEDIA_PENDING_STYLE,
            ]}
            contentFit="cover"
            contentPosition={protectsPortrait ? 'top center' : 'center'}
            transition={160}
            onLoad={(event) => {
              if (!protectsPortrait) return;
              setApprovedPortraitUrl(
                isPortraitHeroMediaSuitable(event.source) ? avatarUrl : null,
              );
            }}
            onError={() => {
              if (protectsPortrait) setApprovedPortraitUrl(null);
            }}
          />
        ) : null}

        <LinearGradient
          colors={featured
            ? ['rgba(2,17,20,0.02)', 'rgba(2,17,20,0.28)', 'rgba(2,17,20,0.96)']
            : ['rgba(2,17,20,0.01)', 'rgba(2,17,20,0.3)', 'rgba(2,17,20,0.96)']}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.badgeRow}>
          {member.roleLabel ? (
            <View style={styles.glassPill}>
              <Text style={styles.glassPillText}>{member.roleLabel}</Text>
            </View>
          ) : member.isNew ? (
            <View style={styles.glassPill}>
              <MaterialCommunityIcons name="creation-outline" size={12} color="#FFF9F1" />
              <Text style={styles.glassPillText}>NEW ARRIVAL</Text>
            </View>
          ) : null}
          {member.presenceLabel ? (
            <View style={styles.presencePill}>
              <View style={[styles.presenceDot, { backgroundColor: member.isOnline ? palette.tealStrong : 'rgba(255,249,241,0.66)' }]} />
              <Text style={styles.presenceText}>{member.presenceLabel}</Text>
            </View>
          ) : null}
        </View>

        {onManage ? (
          <Pressable
            accessibilityLabel={`Manage ${member.name}`}
            style={styles.manageButton}
            onPress={withHaptic(onManage)}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={18} color="#FFF9F1" />
          </Pressable>
        ) : null}

        <View style={[styles.copy, featured && styles.featuredCopy]}>
          {featured ? <Text style={styles.featuredEyebrow}>CONVERSATION LEAD</Text> : null}
          <Text style={[styles.name, featured && styles.featuredName]} numberOfLines={2}>{displayName}</Text>
          {member.location ? <Text style={styles.location} numberOfLines={1}>{member.location}</Text> : null}
          {member.conversationSpark ? (
            <View style={[styles.spark, featured && styles.featuredSpark]}>
              <MaterialCommunityIcons name={contextIcon} size={featured ? 16 : 13} color={palette.teal} />
              <View style={styles.sparkCopy}>
                {member.conversationLabel ? <Text style={styles.sparkLabel} numberOfLines={1}>{member.conversationLabel}</Text> : null}
                <Text style={[styles.sparkText, featured && styles.featuredSparkText]} numberOfLines={featured ? 3 : 2}>
                  {member.conversationSpark}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={styles.openCue}>
            <Text style={styles.openCueText}>{member.isSelf ? 'Your Circle profile' : `Meet ${firstName(member.name)}`}</Text>
            <MaterialCommunityIcons name="arrow-top-right" size={14} color={palette.teal} />
          </View>
        </View>
      </Pressable>

      {primaryActionLabel && onPrimaryAction ? (
        <View style={[styles.actionRow, featured && styles.featuredActionRow]}>
          <Pressable
            accessibilityLabel={primaryActionLabel}
            style={[styles.primaryAction, { backgroundColor: palette.tealStrong }]}
            onPress={withHaptic(onPrimaryAction)}
          >
            <MaterialCommunityIcons name={primaryActionIcon} size={15} color={palette.tealInk} />
            <Text style={[styles.primaryActionText, { color: palette.tealInk }]} numberOfLines={1}>{primaryActionLabel}</Text>
          </Pressable>
          {secondaryActionLabel && onSecondaryAction ? (
            <Pressable
              accessibilityLabel={secondaryActionLabel}
              style={[styles.secondaryAction, { borderColor: palette.outline }]}
              onPress={withHaptic(onSecondaryAction)}
            >
              <MaterialCommunityIcons name="account-outline" size={15} color={palette.textSoft} />
              <Text style={[styles.secondaryActionText, { color: palette.textSoft }]} numberOfLines={1}>{secondaryActionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderWidth: 1, overflow: 'hidden' },
  gridShell: { width: '100%', borderRadius: 22 },
  featuredShell: { width: '100%', borderRadius: 28, borderWidth: 1.5 },
  portrait: { overflow: 'hidden', backgroundColor: '#0B2629' },
  gridPortrait: { height: 238 },
  featuredPortrait: { height: 330 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackOrbit: { position: 'absolute', width: 128, height: 128, borderRadius: 64, borderWidth: 1, borderColor: 'rgba(139,115,214,0.24)', transform: [{ rotate: '-12deg' }, { scaleX: 1.4 }] },
  featuredFallbackOrbit: { width: 190, height: 190, borderRadius: 95 },
  fallbackMonogram: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  featuredFallbackMonogram: { width: 112, height: 112, borderRadius: 56, borderWidth: 1.5 },
  fallbackInitials: { fontSize: 25, lineHeight: 31, fontFamily: 'PlayfairDisplay_700Bold' },
  featuredFallbackInitials: { fontSize: 38, lineHeight: 46 },
  badgeRow: { position: 'absolute', top: 10, left: 10, right: 50, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  glassPill: { minHeight: 25, paddingHorizontal: 8, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(2,17,20,0.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  glassPillText: { color: '#FFF9F1', fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7 },
  presencePill: { minHeight: 25, paddingHorizontal: 8, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(2,17,20,0.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  presenceDot: { width: 6, height: 6, borderRadius: 3 },
  presenceText: { color: '#FFF9F1', fontSize: 8, fontWeight: '900' },
  manageButton: { position: 'absolute', top: 9, right: 9, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,17,20,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  copy: { position: 'absolute', left: 12, right: 12, bottom: 11, gap: 3 },
  featuredCopy: { left: 18, right: 18, bottom: 17, gap: 5 },
  featuredEyebrow: { color: '#7DE4DF', fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.4 },
  name: { color: '#FFF9F1', fontSize: 18, lineHeight: 23, fontFamily: 'PlayfairDisplay_700Bold', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  featuredName: { fontSize: 29, lineHeight: 35 },
  location: { color: 'rgba(255,249,241,0.76)', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  spark: { marginTop: 5, flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)' },
  featuredSpark: { maxWidth: 410, marginTop: 7, paddingTop: 9 },
  sparkCopy: { flex: 1, minWidth: 0, gap: 2 },
  sparkLabel: { color: '#7DE4DF', fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  sparkText: { color: 'rgba(255,249,241,0.88)', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  featuredSparkText: { fontSize: 13, lineHeight: 19 },
  openCue: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  openCueText: { color: '#7DE4DF', fontSize: 9, lineHeight: 13, fontWeight: '900' },
  actionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'stretch', gap: 7, padding: 7 },
  featuredActionRow: { minHeight: 56, padding: 9 },
  primaryAction: { minWidth: 0, flex: 1, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  primaryActionText: { flexShrink: 1, fontSize: 10, fontWeight: '900' },
  secondaryAction: { minWidth: 0, flex: 1, borderRadius: 19, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  secondaryActionText: { flexShrink: 1, fontSize: 10, fontWeight: '900' },
});
