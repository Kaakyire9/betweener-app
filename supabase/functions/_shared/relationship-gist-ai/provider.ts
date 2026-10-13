import {
  buildRelationshipGistAIInput,
  buildRelationshipGistAIInstructions,
  RELATIONSHIP_GIST_AI_JSON_SCHEMA,
  RELATIONSHIP_GIST_AI_PROMPT_VERSION,
  RELATIONSHIP_GIST_AI_SCHEMA_VERSION,
  validateRelationshipGistAIDraft,
  type RelationshipGistAIDraft,
  type RelationshipGistAIPerspective,
} from './contracts.ts';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type ResponsesPayload = {
  id?: string;
  status?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
};

export type RelationshipGistAIProviderMetadata = {
  provider: 'openai';
  model: string;
  schemaVersion: typeof RELATIONSHIP_GIST_AI_SCHEMA_VERSION;
  promptVersion: typeof RELATIONSHIP_GIST_AI_PROMPT_VERSION;
  providerRequestId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  attempts: number;
};

export class RelationshipGistAIProviderError extends Error {
  readonly code: 'provider_unavailable' | 'provider_timeout' | 'provider_rate_limited' | 'invalid_response';
  readonly reasonCode: string;
  readonly retryable: boolean;
  readonly providerRequestId: string | null;

  constructor(
    code: 'provider_unavailable' | 'provider_timeout' | 'provider_rate_limited' | 'invalid_response',
    reasonCode: string,
    retryable: boolean,
    providerRequestId: string | null = null,
  ) {
    super(reasonCode);
    this.name = 'RelationshipGistAIProviderError';
    this.code = code;
    this.reasonCode = reasonCode;
    this.retryable = retryable;
    this.providerRequestId = providerRequestId;
  }
}

const extractOutputText = (payload: ResponsesPayload) => {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text.trim();
    }
  }
  return null;
};

const backoff = (attempt: number) => new Promise((resolve) => setTimeout(resolve, 150 * attempt));

export class OpenAIRelationshipGistDraftProvider {
  private readonly options: {
    apiKey: string;
    model: string;
    timeoutMs: number;
    maxAttempts: number;
    maxOutputTokens: number;
    fetch?: FetchLike;
    endpoint?: string;
    wait?: (attempt: number) => Promise<unknown>;
  };

  constructor(options: OpenAIRelationshipGistDraftProvider['options']) {
    if (!options.apiKey.trim()) throw new Error('missing_openai_api_key');
    if (!options.model.trim()) throw new Error('missing_openai_model');
    this.options = options;
  }

  async generate(input: {
    topicTitle: string;
    topicBrief: string;
    perspective: RelationshipGistAIPerspective;
  }): Promise<{ value: RelationshipGistAIDraft; metadata: RelationshipGistAIProviderMetadata }> {
    const attempts = Math.max(1, Math.min(3, this.options.maxAttempts));
    let lastError: RelationshipGistAIProviderError | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.complete(input, attempt);
      } catch (error) {
        const providerError = error instanceof RelationshipGistAIProviderError
          ? error
          : new RelationshipGistAIProviderError('provider_unavailable', 'openai_unavailable', true);
        lastError = providerError;
        if (!providerError.retryable || attempt === attempts) throw providerError;
        await (this.options.wait ?? backoff)(attempt);
      }
    }
    throw lastError ?? new RelationshipGistAIProviderError('provider_unavailable', 'openai_unavailable', true);
  }

  private async complete(input: {
    topicTitle: string;
    topicBrief: string;
    perspective: RelationshipGistAIPerspective;
  }, attempt: number) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let requestId: string | null = null;
    try {
      const response = await (this.options.fetch ?? fetch)(
        this.options.endpoint ?? 'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.options.model,
            store: false,
            max_output_tokens: this.options.maxOutputTokens,
            reasoning: { effort: 'low' },
            instructions: buildRelationshipGistAIInstructions(),
            input: buildRelationshipGistAIInput(input),
            text: {
              format: {
                type: 'json_schema',
                name: RELATIONSHIP_GIST_AI_SCHEMA_VERSION,
                strict: true,
                schema: RELATIONSHIP_GIST_AI_JSON_SCHEMA,
              },
            },
          }),
        },
      );
      requestId = response.headers.get('x-request-id');
      if (!response.ok) {
        const rateLimited = response.status === 429;
        const retryable = rateLimited || response.status >= 500;
        throw new RelationshipGistAIProviderError(
          rateLimited ? 'provider_rate_limited' : 'provider_unavailable',
          `openai_http_${response.status}`,
          retryable,
          requestId,
        );
      }
      let payload: ResponsesPayload;
      try {
        payload = await response.json() as ResponsesPayload;
      } catch {
        throw new RelationshipGistAIProviderError('invalid_response', 'malformed_provider_response', false, requestId);
      }
      requestId = requestId ?? payload.id ?? null;
      if (payload.status && payload.status !== 'completed') {
        throw new RelationshipGistAIProviderError('invalid_response', `openai_${payload.status}`, false, requestId);
      }
      const output = extractOutputText(payload);
      if (!output) throw new RelationshipGistAIProviderError('invalid_response', 'empty_provider_output', false, requestId);
      let parsed: unknown;
      try {
        parsed = JSON.parse(output);
      } catch {
        throw new RelationshipGistAIProviderError('invalid_response', 'malformed_provider_json', false, requestId);
      }
      const validation = validateRelationshipGistAIDraft(parsed);
      if (validation.ok === false) {
        throw new RelationshipGistAIProviderError('invalid_response', validation.code, false, requestId);
      }
      return {
        value: validation.value,
        metadata: {
          provider: 'openai' as const,
          model: this.options.model,
          schemaVersion: RELATIONSHIP_GIST_AI_SCHEMA_VERSION,
          promptVersion: RELATIONSHIP_GIST_AI_PROMPT_VERSION,
          providerRequestId: requestId,
          inputTokens: Math.max(0, Number(payload.usage?.input_tokens) || 0),
          cachedInputTokens: Math.max(0, Number(payload.usage?.input_tokens_details?.cached_tokens) || 0),
          outputTokens: Math.max(0, Number(payload.usage?.output_tokens) || 0),
          latencyMs: Math.max(0, Date.now() - startedAt),
          attempts: attempt,
        },
      };
    } catch (error) {
      if (error instanceof RelationshipGistAIProviderError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new RelationshipGistAIProviderError('provider_timeout', 'openai_timeout', true, requestId);
      }
      throw new RelationshipGistAIProviderError('provider_unavailable', 'openai_unavailable', true, requestId);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const estimateRelationshipGistAICostMicrousd = (input: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  inputMicrousdPerMillion: number | null;
  cachedInputMicrousdPerMillion: number | null;
  outputMicrousdPerMillion: number | null;
}) => {
  if (input.inputMicrousdPerMillion == null || input.outputMicrousdPerMillion == null) return null;
  const cached = Math.min(Math.max(0, input.cachedInputTokens), Math.max(0, input.inputTokens));
  const uncached = Math.max(0, input.inputTokens - cached);
  const cachedRate = input.cachedInputMicrousdPerMillion ?? input.inputMicrousdPerMillion;
  return Math.ceil((
    uncached * input.inputMicrousdPerMillion
    + cached * cachedRate
    + Math.max(0, input.outputTokens) * input.outputMicrousdPerMillion
  ) / 1_000_000);
};
