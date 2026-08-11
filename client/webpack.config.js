const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

module.exports = (_, argv) => {
  const isProduction = argv.mode === 'production';
  const apiBaseUrl = process.env.API_BASE_URL || '';

  return {
    entry: './main.tsx',
    output: {
      filename: 'assets/[name].[contenthash].js',
      assetModuleFilename: 'assets/[name].[contenthash][ext]',
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          use: [
            {
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
                      importSource: '@emotion/react',
                      development: !isProduction,
                    },
                  ],
                  '@babel/preset-typescript',
                ],
              },
            },
          ],
          exclude: /node_modules/,
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
        __APP_CONFIG__: JSON.stringify({
          apiBaseUrl,
          useMockApi: process.env.USE_MOCK_API === 'true' || (!isProduction && !apiBaseUrl),
          naverMapClientId: process.env.NAVER_MAP_CLIENT_ID || '',
          naverMapAppName: process.env.NAVER_MAP_APP_NAME || '',
          tmapAppKey: process.env.TMAP_APP_KEY || '',
          isProduction,
        }),
      }),
      new HtmlWebpackPlugin({
        template: './index.html',
        filename: 'index.html',
        inject: true,
      }),
    ],
    devServer: {
      static: false,
      port: 3000,
      open: true,
      hot: true,
      historyApiFallback: true,
      client: {
        overlay: true,
      },
    },
  };
};
