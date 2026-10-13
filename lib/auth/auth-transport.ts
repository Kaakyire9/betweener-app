export type AuthTransportFailureCode =
  | 'caller_aborted'
  | 'missing_config'
  | 'network_error'
  | 'network_timeout'
  | 'rate_limited'
  | 'service_unavailable'
  | 'refresh_rejected_unknown'
  | 'retry_deferred';

export type AuthTransportDiagnostic = {
  code: AuthTransportFailureCode | 'terminal_response' | 'success';
  method: string;
  path: string;
  via: string;
  status: number | null;
  elapsedMs: number;
  retryAt: number | null;
  attempt: number;
  networkRequest: boolean;
  terminalCode?: string | null;
};

export type AuthTransportState = {
  retryAt: number | null;
  retryCode: AuthTransportFailureCode | null;
  consecutiveFailures: number;
  lastTerminalCode: string | null;
  lastTerminalStatus: number | null;
};

type CreateAuthTransportOptions = {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  isConfigured: boolean;
  now?: () => number;
  onDiagnostic?: (event: AuthTransportDiagnostic) => void;
};

const DEFAULT_RETRY_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
const MAX_RETRY_AFTER_MS = 15 * 60_000;
const MIN_RETRY_AFTER_MS = 1_000;

export const TERMINAL_REFRESH_ERROR_CODES = new Set([
  'invalid_credentials',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_expired',
  'session_not_found',
  'user_banned',
  'user_not_found',
]);

const getRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return typeof (input as Request)?.url === 'string' ? (input as Request).url : '';
};

const getSafePath = (input: RequestInfo | URL) => {
  try {
    const url = new URL(getRequestUrl(input));
    return `${url.host}${url.pathname}`;
  } catch {
    return '';
  }
};

export const isAuthRefreshRequest = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = new URL(getRequestUrl(input));
    const method = String(init?.method || 'GET').toUpperCase();
    return (
      method === 'POST' &&
      url.pathname.endsWith('/auth/v1/token') &&
      url.searchParams.get('grant_type') === 'refresh_token'
    );
  } catch {
    return false;
  }
};

export const parseRetryAfterMs = (value: string | null, now: number) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  const rawMs = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : Date.parse(trimmed) - now;
  if (!Number.isFinite(rawMs)) return null;

  return Math.max(MIN_RETRY_AFTER_MS, Math.min(rawMs, MAX_RETRY_AFTER_MS));
};

const readStructuredErrorCode = async (response: Response) => {
  try {
    const body = await response.clone().json() as {
      code?: unknown;
      error_code?: unknown;
    };
    if (typeof body?.code === 'string') return body.code;
    if (typeof body?.error_code === 'string') return body.error_code;
  } catch {
    // An unstructured refresh rejection is deliberately not treated as terminal.
  }
  return null;
};

const looksLikeSignalUnsupported = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
  return (
    (message.includes('signal') || message.includes('abortcontroller') || message.includes('abort')) &&
    (message.includes('not supported') || message.includes('unsupported') || message.includes('invalid'))
  );
};

export class AuthTransientTransportError extends TypeError {
  readonly code: AuthTransportFailureCode;
  readonly originalStatus: number | null;
  readonly retryAt: number | null;

  constructor(
    code: AuthTransportFailureCode,
    options?: { originalStatus?: number | null; retryAt?: number | null },
  ) {
    super(code);
    this.name = 'AuthTransientTransportError';
    this.code = code;
    this.originalStatus = options?.originalStatus ?? null;
    this.retryAt = options?.retryAt ?? null;
  }
}

