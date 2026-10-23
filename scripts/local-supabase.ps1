[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [ValidateSet('Plan', 'Deploy', 'Rollback')]
    [string]$Action = 'Plan',
    [switch]$StartVector,
    [switch]$StopVector
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DockerContext = 'desktop-linux'
$ExpectedContextEndpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$ExpectedDaemonId = 'f88969ab-ece5-4d31-bed0-8fd8830c6b40'
$ProjectId = 'betweener-app'
$VectorName = 'supabase_vector_betweener-app'
$ExpectedVectorImage = 'public.ecr.aws/supabase/vector:0.53.0-alpine'
$SupabaseNetwork = 'supabase_network_betweener-app'
$RepairNetwork = 'betweener_vector_docker_api'
$ProxyName = 'betweener-vector-docker-api-proxy'
$ProxyImage = 'haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2'
$ExpectedProxyDigest = 'sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2'
$RepairLabelName = 'com.betweener.local-supabase.repair'
$RepairLabelValue = 'vector-docker-api-proxy'
$ComposeProject = 'betweener-local-supabase-vector-proxy'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ComposePath = Join-Path $RepoRoot 'ops\local-supabase\vector-docker-api-proxy.compose.yml'
$ProxyConfigPath = Join-Path $RepoRoot 'ops\local-supabase\haproxy-vector-readonly.cfg'
$SupabaseConfigPath = Join-Path $RepoRoot 'supabase\config.toml'

if ($StartVector -and $Action -ne 'Deploy') {
    throw '-StartVector is valid only with -Action Deploy.'
}
if ($StopVector -and $Action -ne 'Rollback') {
    throw '-StopVector is valid only with -Action Rollback.'
}

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
        throw "Docker command failed ($exitCode): docker --context $DockerContext $($Arguments -join ' ')`n$($output -join [Environment]::NewLine)"
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Text = $output -join [Environment]::NewLine
    }
}

function Get-ContainerInspect {
    param([Parameter(Mandatory)][string]$Name)

    $result = Invoke-Docker -Arguments @('container', 'inspect', $Name, '--format', '{{json .}}') -AllowFailure
    if ($result.ExitCode -ne 0) {
        if ($result.Text -match 'No such (object|container)') { return $null }
        throw "Could not inspect container '$Name': $($result.Text)"
    }
    $result.Text | ConvertFrom-Json
}

function Get-NetworkInspect {
    param([Parameter(Mandatory)][string]$Name)

    $result = Invoke-Docker -Arguments @('network', 'inspect', $Name, '--format', '{{json .}}') -AllowFailure
    if ($result.ExitCode -ne 0) {
        if ($result.Text -match 'not found|No such network') { return $null }
        throw "Could not inspect network '$Name': $($result.Text)"
    }
    $result.Text | ConvertFrom-Json
}

function Get-PropertyCount {
    param($Value)
    if ($null -eq $Value) { return 0 }
    @($Value.PSObject.Properties).Count
}

function Assert-DockerIdentity {
    $context = (Invoke-Docker -Arguments @('context', 'inspect', $DockerContext)).Text | ConvertFrom-Json
    if (@($context).Count -ne 1 -or $context[0].Endpoints.docker.Host -ne $ExpectedContextEndpoint) {
        throw "Docker context '$DockerContext' does not resolve to the verified Docker Desktop Linux endpoint."
    }

    $info = (Invoke-Docker -Arguments @('info', '--format', '{{json .}}')).Text | ConvertFrom-Json
    if ($info.ID -ne $ExpectedDaemonId -or $info.Name -ne 'docker-desktop' -or $info.OSType -ne 'linux' -or $info.Architecture -ne 'x86_64') {
        throw "Docker daemon identity changed. Expected id=$ExpectedDaemonId name=docker-desktop platform=linux/x86_64; observed id=$($info.ID) name=$($info.Name) platform=$($info.OSType)/$($info.Architecture)."
    }

    $image = (Invoke-Docker -Arguments @('image', 'inspect', $ProxyImage, '--format', '{{json .}}')).Text | ConvertFrom-Json
    if ($image.Id -ne $ExpectedProxyDigest -or $image.Descriptor.digest -ne $ExpectedProxyDigest -or $image.Os -ne 'linux' -or $image.Architecture -ne 'amd64') {
        throw 'The local proxy image is absent or does not match the approved linux/amd64 digest.'
    }
}

