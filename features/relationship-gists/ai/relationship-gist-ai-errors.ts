const ERROR_MESSAGES: Record<string, string> = {
  gist_ai_topic_self_approval_forbidden:
    'Use “Generate AI draft” to prepare and generate from your own brief.',
  gist_ai_owner_review_forbidden:
    'Owner review is limited to authorised super admins.',
  gist_ai_owner_topic_mismatch:
    'Only the owner who created this brief can prepare it for AI generation.',
  gist_ai_owner_confirmation_required:
    'Confirm that you reviewed the Gist and accept publishing responsibility.',
  gist_ai_claims_verification_required:
    'Confirm that you checked the claims and wording before publishing.',
  gist_ai_source_review_required:
    'Verify or reject every suggested source before publishing.',
  gist_ai_specialist_review_required:
    'Complete every safety acknowledgement before publishing.',
  gist_ai_image_review_required:
    'Approve or reject the generated image before publishing.',
  editorial_quality_approve_forbidden:
    'Your editorial role does not include quality approval.',
  gist_ai_topic_not_draft:
    'This topic is no longer awaiting approval. Refresh the Editorial Studio to see its current status.',
  gist_ai_topic_not_approved:
    'Prepare this brief with “Generate AI draft” before requesting generation.',
  gist_ai_topic_not_found:
    'This editorial topic is no longer available. Refresh the Editorial Studio.',
  gist_ai_topic_duplicate:
    'A very similar editorial topic already exists. Review the calendar before creating another.',
  gist_ai_disabled:
    'AI-assisted drafting is currently disabled for this environment.',
  gist_ai_budget_exceeded:
    'The staging AI allowance has been reached. Try again after the daily allowance resets.',
  GIST_AI_GENERATION_FAILED:
    'AI draft generation failed. Refresh the Studio and check the latest job for the provider status.',
  GIST_AI_PERSISTENCE_FAILED:
    'The AI draft was generated but could not be saved. No published Gist was changed.',
  GIST_AI_MODERATION_UNAVAILABLE:
    'The safety check is temporarily unavailable. Please try again.',
  GIST_AI_UNSAFE:
    'The generated revision did not pass the safety check and was not saved.',
  GIST_AI_OUTPUT_INVALID:
    'The provider returned an invalid draft. Please revise the instruction and try again.',
  GIST_AI_JOB_NOT_CLAIMABLE:
    'This AI job can no longer run. Refresh the Studio and start a new revision.',
  GIST_AI_JOB_NOT_RETRYABLE:
    'This AI job cannot be retried. Refresh the Studio and start a new revision.',
  GIST_AI_REQUEST_DENIED:
    'Your session or editorial permission could not be verified. Refresh and try again.',
  GIST_AI_UNAVAILABLE:
    'AI drafting is temporarily unavailable in this environment.',
  GIST_AI_REQUEST_FAILED:
    'The AI request could not be completed. Please try again.',
};

const JOB_FAILURE_MESSAGES: Record<string, string> = {
  openai_http_400: 'Provider rejected the draft schema',
  openai_http_401: 'Provider credentials were rejected',
  openai_http_403: 'Provider access is not permitted',
  openai_http_429: 'Provider allowance or rate limit reached',
  openai_timeout: 'Provider request timed out',
  openai_unavailable: 'Provider is temporarily unavailable',
  malformed_provider_response: 'Provider returned an unreadable response',
  malformed_provider_json: 'Provider returned invalid structured content',
  empty_provider_output: 'Provider returned no draft content',
};

export function relationshipGistAIJobFailureMessage(code: string | null) {
  if (!code) return null;
  return JOB_FAILURE_MESSAGES[code] ?? 'Draft generation failed';
}

const errorText = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  return [candidate.code, candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
};

export function relationshipGistAIErrorMessage(
  error: unknown,
  fallback = 'The operation could not be completed.',
) {
  const text = errorText(error);
  const knownCode = Object.keys(ERROR_MESSAGES).find((code) => text.includes(code));
  if (knownCode) return ERROR_MESSAGES[knownCode];
  if (text.includes('Edge Function returned a non-2xx status code')) {
    return ERROR_MESSAGES.GIST_AI_GENERATION_FAILED;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
