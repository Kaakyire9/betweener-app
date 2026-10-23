import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

const {
  PRODUCTION_PACKAGE,
  STAGING_PACKAGE,
  readMappingIdentity,
  resolveProfilePolicy,
  runEasSuccess,
  verifyManifestBinding,
  verifyProductionArtifacts,
  verifyRepositoryPolicy,
} = require('../scripts/verify-android-release-readiness.cjs');

const eas = require('../eas.json');

describe('Android production release readiness', () => {
  it('keeps development, staging, and playStaging outside the production mapping rule', () => {
    for (const profile of ['development', 'staging', 'playStaging']) {
      expect(resolveProfilePolicy(eas, profile)).toEqual(expect.objectContaining({
        packageName: STAGING_PACKAGE,
        minifyEnabled: false,
        shrinkResources: false,
        mappingRequired: false,
      }));
    }
  });

  it('requires R8, resource shrinking, and mapping artifacts for production', () => {
    expect(resolveProfilePolicy(eas, 'production')).toEqual(expect.objectContaining({
      packageName: PRODUCTION_PACKAGE,
      minifyEnabled: true,
      shrinkResources: true,
      mappingRequired: true,
    }));
    expect(() => verifyRepositoryPolicy()).not.toThrow();
  });

  it('keeps Sentry mapping/native uploads enabled without overriding the native release ID', () => {
    const appJson = require('../app.json');
    const plugin = appJson.expo.plugins.find(
      (candidate: unknown) => Array.isArray(candidate) && candidate[0] === '@sentry/react-native/expo',
    );
    expect(plugin[1].experimental_android).toEqual(expect.objectContaining({
      enableAndroidGradlePlugin: true,
      includeProguardMapping: true,
      autoUploadProguardMapping: true,
      uploadNativeSymbols: true,
      autoUploadNativeSymbols: true,
    }));

    const sentryRuntime = fs.readFileSync(path.join(process.cwd(), 'lib/telemetry/sentry.ts'), 'utf8');
    const options = sentryRuntime.slice(
      sentryRuntime.indexOf('Sentry.init({'),
      sentryRuntime.indexOf('beforeBreadcrumb'),
    );
    expect(options).not.toMatch(/\brelease\s*[:,]/u);
    expect(options).not.toMatch(/\bdist\s*[:,]/u);
  });

  it('fails when a production mapping is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betweener-r8-missing-'));
    const buildGradle = path.join(root, 'build.gradle');
    fs.writeFileSync(buildGradle, `android { defaultConfig { applicationId '${PRODUCTION_PACKAGE}' versionCode 22 versionName '1.2.0' } }`);

    expect(() => verifyProductionArtifacts({
      projectRoot: root,
      buildGradlePath: buildGradle,
      mappingPath: path.join(root, 'missing-mapping.txt'),
      writeManifest: false,
    })).toThrow('Required R8 mapping is missing');
  });

  it('accepts an R8 mapping and binds it to the exact production build identity', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betweener-r8-valid-'));
    const buildGradle = path.join(root, 'build.gradle');
    const mappingPath = path.join(root, 'mapping.txt');
    fs.writeFileSync(buildGradle, `android { defaultConfig { applicationId '${PRODUCTION_PACKAGE}' versionCode 23 versionName '1.2.1' } }`);
    fs.writeFileSync(mappingPath, '# compiler: R8\n# pg_map_id: abc123\ncom.example.Real -> a:\n');

    expect(verifyProductionArtifacts({
      projectRoot: root,
      buildGradlePath: buildGradle,
      mappingPath,
      writeManifest: false,
    })).toEqual(expect.objectContaining({
      profile: 'production',
      packageName: PRODUCTION_PACKAGE,
      versionCode: '23',
      versionName: '1.2.1',
      mappingMapId: 'abc123',
    }));
  });

  it('rejects a mapping manifest from another build or mapping file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betweener-r8-mismatch-'));
    const mappingPath = path.join(root, 'mapping.txt');
    fs.writeFileSync(mappingPath, '# compiler: R8\n# pg_map_id: current\ncom.example.Real -> a:\n');
    const mapping = readMappingIdentity(mappingPath);
    const buildIdentity = { packageName: PRODUCTION_PACKAGE, versionCode: '24', versionName: '1.2.1' };

    expect(() => verifyManifestBinding({
      mapping,
      buildIdentity,
      manifest: {
        profile: 'production',
        packageName: PRODUCTION_PACKAGE,
        versionCode: '23',
        versionName: '1.2.1',
        mappingSha256: 'wrong-build-mapping',
      },
    })).toThrow('versionCode mismatch');
  });

  it('skips the production-only artifact rule for staging and iOS builds', () => {
    expect(runEasSuccess({ environment: {
      EAS_BUILD_PLATFORM: 'android',
      EAS_BUILD_PROFILE: 'playStaging',
    } })).toEqual({ skipped: true, reason: 'non-production Android profile' });
    expect(runEasSuccess({ environment: {
      EAS_BUILD_PLATFORM: 'ios',
      EAS_BUILD_PROFILE: 'production',
    } })).toEqual({ skipped: true, reason: 'non-Android build' });
  });

  it('rejects the wrong package even when a valid R8 mapping exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betweener-r8-package-'));
    const buildGradle = path.join(root, 'build.gradle');
    const mappingPath = path.join(root, 'mapping.txt');
    fs.writeFileSync(buildGradle, `android { defaultConfig { applicationId '${STAGING_PACKAGE}' versionCode 25 versionName '1.2.1' } }`);
    fs.writeFileSync(mappingPath, '# compiler: R8\ncom.example.Real -> a:\n');

    expect(() => verifyProductionArtifacts({
      projectRoot: root,
      buildGradlePath: buildGradle,
      mappingPath,
      writeManifest: false,
    })).toThrow(`Production build applicationId must be ${PRODUCTION_PACKAGE}`);
  });
});
