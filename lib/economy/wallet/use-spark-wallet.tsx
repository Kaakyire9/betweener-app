import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';

import { useAuth } from '@/lib/auth-context';
import {
  DISABLED_ECONOMY_FEATURE_FLAGS,
  type EconomyFeatureFlagState,
} from '@/lib/economy/feature-flags';
import { loadPublicEconomyFeatureFlags } from '@/lib/economy/economy-feature-flag-service';
import type { EconomyErrorCode, MembershipTier } from '@/lib/economy/types';
import {
  loadSparkStoreCatalog,
  type ResolvedSparkPackage,
  type SparkStoreCatalog,
} from '@/lib/economy/store/spark-store-service';
import {
  executeSparkPurchase,
  mapSparkPurchaseError,
  type SparkPurchaseResult,
} from '@/lib/economy/store/spark-purchase-service';
import { trackSparkEvent } from '@/lib/economy/spark-telemetry';
import {
  EMPTY_SPARK_PURCHASE_STATE,
  isSparkWalletStale,
  type SparkPurchaseState,
} from '@/lib/economy/wallet/spark-wallet-types';
import {
  fetchFreshSparkWallet,
  getEconomyErrorCode,
  invalidateSparkWalletCache,
  readCachedSparkWallet,
} from '@/lib/economy/wallet/spark-wallet-service';
import { sparkWalletStore } from '@/lib/economy/wallet/spark-wallet-store';
import { subscribeToFinancialStateReset } from '@/lib/economy/financial-state-reset';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import {
  bindRevenueCatIdentity,
  canAccessRevenueCatForUser,
  isRevenueCatConfiguredForPlatform,
} from '@/lib/subscriptions';

type SparkStoreState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  catalog: SparkStoreCatalog | null;
  errorCode: EconomyErrorCode | null;
};

const EMPTY_STORE_STATE: SparkStoreState = Object.freeze({
  status: 'idle',
  catalog: null,
  errorCode: null,
});

type SparkWalletContextValue = {
  wallet: ReturnType<typeof sparkWalletStore.getSnapshot>;
  flags: EconomyFeatureFlagState;
  flagsLoading: boolean;
  online: boolean;
  store: SparkStoreState;
  purchase: SparkPurchaseState;
  refresh: (options?: { invalidate?: boolean; reason?: string }) => Promise<number | null>;
  loadStore: () => Promise<SparkStoreCatalog | null>;
  beginPurchaseConfirmation: (pack: ResolvedSparkPackage) => void;
  cancelPurchaseConfirmation: () => void;
  purchasePack: (pack: ResolvedSparkPackage, membershipTier: MembershipTier) => Promise<SparkPurchaseResult | null>;
  resetPurchaseState: () => void;
};

const SparkWalletContext = createContext<SparkWalletContextValue | null>(null);

