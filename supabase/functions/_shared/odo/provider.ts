import type { OdoAction } from '../../../../features/live/odo/domain/odo-contracts.ts';

export const ODO_TASKS = [
  'director_action',
  'conversation_spark',
  'audience_pulse',
  'intermission_copy',
  'pair_narration',
  'scene_suggestion',
  'transition_copy',
  'session_welcome',
  'session_closing',
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
  task?: OdoTask;
  snapshot: Readonly<Record<string, unknown>>;
  profiles: readonly OdoStructuredProfile[];
  taskContext?: Readonly<Record<string, unknown>>;
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

export type OdoCopilotTask = Exclude<OdoTask, 'director_action'>;

export type OdoCopilotProviderDraft = {
  decision: 'suggest' | 'no_action';
  reasonCode: string;
  context: string | null;
  question: string | null;
  copy: string | null;
  locale: string | null;
  templateKey: string | null;
  durationSeconds: number | null;
  scene: string | null;
  signalCodesUsed: readonly string[];
};

export interface OdoAIProvider {
  decideNextAction(request: OdoProviderRequest): Promise<OdoProviderResult<OdoAction>>;
  generateConversationSpark(request: OdoProviderRequest): Promise<OdoProviderResult<OdoConversationSpark>>;
  generateAudiencePulse(request: OdoProviderRequest): Promise<OdoProviderResult<OdoAudiencePulse>>;
  generateIntermissionCopy(request: OdoProviderRequest): Promise<OdoProviderResult<string>>;
  generateCopilotSuggestion(
    request: OdoProviderRequest,
    task: OdoCopilotTask,
  ): Promise<OdoProviderResult<OdoCopilotProviderDraft>>;
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
