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
npx.cmd supabase@latest functions deploy live-odo-show-director
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
    screenAudioEnabled = $false
    externalAudioEnabled = $true
    closedBeta = $true
    controllerLeaseSeconds = 30
    controllerGraceSeconds = 10
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

Leave `screenAudioEnabled` false until the separate browser/OS screen-audio
test passes. It is not required for screen video.

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
4. Start screen sharing with screen audio off. Choose the registered screen
   source and Host source in Preview.
5. Click **TAKE**. Confirm all mobile viewers switch once to the same screen +
   Host layout. Room Pulse remains expanded and interactive.
6. Click **CUT** to **Screen Full**. Confirm the screen is contained and the
   Studio transport identity does not increase the room headcount or occupy a
   normal stage seat.
7. Stop sharing from the browser's native sharing indicator. Confirm Program
   falls back to Host or the branded safe scene and the lost screen never
   remains frozen on Program.

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

### G. Failure recovery

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

### H. External hardware sign-off

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

### I. End and reports

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
