[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_.-]+$')]
    [string]$DockerContext = 'desktop-linux'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Image = 'haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2'
$ExpectedDigest = 'sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2'
$TestDirectory = Split-Path -Parent $PSCommandPath
$ComposePath = (Resolve-Path (Join-Path $TestDirectory '..\..\vector-docker-api-proxy.compose.yml')).Path
$RunId = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$ContainerName = "betweener-logging-test-$RunId"
$OwnerLabel = "com.betweener.local-supabase.logging-test=$RunId"
$Results = [System.Collections.Generic.List[object]]::new()

function Invoke-Docker {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& docker --context $DockerContext @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if (-not $AllowFailure -and $exitCode -ne 0) {
        throw "docker $($Arguments -join ' ') failed ($exitCode): $($output -join [Environment]::NewLine)"
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Text = $output -join [Environment]::NewLine
    }
}

function Add-Result {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][bool]$Passed,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Detail
    )

    $Results.Add([pscustomobject]@{
        Test = $Name
        Result = if ($Passed) { 'PASS' } else { 'FAIL' }
        Detail = $Detail
    })
}

function Assert-LoggingPolicy {
    param($Logging)

    if ($null -eq $Logging) {
        throw 'Logging policy is missing.'
    }
    $driver = $Logging.PSObject.Properties['driver']
    $options = $Logging.PSObject.Properties['options']
    $maxSize = if ($null -ne $options) { $options.Value.PSObject.Properties['max-size'] } else { $null }
    $maxFile = if ($null -ne $options) { $options.Value.PSObject.Properties['max-file'] } else { $null }
    if ($null -eq $driver -or $driver.Value -ne 'json-file' -or
        $null -eq $maxSize -or [string]$maxSize.Value -ne '5m' -or
        $null -eq $maxFile -or [string]$maxFile.Value -ne '2') {
        throw 'Logging policy must be json-file with max-size=5m and max-file=2.'
    }
}

function Test-RejectedFixture {
    param(
        [Parameter(Mandatory)][string]$Name,
        $Fixture
    )

    $rejected = $false
    try {
        Assert-LoggingPolicy -Logging $Fixture
    } catch {
        $rejected = $true
    }
    Add-Result -Name $Name -Passed $rejected -Detail "rejected=$rejected"
}

try {
    $renderedText = (Invoke-Docker -Arguments @(
        'compose', '--project-name', 'betweener-local-supabase-vector-proxy',
        '--file', $ComposePath, 'config', '--format', 'json'
    )).Text
    $jsonStart = $renderedText.IndexOf('{')
    if ($jsonStart -lt 0) {
        throw 'Docker Compose did not return rendered JSON configuration.'
    }
    $rendered = $renderedText.Substring($jsonStart) | ConvertFrom-Json
    $renderedLogging = $rendered.services.'docker-api-proxy'.logging
    Assert-LoggingPolicy -Logging $renderedLogging
    Add-Result -Name 'compose:rendered-logging-policy' -Passed $true -Detail "driver=$($renderedLogging.driver); max-size=$($renderedLogging.options.'max-size'); max-file=$($renderedLogging.options.'max-file')"

    $validFixture = [pscustomobject]@{
        driver = 'json-file'
        options = [pscustomobject]@{ 'max-size' = '5m'; 'max-file' = '2' }
    }
    Assert-LoggingPolicy -Logging $validFixture
    Add-Result -Name 'fixture:valid-policy' -Passed $true -Detail 'accepted=true'
    Test-RejectedFixture -Name 'fixture:missing-policy' -Fixture $null
    Test-RejectedFixture -Name 'fixture:incorrect-driver' -Fixture ([pscustomobject]@{
        driver = 'local'; options = [pscustomobject]@{ 'max-size' = '5m'; 'max-file' = '2' }
    })
    Test-RejectedFixture -Name 'fixture:incorrect-max-size' -Fixture ([pscustomobject]@{
        driver = 'json-file'; options = [pscustomobject]@{ 'max-size' = '10m'; 'max-file' = '2' }
    })
    Test-RejectedFixture -Name 'fixture:incorrect-max-file' -Fixture ([pscustomobject]@{
        driver = 'json-file'; options = [pscustomobject]@{ 'max-size' = '5m'; 'max-file' = '3' }
    })

    $imageInspect = (Invoke-Docker -Arguments @('image', 'inspect', $Image, '--format', '{{json .}}')).Text | ConvertFrom-Json
    if ($imageInspect.Id -ne $ExpectedDigest -or $imageInspect.Descriptor.digest -ne $ExpectedDigest) {
        throw 'Cached image identity does not match the approved digest.'
    }

    $run = Invoke-Docker -Arguments @(
        'run', '--name', $ContainerName, '--pull', 'never', '--network', 'none',
        '--label', $OwnerLabel, '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--user', '99:99', '--group-add', '0',
        '--pids-limit', '32', '--memory', '32m', '--cpus', '0.10', '--restart', 'no',
        '--log-driver', 'json-file', '--log-opt', 'max-size=5m', '--log-opt', 'max-file=2',
        '--entrypoint', '/bin/true', $Image
    ) -AllowFailure
    Add-Result -Name 'docker:accepts-log-options' -Passed ($run.ExitCode -eq 0) -Detail "exit=$($run.ExitCode); syntheticOutputBytes=$([Text.Encoding]::UTF8.GetByteCount($run.Text))"

    $logConfig = (Invoke-Docker -Arguments @('inspect', $ContainerName, '--format', '{{json .HostConfig.LogConfig}}')).Text | ConvertFrom-Json
    $runtimePassed = $logConfig.Type -eq 'json-file' -and
        $logConfig.Config.'max-size' -eq '5m' -and $logConfig.Config.'max-file' -eq '2'
    Add-Result -Name 'docker:hostconfig-logconfig' -Passed $runtimePassed -Detail "type=$($logConfig.Type); max-size=$($logConfig.Config.'max-size'); max-file=$($logConfig.Config.'max-file')"
} finally {
    Invoke-Docker -Arguments @('rm', '-f', $ContainerName) -AllowFailure | Out-Null
    $remaining = (Invoke-Docker -Arguments @('ps', '-a', '--filter', "label=$OwnerLabel", '--format', '{{.Names}}') -AllowFailure).Text.Trim()
    Add-Result -Name 'cleanup:temporary-container' -Passed ([string]::IsNullOrWhiteSpace($remaining)) -Detail "containers='$remaining'"
}

$Results | Format-Table -AutoSize | Out-String -Width 220 | Write-Host
$failed = @($Results | Where-Object { $_.Result -eq 'FAIL' })
if ($failed.Count -ne 0) {
    throw "$($failed.Count) logging-policy tests failed."
}
