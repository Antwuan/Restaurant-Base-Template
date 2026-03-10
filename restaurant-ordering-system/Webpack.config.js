const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(
    {
      ...env,
      babel: {
        dangerouslyAddModulePathsToTranspile: ['@supabase/supabase-js'],
      },
    },
    argv
  );

  // Alias react-native -> react-native-web
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    'react-native$': 'react-native-web',
    'react-native/Libraries/Utilities/Platform': 'react-native-web/dist/exports/Platform',
  };

  // Ensure environment variables are available on web
  config.resolve.extensions = [
    '.web.js',
    '.web.ts',
    '.web.tsx',
    '.js',
    '.ts',
    '.tsx',
    ...config.resolve.extensions,
  ];

  // Set the public path for assets
  config.output = {
    ...config.output,
    publicPath: '/',
  };

  return config;
};