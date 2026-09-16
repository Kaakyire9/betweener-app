import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { BoundedCacheStore } = require('../config/metro/bounded-cache-store') as {
  BoundedCacheStore: new <T>(
    store: {
      get(key: Buffer): Promise<T | null>;
      set(key: Buffer, value: T): Promise<void>;
      clear(): Promise<void> | void;
    },
    options?: { maxConcurrency?: number },
  ) => {
    get(key: Buffer): Promise<T | null>;
    set(key: Buffer, value: T): Promise<void>;
    clear(): void;
  };
};
const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
const guardPlugin = fs.readFileSync(
  path.join(root, 'plugins/with-betweener-live-webrtc.js'),
  'utf8',
);
const firebaseCocoaPodsPlugin = fs.readFileSync(
  path.join(root, 'plugins/with-firebase-cocoapods.js'),
  'utf8',
);
const appJson = fs.readFileSync(path.join(root, 'app.json'), 'utf8');
const appEntry = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const metroConfig = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');
const backgroundClient = fs.readFileSync(
  path.join(root, 'features/live/media/stream-video-background-client.ts'),
  'utf8',
);
const liveStage = fs.readFileSync(
  path.join(root, 'features/live/components/StreamLiveStage.tsx'),
  'utf8',
);
const livePictureInPictureActions = fs.readFileSync(
  path.join(root, 'features/live/media/live-picture-in-picture-actions.ts'),
  'utf8',
);
const publicLiveRoute = fs.readFileSync(path.join(root, 'app/live/[sessionId].tsx'), 'utf8');
const privateSparkRoute = fs.readFileSync(
  path.join(root, 'app/live/private-spark/[privateSparkId].tsx'),
  'utf8',
);
const screenAwakeManager = fs.readFileSync(
  path.join(root, 'lib/device/screen-awake.ts'),
  'utf8',
);
const scopedScreenAwakeHook = fs.readFileSync(
  path.join(root, 'hooks/use-scoped-screen-awake.ts'),
  'utf8',
);

test('Stream native setup enables active-call continuity and native PiP', () => {
  assert.match(appConfig, /'@stream-io\/video-react-native-sdk'/);
  assert.match(appConfig, /ringing:\s*false/);
  assert.match(appConfig, /androidKeepCallAlive:\s*true/);
  assert.match(appConfig, /iosKeepCallAlive:\s*true/);
  assert.match(appConfig, /enableScreenshare:\s*false/);
  assert.match(appConfig, /enableNonRingingPushNotifications:\s*false/);
  assert.match(appConfig, /iOSEnableMultitaskingCameraAccess:\s*true/);
  assert.match(appConfig, /androidPictureInPicture:\s*true/);
});

test('iOS Firebase uses CocoaPods with the existing static framework linkage', () => {
  assert.match(appConfig, /'\.\/plugins\/with-firebase-cocoapods\.js'/);
  assert.match(firebaseCocoaPodsPlugin, /withPodfile/);
  assert.match(firebaseCocoaPodsPlugin, /\$RNFirebaseDisableSPM = true/);
  assert.match(firebaseCocoaPodsPlugin, /use_modular_headers!/);
  assert.match(firebaseCocoaPodsPlugin, /prepare_react_native_project!/);
  assert.match(packageJson, /"@react-native-firebase\/app": "26\.4\.0"/);
  assert.match(packageJson, /"@react-native-firebase\/messaging": "26\.4\.0"/);
});

