# Phase C controlled deployment preflight — blocked

Captured: `2026-10-15T14:00:44.5472356Z`

## Decision

```text
LOCAL_PROXY_DEPLOYMENT = BLOCKED
VECTOR_DOCKER_CONNECTIVITY = FAIL (not tested; deployment blocked before mutation)
VECTOR_STABILITY_10_MIN = FAIL (not started)
KONG_TO_ANALYTICS_MARKER = FAIL (not generated)
EDGE_RUNTIME_PRESERVED = PASS
PROTECTED_RESOURCES_PRESERVED = PASS
ROLLBACK = NOT_NEEDED
NORMAL_START_PERSISTENCE = NOT_TESTED
```

No analytics edit or Docker mutation was performed. The current Compose file does not define a logging driver or rotation options. Docker reports `LoggingDriver=json-file`; the existing default-created Vector container has `{"Type":"json-file","Config":{}}`; and logging-key-only inspection found no inherited `log-driver` or `log-opts` in Docker Desktop's settings store or either daemon configuration location. Creating the proxy from the current Compose would therefore fail the Phase C requirement to retain bounded log rotation.

Adding and retesting a per-container logging policy would materially change the tested Compose file and was not improvised under the instruction to stop when preflight does not match. The required next action is separate approval to add explicit bounded proxy logging, rerun the affected configuration/security tests, and then repeat Phase C preflight.

## Plan output

The approved read-only command was run:

```powershell
.\scripts\local-supabase.ps1 -Action Plan
```

```text
Action               : Plan
DockerContext        : desktop-linux
DockerDaemonId       : f88969ab-ece5-4d31-bed0-8fd8830c6b40
Project              : betweener-app
VectorId             : c15603c0e7be96c7da13a132a66879c483db5c2f1dab3ae37bd1a891f96edb20
VectorState          : exited
VectorNetworks       : supabase_network_betweener-app
AnalyticsEnabled     : False
ProxyPresent         : False
RepairNetworkPresent : False
```

The wrapper's Plan, Deploy, and Rollback branches were reviewed. They fail closed on daemon/image ownership, Vector identity, unexpected networks/participants, and proxy security properties. Deploy creates the Compose proxy/network, attaches only stopped Vector, validates the private alias, and starts only Vector when requested. Rollback can stop only Vector, detach only the repair network, and remove only owned repair resources; restoring the separately edited analytics line would remain an explicit file restoration step.

## Workspace and implementation baseline

- Workspace: `C:\Projects\betweener-app`
- Supabase project ID: `betweener-app`
- Docker context: `desktop-linux`
- Daemon: `f88969ab-ece5-4d31-bed0-8fd8830c6b40`, `docker-desktop`, linux/x86_64
- Proxy and repair-network name collisions: none
- Vector sinks: all configured HTTP sinks target local `supabase_analytics_betweener-app:4000`; no hosted or third-party hostname is configured
- Analytics and database containers: running and healthy
- C: free at preflight: `34,709,372,928` bytes
- Working tree: dirty with extensive pre-existing unrelated changes; none were reset, stashed, committed, or overwritten

File hashes before any authorised mutation:

```text
supabase/config.toml
  8FCDDDDD592DD84D6B0B87B16F2715C64F4C8A5E8746F9D611F86AF99C7C4989
ops/local-supabase/vector-docker-api-proxy.compose.yml
  33816067825137C755D7790BF80A043F3F966023C13A76AC5B49E4D74CE59AB9
ops/local-supabase/haproxy-vector-readonly.cfg
  347F57EBBFA3161ABA88BC0FA1FD9EA8837D17243000A5EFA71D39A57E15DB6B
scripts/local-supabase.ps1
  F04B6AA1F799FE9A8CB634A1297A2B659B6C76823F2376CB6B04BF54265F0068
ops/local-supabase/tests/vector-docker-api-proxy/probe-docker-api.sh
  2494587E1F3CC8FAFA7DB15FE228BD2BA151CEE7EEC815DCFC9E6493EC1033E2
ops/local-supabase/tests/vector-docker-api-proxy/run-tests.ps1
  0D6AFBD2418A8BA88CB90B5369FF805384C7BFBF6F21DBDA5E81EE5E370902E9
```

Analytics baseline:

```text
417:[analytics]
418:enabled = false
```

## Protected identities

| Resource | Container ID | Image ID | State | Restarts | Networks |
| --- | --- | --- | --- | ---: | --- |
| Vector | `c15603c0e7be96c7da13a132a66879c483db5c2f1dab3ae37bd1a891f96edb20` | `sha256:ca92d617e905953c3f852e7e88061f7039460e733522e3f0c21bc6ae946b2558` | exited | 45 | `supabase_network_betweener-app` |
| Edge Runtime | `d27f2b3817737e23f5c2cd0dff7d8683acebd4a8fe70e169f073f7b23ac6599b` | `sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c` | running | 0 | `supabase_network_betweener-app` |
| Database | `475904e1caa691d0cfa7fcb1bdf91b24925a7c097494e4f8e500c572e58c9437` | `sha256:4a4ed8cb814876a1726eb389ddfe2b1c3459e998e0468f0ac6b58aef45e8ebd9` | running/healthy | 0 | `supabase_network_betweener-app` |
| Analytics | `f980ea1b72b4968008f5f8e9be65fd16823e61aa3e493c2409407982e4d575f7` | `sha256:ba88b97954573852eb18524d07507724000be02dbc94e22ee32c186ea006f1b6` | running/healthy | 0 | `supabase_network_betweener-app` |
| Audio | `f29c212dde0fb8802f106d1a5d8e001e8c59646262ec33ee928495eb1841a314` | `sha256:2259bb24882de171e2f52b1aed8e545c3cc35f5f278f8da156cf1c54067eb5ec` | running/healthy | 0 | `bridge` |

All five existing volumes were unchanged:

| Volume | Created UTC | Project label |
| --- | --- | --- |
| `supabase_config_betweener-app` | `2025-09-19T11:40:01Z` | `betweener-app` |
| `supabase_db_betweener-app` | `2026-09-08T18:34:03Z` | `betweener-app` |
| `supabase_edge_runtime_betweener-app` | `2026-09-02T08:28:28Z` | `betweener-app` |
| `supabase_edge_runtime_jbyblhithbqwojhwlenv` | `2025-10-01T22:21:32Z` | `jbyblhithbqwojhwlenv` |
| `supabase_storage_betweener-app` | `2025-09-19T11:41:26Z` | `betweener-app` |

## Actions not performed

- `[analytics].enabled` was not changed
- Deploy and Rollback were not invoked
- No proxy container or repair network was created
- Vector was not attached or started
- No Kong marker was generated
- No ten-minute observation began
- No existing service, volume, network, image, Docker setting, VHDX, or backup was changed
- No temporary Docker resource was created, so cleanup was unnecessary
