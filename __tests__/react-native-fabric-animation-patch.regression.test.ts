import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};
const expoRouterPatch = readFileSync(
  'patches/expo-router+57.0.9.patch',
  'utf8',
);

test('React Native includes the upstream Fabric animated-props crash fix', () => {
  assert.equal(packageJson.dependencies?.['react-native'], '0.86.2');
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
