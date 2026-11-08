# Connect V1 call-creation HTTP 400 / code 4 audit

Date: 2026-10-29. Scope: **offline request reconstruction, pinned SDK inspection and local diagnostic repair only**. No Stream application API, Supabase, database, deployment, device or calling-enablement operation was performed.

**Confirmed request defect:** Stage B supplied `frame_recording: { mode: "disabled" }` without the required `capture_interval_in_seconds`. The exact reconstructed request fails the installed SDK 0.7.63 public type contract with TS2741. Adding that one field in a hypothetical offline copy removes the only type error. The approved manifest was not changed.

**Historical HTTP 400 root cause remains a hypothesis.** The missing frame interval is the strongest demonstrated candidate, but the original provider description was discarded. This audit cannot establish which rule the server actually rejected or whether it conditionally ignores a missing interval when recording is disabled. No synthetic response below is evidence of a real provider validation result. M2A and M2B remain BLOCKED.

## 1. Evidence and scope

Read [report 21](21-connect-v1-media-truth-preparation.md), [report 22](22-connect-v1-media-truth-stage-b-results.md), the [original manifest](stream-staging-connect-media-truth-proposal.json), [Stage B evidence](stream-staging-connect-media-truth-stage-b-evidence.json), current provider/runner/bridge, production adapter's request construction, earlier fixture wrapper and retained boundary receipt. The installed SDK was inspected in `%LOCALAPPDATA%/deno/npm/registry.npmjs.org/@stream-io/node-sdk/0.7.63` without upgrading it.

The [offline audit receipt](stream-staging-connect-call-creation-400-audit.json) retains the sanitized reconstructed body, actual SDK serialization result, complete supplied-override matrix, compiler diagnostics, historical-fixture reconstruction and hashes of eight installed SDK source/package/distribution files. Its SHA-256 is `738150ad541898852d023abfc995623bee890c5b7e0ec6d39391a4b571180ae2`.

The consumed approval ledger remains unchanged. This audit issued no approval, reserved no resource and invoked no real provider port. Official documentation was browsed; that is separate from contacting the staging application's authenticated APIs.

## 2. Exact reconstructed request

The permanent offline test extracts the **actual `call.getOrCreate` argument expression** from `scripts/lib/connect-media-truth/provider.mts` using the TypeScript AST. It evaluates only that expression with the unchanged public manifest and synthetic placeholder identities. It never imports or executes the credential-reading provider module. No private Stage B identity is needed in the reconstruction.

Method: **POST**. Host: `video.stream-io-api.com`. Path: `/api/v2/video/call/betweener_connect/<owned-call-id>`. The SDK adds an API-key query parameter and authentication headers; their values are omitted from all diagnostic artifacts.

Before transport serialization, the argument is structurally:

```json
{
  "ring": false,
  "notify": false,
  "data": {
    "created_by_id": "fixture_member_a",
    "members": [
      { "user_id": "fixture_member_a", "role": "connect_voice" },
      { "user_id": "fixture_member_b", "role": "connect_voice" }
    ],
    "custom": {
      "connect_media_truth_21": "synthetic_fixture_marker",
      "media": "voice"
    },
    "settings_override": {
      "limits": { "max_participants": 2, "max_duration_seconds": 60 },
      "audio": {
        "mic_default_on": false,
        "default_device": "earpiece",
        "speaker_default_on": false,
        "access_request_enabled": false
      },
      "video": { "enabled": false, "camera_default_on": false },
      "screensharing": { "enabled": false },
      "recording": { "mode": "disabled" },
      "transcription": { "mode": "disabled", "closed_caption_mode": "disabled" },
      "broadcasting": { "enabled": false },
      "ingress": { "enabled": false },
      "individual_recording": { "mode": "disabled" },
      "raw_recording": { "mode": "disabled" },
      "frame_recording": { "mode": "disabled" },
      "thumbnails": { "enabled": false }
    }
  }
}
```

The creator is the first of the two members, both membership roles are existing `connect_voice`, and both notifications flags are false. `custom` is call data, not a settings object. `settings_override` is correctly nested inside `data`. Stream's official call-level settings example uses this same nesting. [Stream settings API](https://getstream.io/video/docs/api/call-types/settings/).

## 3. Exact installed SDK path and serialization

| Stage | Installed 0.7.63 source | Observed behavior |
|---|---|---|
| Call wrapper | `src/gen/video/CallApi.ts:98` | `getOrCreate` forwards the argument plus the Call object's `type` and `id` |
| Generated API | `src/gen/video/VideoApi.ts:275` | Builds POST path parameters and a body containing `members_limit`, `notify`, `ring`, `video`, `data` |
| HTTP client | `src/ApiClient.ts:54` | Uses ordinary `JSON.stringify(body)`; no recursive request validator or default-filling encoder |
| Error parser | `src/ApiClient.ts:81` | Parses error JSON, builds `StreamError` from message, metadata and code |
| Error class | `src/types.ts:24` | Stores message, metadata and code; does not store the raw APIError envelope |
| Request contract | `src/gen/models/index.ts:11780`, public `dist/index.d.ts` | Frame settings require both interval and mode |

