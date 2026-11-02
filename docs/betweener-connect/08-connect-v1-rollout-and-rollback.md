# Connect V1 rollout and rollback

> Current M1 artifacts and rollback are in [document 11](11-connect-v1-m1-implementation.md).
> Nothing is deployed. Keep entry flags off, preserve M0 security, and retain
> terminal/revocation APIs plus durable cleanup for any later authorized rollout.
> [Document 12](12-connect-v1-stream-configuration-checklist.md) lists outstanding gates.
> The original M0-only proposal follows.

> Historical M0 plan. The additive relationship remediation now has its own
> [local validation and deployment prerequisites](00-relationship-security-remediation.md). No deployment has occurred.

Status: **proposal only; rollout BLOCKED**. M0 introduced documentation and a
rollback-only local diagnostic. There is no Connect migration, function, binary,
OTA, provider call type, flag configuration or cloud resource to deploy/roll back.

## Development gates

1. Resolve B1 in the existing relationship boundary and preserve legitimate chat,
   Intent, swipe and Live matching behavior. Do not auto-certify historical rows.
2. Complete M1 against a reviewed local schema baseline. The currently running
   local migration ledger is older than the checkout; do not blindly replay all
   pending migrations or reset a shared local database.
3. Verify the designated non-production Stream app, dedicated private call type,
   member permissions and direct SDK/HTTP deny tests. Never load production
   credentials from base `.env` for development work.
4. Refactor shared client/admission ownership with Live regression checks before
   starting media. Keep same-app/user singleton ownership and correct refresh.
5. Implement/validate native restoration, answer authorization and physical-device
   behavior using separately approved development builds.
6. Pass security, functionality, resource cleanup and accessibility gates before
   proposing a staging rollout.

## Feature flag proposal

Use private server configuration and a fail-closed authenticated client projection.
Proposed keys: `connect_enabled`, `connect_voice_enabled`, `connect_video_enabled`,
`connect_pre_match_enabled`, `connect_native_ringing_enabled`,
`connect_signature_animations_enabled`. These names are not implemented yet.
All default false. Missing/unknown environment or configuration fails closed.
Retain an explicit production fence until a separately reviewed production release.

An ordinary master/media/pre-match flag update prevents new initiation and media
upgrades; it does not disconnect an otherwise authorized active call. Revocation,
decline/cancel/end, expiry and safety cleanup remain callable. A native-ringing
kill switch prevents new ringing and reconciles pending invitations. An emergency
security shutdown additionally fences all admissions and drains affected provider
sessions; record operator reason and cleanup completion.

## Staging proposal — requires separate authorization

Prepare reviewable local migrations/functions/configuration first. Confirm
staging Supabase `xsgzxadwuxuziubglvps`, staging Stream app and staging package
`com.aduboffour.betweener.staging`. Verify every native and push credential belongs
to that identity. Keep all flags off while applying any separately approved work.
Use repository wrapper commands for target validation/dry-runs when the time comes;
no deployment commands are authorized by this plan.

Canary with explicitly selected test accounts. Observe setup failures, invite
expiry, acceptance conflicts, time to confirmed connection, terminal cleanup and
resource recovery. Use no fabricated success rates. Expand only after the complete
device/security gate passes. Production release is a separate decision and remains
blocked; there is no automatic promotion from staging.

## Rollback semantics

For M0, remove only files in this Connect documentation change and its diagnostic
if desired. Existing uncommitted Live/Studio/Circle changes must remain intact.

For a future feature rollout, disable new calls/upgrades first, drain active
sessions, preserve end/revocation/maintenance paths and verify provider cleanup.
Do not drop call history, consent/audit records or receipt/outbox data as an
immediate rollback. Review retention/deletion policy separately. A binary rollback
must remain compatible with database additions. Native entitlements/plugins cannot
be undone by an OTA; coordinate the native kill switch with a later approved build.

## Release checklist — all Connect functionality pending

- Existing Live and chat pass regression and real-device validation.
- Trusted matches and explicit pre-match media consent; expiry/revocation/block
  enforcement and termination are proven, including races and provider failures.
- Member-only calls, token isolation and all direct provider bypass tests pass.
- Voice/video controls, native foreground/background/locked/cold-start behavior,
  audio interruptions, network recovery and multi-device conflicts pass.
- History/duration are authoritative and private; no recording/transcription or
  private media analysis is enabled; actual provider retention is reviewed.
- No client/listener/track/audio/animation leaks; accessibility and device matrix
  pass on both physical platforms.
- Default-off flags, kill switches, expiry maintenance and rollback are exercised.
- No production resources modified; each staging/build/deployment step has its
  own explicit authorization and evidence.
