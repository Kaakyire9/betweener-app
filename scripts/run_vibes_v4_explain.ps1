param(
  [Parameter(Mandatory = $true)]
  [string]$ViewerUserId,

  [Parameter(Mandatory = $true)]
  [string]$ViewerProfileId,

  [Parameter(Mandatory = $true)]
  [string]$CandidateProfileId1,

  [Parameter(Mandatory = $true)]
  [string]$CandidateProfileId2
)

if (-not $env:SUPABASE_DATABASE_URL) {
  Write-Error "SUPABASE_DATABASE_URL is not set."
  exit 1
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  Write-Error "psql is not installed or not on PATH."
  exit 1
}

& $psql.Source `
  -v "viewer_user_id=$ViewerUserId" `
  -v "viewer_profile_id=$ViewerProfileId" `
  -v "candidate_profile_id_1=$CandidateProfileId1" `
  -v "candidate_profile_id_2=$CandidateProfileId2" `
  -f "scripts/explain_vibes_v4.sql" `
  $env:SUPABASE_DATABASE_URL
