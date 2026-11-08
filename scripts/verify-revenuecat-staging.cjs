/* global __dirname */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

const easCommand = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'eas.cmd')
  : 'eas';

const listEnvironment = (environment, appVariant) => {
  const commandEnvironment = {
    ...process.env,
    APP_VARIANT: appVariant,
    EXPO_NO_DOTENV: '1',
  };
  const result = process.platform === 'win32'
    ? spawnSync(
        process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
        ['/d', '/s', '/c', `${easCommand} env:list ${environment} --format short`],
        { encoding: 'utf8', env: commandEnvironment },
      )
    : spawnSync(
        easCommand,
        ['env:list', environment, '--format', 'short'],
        { encoding: 'utf8', env: commandEnvironment },
      );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || String(result.error || ''));
    throw new Error(`Unable to read the EAS ${environment} environment.`);
  }

  return Object.fromEntries(
    result.stdout
      .split(/\r?\n/u)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/u))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
};

const requireEqual = (environment, values, name, expected) => {
  if (values[name] !== expected) {
    throw new Error(`${environment}.${name} does not match the required isolated value.`);
  }
};

const requirePresent = (environment, values, name) => {
  if (!String(values[name] || '').trim()) {
    throw new Error(`${environment}.${name} is missing.`);
  }
};

