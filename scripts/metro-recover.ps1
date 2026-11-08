[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8081,
  [switch]$HealthOnly,
  [switch]$NoStart,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExpoArguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectRootWithSeparator = $projectRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

function Get-ListeningProcessIds {
  param([int]$LocalPort)

  $pattern = "^\s*TCP\s+\S+:$LocalPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
  $ids = netstat -ano -p tcp | ForEach-Object {
    if ($_ -match $pattern) { [int]$Matches[1] }
  }
  return @($ids | Sort-Object -Unique)
}

function Get-MetroProjectRoot {
  param([int]$LocalPort)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "http://127.0.0.1:$LocalPort/status"
    $content = if ($response.Content -is [byte[]]) {
      [System.Text.Encoding]::UTF8.GetString($response.Content)
    } else {
      [string]$response.Content
    }
    if ($content.Trim() -ne 'packager-status:running') { return $null }
    $header = [string]$response.Headers['X-React-Native-Project-Root']
    if ([string]::IsNullOrWhiteSpace($header)) { return $null }
    return [System.Uri]::UnescapeDataString($header)
  } catch {
    return $null
  }
}

function Stop-ProjectMetro {
  param([int]$LocalPort)

  $processIds = @(Get-ListeningProcessIds -LocalPort $LocalPort)
  if ($processIds.Count -eq 0) {
    Write-Host "Metro is not listening on port $LocalPort."
    return
  }

  $reportedRoot = Get-MetroProjectRoot -LocalPort $LocalPort
  if (-not $reportedRoot) {
    throw "Port $LocalPort is occupied, but it did not identify itself as Metro. Nothing was stopped."
  }

  $resolvedReportedRoot = [System.IO.Path]::GetFullPath($reportedRoot)
  if (-not $resolvedReportedRoot.Equals($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Port $LocalPort belongs to Metro for '$resolvedReportedRoot', not '$projectRoot'. Nothing was stopped."
  }

  foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction Stop
    if ($process.ProcessName -ne 'node') {
      throw "Metro port $LocalPort is owned by '$($process.ProcessName)', not Node. Nothing was stopped."
    }
    Write-Host "Stopping stale Metro process $processId for this project..."
    Stop-Process -Id $processId -Force
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  while (@(Get-ListeningProcessIds -LocalPort $LocalPort).Count -gt 0) {
    if ([DateTime]::UtcNow -ge $deadline) {
      throw "Metro stopped, but port $LocalPort did not become available within 10 seconds."
    }
    Start-Sleep -Milliseconds 250
  }
}

function Remove-SafeCacheItem {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$AllowedRoot
  )

  if (-not (Test-Path -LiteralPath $Path)) { return }
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullAllowedRoot = [System.IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  if (-not $fullPath.StartsWith($fullAllowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove cache outside '$AllowedRoot': $fullPath"
  }
  Write-Host "Clearing $fullPath"
  Remove-Item -LiteralPath $fullPath -Recurse -Force
}

if ($HealthOnly) {
  $processIds = @(Get-ListeningProcessIds -LocalPort $Port)
  if ($processIds.Count -eq 0) {
    throw "Metro is not listening on port $Port."
  }

  $reportedRoot = Get-MetroProjectRoot -LocalPort $Port
  if (-not $reportedRoot) {
    throw "Port $Port is listening, but the Metro health endpoint is unavailable."
  }

  $resolvedReportedRoot = [System.IO.Path]::GetFullPath($reportedRoot)
  if (-not $resolvedReportedRoot.Equals($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Port $Port belongs to Metro for '$resolvedReportedRoot', not '$projectRoot'."
  }

  $processes = foreach ($processId in $processIds) {
    Get-Process -Id $processId -ErrorAction Stop
  }
  $processes | Select-Object Id, ProcessName, StartTime, CPU,
    @{Name = 'MemoryMB'; Expression = { [Math]::Round($_.PrivateMemorySize64 / 1MB, 1) } },
    Handles,
    @{Name = 'Threads'; Expression = { $_.Threads.Count }} | Format-Table -AutoSize

  if (($processes | Measure-Object -Property Handles -Maximum).Maximum -gt 30000) {
    Write-Warning 'Metro has crossed 30,000 handles. Run npm run metro:recover before it becomes unresponsive.'
  } else {
    Write-Host "Metro is healthy for '$projectRoot'."
  }
  exit 0
}

Stop-ProjectMetro -LocalPort $Port

foreach ($relativePath in @('.expo/cache', '.expo/web/cache', 'node_modules/.cache/metro')) {
  Remove-SafeCacheItem -Path (Join-Path $projectRoot $relativePath) -AllowedRoot $projectRoot
}

$localTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
foreach ($pattern in @('metro-cache', 'metro-*', 'haste-map-*')) {
  Get-ChildItem -LiteralPath $localTemp -Filter $pattern -Force -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-SafeCacheItem -Path $_.FullName -AllowedRoot $localTemp }
}

if ($NoStart) {
  Write-Host 'Metro recovery cleanup completed. Start it with npm run start.'
  exit 0
}

$expoCli = Join-Path $projectRoot 'node_modules/expo/bin/cli'
if (-not (Test-Path -LiteralPath $expoCli)) {
  throw "Expo CLI was not found at '$expoCli'. Run npm install first."
}

Write-Host "Starting a clean Metro session on port $Port..."
Push-Location $projectRoot
try {
  & node $expoCli start --clear --port $Port @ExpoArguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
