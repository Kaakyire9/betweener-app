# Connect V1 video target-resolution validation audit

Date: 2026-10-29. Scope: **offline analysis, pinned SDK inspection, public documentation and local validation only**. No authenticated Stream request, fixture creation, Supabase access, database change or execution approval occurred.

**A defensible request candidate is ready for separate B3 preparation:** add `target_resolution: {width:640,height:480,bitrate:600000}` to the existing disabled video override. The candidate passes strict SDK types, documented numeric constraints and actual SDK serialization with a fake transport. Every other request value is unchanged. **The exact B2 HTTP 400 cause remains a HYPOTHESIS.** Neither SDK validity nor the projected error paths establish the server's validation order or conditional rule. M2A and M2B remain BLOCKED.

## 1. Evidence and exact B2 serialization

Read reports [23](23-connect-v1-call-creation-400-audit.md), [24](24-connect-v1-media-truth-b2-preparation.md) and [25](25-connect-v1-media-truth-b2-results.md), the complete B2 proposal/readiness/execution receipts, retained configuration and boundary receipts, actual provider expression, shared request builder and installed SDK **0.7.63**. The [audit receipt](stream-staging-connect-video-resolution-audit.json) records requests, serialization, compiler results, local controls, source hashes and evidence limits. Its SHA-256 is:

```text
4c5682a9477f5cc5aea4204082d1d3d6dec4833fce47c1703125287ed5c05302
```

**The original B2 HTTP request body was not retained.** It cannot be newly inspected as a historical wire capture. This audit reconstructs it from the real immutable manifest, retained owned-resource ledger and actual provider `getOrCreate` argument expression, then executes that builder through the real pinned SDK against fake fetch. All **61** source/SDK/protocol hashes recorded by the B2 execution still match. This is strong deterministic reconstruction, with an explicit historical-capture limit.

The reconstruction uses the TypeScript AST to extract the provider expression `buildCreateRequest(manifest, ledger)`; it does not import or execute the credential-reading provider module. No body was manually transcribed from report 25. The reconstructed JSON reaches fake fetch with this exact video subtree:

```json
{
  "video": {
    "enabled": false,
    "camera_default_on": false
  }
}
```

| Check against actual SDK fake-fetch output | Result |
|---|---|
| `video.enabled` / `camera_default_on` | Both remain literal `false` |
| `video.target_resolution` | **Absent**: neither `null` nor `{}` |
| Resolution in another supplied settings group | None; screensharing and the other overrides contain no resolution object |
| SDK-inserted nested fields/defaults | None; serialized body is structurally equal to the real builder output |
| Settings nesting | `data.settings_override`; `ring=false`, `notify=false` |
| Creator/members | Retained first owned member is creator; exactly two `connect_voice` members |
| Original B2 request bytes | Unavailable; the receipt separately retains the newly captured offline serialized string |

The installed `CallApi.ts:98` forwards the argument; `VideoApi.ts:275` constructs the request envelope and passes `data` through; `ApiClient.ts:54` uses `JSON.stringify`. Undefined optional envelope fields disappear. No request-side recursive validator, resolution injection, inheritance or default filling occurs on this inspected path. The fake transport also demonstrates that explicit `{}` and `null` resolutions remain `{}` and `null`; the SDK does not convert an omitted resolution into either one.

## 2. Official schema, constraints and disabled-video semantics

The installed public declarations and generated models agree:

```ts
interface VideoSettingsRequest {
  access_request_enabled?: boolean;
  camera_default_on?: boolean;
  camera_facing?: 'front' | 'back' | 'external';
  enabled?: boolean;
  target_resolution?: TargetResolution;
}
interface TargetResolution {
  height: number;
  width: number;
  bitrate?: number;
}
```

Sources: installed `src/gen/models/index.ts:26930` and `:22740`, checked against public `dist/index.d.ts`. Thus **the object is optional in this SDK; width and height are mandatory when it is supplied**. Missing either dimension, `{}`, `null` or a string width fails strict compilation. B2's omitted object and the complete candidate both compile successfully.

