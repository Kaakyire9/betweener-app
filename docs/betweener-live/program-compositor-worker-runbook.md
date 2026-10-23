# Program compositor worker runbook

## Purpose

The C2 compositor is a persistent private worker. It subscribes to the Stream
RTC call as `studio-program-*`, renders the server-authoritative Program scene
inside an isolated Chromium/Xvfb display, mixes browser audio through a private
PulseAudio sink, and publishes one H.264/AAC RTMP Program output back to the
same Stream call.

The worker does not read or render reactions, private messages, Sparks,
ballots, matching decisions, or other private engagement data.

## Required environment

- `SUPABASE_URL`: exact project URL.
- `BROADCAST_COMPOSITOR_WORKER_TOKEN`: at least 32 random bytes and equal to
  the Edge Function secret with the same name.
- `PORT`: health and loopback renderer server, default `8080`.
- `BROADCAST_COMPOSITOR_MAX_SESSIONS`: default `1`, maximum `4`.

Provider secrets remain in `live-broadcast-orchestrator`. They are never placed
in this container.

## Build

Security releases must be built from a clean committed worktree. Never reuse an
existing tag or deploy `latest`. Run from the repository root:

```powershell
git status --short
$securitySha = git rev-parse HEAD
$shortSha = git rev-parse --short=7 HEAD
docker buildx build --platform linux/amd64 --target validation --load `
  --build-arg SOURCE_REVISION=$securitySha `
  --build-arg BUILD_IDENTIFIER="adaptive-stage-m1-secure-$shortSha" `
  --build-arg ADAPTIVE_STAGE_V2_SHADOW_ENABLED=false `
  --build-arg ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED=false `
  --build-arg ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED=false `
  -f apps/program-compositor-worker/Dockerfile `
  -t "betweener-program-compositor:adaptive-stage-m1-secure-$shortSha" .
```

The validation stage must complete. It verifies the pinned native component
versions and features, three 30-fps H.264/AAC output shapes, X11 and PulseAudio
capture, a Chrome render, `/healthz`, and graceful SIGTERM shutdown.

The runtime intentionally uses a checksum-pinned Chrome for Testing build and a
minimal checksum-pinned FFmpeg build instead of Debian's broad Chromium/FFmpeg
dependency graphs. Chrome runs without its setuid sandbox because the ECS task
runs as UID/GID `1000:1000`, drops every Linux capability, has a read-only root
filesystem, exposes no inbound port, and receives only one writable `/tmp`
volume. Do not weaken those compensating controls.

After that security/runtime canary passes, build a new source-derived immutable
image with only `ADAPTIVE_STAGE_V2_SHADOW_ENABLED=true` and
`ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED=true`. Keep
`ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED=false`. The image labels record
all three compiled values; runtime environment overrides do not change the
already-built renderer bundle. Rescan and redeploy the new digest before the
three-renderer shadow canary.

## Staged activation

1. Deploy the C1 and C2 migrations with every broadcast flag still `false`.
2. Deploy `live-broadcast-orchestrator` and set the shared worker token.
3. Start exactly one compositor replica and confirm `/healthz` returns `200`.
4. Enable `broadcast_compositor_enabled` only for the staging canary window.
5. Verify one `studio-program-*` RTMP participant, stable lease heartbeats, and
   scene changes without private data in the output.
6. Exercise worker death and replacement. The new generation must fence the old
   worker before it can heartbeat.
7. Disable the flag after the canary. HLS, recording, captions and clips remain
   separate later gates.

## Operational invariants

- One fenced compositor lease owns a Live at a time.
- Browser credentials are short-lived and exchanged only over loopback HTTP.
- The RTMP address and stream key are never logged.
- The renderer profile and audio sink are destroyed on release.
- An unhealthy renderer or media process releases the lease and fails closed.

## AWS staging runtime

Milestone 1A runs only in AWS account `425805163493`, region `eu-north-1`, through the CDK
package at `infrastructure/program-compositor`.

- ECR repository: `betweener/program-compositor`
- ECS cluster: `betweener-staging`
- ECS service: `program-compositor`
- Task: Fargate Linux/AMD64, 4 vCPU, 8 GB RAM, 40 GiB ephemeral storage
- Privilege boundary: UID/GID `1000:1000`, read-only root, all capabilities
  dropped, init process enabled, writable ephemeral `/tmp` only
- Scale: maximum one compositor session; desired count defaults to `0`
- Application logs: `/aws/ecs/betweener-staging/program-compositor`, retained for 14 days
- Operations logs: `/aws/events/ecs/betweener-staging/program-compositor`, retained for 14 days
- Secret: `betweener/staging/program-compositor/worker-token`
- Network: default-VPC public subnets, public task IP, no inbound security-group rules

The public-IP design is deliberate for this one intermittent staging worker. It supports
Supabase, Stream WebRTC, RTMP/RTMPS, ECR, Secrets Manager, CloudWatch, and DNS egress without
the persistent cost of a NAT Gateway. No load balancer or public health endpoint exists.

### Bootstrap and registry

```powershell
Set-Location infrastructure/program-compositor
npm.cmd ci
npx.cmd cdk bootstrap aws://425805163493/eu-north-1 --profile betweener-staging
npx.cmd cdk deploy BetweenerStagingProgramCompositorRegistry --profile betweener-staging
Set-Location ../..
```

Do not delete the `CDKToolkit` stack. Enable termination protection on it after bootstrap.

### Push the approved release artifact

The push script refuses the wrong account, region, source SHA, reused immutable tag,
non-root configuration, or platform. It does not rebuild source and proves that the
remote OCI index contains exactly one valid Linux/AMD64 runtime manifest and configuration.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  infrastructure/program-compositor/scripts/Push-VerifiedRelease.ps1 `
  -SourceRevision $securitySha `
  -Tag "adaptive-stage-m1-secure-$shortSha" `
  -LocalImage "betweener-program-compositor:adaptive-stage-m1-secure-$shortSha"
