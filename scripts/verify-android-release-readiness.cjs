const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRODUCTION_PACKAGE = 'com.aduboffour.betweener';
const STAGING_PACKAGE = 'com.aduboffour.betweener.staging';
const MAPPING_PATH = 'android/app/build/outputs/mapping/release/mapping.txt';
const MANIFEST_PATH = 'build-artifacts/android-release-symbols/release-mapping-manifest.json';
const MINIFY_FLAG = '-Pandroid.enableMinifyInReleaseBuilds=true';
const SHRINK_FLAG = '-Pandroid.enableShrinkResourcesInReleaseBuilds=true';

const fail = (message) => {
  throw new Error(`[android-release] ${message}`);
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const resolveProfilePolicy = (eas, profileName) => {
  const profile = eas.build?.[profileName];
  if (!profile) fail(`Unknown EAS build profile: ${profileName}.`);

  const command = String(profile.android?.gradleCommand || '');
  return {
    profileName,
    packageName: profile.env?.APP_VARIANT === 'staging' ? STAGING_PACKAGE : PRODUCTION_PACKAGE,
    remoteEnvironment: profile.environment ?? null,
    runtimeEnvironment: profile.env?.EXPO_PUBLIC_ENVIRONMENT ?? null,
    minifyEnabled: command.includes(MINIFY_FLAG),
    shrinkResources: command.includes(SHRINK_FLAG),
    mappingRequired: command.includes(MINIFY_FLAG),
    command,
    artifactPaths: profile.buildArtifactPaths ?? [],
  };
};

const assertProfile = (policy, expected) => {
  for (const [key, value] of Object.entries(expected)) {
    if (policy[key] !== value) {
      fail(`${policy.profileName}.${key} expected ${JSON.stringify(value)}, received ${JSON.stringify(policy[key])}.`);
    }
  }
};

const findSentryPlugin = (appJson) => appJson.expo?.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === '@sentry/react-native/expo',
);

const verifyRepositoryPolicy = ({ projectRoot = process.cwd() } = {}) => {
  const eas = readJson(path.join(projectRoot, 'eas.json'));
  const appJson = readJson(path.join(projectRoot, 'app.json'));
  const profiles = Object.fromEntries(
    ['development', 'staging', 'playStaging', 'production'].map((name) => [
      name,
      resolveProfilePolicy(eas, name),
    ]),
  );

  assertProfile(profiles.development, {
    packageName: STAGING_PACKAGE,
    remoteEnvironment: 'preview',
    minifyEnabled: false,
    shrinkResources: false,
  });
  assertProfile(profiles.staging, {
    packageName: STAGING_PACKAGE,
    remoteEnvironment: 'preview',
    minifyEnabled: false,
    shrinkResources: false,
  });
  assertProfile(profiles.playStaging, {
    packageName: STAGING_PACKAGE,
    remoteEnvironment: 'preview',
    minifyEnabled: false,
    shrinkResources: false,
  });
  assertProfile(profiles.production, {
    packageName: PRODUCTION_PACKAGE,
    remoteEnvironment: 'production',
    runtimeEnvironment: 'production',
    minifyEnabled: true,
    shrinkResources: true,
    mappingRequired: true,
  });

  for (const requiredArtifact of [MAPPING_PATH, MANIFEST_PATH]) {
    if (!profiles.production.artifactPaths.includes(requiredArtifact)) {
      fail(`production.buildArtifactPaths must include ${requiredArtifact}.`);
    }
  }

  if (appJson.expo?.android?.package !== PRODUCTION_PACKAGE) {
    fail(`app.json production Android package must be ${PRODUCTION_PACKAGE}.`);
  }

  const sentryPlugin = findSentryPlugin(appJson);
  const sentryAndroid = sentryPlugin?.[1]?.experimental_android;
  const requiredSentryOptions = [
    'enableAndroidGradlePlugin',
    'includeProguardMapping',
    'autoUploadProguardMapping',
    'uploadNativeSymbols',
    'autoUploadNativeSymbols',
  ];
  for (const option of requiredSentryOptions) {
    if (sentryAndroid?.[option] !== true) {
      fail(`Sentry Android option ${option} must be true.`);
    }
  }

  const metro = fs.readFileSync(path.join(projectRoot, 'metro.config.js'), 'utf8');
  if (!metro.includes('getSentryExpoConfig') && !metro.includes('withSentryConfig')) {
    fail('Metro must use the Sentry configuration so Hermes source maps receive debug IDs.');
  }

  const sentryRuntime = fs.readFileSync(path.join(projectRoot, 'lib/telemetry/sentry.ts'), 'utf8');
  const sentryInitStart = sentryRuntime.indexOf('Sentry.init({');
  const sentryInitOptions = sentryRuntime.slice(
    sentryInitStart,
    sentryRuntime.indexOf('beforeBreadcrumb', sentryInitStart),
  );
  if (/\brelease\s*[:,]/u.test(sentryInitOptions) || /\bdist\s*[:,]/u.test(sentryInitOptions)) {
    fail('Sentry runtime must not override the native applicationId@versionName+versionCode release identity.');
  }

  return profiles;
};