function Assert-RenderedComposeLogging {
    $result = Invoke-Docker -Arguments @(
        'compose', '--project-name', $ComposeProject, '--file', $ComposePath,
        'config', '--format', 'json'
    )
    $jsonStart = $result.Text.IndexOf('{')
    if ($jsonStart -lt 0) {
        throw 'Docker Compose did not return rendered JSON configuration.'
    }
    $rendered = $result.Text.Substring($jsonStart) | ConvertFrom-Json
    $serviceProperty = $rendered.services.PSObject.Properties['docker-api-proxy']
    if ($null -eq $serviceProperty) {
        throw "Rendered Compose configuration has no 'docker-api-proxy' service."
    }

    $loggingProperty = $serviceProperty.Value.PSObject.Properties['logging']
    if ($null -eq $loggingProperty) {
        throw "Rendered Compose configuration has no logging policy for 'docker-api-proxy'."
    }

    $logging = $loggingProperty.Value
    $optionsProperty = $logging.PSObject.Properties['options']
    $driverProperty = $logging.PSObject.Properties['driver']
    $maxSizeProperty = if ($null -ne $optionsProperty) { $optionsProperty.Value.PSObject.Properties['max-size'] } else { $null }
    $maxFileProperty = if ($null -ne $optionsProperty) { $optionsProperty.Value.PSObject.Properties['max-file'] } else { $null }
    if ($null -eq $driverProperty -or $driverProperty.Value -ne 'json-file' -or
        $null -eq $maxSizeProperty -or [string]$maxSizeProperty.Value -ne '5m' -or
        $null -eq $maxFileProperty -or [string]$maxFileProperty.Value -ne '2') {
        throw "Rendered Compose logging policy must be json-file with max-size=5m and max-file=2."
    }
}

function Get-AnalyticsEnabled {
    $content = Get-Content -LiteralPath $SupabaseConfigPath -Raw
    $section = [regex]::Match($content, '(?ms)^\[analytics\]\s*(?<body>.*?)(?=^\[|\z)')
    if (-not $section.Success) {
        throw 'supabase/config.toml has no [analytics] section.'
    }
    $enabled = [regex]::Match($section.Groups['body'].Value, '(?m)^\s*enabled\s*=\s*(true|false)\s*(?:#.*)?$')
    if (-not $enabled.Success) {
        throw 'supabase/config.toml [analytics].enabled is missing or ambiguous.'
    }
    $enabled.Groups[1].Value -eq 'true'
}

function Assert-SupabaseNetwork {
    $network = Get-NetworkInspect -Name $SupabaseNetwork
    if ($null -eq $network -or $network.Driver -ne 'bridge' -or $network.Labels.'com.supabase.cli.project' -ne $ProjectId) {
        throw "'$SupabaseNetwork' is missing or is not the expected Supabase project network."
    }
    $network
}

function Assert-VectorIdentity {
    $vector = Get-ContainerInspect -Name $VectorName
    if ($null -eq $vector) {
        throw "Expected Vector container '$VectorName' was not found. Recreate it with the pinned Supabase CLI, then run -Action Plan again."
    }

    $workdir = $vector.Config.Labels.'com.supabase.cli.workdir'
    $dockerHosts = @($vector.Config.Env | Where-Object { $_ -like 'DOCKER_HOST=*' })
    $networkNames = @($vector.NetworkSettings.Networks.PSObject.Properties.Name)
    $allowedNetworks = @($SupabaseNetwork, $RepairNetwork)
    $unexpectedNetworks = @($networkNames | Where-Object { $allowedNetworks -notcontains $_ })

    $checks = [ordered]@{
        projectLabel = $vector.Config.Labels.'com.supabase.cli.project' -eq $ProjectId
        image = $vector.Config.Image -eq $ExpectedVectorImage
        workdir = [string]::Equals($workdir, $RepoRoot, [StringComparison]::OrdinalIgnoreCase)
        dockerHost = $dockerHosts.Count -eq 1 -and $dockerHosts[0] -eq 'DOCKER_HOST=http://host.docker.internal:2375'
        unprivileged = -not $vector.HostConfig.Privileged
        noPublishedPorts = (Get-PropertyCount $vector.HostConfig.PortBindings) -eq 0
        supabaseNetwork = $networkNames -contains $SupabaseNetwork
        noUnexpectedNetworks = $unexpectedNetworks.Count -eq 0
    }
    $failedChecks = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
    if ($failedChecks.Count -ne 0) {
        throw "Vector identity/settings are unexpected ($($failedChecks -join ', ')). Refusing to change '$VectorName'."
    }

    $vector
}

