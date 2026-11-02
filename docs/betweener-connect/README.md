# Betweener Connect

Current engineering entry point, updated 2026-11-02. Numbered reports are historical
records; they are not current instructions or execution approvals. See the
[historical index](archive/README.md) instead of reading every report in sequence.

## Current product scope

- Authenticated foreground voice in the staging development app, entered from chat.
- Server-owned relationship, media consent, admission, blocking and terminal state.
- One Auth-bound Connect owner sharing the existing exclusive Live/Connect lease registry.
- Independent local stop requests, durable provider cleanup and strict acknowledgement classification.
- Local audio packet observations and timing diagnostics. Actual two-way audio and physical shutdown need device evidence.
- Video publication, background continuation, OS incoming calling and E2EE remain inactive.
- End Call & Block is implemented and tested, with its existing runtime gate still off.
- M2A/M2B remain **BLOCKED**. Remote hostile-peer media revocation remains **UNVERIFIED**.

The current local runtime policy permits the UI/native owner only in the verified
native staging development identity. Global defaults and production remain disabled.
This document does not attest to current hosted gates, account scope or budget.

## One active implementation path

| Boundary | Source |
| --- | --- |
| Chat entry and call route | `components/chat/ChatScreen.tsx`, `app/connect/voice.tsx` |
| Auth-bound composition | `features/connect/components/ConnectProductProvider.tsx`, `data/load-connect-product.ts` |
| Authenticated service and RPC adapter | `features/connect/data/authenticated-connect-services.ts`, `data/connect-repository.ts` |
| Calling preference UI state | `features/connect/hooks/use-calling-preferences.ts` |
| Voice lifecycle and native ownership | `features/connect/voice/voice-controller.ts`, `media/connect-native-owner.ts` |
| Credential fencing and provider cleanup | `supabase/functions/_shared/connect-credential-issuance.ts`, `connect-provider-worker.ts`, `connect-stream-adapter.ts` |
| Unreleased preparation | [Experimental modules](../../features/connect/experimental/README.md) |

The obsolete `connect-service.ts` / `voice-service.ts` wrappers and mock
`/connect/voice-preview` app route have been removed. The pure preview fixture remains
for offline tests. No second token issuer, media client or authority has been added.

## Testing

Use the existing iPhone/Android staging development clients with the repository's
normal root Metro workflow. `npm.cmd start` is the root Expo command, not a staging
identity guarantee: retain the configured staging environment and confirm the app's
staging identity before testing. No new launcher or standalone test app is required.

Keep the initial voice retest in the foreground. Check two-way sound, mute/unmute,
earpiece/speaker routing, ordinary End, and Call details on both phones. Do not treat
SDK state or packet counters as independent hardware or remote-cutoff proof.

Focused local checks:

```powershell
npm.cmd run typecheck
node node_modules/eslint/bin/eslint.js features/connect app/connect/voice.tsx index.js
node node_modules/jest/bin/jest.js __tests__/connect-calling-preferences.interaction.test.tsx __tests__/connect-staging-voice.interaction.test.tsx __tests__/connect-intent-push.interaction.test.tsx --runInBand --watch=false
$connectTests = @(rg --files __tests__ -g 'connect-*.regression.test.cjs' -g 'connect-*.regression.test.ts')
node --experimental-strip-types --test --test-concurrency=4 @connectTests
```

The broad Node suite currently includes five inherited historical source-hash
failures: three push rollback/package checks, the old Edge closure check, and B2
source provenance. Preserve these as failures until a separate provenance review;
do not regenerate frozen hashes to make them green.

## Deployment and evidence

Retain the [M3.4 handoff](connect-m3-4-staging-handoff.json),
[operations handoff](connect-staging-operations-handoff.md),
[frozen operations package](connect-staging-operations-package.json), and
[push recovery candidate](connect-v1-push-recovery-candidate-48.json).
They describe reviewed scopes; they do not authorise another execution.

All applied migration identifiers, original reports, receipts, consumed approvals
and ledgers stay unchanged. The 26.7 MB B3 receipt is historical evidence, not app
code. Review redaction and evidence storage before staging raw artifacts for Git.
Do not rename or delete hash-bound evidence during routine product cleanup.

## Commit boundaries

Review separate changesets for backend/security, mobile integration, and historical
evidence/tooling. Shared Auth, push and Live lease changes need selective hunk review.
Do not include unrelated Live, Circle or Studio work in a Connect commit. No commit,
hosted action, build, OTA or calling activation is part of this cleanup.
