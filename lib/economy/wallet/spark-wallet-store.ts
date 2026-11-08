import type { EconomyErrorCode, SparkWalletSnapshot } from '@/lib/economy/types';
import { createEmptySparkWallet } from '@/lib/economy/wallet/spark-wallet-types';

type Listener = () => void;

export class SparkWalletStore {
  private snapshot = createEmptySparkWallet();
  private identityVersion = 0;
  private readonly listeners = new Set<Listener>();

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getIdentityVersion() {
    return this.identityVersion;
  }

  getAppUserId() {
    return this.snapshot.appUserId || null;
  }

  switchIdentity(appUserId: string | null) {
    const nextUserId = appUserId ?? '';
    if (this.snapshot.appUserId === nextUserId) return this.identityVersion;
    this.identityVersion += 1;
    this.replace(createEmptySparkWallet(nextUserId));
    return this.identityVersion;
  }

  markLoading(appUserId: string) {
    if (this.snapshot.appUserId !== appUserId) return;
    this.replace({
      ...this.snapshot,
      status: 'loading',
      isStale: this.snapshot.balance !== null,
      errorCode: null,
    });
  }

  accept(snapshot: SparkWalletSnapshot, identityVersion: number) {
    if (
      identityVersion !== this.identityVersion
      || snapshot.appUserId !== this.snapshot.appUserId
    ) return false;
    this.replace(snapshot);
    return true;
  }

  markUnavailable(
    appUserId: string,
    identityVersion: number,
    status: 'offline' | 'error',
    errorCode: EconomyErrorCode,
  ) {
    if (identityVersion !== this.identityVersion || this.snapshot.appUserId !== appUserId) return;
    this.replace({
      ...this.snapshot,
      status,
      isStale: this.snapshot.balance !== null,
      errorCode,
    });
  }

  private replace(snapshot: SparkWalletSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}

export const sparkWalletStore = new SparkWalletStore();
