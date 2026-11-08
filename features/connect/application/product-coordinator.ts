import type { NativeSessionOwner, NativeSessionSnapshot } from '../../../lib/auth/native-session-owner.ts';
import type { loadConnectProduct } from '../data/load-connect-product';
export type ConnectProduct = Awaited<ReturnType<typeof loadConnectProduct>>;
export interface ConnectProductSnapshot { status: 'disabled' | 'loading' | 'ready' | 'unavailable'; product: ConnectProduct | null }

/** One app host, one Auth epoch, one controller. Screens never create native owners. */
export class ConnectProductCoordinator {
  private state: ConnectProductSnapshot = { status: 'disabled', product: null };
  private readonly listeners = new Set<() => void>();
  private readonly expected: NativeSessionSnapshot | null;
  private readonly auth: NativeSessionOwner;
  private readonly enabled: boolean;
  private readonly load: () => Promise<ConnectProduct>;
  private disposed = false;
  private starting: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  constructor(auth: NativeSessionOwner, enabled: boolean, load: () => Promise<ConnectProduct>) {
    this.auth = auth; this.enabled = enabled; this.load = load;
    this.expected = auth.snapshot();
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: ConnectProductSnapshot) { this.state = state; for (const listener of this.listeners) listener(); }
  private current() {
    const live = this.auth.snapshot();
    return !this.disposed && !!this.expected && live?.userId === this.expected.userId && live.generation === this.expected.generation;
  }
  start(): Promise<void> {
    if (this.starting) return this.starting;
    if (!this.enabled || !this.current()) return Promise.resolve();
    this.publish({ status: 'loading', product: null });
    this.unsubscribe = this.auth.subscribe(() => { if (!this.current()) this.dispose(); });
    this.starting = Promise.resolve().then(() => {
      if (!this.current()) throw new Error('connect_unauthenticated');
      return this.load();
    }).then(product => {
      if (!this.current()) { void product.dispose().catch(() => undefined); return; }
      this.publish({ status: 'ready', product });
    }, () => { if (this.current()) this.publish({ status: 'unavailable', product: null }); });
    return this.starting;
  }
  tick = async () => {
    if (!this.current()) { this.dispose(); return; }
    const product = this.state.product;
    try { await product?.controller.tick(); }
    catch { void product?.controller.hangup().catch(() => undefined); }
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.unsubscribe?.(); this.unsubscribe = null;
    const product = this.state.product;
    product?.owner()?.retire('account_changed');
    void product?.dispose().catch(() => undefined);
    this.publish({ status: 'disabled', product: null });
  }
}
