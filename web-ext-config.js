module.exports = {
  sourceDir: './dist',
  artifactsDir: './web-ext-artifacts',
  build: {
    overwriteDest: true,
    // 本番ビルド最適化
    filename: 'wallabag-extension-v{version}.zip',
  },
  ignoreFiles: [
    // 開発ファイル
    '*.map',
    '*.ts',
    'build-report.json',
    'stats.json',
    
    // プロジェクトファイル
    'web-ext-artifacts',
    'node_modules',
    'src',
    'tests',
    'scripts',
    '.git',
    '.github',
    
    // 設定ファイル
    'package.json',
    'package-lock.json',
    'tsconfig*.json',
    'webpack.config.js',
    '.eslintrc.js',
    '.prettierrc',
    'jest.config.js',
    
    // ドキュメント
    'README.md',
    '*.md',
    'CLAUDE',
    
    // 一時ファイル
    '*.tmp',
    '*.log',
    '.DS_Store',
    'Thumbs.db'
  ],
  
  // Chrome Web Store用の追加設定
  lint: {
    // 本番ビルドでは厳密な検証
    pretty: false,
    selfHosted: false,
    warningsAsErrors: true
  },
  
  // 署名設定（本番リリース用）
  sign: {
    channel: 'listed',
  }
};