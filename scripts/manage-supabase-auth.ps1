param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Setup', 'Status', 'Remove')]
  [string]$Action
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$authModulePath = Join-Path $PSScriptRoot 'supabase-auth.psm1'
Import-Module $authModulePath -Force

if ($Action -eq 'Setup') {
  $accessToken = $null
  try {
    $clipboardValue = Get-Clipboard -Raw
    $accessToken = if ($null -eq $clipboardValue) { '' } else { $clipboardValue.Trim() }
    if ([string]::IsNullOrWhiteSpace($accessToken)) {
      throw 'Clipboard does not contain a Supabase personal access token.'
    }

    $statusCode = Test-BetweenerSupabasePat -AccessToken $accessToken
    if ($statusCode -ne 200) {
      throw "Supabase rejected the PAT during setup (HTTP $statusCode). The encrypted credential was not changed."
    }

    $credentialPath = Save-BetweenerSupabasePat -AccessToken $accessToken
    Write-Output 'Supabase PAT validated and stored with Windows DPAPI.'
    Write-Output "Credential: $credentialPath"
  } finally {
    $accessToken = $null
    Set-Clipboard -Value ' '
  }
  exit 0
}

if ($Action -eq 'Status') {
  $credentialPath = Get-BetweenerSupabasePatPath
  if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
    $result = [pscustomobject]@{
      Configured = $false
      Credential = $credentialPath
      DirectApiStatus = 'not_tested'
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    exit 1
  }

  $accessToken = $null
  try {
    $accessToken = Get-BetweenerSupabasePat
    $statusCode = Test-BetweenerSupabasePat -AccessToken $accessToken
    $credential = Get-Item -LiteralPath $credentialPath
    $result = [pscustomobject]@{
      Configured = $true
      DpapiDecryptable = $true
      Credential = $credentialPath
      LastWriteTimeUtc = $credential.LastWriteTimeUtc
      TokenLength = $accessToken.Length
      DirectApiStatus = $statusCode
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    if ($statusCode -ne 200) {
      exit 1
    }
  } finally {
    $accessToken = $null
  }
  exit 0
}

$credentialPath = Get-BetweenerSupabasePatPath
$removed = Remove-BetweenerSupabasePat
$result = [pscustomobject]@{
  Removed = $removed
  Credential = $credentialPath
}
Write-Output ($result | ConvertTo-Json -Compress)
