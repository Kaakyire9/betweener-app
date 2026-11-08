# Audio calling presentation

Owner-authorised local UI implementation, 2026-11-04. This is not a build, deployment, calling reliability result or security release approval.

The audio lobby, outgoing/incoming invitation, connecting, active, reconnecting and terminal screens now use the approved mockup direction: cream serif participant name, teal/lilac portrait halo, subtle lifecycle aura, glass control tray and the existing `ChatBackground` artwork. The shared wallpaper retains light/dark artwork selection with a dark readability overlay; chat itself is unchanged. Primary Answer, End and Done controls remain fixed while portrait and optional details can scroll on smaller phones. Duration is shown only for existing connected/terminal evidence.

The optional `VoicePeer.photos` field comes from the existing authenticated, bearer-pinned profile lookup. There is no additional lookup, library permission or media acquisition. Existing account-epoch and call-generation fences remain in charge. Gallery URLs are bounded to six unique HTTPS URLs without embedded credentials, with avatar first. Invalid/failed images fall through to available photos and then initials. Image loading is asynchronous and is not awaited by audio setup.

Calling/ringing photos stay static. An active conversation offers manual horizontal swipes and accessible Previous/Next controls. Optional Auto crossfades every eight seconds. Touching or navigating a photo pauses Auto until explicitly resumed. Ending, failure, reconnecting, background, hidden/minimized screen, reduced motion, screen reader activation and unmount stop automatic rotation. Visual motion defaults off until accessibility preferences resolve. No audio levels or fabricated speech waveform are used.

The production adjustments remain explicit: one-to-one controls only; Mute/Unmute reflect this device's actual state; lifecycle decoration does not claim speech activity; OS incoming-call presentation and native ownership are preserved. Existing consent, permission, encryption evidence, conversation prompts, blocking confirmation, call details, local cleanup and terminal-dismissal gates remain available. Messages during a call still use the existing guarded Return to chat/minimize flow. Unsupported reminder, group-participant and redial actions are not presented as working buttons.

Verification covers offline logic, component behavior, source integrity, TypeScript and lint. The isolated web visual fixture imports presentation and fixture state only; it does not load Auth, controller, participant credentials or calling SDK. The images in that fixture are illustrative. Its browser rendering is not evidence of native audio, carousel gesture performance, Android activation, physical shutdown or encryption enforcement.

The earlier native activation failure still needs the separately scoped foreground physical-device retest. No provider configuration, feature gate, frozen proposal, consumed experiment ledger, backend, native calling source or dependency was changed for this UI.

Source chain: `connect-audio-call-ui.local.json`. Local validation artifacts and before snapshots: `tmp/connect-secure-calling/audio-call-ui/`.
