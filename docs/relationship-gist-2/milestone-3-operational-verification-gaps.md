# Relationship Gist 2.0 — Milestone 3 Operational Verification Gaps

Milestone 3 has local implementation evidence, but it does not yet have end-to-end operational proof.

## Verified locally

- Shared structured-output validation and provider retry behaviour were exercised with mocked HTTP responses.
- Authorization, environment isolation, immutable provenance, review gates, budgets, and human-only publication were exercised against local PostgreSQL in rollback-only transactions.
- Client integration passed TypeScript, scoped lint, and focused regression tests.
- No real OpenAI request, remote function invocation, deployment, or remote database mutation occurred.

## Outstanding operational gates

### 1. Deno runtime execution

The `relationship-gist-ai-draft` Edge Function has not been served or invoked in a local Supabase/Deno runtime. Static inspection and TypeScript checks do not prove URL imports, runtime environment variables, JWT verification, timeout behaviour, or Edge deployment packaging.

Required evidence: start a persistent disposable local Supabase stack, serve the function with local-only secrets, invoke authenticated success and failure fixtures, and retain sanitized logs.

### 2. Real OpenAI provider integration

Provider tests use mocked Responses API payloads. They do not prove model availability, strict-schema adherence by the selected model, moderation behaviour, real token usage, provider request IDs, latency, retries, or configured cost estimates.

Required evidence: explicitly authorized local-only calls using a capped test key and budget, covering valid output, malformed/refusal behaviour, moderation rejection, timeout/rate-limit handling, and redacted telemetry. Generated content must remain an unpublished disposable draft.

### 3. Persistent disposable-database lifecycle

The editorial lifecycle passed rollback-only pgTAP transactions. That proves transactional rules but not persistence across process restarts, queue recovery, scheduled retries, concurrent workers, or retained audit history.

Required evidence: apply Milestones 1–3 to a persistent disposable local database, run the complete topic → generation → human edit → quality/safety/specialist review → publication lifecycle with test identities, restart the local services, verify recovery and audit history, then destroy the disposable database.

Until all three gates pass, Milestone 3 must remain default-off and must not be represented as operationally production-ready.
