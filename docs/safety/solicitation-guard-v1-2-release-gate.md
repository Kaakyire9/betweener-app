# Solicitation Guard v1.2 release gate

The code path is isolated to the 1.2 runtime. Do not publish a 1.2 store build or
OTA until its additive backend contract is deployed and healthy. Version 1.1.1
continues on its compatibility path.

## Deployment order

1. Apply migrations `20260915120000` through `20260915141000` in staging.
2. Deploy `profile-media-guard-v1-2`, `private-message-guard-send`,
   `chat-attachment-finalize`, `delete-account`, and
   `moderation-evidence-retention` in staging.
3. Configure `OPENAI_API_KEY`, moderation model variables, and
   `MODERATION_RETENTION_SECRET` in the server secret store.
4. Configure the server-owned daily schedule with
   `public.configure_moderation_evidence_retention_worker(...)`. It posts
   `{ "execute": true }` with the secret in `x-cron-secret`.
5. Run `v1.2.0_profile_media_guard_health.sql` and
   `v1.2.0_solicitation_guard_health.sql`.
6. Complete physical-device acceptance on iOS and Android.
7. Repeat the same migration/function/health order in production before the
   first 1.2 binary or OTA is available.

## Device acceptance

- Benign private messages containing “favour”, “book me a table”, “premium
  membership”, “exclusive interview”, and ordinary contact sharing send.
- Clear paid-content, scam, sexual-service, threat, and coercive redirection
  text is rejected immediately without creating a human-review task.
- A harm-provider outage produces a retry message and no member strike/review.
- Avatar requires one clear face. Avatar and gallery reject nudity, sexual
  content, unsafe QR/contact promotion, violence, hate, and locally configured
  exact hashes. Benign QR payloads are evaluated by their decoded content.
- A rejected image never becomes a profile URL and never enters an admin queue.
- Moment and Circle Pulse report controls create a pending report with immutable
  server-side evidence.
- New profile videos, chat videos, and documents remain unavailable in v1.2;
  existing items remain viewable/removable. Re-enable each type only after its
  pipeline in `chat-media-moderation-policy.md` passes canary gates.
- Account deletion removes staging, approved profile media, and view-once media.

## External gates

- Publish `public-child-safety-standards.md` at the configured
  `TRUST_LINKS.childSafety` URL, then configure the Google Play child-safety
  point of contact and verify that URL in Play Console.
- Verify App Store review notes explain filtering, reporting, blocking, and the
  immediate-rejection user experience.
- Keep capability reporting honest: exact local matching is available, while
  `external_provider_connected=false` and
  `provider_status=HASH_PROVIDER_NOT_CONNECTED`. A real approved provider is a
  deferred integration, not a v1.2 staging claim.
- Run approve/reject/retry tests against staging with non-production accounts.
- Review moderation queues and provider-failure rate daily during rollout.

## Current modality policy

- Images: enforce immutable-byte harm plus OCR/solicitation scanning.
- Text: deterministic rules, harm scan, and cue-triggered solicitation scan.
- Voice messages: retain private-chat reporting/blocking under limited
  inspection; do not claim transcript moderation yet.
- Video and documents: disabled for new v1.2 sends until complete inspection is
  implemented. Provider outages are operational failures, never misconduct.
