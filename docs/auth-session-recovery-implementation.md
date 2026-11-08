# Auth session recovery implementation

## Scope

This repair applies to the current 1.2.0 development/staging line. It does not publish an OTA update, build, backend change, or Play release.

## Transport contract

- `supabaseAuth` uses the dedicated transport in `lib/auth/auth-transport.ts`.
- REST, RPC, Storage, Functions, and Realtime keep the existing data-client transport.
- Native rejection, caller abort, timeout, 408, 425, 5xx, 598, 599, malformed refresh rejection, and unknown refresh rejection are thrown to Auth JS as retryable transport failures.
- Only `/auth/v1/token?grant_type=refresh_token` receives refresh compatibility handling. Password, OTP, OAuth-start, permission, and data responses are not blanket-rewritten.
- A structured refresh response reaches Auth JS as terminal only for the allow-listed credential/session codes in `TERMINAL_REFRESH_ERROR_CODES`.
- Refresh HTTP 429 honors `Retry-After` seconds or HTTP-date values, capped at 15 minutes. Missing/invalid values use bounded backoff. No actual refresh network request is started before the deadline.
- The installed Auth JS 2.117.2 remains responsible for refresh single-flight, retry duration, token rotation, credential persistence, and stale-commit protection. The app does not add an outer timeout race or pass a captured refresh token through retry loops.
- A runtime without cancellable fetch shares the outstanding refresh request after a UI timeout; another refresh request is not started solely because the UI wait ended.

## Recovery and persistence

- Durable auth storage awaits native reads/writes/removals and propagates classified storage failures. It never maps a slow read to `null` or claims an unfinished write succeeded.
- Cached profile snapshots contain no access or refresh credentials and never authorize protected writes.
- Recovery classification uses error name, status, structured backend code, transport state, and operation context. It does not classify terminal state from message substrings.
- Ordinary data/RLS `403` responses do not globally trigger token refresh.
- Auth event sequence and recovery generation checks discard stale results after sign-out, account switching, token refresh, or newer authentication activity.
- Safe diagnostics contain path without query, method, status, classification, retry deadline, attempt, and whether a network request occurred. Tokens, request bodies, headers, callback URLs, and user content are excluded.

## Returning-user guidance

- `lib/auth/last-sign-in-method.ts` stores a versioned, non-secret method hint scoped to environment and Supabase project.
- A hint is written only after an attempt-correlated successful Google, Apple, email-link, or password session.
- Button presses, sent email, callback failure, cancellation, generic auth events, token refresh, and account metadata do not write the hint.
- Ordinary logout/session expiry retains the hint. Account deletion and “Forget this device” remove it and invalidate pending writes.
- Signed-out help never performs provider lookup. Existing-account email link uses the existing `shouldCreateUser: false` path. Support uses the established `/support-center` destination.
- Apple browser sign-in on Android remains hidden until the external Apple Services ID, redirect URI, Supabase provider, state/nonce/PKCE, and environment callback configuration can be verified.

## Staging device checklist

Record package, app version/build number, runtime version, update ID, OS version, network transition, first safe auth error, credential-present transition, auth event, and final route. Never record tokens or callback URLs.

1. Sign in with each supported method and confirm the exact “Last used on this device” label after a successful session.
2. Cancel each provider flow and confirm the previous hint remains.
3. Background and resume before access-token expiry; expect no visible interruption.
4. Background beyond expiry and resume online; expect silent rotation and the same user.
5. Resume beyond expiry while offline; expect retained app context and a reconnecting banner. Restore connectivity and expect the same user without login routing.
6. Trigger a controlled staging 429; confirm the banner displays a wait state and manual/automatic triggers create no request before the deadline.
7. Switch Wi-Fi/mobile data during refresh; expect no `SIGNED_OUT` and one coordinated refresh.
8. Kill the process and cold launch with persisted credentials; expect deterministic bootstrap.
9. Explicitly sign out while recovery is pending; expect the stale result to be discarded.
10. Sign into another test account while old recovery is pending; expect only the newer identity and hint.
11. Verify revoked/invalid staging credentials route to legitimate reauthentication and cannot be resurrected from profile caches.
12. Verify “Forget this device”, generic no-history help, known-email link, and support routing.
13. Run Android first, then an iOS smoke pass for resume, sign-out race, Google/email/password hints, and native Apple.

## Production backport gate

Production provenance remains unverified. Before preparing a production patch, obtain the Play Console artifact/versionCode 12 build identifier or artifact hash and bind it to an EAS build/source commit. Do not assume commit `b2955749…` solely from matching version 1.1.1.

After verification:

1. Create an isolated worktree from the verified production source and dependency lock.
2. Adapt the dedicated transport policy to its actual Auth JS 2.110.7 behavior.
3. Replace the older timeout/cache auth storage with durable SDK-owned storage.
4. Remove duplicated raw-session snapshot authority without replaying its refresh token. Keep only non-secret profile presentation data.
5. Backport the transport, storage, terminal-code, 429, invalid-refresh, process-restart, and data-403 tests.
6. Confirm runtime/update compatibility. The current `appVersion` policy means a 1.2.0 update cannot target a 1.1.1 runtime.
7. Review whether a verified 1.1.1-compatible JavaScript update is operationally supported; otherwise create a new binary/versionCode through the normal signed release process. Do not guess the next versionCode.

## Rollout and rollback proposal

1. Ship to internal staging with sanitized auth diagnostics enabled through the existing telemetry channel.
2. Complete the Android checklist and iOS smoke pass on exact build/update IDs.
3. Roll out to a small production cohort only after the release base and runtime are verified.
4. Monitor retry classifications, `SIGNED_OUT` following transient transport failures, refresh request rate, terminal-code distribution, and sign-in-help use. Do not monitor credentials or personal data.
5. Increase rollout only when transient failures retain sessions and legitimate invalid refreshes still reauthenticate.
6. Roll back the client update if refresh request volume, login failures, or stale-identity diagnostics regress. Backend session security policy remains unchanged, so rollback requires no backend reversal.
