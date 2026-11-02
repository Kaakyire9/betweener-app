import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import { useConnectProduct } from '@/features/connect/components/ConnectProductProvider';
import { ConnectStatusScreen } from '@/features/connect/components/ConnectStatusScreen';
import { ConnectVoiceSession } from '@/features/connect/components/ConnectVoiceSession';
import { VoiceCallLobby } from '@/features/connect/components/VoiceCallLobby';
import { ConnectVoiceSetup } from '@/features/connect/components/ConnectVoiceSetup';
import { connectFeatureFlags } from '@/features/connect/config/connect-feature-flags';
import { readConnectLaunch, type ConnectLaunch } from '@/features/connect/domain/call-navigation';
import type { ConnectProduct } from '@/features/connect/application/product-coordinator';
import type { VoicePeer } from '@/features/connect/voice/voice-types';
import { terminalStates, type ConnectMedia } from '@/features/connect/domain/connect';
import { readNotificationBinding, notificationMatchesCall, type ConnectNotificationBinding } from '@/features/connect/domain/notification-binding';

export function ConnectCallRoute({ media = 'voice' }: { media?: ConnectMedia }) {
  const context = useConnectProduct(), params = useLocalSearchParams(), router = useRouter();
  const launch = readConnectLaunch(params);
  const notification = readNotificationBinding(params);
  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/intent');
  if (!context.ui || context.status !== 'ready' || !context.product) return <ConnectStatusScreen message={context.status === 'loading' ? 'Preparing your connection…' : undefined} onClose={close} />;
  if (media === 'video' && context.product.flags?.videoCalling !== true) return <ConnectStatusScreen title="Video calling is not available yet" message="Your camera stays off. Video needs separate approval." onClose={close} />;
  if (!launch) return <ConnectStatusScreen title="Invitation unavailable" message="Open a current call invitation or start from your conversation." onClose={close} />;
  if (notification === 'invalid' || (notification && notification.recipientUserId !== context.product.accountUserId)) return <ConnectStatusScreen title="Invitation unavailable" message="This invitation belongs to a different account or session." onClose={close} />;
  return <BoundVoiceRoute key={`${media}:${context.product.selfProfileId}:${context.product.authGeneration}:${JSON.stringify(launch)}:${JSON.stringify(notification)}`} media={media} product={context.product} launch={launch} notification={notification} onClose={close} />;
}
function BoundVoiceRoute({ product, launch, notification, onClose, media }: { media: ConnectMedia; product: ConnectProduct; launch: ConnectLaunch; notification: ConnectNotificationBinding | null; onClose(): void }) {
  const controller = product.controller;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [lobby, setLobby] = useState<{ peer: VoicePeer | null; eligible: boolean; pending: boolean; error: string | null }>({ peer: null, eligible: false, pending: true, error: null });
  const cleanup = useRef<(() => void) | null>(null), started = useRef(false), launchRef = useRef(launch), notificationRef = useRef(notification);
  const [notificationInvalid, setNotificationInvalid] = useState(false);
  const [notificationPending, setNotificationPending] = useState(!!notification);
  const updateEligibility = useCallback((eligible: boolean) => setLobby(value => ({ ...value, eligible })), []);
  useEffect(() => {
    let current = true;
    const target = launchRef.current;
    const notice = notificationRef.current;
    const existing = controller.getSnapshot().session;
    if (existing && !terminalStates.includes(existing.state)) {
      if (notice && target.kind === 'call' && existing.id === target.callId && !notificationMatchesCall(notice, product.accountUserId, existing)) { setNotificationInvalid(true); return; }
      if (target.kind === 'call' && existing.id === target.callId) cleanup.current = product.navigationCleanup(`betweener_connect:${target.callId}`);
      setNotificationPending(false);
      return;
    }
    if (target.kind === 'call') {
      if (controller.getSnapshot().session?.id !== target.callId) {
        const open = async () => {
          if (notice) {
            const canonical = await product.services.api.getCall(target.callId);
            if (!current) return;
            if (!notificationMatchesCall(notice, product.accountUserId, canonical)) { setNotificationInvalid(true); setNotificationPending(false); return; }
          }
          if (!current) return;
          const latest = controller.getSnapshot().session;
          if (latest && latest.id !== target.callId && !terminalStates.includes(latest.state)) { setNotificationPending(false); return; }
          const opening = controller.openCall(target.callId);
          cleanup.current = controller.captureNavigationCleanup();
          await opening;
          if (current) setNotificationPending(false);
        };
        void open().catch(() => { if (current) { setNotificationInvalid(true); setNotificationPending(false); } });
      }
    } else {
      let loading = false;
      const refresh = async () => {
        if (loading || started.current) return;
        loading = true;
        try {
          const [peer, eligible] = await Promise.all([product.services.peer(target.peerId), product.services.checkEligibility(target.peerId, media, target.authorization, target.grantId)]);
          if (current) setLobby({ peer, eligible: eligible === true, pending: false, error: null });
        } catch { if (current) setLobby(value => ({ ...value, eligible: false, pending: false, error: 'Calling permission could not be confirmed.' })); }
        finally { loading = false; }
      };
      void refresh();
      const timer = setInterval(() => { void refresh(); }, 2000);
      return () => { current = false; clearInterval(timer); };
    }
    return () => { current = false; };
  }, [controller, media, product]);
  useEffect(() => {
    const target = launchRef.current;
    if (target.kind === 'outgoing' && state.incoming && state.session && state.peer?.profileId === target.peerId) {
      cleanup.current = controller.captureNavigationCleanup();
    }
  }, [controller, state.incoming, state.peer?.profileId, state.session?.id]);
  const focusLeases = useRef(0);
  useFocusEffect(useCallback(() => {
    ++focusLeases.current;
    return () => { --focusLeases.current; queueMicrotask(() => { if (focusLeases.current === 0) cleanup.current?.(); }); };
  }, []));
  const incomingForPeer = launch.kind === 'outgoing' && !!state.session && state.incoming && state.peer?.profileId === launch.peerId;
  const bound = launch.kind === 'call' ? state.session?.id === launch.callId || !state.session
    : (started.current || incomingForPeer) && state.peer?.profileId === launch.peerId;
  if (notificationInvalid) return <ConnectStatusScreen title="Invitation unavailable" message="Refresh your call history when you are back online. No invitation was accepted." onClose={onClose} />;
  if (notificationPending && !state.session) return <ConnectStatusScreen message="Checking this invitation…" onClose={onClose} />;
  if (state.session && !terminalStates.includes(state.session.state) && !bound) return <ConnectStatusScreen title="Another call is open" message="Finish the current call before opening another invitation." onClose={onClose} />;
  if (launch.kind === 'outgoing' && !started.current && !incomingForPeer) return <VoiceCallLobby media={media} {...lobby} onClose={onClose}
    setup={<ConnectVoiceSetup media={media} product={product} peerId={launch.peerId} matched={launch.authorization === 'matched'} onEligibility={updateEligibility} />} onStart={() => {
    if (!lobby.eligible || !lobby.peer || lobby.pending) return;
    const existing = controller.getSnapshot().session;
    if (existing && !terminalStates.includes(existing.state)) return;
    started.current = true;
    void controller.start(lobby.peer, launch.authorization, launch.grantId, media);
    cleanup.current = controller.captureNavigationCleanup();
  }} />;
  if (!bound) return <ConnectStatusScreen title="Another call is open" message="Finish the current call before opening another invitation." onClose={onClose} />;
  return <ConnectVoiceSession ownsController={false} controller={controller} flags={product.flags ?? connectFeatureFlags} onWithdrawCallingConsent={product.withdrawCallingConsent} onOpenSettings={() => { void Linking.openSettings(); }} onClose={() => {
    if (!controller.dismissCompletedCall()) return;
    cleanup.current = null;
    onClose();
  }} />;
}
