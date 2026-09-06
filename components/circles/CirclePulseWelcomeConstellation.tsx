import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CircleMemberPortraitCard, {
  type CircleMemberPortrait,
} from '@/components/circles/CircleMemberPortraitCard';
import { selectDailyPortraitLead } from '@/lib/circles/member-portrait-ranking';
import type { CirclePulseItem, CirclePulseWelcomeProfile } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

export type CirclePulseWelcomeEntry = {
  item: CirclePulseItem;
  profile: CirclePulseWelcomeProfile;
};

type Props = {
  entries: CirclePulseWelcomeEntry[];
  viewerProfileId?: string | null;
  seenProfileIds?: ReadonlySet<string>;
  onOpenProfile?: (entry: CirclePulseWelcomeEntry) => void;
  onOpenWelcome?: (entry: CirclePulseWelcomeEntry) => void;
  onGalleryOpened?: (entries: CirclePulseWelcomeEntry[]) => void;
};

const NODE_POSITIONS = [
  { left: '8%', top: 50, size: 76 },
  { right: '8%', top: 50, size: 76 },
  { left: '31%', top: 16, size: 62 },
  { right: '31%', top: 114, size: 58 },
  { left: '16%', top: 126, size: 52 },
] as const;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'member';

const withSelectionHaptic = (callback?: () => void) => () => {
  if (process.env.NODE_ENV !== 'test') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
  callback?.();
};

const Avatar = ({ profile, size, palette }: { profile: CirclePulseWelcomeProfile; size: number; palette: CirclePulsePalette }) => (
  profile.avatarUrl ? (
    <Image
      source={{ uri: profile.avatarUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      transition={140}
    />
  ) : (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.purpleSoft }]}>
      <MaterialCommunityIcons name="account-heart-outline" size={Math.max(21, size * 0.38)} color={palette.purple} />
    </View>
  )
);

