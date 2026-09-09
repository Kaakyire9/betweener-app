# Odo Show Director — Phase 10E

## Boundary

Phase 10E adds a public presentation layer above the existing Live and Quick
Connect engines. Odo Show Director may pace predefined scenes, low-liquidity
Odo Stage moments, bounded intermissions, energy presentation, and approved
music intent. It cannot choose a pair, alter consent, inspect private
conversation content, issue RTC credentials, moderate, or start/end the parent
Live. AutoMatcher and the existing Quick Connect lifecycle remain authoritative.

Music is not an Odo or LLM capability. The separate Music Engine consumes
strict server state backed by a private approved catalogue. No arbitrary URL,
Spotify/Apple Music/YouTube rebroadcast, private Spark music, Odo voice, screen
share, or full Studio product is enabled by this phase.

The architecture decision record is in
[Phase 10D to 10E audit](./odo-show-director-phase10e-audit.md).

## Current audio limitation

The current mobile Stream publisher path does not expose a safe cross-platform
program mixer. Near-term playback is therefore synchronized on eligible
main-room audience devices only:

- Host and stage publisher devices do not locally play program music.
- Active Quick Connect and Private Spark participants do not receive music.
- A service function selects the active approved storage path and returns a
  short-lived signed playback grant; the caller cannot request a path or URL.
- Music/storage failure leaves Live, RTC, AutoMatcher, and Odo direction running.

Host-speech ducking cannot be validated on this delivery path because the Host
does not play the local program track. Active private conversations are a hard
duck/deny boundary. A future Betweener Studio mixer will publish one mixed
program feed and implement reliable Host-speech attack/release ducking.

## Deployment

From the linked project root:

```powershell
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest functions deploy live-odo-show-director
npx.cmd supabase@latest functions deploy live-music-playback
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10e_health.sql
```

Deploy the mobile build only after the two migrations and Edge Functions are
available. Require `release_blockers = 0` and `healthy = true` before any flag
change. The Show Director worker does not call OpenAI and needs no new model
secret. The music worker uses Supabase platform credentials and private Storage.

## Internal rollout

Use a fresh Betweener admin access token. Do not use the database password or
Supabase Dashboard password, and never paste credentials into source control or
support messages. The Host must remain on the existing Phase 10C allowlist.

First enable Show Director without music:

```powershell
$showBody = @{
  p_patch = @{
    showDirectorEnabled = $true
    internalOnly = $true
    musicEnabled = $false
    musicAutoEnabled = $false
    musicDuckingEnabled = $false
    intermissionEnabled = $true
    energyModeEnabled = $true
    studioEnabled = $false
    studioControlEnabled = $false
    sceneMinimumDwellSeconds = 20
    hostSuppressionSeconds = 45
    intermissionEveryRounds = 3
    reconcileSeconds = 15
    musicDefaultVolume = 0.28
    musicDuckedVolume = 0.12
  }
} | ConvertTo-Json -Depth 5

$showRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_show_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $showBody
}

Invoke-RestMethod @showRequest | ConvertTo-Json -Depth 8
```

`odoVoiceEnabled` and `screenShareEnabled` must remain `false`. They are hard
database constraints, not rollout options.

### Add approved programme music

No music is seeded. The catalogue must remain empty until Betweener has
documented rights for the intended territories.

1. Upload an owned/licensed audio file in the Supabase Dashboard to the private
   `live-program-music` bucket. Use a repository-independent path such as
   `programme/2026/warm-opening-01.m4a`; never use an external URL.
2. Record the licence reference and expiry outside the app, then register the
   exact storage path through the admin RPC:

```powershell
$trackId = [guid]::NewGuid().ToString()
$trackBody = @{
  p_track_id = $trackId
  p_title = 'Warm Opening 01'
  p_artist = 'Betweener Licensed Catalogue'
  p_storage_path = 'programme/2026/warm-opening-01.m4a'
  p_mood = 'warm'
  p_duration_seconds = 180
  p_license_reference = '<INTERNAL_LICENCE_REFERENCE>'
  p_license_expires_at = $null
  p_enabled = $true
} | ConvertTo-Json

$trackRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_upsert_live_music_track_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $trackBody
}

Invoke-RestMethod @trackRequest | ConvertTo-Json -Depth 8
```

The initial RPC intentionally registers wildcard-region rights only. Do not use
it for territory-limited music; extend and review the regional policy first.

After the file, metadata, licence, iPhone, and Android checks pass, enable music:

