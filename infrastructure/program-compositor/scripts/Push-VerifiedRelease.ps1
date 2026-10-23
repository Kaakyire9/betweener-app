param(
  [string]$AwsProfile = 'betweener-staging',
  [string]$Region = 'eu-north-1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedAccount = '425805163493'
$expectedRevision = '5812bc9e6b93733e9f543c5e2003e1660f17a0d8'
$expectedImageId = 'sha256:373029b26a8d851c761c8aaa725fb2db9bcbd713621630b9f8033eb7b76e180d'
$localImage = 'betweener-program-compositor:adaptive-stage-m1-5812bc9'
$repository = 'betweener/program-compositor'
$tag = 'adaptive-stage-m1-5812bc9'

$identity = aws sts get-caller-identity --profile $AwsProfile --output json | ConvertFrom-Json
if ($identity.Account -ne $expectedAccount) { throw 'Refusing to push to a non-staging AWS account.' }
if ($Region -ne 'eu-north-1') { throw 'Refusing to push outside eu-north-1.' }

$metadata = docker image inspect $localImage | ConvertFrom-Json
if ($metadata.Count -ne 1) { throw 'Expected exactly one local compositor image.' }
$image = $metadata[0]
if ($image.Id -ne $expectedImageId) { throw 'Local compositor image digest does not match the approved release.' }
if ($image.Architecture -ne 'amd64' -or $image.Os -ne 'linux') {
  throw 'Local compositor image platform is not linux/amd64.'
}
if ($image.Config.Labels.'org.opencontainers.image.revision' -ne $expectedRevision) {
  throw 'Local compositor image source revision does not match the approved release.'
}

$registry = "$expectedAccount.dkr.ecr.$Region.amazonaws.com"
$remoteTag = "$registry/${repository}:$tag"
$existingJson = aws ecr describe-images `
  --repository-name $repository `
  --image-ids "imageTag=$tag" `
  --profile $AwsProfile `
  --region $Region `
  --output json 2>$null
if ($LASTEXITCODE -eq 0) {
  $remoteDigest = ($existingJson | ConvertFrom-Json).imageDetails[0].imageDigest
  if ($remoteDigest -ne $expectedImageId) {
    throw 'The immutable release tag already points to a different image digest.'
  }
}
else {
  $password = aws ecr get-login-password --profile $AwsProfile --region $Region
  $password | docker login --username AWS --password-stdin $registry | Out-Null
  $password = $null

  docker tag $localImage $remoteTag
  docker push $remoteTag
  if ($LASTEXITCODE -ne 0) { throw 'Docker failed to push the approved compositor image.' }

  $remote = aws ecr describe-images `
    --repository-name $repository `
    --image-ids "imageTag=$tag" `
    --profile $AwsProfile `
    --region $Region `
    --output json | ConvertFrom-Json
  $remoteDigest = $remote.imageDetails[0].imageDigest
}
if ($remoteDigest -notmatch '^sha256:[0-9a-f]{64}$') { throw 'ECR returned an invalid image digest.' }

$indexResponse = aws ecr batch-get-image `
  --repository-name $repository `
  --image-ids "imageDigest=$remoteDigest" `
  --accepted-media-types 'application/vnd.oci.image.index.v1+json' `
  --profile $AwsProfile `
  --region $Region `
  --output json | ConvertFrom-Json
$index = $indexResponse.images[0].imageManifest | ConvertFrom-Json
if ($indexResponse.images[0].imageId.imageDigest -ne $expectedImageId) {
  throw 'Remote OCI index digest does not match the approved local image.'
}
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
  SourceRevision = $expectedRevision
  LocalImageId = $expectedImageId
  RemoteIndexDigest = $remoteDigest
  RuntimeManifestDigest = $runtimeManifestDigest
  RemoteConfigDigest = $manifest.config.digest
  Platform = 'linux/amd64'
  Repository = $repository
  Tag = $tag
  ArtifactEquivalent = $true
} | ConvertTo-Json
