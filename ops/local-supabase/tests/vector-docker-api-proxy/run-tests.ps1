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
$ConfigPath = (Resolve-Path (Join-Path $TestDirectory '..\..\haproxy-vector-readonly.cfg')).Path
$MockPath = (Resolve-Path (Join-Path $TestDirectory 'mock-docker-api.sh')).Path
$RunId = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$NetworkName = "betweener-b2-test-$RunId"
$MockName = "betweener-b2-mock-$RunId"
$ProxyName = "betweener-b2-proxy-$RunId"
$OwnerLabel = "com.betweener.local-supabase.test-run=$RunId"
$Results = [System.Collections.Generic.List[object]]::new()
$RunError = $null

function Invoke-Docker {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,
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
        Output = $output
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

function Test-ContainerHardening {
    param(
        [Parameter(Mandatory)][string]$ContainerName,
        [Parameter(Mandatory)][bool]$ExpectConfigMount
    )

    $inspect = (Invoke-Docker -Arguments @('inspect', $ContainerName, '--format', '{{json .}}')).Text | ConvertFrom-Json
    $networks = @($inspect.NetworkSettings.Networks.PSObject.Properties.Name)
    $mountTargets = @($inspect.Mounts | ForEach-Object { $_.Destination })
    $checks = [ordered]@{
        user = $inspect.Config.User -eq '99:99'
        supplementaryGroup = @($inspect.HostConfig.GroupAdd) -contains '0'
        readOnly = $inspect.HostConfig.ReadonlyRootfs -eq $true
        capDrop = @($inspect.HostConfig.CapDrop) -contains 'ALL'
        noNewPrivileges = @($inspect.HostConfig.SecurityOpt | Where-Object { $_ -like 'no-new-privileges*' }).Count -eq 1
        pids = $inspect.HostConfig.PidsLimit -eq 64
        memory = $inspect.HostConfig.Memory -eq 67108864
        cpu = $inspect.HostConfig.NanoCpus -eq 250000000
        restart = $inspect.HostConfig.RestartPolicy.Name -eq 'no'
        oneNetwork = $networks.Count -eq 1
        expectedNetwork = $networks[0] -eq $NetworkName
        noPublishedPorts = @($inspect.HostConfig.PortBindings.PSObject.Properties).Count -eq 0
        noDockerSocket = -not ($mountTargets -contains '/var/run/docker.sock')
    }
    if ($ExpectConfigMount) {
        $checks['configMount'] = $mountTargets -contains '/usr/local/etc/haproxy/haproxy.cfg'
    }

    $failedChecks = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
    $passed = $failedChecks.Count -eq 0
    Add-Result -Name "hardening:$ContainerName" -Passed $passed -Detail "failed=$($failedChecks -join ','); uid=99 gid=99 group=0 ro/caps/nnp/limits/no-ports/one-network/no-socket"
}

function Invoke-RawRequest {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string]$TestId
    )

    $request = "$Method $Target HTTP/1.1`r`nHost: docker`r`nX-Test-Id: $TestId`r`nConnection: close`r`n`r`n"
    $dockerPath = (Get-Command docker -ErrorAction Stop).Source
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $dockerPath
    $startInfo.Arguments = "--context $DockerContext exec -i $ProxyName socat -T 5 STDIO,ignoreeof TCP:127.0.0.1:2375"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw 'Failed to start the Docker request client.'
    }
    $process.StandardInput.Write($request)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    if (-not $process.WaitForExit(10000)) {
        $process.Kill()
        throw "Request timed out: $Method $Target"
    }
    if ($process.ExitCode -ne 0) {
        throw "Request client failed ($($process.ExitCode)): $stderr"
    }

    $statusMatch = [regex]::Match($stdout, '^HTTP/[0-9.]+\s+(\d{3})')
    if (-not $statusMatch.Success) {
        throw "No HTTP status returned for $Method $Target. Response: $stdout"
    }

    [pscustomobject]@{
        Status = [int]$statusMatch.Groups[1].Value
        Response = $stdout
    }
}

