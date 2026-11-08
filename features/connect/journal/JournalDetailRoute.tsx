import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { ChatThreadRemoteService } from '@/lib/chat/chat-thread-remote-service';
import { supabase } from '@/lib/supabase';
import { useConnectProduct } from '../components/ConnectProductProvider';
import { invokePinnedConnectRpc, type PinnedConnectRpcClient } from '../data/authenticated-connect-services';
import { connectUuid } from '../domain/call-navigation';
import { terminalStates } from '../domain/connect';
import { useJournalStore } from './journal-context';
import { useJournalActions } from './use-journal-actions';
import { createJournalSafetyActions } from './journal-safety-actions';
import { JournalDetails, JournalDetailsModal } from './JournalDetails';
import type { JournalEntry } from './journal-types';

const blankCall = { session: null, phase: 'IDLE' };
const noSubscribe = () => () => {};
/** Used by both the Journal sheet and a persistent chat deep link. */
export function JournalDetailHost({ callId, onClose, modal = false }: { callId: string; onClose(): void; modal?: boolean }) {
  const store = useJournalStore(), actions = useJournalActions(), context = useConnectProduct(), auth = useAuth();
  const controller = context.product?.controller;
  const live = useSyncExternalStore(controller?.subscribe ?? noSubscribe, controller?.getSnapshot ?? (() => blankCall), controller?.getSnapshot ?? (() => blankCall));
  const [state, setState] = useState<{ owner: typeof store; entry: JournalEntry | null; fresh: boolean; error: string | null; busy: boolean }>({ owner: store, entry: store?.get(callId) ?? null, fresh: false, error: null, busy: false });
  const generation = useRef(0), safetyPending = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!store || !connectUuid(callId)) return;
    setState(old => ({ ...old, owner: store, entry: old.owner === store && old.entry?.call.id === callId ? old.entry : store.get(callId) ?? null, fresh: false, busy: true, error: null }));
    try { const entry = await store.detail(callId);
      if (request === generation.current && store.current()) setState({ owner: store, entry, fresh: true, busy: false, error: entry ? null : 'This call record is unavailable.' });
    } catch { if (request === generation.current && store.current()) setState(old => ({ ...old, fresh: false, busy: false, error: 'Details could not be refreshed. Actions are paused until they can be verified.' })); }
  }, [callId, store]);
  useFocusEffect(useCallback(() => { const active = () => { if (AppState.currentState === 'active') void refresh(); }; active(); const stop = store?.subscribe(active);
    const timer = setInterval(active, 30_000), app = AppState.addEventListener('change', state => { if (state === 'active') active(); });
    return () => { ++generation.current; stop?.(); clearInterval(timer); app.remove(); };
  }, [refresh, store]));
  const entry = state.owner === store && store?.current() && state.entry?.call.id === callId ? state.entry : null;
  const activeOwned = !!entry && !terminalStates.includes(entry.call.state) && live.session?.id === entry.call.id && !terminalStates.includes(live.session.state) && !['IDLE', 'ENDED', 'FAILED'].includes(live.phase);
  const safety = async (kind: 'block' | 'report', reason = '') => {
    if (!store || !entry || !state.fresh || safetyPending.current) return;
    safetyPending.current = true; setState(old => ({ ...old, busy: true, error: null }));
    try {
      const owned = controller?.getSnapshot();
      if (kind === 'block' && activeOwned && owned?.session?.id === entry.call.id && !terminalStates.includes(owned.session.state)) {
        await controller.endCallAndBlock();
      } else {
        const gateway = createJournalSafetyActions(auth.nativeSessionOwner, store.service, {
          block: (userId, peerUserId, token) => Promise.resolve(ChatThreadRemoteService.blockUser({ blockerId: userId, blockedId: peerUserId }).setHeader('Authorization', `Bearer ${token}`)),
          report: (peerUserId, selectedReason, token) => invokePinnedConnectRpc(supabase as unknown as PinnedConnectRpcClient, 'rpc_submit_report', {
            p_reported_id: peerUserId, p_reason: selectedReason, p_evidence_message_id: null,
            p_client_evidence: { entry_point: 'connection_journal', message_type: null },
          }, token),
        });
        if (kind === 'block') await gateway.block(entry); else await gateway.report(entry, reason);
      }
      if (store.current()) { store.invalidate(); await refresh(); }
    } catch { if (store.current()) setState(old => ({ ...old, busy: false, error: 'This safety action could not be confirmed. Please try again.' })); }
    finally { safetyPending.current = false; }
  };
  const props = { entry, busy: state.busy || !!actions.busyId, fresh: state.fresh, error: state.error ?? actions.error,
    canRedial: !!entry && actions.canRedial(entry), activeOwned, onClose,
    onRetry: () => { void refresh(); }, onRedial: () => { if (entry) void actions.redial(entry, modal ? onClose : undefined); },
    onChat: () => { if (entry) { onClose(); actions.chat(entry); } }, onProfile: () => { if (entry) { onClose(); actions.profile(entry); } },
    onBlock: () => Alert.alert(activeOwned ? 'End Call & Block?' : 'Block this person?', 'This stops new contact from this person. You can review blocked accounts in your settings.', [
      { text: 'Cancel', style: 'cancel' }, { text: activeOwned ? 'End Call & Block' : 'Block', style: 'destructive', onPress: () => { void safety('block'); } },
    ]),
    onReport: () => Alert.alert('Report a concern', 'Choose the reason for your report.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Harassment', onPress: () => { void safety('report', 'harassment'); } },
      { text: 'Another concern', onPress: () => { void safety('report', 'other'); } },
    ]),
  };
  return modal ? <JournalDetailsModal {...props} visible /> : <JournalDetails {...props} />;
}
export function JournalDetailRoute() {
  const params = useLocalSearchParams(), router = useRouter();
  const callId = typeof params.callId === 'string' && connectUuid(params.callId) ? params.callId : '';
  return <JournalDetailHost key={callId} callId={callId} onClose={() => router.canGoBack() ? router.back() : router.replace('/connect')} />;
}
