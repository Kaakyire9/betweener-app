/* global __dirname */

const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const PRODUCTION_IDENTITY = Object.freeze({
  variant: 'production',
  name: 'Betweener',
  bundleIdentifier: 'com.aduboffour.betweener',
  scheme: 'betweenerapp',
  webOrigin: 'https://getbetweener.com',
  icon: './assets/images/ios-icon-1024.png',
  foregroundIcon: './assets/images/foreground-icon.png',
  backgroundIcon: './assets/images/background-icon.png',
  supabaseProjectRef: 'jbyblhithbqwojhwlenv',
});

const STAGING_IDENTITY = Object.freeze({
  variant: 'staging',
  name: 'Betweener S',
  bundleIdentifier: 'com.aduboffour.betweener.staging',
  scheme: 'betweenerstaging',
  webOrigin: 'https://staging.getbetweener.com',
  icon: './assets/images/staging-icon-1024.png',
  foregroundIcon: './assets/images/staging-foreground-icon.png',
  backgroundIcon: './assets/images/staging-background-icon.png',
  supabaseProjectRef: 'xsgzxadwuxuziubglvps',
});

const resolveIdentity = () => {
  const variant = String(process.env.APP_VARIANT || '').trim().toLowerCase();
  return variant === 'staging' ? STAGING_IDENTITY : PRODUCTION_IDENTITY;
};

const resolveExistingFile = (environmentName, fallbackPath) => {
  const candidate = String(process.env[environmentName] || fallbackPath || '').trim();
  if (!candidate) return undefined;
  const absolutePath = path.isAbsolute(candidate) ? candidate : path.resolve(__dirname, candidate);
  return fs.existsSync(absolutePath) ? candidate : undefined;
};

const toAbsolutePath = (candidate) =>
  path.isAbsolute(candidate) ? candidate : path.resolve(__dirname, candidate);

const assertFirebaseIdentity = ({ identity, googleServicesFile, googleServiceInfoPlist }) => {
  if (googleServicesFile) {
    const firebaseConfig = JSON.parse(fs.readFileSync(toAbsolutePath(googleServicesFile), 'utf8'));
    const androidPackages = (firebaseConfig.client ?? [])
      .map((client) => client?.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    if (!androidPackages.includes(identity.bundleIdentifier)) {
      throw new Error(
        `[app-config] Firebase Android config does not contain ${identity.bundleIdentifier}.`,
      );
    }
  }

  if (googleServiceInfoPlist) {
    const plist = fs.readFileSync(toAbsolutePath(googleServiceInfoPlist), 'utf8');
    const bundleIdMatch = plist.match(
      /<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/u,
    );
    if (bundleIdMatch?.[1]?.trim() !== identity.bundleIdentifier) {
      throw new Error(
        `[app-config] Firebase iOS config does not match ${identity.bundleIdentifier}.`,
      );
    }
  }
};

const assertBuildIdentity = ({ identity, googleServicesFile, googleServiceInfoPlist }) => {
  if (process.env.EAS_BUILD !== 'true') return;

  const buildPlatform = String(process.env.EAS_BUILD_PLATFORM || '').trim().toLowerCase();
  const buildProfile = String(process.env.EAS_BUILD_PROFILE || '').trim();
  const androidOnlyProfiles = new Set(['playInternal', 'playVerification']);
  if (buildPlatform === 'ios' && androidOnlyProfiles.has(buildProfile)) {
    throw new Error(
      `[app-config] Build profile ${buildProfile} is Android-only and cannot produce an iOS build.`,
    );
  }

  const environment = String(process.env.EXPO_PUBLIC_ENVIRONMENT || '').trim().toLowerCase();
  const allowedEnvironments = identity.variant === 'staging'
    ? new Set(['development', 'preview', 'staging'])
    : new Set(['production']);

  if (!allowedEnvironments.has(environment)) {
    throw new Error(
      `[app-config] ${identity.name} cannot build with EXPO_PUBLIC_ENVIRONMENT=${environment || 'missing'}.`,
    );
  }

  const supabaseUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  let supabaseHost = '';
  try {
    supabaseHost = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    // The explicit mismatch error below is safer and more actionable.
  }
  if (supabaseHost !== `${identity.supabaseProjectRef}.supabase.co`) {
    throw new Error(
      `[app-config] ${identity.name} is not connected to its expected Supabase project.`,
    );
  }

  if (!String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim()) {
    throw new Error(`[app-config] ${identity.name} requires EXPO_PUBLIC_SUPABASE_ANON_KEY.`);
  }

  if (process.env.EAS_BUILD_PLATFORM === 'android' && !googleServicesFile) {
    throw new Error(
      `[app-config] ${identity.name} requires a GOOGLE_SERVICES_JSON EAS file variable.`,
    );
  }

  if (process.env.EAS_BUILD_PLATFORM === 'ios' && !googleServiceInfoPlist) {
    throw new Error(
      `[app-config] ${identity.name} requires a GOOGLE_SERVICE_INFO_PLIST EAS file variable.`,
    );
  }

  assertFirebaseIdentity({ identity, googleServicesFile, googleServiceInfoPlist });
};

const configureVariantPlugin = (plugin, identity) => {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  const options = Array.isArray(plugin) && plugin[1] && typeof plugin[1] === 'object'
    ? plugin[1]
    : {};

  if (name === 'expo-router') {
    return ['expo-router', { ...options, origin: `${identity.scheme}://` }];
  }

  if (name === 'expo-splash-screen' && identity.variant === 'staging') {
    return [
      'expo-splash-screen',
      {
        ...options,
        image: identity.foregroundIcon,
        dark: {
          ...(options.dark ?? {}),
          image: identity.foregroundIcon,
        },
      },
    ];
  }

  return plugin;
};

function withGooglePlayPackageVerificationAsset(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const token = process.env.GOOGLE_PLAY_PACKAGE_VERIFICATION_TOKEN;
      if (!token) return modConfig;

      const assetsDir = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(assetsDir, 'adi-registration.properties'), token.trim(), 'utf8');
      return modConfig;
    },
  ]);
}

