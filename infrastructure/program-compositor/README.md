# Program Compositor staging infrastructure

This package owns the smallest staging-only AWS home for one Program Compositor canary.

## Guardrails

- Account: `425805163493`
- Region: `eu-north-1`
- ECR: `betweener/program-compositor`
- ECS cluster/service: `betweener-staging` / `program-compositor`
- Desired count defaults to `0` and is constrained to `0..1`.
- The task receives a public IP for outbound-only internet access; its security group has no
  inbound rules. This avoids a persistent NAT Gateway charge for one intermittent worker.
- The image is immutable and supplied by digest. `latest` is never used.
- The worker token is injected from Secrets Manager and never belongs in source or build args.
- No HLS, recording, captions, translation, clips, highlights, or V2 renderer is enabled here.

## Local validation

```powershell
npm.cmd ci --prefix infrastructure/program-compositor
npm.cmd run check --prefix infrastructure/program-compositor
npm.cmd run synth --prefix infrastructure/program-compositor -- --profile betweener-staging
```

## Deployment order

Use the full procedure in `docs/betweener-live/program-compositor-worker-runbook.md`:

1. Bootstrap CDK.
2. Deploy the registry stack.
3. Push and verify the approved local release artifact.
4. Deploy the runtime stack with desired count `0` and the remote digest.
5. Synchronize the staging worker token.
6. Temporarily deploy desired count `1` for the approved canary.
7. Return desired count to `0` after acceptance.
