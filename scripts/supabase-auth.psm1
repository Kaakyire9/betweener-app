Set-StrictMode -Version Latest

function Get-BetweenerSupabasePatPath {
  if (-not [string]::IsNullOrWhiteSpace($env:BETWEENER_SUPABASE_PAT_PATH)) {
    return [IO.Path]::GetFullPath($env:BETWEENER_SUPABASE_PAT_PATH)
  }

  $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
  if ([string]::IsNullOrWhiteSpace($localAppData)) {
    throw 'Windows LocalApplicationData could not be resolved.'
  }

  Join-Path $localAppData 'Betweener\supabase-cli\access-token.dpapi'
}

function Assert-BetweenerSupabasePatFormat {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccessToken
  )

  if ($AccessToken -cnotmatch '^sbp_(?:(?:oauth|v0)_)?[a-f0-9]{40}$') {
    throw 'Clipboard content is not a supported Supabase personal access token.'
  }
}

function Protect-BetweenerSupabasePat {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccessToken
  )

  Assert-BetweenerSupabasePatFormat -AccessToken $AccessToken

  $secureToken = ConvertTo-SecureString -String $AccessToken -AsPlainText -Force
  try {
    ConvertFrom-SecureString -SecureString $secureToken
  } finally {
    $secureToken.Dispose()
  }
}

function Unprotect-BetweenerSupabasePat {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EncryptedToken
  )

  $secureToken = ConvertTo-SecureString -String $EncryptedToken
  $tokenPointer = [IntPtr]::Zero
  try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $accessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    Assert-BetweenerSupabasePatFormat -AccessToken $accessToken
    $accessToken
  } finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    $secureToken.Dispose()
  }
}

function Save-BetweenerSupabasePat {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccessToken
  )

  $credentialPath = Get-BetweenerSupabasePatPath
  $credentialDirectory = Split-Path -Parent $credentialPath
  $temporaryPath = "$credentialPath.$([Guid]::NewGuid().ToString('N')).tmp"
  $encryptedToken = Protect-BetweenerSupabasePat -AccessToken $AccessToken

  New-Item -ItemType Directory -Path $credentialDirectory -Force | Out-Null
  try {
    Set-Content -LiteralPath $temporaryPath -Value $encryptedToken -Encoding ASCII -NoNewline
    Move-Item -LiteralPath $temporaryPath -Destination $credentialPath -Force
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
    $encryptedToken = $null
  }

  $credentialPath
}

function Get-BetweenerSupabasePat {
  $credentialPath = Get-BetweenerSupabasePatPath
  if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
    throw "Encrypted Supabase PAT is not configured. Run 'npm run supabase:auth:setup'."
  }

  $encryptedToken = (Get-Content -LiteralPath $credentialPath -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($encryptedToken)) {
    throw "Encrypted Supabase PAT file is empty: $credentialPath"
  }

  try {
    Unprotect-BetweenerSupabasePat -EncryptedToken $encryptedToken
  } catch {
    throw "Encrypted Supabase PAT cannot be decrypted by this Windows user: $credentialPath"
  } finally {
    $encryptedToken = $null
  }
}

function Test-BetweenerSupabasePat {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AccessToken
  )

  Assert-BetweenerSupabasePatFormat -AccessToken $AccessToken

  try {
    $response = Invoke-WebRequest `
      -Uri 'https://api.supabase.com/v1/projects' `
      -Headers @{ Authorization = "Bearer $AccessToken" } `
      -UseBasicParsing `
      -TimeoutSec 20
    [int]$response.StatusCode
  } catch {
    if ($null -ne $_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw 'Supabase Management API could not be reached.'
  }
}

function Remove-BetweenerSupabasePat {
  $credentialPath = Get-BetweenerSupabasePatPath
  if (Test-Path -LiteralPath $credentialPath -PathType Leaf) {
    Remove-Item -LiteralPath $credentialPath -Force
    return $true
  }
  $false
}

Export-ModuleMember -Function @(
  'Get-BetweenerSupabasePatPath',
  'Save-BetweenerSupabasePat',
  'Get-BetweenerSupabasePat',
  'Test-BetweenerSupabasePat',
  'Remove-BetweenerSupabasePat'
)
