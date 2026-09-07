import {
  parseOdoAction,
  selectDeterministicOdoFallback,
  type OdoAction,
  type OdoContentGate,
  type OdoFallbackCause,
} from '../../../../features/live/odo/domain/index.ts';
import {
  OdoProviderError,
  type OdoAIProvider,
  type OdoProviderMetadata,
  type OdoProviderRequest,
} from './provider.ts';

export type OdoShadowRunResult = {
  action: OdoAction;
  metadata: OdoProviderMetadata;
  contentGateAccepted: boolean;
  contentGateReasonCode: string;
  fallbackUsed: boolean;
  providerFailureReasonCode: string | null;
};

const emptyMetadata = (model: string): OdoProviderMetadata => ({
  provider: 'openai',
  model,
  task: 'director_action',
  completionStatus: 'completed',
  providerRequestId: null,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
});

const fallback = (
  cause: OdoFallbackCause,
  request: OdoProviderRequest,
  now: Date,
): OdoAction => selectDeterministicOdoFallback(cause, {
  ...request.actionIdentity,
  now,
  snapshot: {
    sessionStatus: String(request.snapshot.sessionStatus ?? ''),
    activeRoundId: typeof request.snapshot.activeRoundId === 'string'
      ? request.snapshot.activeRoundId
      : null,
  },
});

export const runOdoShadowProvider = async (options: {
  provider: OdoAIProvider;
  contentGate: OdoContentGate;
  request: OdoProviderRequest;
  now?: Date;
}): Promise<OdoShadowRunResult> => {
  const now = options.now ?? new Date();
  let metadata = emptyMetadata(options.request.model);
  let action: OdoAction;
  let failureReason: string | null = null;

  try {
    const generated = await options.provider.decideNextAction(options.request);
    metadata = generated.metadata;
    const parsed = parseOdoAction(generated.value, { now });
    if (parsed.ok === false) {
      throw new OdoProviderError('invalid_response', parsed.reasonCode, metadata.providerRequestId);
    }
    action = parsed.value;
  } catch (error) {
    const cause = error instanceof OdoProviderError ? error.code : 'provider_unavailable';
    failureReason = cause;
    action = fallback(cause, options.request, now);
    return {
      action,
      metadata,
      contentGateAccepted: true,
      contentGateReasonCode: 'fallback_has_no_generated_content',
      fallbackUsed: true,
      providerFailureReasonCode: failureReason,
    };
  }

  try {
    const gate = await options.contentGate.inspect(action);
    if (gate.accepted) {
      return {
        action: gate.replacementAction ?? action,
        metadata,
        contentGateAccepted: true,
        contentGateReasonCode: gate.reasonCode,
        fallbackUsed: Boolean(gate.replacementAction),
        providerFailureReasonCode: null,
      };
    }
    failureReason = gate.reasonCode;
  } catch {
    failureReason = 'content_gate_unavailable';
  }

  // Content failures deterministically fall back. They never trigger a second
  // provider call or an automatic Luna-to-Terra escalation.
  return {
    action: fallback('content_invalid', options.request, now),
    metadata,
    contentGateAccepted: true,
    contentGateReasonCode: 'fallback_has_no_generated_content',
    fallbackUsed: true,
    providerFailureReasonCode: failureReason,
  };
};