The real pinned distribution was executed with **synthetic credentials**, a replaced `globalThis.fetch`, cached-only dependency resolution and Deno **`--deny-net`**. The fake transport captured one POST; the captured body is deep-equal to the reconstructed argument. No native network transport was called, and no environment credential file was readable by the fixture's declared read permission.

Generated top-level `members_limit` and `video` values are undefined and disappear during JSON serialization. `type` and `id` become path parameters. All supplied false values, strings, roles, custom data and nested overrides survive. In particular, the SDK does **not** insert `frame_recording.capture_interval_in_seconds`, video resolution or any other missing nested default. There are no explicit null values in the original body; relevant optional request fields are not declared as nullable in the strict installed contract.

The static interfaces are erased at runtime. The provider obtains its manifest from `JSON.parse` through a CommonJS helper with unchecked JavaScript; `settings_override` therefore reaches the call site as `any`. The earlier Deno compiler check could pass despite the missing required nested field. The new test reconstructs a contextual `GetOrCreateCallRequest` literal against the **public installed declarations**, exposing that gap without changing runtime authorization or the request.

## 4. Complete field-validation matrix

The matrix covers all **18 supplied override leaves** and the missing mandatory sibling. "Ruled out" here means ruled out as an unsupported SDK field, incorrect TypeScript primitive or invalid SDK enum; it does not establish acceptance by every server-side conditional rule. Requiredness comes from the installed declarations. Documentation separately constrains frame capture intervals to 2-60 seconds and duration to nonnegative integers. [Stream settings schema](https://getstream.io/video/docs/api/call-types/settings/).

| Override path | Supplied value | Installed contract / dependency | Finding |
|---|---|---|---|
| `limits.max_participants` | `2` | Optional number; no nested required sibling | Ruled out as SDK type error; same value in successful fixtures |
| `limits.max_duration_seconds` | `60` | Optional number; documented integer >= 0 | Ruled out as unsupported value alone; retained earlier timer calls used 60 |
| `audio.default_device` | `earpiece` | Required when audio object supplied; enum `speaker` / `earpiece` | Ruled out as invalid enum or missing mandatory audio field |
| `audio.speaker_default_on` | `false` | Optional boolean | Ruled out as SDK type error |
| `audio.mic_default_on` | `false` | Optional boolean | Ruled out as SDK type error |
| `audio.access_request_enabled` | `false` | Optional boolean | Ruled out as SDK type error |
| `video.enabled` | `false` | Optional boolean | Ruled out as SDK type error; same value in earlier voice fixtures |
| `video.camera_default_on` | `false` | Optional boolean | Ruled out as SDK type error; same value in earlier fixtures |
| `screensharing.enabled` | `false` | Optional boolean; target resolution optional | Ruled out as SDK type error or incomplete object under SDK contract |
| `recording.mode` | `disabled` | Required mode enum; quality/audio/layout optional | Ruled out as invalid enum or missing required recording sibling |
| `transcription.mode` | `disabled` | Optional mode enum | Ruled out as invalid enum |
| `transcription.closed_caption_mode` | `disabled` | Optional mode enum; language/translation optional | Ruled out as invalid enum or incomplete SDK object |
| `individual_recording.mode` | `disabled` | Required mode; output types optional | Ruled out as invalid enum or missing required sibling |
| `raw_recording.mode` | `disabled` | Required mode; audio-only optional | Ruled out as invalid enum or incomplete SDK object |
| `frame_recording.mode` | `disabled` | Valid required mode **but object also requires interval** | Mode itself valid; supplied object is incomplete |
| `frame_recording.capture_interval_in_seconds` | **Absent** | **Required number; documented integer 2-60** | **Confirmed request-contract defect; plausible actual HTTP 400 cause** |
| `thumbnails.enabled` | `false` | Optional boolean | Ruled out as SDK type error |
| `ingress.enabled` | `false` | Optional boolean; encoding objects optional | Ruled out as SDK type error or missing mandatory sibling |
| `broadcasting.enabled` | `false` | Optional boolean; HLS/RTMP objects optional | Ruled out as SDK type error; omitted HLS/RTMP do not instantiate incomplete objects |

Every supplied group exists in `CallSettingsRequest`; there is no confirmed unsupported per-call field. Raw recording per-call overrides are also explicitly documented. [Stream raw recording settings](https://getstream.io/video/docs/api/recording/raw/).

Other structural checks:

| Field / condition | Result and limit |
|---|---|
| `ring=false`, `notify=false` | Valid optional booleans and same values as earlier successful owned fixtures |
| `created_by_id` | Optional string, supplied as an existing newly created member; no SDK requirement for a third creator |
| `members[].user_id` / `.role` | Required user-ID string and optional role string; both IDs exist before creation; retained Stage B preflight verified configured roles |
| Creator also a member | No SDK prohibition or retained evidence of a conflict; provider-specific semantic rejection remains unproved |
| `custom` marker/media | Valid arbitrary call custom data; no key collision with request envelope |
| Omitted `video.target_resolution` | Optional object in the installed request contract; if supplied, height and width are required. Its absence is not a confirmed schema error |
| Disabled audio/video/screen features | Supplied values do not contradict one another under SDK types; no documented incompatible combination found |
| Call-type restriction | Stage B's effective policy preflight passed and cleanup hash matched; no known policy mismatch. This does not eliminate an undocumented server rule |
| Authentication | Historical code 4 is an input-error classification, not proof of which input was wrong; no token content was inspected here |

Stream documents HTTP 400 / code 4 as an input error. It does not uniquely identify a field. [Stream API error codes](https://getstream.io/docs/platform/api-error-codes/).

## 5. Earlier successful fixtures and smallest demonstrated defect

The earlier boundary fixture's creation argument was reconstructed offline from the current adapter and wrapper source. Retained report 18/boundary evidence establishes earlier successful calls with 60-second timers. This is **source reconstruction plus retained success**, not an original HTTP-body capture or a fresh provider test; no immutable historical harness-at-run hash is available.

| Property | Earlier timer fixture | Failed Media Truth fixture |
|---|---|---|
| Call type / SDK | `betweener_connect`, server SDK 0.7.63 | Same |
| Ring / notify | Both false | Same |
| Limits override | Two participants, 60 seconds | Same |
| Creator | Third isolated fixture identity | First of the two fixture members |
| Initial member roles | `connect_invited`, promoted after application admission | `connect_voice` at creation |
| Video override | Disabled/camera off, explicit 640x480/600000 target resolution | Disabled/camera off, optional resolution omitted |
| Additional disabled feature objects | Inherited from verified call type | Explicitly supplied in override |
| Frame-recording object in override | **Absent**, inherited complete configuration | **Present with mode only**, required interval absent |
| Public SDK type check | Pass | One error, TS2741 |

The smallest **independently demonstrated request invalidity** is one absent scalar: adding `capture_interval_in_seconds: 2` to a hypothetical copy produces zero SDK type errors while leaving mode disabled and every other value unchanged. This does not prove that a real call would succeed or authorize that change to the manifest. No candidate request was submitted to Stream.

Remaining hypotheses, in order: missing frame interval; an unrecorded backend conditional/semantic validation of another newly explicit object; creator/member-role semantics; or an undocumented call-type constraint. The latter three have no confirmed defect in this audit. Wrong nesting, loss of false values, SDK insertion of hidden defaults and invalid `earpiece`/`disabled` enums are ruled out by source and the offline serialization/type tests.

## 6. Exact diagnostic-loss chain and local repair

| Boundary | Historical loss | Local correction / limit |
|---|---|---|
| HTTP error -> SDK | SDK keeps `message`, status metadata and code; **drops `exception_fields`, `details`, `more_info` and raw envelope** | Bounded projection from a response clone before the SDK consumes it |
| SDK -> Deno port | Shared `safeError` retains only status/code. The machine-reason regex rejects a normal descriptive Stream message and substitutes `provider_operation_failed` | Diagnostic-only module extracts allowlisted known paths and finite rule hints; shared helper untouched |
| Deno -> JSON bridge | Bridge admits status/code/reason/stage/timing only, with no validation-detail channel | Bridge independently reprojects the new bounded diagnostic object |
| Bridge -> runner/report | Parent persists that reduced `safeError`; missing text cannot be recovered afterward | Existing evidence path now retains safe projection; product errors unchanged |

The offline SDK fixture returns an explicitly **synthetic HTTP 400** containing a known field and `exception_fields`. The real SDK preserves its descriptive message but loses `exception_fields`; the new pre-SDK capture preserves the known field/hint. A separate real JSON-child-bridge test proves those projected details reach the parent experiment's incomplete receipt. Neither fixture reads real credentials or sends network traffic.

Only safe local diagnostic deficiencies were repaired:

- New `scripts/lib/connect-media-truth/provider-diagnostics.cjs` allows status/code, capture-state enum, at most 32 known schema paths, finite rule-hint labels and `textOmitted=true`.
- Arbitrary provider prose, supplied values, unknown fields, identities, tokens, secrets, headers, SDP and URLs are **never emitted**. Qualified identity field names can be recognized; bare identity values/keys do not become diagnostic text.
- Error-body capture uses a clone, a **32 KiB** limit and **250 ms** deadline. Malformed, oversized, stalled or unreadable bodies produce explicit bounded capture states. The original response remains available to the SDK, verified by regression.
- `provider.mts` records this projection for non-success responses and emits it with the existing safe error. Header-receipt timing is recorded before diagnostic parsing. Successful responses are not cloned or parsed by this addition.
- `process.cjs` independently removes unknown diagnostic fields. Existing reason/status handling, stderr suppression, ownership, approval, creation/retry limits and product-facing error behavior remain unchanged.

Rule labels are **hints**, not verbatim provider assertions or an association between every field and every rule in a complex message. Unknown field names/formats are deliberately omitted. This is why diagnostics are CONDITIONAL_PASS rather than a guarantee that every future provider error is fully explained. The original Stage B description remains unrecoverable from retained artifacts.

## 7. Local regression and compiler results

Logs are under `tmp/connect-media-truth-22a/`. No browser media, SQL/security database driver or provider experiment was run.

| Check | Fresh result |
|---|---|
| New diagnostic/redaction/response-boundary/child-bridge tests | **16/16 PASS** |
| New AST reconstruction, public SDK types, earlier fixture and actual SDK fake-fetch tests | **5/5 PASS** |
| Existing offline Connect/media/relationship regressions | **172/172 PASS** |
| Combined final offline run | **193/193 PASS**, `offline-final.log` |
| Exact request against public pinned declarations | **Expected TS2741** for missing frame interval; no other errors |
| Hypothetical single-field copy / earlier fixture against same declarations | **Zero errors**; no request changes applied |
| Pinned SDK runtime serialization/error probe | **PASS**, Deno 2.5.4, cached-only, `--deny-net`, fake fetch only |
| Strict Deno check: provider and offline SDK fixture | **2/2 PASS**, `--no-remote --deny-import`; compilation only |
| Targeted ESLint | **PASS**, zero warnings, including `.mts` using the existing temporary TypeScript lint extension |
| Expo TypeScript `tsc -p tsconfig.json --noEmit` | **PASS**, exit 0 |

The synthetic 400 response tests the SDK/diagnostic path, **not a reconstructed server validator**. The real SDK does not reject this shape locally before transport. Thus no genuine provider HTTP 400 was reproduced offline; the request-contract failure was reproduced precisely at type-check time.

## 8. Preservation and minimum safe next action

Of **256 baseline files/absences**, **254 remain unchanged**. Only existing `scripts/lib/connect-media-truth/provider.mts` and `process.cjs` changed, for diagnostics. Six files were added: the diagnostic module, two regression files, an offline SDK fixture, this report and its JSON audit receipt. No request-building expression, setting, SDK version, product authorization, migration, Live file or existing report was changed.

All eight separately protected files are unchanged: consumed ledger, original runner evidence, cleanup receipt/slot, approval record, original manifest, tracked Stage B evidence and original boundary receipt. The manifest remains SHA-256 `7ba4fb47c2a6008c30a19cd19e5edac35729e7165ba3b406b6d71ff86086f957`. The original boundary receipt remains `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`.

The diagnostic source change intentionally makes the historical Stage A readiness hashes stale: the two changed files no longer match and the source inventory now includes the new diagnostic module. **Readiness was not regenerated or falsely marked current.** The existing guard therefore rejects reuse of that preparation. The consumed execution ledger was not reset or modified.

The minimum next action is to prepare a separately reviewed request/manifest that satisfies the confirmed frame-settings contract while retaining every disabled capability, and refresh its complete provenance and offline controls. Keep the backend rejection cause explicitly unconfirmed unless original provider-side validation evidence becomes available. A future real-provider run requires **a new manifest, fresh preparation and separate explicit owner approval**; none was created or requested here. Do not reuse the consumed ledger, strip safety settings blindly, or treat a successful future setup as proof of media cutoff.

## 9. Final declarations

PASS for request audit means the requested offline review was completed, not that the original request is valid. Root-cause HYPOTHESIS identifies the confirmed missing-field defect as the leading candidate, without claiming the historical server rule is known.

```text
CONNECT_CREATE_REQUEST_AUDIT = PASS
CONNECT_CREATE_400_ROOT_CAUSE = HYPOTHESIS
CONNECT_ERROR_DIAGNOSTICS = CONDITIONAL_PASS
CONNECT_PROVIDER_CALLS = NONE
CONNECT_SHARED_CONFIG_CHANGES = NONE
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
```

No Supabase access, shared database modification, production modification, new approval or external fixture occurred. Earlier cleanup remains retained historical evidence, not a new provider absence attestation.
