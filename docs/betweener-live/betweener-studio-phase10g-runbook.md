# Betweener Live Phase 10G — Studio deployment and combined 10F/10G test

Status: implementation complete; deployment and physical device sign-off required
Target: closed beta at `studio.getbetweener.com`
Architecture audit: [phase-10g-studio-audit.md](./phase-10g-studio-audit.md)

## What 10G adds

Betweener Studio is a separate authenticated desktop production console. It
uses the same Supabase control plane, Stream room, Odo Show Director, Quick
Connect, AutoMatcher, Music and Audience Pulse as mobile.

- Preview is local to one browser tab.
- Program is authoritative, versioned and visible to the audience only after
  TAKE/CUT.
- `odo`, `mobile_host`, `studio_host` and `system` are explicit controllers.
- A Studio controller has a short renewable lease and monotonic generation.
- Camera, microphone, screen share and DJ/audio-interface inputs are explicit
  browser sources. Screen share is a source, never a fifth stage participant.
- The public human stage remains capped at four people: one Host and up to
  three guests. Studio screen share is one separate visual source, so supported
  Program layouts may render five simultaneous video regions.
- An active Host can disconnect Studio from the mobile Odo console without
  ending the Live. Program cuts to a safe fallback and control returns to Odo
  when healthy, otherwise to the mobile Host.
- Studio receives operational aggregates only. It receives no compatibility
  graph, ballots, raw matching decisions or Private Spark media/content.
- Room Pulse and the mobile footer remain outside Program ownership.

10G does not create a central audio mixer or republish remote participant
audio. Participant audio remains distributed through Stream. Programme Music
keeps the existing licensed distributed playback policy. A DJ input is one
separate local Stream publication and is silent until its atmosphere bus is on
Program.

## Deploy

From the repository root:

```powershell
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest functions deploy live-studio-media-token
npx.cmd supabase@latest functions deploy live-studio-disconnect
npx.cmd supabase@latest functions deploy live-odo-show-director
npx.cmd supabase@latest functions deploy live-music-playback
npm.cmd run studio:build
```

Deploy `apps/studio` as a Vite project. Set its project root to `apps/studio`,
publish `dist`, use Node.js 24.x to match the repository engine, and attach
`studio.getbetweener.com`. Configure:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Never configure the service-role key or Stream secret in the web project.
The Stream API secret remains an Edge Function secret. Add the final Studio
origin to Supabase Auth's allowed redirect URLs before sign-in testing.

## Closed-beta activation

Use a fresh authenticated admin JWT. Keep each `Invoke-RestMethod` call in one
splat so PowerShell does not separate its headers from the request.

```powershell
$studioConfigBody = @{
  p_patch = @{
    studioEnabled = $true
    studioControlEnabled = $true
    sessionDiscoveryEnabled = $true
    mediaPublishingEnabled = $true
    screenShareEnabled = $true
    screenAudioEnabled = $true
    externalAudioEnabled = $true
    closedBeta = $true
    controllerLeaseSeconds = 90
    controllerGraceSeconds = 30
  }
} | ConvertTo-Json -Depth 6

$studioConfigRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_studio_configuration_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $studioConfigBody
}

Invoke-RestMethod @studioConfigRequest | ConvertTo-Json -Depth 6
```

Allow one internal Host/admin producer. Replace the UUID:

```powershell
$studioAccessBody = @{
  p_user_id = '00000000-0000-4000-8000-000000000000'
  p_allowed = $true
  p_capabilities = @{
    view = $true
    control = $true
    publish = $true
    screenShare = $true
    externalAudio = $true
    moderate = $false
  }
  p_note = 'Phase 10G physical device test'
  p_expires_at = $null
} | ConvertTo-Json -Depth 6

$studioAccessRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_set_live_studio_access_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $studioAccessBody
}

Invoke-RestMethod @studioAccessRequest | ConvertTo-Json -Depth 6
```

`screenAudioEnabled` admits browser-provided tab/system audio; it does not bypass
the browser picker. The producer must leave **Include screen audio** selected and
also enable **Share tab audio** or **Share system audio** in Chrome/Edge. Prefer a
browser tab for the first test because support for whole-device audio varies by
browser and operating system.

The 90-second controller lease and 30-second recovery grace tolerate normal
Chrome/Edge background-tab throttling while a producer presents another tab.
Studio also renews control and active sources immediately on visibility,
focus, and network-reconnect events. A genuinely abandoned controller still
falls back through server-authoritative maintenance.

Programme Music is a different transport. It remains disabled until the private
`live-program-music` bucket contains at least one enabled, approved, licensed
catalogue track and the Phase 10E flags `musicEnabled`, `musicAutoEnabled`, and
`musicDuckingEnabled` are enabled. Studio then exposes Pause/Resume, Next, Duck,
Repeat 1, and Repeat All. Repeat 1 loops locally without a transition; Repeat All
advances the active playlist (or the approved catalogue for a standalone track)
and wraps deterministically.

