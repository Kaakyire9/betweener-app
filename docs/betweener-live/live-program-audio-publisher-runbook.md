# Betweener Live — Programme Audio Publisher Runbook

## Outcome

Programme Music is published once into the Stream call by an always-on worker. Mobile and Studio clients only control the authoritative Supabase music state and listen to the resulting Stream audio. They do not play a second local copy.

This removes the phone audio-session conflict that caused muted-microphone warnings and removes the multi-device echo created by independent catalogue players.

## Runtime architecture

1. The Host selects Play, Pause, Duck, volume, Next or Repeat in the app or Studio.
2. Supabase updates `live_music_session_state` and increments its version.
3. One worker claims the session through `live-program-audio-publisher`.
4. The Edge Function validates policy and licensing, signs the private track briefly, and issues a least-privilege Stream RTMP identity.
5. The worker downloads the approved file into isolated ephemeral storage and publishes one audio-only AAC programme feed over RTMP.
6. Every phone hears that same hidden `studio-program-audio-*` participant through the normal call mix. It is excluded from public stage tiles and attendance counts.
7. Duck and volume use FFmpeg's local ZeroMQ filter control and do not restart the Stream feed.
8. Lease generations fence stale workers. The existing database maintenance clock releases dead publishers for failover.

## Audience Music stage

The mobile Host can select **Show music on stage** after starting an approved track. This changes only the public Stage region to the visual-only Betweener Music canvas. The Live header, Room Pulse and footer remain available, and the Host microphone stays connected for introductions. Use **Duck** while speaking.

The exact previous scene, canvas and source assignments are saved server-side. **Return people to stage**, Stop, natural track completion and policy-driven audio shutdown restore that state without reconnecting participants. A phone cannot take this scene while Betweener Studio holds a valid controller lease; disconnect Studio first or use Studio Preview → TAKE.

The worker is not an Edge Function or a Vercel request. It is a persistent container because media publishing is a continuous process.

## Deploy safely

Generate one random secret of at least 32 characters. Store the same value in Supabase Edge Function secrets and the worker platform. Do not put it in `.env` files committed to Git.

```powershell
$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($bytes)
} finally {
  $rng.Dispose()
}
$workerToken = [Convert]::ToBase64String($bytes)
if ($workerToken -eq ('A' * 64)) {
  throw 'Secure token generation failed; do not deploy this value.'
}
$secretFile = Join-Path ([IO.Path]::GetTempPath()) ("betweener-program-audio-" + [Guid]::NewGuid().ToString('N') + '.env')
[IO.File]::WriteAllText(
  $secretFile,
  "PROGRAM_AUDIO_WORKER_TOKEN=$workerToken",
  (New-Object Text.UTF8Encoding($false))
)
try {
  npx.cmd supabase@latest secrets set --env-file $secretFile --project-ref jbyblhithbqwojhwlenv
} finally {
  Remove-Item -LiteralPath $secretFile -Force
  [Array]::Clear($bytes, 0, $bytes.Length)
}
```

If token generation throws, stop there. Never run `secrets set` with the
unchanged zero-filled byte array. Store `$workerToken` in the worker platform's
secret manager, then clear the shell variable with `$workerToken = $null`.

Deploy the database and the worker-only Edge Function. JWT verification is intentionally disabled at the gateway because this endpoint authenticates a private worker header with constant-time comparison; it accepts no browser or user token.

```powershell
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest functions deploy live-program-audio-publisher --no-verify-jwt
```

Build the worker container from the repository root:

```powershell
docker build -f apps/program-audio-worker/Dockerfile -t betweener-program-audio:10g .
```

Deploy it to an always-on container service with:

- `SUPABASE_URL=https://jbyblhithbqwojhwlenv.supabase.co`
- `PROGRAM_AUDIO_WORKER_TOKEN=<the same secret>`
- `PROGRAM_AUDIO_MAX_SESSIONS=25`
- minimum instances `1`
- scale-to-zero disabled
- outbound HTTPS and RTMPS allowed
- health check `GET /healthz` on port `8080`

The Stream secret and Supabase service-role key remain only inside the Edge Function. The media worker receives neither.

## Activate after the worker is healthy

Confirm `/healthz` returns HTTP 200, then run in the Supabase SQL editor:

```sql
update public.live_odo_configuration
set program_audio_publisher_enabled = true
where id = true;
```

Run the health gate:

```powershell
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10g_health.sql
```

## Device acceptance test

Use one Host phone and at least two Guest phones. Headphones are required on all devices in the same physical room.

1. Start a fresh Live and join all phones.
2. Play an approved track from the Host app. Confirm one `system:programme_audio` source becomes `live / healthy`.
3. Confirm all phones hear the same Stream feed and no phone logs local programme playback.
4. Speak from Host and Guest microphones. Confirm speech remains clear and there is no echo loop.
5. Tap Duck and Unduck. Confirm gain changes smoothly without the track restarting.
6. Change 15%, 28% and 40% levels. Confirm the feed stays connected.
7. Test Repeat 1 through a track boundary, then Repeat All through a playlist boundary.
8. Pause, resume and stop. Confirm stop ends the hidden source and microphones remain usable.
9. Kill the worker during playback. Within one lease window the source must become lost; after another worker claims it, playback resumes from the authoritative offset.
10. End the Live. Confirm the worker releases the publisher and no RTMP process remains.

## Rollback

Disable the feature flag first. The worker discovers its owned sessions as `stopped`, terminates each exact FFmpeg child and releases its leases. Legacy playback remains denied in the current app build, preventing echo during rollback.

```sql
update public.live_odo_configuration
set program_audio_publisher_enabled = false
where id = true;
```

Then stop the worker deployment. Leave the migration and audit tables in place.
