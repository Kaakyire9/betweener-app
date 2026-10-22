# Supabase CLI authentication on Windows

The repository does not rely on the Supabase CLI Windows keyring. The pinned
CLI wrapper disables keyring access and injects a PAT from a Windows
DPAPI-encrypted credential for the duration of each command.

The encrypted credential is stored outside the repository at:

```text
%LOCALAPPDATA%\Betweener\supabase-cli\access-token.dpapi
```

DPAPI binds the encrypted value to the current Windows user. The plaintext PAT
is not written to the repository, a normal environment variable, or a shell
profile.

## One-time setup

1. Create a scoped PAT in Supabase and copy it to the clipboard. Grant the
   permissions required by the CLI operations you use.
2. From the repository root, run:

```powershell
npm run supabase:auth:setup
```

Setup validates the PAT against the Management API before replacing the
encrypted credential, then overwrites the clipboard with a space.

## CLI usage

On Windows, use the repository command shim instead of calling the CLI in
`node_modules` directly:

```powershell
.\scripts\supabase.cmd projects list --output-format json
.\scripts\supabase.cmd migration list --linked
.\scripts\supabase.cmd db push --linked --dry-run
```

For commands that use the repository's linked hosted project, prefer the
staging-guarded shim. It refuses to run if the link is not Betweener Staging:

```powershell
.\scripts\supabase-staging.cmd migration list --linked
.\scripts\supabase-staging.cmd db push --linked --dry-run
```

The command shim intentionally bypasses npm argument parsing. This avoids a
Windows npm issue where flags intended for the Supabase CLI can be consumed as
npm flags. The `npm run supabase -- ...` alias remains available when argument
forwarding works in the installed npm version.

The wrapper uses the repository-pinned CLI, sets `SUPABASE_NO_KEYRING=1`,
decrypts the PAT only in memory, passes it through the child process
environment, and clears its local copy when the command exits.

Remote type generation uses the same wrapper automatically on Windows:

```powershell
npm run supabase:types
npm run supabase:types:check
```

## Verification and removal

```powershell
npm run supabase:auth:status
.\scripts\supabase.cmd projects list --output-format json --debug
npm run supabase:auth:remove
```

`supabase:auth:status` reports only metadata and the Management API status. It
never prints the PAT. A successful wrapped `projects list` confirms that the
DPAPI credential was decrypted and supplied without using the keyring.