For Betweener-owned or appropriately licensed Suno exports, retain the plan,
invoice/project reference, creation date, territories, and the exact version of
the exported master outside the app. Upload the MP3 to the private
`live-program-music` bucket and register that exact object path with
`rpc_admin_upsert_live_music_track_v1` as documented in the Phase 10E runbook.
Uploading the object alone does not approve it or enable Programme Music.

The DJ input is intentionally separate from uploaded Programme Music. It only
lists live `audioinput` devices exposed by the browser. An MP3 file will not
appear there. Use a USB mixer/interface, operating-system loopback input, or a
virtual audio cable, then select that input and click **Start DJ input**. The
source remains silent in Preview and becomes audible only after TAKE assigns it
to the scene's atmosphere audio slot.

## Automated gates

Run before device testing:

```powershell
npm.cmd run typecheck
npm.cmd run studio:typecheck
npm.cmd run studio:build
npm.cmd run test:live-phase10f
npm.cmd run test:live-phase10g
npm.cmd run test:live-logic
npm.cmd run lint
npx.cmd expo-doctor
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10f_health.sql
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10g_health.sql
```

For both health files, `release_blockers` must be `0` and `healthy` must be
`true`. Phase 10G health also requires one non-expired internal producer with
View, Control, Publish, Screen Share and External Audio access.

## Combined 10F + 10G device test

Use one desktop browser for Studio and at least two separate mobile accounts.
Use headphones on the producer device. Do not select the same physical input
for both Host microphone and DJ input.

### A. Always-On entry and system session

1. On mobile account A, select **Available now — 15 min**.
2. Repeat on eligible mobile account B in the same enabled market.
3. Confirm each availability is private and time-limited; merely being online
   must not opt a member in.
4. Wait for the opportunity invitation. Accept independently on both devices.
5. Confirm the deterministic system-owned Quick Connect Live opens once,
   Stream admission succeeds, Odo starts, and neither account becomes a fake
   Host.
6. Confirm the 10F card shows the active opportunity/session rather than a new
   duration selector.

### B. Read-only Studio observation

1. Sign into `studio.getbetweener.com` with the allowlisted producer.
2. Confirm the system session appears with controller, Program scene and room
   count.
3. Open it without taking control. Confirm Odo remains controller and Studio
   cannot alter Program from Preview.
4. Confirm only pool/eligible/active/completed aggregates appear. No member
   compatibility scores, ballots, private invitation choice or Private Spark
   media may appear.

### C. Take Control without restarting the room

1. Click **Take Control** once.
2. Confirm Studio becomes controller, Odo pauses, and controller generation
   increments.
3. Confirm both mobile devices remain in the same Stream call, Quick Connect
   pool/round state is unchanged, and Music state is not recreated.
4. Open a second Studio tab. It may observe but must not TAKE with the first
   tab's lease. A stale Preview must show **Sync Preview**, not overwrite
   Program.

### D. Browser media and Preview isolation

1. Click **Connect studio media** and grant only the requested browser
   permissions.
2. Select the built-in camera and microphone. Start the camera. Keep the
   Studio microphone off if the same Host is already publishing from mobile.
3. Change Preview to **Screen + Host** without TAKE. Confirm mobile Program is
   unchanged.
4. Leave **Include screen audio** selected. Share a browser tab playing a
   rights-cleared test clip and enable **Share tab audio** in the browser
   picker. Choose the registered screen source and Host source in Preview.
5. Click **TAKE**. Confirm all mobile viewers switch once to the same screen +
   Host layout. Room Pulse remains expanded and interactive.
6. Click **CUT** to **Screen Full**. Confirm the screen is contained and the
   Studio transport identity does not increase the room headcount or occupy a
   normal stage seat.
7. Stop sharing from the browser's native sharing indicator. Confirm Program
   falls back to Host or the branded safe scene and the lost screen never
   remains frozen on Program.
8. Confirm an audience-only phone hears the laptop audio, while Preview stays
   muted in Studio. Repeat with a video-only share and confirm Studio explains
   that the browser supplied no audio track.

### D2. Programme Music transport

1. Confirm an approved catalogue track exists, then enable the three Phase 10E
   music flags. Refresh Studio; the badge must change from **Disabled** to
   **Policy ready**.
2. Start an approved track or playlist using the existing Odo music flow.
   Confirm audience-only phones hear it and publisher devices remain excluded.
3. Select **Repeat 1** and confirm the current track loops without a gap-causing
   server transition. Select it again to return to Repeat Off.
4. Select **Repeat All**. Confirm completion advances to the next approved track
   in the playlist, or in the approved catalogue when no playlist is active,
   and wraps after the final track. The first accepted device completion wins;
   duplicate completion signals must be harmless.

