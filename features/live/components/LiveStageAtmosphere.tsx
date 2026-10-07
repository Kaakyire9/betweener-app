import { LinearGradient } from 'expo-linear-gradient';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Image as ImageIcon, Sparkles } from 'lucide-react-native';
import { useMemo } from 'react';

import { getLiveEventMediaUrl } from '../application/live-event-media.ts';
import type { LiveStageAtmosphereController } from '../hooks/use-live-stage-atmosphere.ts';
import type {
  LiveStageAtmosphere,
  LiveStageAtmospherePreset,
} from '../stage/live-stage-atmosphere.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type GradientColors = readonly [string, string, ...string[]];
type SoloAtmosphereAccents = {
  top: readonly [string, string];
  bottom: readonly [string, string];
  edge: string;
};

// A solo camera owns the full Stage. Atmosphere is expressed only at its
// perimeter so artwork and gradients can never obscure the Host's face.
const SOLO_ATMOSPHERE_ACCENTS: Record<LiveStageAtmospherePreset, SoloAtmosphereAccents> = {
  brand_teal: {
    top: ['#2CB9AE38', '#2CB9AE00'],
    bottom: ['#07181500', '#0E393342'],
    edge: '#55CFC46B',
  },
  deep_ocean: {
    top: ['#1F789038', '#1F789000'],
    bottom: ['#030E1300', '#0736424D'],
    edge: '#58B7C66B',
  },
  aurora: {
    top: ['#29A89E33', '#29A89E00'],
    bottom: ['#44356100', '#4435614D'],
    edge: '#B9A9DB70',
  },
  oat_noir: {
    top: ['#B6A77B2E', '#B6A77B00'],
    bottom: ['#191F1C00', '#4B443847'],
    edge: '#D7C99A66',
  },
  live_poster: {
    top: ['#28B4A936', '#28B4A900'],
    bottom: ['#44356100', '#44356142'],
    edge: '#C4B2E070',
  },
};

export const LIVE_STAGE_ATMOSPHERE_META: readonly {
  preset: LiveStageAtmospherePreset;
  label: string;
  description: string;
  colors: GradientColors;
}[] = [
  {
    preset: 'brand_teal',
    label: 'Signature Teal',
    description: 'Confident and unmistakably Betweener.',
    colors: ['#071815', '#0E3933', '#09201D'],
  },
  {
    preset: 'deep_ocean',
    label: 'Deep Ocean',
    description: 'Quiet depth for focused conversations.',
    colors: ['#030E13', '#073642', '#071815'],
  },
  {
    preset: 'aurora',
    label: 'Teal Aurora',
    description: 'Teal energy with a soft lavender lift.',
    colors: ['#071815', '#126B64', '#443561'],
  },
  {
    preset: 'oat_noir',
    label: 'Oat Noir',
    description: 'Warm editorial contrast, kept understated.',
    colors: ['#071311', '#4B4438', '#191F1C'],
  },
  {
    preset: 'live_poster',
    label: 'Live Poster',
    description: 'Use the poster already attached to this Live.',
    colors: ['#0B2A25', '#806CA8', '#071815'],
  },
] as const;

const metaForPreset = (preset: LiveStageAtmospherePreset | undefined) => (
  LIVE_STAGE_ATMOSPHERE_META.find((item) => item.preset === preset)
  ?? LIVE_STAGE_ATMOSPHERE_META[0]
);

export function LiveStageAtmosphereBackdrop({
  atmosphere,
  overlay = false,
}: {
  atmosphere?: LiveStageAtmosphere | null;
  overlay?: boolean;
}) {
  const meta = metaForPreset(atmosphere?.preset);
  const posterUrl = atmosphere?.preset === 'live_poster'
    ? getLiveEventMediaUrl(atmosphere.posterPath)
    : null;
  if (overlay) {
    const accents = SOLO_ATMOSPHERE_ACCENTS[atmosphere?.preset ?? 'brand_teal'];
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['#020807B8', '#02080742', '#02080700']}
          locations={[0, 0.48, 1]}
          style={backdropStyles.cinematicTopScrim}
        />
        <LinearGradient
          colors={['#02080700', '#02080752', '#020807D1']}
          locations={[0, 0.5, 1]}
          style={backdropStyles.cinematicBottomScrim}
        />
        <LinearGradient colors={accents.top} style={backdropStyles.soloTopAura} />
        <LinearGradient colors={accents.bottom} style={backdropStyles.soloBottomAura} />
        <View style={[backdropStyles.soloEdgeFrame, { borderColor: accents.edge }]} />
      </View>
    );
  }
  const canvasColors: GradientColors = posterUrl
    ? ['#07181512', '#07181542', '#071815B8']
    : meta.colors;
  const content = (
    <>
      <LinearGradient colors={canvasColors} style={StyleSheet.absoluteFill} />
      <View style={backdropStyles.orbitLarge} />
      <View style={backdropStyles.orbitSmall} />
      <LinearGradient
        colors={['#02090814', '#02090878', '#020908D4']}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
  return posterUrl ? (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <ImageBackground
        blurRadius={2}
        resizeMode="cover"
        source={{ uri: posterUrl }}
        style={StyleSheet.absoluteFill}
      >
        {content}
      </ImageBackground>
    </View>
  ) : <View pointerEvents="none" style={StyleSheet.absoluteFill}>{content}</View>;
}

