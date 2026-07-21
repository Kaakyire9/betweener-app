# Chat attachment operations

The canonical attachment lifecycle is introduced by
`20260720150000_future_proof_chat_attachments.sql`.

## Deploy

```powershell
npx.cmd supabase@latest db push
npx.cmd supabase@latest functions deploy chat-attachment-finalize
npx.cmd supabase@latest functions deploy chat-attachment-consume
npx.cmd supabase@latest functions deploy chat-attachment-retention --no-verify-jwt
```

Set a dedicated random `CHAT_ATTACHMENT_RETENTION_SECRET`; do not reuse an app,
JWT, or verification secret. Invoke the retention function every 5 minutes with
that value in `x-cron-secret`.

## Lifecycle guarantees

- Upload paths are deterministic and retry-safe.
- Message creation and canonical attachment metadata finalize in one database transaction.
- New view-once secrets are not stored on participant-readable message rows.
- View-once consumption is atomic and schedules deletion after five minutes.
- Delete-for-everyone tombstones the message and schedules physical object deletion.
- Unreferenced objects older than 24 hours are swept as abandoned uploads.
- Existing message rows remain readable during the client migration window.

Signature validation blocks mismatched content and unsafe document families. It
is a first-line content check, not an antivirus service. The validation metadata
and quarantine lifecycle are intentionally versioned so a malware-scanning
provider can be added without another client protocol migration.
