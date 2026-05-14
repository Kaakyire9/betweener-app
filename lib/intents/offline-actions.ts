import { isLikelyNetworkError } from '@/lib/network';
import {
  enqueueIntentRequestCancelMutation,
  enqueueIntentRequestCreateMutation,
  enqueueIntentRequestDecisionMutation,
} from '@/lib/offline/mutation-queue';
import { supabase } from '@/lib/supabase';

export type IntentRequestType = 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';
export type IntentDecision = 'accept' | 'pass';

export type IntentActionResult =
  | { status: 'synced'; requestId?: string | null }
  | { status: 'queued'; requestId?: string | null };

export type CreateIntentRequestInput = {
  recipientId: string;
  type: IntentRequestType;
  message?: string | null;
  suggestedTime?: string | null;
  suggestedPlace?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DecideIntentRequestInput = {
  requestId: string;
  decision: IntentDecision;
  insertAcceptanceSystemMessages?: boolean;
};

export async function createIntentRequestOfflineSafe(input: CreateIntentRequestInput): Promise<IntentActionResult> {
  try {
    const { data, error } = await supabase.rpc('rpc_create_intent_request', {
      p_recipient_id: input.recipientId,
      p_type: input.type,
      p_message: input.message ?? null,
      p_suggested_time: input.suggestedTime ?? null,
      p_suggested_place: input.suggestedPlace ?? null,
      p_metadata: input.metadata ?? {},
    });
    if (error) throw error;
    return { status: 'synced', requestId: typeof data === 'string' ? data : null };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueIntentRequestCreateMutation({
      recipientId: input.recipientId,
      type: input.type,
      message: input.message ?? null,
      suggestedTime: input.suggestedTime ?? null,
      suggestedPlace: input.suggestedPlace ?? null,
      metadata: input.metadata ?? {},
    });
    return { status: 'queued', requestId: null };
  }
}

export async function decideIntentRequestOfflineSafe(input: DecideIntentRequestInput): Promise<IntentActionResult> {
  try {
    const { error } = await supabase.rpc('rpc_decide_intent_request', {
      p_request_id: input.requestId,
      p_decision: input.decision,
    });
    if (error) throw error;

    if (input.decision === 'accept' && input.insertAcceptanceSystemMessages !== false) {
      const { error: systemError } = await supabase.rpc('rpc_insert_request_acceptance_system_messages', {
        p_request_id: input.requestId,
      });
      if (systemError) throw systemError;
    }

    return { status: 'synced', requestId: input.requestId };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueIntentRequestDecisionMutation({
      requestId: input.requestId,
      decision: input.decision,
      insertAcceptanceSystemMessages: input.insertAcceptanceSystemMessages,
    });
    return { status: 'queued', requestId: input.requestId };
  }
}

export async function cancelIntentRequestOfflineSafe(requestId: string): Promise<IntentActionResult> {
  try {
    const { error } = await supabase.rpc('rpc_cancel_intent_request', {
      p_request_id: requestId,
    });
    if (error) throw error;
    return { status: 'synced', requestId };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueIntentRequestCancelMutation({ requestId });
    return { status: 'queued', requestId };
  }
}
