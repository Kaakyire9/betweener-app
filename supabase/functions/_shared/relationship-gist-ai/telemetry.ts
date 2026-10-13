export const buildRelationshipGistAITelemetry = (input: {
  event: string;
  jobId?: string | null;
  environment?: string | null;
  status?: string | null;
  failureCode?: string | null;
  providerRequestId?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostMicrousd?: number | null;
  attempts?: number | null;
}) => ({
  event: input.event.slice(0, 96),
  job_id: input.jobId ?? null,
  environment: input.environment ?? null,
  status: input.status ?? null,
  failure_code: input.failureCode ?? null,
  provider_request_id: input.providerRequestId ?? null,
  model: input.model ?? null,
  input_tokens: input.inputTokens ?? null,
  output_tokens: input.outputTokens ?? null,
  estimated_cost_microusd: input.estimatedCostMicrousd ?? null,
  attempts: input.attempts ?? null,
});
