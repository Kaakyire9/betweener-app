import {
  hasAudio,
  hasVideo,
  SfuModels,
  type StreamVideoParticipant,
} from '@stream-io/video-client';
import {
  ParticipantView,
  type ParticipantVideoFallbackProps,
} from '@stream-io/video-react-native-sdk';
import { Image } from 'expo-image';
import { CameraOff, MicOff } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type LiveStageParticipantIdentity = {
  fullName: string | null;
  avatarUrl: string | null;
};

type LiveStageParticipantTileProps = {
  participant: StreamVideoParticipant | null;
  identity: LiveStageParticipantIdentity | null;
  fit: 'contain' | 'cover';
};

const initialsFor = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'B';
};

const connectionLabel = (quality: SfuModels.ConnectionQuality): string => {
  if (quality === SfuModels.ConnectionQuality.EXCELLENT) return 'Excellent connection';
  if (quality === SfuModels.ConnectionQuality.GOOD) return 'Good connection';
  if (quality === SfuModels.ConnectionQuality.POOR) return 'Unstable connection';
  return 'Connection quality unavailable';
};

const connectionBars = (quality: SfuModels.ConnectionQuality): number => {
  if (quality === SfuModels.ConnectionQuality.EXCELLENT) return 3;
  if (quality === SfuModels.ConnectionQuality.GOOD) return 2;
  if (quality === SfuModels.ConnectionQuality.POOR) return 1;
  return 0;
};

const CameraOffFallback = ({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string;
}) => (
  <View style={styles.fallback}>
    <View style={styles.fallbackGlow} />
    {avatarUrl ? (
      <Image source={{ uri: avatarUrl }} contentFit="cover" style={styles.avatar} transition={120} />
    ) : (
      <View style={styles.initialsCircle}>
        <Text style={styles.initials}>{initialsFor(displayName)}</Text>
      </View>
    )}
    <Text numberOfLines={1} style={styles.fallbackName}>{displayName}</Text>
    <View style={styles.cameraOffPill}>
      <CameraOff size={12} color="#E6D6BA" />
      <Text style={styles.cameraOffText}>Camera off</Text>
    </View>
  </View>
);

export const LiveStageParticipantTile = memo(function LiveStageParticipantTile({
  participant,
  identity,
  fit,
}: LiveStageParticipantTileProps) {
  const cameraOn = participant ? hasVideo(participant) : false;
  const microphoneOn = participant ? hasAudio(participant) : false;
  const displayName = participant?.isLocalParticipant
    ? 'You'
    : identity?.fullName?.trim() || participant?.name?.trim() || 'Betweener member';
  const avatarUrl = identity?.avatarUrl?.trim() || participant?.image?.trim() || null;
  const connectionQuality = participant?.connectionQuality ?? SfuModels.ConnectionQuality.UNSPECIFIED;
  const qualityLabel = connectionLabel(connectionQuality);
  const activeBars = connectionBars(connectionQuality);
  const VideoFallback = useCallback((_props: ParticipantVideoFallbackProps) => (
    <CameraOffFallback avatarUrl={avatarUrl} displayName={displayName} />
  ), [avatarUrl, displayName]);

  return (
    <View
      accessible
      accessibilityLabel={`${displayName}. ${cameraOn ? 'Camera on' : 'Camera off'}. ${microphoneOn ? 'Microphone on' : 'Microphone muted'}. ${qualityLabel}.`}
      style={[styles.root, participant?.isSpeaking && styles.speaking]}
    >
      {participant ? (
        <ParticipantView
          participant={participant}
          objectFit={fit}
          style={styles.participant}
          ParticipantLabel={null}
          ParticipantReaction={null}
          ParticipantNetworkQualityIndicator={null}
          ParticipantVideoFallback={VideoFallback}
        />
      ) : <CameraOffFallback avatarUrl={avatarUrl} displayName={displayName} />}
      <View pointerEvents="none" style={styles.footer}>
        <View style={styles.namePill}>
          <Text numberOfLines={1} style={styles.name}>{displayName}</Text>
          {!microphoneOn ? <MicOff size={13} color="#F3E6D2" /> : null}
          {!cameraOn ? <CameraOff size={13} color="#F3E6D2" /> : null}
        </View>
        <View accessibilityLabel={qualityLabel} style={styles.signalPill}>
          {[1, 2, 3].map((bar) => (
            <View
              key={bar}
              style={[
                styles.signalBar,
                { height: 4 + bar * 3 },
                bar <= activeBars ? styles.signalBarActive : styles.signalBarInactive,
                connectionQuality === SfuModels.ConnectionQuality.POOR
                  && bar <= activeBars
                  && styles.signalBarPoor,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#12211F',
    borderWidth: 1,
    borderColor: '#FFFFFF14',
  },
  speaking: { borderColor: '#D7B56D', borderWidth: 2 },
  participant: { flex: 1, borderRadius: 0, borderWidth: 0 },
  fallback: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#10211F',
  },
  fallbackGlow: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#1A6B6038',
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    borderColor: '#D7B56D88',
  },
  initialsCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7B56D99',
    backgroundColor: '#173A35',
  },
  initials: { color: '#F8E9CC', fontSize: 25, fontFamily: 'Archivo_700Bold' },
  fallbackName: {
    maxWidth: '78%',
    color: '#FFF7EC',
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
    marginTop: 13,
  },
  cameraOffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    minHeight: 25,
    borderRadius: 13,
    backgroundColor: '#06100EB8',
  },
  cameraOffText: { color: '#E6D6BA', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  footer: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  namePill: {
    maxWidth: '74%',
    minHeight: 29,
    paddingHorizontal: 10,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#071210D9',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
  },
  name: { flexShrink: 1, color: '#FFF7EC', fontSize: 11, fontFamily: 'Manrope_700Bold' },
  signalPill: {
    height: 29,
    minWidth: 31,
    paddingHorizontal: 8,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    paddingBottom: 7,
    backgroundColor: '#071210D9',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
  },
  signalBar: { width: 3, borderRadius: 2 },
  signalBarActive: { backgroundColor: '#50C9A8' },
  signalBarInactive: { backgroundColor: '#78918B66' },
  signalBarPoor: { backgroundColor: '#E7A46B' },
});