module.exports = ({ config }) => {
  const identity = resolveIdentity();
  const googleServicesFile = resolveExistingFile(
    'GOOGLE_SERVICES_JSON',
    identity.variant === 'staging' ? './google-services.staging.json' : config.android?.googleServicesFile,
  );
  const googleServiceInfoPlist = resolveExistingFile(
    'GOOGLE_SERVICE_INFO_PLIST',
    identity.variant === 'staging' ? './GoogleService-Info.staging.plist' : config.ios?.googleServicesFile,
  );

  assertBuildIdentity({ identity, googleServicesFile, googleServiceInfoPlist });

  const androidMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
    process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;
  const iosMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ||
    process.env.GOOGLE_MAPS_IOS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;

  // EAS "development" builds typically use a development provisioning profile (APNS sandbox).
  // TestFlight / Ad Hoc / App Store builds use production APNS.
  const apnsMode =
    process.env.EXPO_PUBLIC_ENVIRONMENT === 'development' ? 'development' : 'production';
  return {
    ...config,
    name: identity.name,
    scheme: identity.scheme,
    icon: identity.icon,
    ios: {
      ...(config.ios ?? {}),
      bundleIdentifier: identity.bundleIdentifier,
      icon: identity.icon,
      googleServicesFile: googleServiceInfoPlist,
      associatedDomains: [`applinks:${new URL(identity.webOrigin).hostname}`],
      infoPlist: {
        ...(config.ios?.infoPlist ?? {}),
        CFBundleURLTypes: [
          {
            CFBundleURLName: identity.bundleIdentifier,
            CFBundleURLSchemes: [identity.scheme],
          },
        ],
        LSApplicationQueriesSchemes: [identity.scheme],
      },
    },
    android: {
      ...(config.android ?? {}),
      package: identity.bundleIdentifier,
      googleServicesFile,
      adaptiveIcon: {
        ...(config.android?.adaptiveIcon ?? {}),
        foregroundImage: identity.foregroundIcon,
        backgroundImage: identity.backgroundIcon,
        backgroundColor: '#0B111B',
      },
      intentFilters: [
        {
          action: 'VIEW',
          data: [{ scheme: identity.scheme }],
          category: ['BROWSABLE', 'DEFAULT'],
          autoVerify: true,
        },
        {
          action: 'VIEW',
          data: [{ scheme: identity.scheme, host: 'auth' }],
          category: ['BROWSABLE', 'DEFAULT'],
          autoVerify: true,
        },
        {
          action: 'VIEW',
          data: [{ scheme: 'https', host: new URL(identity.webOrigin).hostname }],
          category: ['BROWSABLE', 'DEFAULT'],
          autoVerify: true,
        },
      ],
    },
    extra: {
      ...(config.extra ?? {}),
      appIdentity: {
        variant: identity.variant,
        name: identity.name,
        scheme: identity.scheme,
        bundleIdentifier: identity.bundleIdentifier,
        webOrigin: identity.webOrigin,
      },
    },
    plugins: [
      // Keep this plugin first so the NSE target is present before other iOS plugins run.
      [
        'expo-notification-service-extension-plugin',
        {
          mode: apnsMode,
          iosNSEFilePath: './assets/NotificationService.m',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 26,
            compileSdkVersion: 36,
            targetSdkVersion: 36,
          },
          ios: {
            deploymentTarget: '16.4',
          },
        },
      ],
      './plugins/with-firebase-cocoapods.js',
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: iosMapsApiKey,
          androidGoogleMapsApiKey: androidMapsApiKey,
        },
      ],
      withGooglePlayPackageVerificationAsset,
      ...(identity.variant === 'staging'
        ? [['expo-dev-client', { addGeneratedScheme: false }]]
        : []),
      ...(config.plugins ?? []).map((plugin) => configureVariantPlugin(plugin, identity)),
      'expo-asset',
      'expo-image',
      '@react-native-community/datetimepicker',
      'expo-web-browser',
      'expo-sqlite',
      'expo-secure-store',
      [
        'expo-audio',
        {
          recordAudioAndroid: true,
          enableBackgroundRecording: false,
          enableBackgroundPlayback: false,
        },
      ],
      'expo-apple-authentication',
      // Expo composes native mods inside-out. Register Betweener's Live native
      // normalizer before Stream so its final Info.plist pass executes last.
      './plugins/with-betweener-live-webrtc.js',
      [
        '@stream-io/video-react-native-sdk',
        {
          ringing: false,
          androidKeepCallAlive: true,
          iosKeepCallAlive: true,
          enableScreenshare: false,
          enableNonRingingPushNotifications: false,
          iOSEnableMultitaskingCameraAccess: true,
          androidPictureInPicture: true,
          addNoiseCancellation: false,
        },
      ],
      // Note: Sentry is configured via the Expo config plugin in app.json:
      // ["@sentry/react-native/expo", { organization, project }]
      // Avoid adding '@sentry/react-native' here to prevent duplicate/competing config plugins.
    ],
  };
};
