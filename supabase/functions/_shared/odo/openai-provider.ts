import {
  ODO_ACTION_JSON_SCHEMA,
  normalizeOdoActionProposal,
} from '../../../../features/live/odo/domain/odo-validation.ts';
import {
  buildOdoProviderInput,
  buildOdoCopilotInstructions,
  ODO_CONSTITUTION,
} from './constitution.ts';
import {
  OdoProviderError,
  type OdoAIProvider,
  type OdoAudiencePulse,
  type OdoConversationSpark,
  type OdoCopilotProviderDraft,
  type OdoCopilotTask,
  type OdoProviderMetadata,
  type OdoProviderRequest,
  type OdoProviderResult,
  type OdoTask,
} from './provider.ts';
import type { OdoAction } from '../../../../features/live/odo/domain/odo-contracts.ts';

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

const extractOutputText = (payload: ResponsesPayload): string | null => {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text.trim();
    }
  }
  return null;
};

const exactObject = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});

const SPARK_SCHEMA = exactObject({
  context: { type: 'string', minLength: 1, maxLength: 200 },
  question: { type: 'string', minLength: 1, maxLength: 300 },
  locale: { type: 'string', pattern: '^[a-z]{2}(?:-[A-Z]{2})?$' },
}, ['context', 'question', 'locale']);

const PULSE_SCHEMA = exactObject({
  templateKey: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
  durationSeconds: { type: 'integer', minimum: 30, maximum: 300 },
}, ['templateKey', 'durationSeconds']);

const INTERMISSION_SCHEMA = exactObject({
  copy: { type: 'string', minLength: 1, maxLength: 500 },
}, ['copy']);

const nullableString = (maximum: number) => ({
  anyOf: [{ type: 'string', minLength: 1, maxLength: maximum }, { type: 'null' }],
});

