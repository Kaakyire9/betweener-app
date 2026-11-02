# Connect video — local implementation, disabled

Video uses the existing authenticated services, `VoiceController` lifecycle,
native owner, exclusive Live/Connect lease, End Call & Block, and server RPCs.
The historical name `VoiceController` now covers both media types; there is no
second calling client, issuer, cleanup worker or consent model.

The app's reviewed defaults still return `video: false`. `videoCalling` defaults
to false. Runtime activation needs both explicit internal video gates and the
verified native staging identity; route parameters or consent-shaped claims
cannot activate it or supply server media authority.
No hosted gates, roles, budgets, accounts, credentials or deployments were changed.

Start/Accept prepares camera permission before native join. Permission denial
allows an audio-only conversation. In-call checks never request permission or
open a system dialog. Accept/join never starts the camera; the user must press
**Turn camera on**. Camera controls cannot upgrade a voice session. Refresh must
retain call, account and media identity. Background, navigation and Auth retirement
stop the owner; foreground never restores a retired capture.

Views use the call-bound SDK `StreamCallProvider`, theme and participant component
with `NativeVideoRenderer`. The renderer requests only that participant's camera
track. It does not mount the SDK's push, screenshot, PiP, automatic resume or
background-call providers. SDK/native observations remain separate from physical
sensor shutdown and remote media enforcement.

Preferences govern incoming invitations. Starting a call is the initiator's
explicit action; the recipient still approves acceptance, with media-specific
match/Intent authority validated by the server. Voice never grants video.

`20261102151043_connect_media_preference_updates.sql` is a separate **unapplied**
proposal, outside the frozen Scope A package. It adds atomic per-media updates,
rejects stale legacy video opt-in replays, and queues existing durable cleanup
on withdrawal. It changes no calling flags. The old installed voice path remains
available while video is off. The video path requires the new RPC and has no
legacy pair-write fallback.

Before real video testing: owner approval for the staged SQL patch, verification
of the existing `betweener_connect` video role/settings, explicitly reviewed
staging activation and call budget, then a supervised voice-first two-device run.
No new native dependency was added. Existing binaries still need device proof of
camera permission, preview, remote video, switching, audio routing and shutdown.
Background incoming video/push is outside this foreground milestone; the existing
voice-only push contract is preserved. M2A/M2B remain blocked; remote revocation
remains unverified.
