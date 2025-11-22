# Applying Supabase Migrations (local/dev)

This project includes SQL migrations under `supabase/migrations/`.

Files:
- `001_create_profiles_and_swipes.sql` — creates `profiles`, `swipes`, and `matches` with trigger.
- `002_rls_and_policies.sql` — enables Row Level Security and adds conservative policies.
- `003_seed_profiles.sql` — inserts deterministic seed profiles for local QA.

How to apply

Option A — Supabase SQL Editor (recommended for quick testing):
1. Open your Supabase project dashboard.
2. Go to `SQL Editor` → `New Query`.
3. Copy-paste the SQL from each file in order and run.

Option B — psql with a Database URL (requires psql installed):
1. Export your Supabase database URL (found in Project Settings → Database → Connection String).

```powershell
$env:SUPABASE_DATABASE_URL = 'postgres://postgres:<password>@<host>:<port>/<db>'
psql $env:SUPABASE_DATABASE_URL -f .\supabase\migrations\001_create_profiles_and_swipes.sql
psql $env:SUPABASE_DATABASE_URL -f .\supabase\migrations\002_rls_and_policies.sql
psql $env:SUPABASE_DATABASE_URL -f .\supabase\migrations\003_seed_profiles.sql
```

Option C — Supabase CLI (if installed):
1. Ensure `supabase` CLI is logged in and connected to your project.
2. Use `supabase db query` (or `supabase db remote`) depending on CLI version:

```powershell
supabase db query --file supabase/migrations/001_create_profiles_and_swipes.sql
supabase db query --file supabase/migrations/002_rls_and_policies.sql
supabase db query --file supabase/migrations/003_seed_profiles.sql
```

Security notes
- These migrations enable RLS policies that allow authenticated users to perform common actions.
- Review policies before applying to a production database.
