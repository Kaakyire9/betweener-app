# Phase C controlled local deployment and validation

Captured: `2026-10-15T15:58:54.5962829Z`

## Decision

```text
PROXY_LOGGING_CONFIG = PASS
LOGGING_REGRESSION_TESTS = PASS
AFFECTED_MOCK_TESTS = PASS
LOCAL_PROXY_DEPLOYMENT = PASS
VECTOR_DOCKER_CONNECTIVITY = PASS
VECTOR_STABILITY_10_MIN = PASS
KONG_TO_ANALYTICS_MARKER = PASS
EDGE_RUNTIME_PRESERVED = PASS
PROTECTED_RESOURCES_PRESERVED = PASS
ROLLBACK = NOT_NEEDED
NORMAL_START_PERSISTENCE = NOT_TESTED
```

The proxy and existing Vector container were intentionally left running. `[analytics].enabled` remains `true`. No Docker Desktop, WSL, Supabase-stack, hosted, audio, volume, migration, image-prune, VHDX, backup, credential, or Git operation was performed.

## Authorised artifact correction

Old and new SHA-256 hashes:

| Artifact | Accepted baseline | Tested/deployed |
| --- | --- | --- |
| `vector-docker-api-proxy.compose.yml` | `33816067825137C755D7790BF80A043F3F966023C13A76AC5B49E4D74CE59AB9` | `A85E2D5624932F632B67F6B0970A0C12864BB3157CFF4CD5FCFA48D028522562` |
| `scripts/local-supabase.ps1` | `F04B6AA1F799FE9A8CB634A1297A2B659B6C76823F2376CB6B04BF54265F0068` | `3FC0FACE121BA12D231D6D10D709EA5A3D22F942B3D4366FD58715132F050154` |
| `test-logging-policy.ps1` | absent | `E157A637FFC46C6A796C3BB90FED5E7B2836588C9508A2F717E8AF1C10AB3C46` |
| `haproxy-vector-readonly.cfg` | `347F57EBBFA3161ABA88BC0FA1FD9EA8837D17243000A5EFA71D39A57E15DB6B` | unchanged |
| `run-tests.ps1` | `0D6AFBD2418A8BA88CB90B5369FF805384C7BFBF6F21DBDA5E81EE5E370902E9` | unchanged |

The exact focused source diff is in `focused.diff`. The Compose change adds only:

```yaml
logging:
  driver: json-file
  options:
    max-size: "5m"
    max-file: "2"
```

The wrapper now fails before mutation if rendered Compose differs, and fails before Vector is attached or started if the created proxy's `HostConfig.LogConfig` differs. No allowlist, mount, network, image, identity, resource, or deployment behavior was weakened.

The deployed source state is exactly:

| Setting | Deployed value |
| --- | --- |
| Analytics | top-level `[analytics].enabled = true` |
| Proxy image | `haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2` |
| Pull policy | `never` |
| Logging | `json-file`; `max-size=5m`; `max-file=2` |
| Identity | `user=99:99`; supplementary group `0` |
| Filesystem/capabilities | read-only root; `cap_drop=ALL`; no-new-privileges |
| Limits | 64 PIDs; 64 MiB; 0.25 CPU |
| Restart policy | `unless-stopped` |
| Published ports | none |
| Mounts | HAProxy config read-only; `/var/run/docker.sock` read-only |
| Network | internal bridge `betweener_vector_docker_api` only |
| Alias | `host.docker.internal` on the repair network |
| Vector networks | original `supabase_network_betweener-app` plus `betweener_vector_docker_api` |

The full deployed Compose and wrapper are the hashed files above. `focused.diff` contains the exact accepted-baseline differences for Compose, wrapper enforcement, and the analytics flag. The new regression-test file is preserved verbatim at `ops/local-supabase/tests/vector-docker-api-proxy/test-logging-policy.ps1` with its hash above.

Exact deployed Compose snapshot:

```yaml
services:
  docker-api-proxy:
    image: haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2
    pull_policy: never
    container_name: betweener-vector-docker-api-proxy
    command:
      - haproxy
      - -W
      - -db
      - -f
      - /usr/local/etc/haproxy/haproxy.cfg
    environment:
      DOCKER_BACKEND: /var/run/docker.sock
    user: "99:99"
    group_add:
      - "0"
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 64
    mem_limit: 64m
    cpus: 0.25
    restart: unless-stopped
    stop_grace_period: 5s
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "2"
    volumes:
      - type: bind
        source: ./haproxy-vector-readonly.cfg
        target: /usr/local/etc/haproxy/haproxy.cfg
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: /var/run/docker.sock
        target: /var/run/docker.sock
        read_only: true
        bind:
          create_host_path: false
    healthcheck:
      test:
        - CMD
        - wget
        - -q
        - -O
        - /dev/null
        - http://127.0.0.1:2375/_ping
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 3s
    labels:
      com.betweener.local-supabase.repair: vector-docker-api-proxy
      com.betweener.local-supabase.project: betweener-app
    networks:
      vector_docker_api:
        aliases:
          - host.docker.internal

networks:
  vector_docker_api:
    name: betweener_vector_docker_api
    internal: true
    labels:
      com.betweener.local-supabase.repair: vector-docker-api-proxy
      com.betweener.local-supabase.project: betweener-app
```

