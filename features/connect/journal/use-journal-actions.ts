import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useConnectProduct } from '../components/ConnectProductProvider';
import { useJournalStore } from './journal-context';
import { isJournalTerminal } from './journal-presentation';
import type { JournalEntry } from './journal-types';

export function useJournalActions() {
  const context = useConnectProduct(), store = useJournalStore(), router = useRouter();
  const [error, setError] = useState<string | null>(null), [busyId, setBusyId] = useState<string | null>(null);
  const pending = useRef(false);
  useEffect(() => { pending.current = false; setError(null); setBusyId(null); }, [store]);
  const canRedial = useCallback((entry: JournalEntry) => !!store?.current() && entry.redialAllowed && entry.peer.available && !entry.peer.blocked && isJournalTerminal(entry)
    && context.ui && context.status === 'ready' && context.product?.flags.nativeSafetyOwner === true
    && (entry.call.media !== 'video' || context.product.flags.videoCalling === true), [context, store]);
  const redial = useCallback(async (entry: JournalEntry, beforeNavigate?: () => void) => {
    if (!store || pending.current || !canRedial(entry) || !context.product) return;
    pending.current = true;
    const product = context.product;
    setBusyId(entry.call.id); setError(null);
    try {
      const fresh = await store.detail(entry.call.id);
      if (!fresh || !store.current() || !canRedial(fresh) || product.accountUserId !== store.service.userId
        || product.authGeneration !== store.service.epoch || product.selfProfileId !== store.service.profileId
        || !await product.services.checkEligibility(fresh.peer.profileId, fresh.call.media, 'matched')) throw Error('not_available');
      if (!store.current()) return;
      beforeNavigate?.();
      // Existing lobby performs another live eligibility check before explicit Start.
      router.push({ pathname: fresh.call.media === 'video' ? '/connect/video' : '/connect/voice', params: { peerId: fresh.peer.profileId, authorization: 'matched' } });
    } catch { if (store.current()) setError('Calling is not available for this connection right now.'); }
    finally { pending.current = false; if (store.current()) setBusyId(null); }
  }, [canRedial, context.product, router, store]);
  const chat = useCallback((entry: JournalEntry) => {
    if (!store?.current() || !entry.peer.available || entry.peer.blocked) return;
    router.push({ pathname: '/chat/[id]', params: { id: entry.peer.userId, peerUserId: entry.peer.userId, peerProfileId: entry.peer.profileId, userName: entry.peer.name, userAvatar: entry.peer.avatar ?? '' } });
  }, [router, store]);
  const profile = useCallback((entry: JournalEntry) => { if (store?.current() && entry.peer.available && !entry.peer.blocked) router.push({ pathname: '/profile-view', params: { profileId: entry.peer.profileId } }); }, [router, store]);
  return { canRedial, redial, chat, profile, error, busyId, clearError: () => setError(null), callingAvailable: context.ui && context.status === 'ready' };
}