```

Record the returned `RemoteIndexDigest` and pass it to the runtime deployment.

Before enabling any media or renderer flag, wait for ECR Basic scanning on the
returned `RuntimeManifestDigest`. Record every Critical and High finding in
`program-compositor-container-security-m1a-s.md`.

```powershell
aws ecr describe-image-scan-findings `
  --repository-name betweener/program-compositor `
  --image-id imageDigest=<runtime-manifest-digest> `
  --profile betweener-staging --region eu-north-1
```

The gate passes only when unresolved Critical findings are zero and High
findings with a safe available fix are zero. A remaining High requires an
upstream/fix-status check, runtime reachability analysis, mitigation and an
explicit residual-risk statement. Scanner-package presence alone is not an
acceptance or rejection decision. If the gate fails, leave ECS on the previous
digest with desired count `0`; do not deploy the candidate and do not enable
shadow, diagnostics or renderer flags.

### Deploy the idle runtime

```powershell
Set-Location infrastructure/program-compositor
npx.cmd cdk deploy BetweenerStagingProgramCompositorRuntime `
  --exclusively `
  --profile betweener-staging `
  --parameters DesiredCount=0
Set-Location ../..
```

The task image digest is sourced directly from the committed `RELEASE` record.
It is intentionally not a CloudFormation parameter: retained parameter values
must never allow deployment provenance to diverge from the runtime image.

The service has an ECS deployment circuit breaker with rollback. Its container health check
uses loopback `GET /healthz`, with a 90-second start period, 15-second interval, three-second
timeout, and three retries. ECS sends `SIGTERM` and waits 60 seconds before forcing shutdown.

### Synchronize the staging token

The original hosted secret cannot be read back. Rotate it only after the AWS secret exists.
This script generates one 48-byte random value, writes it to both staging systems without
printing it, verifies the AWS value and Supabase digest match, then removes its temporary files.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  infrastructure/program-compositor/scripts/Sync-StagingWorkerToken.ps1
```

Supabase makes Edge Function secret updates available without redeploying the function.
Production secrets are never touched.

### Canary start and private health verification

Keep `broadcast_compositor_enabled` and every Adaptive Stage V2 rendering flag off while the
worker first proves empty polling and authentication.

```powershell
Set-Location infrastructure/program-compositor
npx.cmd cdk deploy BetweenerStagingProgramCompositorRuntime `
  --exclusively `
  --profile betweener-staging `
  --parameters DesiredCount=1

aws logs tail /aws/ecs/betweener-staging/program-compositor `
  --profile betweener-staging --region eu-north-1 --since 15m
```

ECS Exec is intentionally disabled so the worker task role does not receive broad SSM permissions.
Use ECS task health plus CloudWatch logs to verify the approved source SHA, build identifier,
manifest and resolver, and a successful orchestration poll. Never expose port `8080` publicly.

### Scale to zero and rollback

After the canary, or immediately on failure:

1. Disable `broadcast_compositor_enabled`, shadow and diagnostics in staging.
2. Deploy the runtime stack with `DesiredCount=0` and the current digest.
3. If required, redeploy the previous task-definition digest while keeping desired count `0`.
4. Review ECS service events plus the application and operations log groups.

The immutable Milestone 1A rollback index is
`sha256:373029b26a8d851c761c8aaa725fb2db9bcbd713621630b9f8033eb7b76e180d`.

Do not enable HLS, recording, captions, translation, clips, highlights, or any V2 renderer as
part of Milestone 1A.
