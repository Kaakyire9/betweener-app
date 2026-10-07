# Chat albums and solicitation guard: v1.2 migration notes

These changes are additive. The installed 1.1.1 app does not send the
`contractVersion: "1.2.0"` attachment contract or the
`safety_contract_version: "1.2.0"` profile contract, so its compatibility
paths remain unchanged.

## Staging deployment order

1. Apply `20260921120000_chat_image_moderation_receipts.sql`.
2. Apply `20260921121000_content_safety_weighted_enforcement.sql`.
3. Apply `20260921122000_legacy_profile_media_remediation.sql`.
4. Deploy `chat-attachment-finalize`, `chat-attachment-retention`,
   `profile-guard-update`, `profile-onboarding-submit-v2`, and
   `profile-media-remediation-v1-2` from the same commit.
5. Set `PROFILE_GUARD_SEMANTIC_ENABLED=true` and configure a unique
   `PROFILE_MEDIA_REMEDIATION_SECRET` of at least 32 characters.
6. Configure the remediation schedule with
   `public.configure_profile_media_remediation_worker(endpoint, secret)`.
7. Regenerate database types after the migrations are present on staging.
8. Run the v1.2 health SQL and physical-device album/safety acceptance tests.

Do not enable the 1.2 client rollout before steps 1–8 pass. Deploy migrations
before functions so receipt and remediation reads cannot target missing tables.

## Rollback controls

- Stop legacy scanning with `public.disable_profile_media_remediation_worker()`.
- Set `PROFILE_GUARD_SEMANTIC_ENABLED=false` only as an emergency kill switch;
  1.2 ambiguous public-profile writes then fail closed rather than bypassing the
  semantic guard.
- Video and document sends remain disabled for 1.2 until their immutable-byte
  inspection pipelines are implemented. Existing 1.1.1 media remains readable.
- Do not roll back the additive tables while either app version is live. They
  can remain unused safely.

## Monitoring

- Alert on remediation `DEAD_LETTER` rows and claims older than 15 minutes.
- Alert on image/caption provider failures, moderation latency, and receipt
  reuse misses.
- Verify every remediation `REMOVED` row has `needs_source_cleanup=false`.
- Review weighted enforcement points and appeal reversals; approved events must
  contribute zero points on the next recalculation.
