const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = process.cwd();
const ASSET_ROOT = path.join(ROOT, 'assets', 'images', 'circle-pulse', 'love-seat');
const MAX_COMPRESSED_BYTES = 1_250_000;
const MAX_DECODED_BYTES = 18 * 1024 * 1024;

const assets = [
  { name: 'chair-front.webp', maxWidth: 512, maxHeight: 512 },
  { name: 'chair-three-quarter.webp', maxWidth: 512, maxHeight: 512 },
  { name: 'chair-dissolve.webp', maxWidth: 512, maxHeight: 512 },
  { name: 'portrait-halo.webp', maxWidth: 384, maxHeight: 384 },
];

async function inspectAsset(spec) {
  const filePath = path.join(ASSET_ROOT, spec.name);
  const [metadata, stat] = await Promise.all([sharp(filePath).metadata(), fs.stat(filePath)]);

  if (metadata.format !== 'webp' || !metadata.hasAlpha) {
    throw new Error(`${spec.name} must be a transparent WebP asset.`);
  }
  if (!metadata.width || !metadata.height) {
    throw new Error(`${spec.name} is missing image dimensions.`);
  }
  if (metadata.width > spec.maxWidth || metadata.height > spec.maxHeight) {
    throw new Error(`${spec.name} exceeds ${spec.maxWidth}x${spec.maxHeight}.`);
  }

  return {
    name: spec.name,
    width: metadata.width,
    height: metadata.height,
    compressedBytes: stat.size,
    decodedBytes: metadata.width * metadata.height * 4,
  };
}

async function main() {
  const results = await Promise.all(assets.map(inspectAsset));
  const compressedBytes = results.reduce((sum, asset) => sum + asset.compressedBytes, 0);
  const decodedBytes = results.reduce((sum, asset) => sum + asset.decodedBytes, 0);

  if (compressedBytes > MAX_COMPRESSED_BYTES) {
    throw new Error(`Love Seat runtime assets use ${compressedBytes} bytes; maximum is ${MAX_COMPRESSED_BYTES}.`);
  }
  if (decodedBytes > MAX_DECODED_BYTES) {
    throw new Error(`Love Seat decoded asset estimate is ${decodedBytes} bytes; maximum is ${MAX_DECODED_BYTES}.`);
  }

  console.log(JSON.stringify({
    status: 'PASS',
    compressedBytes,
    decodedBytes,
    limits: { compressedBytes: MAX_COMPRESSED_BYTES, decodedBytes: MAX_DECODED_BYTES },
    assets: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
