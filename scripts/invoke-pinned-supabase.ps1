param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$SupabaseArgs
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$cliPath = Join-Path $repositoryRoot 'node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cliPath)) {
  Write-Error 'Pinned Supabase CLI binary is missing.'
  exit 127
}

# Supabase writes progress messages to stderr even when it succeeds. Keep native
# stderr visible, but use only the native process exit code as the result.
$previousErrorActionPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  & $cliPath @SupabaseArgs 2>&1 | ForEach-Object { Write-Output $_.ToString() }
  $nativeExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
}

if ($null -eq $nativeExitCode) {
  Write-Error 'Pinned Supabase CLI did not return a process exit code.'
  exit 126
}

exit $nativeExitCode
