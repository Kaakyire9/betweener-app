const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath.replace(/\\/g, '/');
  const dependency = moduleName.startsWith('.')
    ? path.posix.normalize(`${path.posix.dirname(origin)}/${moduleName}`)
    : moduleName.replace(/\\/g, '/');
  // These developer-only clients open sockets even when Fast Refresh is off.
  // Replace their interfaces only in this standalone bundle, never networking.
  if (/(?:^|\/)react-native\/Libraries\/Utilities\/HMRClient(?:\.js)?$/.test(dependency)
    || /(?:^expo\/|\/node_modules\/expo\/)(?:src|build)\/async-require\/hmr(?:\.[jt]s)?$/.test(dependency)) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'offline-hmr-client.ts') };
  }
  if (/(?:^expo\/|\/node_modules\/expo\/)(?:src|build)\/async-require\/messageSocket(?:\.[jt]s)?$/.test(dependency)) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'offline-devtools.ts') };
  }
  return upstreamResolve ? upstreamResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};
config.watchFolders = [path.resolve(__dirname, '../..')];
config.maxWorkers = 2;
// Intentionally do not load the app's Sentry Metro integration or app bootstrap.
module.exports = config;