const parseAndroidBuildIdentity = (buildGradle) => {
  const packageName = buildGradle.match(/\bapplicationId\s+["']([^"']+)["']/u)?.[1];
  const versionCode = buildGradle.match(/\bversionCode\s+(\d+)/u)?.[1];
  const versionName = buildGradle.match(/\bversionName\s+["']([^"']+)["']/u)?.[1];
  if (!packageName || !versionCode || !versionName) {
    fail('Could not resolve applicationId, versionCode, and versionName from generated android/app/build.gradle.');
  }
  return { packageName, versionCode, versionName };
};

const readMappingIdentity = (mappingPath) => {
  if (!fs.existsSync(mappingPath)) fail(`Required R8 mapping is missing: ${mappingPath}.`);
  const content = fs.readFileSync(mappingPath);
  const header = content.subarray(0, Math.min(content.length, 8192)).toString('utf8');
  if (!/^# compiler: R8\s*$/mu.test(header)) {
    fail(`Mapping file is not an R8 mapping: ${mappingPath}.`);
  }
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    mapId: header.match(/^# pg_map_id:\s*(\S+)\s*$/mu)?.[1] ?? null,
    byteLength: content.length,
  };
};

const verifyManifestBinding = ({ manifest, mapping, buildIdentity }) => {
  const expected = {
    profile: 'production',
    packageName: buildIdentity.packageName,
    versionCode: String(buildIdentity.versionCode),
    versionName: buildIdentity.versionName,
    mappingSha256: mapping.sha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (String(manifest[key]) !== String(value)) {
      fail(`Mapping manifest ${key} mismatch: expected ${value}, received ${manifest[key]}.`);
    }
  }
};

const verifyProductionArtifacts = ({
  projectRoot = process.cwd(),
  mappingPath = path.join(projectRoot, MAPPING_PATH),
  buildGradlePath = path.join(projectRoot, 'android/app/build.gradle'),
  manifestPath = path.join(projectRoot, MANIFEST_PATH),
  existingManifest,
  writeManifest = true,
  environment = process.env,
} = {}) => {
  const buildIdentity = parseAndroidBuildIdentity(fs.readFileSync(buildGradlePath, 'utf8'));
  if (buildIdentity.packageName !== PRODUCTION_PACKAGE) {
    fail(`Production build applicationId must be ${PRODUCTION_PACKAGE}, received ${buildIdentity.packageName}.`);
  }

  const mapping = readMappingIdentity(mappingPath);
  if (existingManifest) verifyManifestBinding({ manifest: existingManifest, mapping, buildIdentity });

  const manifest = {
    schemaVersion: 1,
    profile: 'production',
    packageName: buildIdentity.packageName,
    versionName: buildIdentity.versionName,
    versionCode: String(buildIdentity.versionCode),
    mappingPath: MAPPING_PATH,
    mappingSha256: mapping.sha256,
    mappingMapId: mapping.mapId,
    mappingBytes: mapping.byteLength,
    easBuildId: environment.EAS_BUILD_ID || null,
    gitCommitHash: environment.EAS_BUILD_GIT_COMMIT_HASH || environment.EAS_BUILD_GIT_COMMIT || null,
    generatedAt: new Date().toISOString(),
  };

  if (writeManifest) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  return manifest;
};

const runEasSuccess = ({ projectRoot = process.cwd(), environment = process.env } = {}) => {
  if (environment.EAS_BUILD_PLATFORM !== 'android') {
    return { skipped: true, reason: 'non-Android build' };
  }
  if (environment.EAS_BUILD_PROFILE !== 'production') {
    return { skipped: true, reason: 'non-production Android profile' };
  }
  if (!String(environment.SENTRY_AUTH_TOKEN || '').trim()) {
    fail('SENTRY_AUTH_TOKEN is required for production Sentry source-map, ProGuard, and native-symbol uploads.');
  }
  verifyRepositoryPolicy({ projectRoot });
  return { skipped: false, manifest: verifyProductionArtifacts({ projectRoot, environment }) };
};

const main = () => {
  const easSuccess = process.argv.includes('--eas-on-success');
  const result = easSuccess
    ? runEasSuccess()
    : { skipped: false, profiles: verifyRepositoryPolicy() };
  console.log(JSON.stringify(result, null, 2));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  MANIFEST_PATH,
  MAPPING_PATH,
  PRODUCTION_PACKAGE,
  STAGING_PACKAGE,
  parseAndroidBuildIdentity,
  readMappingIdentity,
  resolveProfilePolicy,
  runEasSuccess,
  verifyManifestBinding,
  verifyProductionArtifacts,
  verifyRepositoryPolicy,
};
