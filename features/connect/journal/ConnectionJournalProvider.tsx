import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { invokePinnedConnectRpc, type PinnedConnectRpcClient } from '../data/authenticated-connect-services';
import { subscribeUserConnectJournal } from '@/lib/realtime/user-chat-broadcast';
import { createJournalService } from './journal-service';
import { JournalStore } from './journal-store';
import { APP_IDENTITY } from '@/config/app-identity';
import { journalReadRuntime } from './journal-runtime';
import { JournalContext } from './journal-context';
import { JournalMotionProvider } from './JournalPulse';

/** Read-only history remains independent of calling activation and native SDK setup. */
export function ConnectionJournalProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, nativeSessionOwner: owner, isLoading, authRecoveryPending } = useAuth();
  const auth = useSyncExternalStore(owner.subscribe, owner.snapshot, owner.snapshot);
  const store = useMemo(() => {
    if (!journalReadRuntime({ enabled: process.env.EXPO_PUBLIC_CONNECT_JOURNAL_READS === 'true', development: typeof __DEV__ !== 'undefined' && __DEV__, variant: APP_IDENTITY.variant,
      environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? '', supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '' })
      || !auth || auth.userId !== user?.id || !profile?.id || isLoading || authRecoveryPending) return null;
    return new JournalStore(createJournalService(owner, profile.id, {
      rpc: (name, args, token) => invokePinnedConnectRpc(supabase as unknown as PinnedConnectRpcClient, name, args, token),
    }, listener => subscribeUserConnectJournal(auth.userId, listener)));
  }, [auth, authRecoveryPending, isLoading, owner, profile?.id, user?.id]);
  useEffect(() => {
    if (!store) return;
    // Delay teardown through React development effect replay, never through Auth retirement.
    const unsubscribe = owner.subscribe(() => { if (!store.current()) store.retire(); });
    const leases = activeStores; leases.set(store, (leases.get(store) ?? 0) + 1);
    return () => { unsubscribe(); leases.set(store, (leases.get(store) ?? 1) - 1);
      queueMicrotask(() => { if (leases.get(store) === 0) { store.retire(); leases.delete(store); } }); };
  }, [owner, store]);
  return <JournalContext.Provider value={store}><JournalMotionProvider scope={auth?.generation}>{children}</JournalMotionProvider></JournalContext.Provider>;
}
const activeStores = new WeakMap<JournalStore, number>();
