# Operator-grade Studio Phase B

Status: implemented, locally validated and deployed to dedicated Staging on 2026-10-15. Automated acceptance gates are clear. Human role-boundary and supervised Stream transport device canaries remain pending.

## Delivered controls

1. TAKE, CUT, media publication, Start Live and End Live require a verified Supabase AAL2 session. The Studio provides first-party TOTP enrollment for authenticated staging operators who do not yet have a verified factor. It accepts existing Google-linked identities, email/password identities, and existing-user-only email magic links without creating duplicate accounts. Legacy TAKE and media-admission member grants are removed. A database trigger also prevents a Studio publisher from bypassing step-up through the generic Live transition RPC.
2. Studio access now carries an explicit `viewer`, `producer`, `moderator` or `supervisor` role. Producer and moderator capability boundaries are enforced when access is assigned.
3. Start Live is gated by a camera, microphone, secure-browser, connectivity/bandwidth and optional DJ-input preflight.
4. Producers have a private, ordered run-of-show with cue state transitions.
5. Operators have a private role-scoped operations channel. Its tables have RLS enabled and no direct authenticated reads.
6. Producers and moderators have a one-tap emergency action that cuts Program to `branded_intermission` and creates a critical acknowledged event.
7. Operator heartbeat/readiness exposes the active primary and standby operators. Existing generation-fenced `Take Control` provides takeover.
8. Preflight, publish, end and emergency operations write structured events. Moderators can acknowledge operational alerts.
9. Playwright covers media preflight with mocked devices. An opt-in staging canary is defined and refuses to publish media unless `STUDIO_CANARY_ALLOW_MEDIA=1` is explicitly present.

## Validation

- Studio TypeScript: PASS
- Studio production build: PASS
- Scoped ESLint: PASS
- Phase 10G regression: 40/40 PASS
- Phase B regression: 5/5 PASS
- Phase B pgTAP: 31/31 PASS against isolated local Supabase
- Chromium mocked-media E2E: 2/2 PASS
- `git diff --check`: PASS

## Controlled Staging rollout

- Supabase project: `xsgzxadwuxuziubglvps` (`betweener-staging`, `ACTIVE_HEALTHY`, `eu-north-1`)
- Recovery evidence: seven completed physical backups were present before rollout; the newest recorded backup was `2026-10-14T23:14:29.914Z`. PITR remains disabled.
- Migration checksum: `9CEB1487218402FC5B6DE4F72E22A7C5D145F51AAAE787A6812995B848D90CE6`
- Migration applied: `20261015140000_live_operator_grade_studio_phase_b.sql`
- Ledger read-back: local and remote both record `20261015140000`; a subsequent dry run reported the remote database up to date with no pending migrations.
- Edge Function: only `live-studio-media-token` was deployed. Read-back reported `ACTIVE`, version `9`, `verify_jwt=true`, bundle checksum `19bec85096a275cf7636d8f1f8ceed02a593b993b9c34d2981f0292a8e43c5e6`.
- Gateway boundary: an anonymous request returned `401 UNAUTHORIZED_NO_AUTH_HEADER` for project `xsgzxadwuxuziubglvps`.
- Metadata health: `supabase/verification/live_operator_grade_studio_phase_b_health.sql` passed 18/18 exact-signature, grant, RLS and trigger checks with zero failures.
- Staging Studio: `https://studio.staging.getbetweener.com`
- Vercel deployment: `dpl_6pQ9XsQYpmV5GVGUZtoKYx5qahH6` (`READY`)
- Served bundle read-back: configured Staging Supabase URL present, configured Production Supabase URL absent, Production Studio origin absent, Staging Studio origin present, Google account selection present, existing-user-only magic-link fallback present, MFA enrollment present and protected Start/End Live controls present.
- HTTPS read-back: `200 OK` with CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, media permissions policy and `noindex` headers.
- Production isolation: `https://studio.getbetweener.com` remained on deployment `dpl_CWeV5CMQPracxzxCTYdw15bA8AL9`; no Production database, function, configuration or alias was changed.

## Completed rollout steps

1. Verified the project identity, health, backup inventory and exact one-migration pending set.
2. Applied the authorized Phase B migration.
3. Deployed only the updated `live-studio-media-token` function.
4. Read back ledger parity, function JWT enforcement, RPC grants, RLS and trigger bindings.
5. Deployed and read back the Staging-only Studio bundle at its dedicated hostname.
6. Added and deployed first-party TOTP enrollment so the human canary does not depend on Dashboard-side MFA provisioning.

## Acceptance readiness read-back

The aggregate-only Staging readiness query found no existing canary actors or eligible sessions:

- verified TOTP users: `0`
- verified TOTP operators: `0`
- active Studio operators: `0`
- eligible disposable Live sessions: `0`
- Studio rollout flags: disabled; closed beta remains enabled

This is a safe pre-test state, not an implementation failure. Device testing can begin after the bounded canary setup below. No credentials, account identifiers or private staging data were printed during readiness verification.

## Remaining human canaries

1. Sign in to `https://studio.staging.getbetweener.com` with two approved staging accounts. Existing Google-linked operators can use **Continue with Google** or enter their email and select **Email me a secure sign-in link**; password operators use the email/password form. The magic-link path sets `shouldCreateUser: false`. Each operator must scan the displayed QR code with an authenticator and verify the six-digit code.
2. Assign one account the `producer` role and the other the `moderator` role. Do not share passwords, TOTP secrets or one-time codes.
3. Create one disposable Staging Live and enable only the closed-beta Studio flags required for the canary.
4. Confirm the moderator cannot TAKE, publish media, Start Live or End Live; confirm the producer cannot use moderator-only operations.
5. Run the staged browser canary with credentials supplied only through the operator shell:

```powershell
$env:STUDIO_CANARY_EMAIL='<approved canary email>'
$env:STUDIO_CANARY_PASSWORD='<entered securely>'
$env:STUDIO_CANARY_SESSION_ID='<disposable staging Live UUID>'
npm.cmd run test:canary --workspace @betweener/studio
```

6. For a supervised Stream transport check, set `STUDIO_CANARY_ALLOW_MEDIA=1`, complete MFA in the browser, confirm an audience-only physical device receives the feed, exercise the emergency safe scene and redundant takeover, then disconnect the source. Do not enable this in unattended CI.
7. Disable the canary flags, revoke disposable operator access and archive the disposable Live after evidence is recorded.

## Remaining gate

All non-interactive gates are clear and the Staging Studio is ready for device testing. The final acceptance status remains conditional until the role-boundary and Stream transport evidence is recorded. These checks cannot be truthfully automated because TOTP enrollment requires a human authenticator and the media canary requires supervised source and audience devices. No test accounts or Live data were created during rollout.

`OPERATOR_GRADE_STUDIO_PHASE_B_LOCAL = PASS`

`STAGING_DATABASE_ROLLOUT = PASS`

`STAGING_STUDIO_DEPLOYMENT = PASS`

`STAGING_DEVICE_TEST_READY = YES`

`STAGING_ROLE_BOUNDARY_CANARY = PENDING`

`STAGING_STREAM_CANARY = PENDING`

`OPERATOR_GRADE_STUDIO_PHASE_B_STAGING = CONDITIONAL_PASS`

`STAGING_MODIFICATIONS = PHASE_B_MIGRATION_FUNCTION_AND_STUDIO_ONLY`

`PRODUCTION_MODIFICATIONS = NONE`
