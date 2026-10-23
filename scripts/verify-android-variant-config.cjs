/* global __dirname */

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const expoCli = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');

const variants = [
  {
    label: 'staging',
    env: { APP_VARIANT: 'staging', EXPO_PUBLIC_ENVIRONMENT: 'staging' },
    expected: {
      packageName: 'com.aduboffour.betweener.staging',
      scheme: 'betweenerstaging',
      host: 'staging.getbetweener.com',
    },
  },
  {
    label: 'production',
    env: { APP_VARIANT: 'production', EXPO_PUBLIC_ENVIRONMENT: 'production' },
    expected: {
      packageName: 'com.aduboffour.betweener',
      scheme: 'betweenerapp',
      host: 'getbetweener.com',
    },
  },
];

const assertEqual = (label, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const resolveVariant = (variant) => {
  const result = spawnSync(process.execPath, [expoCli, 'config', '--type', 'public', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPO_NO_DOTENV: '1',
      ...variant.env,
    },
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }

  const config = JSON.parse(result.stdout);
  const expoDevClientPlugin = config.plugins.find((plugin) => (
    Array.isArray(plugin) ? plugin[0] : plugin
  ) === 'expo-dev-client');
  return {
    packageName: config.android.package,
    scheme: config.scheme,
    expoDevClientGeneratedScheme: Array.isArray(expoDevClientPlugin)
      ? expoDevClientPlugin[1]?.addGeneratedScheme !== false
      : null,
    intentFilters: config.android.intentFilters.map((filter) => ({
      action: filter.action,
      category: filter.category,
      autoVerify: filter.autoVerify,
      data: filter.data,
    })),
  };
};

const resolved = Object.fromEntries(variants.map((variant) => [variant.label, resolveVariant(variant)]));

for (const variant of variants) {
  const actual = resolved[variant.label];
  assertEqual(`${variant.label}.packageName`, actual.packageName, variant.expected.packageName);
  assertEqual(`${variant.label}.scheme`, actual.scheme, variant.expected.scheme);
  if (variant.label === 'staging') {
    assertEqual(
      'staging.expoDevClientGeneratedScheme',
      actual.expoDevClientGeneratedScheme,
      false,
    );
  }
  assertEqual(`${variant.label}.intentFilters`, actual.intentFilters, [
    {
      action: 'VIEW',
      category: ['BROWSABLE', 'DEFAULT'],
      autoVerify: true,
      data: [{ scheme: variant.expected.scheme }],
    },
    {
      action: 'VIEW',
      category: ['BROWSABLE', 'DEFAULT'],
      autoVerify: true,
      data: [{ scheme: variant.expected.scheme, host: 'auth' }],
    },
    {
      action: 'VIEW',
      category: ['BROWSABLE', 'DEFAULT'],
      autoVerify: true,
      data: [{ scheme: 'https', host: variant.expected.host }],
    },
  ]);
}

if (resolved.staging.scheme === resolved.production.scheme) {
  throw new Error('Staging and production must not share a custom URI scheme.');
}

const readAssetLinks = (relativePath) => JSON.parse(
  readFileSync(path.join(projectRoot, relativePath), 'utf8'),
);
const stagingAssetLinks = readAssetLinks('staging-hosting-files/.well-known/assetlinks.json');
const productionAssetLinks = readAssetLinks('hostinger-files/.well-known/assetlinks.json');

assertEqual(
  'staging.assetlinks.packageName',
  stagingAssetLinks[0]?.target?.package_name,
  variants[0].expected.packageName,
);
assertEqual(
  'production.assetlinks.packageName',
  productionAssetLinks[0]?.target?.package_name,
  variants[1].expected.packageName,
);

const stagingFingerprints = stagingAssetLinks[0]?.target?.sha256_cert_fingerprints ?? [];
if (stagingFingerprints.length === 0 || stagingFingerprints.some(
  (fingerprint) => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint),
)) {
  throw new Error('Staging assetlinks.json must contain at least one valid SHA-256 certificate fingerprint.');
}

console.log(JSON.stringify({
  staging: resolved.staging,
  production: resolved.production,
  stagingAssetLinks,
  productionAssetLinks,
}));