export default function CirclePulseWelcomeConstellation({
  entries,
  viewerProfileId,
  seenProfileIds = new Set<string>(),
  onOpenProfile,
  onOpenWelcome,
  onGalleryOpened,
}: Props) {
  const palette = useCirclePulsePalette();
  const [galleryVisible, setGalleryVisible] = useState(false);
  const nodeProgress = useRef(NODE_POSITIONS.map(() => new Animated.Value(1))).current;
  const ambientProgress = useRef(new Animated.Value(0)).current;
  const visibleEntries = useMemo(() => entries.slice(0, NODE_POSITIONS.length), [entries]);
  const visibleEntryKey = useMemo(
    () => visibleEntries.map((entry) => entry.profile.profileId).join(':'),
    [visibleEntries],
  );
  const unseenCount = useMemo(
    () => entries.reduce((count, entry) => count + (seenProfileIds.has(entry.profile.profileId) ? 0 : 1), 0),
    [entries, seenProfileIds],
  );
  const galleryLead = useMemo(() => {
    const unseenEntries = entries.filter((entry) => !seenProfileIds.has(entry.profile.profileId));
    const unseenOthers = unseenEntries.filter((entry) => entry.profile.profileId !== viewerProfileId);
    const allOthers = entries.filter((entry) => entry.profile.profileId !== viewerProfileId);
    const pool = unseenOthers.length > 0
      ? unseenOthers
      : allOthers.length > 0
        ? allOthers
        : unseenEntries.length > 0
          ? unseenEntries
          : entries;
    const circleId = entries[0]?.item.circleId ?? 'circle';
    return selectDailyPortraitLead(pool, `welcome-lounge:${circleId}`, (entry) => entry.profile.profileId);
  }, [entries, seenProfileIds, viewerProfileId]);
  const galleryEntries = useMemo(
    () => galleryLead
      ? entries.filter((entry) => entry.profile.profileId !== galleryLead.profile.profileId)
      : entries,
    [entries, galleryLead],
  );

  const toPortrait = (entry: CirclePulseWelcomeEntry): CircleMemberPortrait => ({
    profileId: entry.profile.profileId,
    name: entry.profile.name,
    avatarUrl: entry.profile.avatarUrl,
    location: entry.profile.location,
    isNew: !seenProfileIds.has(entry.profile.profileId),
    isSelf: entry.profile.profileId === viewerProfileId,
    conversationLabel: 'Recently arrived',
    conversationSpark: 'A thoughtful hello can make a new shared space feel familiar.',
    conversationKind: 'arrival',
  });

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reducedMotion) => {
      if (cancelled || reducedMotion || process.env.NODE_ENV === 'test') {
        nodeProgress.forEach((value) => value.setValue(1));
        return;
      }
      nodeProgress.forEach((value) => value.setValue(0));
      Animated.stagger(
        65,
        visibleEntries.map((_, index) => Animated.spring(nodeProgress[index], {
          toValue: 1,
          damping: 18,
          stiffness: 135,
          mass: 0.62,
          useNativeDriver: true,
        })),
      ).start();
    }).catch(() => nodeProgress.forEach((value) => value.setValue(1)));
    return () => {
      cancelled = true;
    };
  }, [nodeProgress, visibleEntries, visibleEntryKey]);

  useEffect(() => {
    let cancelled = false;
    let ambientLoop: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reducedMotion) => {
        if (cancelled || reducedMotion || process.env.NODE_ENV === 'test') {
          ambientProgress.setValue(0);
          return;
        }
        ambientProgress.setValue(0);
        ambientLoop = Animated.loop(Animated.sequence([
          Animated.timing(ambientProgress, {
            toValue: 1,
            duration: 9000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(ambientProgress, {
            toValue: 0,
            duration: 9000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]));
        ambientLoop.start();
      })
      .catch(() => ambientProgress.setValue(0));

    return () => {
      cancelled = true;
      ambientLoop?.stop();
      ambientProgress.stopAnimation();
    };
  }, [ambientProgress]);

  const openGallery = () => {
    if (process.env.NODE_ENV !== 'test') {
      void Haptics.selectionAsync().catch(() => undefined);
    }
    setGalleryVisible(true);
    onGalleryOpened?.(entries);
  };

  if (entries.length === 0) return null;

  const latestName = firstName(entries[0].profile.name);
  const constellationCopy = entries.length === 1
    ? `${latestName} has just joined your shared world.`
    : `${latestName} and ${entries.length - 1} ${entries.length === 2 ? 'other member have' : 'others have'} recently arrived.`;

  return (
    <View style={[styles.section, { borderColor: palette.tealBorder, backgroundColor: palette.surface }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: palette.teal }]}>NEW TO THE CIRCLE</Text>
          <Text style={[styles.title, { color: palette.text }]}>Welcome constellation</Text>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>
            {unseenCount > 0 ? `${unseenCount} new to you` : `${entries.length} recent ${entries.length === 1 ? 'arrival' : 'arrivals'}`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`Meet all ${entries.length} new members`}
          style={[styles.meetAllButton, { borderColor: palette.tealBorder, backgroundColor: palette.tealSoft }]}
          onPress={openGallery}
        >
          <Text style={[styles.meetAllText, { color: palette.teal }]}>Meet all {entries.length}</Text>
          <MaterialCommunityIcons name="arrow-top-right" size={15} color={palette.teal} />
        </Pressable>
      </View>

      <View style={[styles.constellation, { borderColor: palette.outline, backgroundColor: palette.surfaceMuted }]}>
        <Animated.View
          style={[
            styles.orbitLarge,
            { borderColor: palette.tealBorder },
            {
              opacity: ambientProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 0.92] }),
              transform: [{ rotate: ambientProgress.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '-6deg'] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orbitSmall,
            { borderColor: palette.purpleBorder },
            {
              opacity: ambientProgress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.68] }),
              transform: [{ rotate: ambientProgress.interpolate({ inputRange: [0, 1], outputRange: ['16deg', '20deg'] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.centerMark,
            { borderColor: palette.purpleBorder, backgroundColor: palette.purpleSoft },
            {
              opacity: ambientProgress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
              transform: [{ scale: ambientProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }],
            },
          ]}
        >
          <MaterialCommunityIcons name="creation" size={22} color={palette.purple} />
        </Animated.View>

        {visibleEntries.map((entry, index) => {
          const position = entries.length === 1
            ? { left: '50%' as const, top: 45, size: 86, marginLeft: -43 }
            : NODE_POSITIONS[index];
          const { size, ...nodePosition } = position;
          const unseen = !seenProfileIds.has(entry.profile.profileId);
          return (
            <Animated.View
              key={entry.profile.profileId}
              style={[
                styles.node,
                nodePosition,
                {
                  opacity: nodeProgress[index],
                  transform: [
                    { translateY: nodeProgress[index].interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
                    { scale: nodeProgress[index].interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                  ],
                },
              ]}
            >
              <Pressable
                accessibilityLabel={`View ${entry.profile.name} profile`}
                style={[styles.nodeButton, { borderColor: unseen ? palette.purpleStrong : palette.outline, backgroundColor: palette.surface }]}
                onPress={withSelectionHaptic(() => onOpenProfile?.(entry))}
              >
                <Avatar profile={entry.profile} size={size - 6} palette={palette} />
                {unseen ? <View style={[styles.newDot, { backgroundColor: palette.tealStrong, borderColor: palette.surface }]} /> : null}
              </Pressable>
            </Animated.View>
          );
        })}

        {entries.length > NODE_POSITIONS.length ? (
          <Pressable
            accessibilityLabel={`Meet ${entries.length - NODE_POSITIONS.length} more new members`}
            style={[styles.moreNode, { borderColor: palette.tealBorder, backgroundColor: palette.tealStrong }]}
            onPress={openGallery}
          >
            <Text style={[styles.moreNodeText, { color: palette.tealInk }]}>+{entries.length - NODE_POSITIONS.length}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.constellationFooter}>
        <MaterialCommunityIcons name="creation-outline" size={16} color={palette.purple} />
        <Text style={[styles.constellationCopy, { color: palette.textSoft }]}>{constellationCopy}</Text>
      </View>

      <Modal visible={galleryVisible} transparent animationType="slide" onRequestClose={() => setGalleryVisible(false)}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView edges={['top', 'bottom']} style={[styles.gallery, { backgroundColor: palette.surface }]}>
            <View style={[styles.galleryHandle, { backgroundColor: palette.outline }]} />
            <View style={styles.galleryHeader}>
              <View style={styles.galleryHeaderCopy}>
                <Text style={[styles.eyebrow, { color: palette.teal }]}>WELCOME LOUNGE</Text>
                <Text style={[styles.galleryTitle, { color: palette.text }]}>New arrivals</Text>
                <Text style={[styles.gallerySubtitle, { color: palette.textMuted }]}>Meet everyone who joined during the last fourteen days.</Text>
              </View>
              <Pressable
                accessibilityLabel="Close new members gallery"
                style={[styles.closeButton, { borderColor: palette.outline, backgroundColor: palette.surfaceMuted }]}
                onPress={withSelectionHaptic(() => setGalleryVisible(false))}
              >
                <MaterialCommunityIcons name="close" size={20} color={palette.text} />
              </Pressable>
            </View>

            <FlatList
              data={galleryEntries}
              keyExtractor={(entry) => entry.profile.profileId}
              numColumns={2}
              columnWrapperStyle={styles.galleryRow}
              contentContainerStyle={styles.galleryList}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={galleryLead ? (
                <View style={styles.galleryLead}>
                  <CircleMemberPortraitCard
                    member={toPortrait(galleryLead)}
                    featured
                    mediaPresentation="portrait-guarded"
                    onOpenProfile={() => onOpenProfile?.(galleryLead)}
                    primaryActionLabel={galleryLead.profile.profileId === viewerProfileId
                      ? 'See your welcome'
                      : `Welcome ${firstName(galleryLead.profile.name)}`}
                    primaryActionIcon={galleryLead.profile.profileId === viewerProfileId ? 'message-outline' : 'hand-wave-outline'}
                    onPrimaryAction={() => onOpenWelcome?.(galleryLead)}
                  />
                </View>
              ) : null}
              renderItem={({ item: entry }) => {
                const isSelf = entry.profile.profileId === viewerProfileId;
                return (
                  <View style={styles.galleryCell}>
                    <CircleMemberPortraitCard
                      member={toPortrait(entry)}
                      onOpenProfile={() => onOpenProfile?.(entry)}
                      primaryActionLabel={isSelf ? 'See your welcome' : `Welcome ${firstName(entry.profile.name)}`}
                      primaryActionIcon={isSelf ? 'message-outline' : 'hand-wave-outline'}
                      onPrimaryAction={() => onOpenWelcome?.(entry)}
                    />
                  </View>
                );
              }}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: 28, padding: 16, gap: 14, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: 'PlayfairDisplay_700Bold' },
  subtitle: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  meetAllButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  meetAllText: { fontSize: 11, fontWeight: '900' },
  constellation: { height: 192, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  orbitLarge: { position: 'absolute', width: 250, height: 142, borderRadius: 125, borderWidth: 1, left: '50%', top: 25, marginLeft: -125 },
  orbitSmall: { position: 'absolute', width: 148, height: 108, borderRadius: 74, borderWidth: 1, left: '50%', top: 43, marginLeft: -74 },
  centerMark: { position: 'absolute', left: '50%', top: 73, width: 48, height: 48, marginLeft: -24, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  node: { position: 'absolute' },
  nodeButton: { padding: 2, borderRadius: 999, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  newDot: { position: 'absolute', right: 1, bottom: 3, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  moreNode: { position: 'absolute', right: 14, bottom: 13, width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  moreNodeText: { fontSize: 13, fontWeight: '900' },
  constellationFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4 },
  constellationCopy: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  gallery: { maxHeight: '91%', minHeight: '68%', borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
  galleryHandle: { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 9 },
  galleryHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  galleryHeaderCopy: { flex: 1, gap: 4 },
  galleryTitle: { fontSize: 30, lineHeight: 36, fontFamily: 'PlayfairDisplay_700Bold' },
  gallerySubtitle: { maxWidth: 310, fontSize: 12, lineHeight: 18 },
  closeButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  galleryList: { paddingHorizontal: 16, paddingBottom: 28 },
  galleryLead: { marginBottom: 14 },
  galleryRow: { justifyContent: 'space-between' },
  galleryCell: { width: '48.35%', marginBottom: 12 },
});