const COPILOT_SCHEMA = exactObject({
  decision: { type: 'string', enum: ['suggest', 'no_action'] },
  reasonCode: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
  context: nullableString(200),
  question: nullableString(300),
  copy: nullableString(500),
  locale: { anyOf: [{ type: 'string', pattern: '^[a-z]{2}(?:-[A-Z]{2})?$' }, { type: 'null' }] },
  templateKey: { anyOf: [{ type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' }, { type: 'null' }] },
  durationSeconds: { anyOf: [{ type: 'integer', minimum: 30, maximum: 300 }, { type: 'null' }] },
  scene: {
    anyOf: [
      { type: 'string', enum: ['HOST_FOCUS', 'PAIR_FOCUS', 'COMMUNITY_WIDE', 'INTERMISSION', 'CLOSING'] },
      { type: 'null' },
    ],
  },
  signalCodesUsed: {
    type: 'array',
    maxItems: 8,
    items: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
  },
}, [
  'decision', 'reasonCode', 'context', 'question', 'copy', 'locale',
  'templateKey', 'durationSeconds', 'scene', 'signalCodesUsed',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);

export class OpenAIOdoProvider implements OdoAIProvider {
  private readonly options: {
    apiKey: string;
    timeoutMs: number;
    fetch?: FetchLike;
    endpoint?: string;
  };

  constructor(options: {
    apiKey: string;
    timeoutMs: number;
    fetch?: FetchLike;
    endpoint?: string;
  }) {
    if (!options.apiKey.trim()) throw new Error('missing_openai_api_key');
    this.options = options;
  }

  async decideNextAction(request: OdoProviderRequest): Promise<OdoProviderResult<OdoAction>> {
    const result = await this.complete(
      request,
      'director_action',
      'odo_director_action_v1',
      ODO_ACTION_JSON_SCHEMA,
    );
    const parsed = normalizeOdoActionProposal(result.value, { allowExpired: false });
    if (parsed.ok === false) {
      throw new OdoProviderError('invalid_response', parsed.reasonCode, result.metadata.providerRequestId);
    }
    const identity = request.actionIdentity;
    if (parsed.value.actionId !== identity.actionId
      || parsed.value.sessionId !== identity.sessionId
      || parsed.value.snapshotVersion !== identity.snapshotVersion
      || parsed.value.leaseGeneration !== identity.leaseGeneration
      || parsed.value.expiresAt !== identity.expiresAt) {
      throw new OdoProviderError('invalid_response', 'action_identity_mismatch', result.metadata.providerRequestId);
    }
    return { value: parsed.value, metadata: result.metadata };
  }

  async generateConversationSpark(request: OdoProviderRequest): Promise<OdoProviderResult<OdoConversationSpark>> {
    const result = await this.complete(
      request,
      'conversation_spark',
      'odo_conversation_spark_v1',
      SPARK_SCHEMA,
    );
    if (!isRecord(result.value) || !hasOnlyKeys(result.value, ['context', 'question', 'locale'])
      || typeof result.value.context !== 'string' || result.value.context.length > 200
      || typeof result.value.question !== 'string' || result.value.question.length > 300
      || typeof result.value.locale !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(result.value.locale)) {
      throw new OdoProviderError('invalid_response', 'invalid_spark_response', result.metadata.providerRequestId);
    }
    return { value: result.value as OdoConversationSpark, metadata: result.metadata };
  }

  async generateAudiencePulse(request: OdoProviderRequest): Promise<OdoProviderResult<OdoAudiencePulse>> {
    const result = await this.complete(
      request,
      'audience_pulse',
      'odo_audience_pulse_v1',
      PULSE_SCHEMA,
    );
    if (!isRecord(result.value) || !hasOnlyKeys(result.value, ['templateKey', 'durationSeconds'])
      || typeof result.value.templateKey !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(result.value.templateKey)
      || !Number.isInteger(result.value.durationSeconds)
      || Number(result.value.durationSeconds) < 30 || Number(result.value.durationSeconds) > 300) {
      throw new OdoProviderError('invalid_response', 'invalid_pulse_response', result.metadata.providerRequestId);
    }
    return { value: result.value as OdoAudiencePulse, metadata: result.metadata };
  }

  async generateIntermissionCopy(request: OdoProviderRequest): Promise<OdoProviderResult<string>> {
    const result = await this.complete(
      request,
      'intermission_copy',
      'odo_intermission_copy_v1',
      INTERMISSION_SCHEMA,
    );
    if (!isRecord(result.value) || !hasOnlyKeys(result.value, ['copy'])
      || typeof result.value.copy !== 'string'
      || result.value.copy.length < 1 || result.value.copy.length > 500) {
      throw new OdoProviderError('invalid_response', 'invalid_intermission_response', result.metadata.providerRequestId);
    }
    return { value: result.value.copy, metadata: result.metadata };
  }

  async generateCopilotSuggestion(
    request: OdoProviderRequest,
    task: OdoCopilotTask,
  ): Promise<OdoProviderResult<OdoCopilotProviderDraft>> {
    const result = await this.complete(
      request,
      task,
      `odo_copilot_${task}_v1`,
      COPILOT_SCHEMA,
      buildOdoCopilotInstructions(task),
    );
    const keys = [
      'decision', 'reasonCode', 'context', 'question', 'copy', 'locale',
      'templateKey', 'durationSeconds', 'scene', 'signalCodesUsed',
    ] as const;
    if (!isRecord(result.value) || !hasOnlyKeys(result.value, keys)
      || !['suggest', 'no_action'].includes(String(result.value.decision))
      || typeof result.value.reasonCode !== 'string'
      || !/^[a-z][a-z0-9_]{0,63}$/.test(result.value.reasonCode)
      || !Array.isArray(result.value.signalCodesUsed)
      || result.value.signalCodesUsed.length > 8
      || !result.value.signalCodesUsed.every((code) => typeof code === 'string'
        && /^[a-z][a-z0-9_]{0,63}$/.test(code))) {
      throw new OdoProviderError('invalid_response', 'invalid_copilot_response', result.metadata.providerRequestId);
    }
    const optionalStrings = ['context', 'question', 'copy', 'locale', 'templateKey', 'scene'] as const;
    if (optionalStrings.some((key) => result.value[key] !== null && typeof result.value[key] !== 'string')
      || (result.value.durationSeconds !== null
        && (!Number.isInteger(result.value.durationSeconds)
          || Number(result.value.durationSeconds) < 30
          || Number(result.value.durationSeconds) > 300))) {
      throw new OdoProviderError('invalid_response', 'invalid_copilot_payload', result.metadata.providerRequestId);
    }
    return { value: result.value as OdoCopilotProviderDraft, metadata: result.metadata };
  }

  private async complete(
    request: OdoProviderRequest,
    task: OdoTask,
    schemaName: string,
    schema: unknown,
    instructions = ODO_CONSTITUTION,
  ): Promise<OdoProviderResult<unknown>> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const requestFetch = this.options.fetch ?? fetch;
    let requestId: string | null = null;
    try {
      const response = await requestFetch(this.options.endpoint ?? 'https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          store: false,
          instructions,
          input: buildOdoProviderInput(request),
          text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
        }),
      });
      requestId = response.headers.get('x-request-id');
      if (!response.ok) {
        const code = response.status === 429
          ? 'provider_rate_limited'
          : 'provider_unavailable';
        throw new OdoProviderError(code, `openai_http_${response.status}`, requestId);
      }
      let payload: ResponsesPayload;
      try {
        payload = await response.json() as ResponsesPayload;
      } catch {
        throw new OdoProviderError('invalid_response', 'malformed_provider_response', requestId);
      }
      requestId = requestId ?? payload.id ?? null;
      if (payload.status && payload.status !== 'completed') {
        throw new OdoProviderError('invalid_response', `openai_${payload.status}`, requestId);
      }
      const output = extractOutputText(payload);
      if (!output) throw new OdoProviderError('invalid_response', 'empty_provider_output', requestId);
      let value: unknown;
      try {
        value = JSON.parse(output);
      } catch {
        throw new OdoProviderError('invalid_response', 'malformed_provider_json', requestId);
      }
      const metadata: OdoProviderMetadata = {
        provider: 'openai',
        model: request.model,
        task,
        completionStatus: 'completed',
        providerRequestId: requestId,
        inputTokens: Math.max(0, Number(payload.usage?.input_tokens) || 0),
        cachedInputTokens: Math.max(0, Number(payload.usage?.input_tokens_details?.cached_tokens) || 0),
        outputTokens: Math.max(0, Number(payload.usage?.output_tokens) || 0),
        latencyMs: Math.max(0, Date.now() - startedAt),
      };
      return { value, metadata };
    } catch (error) {
      if (error instanceof OdoProviderError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new OdoProviderError('provider_timeout', 'openai_timeout', requestId);
      }
      throw new OdoProviderError('provider_unavailable', 'openai_unavailable', requestId);
    } finally {
      clearTimeout(timeout);
    }
  }
}
