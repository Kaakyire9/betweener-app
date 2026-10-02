/* global __dirname */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

const easCommand = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'eas.cmd')
  : 'eas';

const listEnvironment = (environment) => {
  const result = process.platform === 'win32'
    ? spawnSync(
        process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
        ['/d', '/s', '/c', `${easCommand} env:list ${environment} --format short`],
        { encoding: 'utf8' },
      )
    : spawnSync(
        easCommand,
        ['env:list', environment, '--format', 'short'],
        { encoding: 'utf8' },
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
  if (
    build.appVariant !== 'staging'
    || build.environment !== 'staging'
    || build.bundleIdentifier !== 'com.aduboffour.betweener.staging'
  ) {
    throw new Error('TestFlight staging build identity is inconsistent.');
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
    }
  }
};

const makeFixture = () => {
  const preview = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://xsgzxadwuxuziubglvps.supabase.co',
    EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: 'appl_staging_fixture',
  };
  const production = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://jbyblhithbqwojhwlenv.supabase.co',
    EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: 'appl_production_fixture',
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
    }
  }
  return {
    preview,
    production,
    build: {
      appVariant: 'staging',
      environment: 'staging',
      bundleIdentifier: 'com.aduboffour.betweener.staging',
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
    ['wrong bundle and environment', (fixture) => {
      fixture.build.environment = 'production';
      fixture.build.bundleIdentifier = 'com.aduboffour.betweener';
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

if (process.argv.includes('--self-test')) {
  validateSparkStoreSource();
  console.log(JSON.stringify({
    negativeFixtures: 'PASS',
    cases: runNegativeFixtureTests(),
    sparkStoreConfiguration: 'PASS',
  }));
  process.exit(0);
}

const preview = listEnvironment('preview');
const production = listEnvironment('production');
const easConfig = require(path.join(projectRoot, 'eas.json'));
const testflightProfile = easConfig.build?.testflightStaging;
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

validateRevenueCatIsolation({
  preview,
  production,
  build: {
    appVariant: testflightProfile?.env?.APP_VARIANT,
    environment: testflightProfile?.env?.EXPO_PUBLIC_ENVIRONMENT,
    bundleIdentifier: resolvedAppConfig.ios?.bundleIdentifier,
  },
});
validateSparkStoreSource();

console.log(JSON.stringify({
  iosRevenueCatIsolation: 'PASS',
  sparkStoreConfiguration: 'PASS',
  productionResolution: 'UNCHANGED',
  androidIsolation: 'PENDING',
}));
