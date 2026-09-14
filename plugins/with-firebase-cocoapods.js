const { createRunOncePlugin, withPodfile } = require('expo/config-plugins');

const pkg = {
  name: 'with-firebase-cocoapods',
  version: '1.0.0',
};

const podfileAnchor = 'prepare_react_native_project!';
const disableSpmFlag = '$RNFirebaseDisableSPM = true';

const withFirebaseCocoaPods = (config) =>
  withPodfile(config, (modConfig) => {
    if (modConfig.modResults.contents.includes(disableSpmFlag)) {
      return modConfig;
    }

    if (!modConfig.modResults.contents.includes(podfileAnchor)) {
      throw new Error('Unable to configure Firebase CocoaPods resolution: Podfile anchor missing.');
    }

    modConfig.modResults.contents = modConfig.modResults.contents.replace(
      podfileAnchor,
      `${podfileAnchor}\n\n# Firebase SPM is incompatible with the app's static framework linkage.\n${disableSpmFlag}`,
    );
    return modConfig;
  });

module.exports = createRunOncePlugin(withFirebaseCocoaPods, pkg.name, pkg.version);
