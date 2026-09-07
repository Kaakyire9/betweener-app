import {
  ODO_SCHEMA_VERSION,
  type OdoAction,
} from '../../../../features/live/odo/domain/odo-contracts.ts';
import type {
  OdoAIProvider,
  OdoAudiencePulse,
  OdoConversationSpark,
  OdoProviderMetadata,
  OdoProviderRequest,
  OdoProviderResult,
  OdoTask,
} from './provider.ts';

const metadata = (model: string, task: OdoTask): OdoProviderMetadata => ({
  provider: 'deterministic',
  model,
  task,
  completionStatus: 'completed',
  providerRequestId: null,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
});

export class DeterministicOdoProvider implements OdoAIProvider {
  private readonly model: string;

  constructor(model = 'odo-deterministic-v1') {
    this.model = model;
  }

  async decideNextAction(request: OdoProviderRequest): Promise<OdoProviderResult<OdoAction>> {
    return {
      value: {
        schemaVersion: ODO_SCHEMA_VERSION,
        ...request.actionIdentity,
        type: 'NO_ACTION',
        reasonCode: 'deterministic_shadow_default',
        payload: {},
      },
      metadata: metadata(this.model, 'director_action'),
    };
  }

  async generateConversationSpark(): Promise<OdoProviderResult<OdoConversationSpark>> {
    return {
      value: { context: 'A shared conversation', question: 'What brought you joy this week?', locale: 'en' },
      metadata: metadata(this.model, 'conversation_spark'),
    };
  }

  async generateAudiencePulse(): Promise<OdoProviderResult<OdoAudiencePulse>> {
    return {
      value: { templateKey: 'shared_energy', durationSeconds: 60 },
      metadata: metadata(this.model, 'audience_pulse'),
    };
  }

  async generateIntermissionCopy(): Promise<OdoProviderResult<string>> {
    return {
      value: 'We will continue shortly.',
      metadata: metadata(this.model, 'intermission_copy'),
    };
  }
}
