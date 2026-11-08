# Connect video — staging development testing

Video uses the existing authenticated services, `VoiceController` lifecycle,
native owner, exclusive Live/Connect lease, End Call & Block, and server RPCs.
The historical name `VoiceController` now covers both media types; there is no
second calling client, issuer, cleanup worker or consent model.

The owner authorised staging deployment and activation on 2026-11-02. Both
internal video gates are enabled only for the verified native staging development
identity. The global feature defaults remain off. Production, web, release builds
and another Supabase target cannot compose this runtime. Route parameters and
consent-shaped claims cannot supply server media authority.

Start/Accept prepares camera permission before native join. Permission denial
allows an audio-only conversation. In-call checks never request permission or
open a system dialog. Accept/join never starts the camera; the user must press
**Turn camera on**. Camera controls cannot upgrade a voice session. Refresh must
retain call, account and media identity. Setup backgrounding, ordinary navigation
and Auth retirement stop the owner; foreground never restores a retired capture.
An active call may explicitly opt into native audio continuation as described below.

The native composition owns lifecycle events from construction, including pending
create/Accept/credential requests before the SDK exists. Actual background cancels
owned setup; inactive permission UI pauses setup until foreground revalidation.
Unanswered incoming invitations are not automatically declined. A hung mute
operation cannot delay local retirement or authoritative End.

Views use the call-bound SDK `StreamCallProvider`, theme and participant component
with `NativeVideoRenderer`. The renderer requests only that participant's camera
track. It does not mount the SDK's push, screenshot, PiP, automatic resume or
background-call providers. SDK/native observations remain separate from physical
sensor shutdown and remote media enforcement.

Preferences govern incoming invitations. Starting a call is the initiator's
explicit action; the recipient still approves acceptance, with media-specific
match/Intent authority validated by the server. Voice never grants video.

`20261102151043_connect_media_preference_updates.sql` was applied only to
`betweener-staging / xsgzxadwuxuziubglvps`. It adds atomic per-media updates,
rejects stale legacy video opt-in replays, and queues existing durable cleanup
on withdrawal. It changes no calling flags. The video path requires the new RPC
and has no legacy pair-write fallback.

`20261102165936_connect_staging_video_testing.sql` removes the old voice-only
restriction from open **staging** testing while retaining the staging-only
constraint. Existing match, media consent, blocking and atomic budget checks
remain unchanged. Staging `video_enabled=true` was separately read back after
both migrations. The existing open scope and 95 remaining slots were preserved;
no budget refill, account change or consent write was performed. Pre-match,
notifications and End Call & Block activation remain unchanged (off).

The existing deployed credential adapter already uses `connect_video` and
per-call video overrides, with camera default off. The current provider policy
passed a read-only comparison; no Edge deployment or provider policy edit was
needed. Shared push revision 28 and the five-second cleanup schedule are retained.

For owner-operated testing, load current root Metro JS in both staging clients,
enable video invitations through each account's own Intent preferences and use
the chat camera button. Accept first; explicitly turn each camera on afterward.
Rollback disables only `video_enabled` and both internal video gates. Keep the
forward-only migrations, pending end jobs and scheduled cleanup worker intact;
disabling admission does not itself stop existing media.

No new native dependency was added. Existing binaries still need device proof of
camera permission, preview, remote video, switching, audio routing and shutdown.
Background incoming video/push is outside this foreground milestone; the existing
voice-only push contract is preserved. M2A/M2B remain blocked; remote revocation
remains unverified.

## Background calls and provider termination work

Current local staging-development JS offers an explicit **Continue audio in
background** control only after canonical ACTIVE admission. It requires the
existing Callingx setup, exact tracked call and Android notification capability;
otherwise foreground calling remains available. The existing native event
dispatcher receives only the already Auth-bound Connect client, under the
exclusive Live/Connect lease. No background client or token provider is created.
System End/hold retires that owner; system mute is call-bound. Account/epoch and
terminal fences still apply. Camera stops on lock and is never automatically
restored. This is local implementation evidence, pending physical lock/unlock,
OS mute/End and permission checks on each installed binary.

Native locked-screen incoming/terminated-app ringing is still unimplemented.
No VoIP push or new entitlement/configuration is installed here. Ordinary Back
still ends a call. Explicit **Return to chat** keeps a foreground call in its
existing owner, turns video capture off, and exposes a return/End banner.

The local server adapter now requires a fresh authenticated, exact type/ID
`ended_at` readback or scoped confirmed absence after End before acknowledging
durable cleanup. An ACK followed by active/unknown provider state, a failed read,
or a session-only end stays retryable. This is a new undeployed source delta;
historical package manifests and retained snapshots are untouched. Current
deployable source now differs and must be reviewed and pinned again before any
deployment; this turn does not change installed sources.
No SQL migration or Stream policy change is introduced by this patch.

The local worker now drains at most four leased jobs sequentially per invocation,
with a seven-second soft claim budget. Existing SQL retains leasing, priorities,
backoff and authority. An ambiguous completion stops the batch; `{processed:false}`
is preserved when no work exists. This worker change is also undeployed. Neither
the five-second hosted schedule nor any calling gate was changed.

Privacy/quality additions disclose the staging E2EE status before calling, show
fresh transport-quality estimates, and offer a camera-off lower-resolution setting.
There is still no installed E2EE key agent; no encryption assurance is added.
Recent history distinguishes voice/video and expands a bounded recent window.
Seamless reconnection remains fail-closed pending renewed-authority integration.

For a separately authorised two-phone test, record canonical call/generation,
end/revocation commit, end-job lease/retries, provider ACK and fresh readback, plus
each phone's last received audio/video and OS capture indicators. Exercise End,
block/consent withdrawal, lock/background, network loss and recovery separately.
Provider outage must preserve terminal authority and pending cleanup; leave the
worker running after admission is disabled. Do not include tokens or raw provider
responses in logs. Cooperative phone silence and provider `ended_at` are distinct
from a held-token/hostile-peer revocation guarantee; that requires its own approved
bounded experiment. JWT expiry and disabled admission do not establish RTP cutoff.

References: [native background integration](https://getstream.io/video/docs/react-native/guides/keeping-call-alive/),
[native incoming calls](https://getstream.io/video/docs/react-native/advanced/incoming-calls/ringing-setup/expo/),
[provider call lifecycle](https://getstream.io/video/docs/api/call-lifecycle/).
