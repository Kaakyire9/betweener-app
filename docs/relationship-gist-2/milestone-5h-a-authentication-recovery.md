# Relationship Gist 2.0 — Milestone 5H-A Authentication Recovery

Verification date: 2026-10-11 (Europe/London)

## Result

Supabase CLI account authentication is currently restored. No login, logout, token write, environment change or project relink was performed by Codex.

## Authentication diagnosis

| Check | Result |
| --- | --- |
| Installed CLI | `2.118.0` |
| `SUPABASE_ACCESS_TOKEN`, Process scope | Not defined |
| `SUPABASE_ACCESS_TOKEN`, User scope | Not defined |
| `SUPABASE_ACCESS_TOKEN`, Machine scope | Not defined |
| Plaintext `~/.supabase/access-token` | Absent |
| Native CLI credential | Present/effective, inferred from successful authenticated commands |
| Current link | `xsgzxadwuxuziubglvps`; unchanged |
| Earlier failure | HTTP 401 `Invalid access token` from account/Management API authentication |
| Current project authorization | PASS for project listing, staging migration-list and staging backup-list reads |

An environment-variable token was not overriding the stored login. The earlier HTTP 401 occurred before project authorization, so it was an account-token validation failure rather than a missing permission on Betweener Staging. The evidence cannot safely distinguish expiry, revocation or a transient native-session condition. Current commands authenticate successfully.

Supabase documents that `SUPABASE_ACCESS_TOKEN` takes precedence over the saved token and that `supabase login` stores a token in native credential storage when available: [CLI login reference](https://supabase.com/docs/reference/cli/global-flags), [Personal Access Tokens](https://supabase.com/docs/guides/platform/personal-access-tokens).

## Secure operator recovery procedure

Use this only if `Invalid access token` returns:

1. Check only whether an override exists; never print its value:

   ```powershell
   [bool]$env:SUPABASE_ACCESS_TOKEN
   [bool][Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
   [bool][Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Machine')
   ```

2. If a stale process-only override exists, close that shell or remove only the process variable:

   ```powershell
   Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
   ```

   A persistent User/Machine override must be corrected by the human operator through Windows environment settings. Do not paste it into Codex, terminal history or logs.

3. Run the browser-based login interactively in the operator's terminal:

   ```powershell
   C:\Projects\betweener-app\node_modules\.bin\supabase.cmd login
   ```

   Complete the Supabase browser flow yourself. Do not send Codex the access token or verification secret. Prefer a scoped token when a browser login is not appropriate; never put a literal token on a shared command line.

4. Validate the session without relinking:

   ```powershell
   C:\Projects\betweener-app\node_modules\.bin\supabase.cmd projects list --output-format json
   C:\Projects\betweener-app\node_modules\.bin\supabase.cmd migration list --project-ref xsgzxadwuxuziubglvps --workdir C:\Projects\betweener-app
   ```

5. Confirm that `xsgzxadwuxuziubglvps` is Betweener Staging and healthy. Do not run `supabase link`.

## Read-only staging verification

Authenticated project metadata:

- ref: `xsgzxadwuxuziubglvps`;
- name: `betweener-staging`;
- status: `ACTIVE_HEALTHY`;
- region: `eu-north-1`;
- database: PostgreSQL `17.6.1.166`;
- current local link: same staging ref, unchanged.

Migration ledger:

- 231 local/remote matched versions;
- five local-only pending versions;
- zero remote-only versions;
- pending versions are exactly `20261010120000`, `20261010121000`, `20261010130000`, `20261010140000`, `20261010150000`;
- no unrelated pending migration;
- all three staging-only history versions are matched remotely.

The staging anonymous API returned zero anonymously visible global Gists. Because RLS may intentionally hide them, this does not prove absence and is not used as a baseline count. No authenticated member token, service-role key or privileged SQL path was used.

## Recovery readiness

Read-only backup inventory:

- WAL-G/physical backups: enabled;
- PITR: disabled;
- seven completed physical backups visible;
- latest completed physical backup: `2026-10-10T23:17:26.556Z`;
- visible backup dates: 2026-10-04 through 2026-10-10;
- CLI `backups restore` supports PITR timestamp restoration, which is unavailable while PITR is disabled;
- daily physical backup restoration is a Dashboard/operator procedure.

Backup existence is proven, but recovery readiness is not. There is no evidence of a restore rehearsal, no fresh recovery point taken immediately before migration, and no accepted RPO/downtime record. The database deployment therefore remains `NO_GO`.

## Final status

`CLI_AUTHENTICATION = RESTORED`

`STAGING_IDENTITY = PASS`

`MIGRATION_LEDGER = PASS`

`RECOVERY_READINESS = UNVERIFIED`

`STAGING_MIGRATION_GO_NO_GO = NO_GO`

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`