function Test-PolicyCase {
    param(
        [Parameter(Mandatory)][pscustomobject]$Case,
        [Parameter(Mandatory)][int]$Index
    )

    $testId = "t$($Index)_$RunId"
    $response = Invoke-RawRequest -Method $Case.Method -Target $Case.Target -TestId $testId
    Start-Sleep -Milliseconds 100
    $mockLogs = (Invoke-Docker -Arguments @('logs', $MockName)).Text
    $forwardedLines = @($mockLogs -split "`r?`n" | Where-Object { $_ -like "*MOCK_FORWARD test=$testId *" })
    $statusPassed = @($Case.Status) -contains $response.Status
    $forwardPassed = if ($Case.Forward) {
        $forwardedLines.Count -eq 1 -and $forwardedLines[0] -like "*method=$($Case.Method) target=$($Case.Target)"
    } else {
        $forwardedLines.Count -eq 0
    }
    $bodyPassed = if ($Case.Stream) {
        $response.Response.Contains('event-one') -and $response.Response.Contains('event-two')
    } else {
        $true
    }
    $passed = $statusPassed -and $forwardPassed -and $bodyPassed
    $observedForward = if ($forwardedLines.Count -gt 0) { $forwardedLines -join ' | ' } else { 'none' }
    $bodyDetail = if ($bodyPassed) {
        'body=ok'
    } else {
        "eventOne=$($response.Response.Contains('event-one')); eventTwo=$($response.Response.Contains('event-two')); tail=$((($response.Response -replace "`r", '<CR>' -replace "`n", '<LF>'), '')[0].Substring([Math]::Max(0, $response.Response.Length - 120)))"
    }
    Add-Result -Name $Case.Name -Passed $passed -Detail "status=$($response.Status); forwarded=$observedForward; expectedForward=$($Case.Forward); $bodyDetail"
}

