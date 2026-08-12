# Chat attachment operations

The canonical lifecycle is introduced by
`20260720150000_future_proof_chat_attachments.sql` and production-hardened by
`20260731160000_production_harden_chat_attachments.sql`.

## Deploy

```powershell
npx.cmd supabase@latest db push
npx.cmd supabase@latest functions deploy chat-attachment-finalize
npx.cmd supabase@latest functions deploy chat-attachment-consume
npx.cmd supabase@latest functions deploy chat-attachment-retention --no-verify-jwt
```

Set a dedicated random `CHAT_ATTACHMENT_RETENTION_SECRET`; do not reuse an app,
JWT, or verification secret. Configure the database-owned five-minute schedule
once from the SQL editor, using the same secret that was deployed to the Edge
Function:

```sql
select public.configure_chat_attachment_retention_worker(
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/chat-attachment-retention',
  'YOUR_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS'
);
```

The secret is never readable by `anon` or `authenticated`. Confirm recent
`succeeded` rows in `public.chat_attachment_retention_runs`; alert if no run has
succeeded for 15 minutes or if `dead_letter_count` becomes non-zero.

## Lifecycle guarantees

- Upload paths are deterministic and retry-safe.
- Finalised storage objects cannot be overwritten or directly deleted by clients.
- Message creation and canonical attachment metadata finalize in one database transaction.
- One sender/client-message key can claim exactly one finalisation payload.
- New view-once secrets are not stored on participant-readable message rows.
- View-once access is claimed atomically before a signed URL is returned and schedules deletion after five minutes.
- View-once ciphertext is staged in the account-scoped durable outbox; plaintext is not persisted.
- Delete-for-everyone tombstones the message and schedules physical object deletion.
- Unreferenced objects older than 24 hours are swept as abandoned uploads.
- Cleanup retries become observable dead letters after the bounded retry policy.
- Local upload, preview, and media caches are account-scoped and removed on account switching.
- Existing message rows remain readable during the client migration window.

Signature validation blocks mismatched content and unsafe document families. It
is a first-line content check, not an antivirus service. The validation metadata
and quarantine lifecycle are intentionally versioned so a malware-scanning
provider can be added without another client protocol migration.