### E. Quick Connect and privacy while Studio directs

1. Let AutoMatcher form a pair while Studio holds Program control.
2. TAKE **Screen + Pair** or **Screen + Pool**.
3. Confirm the pair region is a safe programme state, not either member's
   Private Spark camera, audio or private decision.
4. Use **Finish current connections**. Existing pairs may finish; no new pair
   should start after draining begins.
5. Open a 90-second Audience Pulse from Studio. Confirm the ordinary mobile
   Room Pulse still works independently before, during and after the scene.

### F. Resume Odo

1. Click **Resume Odo**.
2. Confirm controller generation increments again and the Studio TAKE buttons
   disable.
3. Confirm Odo reconciles from current server state without recreating the
   session, Stream call, Quick Connect state or Music state.

### G. Host-only Studio disconnect and stage capacity

1. Take Studio control again, connect camera and microphone, then TAKE
   **Screen + Panel** with screen share active.
2. Put the Host and three guests on the public stage. Confirm all four human
   seats remain available and the screen occupies its own fifth visual region.
3. On the Host phone, open **Live Studio > Odo**, tap **Disconnect Studio** and
   confirm the warning. Guests and audience members must not see this control.
4. Confirm the Live stays open, Program immediately cuts to the safe fallback,
   and control returns to healthy Odo or otherwise to the mobile Host.
5. Confirm Studio camera, microphone, screen share and DJ publications stop,
   the browser reports that Studio media was disconnected, and no Studio
   source heartbeat revives the released source rows.
6. Confirm mobile stage controls still work and the four-person public stage
   limit has not changed.

### H. Failure recovery

1. Take control again, TAKE a screen scene, then close the controlling browser
   tab without resuming Odo.
2. Leave mobile viewers connected. Within the bounded lease/grace plus the
   one-minute maintenance interval, Studio control must expire and return to
   Odo/system policy.
3. The screen source heartbeat must expire, be marked lost, and Program must
   cut to the deterministic safe fallback.
4. Reopen Studio. The old tab identity must not regain control and old TAKE
   commands must return stale state.
5. Disable the producer's Studio allowlist while signed in. New control/media
   RPCs must be denied even if the old JWT remains valid.

### I. External hardware sign-off

These checks cannot be replaced by automated tests:

| Device path | Required result |
| --- | --- |
| Built-in camera | Preview, TAKE, stop and permission recovery pass |
| External USB camera | Appears by browser label; hot-unplug falls back safely |
| HDMI capture card | Browser enumerates it as a camera; 16:9 framing is correct |
| Built-in mic | Meter, mute and reconnect pass without duplicate Host audio |
| USB/Bluetooth mic | Selection and unplug/replug behavior are explicit |
| Audio interface/DJ input | Separate identity; armed Preview is silent; TAKE makes it audible |
| Headphones | No room echo or programme feedback |
| Tab/window/screen capture | Each supported capture mode starts/stops cleanly |
| Screen audio | Enable only for the tested browser/OS; returned audio track is real |
| Browser network loss | Lease/source recovery occurs; mobile Live remains usable |

Test current stable Chrome and Edge first. Then test the current Stream-supported
Safari and Firefox versions. Browser/OS wording must say “unavailable” when an
input or screen-audio track is not actually exposed.

### J. End and reports

1. Let Odo finish the current connections and close the system session under
   the existing 10F lifecycle policy.
2. Confirm both members leave Live cleanly, availability/reservations expire,
   and the Live is in Past Live—not Live Now.
3. Confirm each member recap remains role-scoped and Studio command/source
   audit rows contain metadata only, never media or private choices.

## Production observation

The health file reports active/stale Studio controllers, stale browser
sources and lost sources still assigned to Program. To inspect non-content
command metadata as an administrator, use the database console—not a browser
client—and limit by session and time.

Expected recovery bounds with the default settings:

- controller lease: 30 seconds;
- controller grace: 10 seconds;
- browser source heartbeat: 15 seconds;
- source stale threshold: 45 seconds;
- database maintenance: every minute.

Event-driven Show Director wakes may recover earlier. The one-minute clock is
the backstop.

## Rollback

Do not remove additive migrations during an incident. Disable capabilities in
this order:

1. `screenAudioEnabled = false`
2. `externalAudioEnabled = false`
3. `screenShareEnabled = false`
4. `mediaPublishingEnabled = false`
5. `studioControlEnabled = false`
6. `sessionDiscoveryEnabled = false`
7. `studioEnabled = false`

Existing mobile Live, Odo, Quick Connect, AutoMatcher and Music remain on their
previous authority paths. If a Studio controller is active, wait for recovery
or use the policy-approved mobile/Admin takeover before disabling discovery.
