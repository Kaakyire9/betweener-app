import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Text } from 'react-native';
import type { VoiceController } from '../voice/voice-controller';
import { connectFeatureFlags, type ConnectFeatureFlags } from '../config/connect-feature-flags';
import { VoiceCallScreen, type VoiceScreenProps } from './VoiceCallScreen';
import { VideoCallScreen } from './VideoCallScreen';

interface Props {
  controller: VoiceController; flags?: ConnectFeatureFlags;
  ownsController?: boolean; visible?: boolean;
  onWithdrawCallingConsent?(): Promise<void>;
  onClose(): void; onOpenSettings(): void;
  onMinimize?(): void;
}
/** Internal view binding only. Trusted Auth/API/native ownership remains with its host. */
export function ConnectVoiceSession(props: Props) {
  if ((props.flags ?? connectFeatureFlags).nativeSafetyOwner !== true) return <Text>Voice calling is currently unavailable.</Text>;
  return <EnabledSession {...props} />;
}
function EnabledSession({ visible, controller, flags, onClose, onOpenSettings, onWithdrawCallingConsent, ownsController = true, onMinimize }: Props) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [actionError, setActionError] = useState<string | null>(null);
  const owners = useRef(new Map<VoiceController, number>());
  useEffect(() => {
    if (!ownsController) return;
    const leases = owners.current;
    leases.set(controller, (leases.get(controller) ?? 0) + 1);
    // Rendering never creates/accepts a call, constructs a native owner, or obtains credentials.
    const timer = setInterval(() => { void controller.tick(); }, 1000);
    return () => {
      clearInterval(timer); leases.set(controller, (leases.get(controller) ?? 1) - 1);
      queueMicrotask(() => {
        // React's development effect replay reacquires this same view before disposal.
        if (leases.get(controller) === 0) { leases.delete(controller); void controller.dispose(); }
      });
    };
  }, [controller, ownsController]);
  const screenProps: VoiceScreenProps = { visible, onMinimize,
    onBackgroundAudio: flags?.backgroundAudio === true ? () => { void controller.toggleBackgroundAudio(); } : undefined,
    onDataSavingVideo: () => { void controller.toggleDataSavingVideo(); },
    state: actionError ? { ...state, error: actionError } : state, canDismiss: controller.canDismissCompletedCall(), flags,
    onAccept: () => { void controller.accept({ cameraOn: state.video?.cameraWanted === true }); }, onDecline: () => { void controller.decline(); },
    onHangup: () => { void controller.hangup(); }, onMute: () => { void controller.toggleMute(); }, onRoute: route => { void controller.selectRoute(route); },
    onDone: () => { if (ownsController) void controller.dispose(); onClose(); }, onOpenSettings,
    safetyActions: { reviewIdentity: () => controller.reviewPeerIdentity(), replaceIdentity: code => controller.replacePeerIdentity(code), verifyIdentity: code => controller.verifyPeerIdentity(code), endAndBlock: () => {
      setActionError(null);
      void controller.endCallAndBlock().catch(() => setActionError('Blocking could not be started. No account block has been confirmed.'));
    }, checkStatus: () => { void controller.refreshEndBlockStatus(); }, withdrawConsent: onWithdrawCallingConsent } };
  return (state.session?.media ?? state.requestedMedia) === 'video' ? <VideoCallScreen {...screenProps} source={controller.videoPresentation()}
    privatePreview={controller.privateVideoPresentation()} onPreviewError={() => { void controller.stopPrivatePreviewForRenderFailure(); }}
    onAnswerCameraChange={flags?.videoCameraOnEntry === true ? on => controller.setCameraOnAnswer(on) : undefined}
    onCamera={() => { void controller.toggleCamera(); }} onFlipCamera={() => { void controller.flipCamera(); }} onVideoError={() => { void controller.stopVideoForRenderFailure(); }} />
    : <VoiceCallScreen {...screenProps} />;
}
