export type RevenueCatIdentityAdapter = {
  isConfigured: () => Promise<boolean>;
  configure: (appUserId: string) => void;
  getAppUserId: () => Promise<string | null>;
  logIn: (appUserId: string) => Promise<unknown>;
  logOut: () => Promise<unknown>;
};

export type RevenueCatIdentityEvent = {
  type: 'changed' | 'detached' | 'logout';
  previousUserId: string | null;
  nextUserId: string | null;
  succeeded: boolean;
  reason: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RevenueCatIdentitySession {
  private boundUserId: string | null = null;
  private accessBlocked = true;
  private transition: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly adapter: RevenueCatIdentityAdapter,
    private readonly onEvent?: (event: RevenueCatIdentityEvent) => void,
  ) {}

  getBoundUserId() {
    return this.boundUserId;
  }

  canAccessFor(userId: string) {
    return !this.accessBlocked && this.boundUserId === userId;
  }

  blockAccess() {
    this.accessBlocked = true;
    this.boundUserId = null;
  }

  detach(reason: string) {
    const previousUserId = this.boundUserId;
    this.blockAccess();
    this.onEvent?.({
      type: 'detached',
      previousUserId,
      nextUserId: null,
      succeeded: true,
      reason,
    });
  }

  bind(appUserId: string): Promise<void> {
    if (!UUID_PATTERN.test(appUserId)) {
      return Promise.reject(new Error('RevenueCat App User ID must be a Supabase UUID.'));
    }

    const work = async () => {
      const previousUserId = this.boundUserId;
      this.accessBlocked = true;
      try {
        const configured = await this.adapter.isConfigured();
        if (!configured) {
          this.adapter.configure(appUserId);
        } else {
          const sdkUserId = await this.adapter.getAppUserId();
          if (sdkUserId !== appUserId) await this.adapter.logIn(appUserId);
        }
        this.boundUserId = appUserId;
        this.accessBlocked = false;
        this.onEvent?.({
          type: 'changed',
          previousUserId,
          nextUserId: appUserId,
          succeeded: true,
          reason: previousUserId && previousUserId !== appUserId ? 'account_switch' : 'session_bind',
        });
      } catch (error) {
        this.boundUserId = null;
        this.accessBlocked = true;
        this.onEvent?.({
          type: 'changed',
          previousUserId,
          nextUserId: appUserId,
          succeeded: false,
          reason: 'bind_failed',
        });
        throw error;
      }
    };

    const result = this.transition.then(work, work);
    this.transition = result.catch(() => undefined);
    return result;
  }

  clearSdkIdentity(reason: string): Promise<{ error: unknown | null }> {
    const work = async () => {
      const previousUserId = this.boundUserId;
      this.blockAccess();
      try {
        if (await this.adapter.isConfigured()) await this.adapter.logOut();
        this.onEvent?.({
          type: 'logout',
          previousUserId,
          nextUserId: null,
          succeeded: true,
          reason,
        });
        return { error: null };
      } catch (error) {
        this.onEvent?.({
          type: 'logout',
          previousUserId,
          nextUserId: null,
          succeeded: false,
          reason,
        });
        return { error };
      }
    };

    const result = this.transition.then(work, work);
    this.transition = result.catch(() => undefined);
    return result;
  }
}
