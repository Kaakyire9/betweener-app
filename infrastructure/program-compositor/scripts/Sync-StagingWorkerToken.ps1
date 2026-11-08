param(
  [string]$AwsProfile = 'betweener-staging',
  [string]$Region = 'eu-north-1',
  [string]$ProjectRef = 'xsgzxadwuxuziubglvps'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedAccount = '425805163493'
$secretName = 'betweener/staging/program-compositor/worker-token'
$secretKey = 'BROADCAST_COMPOSITOR_WORKER_TOKEN'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$supabaseWrapper = Join-Path $repositoryRoot 'scripts\invoke-pinned-supabase.ps1'
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("betweener-compositor-token-" + [guid]::NewGuid())
$token = $null

try {
  $identity = aws sts get-caller-identity --profile $AwsProfile --output json | ConvertFrom-Json
  if ($identity.Account -ne $expectedAccount) { throw 'Refusing to rotate a non-staging AWS account.' }
  if ($Region -ne 'eu-north-1') { throw 'Refusing to rotate outside eu-north-1.' }
  if ($ProjectRef -ne 'xsgzxadwuxuziubglvps') { throw 'Refusing to rotate a non-staging Supabase project.' }

  New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
  $bytes = New-Object byte[] 48
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($bytes)
  } finally {
    $random.Dispose()
  }
  $token = [Convert]::ToBase64String($bytes)
  $encoding = New-Object Text.UTF8Encoding($false)
  $awsSecretFile = Join-Path $temporaryDirectory 'aws-secret.txt'
  $supabaseEnvFile = Join-Path $temporaryDirectory 'supabase-secret.env'
  [IO.File]::WriteAllText($awsSecretFile, $token, $encoding)
  [IO.File]::WriteAllText($supabaseEnvFile, "$secretKey=$token`n", $encoding)

  aws secretsmanager put-secret-value `
    --secret-id $secretName `
    --secret-string "file://$awsSecretFile" `
    --profile $AwsProfile `
    --region $Region `
    --query '{Name:Name,VersionId:VersionId}' `
    --output json | Out-Null

  & powershell -NoProfile -ExecutionPolicy Bypass -File $supabaseWrapper `
    secrets set --env-file $supabaseEnvFile --project-ref $ProjectRef | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Supabase staging secret update failed.' }

  $awsValue = aws secretsmanager get-secret-value `
    --secret-id $secretName `
    --profile $AwsProfile `
    --region $Region `
    --query SecretString `
    --output text
  $supabaseOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $supabaseWrapper `
    secrets list --project-ref $ProjectRef --output json
  if ($LASTEXITCODE -ne 0) { throw 'Supabase staging secret verification failed.' }
  $supabaseList = ($supabaseOutput -join "`n") | ConvertFrom-Json
  $remoteEntry = $supabaseList | Where-Object { $_.name -eq $secretKey } | Select-Object -First 1

  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha.ComputeHash($encoding.GetBytes($token))
    $localDigest = ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }

  if ($awsValue -ne $token) { throw 'AWS Secrets Manager verification did not match.' }
  if ($null -eq $remoteEntry -or $remoteEntry.value -ne $localDigest) {
    throw 'Supabase secret digest verification did not match.'
  }

  [pscustomobject]@{
    AwsAccount = $expectedAccount
    AwsRegion = $Region
    SupabaseProject = $ProjectRef
    SecretName = $secretName
    AwsVerified = $true
    SupabaseVerified = $true
    ValuesMatch = $true
  } | ConvertTo-Json
} finally {
  $token = $null
  if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
  }
}
