/* global __dirname */

const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const appConfigFactory = require(path.join(projectRoot, 'app.config.js'));
const appJson = require(path.join(projectRoot, 'app.json'));
const easConfig = require(path.join(projectRoot, 'eas.json'));

const IDENTITIES = Object.freeze({
  production: Object.freeze({
    name: 'Betweener',
    slug: 'betweener',
    bundleIdentifier: 'com.aduboffour.betweener',
    scheme: 'betweenerapp',
    projectId: '7de6cdc4-8616-446f-99de-82764af3a7e6',
    updatesUrl: 'https://u.expo.dev/7de6cdc4-8616-446f-99de-82764af3a7e6',
  }),
  staging: Object.freeze({
    name: 'Betweener S',
    slug: 'betweener-staging',
    bundleIdentifier: 'com.aduboffour.betweener.staging',
    scheme: 'betweenerstaging',
    projectId: '7f38a835-2da7-419b-a20b-e1a12e021547',
    updatesUrl: 'https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547',
  }),
});

const resolve = (variant) => {
  const previousVariant = process.env.APP_VARIANT;
  const previousNoDotenv = process.env.EXPO_NO_DOTENV;
  process.env.APP_VARIANT = variant;
  process.env.EXPO_NO_DOTENV = '1';
  try {
    return appConfigFactory({ config: appJson.expo || appJson });
  } finally {
    if (previousVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previousVariant;
    if (previousNoDotenv === undefined) delete process.env.EXPO_NO_DOTENV;
    else process.env.EXPO_NO_DOTENV = previousNoDotenv;
  }
};

const assertEqual = (label, actual, expected) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const revenueCatEnvironment = (variant) => {
  const staging = variant === 'staging';
  const values = {
    EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: staging
      ? 'appl_yWzDgNrgSeDoCGJMmYVFdEURQqd'
      : 'appl_production_fixture',
    EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: staging
      ? 'goog_jnufIIiUIJcDZsvkpvFnGqeNolV'
      : 'goog_production_fixture',
  };
  for (const tier of ['silver', 'gold']) {
    const upperTier = tier.toUpperCase();
    values[`EXPO_PUBLIC_REVENUECAT_${upperTier}_PRODUCT`] = staging
      ? `com.betweener.staging.premium.${tier}`
      : `com.betweener.premium.${tier}`;
    for (const interval of ['monthly', 'quarterly', 'annual']) {
      const upperInterval = interval.toUpperCase();
      values[`EXPO_PUBLIC_REVENUECAT_${upperTier}_${upperInterval}_PRODUCT`] = staging
        ? `com.betweener.staging.premium.${tier}.${interval}`
        : `com.betweener.premium.${tier}.${interval}`;
      values[`EXPO_PUBLIC_REVENUECAT_ANDROID_${upperTier}_${upperInterval}_PRODUCT`] = staging
        ? `com.betweener.staging.premium.${tier}:${interval}`
        : `com.betweener.premium.${tier}:${interval}`;
    }
  }
  return values;
};

const resolveBuild = (variant, overrides = {}) => {
  const staging = variant === 'staging';
  const buildEnvironment = {
    APP_VARIANT: variant,
    EAS_BUILD: 'true',
    EAS_BUILD_PLATFORM: 'android',
    EAS_BUILD_PROFILE: staging ? 'playStaging' : 'production',
    EXPO_PUBLIC_ENVIRONMENT: staging ? 'staging' : 'production',
    EXPO_PUBLIC_SUPABASE_URL: staging
      ? 'https://xsgzxadwuxuziubglvps.supabase.co'
      : 'https://jbyblhithbqwojhwlenv.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'publishable_fixture',
    EXPO_PUBLIC_STREAM_VIDEO_API_KEY: '',
    GOOGLE_SERVICES_JSON: staging ? './google-services.staging.json' : './google-services.json',
    ...revenueCatEnvironment(variant),
    ...overrides,
  };
  const previous = Object.fromEntries(
    Object.keys(buildEnvironment).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, buildEnvironment);
  try {
    return appConfigFactory({ config: appJson.expo || appJson });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

const expectBuildRejection = (label, variant, overrides) => {
  let rejected = false;
  try {
    resolveBuild(variant, overrides);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`Build isolation verifier accepted ${label}.`);
};

const resolved = Object.fromEntries(Object.keys(IDENTITIES).map((variant) => [variant, resolve(variant)]));

for (const [variant, expected] of Object.entries(IDENTITIES)) {
  const config = resolved[variant];
  assertEqual(`${variant}.name`, config.name, expected.name);
  assertEqual(`${variant}.slug`, config.slug, expected.slug);
  assertEqual(`${variant}.scheme`, config.scheme, expected.scheme);
  assertEqual(`${variant}.ios.bundleIdentifier`, config.ios?.bundleIdentifier, expected.bundleIdentifier);
  assertEqual(`${variant}.android.package`, config.android?.package, expected.bundleIdentifier);
  assertEqual(`${variant}.extra.eas.projectId`, config.extra?.eas?.projectId, expected.projectId);
  assertEqual(`${variant}.updates.url`, config.updates?.url, expected.updatesUrl);
  assertEqual(`${variant}.appIdentity.projectId`, config.extra?.appIdentity?.easProjectId, expected.projectId);
}

if (resolved.staging.extra.eas.projectId === IDENTITIES.production.projectId) {
  throw new Error('Staging resolved the production EAS project ID.');
}
if (resolved.production.extra.eas.projectId === IDENTITIES.staging.projectId) {
  throw new Error('Production resolved the staging EAS project ID.');
}
if (resolved.staging.updates.url === IDENTITIES.production.updatesUrl) {
  throw new Error('Staging resolved the production EAS Updates URL.');
}
if (resolved.production.updates.url === IDENTITIES.staging.updatesUrl) {
  throw new Error('Production resolved the staging EAS Updates URL.');
}

let invalidVariantRejected = false;
try {
  resolve('stagin');
} catch {
  invalidVariantRejected = true;
}
if (!invalidVariantRejected) throw new Error('Unknown APP_VARIANT values must fail closed.');

resolveBuild('staging');
resolveBuild('production');
expectBuildRejection('production Supabase in staging', 'staging', {
  EXPO_PUBLIC_SUPABASE_URL: 'https://jbyblhithbqwojhwlenv.supabase.co',
});
expectBuildRejection('production Firebase in staging', 'staging', {
  GOOGLE_SERVICES_JSON: './google-services.json',
});
expectBuildRejection('production RevenueCat key in staging', 'staging', {
  EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: 'appl_production_fixture',
});
expectBuildRejection('production RevenueCat product in staging', 'staging', {
  EXPO_PUBLIC_REVENUECAT_SILVER_MONTHLY_PRODUCT: 'com.betweener.premium.silver.monthly',
});
expectBuildRejection('staging RevenueCat key in production', 'production', {
  EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: 'goog_jnufIIiUIJcDZsvkpvFnGqeNolV',
});
expectBuildRejection('public Stream configuration', 'staging', {
  EXPO_PUBLIC_STREAM_VIDEO_API_KEY: 'stream_fixture',
});

for (const profileName of ['development', 'preview', 'staging', 'testflightStaging', 'playStaging']) {
  const profile = easConfig.build?.[profileName];
  assertEqual(`${profileName}.environment`, profile?.environment, 'preview');
  assertEqual(`${profileName}.APP_VARIANT`, profile?.env?.APP_VARIANT, 'staging');
}
assertEqual('testflightStaging.channel', easConfig.build.testflightStaging.channel, 'staging');
assertEqual('playStaging.channel', easConfig.build.playStaging.channel, 'staging');
assertEqual('production.environment', easConfig.build.production.environment, 'production');
assertEqual('production.APP_VARIANT', easConfig.build.production.env?.APP_VARIANT, 'production');

console.log(JSON.stringify({
  easProjectIsolation: 'PASS',
  invalidVariantFailClosed: 'PASS',
  buildTimeIsolationNegativeCases: 6,
  production: {
    slug: resolved.production.slug,
    projectId: resolved.production.extra.eas.projectId,
    updatesUrl: resolved.production.updates.url,
  },
  staging: {
    slug: resolved.staging.slug,
    projectId: resolved.staging.extra.eas.projectId,
    updatesUrl: resolved.staging.updates.url,
  },
  stagingProfiles: ['development', 'preview', 'staging', 'testflightStaging', 'playStaging'],
}));