export function SparkWalletProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const wallet = useSyncExternalStore(sparkWalletStore.subscribe, sparkWalletStore.getSnapshot);
  const [flags, setFlags] = useState<EconomyFeatureFlagState>(DISABLED_ECONOMY_FEATURE_FLAGS);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [store, setStore] = useState<SparkStoreState>(EMPTY_STORE_STATE);
  const [purchase, setPurchase] = useState<SparkPurchaseState>(EMPTY_SPARK_PURCHASE_STATE);
  const refreshPromiseRef = useRef<Promise<number | null> | null>(null);
  const purchaseInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => subscribeToFinancialStateReset(() => {
    setStore(EMPTY_STORE_STATE);
    setPurchase(EMPTY_SPARK_PURCHASE_STATE);
    purchaseInFlightRef.current = false;
    refreshPromiseRef.current = null;
    setFlags(DISABLED_ECONOMY_FEATURE_FLAGS);
    setFlagsLoading(false);
  }), []);

  const refresh = useCallback(async (options?: { invalidate?: boolean; reason?: string }) => {
    const activeUserId = sparkWalletStore.getAppUserId();
    if (!activeUserId || !flags.spark_wallet_enabled) return null;
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const identityVersion = sparkWalletStore.getIdentityVersion();
    const work = (async () => {
      if (!canAccessRevenueCatForUser(activeUserId)) {
        await bindRevenueCatIdentity(activeUserId);
      }
      if (sparkWalletStore.getAppUserId() !== activeUserId) return null;

      const network = await fetchNetInfo().catch(() => null);
      const hasNetwork = isNetworkConnectionAvailable(network);
      setOnline(hasNetwork);
      if (!hasNetwork) {
        sparkWalletStore.markUnavailable(activeUserId, identityVersion, 'offline', 'NETWORK_ERROR');
        return null;
      }

      sparkWalletStore.markLoading(activeUserId);
      trackSparkEvent('spark.wallet.refresh_started', { walletStatus: wallet.status, result: options?.reason });
      try {
        if (options?.invalidate) await invalidateSparkWalletCache();
        const fresh = await fetchFreshSparkWallet(activeUserId);
        if (!sparkWalletStore.accept(fresh, identityVersion)) return null;
        trackSparkEvent('spark.wallet.refresh_succeeded', { walletStatus: fresh.status });
        return fresh.balance;
      } catch (error) {
        const code = getEconomyErrorCode(error);
        const status = code === 'NETWORK_ERROR' ? 'offline' : 'error';
        sparkWalletStore.markUnavailable(activeUserId, identityVersion, status, code);
        trackSparkEvent('spark.wallet.refresh_failed', { walletStatus: status, result: code });
        return null;
      }
    })().finally(() => {
      refreshPromiseRef.current = null;
    });
    refreshPromiseRef.current = work;
    return work;
  }, [flags.spark_wallet_enabled, wallet.status]);

  const initialize = useCallback(async (appUserId: string, nextFlags: EconomyFeatureFlagState) => {
    const identityVersion = sparkWalletStore.getIdentityVersion();
    if (!nextFlags.spark_wallet_enabled || !isRevenueCatConfiguredForPlatform()) return;

    try {
      if (!canAccessRevenueCatForUser(appUserId)) await bindRevenueCatIdentity(appUserId);
      if (sparkWalletStore.getAppUserId() !== appUserId) return;
      const cached = await readCachedSparkWallet(appUserId);
      if (cached && sparkWalletStore.accept(cached, identityVersion)) {
        trackSparkEvent('spark.wallet.cache_loaded', { walletStatus: cached.status });
      }
      const network = await fetchNetInfo().catch(() => null);
      const hasNetwork = isNetworkConnectionAvailable(network);
      setOnline(hasNetwork);
      if (!hasNetwork) {
        sparkWalletStore.markUnavailable(appUserId, identityVersion, 'offline', 'NETWORK_ERROR');
        return;
      }
      sparkWalletStore.markLoading(appUserId);
      trackSparkEvent('spark.wallet.refresh_started', { walletStatus: cached?.status ?? 'idle', result: 'identity_ready' });
      const fresh = await fetchFreshSparkWallet(appUserId);
      if (sparkWalletStore.accept(fresh, identityVersion)) {
        trackSparkEvent('spark.wallet.refresh_succeeded', { walletStatus: fresh.status });
      }
    } catch (error) {
      const code = getEconomyErrorCode(error);
      sparkWalletStore.markUnavailable(
        appUserId,
        identityVersion,
        code === 'NETWORK_ERROR' ? 'offline' : 'error',
        code,
      );
      trackSparkEvent('spark.wallet.refresh_failed', { result: code });
    }
  }, []);

  useEffect(() => {
    sparkWalletStore.switchIdentity(userId);
    setStore(EMPTY_STORE_STATE);
    setPurchase(EMPTY_SPARK_PURCHASE_STATE);
    purchaseInFlightRef.current = false;
    refreshPromiseRef.current = null;
    setFlags(DISABLED_ECONOMY_FEATURE_FLAGS);
    setFlagsLoading(true);
    let cancelled = false;

    const start = async () => {
      if (!userId) {
        if (!cancelled) setFlagsLoading(false);
        return;
      }
      const nextFlags = await loadPublicEconomyFeatureFlags();
      if (cancelled || sparkWalletStore.getAppUserId() !== userId) return;
      setFlags(nextFlags);
      setFlagsLoading(false);
      await initialize(userId, nextFlags);
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [initialize, userId]);

  useEffect(() => {
    const handleNetwork = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      const nextOnline = isNetworkConnectionAvailable(state);
      setOnline(nextOnline);
      const activeUserId = sparkWalletStore.getAppUserId();
      if (!activeUserId || !flags.spark_wallet_enabled) return;
      if (!nextOnline) {
        sparkWalletStore.markUnavailable(
          activeUserId,
          sparkWalletStore.getIdentityVersion(),
          'offline',
          'NETWORK_ERROR',
        );
      } else if (isSparkWalletStale(sparkWalletStore.getSnapshot())) {
        void refresh({ reason: 'network_restored' });
      }
    };
    const unsubscribe = addNetInfoListener(handleNetwork);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (
        state === 'active'
        && flags.spark_wallet_enabled
        && isSparkWalletStale(sparkWalletStore.getSnapshot())
      ) {
        void refresh({ reason: 'app_foreground' });
      }
    });
    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [flags.spark_wallet_enabled, refresh]);

  const loadStore = useCallback(async () => {
    const activeUserId = sparkWalletStore.getAppUserId();
    if (!activeUserId || !flags.spark_store_enabled || !online) return null;
    if (store.status === 'ready' && store.catalog) return store.catalog;
    setStore({ status: 'loading', catalog: null, errorCode: null });
    try {
      if (!canAccessRevenueCatForUser(activeUserId)) await bindRevenueCatIdentity(activeUserId);
      const catalog = await loadSparkStoreCatalog();
      if (sparkWalletStore.getAppUserId() !== activeUserId) return null;
      setStore({ status: 'ready', catalog, errorCode: null });
      trackSparkEvent('spark.store.loaded', { result: catalog.offeringId });
      return catalog;
    } catch (error) {
      const code = getEconomyErrorCode(error);
      setStore({ status: 'error', catalog: null, errorCode: code });
      trackSparkEvent('spark.store.configuration_error', { result: code });
      return null;
    }
  }, [flags.spark_store_enabled, online, store.catalog, store.status]);

  const beginPurchaseConfirmation = useCallback((pack: ResolvedSparkPackage) => {
    if (purchaseInFlightRef.current) return;
    setPurchase({
      ...EMPTY_SPARK_PURCHASE_STATE,
      status: 'confirming',
      packageId: pack.packageId,
      sparkAmount: pack.amount,
    });
    trackSparkEvent('spark_pack_selected', { packageId: pack.packageId, sparkAmount: pack.amount });
  }, []);

  const cancelPurchaseConfirmation = useCallback(() => {
    if (purchase.status === 'confirming') setPurchase(EMPTY_SPARK_PURCHASE_STATE);
  }, [purchase.status]);

  const purchasePack = useCallback(async (pack: ResolvedSparkPackage, membershipTier: MembershipTier) => {
    const initiatingUserId = sparkWalletStore.getAppUserId();
    if (!initiatingUserId || purchaseInFlightRef.current) return null;
    if (!flags.spark_store_enabled) {
      setPurchase({ ...EMPTY_SPARK_PURCHASE_STATE, status: 'failed', errorCode: 'FEATURE_DISABLED' });
      return null;
    }
    purchaseInFlightRef.current = true;
    const balanceBefore = sparkWalletStore.getSnapshot().balance;
    try {
      return await executeSparkPurchase({
        appUserId: initiatingUserId,
        membershipTier,
        pack,
        balanceBefore,
        isOnline: () => online,
        getActiveUserId: () => sparkWalletStore.getAppUserId(),
        invalidateAndRefresh: async () => {
          const nextBalance = await refresh({ invalidate: true, reason: 'spark_purchase' });
          if (nextBalance === null) throw new Error('RevenueCat balance refresh failed.');
          return nextBalance;
        },
        onState: (nextState) => {
          if (sparkWalletStore.getAppUserId() === initiatingUserId && mountedRef.current) {
            setPurchase(nextState);
          }
        },
      });
    } catch (error) {
      if (sparkWalletStore.getAppUserId() === initiatingUserId) {
        const mapped = mapSparkPurchaseError(error);
        setPurchase((current) => current.status === 'failed'
          ? current
          : { ...current, status: 'failed', errorCode: mapped.code });
      }
      return null;
    } finally {
      purchaseInFlightRef.current = false;
    }
  }, [flags.spark_store_enabled, online, refresh]);

  const resetPurchaseState = useCallback(() => {
    if (!purchaseInFlightRef.current) setPurchase(EMPTY_SPARK_PURCHASE_STATE);
  }, []);

  const value = useMemo<SparkWalletContextValue>(() => ({
    wallet,
    flags,
    flagsLoading,
    online,
    store,
    purchase,
    refresh,
    loadStore,
    beginPurchaseConfirmation,
    cancelPurchaseConfirmation,
    purchasePack,
    resetPurchaseState,
  }), [
    beginPurchaseConfirmation,
    cancelPurchaseConfirmation,
    flags,
    flagsLoading,
    loadStore,
    online,
    purchase,
    purchasePack,
    refresh,
    resetPurchaseState,
    store,
    wallet,
  ]);

  return <SparkWalletContext.Provider value={value}>{children}</SparkWalletContext.Provider>;
}

export function useSparkWallet() {
  const context = useContext(SparkWalletContext);
  if (!context) throw new Error('useSparkWallet must be used inside SparkWalletProvider.');
  return context;
}
