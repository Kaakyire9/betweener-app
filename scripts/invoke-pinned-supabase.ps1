param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$SupabaseArgs
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$cliPath = Join-Path $repositoryRoot 'node_modules\.bin\supabase.cmd'
$authModulePath = Join-Path $PSScriptRoot 'supabase-auth.psm1'
if (-not (Test-Path -LiteralPath $cliPath)) {
  Write-Error 'Pinned Supabase CLI binary is missing.'
  exit 127
}
if (-not (Test-Path -LiteralPath $authModulePath)) {
  Write-Error 'Supabase authentication module is missing.'
  exit 127
}

Import-Module $authModulePath -Force

$previousAccessToken = $env:SUPABASE_ACCESS_TOKEN
$previousNoKeyring = $env:SUPABASE_NO_KEYRING
$managedAccessToken = $null
$nativeExitCode = $null

# Supabase writes progress messages to stderr even when it succeeds. Keep native
# stderr visible, but use only the native process exit code as the result.
$previousErrorActionPreference = $ErrorActionPreference
try {
  # Never allow this wrapper to fall back to the unreliable Windows keyring.
  $env:SUPABASE_NO_KEYRING = '1'
  if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
    $credentialPath = Get-BetweenerSupabasePatPath
    if (Test-Path -LiteralPath $credentialPath -PathType Leaf) {
      $managedAccessToken = Get-BetweenerSupabasePat
      $env:SUPABASE_ACCESS_TOKEN = $managedAccessToken
    }
  }

  $ErrorActionPreference = 'Continue'
  & $cliPath @SupabaseArgs 2>&1 | ForEach-Object { Write-Output $_.ToString() }
  $nativeExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
  $managedAccessToken = $null
  if ($null -eq $previousAccessToken) {
    Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:SUPABASE_ACCESS_TOKEN = $previousAccessToken
  }
  if ($null -eq $previousNoKeyring) {
    Remove-Item Env:SUPABASE_NO_KEYRING -ErrorAction SilentlyContinue
  } else {
    $env:SUPABASE_NO_KEYRING = $previousNoKeyring
  }
}

if ($null -eq $nativeExitCode) {
  Write-Error 'Pinned Supabase CLI did not return a process exit code.'
  exit 126
}

exit $nativeExitCode