## Logging and regression tests

Rendered Compose reported exactly:

```text
driver=json-file
max-size=5m
max-file=2
```

The focused suite passed all nine checks: rendered configuration; a valid in-memory fixture; missing policy rejection; incorrect driver, size, and file-count rejection; Docker acceptance in a disposable exact-image container; exact runtime `HostConfig.LogConfig`; and cleanup. The disposable container used the cached pinned image with pulling disabled, `network=none`, no ports, Docker socket, or mounts, a read-only root, dropped capabilities, no-new-privileges, UID/GID 99 plus supplementary GID 0, resource limits, and zero output bytes. Its only inspected runtime field was `HostConfig.LogConfig`.

This verifies configuration acceptance, not exercised rotation. The `5m`/`2` policy bounds only the new proxy's Docker-managed stdout/stderr retention; it is not a total disk limit and does not bound the analytics database.

The unchanged 41-case isolated proxy mock runner completed twice with exit code zero. It exits successfully only after zero failed assertions and successful labeled-resource cleanup. The completed image security review was reused; no scan or download was repeated.

## Repeated preflight

- Workspace/project/context: `C:\Projects\betweener-app`, `betweener-app`, `desktop-linux`.
- Docker daemon ID: `f88969ab-ece5-4d31-bed0-8fd8830c6b40`; `docker-desktop`, linux/x86_64.
- Exact cached image: `haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2`.
- Proxy/network collisions: none.
- Vector: accepted ID, stopped, original `supabase_network_betweener-app`, historical restart count 45.
- Vector HTTP sink destinations: only `supabase_analytics_betweener-app:4000`.
- Protected Edge, database, analytics, and audio IDs/images/restart counts matched the accepted baseline.
- All five existing volume names, creation timestamps, and project labels matched the accepted baseline.
- C: free before deployment: `34,688,024,576` bytes.
- Existing unrelated dirty-worktree entries were recorded and not changed by this repair.

The authorised analytics edit was exactly top-level `[analytics].enabled = false` to `true`. `supabase/config.toml` changed from `8FCDDDDD592DD84D6B0B87B16F2715C64F4C8A5E8746F9D611F86AF99C7C4989` to `B6F506A1745D428AA58AB94F88DF26C86E25672E3DB37BCB54BB7F13D4E3C44C`.

## Deployment verification

The reviewed wrapper's `Plan` and `Deploy -StartVector` actions were used. The deployed proxy ID is `709b6598cee6987f9c9e18fa108a07faebfc19ae40f46231c482c49830d0b0ff`.

Before Vector start, the wrapper verified:

```text
HostConfig.LogConfig: Type=json-file, max-size=5m, max-file=2
user=99:99, group-add=0, read-only=true, privileged=false
cap-drop=ALL, security-opt=no-new-privileges:true
pids=64, memory=67108864, NanoCpus=250000000
published ports=0
Docker socket mount=read-only
HAProxy configuration mount=read-only
proxy networks=betweener_vector_docker_api only
repair network=internal bridge
repair members=proxy and Vector only
```

The proxy alias `host.docker.internal` resolved from the private network to exactly `172.20.0.2`, the proxy address. The wrapper's `/_ping` probe returned `OK`. Vector retained `supabase_network_betweener-app` and gained only `betweener_vector_docker_api`.

Fresh Vector startup logs prove actual Docker use:

```text
Capturing logs from now on
Listening to docker log events
Started watching for container logs
```

The DNS verification container was deliberately short-lived. Vector observed its removal and emitted one 409 and one subsequent 404 at `15:48:01Z`/`15:48:03Z`. Those IDs matched that disposable container. From `15:48:04Z` through the end of observation, both Vector and proxy had zero new warning/error lines.

## Kong-to-analytics marker

Kong's loopback admin route inventory was read locally and contained only the known `/auth`, `/realtime`, `/graphql`, `/analytics`, `/storage`, `/functions`, `/rest-admin`, `/pg`, `/rest`, `/pooler`, `/.well-known`, and `/mcp` prefixes. The unique prefix below matched no route, so it could not invoke a business upstream.

```text
marker=__betweener_vector_e2e_6808279f9327416fbe1067d58cfcbe3a
requestUtc=2026-10-15T15:49:45.2167914Z
target=http://127.0.0.1:54321/<marker>
result=HTTP 404, redirects=0, remoteIp=127.0.0.1
```

