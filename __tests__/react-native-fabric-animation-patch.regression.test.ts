import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};
const expoRouterVersion = (
  require('expo-router/package.json') as { version: string }
).version;
const expoRouterPatch = readFileSync(
  `patches/expo-router+${expoRouterVersion}.patch`,
  'utf8',
);

test('React Native includes the upstream Fabric animated-props crash fix', () => {
  const version = packageJson.dependencies?.['react-native'];
  assert.ok(version, 'react-native must be declared');

  const [major, minor, patch] = version.split('.').map(Number);
  assert.ok(
    major > 0 || minor > 86 || (minor === 86 && patch >= 2),
    `react-native ${version} predates the Fabric animated-props fix`,
  );
});

test('EAS defers Expo Router initial-link state until the container mounts', () => {
  assert.equal(packageJson.scripts?.postinstall, 'patch-package');
  assert.match(expoRouterPatch, /setLastUnhandledLinkAfterMount/);
  assert.match(expoRouterPatch, /linkingMountedRef\.current = true/);
  assert.match(expoRouterPatch, /pendingUnhandledLinkRef/);
  assert.doesNotMatch(
    expoRouterPatch,
    /\}, setLastUnhandledLink\);\n\s+const linkingContext/,
  );
});
