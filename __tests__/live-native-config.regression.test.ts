import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
const guardPlugin = fs.readFileSync(
  path.join(root, 'plugins/with-betweener-live-webrtc.js'),
  'utf8',
);
const appJson = fs.readFileSync(path.join(root, 'app.json'), 'utf8');

test('Stream native setup is present with all optional background features disabled', () => {
  assert.match(appConfig, /'@stream-io\/video-react-native-sdk'/);
  assert.match(appConfig, /ringing:\s*false/);
  assert.match(appConfig, /androidKeepCallAlive:\s*false/);
  assert.match(appConfig, /iosKeepCallAlive:\s*false/);
  assert.match(appConfig, /enableScreenshare:\s*false/);
  assert.match(appConfig, /enableNonRingingPushNotifications:\s*false/);
  assert.match(appConfig, /iOSEnableMultitaskingCameraAccess:\s*false/);
});

test('Betweener compliance guard is registered for final native-mod cleanup', () => {
  assert.ok(
    appConfig.indexOf("'./plugins/with-betweener-live-webrtc.js'")
      < appConfig.indexOf("'@stream-io/video-react-native-sdk'"),
  );
  assert.match(guardPlugin, /filter\(\(mode\) => mode !== 'audio'\)/);
  assert.match(guardPlugin, /delete modConfig\.modResults\.UIBackgroundModes/);
});

test('Live native config retains privacy permissions and blocks overlay permission', () => {
  assert.match(guardPlugin, /NSCameraUsageDescription/);
  assert.match(guardPlugin, /NSMicrophoneUsageDescription/);
  assert.match(guardPlugin, /android\.permission\.CAMERA/);
  assert.match(guardPlugin, /android\.permission\.RECORD_AUDIO/);
  assert.match(appJson, /android\.permission\.SYSTEM_ALERT_WINDOW/);
  assert.match(appJson, /blockedPermissions/);
});

test('resolved iOS native config does not declare persistent background audio', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/expo/bin/cli'), 'config', '--type', 'introspect', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EXPO_NO_DOTENV: '1' },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const resolved = JSON.parse(result.stdout) as {
    ios?: { infoPlist?: { UIBackgroundModes?: string[] } };
  };
  const backgroundModes = resolved.ios?.infoPlist?.UIBackgroundModes ?? [];
  assert.equal(backgroundModes.includes('audio'), false);
  assert.equal(backgroundModes.includes('remote-notification'), true);
});