Kong recorded exactly one marker access-log line at `15:49:45Z`. A bounded, read-only PostgreSQL query across the nine existing `_analytics.log_events_*` tables, restricted to timestamps at or after `15:49:40Z`, found zero matches in eight tables and exactly one in `_analytics.log_events_903938df_96f9_4818_abaf_d3128cba534c` at `15:49:45`. The final recount remained exactly one. No direct insert or fabricated event was used.

## Stability and resources

Observation began at `2026-10-15T15:47:30.8416907Z` and final verification was at `2026-10-15T15:58:54.5962829Z`: 684 consecutive seconds.

| Metric | Initial | Final |
| --- | --- | --- |
| Proxy state/restarts | running, healthy / 0 | running, healthy / 0 |
| Vector state/restarts | running / 0 | running / 0 |
| Proxy CPU / memory | 6.51% / 12.71 MiB | 0.00% / 12.70 MiB |
| Vector CPU / memory | 0.38% / 28.31 MiB | 0.12% / 31.78 MiB |
| Proxy network I/O | 19.6 kB / 189 kB | 27.8 kB / 233 kB |
| Vector network I/O | 194 kB / 24.3 kB | 295 kB / 135 kB |
| Proxy writable layer | 36,864 bytes | 36,864 bytes |
| Vector writable layer | 28,672 bytes | 28,672 bytes |

Proxy Docker-log output contained zero lines during both measured halves of the window. Vector produced five lines / 1,718 bytes in the first measured half, containing the explained disposable-container warning/error pair, and zero lines / zero bytes in the later half. Docker's internal log files were not accessed directly.

## Preservation and cleanup

Final protected container IDs matched preflight. Edge Runtime, database, analytics, and audio stayed running with zero restart increments and unchanged networks. Vector retained its original ID and Supabase network. All five existing volumes retained their names, creation timestamps, and labels. No temporary `betweener-b2-*`, `betweener-logging-test-*`, or `betweener-dns-verify-*` container/network remained. The unrelated dirty working-tree entries were left as found; no reset, clean, stash, commit, checkout, or push occurred.

Final handoff C: free space: `34,651,340,800` bytes. The 36,683,776-byte decrease from pre-deployment preflight is observed host-disk usage during the run; it is not attributed solely to the proxy or Docker logs.

Rollback was not needed. Final `Plan` passed with analytics enabled, proxy/network present, Vector running, and both expected Vector networks. Normal-start/recreation persistence was intentionally not tested.

## Startup, recreation recovery, and rollback

These are recorded procedures, not additional closeout actions.

For a verified stopped Vector container:

```powershell
.\scripts\local-supabase.ps1 -Action Plan
.\scripts\local-supabase.ps1 -Action Deploy -StartVector -Confirm
```

`[analytics].enabled` must already be `true`. The first command must pass all daemon, image, Vector, network, ownership, rendered-logging, and existing-resource guards. The second validates the created proxy before attaching/starting Vector.

After every Supabase CLI recreation of Vector, its manual repair-network attachment is lost. The wrapper is mandatory: run `Plan`, confirm the replacement Vector identity/settings and original Supabase network, then run the approved `Deploy -StartVector -Confirm` while Vector is stopped. If the recreated Vector is already running without the full repair, `Deploy` refuses; a separately authorised recovery must stop only Vector first:

```powershell
docker --context desktop-linux stop --time 10 supabase_vector_betweener-app
.\scripts\local-supabase.ps1 -Action Plan
.\scripts\local-supabase.ps1 -Action Deploy -StartVector -Confirm
```

Targeted rollback:

```powershell
.\scripts\local-supabase.ps1 -Action Plan
.\scripts\local-supabase.ps1 -Action Rollback -StopVector -Confirm
```

After that succeeds, restore only top-level `[analytics].enabled = false` and rerun `Plan`. Complete rollback means Vector stopped on only its original Supabase network, no proxy, and no repair network. The wrapper refuses unexpected owners/settings/participants and must not be bypassed or followed by force removal.

`NORMAL_START_PERSISTENCE = NOT_TESTED`. Phase C demonstrates one local Kong-to-Vector-to-existing-local-analytics path, not complete function coverage or production readiness. No restart/recreation lifecycle, hosted deployment, or unrelated backup/worktree action is included in this evidence.

## Historical backup preservation

The verified pre-compaction historical backup is `E:\Docker-Backups\offline-before-compaction\docker_data.vhdx`. Its SHA-256 was previously verified to match the stopped original before compaction. It is historical evidence, not a current live snapshot. This closeout did not read, mount, restore, delete, overwrite, or otherwise modify it. The earlier unverified `before-compaction` copy must not be substituted for recovery.

`E:\Docker-Backups\betweener-config-before-analytics-disable-20261015.toml` was also left untouched. Neither backup is evidence of current runtime state, and any future recovery action requires separate authorisation.
