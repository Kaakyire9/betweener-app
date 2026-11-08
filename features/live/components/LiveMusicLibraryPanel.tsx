import { LinearGradient } from 'expo-linear-gradient';
import {
  Headphones,
  ListMusic,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipForward,
  Square,
  UsersRound,
  Volume2,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LiveOdoShowDirectorController } from '../odo/show/use-live-odo-show-director.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

const WAVE = [12, 23, 16, 31, 20, 37, 27, 18, 34, 24, 39, 19, 29, 15, 35, 22, 30, 17];

export function LiveMusicLibraryPanel({
  controller,
}: {
  controller: LiveOdoShowDirectorController;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const tracks = controller.catalogue?.tracks ?? [];
  const playlists = controller.catalogue?.playlists ?? [];
  const music = controller.state?.music ?? null;
  const activeIndex = tracks.findIndex((track) => track.id === music?.trackId);
  const activeTrack = activeIndex >= 0 ? tracks[activeIndex] : null;
  const isPlaying = music?.status === 'playing' || music?.status === 'ducked'
    || music?.status === 'fading';
  const musicOnStage = controller.state?.currentScene === 'music_intermission';
  const canShowOnStage = Boolean(music?.trackId && music.status !== 'stopped');
  const disabled = controller.busyAction !== null || music?.enabled !== true;

  const playAdjacent = (offset: number) => {
    if (!tracks.length) return;
    const base = activeIndex >= 0 ? activeIndex : offset > 0 ? -1 : 0;
    const next = tracks[(base + offset + tracks.length) % tracks.length];
    if (next) void controller.controlMusic('play_track', { trackId: next.id });
  };
  const shuffle = () => {
    if (!tracks.length) return;
    const candidates = tracks.filter((track) => track.id !== music?.trackId);
    const next = candidates[Math.floor(Math.random() * candidates.length)] ?? tracks[0];
    if (next) void controller.controlMusic('play_track', { trackId: next.id });
  };
  const cycleRepeat = () => {
    const action = controller.repeatMode === 'off'
      ? 'repeat_one'
      : controller.repeatMode === 'one' ? 'repeat_all' : 'repeat_off';
    void controller.controlMusic(action);
  };

  if (!controller.state && controller.loading) {
    return <ActivityIndicator color={visual.color.teal} />;
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[visual.color.tealSoft, visual.color.surfaceRaised, visual.color.purpleSoft]}
        locations={[0, 0.62, 1]}
        style={styles.player}
      >
        <View style={styles.nowPlayingTop}>
          <View>
            <Text style={styles.eyebrow}>PLAYING FROM</Text>
            <Text style={styles.collection}>Betweener Music</Text>
          </View>
          <View style={styles.libraryBadge}><ListMusic color={visual.color.teal} size={18} /></View>
        </View>

        <LinearGradient
          colors={[visual.color.teal, visual.color.surfaceSoft, visual.color.purple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.artwork}
        >
          <View style={styles.artworkOrbit} />
          <Music2 color={visual.color.oat} size={42} />
          <Text style={styles.artworkWordmark}>BETWEENER</Text>
          <Text style={styles.artworkTitle}>{activeTrack?.mood.replaceAll('_', ' ') ?? 'LIVE'}</Text>
        </LinearGradient>

        <Text numberOfLines={1} style={styles.trackTitle}>{activeTrack?.title ?? music?.title ?? 'Choose a track'}</Text>
        <Text numberOfLines={1} style={styles.artist}>{activeTrack?.artist ?? music?.artist ?? 'Approved global catalogue'}</Text>

        <View accessibilityLabel="Programme audio visualization" style={styles.waveform}>
          {WAVE.map((height, index) => (
            <View key={`${height}-${index}`} style={[
              styles.waveBar,
              { height },
              index > Math.floor(WAVE.length * 0.66) && styles.waveBarQuiet,
            ]} />
          ))}
        </View>

        <View style={styles.transport}>
          <Pressable accessibilityLabel="Shuffle Programme Music" disabled={disabled || tracks.length < 2} onPress={shuffle} style={styles.transportSmall}>
            <Shuffle color={visual.color.textMuted} size={19} />
          </Pressable>
          <Pressable accessibilityLabel="Previous Programme Music track" disabled={disabled || !tracks.length} onPress={() => playAdjacent(-1)} style={styles.transportSmall}>
            <SkipForward color={visual.color.text} size={24} style={{ transform: [{ rotate: '180deg' }] }} />
          </Pressable>
          <Pressable
            accessibilityLabel={isPlaying ? 'Pause Programme Music' : 'Play Programme Music'}
            disabled={disabled || (!music?.trackId && !tracks.length)}
            onPress={() => {
              if (!music?.trackId && tracks[0]) {
                void controller.controlMusic('play_track', { trackId: tracks[0].id });
              } else {
                void controller.controlMusic(isPlaying ? 'pause' : 'resume');
              }
            }}
            style={[styles.playButton, disabled && styles.disabled]}
          >
            {controller.busyAction === 'music'
              ? <ActivityIndicator color={visual.color.accentContrast} size="small" />
              : isPlaying
                ? <Pause color={visual.color.accentContrast} fill={visual.color.accentContrast} size={24} />
                : <Play color={visual.color.accentContrast} fill={visual.color.accentContrast} size={25} />}
          </Pressable>
          <Pressable accessibilityLabel="Next Programme Music track" disabled={disabled || !tracks.length} onPress={() => playAdjacent(1)} style={styles.transportSmall}>
            <SkipForward color={visual.color.text} fill={visual.color.text} size={24} />
          </Pressable>
          <Pressable accessibilityLabel={`Repeat ${controller.repeatMode}`} disabled={disabled} onPress={cycleRepeat} style={styles.transportSmall}>
            {controller.repeatMode === 'one'
              ? <Repeat1 color={visual.color.purple} size={21} />
              : <Repeat color={controller.repeatMode === 'all' ? visual.color.teal : visual.color.textMuted} size={21} />}
          </Pressable>
        </View>

        <View style={styles.utilityRow}>
          <Pressable disabled={disabled} onPress={() => void controller.controlMusic(
            music?.status === 'ducked' ? 'unduck' : 'duck',
          )} style={[styles.utilityButton, music?.status === 'ducked' && styles.utilitySelected]}>
            <Volume2 color={visual.color.teal} size={16} />
            <Text style={styles.utilityText}>{music?.status === 'ducked' ? 'Unduck' : 'Duck'}</Text>
          </Pressable>
          <Pressable disabled={disabled || !music?.trackId} onPress={() => void controller.controlMusic('stop')} style={styles.utilityButton}>
            <Square color={visual.color.danger} size={14} />
            <Text style={styles.utilityText}>Stop</Text>
          </Pressable>
          <View style={styles.repeatReadout}>
            <Text style={styles.repeatLabel}>REPEAT</Text>
            <Text style={styles.repeatValue}>{controller.repeatMode === 'one' ? '1' : controller.repeatMode.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.volumeRow}>
          <Text style={styles.volumeLabel}>PROGRAMME LEVEL</Text>
          {[0.15, 0.28, 0.4].map((volume) => (
            <Pressable
              key={volume}
              disabled={disabled}
              onPress={() => void controller.controlMusic('set_volume', { volume })}
              style={[styles.volumeChip, Math.abs((music?.volume ?? 0) - volume) < 0.02 && styles.volumeChipSelected]}
            >
              <Text style={styles.volumeChipText}>{Math.round(volume * 100)}%</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityHint={musicOnStage
            ? 'Restores the exact stage layout shown before the music intermission'
            : 'Shows a visual-only Betweener Music player to the audience'}
          accessibilityLabel={musicOnStage
            ? 'Return people to the Live stage'
            : 'Show Betweener Music on the Live stage'}
          accessibilityRole="button"
          disabled={disabled || (!musicOnStage && !canShowOnStage)}
          onPress={() => void controller.setMusicStageVisible(!musicOnStage)}
          style={[
            styles.stageButton,
            musicOnStage && styles.stageButtonActive,
            (disabled || (!musicOnStage && !canShowOnStage)) && styles.disabled,
          ]}
        >
          <View style={styles.stageButtonIcon}>
            {musicOnStage
              ? <UsersRound color={visual.color.teal} size={19} />
              : <Radio color={visual.color.teal} size={19} />}
          </View>
          <View style={styles.stageButtonCopy}>
            <Text style={styles.stageButtonTitle}>
              {musicOnStage ? 'Return people to stage' : 'Show music on stage'}
            </Text>
            <Text style={styles.stageButtonBody}>
              {musicOnStage
                ? 'Restore the previous scene without reconnecting anyone.'
                : 'Keep the Host microphone live for introductions; Duck while speaking.'}
            </Text>
          </View>
          {controller.busyAction === 'music-stage'
            ? <ActivityIndicator color={visual.color.teal} size="small" />
            : null}
        </Pressable>
      </LinearGradient>

      <View style={styles.catalogueCard}>
        <View style={styles.monitorNotice}>
          <Headphones color={visual.color.teal} size={17} />
          <Text style={styles.monitorNoticeText}>One protected Programme Audio feed plays through the Live call for everyone. Phones never create a second music mix. Use headphones when testing nearby devices.</Text>
        </View>
        <Text style={styles.catalogueEyebrow}>GLOBAL APPROVED LIBRARY</Text>
        <Text style={styles.catalogueTitle}>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'} ready</Text>
        <Text style={styles.catalogueCopy}>One approved catalogue for every Live, published once through Stream and heard in sync by the room.</Text>
        {playlists.length ? (
          <ScrollView
            contentContainerStyle={styles.playlistRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {playlists.map((playlist) => {
              const selected = playlist.id === music?.playlistId;
              return (
                <Pressable
                  key={playlist.id}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => void controller.controlMusic('play_playlist', {
                    playlistId: playlist.id,
                  })}
                  style={[styles.playlistChip, selected && styles.playlistChipSelected]}
                >
                  <ListMusic color={selected ? visual.color.accentContrast : visual.color.teal} size={14} />
                  <View>
                    <Text style={[styles.playlistName, selected && styles.playlistNameSelected]}>{playlist.name}</Text>
                    <Text style={[styles.playlistMeta, selected && styles.playlistNameSelected]}>{playlist.trackIds.length} tracks</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        <ScrollView nestedScrollEnabled style={styles.trackList}>
          {tracks.map((track) => {
            const selected = track.id === music?.trackId;
            return (
              <Pressable
                key={track.id}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => void controller.controlMusic(
                  selected && isPlaying ? 'pause' : 'play_track',
                  selected && isPlaying ? undefined : { trackId: track.id },
                )}
                style={[styles.trackRow, selected && styles.trackRowSelected]}
              >
                <View style={[styles.trackIcon, selected && styles.trackIconSelected]}>
                  {selected && isPlaying
                    ? <Pause color={visual.color.accentContrast} size={14} />
                    : <Play color={selected ? visual.color.accentContrast : visual.color.teal} size={14} />}
                </View>
                <View style={styles.trackCopy}>
                  <Text numberOfLines={1} style={styles.trackRowTitle}>{track.title}</Text>
                  <Text numberOfLines={1} style={styles.trackMeta}>{track.artist} · {track.mood.replaceAll('_', ' ')}</Text>
                </View>
                <Text style={styles.duration}>{formatDuration(track.durationSeconds)}</Text>
              </Pressable>
            );
          })}
          {!tracks.length ? <Text style={styles.empty}>No approved licensed tracks are available yet.</Text> : null}
        </ScrollView>
      </View>

      {!music?.enabled ? <Text style={styles.error}>Programme Music is disabled by rollout policy.</Text> : null}
      {controller.error ? <Text accessibilityRole="alert" style={styles.error}>{controller.error}</Text> : null}
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { gap: 14 },
  player: { borderRadius: 28, padding: 18, borderWidth: 1, borderColor: visual.color.borderStrong, overflow: 'hidden' },
  nowPlayingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.7, fontFamily: 'Manrope_800ExtraBold' },
  collection: { marginTop: 2, color: visual.color.text, fontSize: 13, fontFamily: 'Manrope_700Bold' },
  libraryBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceTranslucent, borderWidth: 1, borderColor: visual.color.border },
  artwork: { alignSelf: 'center', width: 220, height: 220, borderRadius: 28, marginTop: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  artworkOrbit: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: '#FFFFFF42' },
  artworkWordmark: { marginTop: 18, color: visual.color.oat, fontSize: 10, letterSpacing: 3, fontFamily: 'Manrope_800ExtraBold' },
  artworkTitle: { marginTop: 3, color: visual.color.oat, fontSize: 25, textTransform: 'uppercase', fontFamily: 'PlayfairDisplay_700Bold' },
  trackTitle: { marginTop: 18, color: visual.color.text, fontSize: 20, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold' },
  artist: { marginTop: 4, color: visual.color.textMuted, fontSize: 11, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  waveform: { height: 42, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: visual.color.teal },
  waveBarQuiet: { backgroundColor: visual.color.borderStrong },
  transport: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  transportSmall: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal, shadowColor: visual.color.teal, shadowOpacity: 0.24, shadowRadius: 16, elevation: 7 },
  disabled: { opacity: 0.48 },
  utilityRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  utilityButton: { flex: 1, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceTranslucent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  utilitySelected: { borderColor: visual.color.teal, backgroundColor: visual.color.tealSoft },
  utilityText: { color: visual.color.text, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  repeatReadout: { flex: 1, minHeight: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft },
  repeatLabel: { color: visual.color.purple, fontSize: 7, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  repeatValue: { color: visual.color.text, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  volumeRow: { marginTop: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  volumeLabel: { flex: 1, color: visual.color.textMuted, fontSize: 8, letterSpacing: 1, fontFamily: 'Manrope_800ExtraBold' },
  volumeChip: { paddingHorizontal: 10, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.color.border },
  volumeChipSelected: { backgroundColor: visual.color.tealSoft, borderColor: visual.color.teal },
  volumeChipText: { color: visual.color.text, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  stageButton: { marginTop: 15, minHeight: 68, padding: 11, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surfaceTranslucent },
  stageButtonActive: { borderColor: visual.color.teal, backgroundColor: visual.color.tealSoft },
  stageButtonIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised },
  stageButtonCopy: { flex: 1 },
  stageButtonTitle: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  stageButtonBody: { marginTop: 3, color: visual.color.textMuted, fontSize: 8, lineHeight: 12, fontFamily: 'Manrope_500Medium' },
  catalogueCard: { borderRadius: 24, padding: 16, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surface },
  monitorNotice: { marginBottom: 14, padding: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: visual.color.tealSoft, borderWidth: 1, borderColor: visual.color.borderStrong },
  monitorNoticeText: { flex: 1, color: visual.color.textMuted, fontSize: 9, lineHeight: 14, fontFamily: 'Manrope_600SemiBold' },
  catalogueEyebrow: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  catalogueTitle: { marginTop: 5, color: visual.color.text, fontSize: 19, fontFamily: 'PlayfairDisplay_700Bold' },
  catalogueCopy: { marginTop: 6, color: visual.color.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  playlistRail: { gap: 8, paddingTop: 12, paddingRight: 8 },
  playlistChip: { minHeight: 48, minWidth: 130, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceRaised },
  playlistChipSelected: { borderColor: visual.color.teal, backgroundColor: visual.color.teal },
  playlistName: { color: visual.color.text, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  playlistNameSelected: { color: visual.color.accentContrast },
  playlistMeta: { marginTop: 1, color: visual.color.textMuted, fontSize: 7, fontFamily: 'Manrope_600SemiBold' },
  trackList: { maxHeight: 280, marginTop: 12 },
  trackRow: { minHeight: 60, marginBottom: 7, paddingHorizontal: 10, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  trackRowSelected: { borderColor: visual.color.teal, backgroundColor: visual.color.tealSoft },
  trackIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.tealSoft },
  trackIconSelected: { backgroundColor: visual.color.teal },
  trackCopy: { flex: 1 },
  trackRowTitle: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_700Bold' },
  trackMeta: { marginTop: 2, color: visual.color.textMuted, fontSize: 8, textTransform: 'capitalize', fontFamily: 'Manrope_500Medium' },
  duration: { color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  empty: { paddingVertical: 22, color: visual.color.textMuted, textAlign: 'center', fontSize: 11, fontFamily: 'Manrope_500Medium' },
  error: { color: visual.color.dangerText, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
});
