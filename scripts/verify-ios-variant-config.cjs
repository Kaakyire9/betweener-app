/* global __dirname */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const expoCli = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');

const variants = [
  {
    label: 'testflightStaging',
    env: { APP_VARIANT: 'staging', EXPO_PUBLIC_ENVIRONMENT: 'staging' },
    expected: {
      bundleIdentifier: 'com.aduboffour.betweener.staging',
      extensionBundleIdentifier: 'com.aduboffour.betweener.staging.NotificationServiceExtension',
      appGroup: 'group.com.aduboffour.betweener.staging.nse',
      associatedDomain: 'applinks:staging.getbetweener.com',
      apsEnvironment: 'production',
    },
  },
  {
    label: 'production',
    env: { APP_VARIANT: 'production', EXPO_PUBLIC_ENVIRONMENT: 'production' },
    expected: {
      bundleIdentifier: 'com.aduboffour.betweener',
      extensionBundleIdentifier: 'com.aduboffour.betweener.NotificationServiceExtension',
      appGroup: 'group.com.aduboffour.betweener.nse',
      associatedDomain: 'applinks:getbetweener.com',
      apsEnvironment: 'production',
    },
  },
];

const assertEqual = (label, actual, expected) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

for (const variant of variants) {
  const result = spawnSync(
    process.execPath,
    [expoCli, 'config', '--type', 'introspect', '--json'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_NO_DOTENV: '1',
        ...variant.env,
      },
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }

  const config = JSON.parse(result.stdout);
  const entitlements = config._internal.modResults.ios.entitlements;
  const extension = config.extra.eas.build.experimental.ios.appExtensions.find(
    (candidate) => candidate.targetName === 'NotificationServiceExtension',
  );
  const resolved = {
    bundleIdentifier: config.ios.bundleIdentifier,
    extensionBundleIdentifier: extension?.bundleIdentifier,
    appGroup: entitlements['com.apple.security.application-groups']?.[0],
    extensionAppGroup: extension?.entitlements?.['com.apple.security.application-groups']?.[0],
    associatedDomains: entitlements['com.apple.developer.associated-domains'],
    apsEnvironment: entitlements['aps-environment'],
    signInWithApple: entitlements['com.apple.developer.applesignin'],
  };

  assertEqual(`${variant.label}.bundleIdentifier`, resolved.bundleIdentifier, variant.expected.bundleIdentifier);
  assertEqual(
    `${variant.label}.extensionBundleIdentifier`,
    resolved.extensionBundleIdentifier,
    variant.expected.extensionBundleIdentifier,
  );
  assertEqual(`${variant.label}.appGroup`, resolved.appGroup, variant.expected.appGroup);
  assertEqual(`${variant.label}.extensionAppGroup`, resolved.extensionAppGroup, variant.expected.appGroup);
  assertEqual(
    `${variant.label}.associatedDomain`,
    resolved.associatedDomains?.[0],
    variant.expected.associatedDomain,
  );
  assertEqual(`${variant.label}.apsEnvironment`, resolved.apsEnvironment, variant.expected.apsEnvironment);
  assertEqual(`${variant.label}.signInWithApple`, resolved.signInWithApple?.[0], 'Default');

  console.log(`${variant.label}: ${JSON.stringify(resolved)}`);
}
