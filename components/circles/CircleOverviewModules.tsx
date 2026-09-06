import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type SpotlightProps = {
  accessibilityLabel: string;
  eyebrow: string;
  title: string;
  description?: string | null;
  meta: string;
  cta: string;
  icon: IconName;
  imageUrl?: string | null;
  live?: boolean;
  onPress: () => void;
};

export function CircleNowSpotlight({
  accessibilityLabel,
  eyebrow,
  title,
  description,
  meta,
  cta,
  icon,
  imageUrl,
  live = false,
  onPress,
}: SpotlightProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.spotlight, pressed && styles.pressed]}
    >
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.spotlightImage} resizeMode="cover" /> : null}
      <View pointerEvents="none" style={styles.spotlightOrb} />
      <LinearGradient
        colors={imageUrl
          ? ['rgba(8,25,23,0.2)', 'rgba(8,25,23,0.8)', 'rgba(8,21,20,0.99)']
          : ['#183D37', '#112B27', '#0E201E']}
        locations={[0, 0.56, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.spotlightContent}>
        <View style={styles.spotlightTop}>
          <View style={[styles.spotlightIcon, live && styles.spotlightIconLive]}>
            <MaterialCommunityIcons name={icon} size={22} color={live ? '#102522' : '#E2C579'} />
          </View>
          <View style={styles.spotlightKicker}>
            <View style={styles.eyebrowRow}>
              {live ? <View style={styles.liveDot} /> : null}
              <Text style={styles.spotlightEyebrow}>{eyebrow}</Text>
            </View>
            <Text style={styles.spotlightMeta} numberOfLines={1}>{meta}</Text>
          </View>
        </View>
        <View style={styles.spotlightCopy}>
          <Text style={styles.spotlightTitle} numberOfLines={2}>{title}</Text>
          {description ? <Text style={styles.spotlightDescription} numberOfLines={2}>{description}</Text> : null}
        </View>
        <View style={styles.spotlightCtaRow}>
          <Text style={styles.spotlightCta}>{cta}</Text>
          <View style={styles.arrowButton}>
            <MaterialCommunityIcons name="arrow-right" size={17} color="#E6CB85" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

type TileProps = {
  accessibilityLabel: string;
  eyebrow: string;
  title: string;
  meta: string;
  icon: IconName;
  accent?: 'teal' | 'violet' | 'gold' | 'rose';
  onPress: () => void;
};

export function CircleOverviewTile({
  accessibilityLabel,
  eyebrow,
  title,
  meta,
  icon,
  accent = 'teal',
  onPress,
}: TileProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const palette = TILE_PALETTES[accent];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.backgroundSubtle, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: palette.fill }]}>
        <MaterialCommunityIcons name={icon} size={19} color={palette.foreground} />
      </View>
      <View style={styles.tileCopy}>
        <Text style={[styles.tileEyebrow, { color: palette.foreground }]}>{eyebrow}</Text>
        <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={2}>{title}</Text>
      </View>
      <View style={styles.tileFooter}>
        <Text style={[styles.tileMeta, { color: theme.textMuted }]} numberOfLines={1}>{meta}</Text>
        <MaterialCommunityIcons name="arrow-top-right" size={15} color={palette.foreground} />
      </View>
    </Pressable>
  );
}

type MomentsProps = {
  title: string;
  meta: string;
  imageUrl?: string | null;
  onPress: () => void;
};

export function CircleMomentsRibbon({ title, meta, imageUrl, onPress }: MomentsProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Circle Moments"
      onPress={onPress}
      style={({ pressed }) => [
        styles.momentsRibbon,
        { backgroundColor: theme.backgroundSubtle, borderColor: 'rgba(200,135,145,0.24)' },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.momentsVisual}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.momentsImage} resizeMode="cover" /> : (
          <LinearGradient colors={['rgba(190,105,122,0.22)', 'rgba(115,79,142,0.18)']} style={styles.momentsFallback}>
            <MaterialCommunityIcons name="image-multiple-outline" size={25} color="#D79AA4" />
          </LinearGradient>
        )}
      </View>
      <View style={styles.momentsCopy}>
        <Text style={styles.momentsEyebrow}>MOMENTS</Text>
        <Text style={[styles.momentsTitle, { color: theme.text }]} numberOfLines={2}>{title}</Text>
        <Text style={[styles.momentsMeta, { color: theme.textMuted }]} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={[styles.peopleArrow, { borderColor: theme.outline }]}>
        <MaterialCommunityIcons name="arrow-right" size={17} color="#C88791" />
      </View>
    </Pressable>
  );
}

type PeopleProps = {
  count: number;
  people: readonly { id: string; name: string; avatarUrl?: string | null }[];
  onPress: () => void;
};