function Assert-RepairNetwork {
    param($Network)
    if ($null -eq $Network) { return }

    $containerNames = @($Network.Containers.PSObject.Properties.Value | ForEach-Object { $_.Name })
    $unexpected = @($containerNames | Where-Object { $_ -notin @($ProxyName, $VectorName) })
    if (-not $Network.Internal -or $Network.Driver -ne 'bridge' -or
        $Network.Labels.$RepairLabelName -ne $RepairLabelValue -or
        $Network.Labels.'com.betweener.local-supabase.project' -ne $ProjectId -or
        $unexpected.Count -ne 0) {
        throw "Repair network '$RepairNetwork' exists with unexpected ownership, settings, or endpoints."
    }
}

function Assert-ProxyIdentity {
    param($Proxy)
    if ($null -eq $Proxy) { return }

    $networkNames = @($Proxy.NetworkSettings.Networks.PSObject.Properties.Name)
    $socketMounts = @($Proxy.Mounts | Where-Object { $_.Source -eq '/var/run/docker.sock' -and $_.Destination -eq '/var/run/docker.sock' -and -not $_.RW })
    $configMounts = @($Proxy.Mounts | Where-Object { $_.Destination -eq '/usr/local/etc/haproxy/haproxy.cfg' -and -not $_.RW })
    $securityOpt = @($Proxy.HostConfig.SecurityOpt | Where-Object { $_ -like 'no-new-privileges*' })
    $logConfig = $Proxy.HostConfig.LogConfig
    $logOptions = $logConfig.Config
    $loggingValid = $logConfig.Type -eq 'json-file' -and
        $null -ne $logOptions.PSObject.Properties['max-size'] -and $logOptions.'max-size' -eq '5m' -and
        $null -ne $logOptions.PSObject.Properties['max-file'] -and $logOptions.'max-file' -eq '2' -and
        (Get-PropertyCount $logOptions) -eq 2

    if ($Proxy.Config.Labels.$RepairLabelName -ne $RepairLabelValue -or
        $Proxy.Config.Labels.'com.betweener.local-supabase.project' -ne $ProjectId -or
        $Proxy.Config.Image -ne $ProxyImage -or
        $Proxy.Config.User -ne '99:99' -or
        @($Proxy.HostConfig.GroupAdd) -notcontains '0' -or
        -not $Proxy.HostConfig.ReadonlyRootfs -or
        @($Proxy.HostConfig.CapDrop) -notcontains 'ALL' -or
        $securityOpt.Count -ne 1 -or
        $Proxy.HostConfig.PidsLimit -ne 64 -or
        $Proxy.HostConfig.Memory -ne 67108864 -or
        $Proxy.HostConfig.NanoCpus -ne 250000000 -or
        -not $loggingValid -or
        (Get-PropertyCount $Proxy.HostConfig.PortBindings) -ne 0 -or
        $socketMounts.Count -ne 1 -or $configMounts.Count -ne 1 -or
        $networkNames.Count -ne 1 -or $networkNames[0] -ne $RepairNetwork) {
        throw "Proxy container '$ProxyName' exists with unexpected ownership or security settings."
    }
}

function Wait-ProxyHealthy {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $proxy = Get-ContainerInspect -Name $ProxyName
        if ($null -eq $proxy -or -not $proxy.State.Running) {
            throw "Proxy container '$ProxyName' is not running."
        }
        if ($proxy.State.Health.Status -eq 'healthy') { return $proxy }
        if ($proxy.State.Health.Status -eq 'unhealthy') {
            throw "Proxy container '$ProxyName' became unhealthy."
        }
        Start-Sleep -Seconds 1
    }
    throw "Proxy container '$ProxyName' did not become healthy within 30 seconds."
}

