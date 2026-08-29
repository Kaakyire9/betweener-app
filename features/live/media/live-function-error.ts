type FunctionErrorWithContext = Error & {
  context?: unknown;
};

const parseFunctionErrorPayload = (payload: unknown): string | null => {
  if (typeof payload === 'string' && payload.trim()) {
    try {
      return parseFunctionErrorPayload(JSON.parse(payload) as unknown) ?? payload.trim();
    } catch {
      return payload.trim();
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  for (const key of ['error', 'code', 'message'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const readResponseLikePayload = async (context: unknown): Promise<string | null> => {
  if (!context || typeof context !== 'object') return null;
  const response = context as {
    clone?: () => unknown;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
    body?: unknown;
    _bodyInit?: unknown;
  };
  const candidates: unknown[] = [];
  if (typeof response.clone === 'function') {
    try {
      candidates.push(response.clone());
    } catch {
      // React Native response objects can reject cloning after a native read.
    }
  }
  candidates.push(response);

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const body = candidate as typeof response;
    if (typeof body.json === 'function') {
      try {
        const code = parseFunctionErrorPayload(await body.json());
        if (code) return code;
      } catch {
        // Fall through to text/native body extraction.
      }
    }
    if (typeof body.text === 'function') {
      try {
        const code = parseFunctionErrorPayload(await body.text());
        if (code) return code;
      } catch {
        // Fall through to native response fields.
      }
    }
    const nativeCode = parseFunctionErrorPayload(body._bodyInit)
      ?? parseFunctionErrorPayload(body.body);
    if (nativeCode) return nativeCode;
  }
  return null;
};

export const readFunctionErrorCode = async (error: unknown): Promise<string> => {
  const context = (error as FunctionErrorWithContext | null)?.context;
  const responseCode = await readResponseLikePayload(context);
  if (responseCode) return responseCode;
  const contextualCode = parseFunctionErrorPayload(context);
  if (contextualCode) return contextualCode;
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'live_token_temporarily_unavailable';
};
