const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (_, argv) => {
  const isDevelopment = argv.mode === 'development';

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
                    importSource: '@emotion/react',
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