function Test-PrivateAlias {
    $probeName = "betweener-vector-proxy-dns-probe-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
    try {
        $probe = Invoke-Docker -Arguments @(
            'run', '--rm', '--name', $probeName, '--pull', 'never', '--network', $RepairNetwork,
            '--label', "$RepairLabelName=$RepairLabelValue", '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--user', '99:99', '--group-add', '0',
            '--pids-limit', '32', '--memory', '32m', '--cpus', '0.10', '--restart', 'no',
            '--entrypoint', 'wget', $ProxyImage, '-q', '-O', '-', 'http://host.docker.internal:2375/_ping'
        )
        if ($probe.Text.Trim() -ne 'OK') {
            throw "Private alias probe returned an unexpected response: '$($probe.Text.Trim())'."
        }
    } finally {
        Invoke-Docker -Arguments @('rm', '-f', $probeName) -AllowFailure | Out-Null
    }
}

Assert-DockerIdentity
Assert-RenderedComposeLogging
$analyticsEnabled = Get-AnalyticsEnabled
$supabaseNetworkInspect = Assert-SupabaseNetwork
$vector = Assert-VectorIdentity
$repairNetworkInspect = Get-NetworkInspect -Name $RepairNetwork
$proxy = Get-ContainerInspect -Name $ProxyName
Assert-RepairNetwork -Network $repairNetworkInspect
Assert-ProxyIdentity -Proxy $proxy

$vectorNetworks = @($vector.NetworkSettings.Networks.PSObject.Properties.Name)
$status = [pscustomobject]@{
    Action = $Action
    DockerContext = $DockerContext
    DockerDaemonId = $ExpectedDaemonId
    Project = $ProjectId
    VectorId = $vector.Id
    VectorState = $vector.State.Status
    VectorNetworks = $vectorNetworks -join ', '
    AnalyticsEnabled = $analyticsEnabled
    ProxyPresent = $null -ne $proxy
    RepairNetworkPresent = $null -ne $repairNetworkInspect
}

if ($Action -eq 'Plan') {
    $status
    Write-Host 'Plan only: no resources changed. Deployment remains approval-gated.'
    return
}

if ($Action -eq 'Deploy') {
    if ($vector.State.Running -and ($null -eq $proxy -or $null -eq $repairNetworkInspect -or $vectorNetworks -notcontains $RepairNetwork)) {
        throw 'Vector is running without the complete verified repair. Refusing to alter it; stop only Vector under a separately approved action first.'
    }
    if ($StartVector -and -not $analyticsEnabled) {
        throw 'Refusing to start Vector while supabase/config.toml [analytics].enabled is not true.'
    }
    if ($WhatIfPreference) {
        Write-Host "What if: deploy '$ProxyName', attach only '$VectorName' to '$RepairNetwork', verify the private alias, and StartVector=$StartVector."
        return
    }
    if ($vector.State.Running) {
        $proxy = Wait-ProxyHealthy
        Assert-ProxyIdentity -Proxy $proxy
        Test-PrivateAlias
        [pscustomobject]@{
            Proxy = $ProxyName
            ProxyHealth = $proxy.State.Health.Status
            Vector = $VectorName
            VectorState = $vector.State.Status
            VectorNetworks = $vectorNetworks -join ', '
            PrivateAliasProbe = 'PASS'
            IdempotentNoOp = $true
        }
        return
    }

    if ($PSCmdlet.ShouldProcess("$ProxyName and $RepairNetwork", 'Deploy the scoped read-only Docker API proxy')) {
        Invoke-Docker -Arguments @(
            'compose', '--project-name', $ComposeProject, '--file', $ComposePath,
            'up', '--detach', '--no-deps', 'docker-api-proxy'
        ) | Out-Null
    }

    $proxy = Wait-ProxyHealthy
    Assert-ProxyIdentity -Proxy $proxy
    $repairNetworkInspect = Get-NetworkInspect -Name $RepairNetwork
    Assert-RepairNetwork -Network $repairNetworkInspect

    $vector = Assert-VectorIdentity
    $vectorNetworks = @($vector.NetworkSettings.Networks.PSObject.Properties.Name)
    if ($vectorNetworks -notcontains $RepairNetwork) {
        if ($vector.State.Running) {
            throw 'Vector must be stopped before its repair-network attachment is added.'
        }
        if ($PSCmdlet.ShouldProcess($VectorName, "Attach only to $RepairNetwork")) {
            Invoke-Docker -Arguments @('network', 'connect', $RepairNetwork, $VectorName) | Out-Null
        }
    }

    $vector = Assert-VectorIdentity
    if (@($vector.NetworkSettings.Networks.PSObject.Properties.Name) -notcontains $SupabaseNetwork) {
        throw 'Vector lost its existing Supabase-network attachment; stop and use the documented rollback.'
    }
    Test-PrivateAlias

    if ($StartVector -and -not $vector.State.Running) {
        if ($PSCmdlet.ShouldProcess($VectorName, 'Start only the existing Vector container after proxy/DNS verification')) {
            Invoke-Docker -Arguments @('start', $VectorName) | Out-Null
        }
    }

    $finalVector = Assert-VectorIdentity
    [pscustomobject]@{
        Proxy = $ProxyName
        ProxyHealth = (Get-ContainerInspect -Name $ProxyName).State.Health.Status
        Vector = $VectorName
        VectorState = $finalVector.State.Status
        VectorNetworks = @($finalVector.NetworkSettings.Networks.PSObject.Properties.Name) -join ', '
        PrivateAliasProbe = 'PASS'
    }
    return
}

