const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    mode: isProduction ? 'production' : 'development',
    entry: {
      background: './src/background/background.ts',
      content: './src/content/content.ts',
      popup: './src/popup/popup.ts',
      options: './src/options/options.js'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.prod.json'
            }
          },
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'src/assets', to: '.', noErrorOnMissing: true },
          { from: 'src/popup/popup.html', to: 'popup.html', noErrorOnMissing: true },
          { from: 'src/popup/popup.css', to: 'popup.css', noErrorOnMissing: true },
          { from: 'src/options/options.html', to: 'options.html', noErrorOnMissing: true },
          { from: 'src/options/options.css', to: 'options.css', noErrorOnMissing: true }
        ]
      }),
      // バンドルサイズ分析（環境変数で制御）
      ...(process.env.ANALYZE ? [new BundleAnalyzerPlugin({
        analyzerMode: 'json',
        reportFilename: 'stats.json',
        generateStatsFile: true
      })] : [])
    ],
    devtool: isProduction ? false : 'source-map',
    optimization: {
      minimize: isProduction,
      minimizer: isProduction ? [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true, // console.logを削除
              drop_debugger: true, // debuggerを削除
              pure_funcs: ['console.log', 'console.info'], // 特定の関数を削除
            },
            mangle: true, // 変数名を短縮
            format: {
              comments: false, // コメントを削除
            },
          },
          extractComments: false, // ライセンスコメントの分離を無効化
        }),
        new CssMinimizerPlugin({
          minimizerOptions: {
            preset: [
              'default',
              {
                discardComments: { removeAll: true },
                normalizeWhitespace: true,
                minifySelectors: true,
              },
            ],
          },
        }),
      ] : [],
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            enforce: true,
          },
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            enforce: true,
          },
        },
      },
      // Chrome Extension環境での最適化
      usedExports: true, // Tree shakingを有効化
      sideEffects: false, // サイドエフェクトなしとして扱う
    },
    // パフォーマンス設定
    performance: {
      maxAssetSize: 500000, // 500KB
      maxEntrypointSize: 500000, // 500KB
      hints: isProduction ? 'warning' : false,
    },
    watch: !isProduction && process.env.npm_lifecycle_event === 'dev',
    watchOptions: {
      ignored: /node_modules/,
      poll: 1000
    }
  };
};