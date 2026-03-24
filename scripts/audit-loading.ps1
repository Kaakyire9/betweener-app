param(
  [string]$Root = ".",
  [int]$Context = 2
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host ("=" * 80)
  Write-Host $Title
  Write-Host ("=" * 80)
}

function Run-Rg([string[]]$RgArgs) {
  # Keep this script dependency-free; relies only on ripgrep (rg).
  $rg = Get-Command rg -ErrorAction SilentlyContinue
  if (-not $rg) { throw "ripgrep (rg) not found on PATH" }

  $display = ($RgArgs | ForEach-Object {
    if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
  }) -join ' '

  Write-Host ""
  Write-Host ("$ rg " + $display)
  & rg @RgArgs
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) {
    throw "rg failed with exit code $LASTEXITCODE"
  }
}

Write-Section "Skeleton Call Sites (What Shows a Skeleton UI)"
Run-Rg @('-n', '-S', 'Skeleton|skeleton', 'app', 'hooks', 'components')

Write-Section "Loading Flags (Where loading state is computed/returned)"
Run-Rg @('-n', '-S', '\bloading\b\s*[:=]|\bisLoading\b\s*[:=]|setIsLoading\(', 'app', 'hooks', 'components')

Write-Section "Potential 'Skeleton Forever' Patterns (Result-length gates)"
Run-Rg @('-n', '-S', 'hasLoadedRef|lastFetchedAt|\bfetched\b|length\s*===\s*0|&&\s*\w+\.length\s*===\s*0', 'app', 'hooks')

Write-Section "Supabase Requests Used by Tabs (Helps correlate with Supabase API logs)"
Run-Rg @('-n', '-S', 'supabase\.rpc\(', 'app/(tabs)', 'hooks')
Run-Rg @('-n', '-S', '\.from\(', 'app/(tabs)', 'hooks')

Write-Host ""
Write-Host "Done. If a tab shows a skeleton forever, check:"
Write-Host "- Is there a request that can return [] (valid empty) but loading only flips on >0 rows?"
Write-Host "- Is the loading flag missing a 'finally' that turns loading off on error?"
Write-Host "- Are we waiting on a field that never becomes truthy (e.g., profile id / session)?"