export function LiveStageAtmospherePanel({
  controller,
}: {
  controller: LiveStageAtmosphereController;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const selectedPreset = controller.state?.preset ?? 'brand_teal';

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Sparkles color={visual.color.teal} size={21} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>A room with its own mood.</Text>
          <Text style={styles.heroBody}>Atmosphere changes the public stage canvas only. Cameras, Room Pulse, and guest controls stay untouched.</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {LIVE_STAGE_ATMOSPHERE_META.map((item) => {
          const selected = item.preset === selectedPreset;
          const posterUnavailable = item.preset === 'live_poster'
            && controller.state?.hasPoster !== true;
          const thumbnail = (
            <LinearGradient colors={item.colors} style={styles.thumbnail}>
              <View style={styles.previewOrbit} />
              {item.preset === 'live_poster'
                ? <ImageIcon color="#F4EDE1" size={22} />
                : <Sparkles color="#F4EDE1" size={20} />}
              {selected ? <View style={styles.check}><Check color={visual.color.accentContrast} size={12} /></View> : null}
            </LinearGradient>
          );
          const posterUrl = item.preset === 'live_poster'
            ? getLiveEventMediaUrl(controller.state?.posterPath)
            : null;
          return (
            <Pressable
              key={item.preset}
              accessibilityRole="button"
              accessibilityState={{ disabled: posterUnavailable, selected }}
              disabled={controller.busy || posterUnavailable}
              onPress={() => void controller.setPreset(item.preset)}
              style={[styles.presetCard, selected && styles.presetCardSelected, posterUnavailable && styles.disabled]}
            >
              {posterUrl ? (
                <ImageBackground source={{ uri: posterUrl }} imageStyle={styles.thumbnailImage} style={styles.thumbnail}>
                  <LinearGradient colors={['#07181522', '#071815CC']} style={StyleSheet.absoluteFill} />
                  <ImageIcon color="#F4EDE1" size={22} />
                  {selected ? <View style={styles.check}><Check color={visual.color.accentContrast} size={12} /></View> : null}
                </ImageBackground>
              ) : thumbnail}
              <Text style={styles.presetTitle}>{item.label}</Text>
              <Text style={styles.presetBody}>{posterUnavailable ? 'Add a poster in Live details first.' : item.description}</Text>
            </Pressable>
          );
        })}
      </View>
      {controller.error ? <Text accessibilityRole="alert" style={styles.error}>{controller.error}</Text> : null}
    </View>
  );
}

const backdropStyles = StyleSheet.create({
  cinematicTopScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: '25%',
  },
  cinematicBottomScrim: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: '42%',
  },
  soloTopAura: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: '13%',
  },
  soloBottomAura: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: '18%',
  },
  soloEdgeFrame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1,
    borderRadius: 24,
  },
  orbitLarge: { position: 'absolute', width: 420, height: 420, borderRadius: 210, top: '8%', left: '-20%', borderWidth: 1, borderColor: '#5BC1BB2E' },
  orbitSmall: { position: 'absolute', width: 260, height: 260, borderRadius: 130, bottom: '8%', right: '-12%', borderWidth: 1, borderColor: '#CDBAF02B' },
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { gap: 16 },
  hero: { flexDirection: 'row', gap: 13, padding: 16, borderRadius: 22, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.borderStrong },
  heroIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.tealSoft },
  heroCopy: { flex: 1 },
  heroTitle: { color: visual.color.text, fontSize: 17, fontFamily: 'PlayfairDisplay_700Bold' },
  heroBody: { marginTop: 4, color: visual.color.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  presetCard: { width: '48%', minHeight: 174, padding: 9, borderRadius: 20, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surface },
  presetCardSelected: { borderColor: visual.color.teal, backgroundColor: visual.color.tealSoft },
  thumbnail: { height: 94, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbnailImage: { borderRadius: 14 },
  previewOrbit: { position: 'absolute', width: 82, height: 82, borderRadius: 41, borderWidth: 1, borderColor: '#FFFFFF3D' },
  check: { position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal },
  presetTitle: { marginTop: 8, color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  presetBody: { marginTop: 3, color: visual.color.textMuted, fontSize: 8, lineHeight: 12, fontFamily: 'Manrope_500Medium' },
  disabled: { opacity: 0.45 },
  error: { color: visual.color.dangerText, fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
});
