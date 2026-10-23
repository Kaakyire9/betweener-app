/* global __dirname */

const path = require('path');
const { Buffer } = require('node:buffer');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'assets', 'images');
const MARK_PATH = path.join(IMAGE_DIR, 'staging-mark.png');
const ICON_PATH = path.join(IMAGE_DIR, 'staging-icon-1024.png');
const FOREGROUND_PATH = path.join(IMAGE_DIR, 'staging-foreground-icon.png');
const BACKGROUND_PATH = path.join(IMAGE_DIR, 'staging-background-icon.png');

const SIZE = 1024;

const backgroundSvg = Buffer.from(`
  <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="stage" cx="50%" cy="40%" r="75%">
        <stop offset="0%" stop-color="#26344A"/>
        <stop offset="56%" stop-color="#111A26"/>
        <stop offset="100%" stop-color="#070B12"/>
      </radialGradient>
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#stage)"/>
  </svg>
`);

async function render() {
  const iconMark = await sharp(MARK_PATH)
    .resize({ width: 830, height: 830, fit: 'contain' })
    .png()
    .toBuffer();

  const adaptiveMark = await sharp(MARK_PATH)
    .resize({ width: 640, height: 640, fit: 'contain' })
    .png()
    .toBuffer();

  await sharp(backgroundSvg)
    .png()
    .toFile(BACKGROUND_PATH);

  await sharp(backgroundSvg)
    .composite([{ input: iconMark, gravity: 'centre' }])
    .removeAlpha()
    .png()
    .toFile(ICON_PATH);

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: adaptiveMark, gravity: 'centre' }])
    .png()
    .toFile(FOREGROUND_PATH);

  console.log('Generated Betweener S icon assets.');
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