const validateRevenueCatIsolation = ({ preview, production, build }) => {
  requireEqual('preview', preview, 'EXPO_PUBLIC_SUPABASE_URL', 'https://xsgzxadwuxuziubglvps.supabase.co');
  requireEqual('production', production, 'EXPO_PUBLIC_SUPABASE_URL', 'https://jbyblhithbqwojhwlenv.supabase.co');
  requirePresent('preview', preview, 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY');
  requirePresent('production', production, 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY');
  if (preview.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY.startsWith('test_')) {
    throw new Error('Preview TestFlight cannot use a RevenueCat Test Store SDK key.');
  }
  if (!preview.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY.startsWith('appl_')) {
    throw new Error('Preview TestFlight must use an Apple RevenueCat SDK key.');
  }
  if (preview.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY === production.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY) {
    throw new Error('Preview and production use the same RevenueCat Apple SDK key.');
  }
  requirePresent('preview', preview, 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY');
  requirePresent('production', production, 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY');
  if (!preview.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY.startsWith('goog_')) {
    throw new Error('Preview Play staging must use a Google RevenueCat SDK key.');
  }
  if (preview.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY === production.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY) {
    throw new Error('Preview and production use the same RevenueCat Google SDK key.');
  }
  if (
    build.appVariant !== 'staging'
    || build.environment !== 'staging'
    || build.bundleIdentifier !== 'com.aduboffour.betweener.staging'
    || build.easProjectId !== '7f38a835-2da7-419b-a20b-e1a12e021547'
    || build.updatesUrl !== 'https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547'
  ) {
    throw new Error('TestFlight staging build identity is inconsistent.');
  }
  if (
    build.androidAppVariant !== 'staging'
    || build.androidEnvironment !== 'staging'
    || build.androidPackage !== 'com.aduboffour.betweener.staging'
    || build.androidChannel !== 'staging'
    || build.androidEasProjectId !== '7f38a835-2da7-419b-a20b-e1a12e021547'
    || build.androidUpdatesUrl !== 'https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547'
  ) {
    throw new Error('Play staging build identity is inconsistent.');
  }

  for (const tier of ['silver', 'gold']) {
    const upperTier = tier.toUpperCase();
    requireEqual(
      'preview',
      preview,
      `EXPO_PUBLIC_REVENUECAT_${upperTier}_ENTITLEMENT`,
      tier,
    );
    requireEqual(
      'preview',
      preview,
      `EXPO_PUBLIC_REVENUECAT_${upperTier}_PRODUCT`,
      `com.betweener.staging.premium.${tier}`,
    );
    requireEqual(
      'production',
      production,
      `EXPO_PUBLIC_REVENUECAT_${upperTier}_PRODUCT`,
      `com.betweener.premium.${tier}`,
    );

    for (const interval of ['monthly', 'quarterly', 'annual']) {
      const upperInterval = interval.toUpperCase();
      requireEqual(
        'preview',
        preview,
        `EXPO_PUBLIC_REVENUECAT_${upperTier}_${upperInterval}_PACKAGE`,
        `${tier}_${interval}`,
      );
      requireEqual(
        'preview',
        preview,
        `EXPO_PUBLIC_REVENUECAT_${upperTier}_${upperInterval}_PRODUCT`,
        `com.betweener.staging.premium.${tier}.${interval}`,
      );
      requireEqual(
        'preview',
        preview,
        `EXPO_PUBLIC_REVENUECAT_ANDROID_${upperTier}_${upperInterval}_PRODUCT`,
        `com.betweener.staging.premium.${tier}:${interval}`,
      );
    }
  }
};

const makeFixture = () => {
  const preview = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://xsgzxadwuxuziubglvps.supabase.co',
    EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: 'appl_staging_fixture',
    EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: 'goog_staging_fixture',
  };
  const production = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://jbyblhithbqwojhwlenv.supabase.co',
    EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: 'appl_production_fixture',
    EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: 'goog_production_fixture',
  };
  for (const tier of ['silver', 'gold']) {
    const upperTier = tier.toUpperCase();
    preview[`EXPO_PUBLIC_REVENUECAT_${upperTier}_ENTITLEMENT`] = tier;
    preview[`EXPO_PUBLIC_REVENUECAT_${upperTier}_PRODUCT`] = `com.betweener.staging.premium.${tier}`;
    production[`EXPO_PUBLIC_REVENUECAT_${upperTier}_PRODUCT`] = `com.betweener.premium.${tier}`;
    for (const interval of ['monthly', 'quarterly', 'annual']) {
      const upperInterval = interval.toUpperCase();
      preview[`EXPO_PUBLIC_REVENUECAT_${upperTier}_${upperInterval}_PACKAGE`] = `${tier}_${interval}`;
      preview[`EXPO_PUBLIC_REVENUECAT_${upperTier}_${upperInterval}_PRODUCT`] =
        `com.betweener.staging.premium.${tier}.${interval}`;
      preview[`EXPO_PUBLIC_REVENUECAT_ANDROID_${upperTier}_${upperInterval}_PRODUCT`] =
        `com.betweener.staging.premium.${tier}:${interval}`;
    }
  }
  return {
    preview,
    production,
    build: {
      appVariant: 'staging',
      environment: 'staging',
      bundleIdentifier: 'com.aduboffour.betweener.staging',
      easProjectId: '7f38a835-2da7-419b-a20b-e1a12e021547',
      updatesUrl: 'https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547',
      androidAppVariant: 'staging',
      androidEnvironment: 'staging',
      androidPackage: 'com.aduboffour.betweener.staging',
      androidChannel: 'staging',
      androidEasProjectId: '7f38a835-2da7-419b-a20b-e1a12e021547',
      androidUpdatesUrl: 'https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547',
    },
  };
};

const runNegativeFixtureTests = () => {
  const cases = [
    ['production Apple key in staging', (fixture) => {
      fixture.preview.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY = fixture.production.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY;
    }],
    ['Test Store key in TestFlight', (fixture) => {
      fixture.preview.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY = 'test_fixture';
    }],
    ['production product in staging', (fixture) => {
      fixture.preview.EXPO_PUBLIC_REVENUECAT_SILVER_PRODUCT = 'com.betweener.premium.silver';
    }],
    ['production Android product in staging', (fixture) => {
      fixture.preview.EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_MONTHLY_PRODUCT =
        'com.betweener.premium.silver.monthly:silver-monthly';
    }],
    ['wrong bundle and environment', (fixture) => {
      fixture.build.environment = 'production';
      fixture.build.bundleIdentifier = 'com.aduboffour.betweener';
    }],
    ['production EAS identity in staging', (fixture) => {
      fixture.build.easProjectId = '7de6cdc4-8616-446f-99de-82764af3a7e6';
      fixture.build.updatesUrl = 'https://u.expo.dev/7de6cdc4-8616-446f-99de-82764af3a7e6';
    }],
    ['missing Apple key', (fixture) => {
      delete fixture.preview.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY;
    }],
    ['missing canonical package', (fixture) => {
      delete fixture.preview.EXPO_PUBLIC_REVENUECAT_SILVER_MONTHLY_PACKAGE;
    }],
  ];

  for (const [name, mutate] of cases) {
    const fixture = makeFixture();
    mutate(fixture);
    let rejected = false;
    try {
      validateRevenueCatIsolation(fixture);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Negative fixture was not rejected: ${name}`);
  }

  return cases.length;
};

const validateSparkStoreSource = () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'lib/economy/store/spark-store-service.ts'),
    'utf8',
  );
  const requiredValues = [
    "'spark_store'",
    "'sparks_100'",
    "'sparks_550'",
    "'sparks_1200'",
    "'sparks_2600'",
    "'com.betweener.staging.sparks.100'",
    "'com.betweener.staging.sparks.550'",
    "'com.betweener.staging.sparks.1200'",
    "'com.betweener.staging.sparks.2600'",
  ];
  for (const value of requiredValues) {
    if (!source.includes(value)) throw new Error(`Spark Store configuration is missing ${value}.`);
  }
  if (/EXPO_PUBLIC_SPARKS_\d+_PRODUCT/u.test(source)) {
    throw new Error('Spark Store must resolve packages from RevenueCat without public product fallbacks.');
  }
  if (/com\.betweener\.sparks\.\d+/u.test(source)) {
    throw new Error('Staging Spark Store source contains a production Apple Spark product fallback.');
  }
};

const validateAndroidRevenueCatSource = () => {
  const configSource = fs.readFileSync(
    path.join(projectRoot, 'lib/membership/revenuecat-product-config.ts'),
    'utf8',
  );
  const subscriptionsSource = fs.readFileSync(
    path.join(projectRoot, 'lib/subscriptions.ts'),
    'utf8',
  );
  const names = [
    'EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_MONTHLY_PRODUCT',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_QUARTERLY_PRODUCT',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_SILVER_ANNUAL_PRODUCT',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_MONTHLY_PRODUCT',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_QUARTERLY_PRODUCT',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_GOLD_ANNUAL_PRODUCT',
  ];
  for (const name of names) {
    if (!configSource.includes(`process.env.${name}`)) {
      throw new Error(`Android RevenueCat source is missing a static reference to ${name}.`);
    }
  }
  if (/process\.env\[/u.test(`${configSource}\n${subscriptionsSource}`)) {
    throw new Error('RevenueCat product resolution still contains dynamic process.env access.');
  }
};

if (process.argv.includes('--self-test')) {
  validateSparkStoreSource();
  validateAndroidRevenueCatSource();
  console.log(JSON.stringify({
    negativeFixtures: 'PASS',
    cases: runNegativeFixtureTests(),
    sparkStoreConfiguration: 'PASS',
    androidRevenueCatSource: 'PASS',
  }));
  process.exit(0);
}

const preview = listEnvironment('preview', 'staging');
const production = listEnvironment('production', 'production');
const easConfig = require(path.join(projectRoot, 'eas.json'));
const testflightProfile = easConfig.build?.testflightStaging;
const playStagingProfile = easConfig.build?.playStaging;
const previousVariant = process.env.APP_VARIANT;
const previousEnvironment = process.env.EXPO_PUBLIC_ENVIRONMENT;
process.env.APP_VARIANT = testflightProfile?.env?.APP_VARIANT || '';
process.env.EXPO_PUBLIC_ENVIRONMENT = testflightProfile?.env?.EXPO_PUBLIC_ENVIRONMENT || '';
const appConfigFactory = require(path.join(projectRoot, 'app.config.js'));
const appJson = require(path.join(projectRoot, 'app.json'));
const resolvedAppConfig = appConfigFactory({ config: appJson.expo || appJson });
if (previousVariant === undefined) delete process.env.APP_VARIANT;
else process.env.APP_VARIANT = previousVariant;
if (previousEnvironment === undefined) delete process.env.EXPO_PUBLIC_ENVIRONMENT;
else process.env.EXPO_PUBLIC_ENVIRONMENT = previousEnvironment;

process.env.APP_VARIANT = playStagingProfile?.env?.APP_VARIANT || '';
process.env.EXPO_PUBLIC_ENVIRONMENT = preview.EXPO_PUBLIC_ENVIRONMENT || '';
const resolvedAndroidAppConfig = appConfigFactory({ config: appJson.expo || appJson });
if (previousVariant === undefined) delete process.env.APP_VARIANT;
else process.env.APP_VARIANT = previousVariant;
if (previousEnvironment === undefined) delete process.env.EXPO_PUBLIC_ENVIRONMENT;
else process.env.EXPO_PUBLIC_ENVIRONMENT = previousEnvironment;

validateRevenueCatIsolation({
  preview,
  production,
  build: {
    appVariant: testflightProfile?.env?.APP_VARIANT,
    environment: testflightProfile?.env?.EXPO_PUBLIC_ENVIRONMENT,
    bundleIdentifier: resolvedAppConfig.ios?.bundleIdentifier,
    easProjectId: resolvedAppConfig.extra?.eas?.projectId,
    updatesUrl: resolvedAppConfig.updates?.url,
    androidAppVariant: playStagingProfile?.env?.APP_VARIANT,
    androidEnvironment: preview.EXPO_PUBLIC_ENVIRONMENT,
    androidPackage: resolvedAndroidAppConfig.android?.package,
    androidChannel: playStagingProfile?.channel,
    androidEasProjectId: resolvedAndroidAppConfig.extra?.eas?.projectId,
    androidUpdatesUrl: resolvedAndroidAppConfig.updates?.url,
  },
});
validateSparkStoreSource();
validateAndroidRevenueCatSource();

console.log(JSON.stringify({
  iosRevenueCatIsolation: 'PASS',
  sparkStoreConfiguration: 'PASS',
  productionResolution: 'UNCHANGED',
  androidIsolation: 'PASS',
  androidRevenueCatSource: 'PASS',
}));
