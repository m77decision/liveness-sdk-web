const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const BrowserSyncPlugin = require('browser-sync-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'liveness.js',
    iife: true, 
    strictModuleExceptionHandling: true
  },
  watch: true,
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          mangle: true,
          compress: {
            drop_console: false,
            passes: 2
          },
          format: {
            comments: false,
          },
        },
        extractComments: false,
      })
    ],
  },
  plugins: [
      new BrowserSyncPlugin({
        host: 'localhost',
        port: 3000,
        server: { baseDir: ['.'] }
      })
  ]
};