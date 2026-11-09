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

  try {
    $ids = @(Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
    if ($ids.Count -gt 0) { return $ids }
  } catch {
    # Some Windows sessions cannot query TCP ownership. Try netstat next.
  }

  # Do not filter to tcp: that omits IPv6 listeners such as Metro's [::]:8081.
  $pattern = "^\s*TCP\s+\S+:$LocalPort\s+\S+\s+(?:LISTENING|LISTEN)\s+(\d+)\s*$"
  $ids = netstat -ano | ForEach-Object {
    if ($_ -match $pattern) { [int]$Matches[1] }
  }
  return @($ids | Sort-Object -Unique)
}

function Test-LocalPortInUse {
  param([int]$LocalPort)

  foreach ($address in @('127.0.0.1', '::1')) {
    $client = $null
    try {
      $family = if ($address.Contains(':')) { [System.Net.Sockets.AddressFamily]::InterNetworkV6 } else { [System.Net.Sockets.AddressFamily]::InterNetwork }
      $client = [System.Net.Sockets.TcpClient]::new($family)
      $connection = $client.ConnectAsync($address, $LocalPort)
      if ($connection.Wait(1000) -and $client.Connected) { return $true }
    } catch {
      # Connection refusal or timeout does not establish an active listener.
    } finally {
      if ($client) { $client.Dispose() }
    }
  }
  return $false
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
  $reportedRoot = Get-MetroProjectRoot -LocalPort $LocalPort
  if ($processIds.Count -eq 0) {
    if ($reportedRoot -or (Test-LocalPortInUse -LocalPort $LocalPort)) {
      throw "Port $LocalPort is in use, but Windows did not report its process owner. Nothing was stopped or cleared. Stop the existing server in its original terminal before retrying."
    }
    Write-Host "Metro is not listening on port $LocalPort."
    return
  }

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
  while (@(Get-ListeningProcessIds -LocalPort $LocalPort).Count -gt 0 -or (Test-LocalPortInUse -LocalPort $LocalPort)) {
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
  $reportedRoot = Get-MetroProjectRoot -LocalPort $Port
  if (-not $reportedRoot) {
    throw "Metro's health endpoint is unavailable on port $Port."
  }

  $resolvedReportedRoot = [System.IO.Path]::GetFullPath($reportedRoot)
  if (-not $resolvedReportedRoot.Equals($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Port $Port belongs to Metro for '$resolvedReportedRoot', not '$projectRoot'."
  }

  if ($processIds.Count -eq 0) {
    Write-Host "Metro is healthy for '$projectRoot' on port $Port. Windows process ownership is unavailable."
    exit 0
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
