const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');

/**
 * Ensure web builds resolve `react-native` to `react-native-web`.
 * Without this, Metro may try to bundle `react-native` internals on web
 * (e.g. `Libraries/Utilities/Platform`), which do not ship a `.web.js` entry.
 */
const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver.alias = {
  ...(config.resolver.alias || {}),
  'react-native': 'react-native-web',
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (
      moduleName === 'react-native/Libraries/Utilities/Platform' ||
      moduleName.endsWith('/Utilities/Platform') ||
      moduleName.endsWith('\\Utilities\\Platform')
    ) {
      return resolve(context, 'react-native-web/dist/exports/Platform', platform);
    }

    if (moduleName === 'react-native/Libraries/Components/TextInput/TextInputState') {
      return resolve(context, 'react-native-web/dist/modules/TextInputState', platform);
    }

    if (moduleName === 'react-native') {
      return resolve(context, 'react-native-web', platform);
    }
  }

  return resolve(context, moduleName, platform);
};

config.resolver.sourceExts = Array.from(
  new Set([...(config.resolver.sourceExts || []), 'web.js', 'web.ts', 'web.tsx'])
);

module.exports = config;
