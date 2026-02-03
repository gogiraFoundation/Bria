const webpack = require('webpack');
const path = require('path');

module.exports = function override(config, env) {
  // Ensure resolve exists
  if (!config.resolve) {
    config.resolve = {};
  }
  
  // Set up fallbacks for Node.js core modules
  const fallbacks = {
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "assert": require.resolve("assert"),
    "http": require.resolve("stream-http"),
    "https": require.resolve("https-browserify"),
    "os": require.resolve("os-browserify/browser"),
    "url": require.resolve("url"),
    "buffer": require.resolve("buffer"),
    "zlib": require.resolve("browserify-zlib"),
    "util": require.resolve("util"),
    "path": require.resolve("path-browserify"),
    "process": require.resolve("process/browser.js"),
  };
  
  config.resolve.fallback = {
    ...(config.resolve.fallback || {}),
    ...fallbacks
  };
  
  // Add alias for process/browser (axios and other packages use this)
  if (!config.resolve.alias) {
    config.resolve.alias = {};
  }
  config.resolve.alias['process/browser'] = require.resolve('process/browser.js');
  
  // Add plugins
  if (!config.plugins) {
    config.plugins = [];
  }
  
  // Use NormalModuleReplacementPlugin to replace process/browser imports
  config.plugins.push(
    new webpack.NormalModuleReplacementPlugin(
      /^process\/browser$/,
      (resource) => {
        resource.request = require.resolve('process/browser.js');
      }
    )
  );
  
  config.plugins.push(
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer']
    })
  );
  
  // Configure resolve extensions to include .js for ESM modules
  if (!config.resolve.extensions) {
    config.resolve.extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
  }
  
  // Ignore warnings
  if (!config.ignoreWarnings) {
    config.ignoreWarnings = [];
  }
  config.ignoreWarnings.push(
    /Failed to parse source map/,
    /Module not found:.*stream/,
  );
  
  console.log('Webpack config override applied - fallbacks:', Object.keys(fallbacks));
  
  return config;
};

