import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  throw new Error('Usage: node scripts/generate-trust-safety-staging-fixtures.mjs <output-directory>');
}

const root = resolve(outputDirectory);
await mkdir(root, { recursive: true });

const escapeXml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const textFixture = async (name, text) => {
  const path = resolve(root, `${name}.png`);
  const svg = Buffer.from([
    '<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">',
    '<rect width="1200" height="800" fill="#f8f4ec"/>',
    '<text x="600" y="400" text-anchor="middle" dominant-baseline="middle"',
    ' font-family="Arial, sans-serif" font-size="64" fill="#132b2a">',
    escapeXml(text),
    '</text></svg>',
  ].join(''));
  await sharp(svg).png().toFile(path);
  return path;
};

const qrFixture = async (name, payload) => {
  const path = resolve(root, `${name}.png`);
  await writeFile(path, await QRCode.toBuffer(payload, {
    type: 'png',
    width: 640,
    margin: 4,
    errorCorrectionLevel: 'M',
  }));
  return path;
};

const harmlessImageFixture = async (name) => {
  const path = resolve(root, `${name}.png`);
  const svg = Buffer.from([
    '<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">',
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#9ed8ef"/><stop offset="1" stop-color="#f7d9a2"/>',
    '</linearGradient></defs><rect width="1200" height="800" fill="url(#sky)"/>',
    '<circle cx="930" cy="170" r="75" fill="#fff3bb"/>',
    '<path d="M0 620 L240 370 L440 590 L680 310 L940 610 L1200 420 L1200 800 L0 800Z" fill="#315f55"/>',
    '<path d="M0 700 Q300 610 600 700 T1200 690 L1200 800 L0 800Z" fill="#21443f"/>',
    '</svg>',
  ].join(''));
  await sharp(svg).png().toFile(path);
  return path;
};

const qrWithHarmlessTextFixture = async (name, payload, visibleText) => {
  const qr = await QRCode.toBuffer(payload, {
    type: 'png', width: 480, margin: 4, errorCorrectionLevel: 'M',
  });
  const textSvg = Buffer.from([
    '<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">',
    '<rect width="1200" height="800" fill="#f8f4ec"/>',
    '<text x="600" y="100" text-anchor="middle" font-family="Arial" font-size="54" fill="#173b37">',
    escapeXml(visibleText),
    '</text></svg>',
  ].join(''));
  const path = resolve(root, `${name}.png`);
  await sharp(textSvg).composite([{ input: qr, left: 360, top: 190 }]).png().toFile(path);
  return path;
};

const paths = {
  ocr_phone: await textFixture('ocr-phone', 'WhatsApp +44 7700 900123'),
  ocr_url: await textFixture('ocr-url', 'example.com/private'),
  ocr_solicitation: await textFixture('ocr-solicitation', 'Subscribe to my private page'),
  qr_external: await qrFixture('qr-external', 'https://example.com/private'),
  qr_benign: await qrFixture('qr-benign', 'Welcome to Bristol'),
  qr_be_kind: await qrFixture('qr-be-kind', 'Be kind'),
  qr_phone: await qrFixture('qr-phone', '+44 7123 456789'),
  qr_social: await qrFixture('qr-social', '@testuser'),
  qr_solicitation: await qrFixture('qr-solicitation', 'Subscribe to my private page'),
  qr_benign_with_text: await qrWithHarmlessTextFixture(
    'qr-benign-with-text',
    'Welcome to Bristol',
    'A quiet afternoon',
  ),
  harmless_image: await harmlessImageFixture('harmless-image'),
  exact_hash: await textFixture('exact-hash-benign', 'Synthetic exact hash test'),
};

const exactHashBytes = await readFile(paths.exact_hash);
const manifest = {
  directory: root,
  paths,
  exact_hash_sha256: createHash('sha256').update(exactHashBytes).digest('hex'),
};

process.stdout.write(`${JSON.stringify(manifest)}\n`);
