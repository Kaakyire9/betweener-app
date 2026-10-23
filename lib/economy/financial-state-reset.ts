import { sparkWalletStore } from '@/lib/economy/wallet/spark-wallet-store';

type Listener = () => void;

const listeners = new Set<Listener>();

export function clearClientFinancialState() {
  sparkWalletStore.switchIdentity(null);
  listeners.forEach((listener) => listener());
}

export function subscribeToFinancialStateReset(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