The current official schema specifies integer width/height **240–3840 inclusive** and integer bitrate **at most 6000000**. It gives no bitrate minimum. The candidate's 640, 480 and 600000 satisfy those constraints. The video request table does not mark the resolution object required and supplies no explicit disabled-video exception or conditional requirement. This is a documentation gap relative to the observed rejection, not proof that the server must accept B2. [Stream settings schema](https://getstream.io/video/docs/api/call-types/settings/).

TypeScript's `number` does not enforce integer/range constraints: an offline width of 239 still passes the pinned declaration check. Separate document-based controls reject invalid bounds and fractions; they are **not a replica of the provider validator**. Nonfinite values and wrong primitives are also rejected by these local controls. No undocumented bitrate minimum was invented.

Stream describes target resolution as an ideal publisher resolution, with `enabled` and `camera_default_on` as separate controls. Supplying dimensions is not documented as enabling video. Actual server acceptance and effective settings still require future verification. [Stream video settings](https://getstream.io/video/docs/react/guides/configuring-call-types/).

## 3. Inherited settings and merge analysis

Stream documents that calls inherit call-type defaults and may override them. The consulted pages do not specify nested merge depth, treatment of missing value objects or validation order. [Stream calls](https://getstream.io/video/docs/api/calls/), [call-level settings example](https://getstream.io/video/docs/api/call-types/settings/).

The retained `stream-staging-connect-validation.json` configuration readback contains:

```json
{
  "enabled": false,
  "access_request_enabled": false,
  "camera_default_on": false,
  "camera_facing": "",
  "target_resolution": {
    "width": 640,
    "height": 480,
    "bitrate": 600000
  }
}
```

This differs from B2's partial video override: the retained default includes a valid resolution. B2's frame interval is separately overridden to 2; the older default interval is 3. These are different settings groups and the SDK does not copy a resolution from either one.

B2 retained a successful policy preflight and matching before/after shared type hash `12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e`, also present in the earlier boundary receipt. However, B2 did not retain its complete type payload or any effective call settings. Its preflight policy assertion does not independently validate target dimensions. A matching opaque hash cannot reconstruct the server's failed-call merge intermediate. No fresh provider read was made here.

Two explicit offline models show why merge order matters:

| Illustrative model using retained defaults | Result for B2 |
|---|---|
| Preserve inherited video children, then overwrite the two supplied flags | Valid inherited resolution remains |
| Replace the video group with its supplied object, or validate that partial group before inheritance | No resolution exists at that stage |

The candidate contains complete dimensions under either model. **Neither model is identified as the actual server algorithm.** Ordinary deep inheritance of the retained valid resolution, by itself, does not explain missing/invalid dimensions; an ordering, replacement, normalization or different validation rule would also be needed.

## 4. Earlier successful fixture comparison and provenance

Current adapter source supplies a disabled video object with the exact 640×480/600000 resolution. The earlier fixture wrapper preserves it, sets ringing/notification flags false, substitutes a third owned creator and adds the approved 60-second limit. Both actual `getOrCreate` argument expressions were extracted through the AST and evaluated offline, without running either module.

The boundary receipt retains three initially established calls, two with actual 60-second limit readbacks, successful coordinator joins and positive receiving controls. For example, call `33c9db30-6a12-454f-8f7e-1770024e161c` was created at the recorded label **06:38:34.430Z**, both initial joins returned **201**, and its later media observation returned a real session and timer deadline. This establishes earlier setup success; it does not upgrade the timer-security result.

| Property | Earlier fixture reconstruction / retained evidence | B2 | Offline candidate |
|---|---|---|---|
| SDK / call type | 0.7.63 / `betweener_connect` | Same | Same |
| Video / camera | Disabled / off; complete 640×480/600000 object | Disabled / off; resolution omitted | Disabled / off; complete object |
| Creator | Third fixture identity | First pair member | Same first pair member as B2 |
| Initial membership | Invited, promoted after admission | Voice roles at creation | Same voice roles as B2 |
| Other disabled feature objects | Mostly inherited | Explicitly supplied | All B2 restrictions preserved |
| Sixty-second timer | Two earlier calls actually established it | Creation failed | Proposed only |

**Provenance limit:** no immutable run-start source hash or original request-body capture exists for those earlier calls. Their retained per-call projections omit the video settings subtree. The exact resolution is supported by current source reconstruction and the separate genuine type-configuration readback, rather than a newly discovered original per-call HTTP body. Different creator, role and override combinations prevent treating earlier success as proof that this candidate will succeed.

## 5. Ranked hypotheses and smallest distinguishing evidence

| Rank / hypothesis | Supporting evidence | Contrary evidence / limit | Smallest useful discriminator; not executed |
|---|---|---|---|
| 1 — **H2: supplying a video settings object triggers dimension validation despite `enabled=false`** | B2 supplied the partial object; actual error projection recognized dimension names; earlier reconstruction supplied complete dimensions | SDK marks the object optional; consulted documentation gives no such conditional rule; raw server description is absent | Provider validation contract/trace showing validation of an omitted target inside a supplied disabled group. One future complete-object request can test the candidate, but success alone cannot distinguish H2 from H1 |
| 2 — **H1: replacement or validation before nested inheritance loses valid defaults** | Retained defaults have complete dimensions; replacing the group or validating early would lose them | A normal deep merge preserves them; no effective failed-call object or server merge implementation is retained | Trace of pre-merge and post-merge video values and validation order for the rejected shape. This requires no change to the existing shared type; no such trace was obtained |
| 3 — **H3: diagnostic normalization or field references obscure the actual objection** | Demonstrated below: bare names and full video paths project identically; no rule hint or original field qualification survived | Actual response did contain recognized dimension references, and video resolution is a plausible lead | Future bounded diagnostics distinguishing full-path matches from bare aliases and message text from exception-field keys, with finite rule labels. Synthetic projection controls already demonstrate ambiguity; they cannot recover B2's lost text |

All three remain unconfirmed explanations of this specific server rejection. They can overlap. In particular, future success with a complete object would establish setup compatibility for that request, not prove the original merge/validation mechanism.

### Confirmed diagnostic interpretation limit

The existing sanitizer maps known aliases into canonical paths. Its aliases include bare `height` and `width` for video resolution. A new offline regression demonstrates:

```text
"height width"
        and
"data.settings_override.video.target_resolution.height
 data.settings_override.video.target_resolution.width"

produce the same safe diagnostic fields and empty ruleHints.
```

That projection exactly matches B2's retained diagnostic. Consequently the stored prefix does **not** prove the provider originally named a fully qualified video path. Nor do field references prove a required/minimum/range rule, absent values, zero-valued defaults or a server-side empty object. This audit leaves the sanitizer unchanged and does not claim the server actually sent bare names. Raw B2 text remains unavailable.

## 6. Minimum request candidate

Add this **single object** to the otherwise identical request:

```json
"video": {
  "enabled": false,
  "camera_default_on": false,
  "target_resolution": {
    "width": 640,
    "height": 480,
    "bitrate": 600000
  }
}
```

Width/height are the required children; the optional bitrate is retained to match the earlier defensible configuration. Deleting this one object from the candidate gives a request deeply equal to B2's real-builder request. Tests verify every other value, including two `connect_voice` members, maximum participants 2, duration 60, frame interval 2, ringing/notifications false, microphone default off, and all video/camera/screen/recording/transcription/broadcast/ingress restrictions unchanged. No permission grant is added. The retained voice role grants only read, join and audio publication.

The complete, strictly typed request is retained at `tmp/connect-media-truth-25a/regression-o49tYt/candidate-request.ts`; it declares a concrete `GetOrCreateCallRequest` literal against the installed public SDK without an `any` or assertion cast. An independent strict compiler invocation on that actual file returns zero errors. The receipt contains the request and its real SDK serialized JSON.

**This is an offline request candidate, not an executable B3 manifest.** Historical B2 fixture identifiers appear only to reconstruct and compare the old request; they must not be reused for a future experiment. The original B2 manifest remains byte-identical, and its existing closed parser correctly rejects a manifest modified with this extra object. No profile, runner, approval guard or readiness receipt was loosened to accept it.

The fake SDK introduces no default-on flag or recording activation. Server defaults and effects are not exercised; a future fixture must still verify all effective settings before joining.

## 7. Fresh offline validation

Added only two test sources: `__tests__/connect-video-resolution.regression.test.cjs` and its dedicated offline SDK fixture. No runtime or product code was changed. Logs and exclusively created test artifacts are under `tmp/connect-media-truth-25a/`.

| Check | Fresh result |
|---|---|
| New reconstruction/type/range/restriction/manifest/history/merge/diagnostic/serialization tests | **13/13 PASS** |
| Existing Connect/media/relationship regressions | **229/229 PASS** |
| Final combined run | **242/242 PASS**, `offline-final-serialization.log` |
| Actual candidate `.ts` file against public SDK declarations | **PASS**, strict, zero errors |
| Pinned SDK fake transport | **Five intercepted POSTs, zero network calls**; captures B2, candidate, empty, null and omitted-video shapes |
| Dedicated Deno fixture | **PASS**, strict cached check; runtime uses Deno 2.5.4, SDK 0.7.63, `--deny-net` and explicit credential-file read denial |
| Targeted ESLint | **PASS**, zero warnings, including `.mts` with a temporary TypeScript lint extension |
| Existing sources and protected evidence | **273/273 baseline entries and 108/108 protected entries unchanged** |

The fake fetch deliberately returns the same synthetic 400 for every body. Those responses test serialization and safe projection, **not provider validation or candidate acceptance**. The original SDK response branch remains usable after bounded diagnostic capture. Unknown/sensitive synthetic fields are omitted; no sentinel prose, credentials, headers or error body are persisted.

The first focused run was **12/13** because the new Deno test's read permission omitted the CommonJS builder directory. Only the new offline test's read allowlist was corrected; network and credential-file reads remain explicitly denied. The failed log is preserved. The ordinary lint configuration also needed a temporary `.mts` parser extension; the repository lint configuration was not edited. Final strict, lint and combined results above were executed after the final serialization assertions.

No browser media, database driver, full Live suite, app build or native device test was run. Prior media controls remain historical preparation evidence.

## 8. Preservation, remaining unknowns and B3 recommendation

All existing baseline files/absences, historical reports, manifests, receipts, source hashes, approvals and consumed execution ledgers remain unchanged. The original boundary receipt still hashes to `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`; B2 evidence remains `ff77e3cb8c6bb741e666925405919b027fe9f99e65458a81e942b45ed941b8ab`. The only new repository files are the two test sources, this report and its audit receipt.

The added regression expands the current source inventory relative to the historical B2 readiness list. Its 61 existing entries still hash identically; readiness was not regenerated or represented as current authorization. The new offline fixture is separately hashed in this audit. B2's single-use lock and ledger remain consumed and untouched. No owner execution approval, provider reservation, B3 profile or runnable proposal was created. Existing guard regressions use disposable local unit-test records only.

Unknowns remain: original raw error qualification/rule, exact server effective object and merge order, candidate server acceptance, live effective-setting inheritance and every media-cutoff/revocation question. No new remote absence or configuration attestation is claimed from this offline work.

**Recommended B3 preparation:** start a new immutable proposal and namespace using the complete resolution object as the sole settings delta. Preserve all B2 restrictions, budgets, observation/classifier thresholds and cleanup limits. Validate the new manifest through its own closed contract; include both new test files and all SDK/protocol/runtime sources in fresh provenance; rerun the required offline controls. Review whether bounded diagnostic origin/match qualification should be added before freezing that provenance. Verify exact effective settings in any separately approved fixture and stop on mismatch; do not retry creation automatically.

One future request can establish acceptance of the candidate, but it cannot independently diagnose H1 versus H2. Obtain a precise provider contract or trace if that distinction is necessary; no support message is authorized or sent here. Preparation and eventual provider execution are separate future scopes, with execution requiring explicit owner approval. Keep real calling disabled throughout.

## 9. Final declarations

READY means a typed, serialized, restriction-preserving **candidate for B3 preparation**, with no server acceptance or execution readiness claim. Audit PASS covers the completed offline investigation and explicit evidence limits.

```text
CONNECT_VIDEO_RESOLUTION_AUDIT = PASS
CONNECT_B2_400_ROOT_CAUSE = HYPOTHESIS
CONNECT_B3_REQUEST_CANDIDATE = READY
CONNECT_PROVIDER_CALLS = NONE
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
```

No shared database, Live, production, deployment, build, OTA or calling-enablement change occurred.
