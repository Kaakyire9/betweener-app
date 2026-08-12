export type ChatMediaAccessFailure =
  | 'missing_storage_path'
  | 'signed_url_unavailable'
  | 'signing_failed'
  | 'media_load_failed'
  | 'retry_exhausted'
  | 'retry_scheduled';

export type ChatMediaAccessResult =
  | { status: 'ready'; uri: string; source: 'cache' | 'signed' }
  | {
      status: 'unavailable';
      failure: ChatMediaAccessFailure;
      cause?: unknown;
      retryAt?: number;
      attempt?: number;
    };

type SignUrl = (storagePath: string) => Promise<string | null>;
type ResolveOptions = {
  /** Ignores a valid URL cache and requests a fresh signature. */
  force?: boolean;
  /** Explicit user actions may bypass the automatic retry cooldown. */
  bypassBackoff?: boolean;
};

export type ChatMediaResolver = {
  getKnownUri(storagePath: string | null | undefined): string | null;
  getRefreshAt(storagePath: string | null | undefined): number | null;
  resolve(
    storagePath: string | null | undefined,
    signUrl: SignUrl,
    options?: ResolveOptions,
  ): Promise<ChatMediaAccessResult>;
  invalidate(storagePath: string | null | undefined, cause?: unknown): ChatMediaAccessResult;
  forget(storagePath: string | null | undefined): void;
};

type FailureState = {
  attempt: number;
  retryAt: number;
  failure: Exclude<
    ChatMediaAccessFailure,
    'missing_storage_path' | 'retry_scheduled' | 'retry_exhausted'
  >;
  cause?: unknown;
};

const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 5 * 60_000] as const;

/**
 * Owns the short-lived URL lifecycle for private chat media.
 *
 * It intentionally knows nothing about Supabase or React. Callers provide the
 * signing implementation, keeping this boundary testable and reusable by the
 * thread UI, viewer, and durable retry flows.
 */
export class CachedChatMediaResolver implements ChatMediaResolver {
  private readonly urls = new Map<string, string>();
  private readonly expiresAt = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<ChatMediaAccessResult>>();
  private readonly failures = new Map<string, FailureState>();
  private readonly now: () => number;
  private readonly refreshWindowMs: number;
  private readonly retryDelaysMs: readonly number[];

  constructor(
    now: () => number = Date.now,
    refreshWindowMs = 50 * 60 * 1000,
    retryDelaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  ) {
    this.now = now;
    this.refreshWindowMs = refreshWindowMs;
    this.retryDelaysMs = retryDelaysMs.length > 0 ? retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
  }

  getKnownUri(storagePath: string | null | undefined) {
    if (!storagePath) return null;
    const expiresAt = this.expiresAt.get(storagePath) ?? 0;
    if (expiresAt <= this.now()) return null;
    return this.urls.get(storagePath) ?? null;
  }

  getRefreshAt(storagePath: string | null | undefined) {
    if (!storagePath || !this.urls.has(storagePath)) return null;
    return this.expiresAt.get(storagePath) ?? null;
  }

  async resolve(
    storagePath: string | null | undefined,
    signUrl: SignUrl,
    options?: ResolveOptions,
  ): Promise<ChatMediaAccessResult> {
    if (!storagePath?.trim()) {
      return { status: 'unavailable', failure: 'missing_storage_path' } as const;
    }

    const previousFailure = this.failures.get(storagePath);
    if (
      previousFailure &&
      previousFailure.attempt >= this.retryDelaysMs.length &&
      !options?.bypassBackoff
    ) {
      return {
        status: 'unavailable',
        failure: 'retry_exhausted',
        cause: previousFailure.cause,
        attempt: previousFailure.attempt,
      };
    }
    if (
      previousFailure &&
      previousFailure.retryAt > this.now() &&
      !options?.bypassBackoff
    ) {
      return {
        status: 'unavailable',
        failure: 'retry_scheduled',
        cause: previousFailure.cause,
        retryAt: previousFailure.retryAt,
        attempt: previousFailure.attempt,
      };
    }

    if (!options?.force) {
      const cached = this.getKnownUri(storagePath);
      if (cached) return { status: 'ready', uri: cached, source: 'cache' } as const;
    }

    const existing = this.inFlight.get(storagePath);
    if (existing) return existing;

    const request = this.sign(storagePath, signUrl);
    this.inFlight.set(storagePath, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(storagePath);
    }
  }

  invalidate(
    storagePath: string | null | undefined,
    cause?: unknown,
  ): ChatMediaAccessResult {
    if (!storagePath?.trim()) {
      return { status: 'unavailable', failure: 'missing_storage_path' } as const;
    }
    this.urls.delete(storagePath);
    this.expiresAt.delete(storagePath);
    const previousFailure = this.failures.get(storagePath);
    if (previousFailure?.retryAt && previousFailure.retryAt > this.now()) {
      return {
        status: 'unavailable',
        failure: 'retry_scheduled',
        cause: previousFailure.cause ?? cause,
        retryAt: previousFailure.retryAt,
        attempt: previousFailure.attempt,
      };
    }
    if (previousFailure && previousFailure.attempt >= this.retryDelaysMs.length) {
      return {
        status: 'unavailable',
        failure: 'retry_exhausted',
        cause: previousFailure.cause ?? cause,
        attempt: previousFailure.attempt,
      };
    }
    return this.recordFailure(storagePath, 'media_load_failed', cause);
  }

  forget(storagePath: string | null | undefined) {
    if (!storagePath) return;
    this.urls.delete(storagePath);
    this.expiresAt.delete(storagePath);
    this.failures.delete(storagePath);
  }

  private async sign(storagePath: string, signUrl: SignUrl): Promise<ChatMediaAccessResult> {
    try {
      const uri = await signUrl(storagePath);
      if (!uri) {
        return this.recordFailure(storagePath, 'signed_url_unavailable');
      }
      this.urls.set(storagePath, uri);
      this.expiresAt.set(storagePath, this.now() + this.refreshWindowMs);
      this.failures.delete(storagePath);
      return { status: 'ready', uri, source: 'signed' };
    } catch (cause) {
      return this.recordFailure(storagePath, 'signing_failed', cause);
    }
  }

  private recordFailure(
    storagePath: string,
    failure: FailureState['failure'],
    cause?: unknown,
  ): ChatMediaAccessResult {
    const previousAttempt = this.failures.get(storagePath)?.attempt ?? 0;
    const attempt = previousAttempt + 1;
    const delayIndex = Math.min(attempt - 1, this.retryDelaysMs.length - 1);
    const retryAt = this.now() + this.retryDelaysMs[delayIndex];
    this.failures.set(storagePath, { attempt, retryAt, failure, cause });
    return { status: 'unavailable', failure, cause, retryAt, attempt };
  }
}

/** @deprecated Use CachedChatMediaResolver behind the ChatMediaResolver interface. */
export const ChatMediaAccess = CachedChatMediaResolver;
