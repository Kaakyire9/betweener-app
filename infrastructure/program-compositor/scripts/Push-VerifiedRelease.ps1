param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$SourceRevision,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^adaptive-stage-m1-secure-[0-9a-f]{7,40}$')]
  [string]$Tag,
  [Parameter(Mandatory = $true)]
  [string]$LocalImage,
  [string]$AwsProfile = 'betweener-staging',
  [string]$Region = 'eu-north-1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedAccount = '425805163493'
$repository = 'betweener/program-compositor'

$identity = aws sts get-caller-identity --profile $AwsProfile --output json | ConvertFrom-Json
if ($identity.Account -ne $expectedAccount) { throw 'Refusing to push to a non-staging AWS account.' }
if ($Region -ne 'eu-north-1') { throw 'Refusing to push outside eu-north-1.' }

$metadata = docker image inspect $localImage | ConvertFrom-Json
if ($metadata.Count -ne 1) { throw 'Expected exactly one local compositor image.' }
$image = $metadata[0]
if ($image.Architecture -ne 'amd64' -or $image.Os -ne 'linux') {
  throw 'Local compositor image platform is not linux/amd64.'
}
if ($image.Config.Labels.'org.opencontainers.image.revision' -ne $SourceRevision) {
  throw 'Local compositor image source revision does not match the approved release.'
}
if ($image.Config.User -ne '1000:1000') { throw 'Local compositor image is not configured for UID/GID 1000:1000.' }

$registry = "$expectedAccount.dkr.ecr.$Region.amazonaws.com"
$remoteTag = "$registry/${repository}:$tag"
$existingTag = aws ecr list-images `
  --repository-name $repository `
  --filter tagStatus=TAGGED `
  --query "imageIds[?imageTag=='$Tag'].imageTag | [0]" `
  --profile $AwsProfile `
  --region $Region `
  --output text
if ($LASTEXITCODE -ne 0) { throw 'Could not verify whether the immutable release tag already exists.' }
if ($existingTag -and $existingTag -ne 'None') {
  throw 'The immutable release tag already exists. Choose a new source-derived tag.'
}

$password = aws ecr get-login-password --profile $AwsProfile --region $Region
$password | docker login --username AWS --password-stdin $registry | Out-Null
$password = $null

docker tag $LocalImage $remoteTag
docker push $remoteTag
if ($LASTEXITCODE -ne 0) { throw 'Docker failed to push the approved compositor image.' }

$remote = aws ecr describe-images `
  --repository-name $repository `
  --image-ids "imageTag=$tag" `
  --profile $AwsProfile `
  --region $Region `
  --output json | ConvertFrom-Json
$remoteDigest = $remote.imageDetails[0].imageDigest
if ($remoteDigest -notmatch '^sha256:[0-9a-f]{64}$') { throw 'ECR returned an invalid image digest.' }

$indexResponse = aws ecr batch-get-image `
  --repository-name $repository `
  --image-ids "imageDigest=$remoteDigest" `
  --accepted-media-types 'application/vnd.oci.image.index.v1+json' `
  --profile $AwsProfile `
  --region $Region `
  --output json | ConvertFrom-Json
$index = $indexResponse.images[0].imageManifest | ConvertFrom-Json
$runtimeDescriptors = @(
  $index.manifests | Where-Object {
    $_.platform.os -eq 'linux' -and $_.platform.architecture -eq 'amd64'
  }
)
if ($runtimeDescriptors.Count -ne 1) {
  throw 'Expected exactly one linux/amd64 runtime manifest in the remote OCI index.'
}
$runtimeManifestDigest = $runtimeDescriptors[0].digest
$manifestResponse = aws ecr batch-get-image `
  --repository-name $repository `
  --image-ids "imageDigest=$runtimeManifestDigest" `
  --accepted-media-types 'application/vnd.oci.image.manifest.v1+json' `
  --profile $AwsProfile `
  --region $Region `
  --output json | ConvertFrom-Json
$manifest = $manifestResponse.images[0].imageManifest | ConvertFrom-Json
if ($manifest.config.digest -notmatch '^sha256:[0-9a-f]{64}$') {
  throw 'Remote runtime manifest does not contain a valid configuration digest.'
}

[pscustomobject]@{
  SourceRevision = $SourceRevision
  LocalImageId = $image.Id
  RemoteIndexDigest = $remoteDigest
  RuntimeManifestDigest = $runtimeManifestDigest
  RemoteConfigDigest = $manifest.config.digest
  Platform = 'linux/amd64'
  Repository = $repository
  Tag = $tag
  ArtifactEquivalent = $true
} | ConvertTo-Json
