import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Text } from 'react-native';
import type { VoiceController } from '../voice/voice-controller';
import { connectFeatureFlags, type ConnectFeatureFlags } from '../config/connect-feature-flags';
import { VoiceCallScreen } from './VoiceCallScreen';

interface Props {
  controller: VoiceController; flags?: ConnectFeatureFlags;
  ownsController?: boolean;
  onWithdrawCallingConsent?(): Promise<void>;
  onClose(): void; onOpenSettings(): void;
}
/** Internal view binding only. Trusted Auth/API/native ownership remains with its host. */
export function ConnectVoiceSession(props: Props) {
  if ((props.flags ?? connectFeatureFlags).nativeSafetyOwner !== true) return <Text>Voice calling is currently unavailable.</Text>;
  return <EnabledSession {...props} />;
}
function EnabledSession({ controller, flags, onClose, onOpenSettings, onWithdrawCallingConsent, ownsController = true }: Props) {
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
  return <VoiceCallScreen state={actionError ? { ...state, error: actionError } : state} canDismiss={controller.canDismissCompletedCall()} flags={flags} onAccept={() => { void controller.accept(); }} onDecline={() => { void controller.decline(); }}
    onHangup={() => { void controller.hangup(); }} onMute={() => { void controller.toggleMute(); }} onRoute={route => { void controller.selectRoute(route); }}
    onDone={() => { if (ownsController) void controller.dispose(); onClose(); }} onOpenSettings={onOpenSettings}
    safetyActions={{ endAndBlock: () => {
      setActionError(null);
      void controller.endCallAndBlock().catch(() => setActionError('Blocking could not be started. No account block has been confirmed.'));
    }, checkStatus: () => { void controller.refreshEndBlockStatus(); }, withdrawConsent: onWithdrawCallingConsent }} />;
}
