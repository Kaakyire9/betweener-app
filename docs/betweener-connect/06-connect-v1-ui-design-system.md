# Connect V1 UI design system

Status: **proposed; no call screens, controls, Aura or chat actions implemented**.

## Existing tokens and components

Use `constants/theme.ts` and `useColorScheme` rather than hardcoding the brief's
aspirational palette. Current light tokens: background `#F3E5D8`, subtle surface
`#F7ECE2`, text `#1F2A2A`, tint `#008080`, accent `#7D5BA6`. Dark tokens:
background `#0F1A1A`, surface `#152222`, text `#E8F0ED`, tint `#00A0A0`,
accent `#9B7CC8`. Validate contrast on the final control surfaces.

Reuse safe-area-context, responsive metrics, Expo Image, display-name/image URI
helpers, SVG, Reanimated and existing icon/alert components. Extract modular
`ConnectHeaderActions`, `ConnectStatus`, `ConnectControls`, `ConnectionAura`,
`ConnectParticipantAvatar` and `ConnectLocalPreview` components. Keep policy,
navigation, SDK transport and presentation in separate modules.

## Proposed surfaces

| Surface | Behavior |
| --- | --- |
| Outgoing | Peer avatar/name, voice/video type, actual requested/ringing state, cancel. Never label setup as connected. |
| Incoming foreground | Caller identity, type, accept/decline; coordinate ownership with native presentation. No camera capture before the local user's explicit action. |
| Voice active | Calm theme-aware background, centered avatar/name, honest status/duration, compact mute/route/video/end controls. Initialize audio-only with camera off. |
| Video active | Remote video fills the available canvas without stretching; safe-area header and compact controls; bounded movable local preview with camera-off fallback. |
| Reconnecting/error | Clear text and recoverable action, preserving audio where possible. Expose denied-permission guidance without claiming connectivity. |
| History | Participant-only direction/type/timestamp/outcome; connected duration only when authoritative. Server records, never fabricated optimistic chat messages. |
| Intent preferences | Voice/video unchecked by default; explain that the recipient decides access. Recipient approvals are separate, media-specific, bounded by the request and revocable. |

Voice-to-video requires local user interaction plus server permission for that
media. The recipient's camera remains under their own control. Camera off should
preserve audio; distinguish negotiated permission from current camera state.
Audio-route controls reflect actual available SDK/native routes, including
Bluetooth, rather than showing a decorative selected speaker state.

Preview dragging must clamp against current safe areas, header and controls,
recalculate on rotation/window changes, and expose accessible repositioning
actions. Default placement should avoid the remote face when feasible without
adding a face-tracking dependency. Mirror only the appropriate local camera.

## Connection Aura and accessibility

Use a small ambient teal/accent ring for setup/ringing/reconnecting, driven by
real lifecycle state. Use activity data only if the installed SDK provides a
verified audio-level source; otherwise describe the ring as decorative. No random
waveform presented as microphone or connectivity evidence.

Respect reduced motion, pause loops when backgrounded or the screen is hidden,
and stop them at terminal state. A static ring and text status must convey all
essential information. Profile on lower-end Android before asserting frame-rate
or battery targets were met.

Use at least 48dp control hit areas, clear mic/camera state labels, screen-reader
status announcements at meaningful transitions, scalable text, visible focus and
text/icons in addition to color. Avoid announcing the duration every second.
Contextual permission prompts should explain the action being requested. No
accessibility, performance or physical-device pass is claimed at M0.