export const createAuthFetchTransport = ({
  fetchImpl,
  timeoutMs,
  isConfigured,
  now = () => Date.now(),
  onDiagnostic,
}: CreateAuthTransportOptions) => {
  let retryAt = 0;
  let retryCode: AuthTransportFailureCode | null = null;
  let consecutiveFailures = 0;
  let lastTerminalCode: string | null = null;
  let lastTerminalStatus: number | null = null;
  let uncancellableRefreshRequest: Promise<Response> | null = null;

  const snapshot = (): AuthTransportState => ({
    retryAt: retryAt > now() ? retryAt : null,
    retryCode: retryAt > now() ? retryCode : null,
    consecutiveFailures,
    lastTerminalCode,
    lastTerminalStatus,
  });

  const emit = (event: AuthTransportDiagnostic) => {
    try {
      onDiagnostic?.(event);
    } catch {
      // Diagnostics cannot alter authentication behavior.
    }
  };

  const scheduleRetry = (
    code: AuthTransportFailureCode,
    suppliedDelayMs?: number | null,
  ) => {
    consecutiveFailures += 1;
    const fallback = DEFAULT_RETRY_BACKOFF_MS[
      Math.min(consecutiveFailures - 1, DEFAULT_RETRY_BACKOFF_MS.length - 1)
    ];
    const delayMs = suppliedDelayMs ?? fallback;
    retryAt = Math.max(retryAt, now() + delayMs);
    retryCode = code;
    return retryAt;
  };

  const clearTransientState = () => {
    retryAt = 0;
    retryCode = null;
    consecutiveFailures = 0;
  };

  const throwTransient = (
    code: AuthTransportFailureCode,
    context: Omit<AuthTransportDiagnostic, 'code' | 'retryAt'> & { retryAt?: number | null },
  ): never => {
    const deadline = context.retryAt ?? scheduleRetry(code);
    emit({ ...context, code, retryAt: deadline });
    throw new AuthTransientTransportError(code, {
      originalStatus: context.status,
      retryAt: deadline,
    });
  };

  const applyRefreshResponsePolicy = async (
    response: Response,
    context: Omit<AuthTransportDiagnostic, 'code' | 'retryAt' | 'terminalCode'>,
  ) => {
    if (response.ok) {
      clearTransientState();
      lastTerminalCode = null;
      lastTerminalStatus = null;
      emit({ ...context, code: 'success', retryAt: null });
      return response;
    }

    const terminalCode = await readStructuredErrorCode(response);
    if (terminalCode && TERMINAL_REFRESH_ERROR_CODES.has(terminalCode)) {
      clearTransientState();
      lastTerminalCode = terminalCode;
      lastTerminalStatus = response.status;
      emit({
        ...context,
        code: 'terminal_response',
        retryAt: null,
        terminalCode,
      });
      return response;
    }

    if (response.status === 429) {
      const delayMs = parseRetryAfterMs(response.headers.get('retry-after'), now());
      const deadline = scheduleRetry('rate_limited', delayMs);
      throwTransient('rate_limited', { ...context, retryAt: deadline });
    }

    if (
      response.status === 408 ||
      response.status === 425 ||
      response.status === 598 ||
      response.status === 599 ||
      response.status >= 500
    ) {
      const deadline = scheduleRetry('service_unavailable');
      throwTransient('service_unavailable', { ...context, retryAt: deadline });
    }

    // Auth JS 2.117.2 removes an expired session after any non-retryable
    // refresh response. Only a structured, allow-listed credential/session
    // code may reach that path; an unknown or malformed rejection is retained
    // for a later retry instead of deleting credentials.
    const deadline = scheduleRetry('refresh_rejected_unknown');
    throwTransient('refresh_rejected_unknown', { ...context, retryAt: deadline });
  };

  const fetchWithoutCancellation = async (
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    isRefresh: boolean,
    context: Omit<AuthTransportDiagnostic, 'code' | 'retryAt' | 'terminalCode'>,
  ) => {
    const request = isRefresh && uncancellableRefreshRequest
      ? uncancellableRefreshRequest
      : fetchImpl(input, { ...(init || {}), signal: undefined });

    if (isRefresh && !uncancellableRefreshRequest) {
      uncancellableRefreshRequest = request;
      void request.finally(() => {
        if (uncancellableRefreshRequest === request) uncancellableRefreshRequest = null;
      }).catch(() => undefined);
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        request,
        new Promise<Response>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new AuthTransientTransportError('network_timeout')),
            timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      const code = error instanceof AuthTransientTransportError
        ? error.code
        : 'network_error';
      const deadline = scheduleRetry(code);
      throwTransient(code, { ...context, via: 'uncancellable', retryAt: deadline });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const authFetch: typeof fetch = async (input, init) => {
    const startedAt = now();
    const method = String(init?.method || 'GET').toUpperCase();
    const path = getSafePath(input);
    const isRefresh = isAuthRefreshRequest(input, init);

    if (!isConfigured) {
      const deadline = scheduleRetry('missing_config');
      throwTransient('missing_config', {
        method,
        path,
        via: 'configuration',
        status: null,
        elapsedMs: Math.max(0, now() - startedAt),
        retryAt: deadline,
        attempt: consecutiveFailures,
        networkRequest: false,
      });
    }

    if (isRefresh && retryAt > now()) {
      emit({
        code: 'retry_deferred',
        method,
        path,
        via: 'retry_gate',
        status: null,
        elapsedMs: Math.max(0, now() - startedAt),
        retryAt,
        attempt: consecutiveFailures,
        networkRequest: false,
      });
      throw new AuthTransientTransportError('retry_deferred', { retryAt });
    }

    const context = {
      method,
      path,
      via: 'fetch',
      status: null as number | null,
      get elapsedMs() {
        return Math.max(0, now() - startedAt);
      },
      attempt: consecutiveFailures + 1,
      networkRequest: true,
    };

    const callerSignal = init?.signal;
    const hasAbortController = typeof AbortController !== 'undefined';
    if (!hasAbortController) {
      const response = await fetchWithoutCancellation(input, init, isRefresh, context);
      return isRefresh
        ? await applyRefreshResponsePolicy(response, { ...context, status: response.status })
        : response;
    }

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    let callerAborted = callerSignal?.aborted === true;
    const onCallerAbort = () => {
      callerAborted = true;
      controller.abort();
    };

    try {
      if (callerSignal) {
        if (callerSignal.aborted) controller.abort();
        else callerSignal.addEventListener?.('abort', onCallerAbort, { once: true });
      }

      const timeoutPromise = new Promise<Response>((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new AuthTransientTransportError('network_timeout'));
        }, timeoutMs);
      });

      const fetchPromise = fetchImpl(input, {
        ...(init || {}),
        signal: controller.signal,
      }).catch(async (error) => {
        if (looksLikeSignalUnsupported(error)) {
          return await fetchWithoutCancellation(input, init, isRefresh, {
            ...context,
            via: 'signal_unsupported',
          });
        }
        throw error;
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);
      if (!isRefresh) return response;
      return await applyRefreshResponsePolicy(response, {
        ...context,
        status: response.status,
        via: 'response',
      });
    } catch (error) {
      if (error instanceof AuthTransientTransportError && error.retryAt) throw error;
      const code: AuthTransportFailureCode = timedOut
        ? 'network_timeout'
        : callerAborted
          ? 'caller_aborted'
          : error instanceof AuthTransientTransportError
            ? error.code
            : 'network_error';
      const deadline = scheduleRetry(code);
      throwTransient(code, {
        ...context,
        via: timedOut ? 'timeout' : callerAborted ? 'caller_abort' : 'rejection',
        retryAt: deadline,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      callerSignal?.removeEventListener?.('abort', onCallerAbort);
    }
  };

  return {
    fetch: authFetch,
    getState: snapshot,
    resetForTests: () => {
      retryAt = 0;
      retryCode = null;
      consecutiveFailures = 0;
      lastTerminalCode = null;
      lastTerminalStatus = null;
      uncancellableRefreshRequest = null;
    },
  };
};
