import { VerificationBadge } from '@/components/VerificationBadge';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { buildLocationDisplay } from '@/lib/location/location-display';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { CircleDatingCandidate } from '../hooks/use-circle-dating';

type Props = {
  candidate: CircleDatingCandidate;
  circleName: string;
  remainingCount: number;
  onPass: () => void;
  onOpenProfile: () => void;
  onSendIntent: () => void;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'them';

export function CircleDiscoveryIntroduction({
  candidate,
  circleName,
  remainingCount,
  onPass,
  onOpenProfile,
  onSendIntent,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = createStyles(theme, isDark);
  const uri = normalizeProfilePhotoUri(candidate.avatarUrl);
  const givenName = firstName(candidate.fullName);
  const initials = candidate.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'B';
  const location = buildLocationDisplay({
    city: candidate.city,
    current_country: candidate.country,
    country: candidate.country,
  }, { surface: 'profile' }).withFlag;
  const reasons = candidate.reasons.length ? candidate.reasons : ['Shared Circle'];

  return (
    <View style={styles.shell}>
      <View style={styles.folioHeader}>
        <View style={styles.seal}>
          <MaterialCommunityIcons name="account-group-outline" size={18} color={theme.tint} />
        </View>
        <View style={styles.folioHeaderCopy}>
          <Text style={styles.folioEyebrow}>A CIRCLE INTRODUCTION</Text>
          <Text style={styles.folioSubtitle} numberOfLines={1}>Introduced through {circleName}</Text>
        </View>
        <View style={styles.remainingPill}>
          <Text style={styles.remainingCount}>{remainingCount}</Text>
          <Text style={styles.remainingLabel}>
            {remainingCount === 1 ? 'INTRODUCTION\nTODAY' : 'INTRODUCTIONS\nREADY'}
          </Text>
        </View>
      </View>

      <View style={styles.portalCanvas}>
        <View pointerEvents="none" style={[styles.orbit, styles.orbitOuter]} />
        <View pointerEvents="none" style={[styles.orbit, styles.orbitInner]} />
        <View pointerEvents="none" style={[styles.orbitNode, styles.orbitNodeLeft]} />
        <View pointerEvents="none" style={[styles.orbitNode, styles.orbitNodeRight]} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Meet ${candidate.fullName}`}
          onPress={onOpenProfile}
          style={styles.portraitPortal}
        >
          {uri ? (
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="top center"
              transition={180}
              accessibilityLabel={`${candidate.fullName}'s profile photo`}
            />
          ) : (
            <LinearGradient colors={['#182A32', '#18213C', '#071719']} style={[StyleSheet.absoluteFill, styles.photoFallback]}>
              <View style={styles.fallbackHalo} />
              <Text style={styles.fallbackInitials}>{initials}</Text>
            </LinearGradient>
          )}
          <LinearGradient
            colors={['rgba(3,14,17,0.02)', 'rgba(3,14,17,0.16)', 'rgba(3,14,17,0.94)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.identityBlock}>
            <Text style={styles.identityEyebrow}>YOUR PATHS CROSS HERE</Text>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName} numberOfLines={2}>
                {candidate.fullName}{candidate.age ? `, ${candidate.age}` : ''}
              </Text>
              {candidate.verificationLevel > 0 ? (
              <View
                style={styles.verificationBadge}
                accessible
                accessibilityLabel={candidate.verificationLevel >= 2
                  ? 'Betweener identity verified'
                  : 'Betweener phone verified'}
              >
                <VerificationBadge
                  level={candidate.verificationLevel}
                  size="medium"
                  variant="betweener"
                  surface="explore"
                />
              </View>
              ) : null}
            </View>
            {location ? <Text style={styles.profileMeta}>{location}</Text> : null}
          </View>
        </Pressable>
      </View>

      <View style={styles.introductionCard}>
        {candidate.lookingFor ? (
          <View style={styles.intentionRow}>
            <View style={styles.intentionIcon}>
              <MaterialCommunityIcons name="compass-outline" size={18} color={theme.tint} />
            </View>
            <View style={styles.intentionCopy}>
              <Text style={styles.contextEyebrow}>THE DIRECTION</Text>
              <Text style={styles.intentionText}>{candidate.lookingFor}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityLabel={`Pass ${candidate.fullName}`}
            style={styles.passButton}
            onPress={onPass}
          >
            <MaterialCommunityIcons name="close" size={24} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel={`View ${candidate.fullName} profile`}
            style={styles.meetButton}
            onPress={onOpenProfile}
          >
            <Text style={styles.meetText}>Meet {givenName}</Text>
            <MaterialCommunityIcons name="arrow-top-right" size={17} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel={`Send Intent to ${candidate.fullName}`}
            style={styles.intentButton}
            onPress={onSendIntent}
          >
            <MaterialCommunityIcons name="heart-plus-outline" size={20} color={theme.backgroundSubtle} />
            <Text style={styles.intentText}>Send Intent</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rule} />
        <Text style={styles.contextEyebrow}>WHY THIS INTRODUCTION</Text>
        <View style={styles.threadList}>
          {reasons.map((reason, index) => (
            <View key={`${reason}-${index}`} style={styles.threadRow}>
              <View style={styles.threadRail}>
                <View style={styles.threadNode}>
                  <Text style={styles.threadNumber}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                {index < reasons.length - 1 ? <View style={styles.threadLine} /> : null}
              </View>
              <View style={styles.threadCopy}>
                <Text style={styles.threadTitle}>{reason}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.openingThread}>
          <MaterialCommunityIcons name="message-processing-outline" size={19} color={isDark ? '#D8BCFF' : '#6D4A99'} />
          <View style={styles.openingCopy}>
            <Text style={styles.openingLabel}>AN OPENING THREAD</Text>
            <Text style={styles.openingText}>“What first brought you to {circleName}?”</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  shell: { gap: 14 },
  folioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 3,
  },
  seal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(60,210,202,0.28)' : 'rgba(0,128,128,0.2)',
    backgroundColor: isDark ? 'rgba(0,160,160,0.09)' : 'rgba(0,128,128,0.06)',
  },
  folioHeaderCopy: { flex: 1, gap: 3 },
  folioEyebrow: { color: theme.tint, fontSize: 10, fontWeight: '900', letterSpacing: 1.65 },
  folioSubtitle: { color: theme.textMuted, fontSize: 12 },
  remainingPill: { minWidth: 74, alignItems: 'flex-end', gap: 1 },
  remainingCount: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, lineHeight: 22 },
  remainingLabel: { color: theme.textMuted, fontSize: 7, lineHeight: 10, fontWeight: '800', letterSpacing: 0.9, textAlign: 'right' },
  portalCanvas: {
    height: 430,
    overflow: 'hidden',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(60,210,202,0.22)' : 'rgba(0,128,128,0.18)',
    backgroundColor: isDark ? '#0B2325' : '#EEE2D5',
  },
  orbit: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(85,199,193,0.18)' : 'rgba(0,128,128,0.14)',
  },
  orbitOuter: { width: 470, height: 260, borderRadius: 240, left: -62, top: 74, transform: [{ rotate: '-14deg' }] },
  orbitInner: { width: 330, height: 190, borderRadius: 170, left: 8, top: 115, borderColor: isDark ? 'rgba(166,123,220,0.28)' : 'rgba(125,91,166,0.22)', transform: [{ rotate: '19deg' }] },
  orbitNode: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: theme.tint },
  orbitNodeLeft: { left: 21, top: 206 },
  orbitNodeRight: { right: 18, top: 122, backgroundColor: isDark ? '#D7BC83' : '#9C7425' },
  portraitPortal: {
    position: 'absolute',
    top: 18,
    bottom: 0,
    left: 24,
    right: 24,
    overflow: 'hidden',
    borderTopLeftRadius: 154,
    borderTopRightRadius: 154,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(231,211,147,0.46)' : 'rgba(128,93,26,0.34)',
    backgroundColor: isDark ? '#102123' : '#E6D8C8',
  },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackHalo: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: 'rgba(214,184,255,0.30)' },
  fallbackInitials: { color: '#D7B7FF', fontFamily: 'PlayfairDisplay_700Bold', fontSize: 76 },
  identityBlock: { position: 'absolute', left: 22, right: 22, bottom: 23, gap: 5 },
  identityEyebrow: { color: '#7BE0DB', fontSize: 9, fontWeight: '900', letterSpacing: 1.55 },
  profileNameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  profileName: { flexShrink: 1, color: '#FFF9EF', fontFamily: 'PlayfairDisplay_700Bold', fontSize: 33, lineHeight: 38 },
  verificationBadge: { marginBottom: 5 },
  profileMeta: { color: 'rgba(255,249,239,0.80)', fontSize: 13, fontWeight: '600' },
  introductionCard: {
    marginTop: -28,
    marginHorizontal: 13,
    gap: 13,
    padding: 18,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(150,115,198,0.40)' : 'rgba(125,91,166,0.25)',
    backgroundColor: isDark ? '#122225' : '#F8EEE5',
    shadowColor: '#040B0D',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.28 : 0.12,
    shadowRadius: 22,
    elevation: 7,
  },
  intentionRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  intentionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(0,160,160,0.10)' : 'rgba(0,128,128,0.07)' },
  intentionCopy: { flex: 1, gap: 3 },
  contextEyebrow: { color: theme.tint, fontSize: 9, fontWeight: '900', letterSpacing: 1.45 },
  intentionText: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18, lineHeight: 23 },
  rule: { height: 1, backgroundColor: theme.outline },
  threadList: { gap: 0 },
  threadRow: { minHeight: 38, flexDirection: 'row', gap: 11 },
  threadRail: { width: 28, alignItems: 'center' },
  threadNode: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(94,221,214,0.40)' : 'rgba(0,128,128,0.28)', backgroundColor: isDark ? '#102E2F' : '#E8F2EE' },
  threadNumber: { color: theme.tint, fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  threadLine: { flex: 1, width: 1, backgroundColor: isDark ? 'rgba(94,221,214,0.20)' : 'rgba(0,128,128,0.16)' },
  threadCopy: { flex: 1, justifyContent: 'center', paddingBottom: 10 },
  threadTitle: { color: theme.text, fontSize: 13, fontWeight: '800' },
  openingThread: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 18, backgroundColor: isDark ? 'rgba(145,99,199,0.11)' : 'rgba(125,91,166,0.08)', padding: 13 },
  openingCopy: { flex: 1, gap: 4 },
  openingLabel: { color: isDark ? '#CDA8F6' : '#6D4A99', fontSize: 8, fontWeight: '900', letterSpacing: 1.25 },
  openingText: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passButton: { width: 50, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25, borderWidth: 1, borderColor: theme.outline },
  meetButton: { minHeight: 50, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 25, borderWidth: 1, borderColor: theme.outline, paddingHorizontal: 10 },
  meetText: { flexShrink: 1, color: theme.text, fontSize: 12, fontWeight: '800' },
  intentButton: { minHeight: 50, flex: 1.18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 25, backgroundColor: theme.tint, paddingHorizontal: 10 },
  intentText: { color: theme.backgroundSubtle, fontSize: 12, fontWeight: '900' },
});
