/* global __dirname */

const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const appJson = require(path.join(projectRoot, 'app.json'));
const configureApp = require(path.join(projectRoot, 'app.config.js'));

const EXPECTED = {
  staging: {
    environment: 'staging',
    bundleIdentifier: 'com.aduboffour.betweener.staging',
    scheme: 'betweenerstaging',
    webOrigin: 'https://staging.getbetweener.com',
    supabaseProjectRef: 'xsgzxadwuxuziubglvps',
    forbiddenProjectRef: 'jbyblhithbqwojhwlenv',
    forbiddenOrigin: 'https://getbetweener.com',
    forbiddenScheme: 'betweenerapp',
  },
  production: {
    environment: 'production',
    bundleIdentifier: 'com.aduboffour.betweener',
    scheme: 'betweenerapp',
    webOrigin: 'https://getbetweener.com',
    supabaseProjectRef: 'jbyblhithbqwojhwlenv',
    forbiddenProjectRef: 'xsgzxadwuxuziubglvps',
    forbiddenOrigin: 'https://staging.getbetweener.com',
    forbiddenScheme: 'betweenerstaging',
  },
};

const assertEqual = (label, actual, expected) => {
  if (actual !== expected) throw new Error(`${label} does not match the expected environment.`);
};

const withEnvironment = (values, callback) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, values);
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const resolveVariant = (variant) => withEnvironment({
  APP_VARIANT: variant,
  EXPO_PUBLIC_ENVIRONMENT: EXPECTED[variant].environment,
  EAS_BUILD: 'false',
}, () => configureApp({ config: appJson.expo }));

for (const variant of ['staging', 'production']) {
  const expected = EXPECTED[variant];
  const config = resolveVariant(variant);
  const identity = config.extra?.appIdentity;
  assertEqual(`${variant}.variant`, identity?.variant, variant);
  assertEqual(`${variant}.bundleIdentifier`, config.ios?.bundleIdentifier, expected.bundleIdentifier);
  assertEqual(`${variant}.androidPackage`, config.android?.package, expected.bundleIdentifier);
  assertEqual(`${variant}.scheme`, config.scheme, expected.scheme);
  assertEqual(`${variant}.identityScheme`, identity?.scheme, expected.scheme);
  assertEqual(`${variant}.webOrigin`, identity?.webOrigin, expected.webOrigin);

  const serialized = JSON.stringify({
    scheme: config.scheme,
    ios: config.ios?.bundleIdentifier,
    android: config.android?.package,
    identity,
    intentFilters: config.android?.intentFilters,
  });
  if (serialized.includes(expected.forbiddenProjectRef)
    || serialized.includes(expected.forbiddenOrigin)
    || serialized.includes(expected.forbiddenScheme)) {
    throw new Error(`${variant} app configuration contains cross-environment Live resources.`);
  }
}

const walkFiles = (directory) => readdirSync(directory).flatMap((entry) => {
  const candidate = path.join(directory, entry);
  return statSync(candidate).isDirectory() ? walkFiles(candidate) : [candidate];
});

const operationalRoots = [
  'app/live',
  'features/live',
  'apps/studio/src',
  'apps/program-audio-worker/src',
  'supabase/functions',
].map((relativePath) => path.join(projectRoot, relativePath));

const allowedCanonicalFiles = new Set([
  path.join(projectRoot, 'features/live/config/live-link-environment.ts'),
  path.join(projectRoot, 'apps/studio/src/lib/studio-environment-resolver.ts'),
]);

const forbiddenHardcodes = [
  /https:\/\/getbetweener\.com\/live/u,
  /https:\/\/staging\.getbetweener\.com\/live/u,
  /betweenerapp:\/\/live/u,
  /betweenerstaging:\/\/live/u,
];

for (const filePath of operationalRoots.flatMap(walkFiles)) {
  if (allowedCanonicalFiles.has(filePath) || !/\.(?:cjs|js|jsx|ts|tsx)$/u.test(filePath)) continue;
  const source = readFileSync(filePath, 'utf8');
  if (forbiddenHardcodes.some((pattern) => pattern.test(source))) {
    throw new Error(`Operational Live source contains a hardcoded environment link: ${path.relative(projectRoot, filePath)}`);
  }
  if (source.includes('jbyblhithbqwojhwlenv.supabase.co')
    || source.includes('xsgzxadwuxuziubglvps.supabase.co')) {
    throw new Error(`Operational Live source contains a hardcoded Supabase project: ${path.relative(projectRoot, filePath)}`);
  }
}

const studioEnvironmentSource = readFileSync(
  path.join(projectRoot, 'apps/studio/src/lib/environment.ts'),
  'utf8',
);
if (/import\.meta\.env\s*\[/u.test(studioEnvironmentSource)) {
  throw new Error('Studio uses dynamic import.meta.env access.');
}
for (const name of [
  'VITE_APP_ENVIRONMENT',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_PUBLIC_APP_ORIGIN',
  'VITE_STUDIO_ORIGIN',
]) {
  if (!studioEnvironmentSource.includes(`import.meta.env.${name}`)) {
    throw new Error(`Studio is missing explicit static access for ${name}.`);
  }
}

const stagingAasa = JSON.parse(readFileSync(
  path.join(projectRoot, 'staging-hosting-files/.well-known/apple-app-site-association'),
  'utf8',
));
const stagingDetails = stagingAasa.applinks?.details?.[0];
assertEqual(
  'staging AASA appID',
  stagingDetails?.appID,
  'A964DV394M.com.aduboffour.betweener.staging',
);
if (!stagingDetails?.paths?.includes('/live/*')) {
  throw new Error('Staging AASA is missing /live/*.');
}

const selectedVariant = String(process.env.APP_VARIANT || '').trim().toLowerCase();
if (selectedVariant) {
  if (!(selectedVariant in EXPECTED)) throw new Error('APP_VARIANT must be staging or production.');
  const expected = EXPECTED[selectedVariant];
  const checks = [
    ['EXPO_PUBLIC_SUPABASE_URL', expected.supabaseProjectRef, expected.forbiddenProjectRef],
    ['EXPO_PUBLIC_LIVE_ORIGIN', expected.webOrigin, expected.forbiddenOrigin],
    ['EXPO_PUBLIC_LIVE_STUDIO_ORIGIN', selectedVariant, selectedVariant === 'staging' ? 'production' : 'staging'],
    ['EXPO_PUBLIC_LIVE_PUSH_ENDPOINT', expected.supabaseProjectRef, expected.forbiddenProjectRef],
    ['EXPO_PUBLIC_LIVE_CALLBACK_URL', expected.webOrigin, expected.forbiddenOrigin],
  ];
  for (const [name, requiredFragment, forbiddenFragment] of checks) {
    const value = String(process.env[name] || '').trim();
    if (!value) continue;
    if (!value.includes(requiredFragment) || value.includes(forbiddenFragment)) {
      throw new Error(`${name} is not isolated for ${selectedVariant}.`);
    }
  }
  if (String(process.env.EXPO_PUBLIC_STREAM_VIDEO_API_KEY || '').trim()) {
    throw new Error('Stream credentials must be supplied by server admission, not EXPO_PUBLIC_* variables.');
  }
}

console.log(JSON.stringify({
  staging: 'isolated',
  production: 'isolated',
  runtimeSecretsPrinted: false,
}));
