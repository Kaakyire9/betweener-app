<#
Check which columns exist on the `matches` table in the connected Postgres database.

Usage:
  $env:SUPABASE_DATABASE_URL = '<your connection string>'
  .\scripts\check_matches_columns.ps1

This script invokes `psql` and requires it to be installed and on PATH.
If you prefer, run the same SQL in the Supabase SQL Editor.
#>

if (-not $env:SUPABASE_DATABASE_URL) {
  Write-Host 'Please set SUPABASE_DATABASE_URL environment variable to your Postgres connection string.' -ForegroundColor Yellow
  Write-Host "Example: $env:SUPABASE_DATABASE_URL = 'postgres://postgres:...@db-host:5432/postgres'" -ForegroundColor Gray
  exit 1
}

$sql = @"
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matches'
ORDER BY ordinal_position;
"@

Write-Host "Querying 'matches' columns from: $env:SUPABASE_DATABASE_URL" -ForegroundColor Cyan

try {
  & psql $env:SUPABASE_DATABASE_URL -c $sql
} catch {
  Write-Host "Failed to run psql. Ensure psql is installed and SUPABASE_DATABASE_URL is correct." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 2
}
