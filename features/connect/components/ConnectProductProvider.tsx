import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import { useAuth } from '@/lib/auth-context';
import { APP_IDENTITY } from '@/config/app-identity';
import { ConnectProductCoordinator } from '../application/product-coordinator';
import { connectRuntimeAvailability } from '../config/connect-runtime-policy';
import { ConnectIncomingNotice } from './ConnectIncomingNotice';
const ConnectRingtone = React.lazy(() => import('./ConnectRingtone').then(module => ({ default: module.ConnectRingtone })));

const identity = { development: typeof __DEV__ !== 'undefined' && __DEV__, platform: Platform.OS,
  variant: APP_IDENTITY.variant, bundleIdentifier: Application.applicationId ?? '',
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? '', supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '' };
const availability = connectRuntimeAvailability(identity);
type Context = ReturnType<ConnectProductCoordinator['getSnapshot']> & { ui: boolean };
const disabled: Context = Object.freeze({ status: 'disabled', product: null, ui: false });
const ConnectContext = createContext<Context>(disabled);
export const useConnectProduct = () => useContext(ConnectContext);

/** Mounted inside AuthProvider; production/web never load Connect services. */
export function ConnectProductProvider({ children }: { children: React.ReactNode }) {
  return availability.runtime ? <AuthenticatedHost>{children}</AuthenticatedHost> : <ConnectContext.Provider value={{ ...disabled, ui: availability.ui }}>{children}</ConnectContext.Provider>;
}
function AuthenticatedHost({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const epoch = useSyncExternalStore(auth.nativeSessionOwner.subscribe, auth.nativeSessionOwner.snapshot, auth.nativeSessionOwner.snapshot);
  const eligible = auth.canPerformAuthenticatedWrites && !auth.isLoading && !auth.authRecoveryPending && !auth.usingPersistedSessionFallback
    && auth.user?.id === epoch?.userId && auth.session?.user.id === epoch?.userId && auth.profile?.user_id === epoch?.userId;
  const profileId = eligible ? auth.profile?.id : null;
  const coordinator = useMemo(() => new ConnectProductCoordinator(auth.nativeSessionOwner, !!profileId, async () => {
    const { loadConnectProduct } = await import('../data/load-connect-product');
    return loadConnectProduct(identity, auth.nativeSessionOwner, profileId!);
  }), [auth.nativeSessionOwner, epoch?.generation, profileId]);
  const state = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  const leases = useRef(new Map<ConnectProductCoordinator, number>());
  useEffect(() => {
    const counts = leases.current; counts.set(coordinator, (counts.get(coordinator) ?? 0) + 1);
    void coordinator.start();
    const tick = setInterval(() => { void coordinator.tick(); }, 1000);
    const lifecycle = AppState.addEventListener('change', next => {
      void coordinator.getSnapshot().product?.controller.setForeground(next === 'active');
    });
    return () => {
      clearInterval(tick); lifecycle.remove(); counts.set(coordinator, (counts.get(coordinator) ?? 1) - 1);
      queueMicrotask(() => { if (counts.get(coordinator) === 0) { counts.delete(coordinator); coordinator.dispose(); } });
    };
  }, [coordinator]);
  return <ConnectContext.Provider value={{ ...state, ui: availability.ui }}>{children}{state.product && <><ConnectIncomingNotice controller={state.product.controller} /><React.Suspense fallback={null}><ConnectRingtone controller={state.product.controller} /></React.Suspense></>}</ConnectContext.Provider>;
}
