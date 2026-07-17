$ErrorActionPreference = "Stop"

$vars = @(
  "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY",
  "EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY",
  "EXPO_PUBLIC_REVENUECAT_SILVER_ENTITLEMENT",
  "EXPO_PUBLIC_REVENUECAT_GOLD_ENTITLEMENT",
  "EXPO_PUBLIC_REVENUECAT_SILVER_MONTHLY_PACKAGE",
  "EXPO_PUBLIC_REVENUECAT_SILVER_QUARTERLY_PACKAGE",
  "EXPO_PUBLIC_REVENUECAT_SILVER_ANNUAL_PACKAGE",
  "EXPO_PUBLIC_REVENUECAT_GOLD_MONTHLY_PACKAGE",
  "EXPO_PUBLIC_REVENUECAT_GOLD_QUARTERLY_PACKAGE",
  "EXPO_PUBLIC_REVENUECAT_GOLD_ANNUAL_PACKAGE",
  "EXPO_PUBLIC_REVENUECAT_SILVER_MONTHLY_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_SILVER_QUARTERLY_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_SILVER_ANNUAL_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_GOLD_MONTHLY_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_GOLD_QUARTERLY_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_GOLD_ANNUAL_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_MONTHLY_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_QUARTERLY_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_ANNUAL_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_MONTHLY_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_QUARTERLY_PRODUCT",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_ANNUAL_PRODUCT"
)

$environments = @("development", "preview", "production")
$envPath = Join-Path $PSScriptRoot "..\.env"
$tempPath = Join-Path $PSScriptRoot "..\.eas-revenuecat-sync.env"

if (-not (Test-Path $envPath)) {
  throw ".env file not found at $envPath"
}

$pairs = @{}
Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') {
    return
  }

  $parts = $_ -split '=', 2
  $pairs[$parts[0].Trim()] = $parts[1]
}

foreach ($name in $vars) {
  if (-not $pairs.ContainsKey($name)) {
    throw "Missing required variable in .env: $name"
  }
}

$lines = foreach ($name in $vars) {
  "${name}=$($pairs[$name])"
}

Set-Content -Path $tempPath -Value $lines

try {
  foreach ($environment in $environments) {
    Write-Host "Pushing RevenueCat env vars to $environment"
    & eas.cmd env:push $environment --path $tempPath --force
    if ($LASTEXITCODE -ne 0) {
      throw "Failed syncing RevenueCat variables to $environment"
    }
  }
}
finally {
  if (Test-Path $tempPath) {
    Remove-Item -Path $tempPath -Force
  }
}

Write-Host "RevenueCat EAS variables synced to development, preview, and production."
