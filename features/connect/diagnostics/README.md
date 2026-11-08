# Staging call trace

The authenticated product composition attaches this console-only observer to the
existing API, controller and native owner. It does not create another calling
client, alter admission, retry requests or add a network/telemetry transport.

In the existing root Expo Metro terminal, filter/copy lines beginning `[Connect]`.
After End and Done on both phones, reload each staging app once to load the code.
Each must print `logging_ready` with its platform and a new temporary run label.
Share the trace from call creation/incoming ringing through final cleanup, or
through the last failed/pending step before reloading. No rebuild or OTA is needed.

Call labels correlate the same canonical call across phones without printing its
UUID. Run/sequence and elapsed time apply only to that local process; they are not
a shared clock. Arguments, account/device identifiers, names, tokens, URLs, raw
errors, media, SDP and provider bodies are excluded. Console breadcrumbs with
this prefix are excluded from Sentry as well. Healthy polling is silent; audio
counters are sampled every ten seconds or when reception/sending status changes.

`native_audio_route` records only the requested, selected and output route types,
route-confirmation status and availability booleans. Device IDs/names never enter
the trace. A selected input/device type and output type can disagree; the existing
route-confirmation checks still decide success, and neither field proves sound.

`microphone_control` records a local request number, `app` or `system` source,
requested mute boolean and `pending`, `confirmed` or `failed` status. Compare it
with `audio_controls` and `flow`: recovery/teardown can force mute without a user
command. A confirmed command is SDK evidence, not a physical microphone test.

`native_fault` identifies the first fatal encryption event using only its closed
event category, track category, local/remote side and owner generation. That first
fault remains in `call_summary` across recovery and Done, with at most four calls
retained in process memory. Raw reasons, user IDs and key material are excluded.
`native_owner.appState` reports the lifecycle snapshot independently of the UI's
foreground flag. These fields diagnose a failed test; they do not certify a fix.

`request_started` without completion identifies an outstanding step. An SDK
release, packet growth or provider acknowledgement does not establish audible
output, hardware shutdown or remote media cutoff. Logging failures never replace
calling results, suppress cleanup or clear ownership. Production/web/release and
incorrect staging identities produce no trace.

`timings` separates credential round-trip, native join, microphone enable and
output confirmation. `firstReceivedPacketMs` is the local observation of the first
positive per-call receiver report; `firstReceiverGrowthMs` is the later confirmed
counter-growth observation. Neither measures when sound first became audible.
Earlier traces used the latter observation for the first-packet metric, so their
3.9–6.6 second readings included reporting delay. The controller now observes the
existing SDK media/stats updates directly, with a tick fallback; it does not
increase RTC stats polling or bypass audio-route confirmation.

`call_summary` records current end authority, SDK leave/resource release, setup and
end timings and packet totals. It updates during cleanup and repeats on Done, the
next call and logger disposal. At most four sanitized summaries remain in process
memory; no file, server or device storage is added. Unknown/pending facts remain
explicit. A reload, truncated paste or missing terminal transport can still lose
evidence: copy both phones' summaries after End before reloading. An old omitted
ending cannot be reconstructed from a later successful call.
