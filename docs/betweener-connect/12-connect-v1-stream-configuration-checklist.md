# Connect Stream configuration and manual validation

Status: **approved scoped configuration applied** in staging Stream app 1731011.
Voice video/screenshare denial is now proven by explicit SFU responses. M2A stays
BLOCKED by the observed held-token bypass during provider-end failure. Authorized
The approved two-person VIDEO verification passed publication, screen-share denial,
privileged-action denial and actual ACTIVE reconciliation; all fixtures are deleted.
See [closure](16-connect-v1-m2a-security-closure.md) for evidence and the remaining revocation failure.
No shared database changes or deployments are authorized by that approval.

> Current configuration, exact test responses and completed fixture cleanup are in
> [document 13](13-connect-v1-m2-security-validation.md) and the tracked JSON receipt.
> The proposal is preserved as the original approval input. The actual API role
> spelling is **`call_member`**. Empty optional roles may be omitted on readback;
> Chat/Feeds built-ins cannot be included in video grants. Required disabled-feature
> validation values and RTMP correction are documented in the receipt.

1. Confirm the intended non-production Stream application ID/key with an operator.
   Credential labels are insufficient evidence. Inventory existing app/global roles
   and Live call types; retain their exact configuration. Confirm ordinary Betweener
   Auth users have ordinary Stream application roles, not privileged custom roles.
2. Create the dedicated `betweener_connect` call type and custom roles. Export the
   actual grants/settings for review using pinned server SDK `getCallType`.
   The M1 adapter only reads and validates this configuration; it never creates it.

   | Call role | Exact allowed permissions |
   | --- | --- |
   | `user`, `admin`, `guest`, `global_admin`, `global_read_only`, `call_member` | empty arrays |
   | `connect_invited` | `read-call` |
   | `connect_voice` | `read-call`, `join-call`, `send-audio` |
   | `connect_video` | `read-call`, `join-call`, `send-audio`, `send-video` |

   All other exported roles must have empty arrays. Explicitly verify no ordinary
   user, member or role can create calls, add/invite members, mutate roles/settings,
   join ended calls, record, transcribe, share screens or broadcast. Check actual
   permission IDs with `listPermissions`; do not silently broaden the allowlist if
   an SDK needs another capability. Review any change and repeat bypass tests.
3. Export settings: recording, transcription, individual/raw/frame recording modes
   `disabled`; transcription `closed_caption_mode:disabled`; screen sharing,
   thumbnails and ingress `enabled:false`; broadcasting and HLS/RTMP `enabled:false`;
   limits `max_participants:2`. Voice calls must disable video and camera defaults.
   Confirm no auto recording, custom ingress or provider admin bypass exists.
4. Future native milestone only: configure non-production notification names/credentials,
   matching `com.aduboffour.betweener.staging`. Review retention and missed-call
   push behavior. `ring:true` in the server adapter does not establish native or
   cold-start readiness. Do not change Live push bootstrap/plugins for this step.
5. Provide server secrets only: `CONNECT_STREAM_API_KEY`, `CONNECT_STREAM_API_SECRET`,
   random `CONNECT_WORKER_SECRET`; environment `CONNECT_ENVIRONMENT=local|staging`;
   explicit `CONNECT_STREAM_APP_ID` matching the reviewed provider application.
   Use the existing Supabase runtime URL, admin-secret resolver
   (`SUPABASE_SECRET_KEYS` or dedicated `BETWEENER_SUPABASE_SECRET_KEY`) and
   publishable-key resolver. Never put Stream secret/worker secret/service credentials in
   `EXPO_PUBLIC_*`, app files, logs or review artifacts. The environment guard
   accepts local hosts or the canonical staging project and rejects production.
6. After separate schema/function deployment approval, deploy M0 before M1 against
   a reviewed target schema. Retain all Connect flags off initially. Configure the
   credential function's gateway for authenticated JWTs. Webhook/worker endpoints
   require their own signature/secret checks; their gateway must allow provider
   callbacks/worker requests (Supabase JWT verification disabled only for these
   two endpoints). Verify direct anonymous requests fail each endpoint's own check.
7. Arrange a durable scheduler/worker to invoke POST on `connect-provider-worker`
   with `x-connect-worker-secret`. Each request sweeps due sessions and claims one
   leased job. Establish throughput, timeouts, retry/backoff and cleanup monitoring.
   Do not disable the cleanup worker when entry flags are switched off. Configure
   signed POST callbacks to `connect-webhook` using Stream's raw `x-signature`.
   Test duplicate/raw-body tampering, replay, Live call IDs and stale event rejection.
8. Enable only a reviewed non-production fixture/canary configuration and explicitly
   opt-in test accounts' availability. Test actual server call creation, invited
   membership with no join capability, media-specific promotion after Betweener
   acceptance, short credential refresh and terminal cleanup. Record provider
   request IDs and redacted role/settings exports, never bearer tokens.
9. Use **ordinary user SDK/API credentials**, including a valid token issued for
   Live, to attempt direct creation; guessed/unrelated call GET/join; adding a third
   member; role/settings changes; voice-to-video publication; recording/transcription/
   screen sharing/broadcasting; joining an ended call; and pre-acceptance joining.
   Every forbidden action must be denied by Stream itself. A Supabase denial or
   hidden UI does not prove provider denial. Test unverified historical pairs,
   voice-only/expired/revoked grants and blocked/restricted accounts end-to-end.
10. Exercise create-response loss, retried get-or-create/ringing, two workers with an
    expired lease, cancel/block/revoke/delete during provider creation, and cleanup
    before late creation completes. Verify eventual provider end, no orphan ringing,
    no terminal resurrection and occupancy release only after safe cleanup. Test
    account restrictions and source/identity changes while a token is held.
11. Resolve the existing Live singleton's admission-specific token provider before
    native Connect use. Implement Auth-owned token refresh/media ownership under M2
    authorization, retaining Live lease behavior and a single push bootstrap.
    Test Live/Connect handoff, logout and account switching. One winning API device
    does not imply Stream can exclude another device holding the same user token.
12. Record real-provider results separately from M1 fixtures. Obtain separate native
    build/device authorization for foreground/background/locked/cold-start tests.
    Review gateway throttling of denied traffic, consent/grant expiry defaults,
    history pagination and retention before enabling any user-facing entrypoint.

References: [Stream permissions](https://getstream.io/video/docs/api/call-types/permissions/),
[server calls](https://getstream.io/video/docs/api/calls/),
[settings](https://getstream.io/video/docs/api/call-types/settings/),
[provider events](https://getstream.io/video/docs/api/webhooks/events/).
