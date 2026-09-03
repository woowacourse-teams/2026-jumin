const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const addToHomescreenDist = path.dirname(require.resolve('pwa-add-to-homescreen'));

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';
  const isMockEnabled = isDevelopment && (env?.mock === true || env?.mock === 'true');
  const isE2E = env?.e2e === true || env?.e2e === 'true';

  return {
    entry: './main.tsx',
    output: {
      filename: 'assets/[name].[contenthash].js',
      assetModuleFilename: 'assets/[name].[contenthash][ext]',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    targets: 'defaults',
                  },
                ],
                [
                  '@babel/preset-react',
                  {
                    runtime: 'automatic',
                    development: isDevelopment,
                  },
                ],
                '@babel/preset-typescript',
              ],
            },
          },
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset',
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i,
          type: 'asset/resource',
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    plugins: [
      new webpack.DefinePlugin({
        __MSW_ENABLED__: JSON.stringify(isMockEnabled),
        __PWA_ENABLED__: JSON.stringify(!isDevelopment),
        __GA_MEASUREMENT_ID__: JSON.stringify(process.env.GA_MEASUREMENT_ID ?? ''),
        __NAVER_MAP_CLIENT_ID__: JSON.stringify(process.env.NAVER_MAP_CLIENT_ID ?? ''),
      }),
      new HtmlWebpackPlugin({
        template: './index.html',
        filename: 'index.html',
        inject: true,
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public/manifest.webmanifest', to: 'manifest.webmanifest' },
          { from: 'public/service-worker.js', to: 'service-worker.js' },
          { from: 'public/icons', to: 'icons' },
          { from: 'public/splash', to: 'splash' },
          {
            from: path.join(addToHomescreenDist, 'add-to-homescreen.min.css'),
            to: 'vendor/add-to-homescreen/add-to-homescreen.min.css',
          },
          {
            from: path.join(addToHomescreenDist, 'add-to-homescreen_ko.min.js'),
            to: 'vendor/add-to-homescreen/add-to-homescreen.min.js',
          },
          {
            from: path.join(addToHomescreenDist, 'assets/img'),
            to: 'vendor/add-to-homescreen/assets/img',
            globOptions: {
              ignore: ['**/sample/**', '**/aardvark-*'],
            },
          },
        ],
      }),
    ],
    devServer: {
      static: {
        directory: path.resolve(__dirname, 'public'),
        watch: false,
      },
      proxy: [
        {
          context: ['/api'],
          target: process.env.API_PROXY_TARGET ?? 'http://localhost:8080',
        },
      ],
      port: 3000,
      open: !isE2E,
      hot: !isE2E,
      historyApiFallback: true,
      client: {
        overlay: true,
      },
    },
  };
};
