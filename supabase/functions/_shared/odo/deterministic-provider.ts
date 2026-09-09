import {
  ODO_SCHEMA_VERSION,
  type OdoAction,
} from '../../../../features/live/odo/domain/odo-contracts.ts';
import type {
  OdoAIProvider,
  OdoAudiencePulse,
  OdoConversationSpark,
  OdoCopilotProviderDraft,
  OdoCopilotTask,
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

  async generateCopilotSuggestion(
    request: OdoProviderRequest,
    task: OdoCopilotTask,
  ): Promise<OdoProviderResult<OdoCopilotProviderDraft>> {
    const base: OdoCopilotProviderDraft = {
      decision: 'suggest',
      reasonCode: 'deterministic_fallback',
      context: null,
      question: null,
      copy: null,
      locale: 'en',
      templateKey: null,
      durationSeconds: null,
      scene: null,
      signalCodesUsed: [],
    };

    const onStageCount = Number(request.taskContext?.onStageParticipantCount ?? 0);
    const currentScene = String(request.taskContext?.currentScene ?? '');
    const roundState = String(request.taskContext?.roundState ?? '');
    const scene = roundState === 'public_introduction' && onStageCount >= 2
      && currentScene !== 'pair_forming'
      ? 'PAIR_FOCUS'
      : onStageCount >= 3 && currentScene !== 'pool_focus'
        ? 'COMMUNITY_WIDE'
        : onStageCount <= 1 && currentScene !== 'host_focus'
          ? 'HOST_FOCUS'
          : null;

    const value: OdoCopilotProviderDraft = task === 'conversation_spark'
      ? { ...base, context: 'A light conversation starter', question: 'What is something you have enjoyed recently?' }
      : task === 'audience_pulse'
      ? { ...base, templateKey: 'host_question_next_topic', durationSeconds: 60 }
      : task === 'scene_suggestion'
      ? scene
        ? { ...base, scene }
        : { ...base, decision: 'no_action', reasonCode: 'scene_already_suitable' }
      : task === 'session_welcome'
      ? { ...base, copy: 'Welcome, everyone. Settle in and enjoy meeting the room.' }
      : task === 'session_closing'
      ? { ...base, copy: 'Thank you for joining. Take care and enjoy the rest of your evening.' }
      : task === 'pair_narration'
      ? { ...base, copy: 'Let us welcome our next pair to the conversation.' }
      : { ...base, copy: 'We will move into the next part of the session shortly.' };

    return { value, metadata: metadata(this.model, task) };
  }
}
