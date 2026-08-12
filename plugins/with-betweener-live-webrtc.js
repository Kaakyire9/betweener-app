const {
  AndroidConfig,
  createRunOncePlugin,
  withInfoPlist,
} = require('expo/config-plugins');

const pkg = {
  name: 'with-betweener-live-webrtc',
  version: '1.0.0',
};

const withBetweenerLiveWebRtc = (config) => {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSCameraUsageDescription ??=
      'Betweener uses your camera when you choose to join a Live stage.';
    modConfig.modResults.NSMicrophoneUsageDescription ??=
      'Betweener uses your microphone when you choose to speak in a Live session.';

    const backgroundModes = Array.isArray(modConfig.modResults.UIBackgroundModes)
      ? modConfig.modResults.UIBackgroundModes
      : [];
    const allowedBackgroundModes = backgroundModes.filter((mode) => mode !== 'audio');
    if (allowedBackgroundModes.length > 0) {
      modConfig.modResults.UIBackgroundModes = allowedBackgroundModes;
    } else {
      delete modConfig.modResults.UIBackgroundModes;
    }
    return modConfig;
  });

  config.ios ??= {};
  config.ios.bitcode = false;

  return AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.CAMERA',
    'android.permission.INTERNET',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.RECORD_AUDIO',
    'android.permission.WAKE_LOCK',
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_CONNECT',
  ]);
};

module.exports = createRunOncePlugin(
  withBetweenerLiveWebRtc,
  pkg.name,
  pkg.version,
);