test('Stream ongoing-call runtime is initialized once at the native app entry point', () => {
  assert.match(packageJson, /"main": "index\.js"/);
  assert.match(packageJson, /"@stream-io\/react-native-callingx": "0\.11\.3"/);
  assert.match(appEntry, /StreamVideoRN\.setPushConfig/);
  assert.match(appEntry, /android:[\s\S]*enableOngoingCalls: true/);
  assert.match(appEntry, /ios:[\s\S]*enableOngoingCalls: true/);
  assert.match(appEntry, /callsHistory: false/);
  assert.match(appEntry, /createStreamVideoClient: async \(\) => getStreamVideoBackgroundClient\(\)/);
  assert.match(backgroundClient, /registerStreamVideoBackgroundClient/);
  assert.match(backgroundClient, /unregisterStreamVideoBackgroundClient/);
  assert.match(appEntry, /require\(["']expo-router\/entry["']\)/);
  assert.doesNotMatch(appEntry, /@expo\/metro-runtime\/error-overlay/);
  assert.doesNotMatch(appEntry, /expo-router\/build\/qualified-entry/);
  assert.ok(
    appEntry.indexOf('StreamVideoRN.setPushConfig')
      < appEntry.indexOf('require("expo-router/entry")'),
  );
});

test('Windows Metro keeps the Stream module graph within a bounded handle budget', () => {
  assert.match(metroConfig, /process\.platform === ["']win32["']/);
  assert.match(metroConfig, /config\.maxWorkers = 1/);
  assert.match(metroConfig, /unstable_workerThreads:\s*false/);
  assert.match(metroConfig, /boundCacheStores\(config\.cacheStores/);
  assert.match(metroConfig, /maxConcurrency:\s*8/);
});

test('Windows Metro cache applies backpressure and preserves synchronous clear', async () => {
  let active = 0;
  let peak = 0;
  let cleared = false;
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
  const store = {
    async get(key: Buffer) {
      active += 1;
      peak = Math.max(peak, active);
      await wait();
      active -= 1;
      return key.toString('hex');
    },
    async set() {
      active += 1;
      peak = Math.max(peak, active);
      await wait();
      active -= 1;
    },
    clear() {
      cleared = true;
    },
  };
  const bounded = new BoundedCacheStore<string>(store, { maxConcurrency: 3 });
  const reads = Array.from({ length: 24 }, (_, index) =>
    bounded.get(Buffer.from([index])),
  );
  bounded.clear();

  await Promise.all(reads);

  assert.equal(peak, 3);
  assert.equal(cleared, true);
});

test('Betweener Live native normalizer is registered for the final native-mod pass', () => {
  assert.ok(
    appConfig.indexOf("'./plugins/with-betweener-live-webrtc.js'")
      < appConfig.indexOf("'@stream-io/video-react-native-sdk'"),
  );
  assert.match(guardPlugin, /new Set\(\[\.\.\.backgroundModes, 'audio', 'voip'\]\)/);
});

test('Live native config retains privacy permissions and blocks overlay permission', () => {
  assert.match(guardPlugin, /NSCameraUsageDescription/);
  assert.match(guardPlugin, /NSMicrophoneUsageDescription/);
  assert.match(guardPlugin, /android\.permission\.CAMERA/);
  assert.match(guardPlugin, /android\.permission\.RECORD_AUDIO/);
  assert.match(guardPlugin, /android\.permission\.FOREGROUND_SERVICE'/);
  assert.match(guardPlugin, /android\.permission\.FOREGROUND_SERVICE_CAMERA/);
  assert.match(guardPlugin, /android\.permission\.FOREGROUND_SERVICE_MICROPHONE/);
  assert.match(guardPlugin, /android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
  assert.match(appJson, /android\.permission\.SYSTEM_ALERT_WINDOW/);
  assert.match(appJson, /blockedPermissions/);
});

test('Android PiP controls are native, scoped and do not require overlay permission', () => {
  assert.match(guardPlugin, /class BetweenerLivePictureInPictureModule/);
  assert.match(guardPlugin, /PictureInPictureParams\.Builder/);
  assert.match(guardPlugin, /PictureInPictureParams\.Builder\(\)\.setActions\(actions\)/);
  assert.match(guardPlugin, /lastActionSignature == signature/);
  assert.match(guardPlugin, /catch \(error: IllegalStateException\)/);
  assert.doesNotMatch(guardPlugin, /setAspectRatio/);
  assert.doesNotMatch(guardPlugin, /android\.util\.Rational/);
  assert.doesNotMatch(guardPlugin, /activity\.getPictureInPictureParams\(\)/);
  assert.doesNotMatch(guardPlugin, /activity\.pictureInPictureParams/);
  assert.match(guardPlugin, /RemoteAction/);
  assert.match(guardPlugin, /ACTION_TOGGLE_MICROPHONE/);
  assert.match(guardPlugin, /ACTION_TOGGLE_CAMERA/);
  assert.match(guardPlugin, /android:exported': 'false'/);
  assert.match(guardPlugin, /reactApplication\.reactHost\?\.currentReactContext/);
  assert.match(livePictureInPictureActions, /NativeEventEmitter/);
  assert.match(livePictureInPictureActions, /toggle_microphone/);
  assert.match(livePictureInPictureActions, /toggle_camera/);
  assert.match(livePictureInPictureActions, /activeActionOwner === owner/);
  assert.match(livePictureInPictureActions, /activeActionOwner !== owner/);
  assert.match(liveStage, /callCid=\{call\.cid\}/);
});

test('custom Live stage activates platform PiP and foreground screen-awake protection', () => {
  assert.match(liveStage, /useAutoEnterPiPEffect\(visualsConcealed\)/);
  assert.match(liveStage, /useIsInPiPMode\(\)/);
  assert.match(liveStage, /<RTCViewPipIOS[\s\S]+includeLocalParticipantVideo[\s\S]+onPiPChange=/);
  assert.match(liveStage, /pictureInPictureStage/);
  assert.doesNotMatch(liveStage, /pictureInPictureLivePill/);
  assert.match(publicLiveRoute, /onPictureInPictureModeChange=/);
  assert.match(publicLiveRoute, /!isPictureInPicture \? <SafeAreaView/);
  assert.match(privateSparkRoute, /onPictureInPictureModeChange=/);
  assert.match(privateSparkRoute, /!isPictureInPicture \? <SafeAreaView/);
  assert.match(publicLiveRoute, /useScopedScreenAwake\([\s\S]+reason:\s*'live_event'/);
  assert.match(privateSparkRoute, /useScopedScreenAwake\([\s\S]+reason:\s*'live_event'/);
});

test('long-running Live leases are confirmed while leaked leases remain observable', () => {
  assert.match(screenAwakeManager, /lastConfirmedAt/);
  assert.match(screenAwakeManager, /export function confirmScreenAwake/);
  assert.match(screenAwakeManager, /screen_awake_stale_lease_detected/);
  assert.match(scopedScreenAwakeHook, /SCREEN_AWAKE_CONFIRM_INTERVAL_MS/);
  assert.match(scopedScreenAwakeHook, /confirmScreenAwake\(tag\)/);
});

test('resolved native config declares active RTC background support', () => {
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
    _internal?: {
      modResults?: {
        android?: {
          manifest?: {
            manifest?: {
              'uses-permission'?: { $?: { 'android:name'?: string } }[];
            };
          };
        };
      };
    };
  };
  const backgroundModes = resolved.ios?.infoPlist?.UIBackgroundModes ?? [];
  assert.equal(backgroundModes.includes('audio'), true);
  assert.equal(backgroundModes.includes('voip'), true);
  assert.equal(backgroundModes.includes('remote-notification'), true);

  const permissions =
    resolved._internal?.modResults?.android?.manifest?.manifest?.['uses-permission']
      ?.map((permission) => permission.$?.['android:name']) ?? [];
  assert.equal(permissions.includes('android.permission.FOREGROUND_SERVICE'), true);
  assert.equal(
    permissions.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'),
    true,
  );
  assert.equal(
    permissions.includes('android.permission.FOREGROUND_SERVICE_CAMERA'),
    true,
  );
  assert.equal(
    permissions.includes('android.permission.FOREGROUND_SERVICE_MICROPHONE'),
    true,
  );
  assert.equal(
    permissions.includes('android.permission.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK'),
    false,
  );
});