try {
    $configText = Get-Content -LiteralPath $ConfigPath -Raw
    $quotedBackend = $configText.Contains('server docker "${DOCKER_BACKEND}"')
    $noDecode = -not $configText.Contains('url_dec')
    Add-Result -Name 'config:literal-environment-expansion' -Passed ($quotedBackend -and $noDecode) -Detail "quotedBackend=$quotedBackend; urlDecAbsent=$noDecode"

    $imageInspect = (Invoke-Docker -Arguments @('image', 'inspect', $Image, '--format', '{{json .}}')).Text | ConvertFrom-Json
    $identityPassed = $imageInspect.Id -eq $ExpectedDigest -and $imageInspect.Descriptor.digest -eq $ExpectedDigest -and $imageInspect.Architecture -eq 'amd64' -and $imageInspect.Os -eq 'linux'
    Add-Result -Name 'image:identity' -Passed $identityPassed -Detail "id=$($imageInspect.Id); descriptor=$($imageInspect.Descriptor.digest); platform=$($imageInspect.Os)/$($imageInspect.Architecture)"
    if (-not $identityPassed) {
        throw 'Pinned image identity does not match the approved linux/amd64 digest.'
    }

    $commonRun = @(
        'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--user', '99:99', '--group-add', '0',
        '--pids-limit', '64', '--memory', '64m', '--cpus', '0.25', '--restart', 'no',
        '--mount', "type=bind,src=$ConfigPath,dst=/usr/local/etc/haproxy/haproxy.cfg,readonly"
    )
    $valid = Invoke-Docker -Arguments ($commonRun + @('--env', 'DOCKER_BACKEND=127.0.0.1:9', $Image, 'haproxy', '-c', '-f', '/usr/local/etc/haproxy/haproxy.cfg')) -AllowFailure
    Add-Result -Name 'config:haproxy-check' -Passed ($valid.ExitCode -eq 0) -Detail ($valid.Text -replace "`r?`n", ' ')
    if ($valid.ExitCode -ne 0) {
        throw 'HAProxy configuration validation failed.'
    }

    $unset = Invoke-Docker -Arguments ($commonRun + @($Image, 'haproxy', '-c', '-f', '/usr/local/etc/haproxy/haproxy.cfg')) -AllowFailure
    Add-Result -Name 'config:unset-backend-fails' -Passed ($unset.ExitCode -ne 0) -Detail "exit=$($unset.ExitCode)"
    $empty = Invoke-Docker -Arguments ($commonRun + @('--env', 'DOCKER_BACKEND=', $Image, 'haproxy', '-c', '-f', '/usr/local/etc/haproxy/haproxy.cfg')) -AllowFailure
    Add-Result -Name 'config:empty-backend-fails' -Passed ($empty.ExitCode -ne 0) -Detail "exit=$($empty.ExitCode)"
    if ($unset.ExitCode -eq 0 -or $empty.ExitCode -eq 0) {
        throw 'HAProxy did not fail closed when DOCKER_BACKEND was missing.'
    }

    $helpers = Invoke-Docker -Arguments @(
        'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--user', '99:99', '--group-add', '0',
        '--pids-limit', '64', '--memory', '64m', '--cpus', '0.25', '--restart', 'no',
        '--entrypoint', '/bin/sh', $Image, '-c',
        'id; command -v haproxy; command -v socat; command -v wget; command -v getent'
    )
    $helperPassed = $helpers.Text.Contains('uid=99(haproxy) gid=99(haproxy) groups=0(root),99(haproxy)') -and
        $helpers.Text.Contains('/usr/local/sbin/haproxy') -and $helpers.Text.Contains('/usr/bin/socat') -and
        $helpers.Text.Contains('/usr/bin/wget') -and $helpers.Text.Contains('/usr/bin/getent')
    Add-Result -Name 'image:helpers-and-identity' -Passed $helperPassed -Detail ($helpers.Text -replace "`r?`n", '; ')

    Invoke-Docker -Arguments @('network', 'create', '--internal', '--label', $OwnerLabel, '--label', 'com.betweener.local-supabase.test=vector-docker-api-proxy', $NetworkName) | Out-Null

    Invoke-Docker -Arguments @(
        'run', '-d', '--name', $MockName, '--network', $NetworkName, '--network-alias', 'mock-docker-api',
        '--label', $OwnerLabel, '--label', 'com.betweener.local-supabase.test=vector-docker-api-proxy',
        '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '99:99', '--group-add', '0',
        '--pids-limit', '64', '--memory', '64m', '--cpus', '0.25', '--restart', 'no',
        '--mount', "type=bind,src=$MockPath,dst=/fixtures/mock-docker-api.sh,readonly",
        '--entrypoint', 'socat', $Image, 'TCP-LISTEN:18080,reuseaddr,fork', 'EXEC:/fixtures/mock-docker-api.sh'
    ) | Out-Null

    Invoke-Docker -Arguments @(
        'run', '-d', '--name', $ProxyName, '--network', $NetworkName,
        '--label', $OwnerLabel, '--label', 'com.betweener.local-supabase.test=vector-docker-api-proxy',
        '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '99:99', '--group-add', '0',
        '--pids-limit', '64', '--memory', '64m', '--cpus', '0.25', '--restart', 'no',
        '--env', 'DOCKER_BACKEND=mock-docker-api:18080',
        '--mount', "type=bind,src=$ConfigPath,dst=/usr/local/etc/haproxy/haproxy.cfg,readonly",
        $Image, 'haproxy', '-W', '-db', '-f', '/usr/local/etc/haproxy/haproxy.cfg'
    ) | Out-Null

    Start-Sleep -Milliseconds 500
    foreach ($containerName in @($MockName, $ProxyName)) {
        $running = (Invoke-Docker -Arguments @('inspect', $containerName, '--format', '{{.State.Running}}')).Text.Trim() -eq 'true'
        if (-not $running) {
            $logs = (Invoke-Docker -Arguments @('logs', $containerName) -AllowFailure).Text
            throw "$containerName did not stay running: $logs"
        }
    }

    Test-ContainerHardening -ContainerName $MockName -ExpectConfigMount $false
    Test-ContainerHardening -ContainerName $ProxyName -ExpectConfigMount $true

    $health = $null
    $healthPassed = $false
    $healthAttempt = 0
    for ($healthAttempt = 1; $healthAttempt -le 10; $healthAttempt++) {
        $health = Invoke-Docker -Arguments @('exec', $ProxyName, 'wget', '-q', '-O', '-', 'http://127.0.0.1:2375/_ping') -AllowFailure
        $healthPassed = $health.ExitCode -eq 0 -and $health.Text.Trim() -eq 'OK'
        if ($healthPassed) { break }
        Start-Sleep -Milliseconds 250
    }
    Add-Result -Name 'healthcheck:wget-command' -Passed $healthPassed -Detail "attempt=$healthAttempt; exit=$($health.ExitCode); output=$($health.Text -replace "`r?`n", ' ')"

    $stream = Invoke-Docker -Arguments @('exec', $ProxyName, 'wget', '-q', '-O', '-', 'http://127.0.0.1:2375/events?since=0') -AllowFailure
    $streamPassed = $stream.ExitCode -eq 0 -and $stream.Text.Contains('event-one') -and $stream.Text.Contains('event-two')
    Add-Result -Name 'streaming:wget-completes' -Passed $streamPassed -Detail "exit=$($stream.ExitCode); eventOne=$($stream.Text.Contains('event-one')); eventTwo=$($stream.Text.Contains('event-two'))"

    $cases = @(
        [pscustomobject]@{ Name='allow:ping'; Method='GET'; Target='/_ping'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:ping-versioned'; Method='GET'; Target='/v1.56/_ping'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:version'; Method='GET'; Target='/version'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:version-versioned'; Method='GET'; Target='/v1.56/version'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:events-query'; Method='GET'; Target='/events?since=0&filters=%7B%22type%22%3A%5B%22container%22%5D%7D'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:events-versioned'; Method='GET'; Target='/v1.56/events?until=9'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:containers-query'; Method='GET'; Target='/containers/json?all=1&filters=%7B%22label%22%3A%5B%22com.supabase.cli.project%3Dbetweener-app%22%5D%7D'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:containers-versioned'; Method='GET'; Target='/v1.56/containers/json?all=1'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:container-json'; Method='GET'; Target='/containers/abc123/json'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:container-json-versioned'; Method='GET'; Target='/v1.56/containers/supabase_db_betweener-app/json'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:container-logs-stream'; Method='GET'; Target='/containers/supabase_db_betweener-app/logs?follow=1&stdout=1&stderr=1&since=0'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='allow:container-logs-versioned'; Method='GET'; Target='/v1.56/containers/abc123/logs?follow=0&tail=10'; Status=@(200); Forward=$true; Stream=$false },
        [pscustomobject]@{ Name='deny:post-allowed-path'; Method='POST'; Target='/containers/json'; Status=@(405); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:delete-lifecycle'; Method='DELETE'; Target='/containers/abc123'; Status=@(405); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:start-lifecycle'; Method='POST'; Target='/containers/abc123/start'; Status=@(405); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:exec'; Method='POST'; Target='/containers/abc123/exec'; Status=@(405); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:attach'; Method='POST'; Target='/containers/abc123/attach'; Status=@(405); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:archive'; Method='GET'; Target='/containers/abc123/archive?path=%2Ftmp'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:export'; Method='GET'; Target='/containers/abc123/export'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:images'; Method='GET'; Target='/images/json'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:info'; Method='GET'; Target='/info'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:encoded-slash'; Method='GET'; Target='/containers%2Fjson'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:encoded-slash-in-id'; Method='GET'; Target='/containers/abc%2Fdef/json'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:encoded-dot-segment'; Method='GET'; Target='/%2e%2e/containers/json'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:encoded-dot-id'; Method='GET'; Target='/containers/%2e%2e/json'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:repeated-slash'; Method='GET'; Target='//containers/json'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:trailing-slash'; Method='GET'; Target='/containers/json/'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:path-parameter'; Method='GET'; Target='/containers/json;ignored'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:absolute-form'; Method='GET'; Target='http://docker/containers/json'; Status=@(403); Forward=$false; Stream=$false },
        [pscustomobject]@{ Name='deny:unrelated'; Method='GET'; Target='/volumes'; Status=@(403); Forward=$false; Stream=$false }
    )

    for ($index = 0; $index -lt $cases.Count; $index++) {
        Test-PolicyCase -Case $cases[$index] -Index ($index + 1)
    }
} catch {
    $RunError = $_
} finally {
    foreach ($containerName in @($ProxyName, $MockName)) {
        Invoke-Docker -Arguments @('rm', '-f', $containerName) -AllowFailure | Out-Null
    }
    Invoke-Docker -Arguments @('network', 'rm', $NetworkName) -AllowFailure | Out-Null

    $remainingContainers = (Invoke-Docker -Arguments @('ps', '-a', '--filter', "label=$OwnerLabel", '--format', '{{.Names}}') -AllowFailure).Text.Trim()
    $remainingNetworks = (Invoke-Docker -Arguments @('network', 'ls', '--filter', "label=$OwnerLabel", '--format', '{{.Name}}') -AllowFailure).Text.Trim()
    $cleanupPassed = [string]::IsNullOrWhiteSpace($remainingContainers) -and [string]::IsNullOrWhiteSpace($remainingNetworks)
    Add-Result -Name 'cleanup:temporary-resources' -Passed $cleanupPassed -Detail "containers='$remainingContainers'; networks='$remainingNetworks'"
}

$Results | Format-Table -AutoSize | Out-String -Width 260 | Write-Host
$failed = @($Results | Where-Object { $_.Result -eq 'FAIL' })
if ($RunError) {
    throw $RunError
}
if ($failed.Count -gt 0) {
    throw "$($failed.Count) vector Docker API proxy tests failed."
}
