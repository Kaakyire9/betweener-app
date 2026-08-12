# Betweener Live Phase 1 operations

Phase 1 establishes authority and transport boundaries only. It does not expose
a public Live route or enable Live for production users.

## Stream application setup

Create a Stream Video call type named `betweener_live` before device testing.

- Disable recording and HLS for the beta foundation.
- Do not configure ringing, CallKit, persistent background audio, screen share,
  or picture-in-picture.
- Treat Stream roles as transport defaults only. Supabase capabilities remain
  authoritative and the token function applies call-scoped publish permission.
- Never place the Stream secret in Expo environment variables or the client
  bundle.

## Deployment order

From the linked Supabase project:

```powershell
npx.cmd supabase@latest db push
npx.cmd supabase@latest secrets set STREAM_VIDEO_API_KEY=<public-key> STREAM_VIDEO_API_SECRET=<server-secret>
npx.cmd supabase@latest functions deploy live-rtc-token
```

Deploy both Phase 1 migrations before the function. The function requires
`rpc_get_live_rtc_admission` and `rpc_bump_live_rtc_token_rate_limit`.

## Native build requirement

Stream WebRTC is a native dependency. Expo Go and an existing development
client cannot validate it. After Phase 1 is merged, generate fresh iOS and
Android development builds before physical-device testing.

The final iOS native configuration must not contain `audio` in
`UIBackgroundModes`. Betweener Live does not provide persistent background
audio. `remote-notification` may remain for the existing notification system.

## Pre-device checks

```powershell
npm.cmd run test:live-logic
npm.cmd run typecheck
npm.cmd run lint
npx.cmd expo-doctor
```

The public token endpoint must reject:

- unauthenticated users;
- inactive, deleted, incomplete, or unverified accounts;
- users without a valid Live participant record;
- banned, removed, left, or private-spark participants;
- sessions outside `backstage`, `live`, or `ending`;
- callers without `live.join`;
- token requests beyond the server-owned rate limit.

Private Spark will use a separate two-person admission path and shorter token in
a later phase. Do not reuse `live-rtc-token` for it.