export function CirclePeopleRibbon({ count, people, onPress }: PeopleProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const names = people
    .slice(0, 3)
    .map((person) => person.name.trim().match(/[\p{L}\p{M}'’-]+/u)?.[0] ?? '')
    .filter(Boolean);
  const remainingPeople = Math.max(0, count - names.length);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View Circle members"
      onPress={onPress}
      style={({ pressed }) => [
        styles.peopleRibbon,
        { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.peopleAvatars}>
        {people.slice(0, 4).map((person, index) => {
          const uri = normalizeProfilePhotoUri(person.avatarUrl);
          return (
            <View key={person.id} style={[styles.peopleAvatarFrame, index > 0 && styles.peopleAvatarOverlap]}>
              {uri ? <Image source={{ uri }} style={styles.peopleAvatar} /> : (
                <Text style={styles.peopleAvatarInitial}>{person.name.trim().charAt(0).toUpperCase() || 'B'}</Text>
              )}
            </View>
          );
        })}
        {people.length === 0 ? (
          <View style={styles.peopleAvatarFrame}>
            <MaterialCommunityIcons name="account-group-outline" size={19} color="#A5D9CE" />
          </View>
        ) : null}
      </View>
      <View style={styles.peopleRibbonCopy}>
        <Text style={[styles.peopleRibbonTitle, { color: theme.text }]}>{count} {count === 1 ? 'person' : 'people'} inside</Text>
        <Text style={[styles.peopleRibbonBody, { color: theme.textMuted }]} numberOfLines={1}>
          {names.length > 0
            ? `${names.join(', ')}${remainingPeople > 0 ? ` and ${remainingPeople} more` : ''}`
            : 'Meet the people who make this Circle feel alive'}
        </Text>
      </View>
      <View style={[styles.peopleArrow, { borderColor: theme.outline }]}>
        <MaterialCommunityIcons name="arrow-right" size={17} color={theme.tint} />
      </View>
    </Pressable>
  );
}

const TILE_PALETTES = {
  teal: { foreground: '#31BDB2', fill: 'rgba(28,173,163,0.14)', border: 'rgba(49,189,178,0.25)' },
  violet: { foreground: '#A78ADE', fill: 'rgba(139,105,196,0.14)', border: 'rgba(167,138,222,0.25)' },
  gold: { foreground: '#D2AE58', fill: 'rgba(202,160,64,0.14)', border: 'rgba(210,174,88,0.25)' },
  rose: { foreground: '#C88791', fill: 'rgba(190,105,122,0.13)', border: 'rgba(200,135,145,0.24)' },
} as const;

const styles = StyleSheet.create({
  spotlight: {
    minHeight: 248,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,185,113,0.28)',
    backgroundColor: '#12322E',
  },
  spotlightImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  spotlightOrb: {
    position: 'absolute',
    width: 175,
    height: 175,
    borderRadius: 88,
    top: -95,
    right: -40,
    backgroundColor: 'rgba(213,179,98,0.13)',
  },
  spotlightContent: { minHeight: 248, padding: 20, justifyContent: 'space-between' },
  spotlightTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  spotlightIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(219,190,113,0.12)', borderWidth: 1, borderColor: 'rgba(219,190,113,0.22)' },
  spotlightIconLive: { backgroundColor: '#28BEB4', borderColor: '#7EE4DA' },
  spotlightKicker: { flex: 1, gap: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4BE3D7' },
  spotlightEyebrow: { color: '#F0D58D', fontSize: 10, letterSpacing: 1.55, fontFamily: 'Manrope_800ExtraBold', textShadowColor: 'rgba(0,0,0,0.38)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  spotlightMeta: { color: '#D6E0DD', fontSize: 11, fontFamily: 'Manrope_700Bold', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  spotlightCopy: { gap: 7, marginTop: 24 },
  spotlightTitle: { color: '#FFF6E5', fontSize: 27, lineHeight: 32, fontFamily: 'PlayfairDisplay_700Bold', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 7 },
  spotlightDescription: { color: '#D0DCDA', fontSize: 12, lineHeight: 19, fontFamily: 'Manrope_600SemiBold', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  spotlightCtaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  spotlightCta: { color: '#E6CB85', fontSize: 11, letterSpacing: 0.55, fontFamily: 'Manrope_800ExtraBold' },
  arrowButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(226,197,121,0.1)', borderWidth: 1, borderColor: 'rgba(226,197,121,0.25)' },
  tile: {
    minHeight: 164,
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 136,
    padding: 15,
    borderRadius: 23,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  tileIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  tileCopy: { gap: 5, marginTop: 13 },
  tileEyebrow: { fontSize: 8, letterSpacing: 1.35, fontFamily: 'Manrope_800ExtraBold' },
  tileTitle: { fontSize: 16, lineHeight: 21, fontFamily: 'PlayfairDisplay_700Bold' },
  tileFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  tileMeta: { flex: 1, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  momentsRibbon: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 11, borderRadius: 24, borderWidth: 1 },
  momentsVisual: { width: 86, height: 90, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(190,105,122,0.12)' },
  momentsImage: { width: '100%', height: '100%' },
  momentsFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  momentsCopy: { flex: 1, minWidth: 0, gap: 5 },
  momentsEyebrow: { color: '#C88791', fontSize: 8, letterSpacing: 1.45, fontFamily: 'Manrope_800ExtraBold' },
  momentsTitle: { fontSize: 16, lineHeight: 21, fontFamily: 'PlayfairDisplay_700Bold' },
  momentsMeta: { fontSize: 9, fontFamily: 'Manrope_700Bold' },
  peopleRibbon: { minHeight: 88, flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 24, borderWidth: 1 },
  peopleAvatars: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  peopleAvatarFrame: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#203D38', borderWidth: 2, borderColor: '#102522' },
  peopleAvatarOverlap: { marginLeft: -11 },
  peopleAvatar: { width: '100%', height: '100%' },
  peopleAvatarInitial: { color: '#DDEBE7', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  peopleRibbonCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  peopleRibbonTitle: { fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  peopleRibbonBody: { marginTop: 3, fontSize: 10, fontFamily: 'Manrope_500Medium' },
  peopleArrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
