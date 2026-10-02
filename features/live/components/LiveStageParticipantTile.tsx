import {
  hasAudio,
  hasVideo,
  SfuModels,
  type StreamVideoParticipant,
  type VideoTrackType,
} from '@stream-io/video-client';
import {
  type ParticipantVideoFallbackProps,
} from '@stream-io/video-react-native-sdk';
import { Image } from 'expo-image';
import { MicOff, SignalLow } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import type { StreamVideoSdkModule } from '../media/load-stream-video-sdk.ts';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

export type LiveStageParticipantIdentity = {
  fullName: string | null;
  avatarUrl: string | null;
  role?: string | null;
};

type LiveStageParticipantTileProps = {
  participant: StreamVideoParticipant | null;
  identity: LiveStageParticipantIdentity | null;
  fit: 'contain' | 'cover';
  ParticipantViewComponent: StreamVideoSdkModule['ParticipantView'];
  footerInset?: number;
  trackType?: VideoTrackType;
  editorialFocus?: boolean;
  compactFallback?: boolean;
  stageOverlay?: ReactNode;
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

const CameraOffFallback = ({
  avatarUrl,
  compact,
  displayName,
}: {
  avatarUrl: string | null;
  compact?: boolean;
  displayName: string;
}) => (
  <View style={styles.fallback}>
    <View style={[styles.fallbackGlow, compact && styles.fallbackGlowCompact]} />
    <View style={[styles.portraitFrame, compact && styles.portraitFrameCompact]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          contentFit="cover"
          style={[styles.avatar, compact && styles.avatarCompact]}
          transition={120}
        />
      ) : (
        <View style={[styles.initialsCircle, compact && styles.initialsCircleCompact]}>
          <Text style={[styles.initials, compact && styles.initialsCompact]}>{initialsFor(displayName)}</Text>
        </View>
      )}
    </View>
  </View>
);

export const LiveStageParticipantTile = memo(function LiveStageParticipantTile({
  participant,
  identity,
  fit,
  ParticipantViewComponent,
  footerInset = 0,
  trackType = 'videoTrack',
  editorialFocus,
  compactFallback,
  stageOverlay,
}: LiveStageParticipantTileProps) {
  const cameraOn = participant ? hasVideo(participant) : false;
  const microphoneOn = participant ? hasAudio(participant) : false;
  const displayName = participant?.isLocalParticipant
    ? 'You'
    : identity?.fullName?.trim() || participant?.name?.trim() || 'Betweener member';
  const avatarUrl = identity?.avatarUrl?.trim() || participant?.image?.trim() || null;
  const connectionQuality = participant?.connectionQuality ?? SfuModels.ConnectionQuality.UNSPECIFIED;
  const qualityLabel = connectionLabel(connectionQuality);
  const editoriallyFocused = editorialFocus ?? participant?.isSpeaking === true;
  const focusOpacity = useRef(new Animated.Value(editoriallyFocused ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const identityLabel = identity?.role === 'host'
    ? 'HOST'
    : editoriallyFocused ? 'SPEAKING' : null;
  const VideoFallback = useCallback((_props: ParticipantVideoFallbackProps) => (
    <CameraOffFallback avatarUrl={avatarUrl} compact={compactFallback} displayName={displayName} />
  ), [avatarUrl, compactFallback, displayName]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const target = editoriallyFocused ? 1 : 0;
    if (reduceMotion) {
      focusOpacity.setValue(target);
      return;
    }
    const animation = Animated.timing(focusOpacity, {
      toValue: target,
      duration: 180,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [editoriallyFocused, focusOpacity, reduceMotion]);

  return (
    <View
      accessible
      accessibilityLabel={`${displayName}. ${cameraOn ? 'Camera on' : 'Camera off'}. ${microphoneOn ? 'Microphone on' : 'Microphone muted'}. ${qualityLabel}.`}
      style={styles.root}
    >
      {participant ? (
        <ParticipantViewComponent
          participant={participant}
          trackType={trackType}
          objectFit={fit}
          style={styles.participant}
          ParticipantLabel={null}
          ParticipantReaction={null}
          ParticipantNetworkQualityIndicator={null}
          ParticipantVideoFallback={VideoFallback}
        />
      ) : (
        <CameraOffFallback
          avatarUrl={avatarUrl}
          compact={compactFallback}
          displayName={displayName}
        />
      )}
      {stageOverlay}
      <Animated.View pointerEvents="none" style={[styles.focusFrame, { opacity: focusOpacity }]} />
      <View pointerEvents="none" style={[styles.footer, { bottom: 8 + footerInset }]}>
        <View style={styles.namePill}>
          <View style={styles.namePillSheen} />
          <Text numberOfLines={1} style={styles.name}>{displayName}</Text>
          {identityLabel ? <Text style={styles.identityLabel}>{identityLabel}</Text> : null}
          {!microphoneOn ? (
            <View style={styles.mutedBadge}>
              <View style={styles.statusDivider} />
              <MicOff size={10} color="#ECA8A2" strokeWidth={2} />
            </View>
          ) : null}
        </View>
        {connectionQuality === SfuModels.ConnectionQuality.POOR ? (
          <View accessibilityLabel={qualityLabel} style={styles.signalPill}>
            <SignalLow color="#F2B66D" size={16} strokeWidth={2.2} />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#12211F',
  },
  focusFrame: {
    position: 'absolute',
    top: 0,
    right: '22%',
    left: '22%',
    height: 2,
    borderRadius: 1,
    backgroundColor: LIVE_VISUAL.color.teal,
    shadowColor: LIVE_VISUAL.color.teal,
    shadowOpacity: 0.65,
    shadowRadius: 7,
  },
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
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: '#806CA816',
    borderWidth: 1,
    borderColor: '#A892DC2E',
  },
  fallbackGlowCompact: { width: 104, height: 104, borderRadius: 52 },
  portraitFrame: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A1A18D9',
    borderWidth: 1,
    borderColor: '#78D4C49A',
    shadowColor: '#806CA8',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  portraitFrameCompact: { width: 76, height: 76, borderRadius: 38 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  avatarCompact: { width: 66, height: 66, borderRadius: 33 },
  initialsCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#173A35',
  },
  initialsCircleCompact: { width: 66, height: 66, borderRadius: 33 },
  initials: { color: '#F8E9CC', fontSize: 25, fontFamily: 'Archivo_700Bold' },
  initialsCompact: { fontSize: 21 },
  footer: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  namePill: {
    maxWidth: '82%',
    minHeight: 27,
    paddingLeft: 9,
    paddingRight: 7,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    overflow: 'hidden',
    backgroundColor: '#071512CC',
    borderWidth: 1,
    borderColor: '#F1E4CB2E',
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  namePillSheen: { position: 'absolute', top: 0, right: 9, left: 9, height: 1, backgroundColor: '#FFF4DE42' },
  name: { flexShrink: 1, color: '#FFF9EF', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  identityLabel: { color: LIVE_VISUAL.color.teal, fontSize: 6, letterSpacing: 0.65, fontFamily: 'Manrope_800ExtraBold' },
  mutedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDivider: { width: 1, height: 13, backgroundColor: '#F1E4CB2E' },
  signalPill: {
    height: 29,
    minWidth: 31,
    paddingHorizontal: 8,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#071210D9',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
  },
});
