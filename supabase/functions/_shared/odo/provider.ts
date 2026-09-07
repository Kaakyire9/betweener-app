import type { OdoAction } from '../../../../features/live/odo/domain/odo-contracts.ts';

export const ODO_TASKS = [
  'director_action',
  'conversation_spark',
  'audience_pulse',
  'intermission_copy',
] as const;
export type OdoTask = (typeof ODO_TASKS)[number];

export type OdoProviderMetadata = {
  provider: 'openai' | 'deterministic' | 'fake';
  model: string;
  task: OdoTask;
  completionStatus: 'completed';
  providerRequestId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export type OdoProviderResult<T> = {
  value: T;
  metadata: OdoProviderMetadata;
};

export type OdoStructuredProfile = {
  profileId: string;
  displayName: string;
  ageBand: string | null;
  languages: readonly string[];
  conversationInterests: readonly string[];
  culturalAffinityTags: readonly string[];
  liveIntent: string | null;
};

export type OdoProviderRequest = {
  model: string;
  constitutionVersion: string;
  snapshot: Readonly<Record<string, unknown>>;
  profiles: readonly OdoStructuredProfile[];
  actionIdentity: {
    actionId: string;
    sessionId: string;
    snapshotVersion: number;
    leaseGeneration: number;
    expiresAt: string;
  };
};

export type OdoConversationSpark = {
  context: string;
  question: string;
  locale: string;
};

export type OdoAudiencePulse = {
  templateKey: string;
  durationSeconds: number;
};

export interface OdoAIProvider {
  decideNextAction(request: OdoProviderRequest): Promise<OdoProviderResult<OdoAction>>;
  generateConversationSpark(request: OdoProviderRequest): Promise<OdoProviderResult<OdoConversationSpark>>;
  generateAudiencePulse(request: OdoProviderRequest): Promise<OdoProviderResult<OdoAudiencePulse>>;
  generateIntermissionCopy(request: OdoProviderRequest): Promise<OdoProviderResult<string>>;
}

export class OdoProviderError extends Error {
  readonly code: 'provider_timeout' | 'provider_rate_limited' | 'provider_unavailable' | 'invalid_response';
  readonly providerRequestId: string | null;

  constructor(
    code:
      | 'provider_timeout'
      | 'provider_rate_limited'
      | 'provider_unavailable'
      | 'invalid_response',
    message: string,
    providerRequestId: string | null = null,
  ) {
    super(message);
    this.name = 'OdoProviderError';
    this.code = code;
    this.providerRequestId = providerRequestId;
  }
}
