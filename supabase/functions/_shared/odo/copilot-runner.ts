import {
  OdoProviderError,
  type OdoAIProvider,
  type OdoCopilotProviderDraft,
  type OdoCopilotTask,
  type OdoProviderMetadata,
  type OdoProviderRequest,
} from './provider.ts';
import type { ServerOdoCopilotContentGate } from './copilot-content-gate.ts';

export type OdoCopilotRunResult = {
  draft: OdoCopilotProviderDraft;
  metadata: OdoProviderMetadata;
  contentGateReasonCode: string;
  fallbackUsed: boolean;
  providerFailureReasonCode: string | null;
};

const emptyMetadata = (model: string, task: OdoCopilotTask): OdoProviderMetadata => ({
  provider: 'openai',
  model,
  task,
  completionStatus: 'completed',
  providerRequestId: null,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
});

const isCode = (value: unknown) => typeof value === 'string'
  && /^[a-z][a-z0-9_]{0,63}$/.test(value);
const isTextOrNull = (value: unknown, maximum: number) => value === null
  || (typeof value === 'string' && value.trim().length > 0 && value.length <= maximum);

export const isValidOdoCopilotDraft = (
  value: unknown,
  task: OdoCopilotTask,
): value is OdoCopilotProviderDraft => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = [
    'decision', 'reasonCode', 'context', 'question', 'copy', 'locale',
    'templateKey', 'durationSeconds', 'scene', 'signalCodesUsed',
  ];
  if (Object.keys(candidate).length !== keys.length
    || !keys.every((key) => Object.prototype.hasOwnProperty.call(candidate, key))
    || !['suggest', 'no_action'].includes(String(candidate.decision))
    || !isCode(candidate.reasonCode)
    || !isTextOrNull(candidate.context, 200)
    || !isTextOrNull(candidate.question, 300)
    || !isTextOrNull(candidate.copy, 500)
    || (candidate.locale !== null && (typeof candidate.locale !== 'string'
      || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(candidate.locale)))
    || (candidate.templateKey !== null && !isCode(candidate.templateKey))
    || (candidate.durationSeconds !== null && (!Number.isInteger(candidate.durationSeconds)
      || Number(candidate.durationSeconds) < 30 || Number(candidate.durationSeconds) > 300))
    || (candidate.scene !== null && ![
      'HOST_FOCUS', 'PAIR_FOCUS', 'COMMUNITY_WIDE', 'INTERMISSION', 'CLOSING',
    ].includes(String(candidate.scene)))
    || !Array.isArray(candidate.signalCodesUsed)
    || candidate.signalCodesUsed.length > 8
    || !candidate.signalCodesUsed.every(isCode)) return false;

  if (candidate.decision === 'no_action') return true;
  if (task === 'conversation_spark') return candidate.context !== null
    && candidate.question !== null && candidate.locale !== null;
  if (task === 'audience_pulse') return candidate.templateKey !== null
    && candidate.durationSeconds !== null;
  if (task === 'scene_suggestion') return candidate.scene !== null;
  return candidate.copy !== null && candidate.locale !== null;
};

export const runOdoCopilotProvider = async (options: {
  provider: OdoAIProvider;
  contentGate: ServerOdoCopilotContentGate;
  request: OdoProviderRequest;
  task: OdoCopilotTask;
  deterministicFallback: OdoCopilotProviderDraft;
  allowedSignalCodes: readonly string[];
}): Promise<OdoCopilotRunResult> => {
  let metadata = emptyMetadata(options.request.model, options.task);
  let draft: OdoCopilotProviderDraft;
  let providerFailureReasonCode: string | null = null;

  try {
    const generated = await options.provider.generateCopilotSuggestion(options.request, options.task);
    metadata = generated.metadata;
    if (!isValidOdoCopilotDraft(generated.value, options.task)) {
      throw new OdoProviderError('invalid_response', 'invalid_copilot_draft', metadata.providerRequestId);
    }
    draft = generated.value;
  } catch (error) {
    providerFailureReasonCode = error instanceof OdoProviderError
      ? error.code
      : 'provider_unavailable';
    draft = options.deterministicFallback;
  }

  const gate = await options.contentGate.inspect({
    task: options.task,
    draft,
    allowedSignalCodes: options.allowedSignalCodes,
  }).catch(() => ({ accepted: false, reasonCode: 'content_gate_rejected' } as const));

  if (!gate.accepted) {
    providerFailureReasonCode = providerFailureReasonCode ?? gate.reasonCode;
    draft = options.deterministicFallback;
    const fallbackGate = await options.contentGate.inspect({
      task: options.task,
      draft,
      allowedSignalCodes: options.allowedSignalCodes,
    });
    if (!fallbackGate.accepted || !isValidOdoCopilotDraft(draft, options.task)) {
      draft = {
        decision: 'no_action',
        reasonCode: 'safe_fallback_unavailable',
        context: null,
        question: null,
        copy: null,
        locale: null,
        templateKey: null,
        durationSeconds: null,
        scene: null,
        signalCodesUsed: [],
      };
    }
  }

  return {
    draft,
    metadata,
    contentGateReasonCode: gate.accepted ? gate.reasonCode : 'content_replaced',
    fallbackUsed: providerFailureReasonCode !== null,
    providerFailureReasonCode,
  };
};
