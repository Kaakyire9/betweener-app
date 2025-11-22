<#
PowerShell helper to apply SQL migration files to a Postgres/Supabase database.

This script is a convenience wrapper that uses `psql` if you provide
`$env:SUPABASE_DATABASE_URL`. It also shows the supabase CLI commands
you can run if you prefer that workflow.

Note: For Supabase projects it's usually easiest to paste the SQL into
the Supabase SQL Editor in the dashboard.
#>

if (-not $env:SUPABASE_DATABASE_URL) {
  Write-Host "SUPABASE_DATABASE_URL not set. Please set it to your Postgres connection string." -ForegroundColor Yellow
  Write-Host "Example (PowerShell):`n$env:SUPABASE_DATABASE_URL = 'postgres://postgres:<password>@<host>:5432/postgres'"
  exit 1
}

$files = @("supabase/migrations/001_create_profiles_and_swipes.sql", "supabase/migrations/002_rls_and_policies.sql", "supabase/migrations/003_seed_profiles.sql")

foreach ($f in $files) {
  if (-not (Test-Path $f)) { Write-Host "Missing $f" -ForegroundColor Red; exit 1 }
}

Write-Host "Applying migrations to $env:SUPABASE_DATABASE_URL" -ForegroundColor Cyan

foreach ($f in $files) {
  Write-Host "Applying $f ..." -NoNewline
  $rc = & psql $env:SUPABASE_DATABASE_URL -f $f
  if ($LASTEXITCODE -ne 0) {
    Write-Host " FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
  }
  Write-Host " OK" -ForegroundColor Green
}

Write-Host "Migrations applied. Verify in Supabase dashboard or via psql." -ForegroundColor Green

Write-Host "If you prefer supabase CLI, run:" -ForegroundColor Yellow
Write-Host "  supabase db query --file supabase/migrations/001_create_profiles_and_swipes.sql"
Write-Host "  supabase db query --file supabase/migrations/002_rls_and_policies.sql"
Write-Host "  supabase db query --file supabase/migrations/003_seed_profiles.sql"