```powershell
$musicBody = @{
  p_patch = @{
    musicEnabled = $true
    musicAutoEnabled = $true
    musicDuckingEnabled = $true
  }
} | ConvertTo-Json -Depth 5

$musicRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_show_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $musicBody
}

Invoke-RestMethod @musicRequest | ConvertTo-Json -Depth 8
```

Global flags do not activate a room. In an allowlisted Host’s live session,
open **Live Studio → Odo** and select **Start Show Director**.

## Physical-device test

Use one physical iPhone, one physical Android device, and at least three current
Betweener builds. Prefer a Quick Connect Live with one Host and four eligible
guests for the complete rhythm test.

1. Start the Live and verify existing Stream video, Host mic, room audio, Room
   Pulse, pool enrolment, matching, private round, outcome, and return-to-Live.
2. Open **Live Studio → Odo → Start Show Director**. Expect `DIRECTING`, the
   current predefined scene, safe counts, energy, and program source.
3. With the Quick Connect pool open but no eligible pair, expect a calm Odo
   Stage/low-liquidity moment. It must not name the waiting member.
4. Add two explicitly opted-in eligible guests. AutoMatcher—not Odo—must create
   the pair. Expect `pair_forming`, then `quick_connect_active` from authoritative
   state without a second pair or changed RTC behavior.
5. Complete three rounds. With intermissions enabled, expect a bounded visual
   intermission after the configured interval, not after every pair.
6. From the Host panel, choose **Host**, **Room**, **Pool**, **Odo Stage**, and
   **Intermission**. The selection must win immediately and automatic scene work
   must wait through the Host suppression window.
7. Select **Take Control** during an active pair. The pair and Live stay active,
   while future Show Director wakes stop. Select **Return Direction to Odo** and
   verify fresh reconciliation without duplicate actions.
8. With approved music enabled, verify a main-room audience device receives the
   approved track during an eligible intermission. The Host/stage publisher must
   not play a second local copy.
9. Move the audience account into Quick Connect or Private Spark. Music must stop
   or remain absent there. Return to the room and confirm synchronized recovery
   from authoritative program time rather than restarting an arbitrary track.
10. Exercise Host pause/resume/stop/next where a playlist exists. Repeat one
    idempotency key and confirm no duplicate music event.
11. Disable Wi-Fi, change to cellular, background/foreground each app, reconnect
    Bluetooth/headphones/speaker, and rotate both devices. Live and Quick Connect
    must continue if music cannot load.
12. Set OpenAI unavailable and repeat a pair/intermission transition. 10D and the
    deterministic Show Director must continue without an AI call.
13. End the Live. Confirm music stops, no stale wake/lease remains, and rerun the
    Phase 10E and v1.1.1 production health queries.

For the 60–90 minute soak, record scene changes, intermission spacing, Host
overrides, music errors, RTC reconnects, battery/memory, and whether any scene or
track repeats unpleasantly. Physical audio/video acceptance remains a manual
release gate; automated tests cannot certify speaker/Bluetooth mixing.

## Automated verification

```powershell
npm.cmd run test:live-phase10e
npm.cmd run typecheck
npx.cmd supabase test db supabase/tests/live_odo_phase10e.sql
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10e_health.sql
npx.cmd supabase@latest db query --linked --file supabase/verification/v1.1.1_production_health.sql
```

The 10E health query is read-only and returns no track paths, signed URLs,
licence references, prompts, profile content, or private outcomes.

## Monitoring

Monitor show state versus Live/Quick Connect truth, stale wakes and leases,
scene/action frequency, Host overrides, bounded history, music events by source
and reason, catalogue licence status, rejected playback grants, storage errors,
and any private/publisher playback attempt. Alert on any show action containing
participant identity, any music path outside the private bucket, or any 10E
operation that changes the parent Live or pair lifecycle.

## Rollback

For one room, select **Take Control**. This is immediate and preserves Live,
Quick Connect, pairs, RTC, and outcomes.

For the global kill switch, keep the base Odo/10D configuration unchanged and
disable only 10E:

```powershell
$rollbackBody = @{
  p_patch = @{
    showDirectorEnabled = $false
    musicEnabled = $false
    musicAutoEnabled = $false
    musicDuckingEnabled = $false
    intermissionEnabled = $false
    energyModeEnabled = $false
    studioEnabled = $false
    studioControlEnabled = $false
  }
} | ConvertTo-Json -Depth 5

$rollbackRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_show_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $rollbackBody
}

Invoke-RestMethod @rollbackRequest | ConvertTo-Json -Depth 8
```

Re-run the health checks after rollback. Do not delete catalogue, audit, event,
or session rows; disabling flags and taking control are the recoverable response.
