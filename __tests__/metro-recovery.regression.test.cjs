const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('Metro recovery resolves both address families and refuses unsafe process cleanup', {
  skip: process.platform !== 'win32',
}, () => {
  const scriptPath = path.resolve('scripts/metro-recover.ps1').replaceAll("'", "''");
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile('${scriptPath}', [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Recovery script did not parse' }
$names = @('Get-ListeningProcessIds', 'Test-LocalPortInUse', 'Get-MetroProjectRoot', 'Stop-ProjectMetro')
foreach ($definition in $ast.EndBlock.Statements) {
  if ($definition -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $names -contains $definition.Name) {
    . ([ScriptBlock]::Create($definition.Extent.Text))
  }
}
$projectRoot = 'C:\\fixture\\betweener'
$cases = [System.Collections.Generic.List[string]]::new()
function Assert-Case($condition, $message) { if (-not $condition) { throw $message } }
$probe = (Get-Command Test-LocalPortInUse).ScriptBlock
foreach ($address in @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::IPv6Loopback)) {
  if ($address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6 -and -not [System.Net.Sockets.Socket]::OSSupportsIPv6) { continue }
  $listener = [System.Net.Sockets.TcpListener]::new($address, 0)
  try {
    $listener.Start()
    $fixturePort = $listener.LocalEndpoint.Port
    Assert-Case (& $probe -LocalPort $fixturePort) 'Loopback listener was not detected'
  } finally { $listener.Stop() }
  Assert-Case (-not (& $probe -LocalPort $fixturePort)) 'Closed loopback port was reported busy'
}
$script:owners = @([PSCustomObject]@{ OwningProcess = 101 }, [PSCustomObject]@{ OwningProcess = 101 })
$script:tcpFails = $false
$script:table = @()
function Get-NetTCPConnection {
  [CmdletBinding()] param([int]$LocalPort, [string]$State)
  if ($script:tcpFails) { throw 'Simulated unavailable ownership API' }
  return $script:owners
}
function netstat {
  if ($args -contains 'tcp') { return @($script:table | Where-Object { $_ -notmatch '\\[::\\]' }) }
  return $script:table
}
$ids = @(Get-ListeningProcessIds -LocalPort 8081)
Assert-Case (($ids -join ',') -eq '101') 'TCP ownership was not deduplicated'
$cases.Add('tcp-ownership')
$script:tcpFails = $true
$script:table = @(
  '  TCP    0.0.0.0:8081  0.0.0.0:0       LISTENING  101',
  '  TCP    [::]:8081     [::]:0           LISTENING  202',
  '  TCP    [::]:8081     [::]:0           LISTENING  202',
  '  TCP    127.0.0.1:55  127.0.0.1:8081   ESTABLISHED 303',
  '  TCP    0.0.0.0:80810 0.0.0.0:0       LISTENING  404',
  '  UDP    0.0.0.0:8081  *:*                        505')
$ids = @(Get-ListeningProcessIds -LocalPort 8081)
Assert-Case (($ids -join ',') -eq '101,202') 'IPv4/IPv6 listener fallback failed'
$cases.Add('ipv4-ipv6-fallback')
$script:listener = $false; $script:reportedRoot = $projectRoot; $script:busy = $false
$script:stops = 0; $script:processName = 'node'
function Get-ListeningProcessIds { param([int]$LocalPort) if ($script:listener) { return @(101) }; return @() }
function Get-MetroProjectRoot { param([int]$LocalPort) return $script:reportedRoot }
function Test-LocalPortInUse { param([int]$LocalPort) return $script:busy }
function Get-Process { [CmdletBinding()]param([int]$Id) return [PSCustomObject]@{ ProcessName = $script:processName } }
function Stop-Process { param([int]$Id, [switch]$Force) $script:stops++; $script:listener = $false; $script:busy = $false }
function Assert-Refused($expected) {
  $caught = $false
  try { Stop-ProjectMetro -LocalPort 8081 } catch { $caught = $_.Exception.Message -like $expected }
  Assert-Case $caught 'Expected a safe cleanup refusal'
  Assert-Case ($script:stops -eq 0) 'An unverified process was stopped'
}
Assert-Refused '*process owner*'
$cases.Add('metro-without-owner-refused')
$script:reportedRoot = $null; $script:busy = $true
Assert-Refused '*process owner*'
$cases.Add('occupied-port-without-owner-refused')
$script:listener = $true; $script:reportedRoot = 'C:\\fixture\\other'
Assert-Refused '*not*'
$cases.Add('other-project-refused')
$script:reportedRoot = $projectRoot; $script:processName = 'unrelated-service'
Assert-Refused '*not Node*'
$cases.Add('non-node-process-refused')
$script:processName = 'node'
Stop-ProjectMetro -LocalPort 8081
Assert-Case ($script:stops -eq 1) 'Verified project Metro was not stopped exactly once'
$cases.Add('verified-metro-stopped')
$script:stops = 0; $script:reportedRoot = $null; $script:busy = $false
Stop-ProjectMetro -LocalPort 8081
Assert-Case ($script:stops -eq 0) 'An available port caused process cleanup'
$cases.Add('free-port-no-cleanup')
Write-Output ('RECOVERY_CASES=' + (ConvertTo-Json -Compress -InputObject @($cases.ToArray())))
`], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('RECOVERY_CASES='));
  assert.ok(line, 'Expected recovery case results');
  assert.deepEqual(JSON.parse(line.slice('RECOVERY_CASES='.length)), [
    'tcp-ownership', 'ipv4-ipv6-fallback', 'metro-without-owner-refused',
    'occupied-port-without-owner-refused', 'other-project-refused',
    'non-node-process-refused', 'verified-metro-stopped', 'free-port-no-cleanup',
  ]);
});
