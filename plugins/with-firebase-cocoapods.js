const { createRunOncePlugin, withPodfile } = require('expo/config-plugins');

const pkg = {
  name: 'with-firebase-cocoapods',
  version: '1.0.0',
};

const podfileAnchor = 'prepare_react_native_project!';
const disableSpmFlag = '$RNFirebaseDisableSPM = true';
const modularHeadersFlag = 'use_modular_headers!';

const withFirebaseCocoaPods = (config) =>
  withPodfile(config, (modConfig) => {
    const missingDirectives = [];
    if (!modConfig.modResults.contents.includes(disableSpmFlag)) {
      missingDirectives.push(
        "# Firebase SPM is incompatible with the app's static linkage.",
        disableSpmFlag,
      );
    }
    if (!modConfig.modResults.contents.includes(modularHeadersFlag)) {
      missingDirectives.push(
        "# Firebase's Swift pods require module maps when integrated as static libraries.",
        modularHeadersFlag,
      );
    }
    if (missingDirectives.length === 0) {
      return modConfig;
    }

    if (!modConfig.modResults.contents.includes(podfileAnchor)) {
      throw new Error('Unable to configure Firebase CocoaPods resolution: Podfile anchor missing.');
    }

    modConfig.modResults.contents = modConfig.modResults.contents.replace(
      podfileAnchor,
      `${podfileAnchor}\n\n${missingDirectives.join('\n')}`,
    );
    return modConfig;
  });

module.exports = createRunOncePlugin(withFirebaseCocoaPods, pkg.name, pkg.version);