if ($Action -eq 'Rollback') {
    if ($null -eq $proxy -and $null -eq $repairNetworkInspect -and $vectorNetworks -notcontains $RepairNetwork) {
        Write-Host 'Rollback is already complete; no repair resources or attachment are present.'
        return
    }
    if ($vector.State.Running -and $vectorNetworks -contains $RepairNetwork -and -not $StopVector) {
        throw 'Vector is running. Re-run rollback with -StopVector to authorize stopping only Vector before detaching the repair network.'
    }
    if ($WhatIfPreference) {
        Write-Host "What if: StopVector=$StopVector, detach only '$RepairNetwork' from '$VectorName', and remove only owned repair resources."
        return
    }
    if ($vector.State.Running -and $StopVector) {
        if ($PSCmdlet.ShouldProcess($VectorName, 'Stop only Vector for targeted repair rollback')) {
            Invoke-Docker -Arguments @('stop', '--time', '10', $VectorName) | Out-Null
        }
    }

    $vector = Assert-VectorIdentity
    if (@($vector.NetworkSettings.Networks.PSObject.Properties.Name) -contains $RepairNetwork) {
        if ($PSCmdlet.ShouldProcess($VectorName, "Disconnect only $RepairNetwork")) {
            Invoke-Docker -Arguments @('network', 'disconnect', $RepairNetwork, $VectorName) | Out-Null
        }
    }

    if ($null -ne $proxy) {
        if ($PSCmdlet.ShouldProcess("$ProxyName and $RepairNetwork", 'Remove only the scoped Compose repair resources')) {
            Invoke-Docker -Arguments @(
                'compose', '--project-name', $ComposeProject, '--file', $ComposePath, 'down'
            ) | Out-Null
        }
    } elseif ($null -ne $repairNetworkInspect) {
        if ($PSCmdlet.ShouldProcess($RepairNetwork, 'Remove the empty owned repair network')) {
            Invoke-Docker -Arguments @('network', 'rm', $RepairNetwork) | Out-Null
        }
    }

    $finalVector = Assert-VectorIdentity
    if (@($finalVector.NetworkSettings.Networks.PSObject.Properties.Name) -notcontains $SupabaseNetwork) {
        throw 'Rollback verification failed: Vector is not attached to its original Supabase network.'
    }
    if ($null -ne (Get-ContainerInspect -Name $ProxyName) -or $null -ne (Get-NetworkInspect -Name $RepairNetwork)) {
        throw 'Rollback verification failed: scoped repair resources remain.'
    }
    Write-Host 'Targeted rollback complete. The proxy image and implementation files were preserved.'
}
