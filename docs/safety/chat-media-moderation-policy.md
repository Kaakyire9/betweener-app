# Chat media moderation policy

## Compatibility rule

Betweener 1.1.1 remains compatible while incomplete byte-inspection pipelines
are marked `REPORT_ONLY`. Switching an attachment type to `ENFORCE` makes its
upload fail closed until that type's complete pipeline is implemented and
verified on both mobile platforms.

## Images

- Enforce harm classification plus solicitation/OCR classification.
- Scan immutable server-held bytes, never a client-mutable object.
- Human approval applies only to the held byte hash.
- Provider failure is operational telemetry and must not punish the member.

## Video

- Current 1.1.1 policy: signature, size, MIME, caption, and preview validation;
  record `limited_inspection` evidence.
- Target pipeline: malware/container validation, server-derived frames near
  10%, 50%, and 90%, plus scene-change/keyframe samples for longer clips.
- Moderate every derived frame as an image. Transcribe and moderate the audio
  track when present.
- Do not trust a client-provided thumbnail as inspection evidence.

## Audio

- Current 1.1.1 policy: signature, size, MIME, and caption validation; record
  `limited_inspection` evidence.
- Target pipeline: malware/container validation, server-side transcription,
  then deterministic and semantic private-message moderation of the transcript.
- A transcription outage returns a retryable operational error under ENFORCE;
  it does not create an abuse strike.

## Documents

- Current 1.1.1 policy: size, extension, signature/MIME, and caption validation;
  record `limited_inspection` evidence.
- Target pipeline: malware scan first, reject active content/macros, safely
  extract text in a sandbox, OCR image-only pages, then run private-message
  text moderation.
- Password-protected or unparseable documents require review or rejection;
  they are never treated as inspected.

## Rollout gates

For one attachment type at a time:

1. Implement immutable inspection input and provider-independent validation.
2. Run `REPORT_ONLY` in staging and production canaries.
3. Measure provider failure rate, latency, false positives, and queue volume.
4. Verify iOS and Android retry/user messaging.
5. Change only that type to `ENFORCE` through a reviewed migration.
