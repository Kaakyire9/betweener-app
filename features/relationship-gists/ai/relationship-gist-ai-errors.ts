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
};

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
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
