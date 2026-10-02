param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$SupabaseArgs
)

$ErrorActionPreference = 'Stop'

$expectedProjectRef = 'xsgzxadwuxuziubglvps'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$projectRefPath = Join-Path $repositoryRoot 'supabase\.temp\project-ref'
$pinnedCliWrapper = Join-Path $PSScriptRoot 'invoke-pinned-supabase.ps1'

if (-not (Test-Path -LiteralPath $projectRefPath)) {
  Write-Error 'Supabase is not linked. Refusing staging operation.'
  exit 2
}

$currentProjectRef = (Get-Content -Raw -LiteralPath $projectRefPath).Trim()
if ($currentProjectRef -cne $expectedProjectRef) {
  Write-Error "Refusing Supabase operation: expected staging project $expectedProjectRef but found $currentProjectRef."
  exit 3
}

if ($SupabaseArgs.Count -eq 0) {
  Write-Error 'No Supabase command was provided.'
  exit 4
}

if ($SupabaseArgs[0] -in @('link', 'unlink')) {
  Write-Error 'Project link changes are not allowed through the staging mutation wrapper.'
  exit 5
}

Write-Output "Verified staging target: $expectedProjectRef"
& $pinnedCliWrapper @SupabaseArgs
exit $LASTEXITCODE
