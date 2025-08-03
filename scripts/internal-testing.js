#!/usr/bin/env node

/**
 * Internal Testing Distribution Script
 * Creates and packages the extension for internal testing
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const CONFIG = {
  buildDir: './dist',
  outputDir: './internal-testing',
  packageName: 'wallabag-saver-internal',
  version: require('../package.json').version,
  testingManifest: {
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...' // Internal testing key
  }
};

class InternalTestingBuilder {
  constructor() {
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.buildVersion = `${CONFIG.version}-internal-${this.timestamp}`;
  }

  async build() {
    console.log('🔨 Building extension for internal testing...');
    
    try {
      // 1. Create output directory
      this.createOutputDirectory();
      
      // 2. Build production version
      await this.buildProduction();
      
      // 3. Modify manifest for internal testing
      this.modifyManifestForTesting();
      
      // 4. Create testing package
      await this.createTestingPackage();
      
      // 5. Generate installation instructions
      this.generateInstallationInstructions();
      
      console.log('✅ Internal testing package created successfully!');
      console.log(`📦 Package: ${CONFIG.outputDir}/${CONFIG.packageName}-${this.buildVersion}.zip`);
      
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      process.exit(1);
    }
  }

  createOutputDirectory() {
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    console.log(`📁 Created output directory: ${CONFIG.outputDir}`);
  }

  async buildProduction() {
    console.log('🏗️ Running production build...');
    try {
      execSync('npm run build:prod', { stdio: 'inherit' });
      console.log('✅ Production build completed');
    } catch (error) {
      throw new Error('Production build failed: ' + error.message);
    }
  }

  modifyManifestForTesting() {
    console.log('📝 Modifying manifest for internal testing...');
    
    const manifestPath = path.join(CONFIG.buildDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Add internal testing modifications
    manifest.name += ' (Internal Testing)';
    manifest.version = this.buildVersion;
    
    // Add testing key for consistent extension ID
    if (CONFIG.testingManifest.key) {
      manifest.key = CONFIG.testingManifest.key;
    }
    
    // Add update URL for internal distribution
    manifest.update_url = 'https://internal-testing.example.com/updates.xml';
    
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('✅ Manifest modified for testing');
  }

  async createTestingPackage() {
    console.log('📦 Creating testing package...');
    
    const packagePath = path.join(CONFIG.outputDir, `${CONFIG.packageName}-${this.buildVersion}.zip`);
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(packagePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => {
        console.log(`✅ Package created: ${archive.pointer()} bytes`);
        resolve();
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      archive.directory(CONFIG.buildDir, false);
      archive.finalize();
    });
  }

  generateInstallationInstructions() {
    console.log('📋 Generating installation instructions...');
    
    const instructions = `
# Wallabag Saver - Internal Testing

## インストール手順

### 1. 拡張機能パッケージの取得
- ファイル: \`${CONFIG.packageName}-${this.buildVersion}.zip\`
- ビルド日時: ${new Date().toLocaleString('ja-JP')}

### 2. Chrome拡張機能の開発者モード有効化
1. Chromeブラウザを開く
2. \`chrome://extensions/\` にアクセス
3. 右上の「開発者モード」をオンにする

### 3. 拡張機能のインストール
1. ZIPファイルを解凍
2. 「パッケージ化されていない拡張機能を読み込む」をクリック
3. 解凍したフォルダを選択

### 4. 設定とテスト
1. 拡張機能アイコンをクリック
2. 「設定」から Wallabag サーバー情報を入力
3. 任意のページで保存テストを実行

## テスト項目

### 基本機能テスト
- [ ] 拡張機能のインストール
- [ ] 設定ページでの Wallabag サーバー設定
- [ ] ポップアップからの記事保存
- [ ] 右クリックメニューからの記事保存
- [ ] 保存成功/失敗の通知表示

### エラーハンドリングテスト
- [ ] ネットワークエラー時の動作
- [ ] 認証エラー時の動作
- [ ] 無効なURL時の動作
- [ ] サーバー接続不可時の動作

### パフォーマンステスト
- [ ] 大きなページの保存時間
- [ ] メモリ使用量の確認
- [ ] 複数ページ連続保存のテスト

## フィードバック方法

### バグ報告
1. 再現手順を詳細に記録
2. エラーメッセージのスクリーンショット
3. Chrome Developer Tools のエラーログ
4. 使用環境（Chrome バージョン、OS）

### 改善提案
- UI/UX の改善点
- 機能追加のアイデア
- パフォーマンスの問題

### 報告先
- GitHub Issues: https://github.com/username/wallabag-chrome-extension/issues
- 内部チャット: #wallabag-extension-testing
- メール: testing@example.com

## 既知の問題

### 制限事項
- HTTPサイトでは動作しません（HTTPS必須）
- 一部のSPAサイトでページタイトル取得に時間がかかる場合があります
- 大量の画像を含むページでは保存に時間がかかる場合があります

### 開発中機能
- タグ付け機能
- アーカイブ状態の設定
- 既読マーク機能

## サポート

技術的な問題や質問がある場合：
1. まず既知の問題を確認
2. Chrome Developer Tools でエラーログを確認
3. 上記の報告先に詳細を提供

---

**重要**: この版本はテスト専用です。本番環境では使用しないでください。
`;

    const instructionsPath = path.join(CONFIG.outputDir, `installation-instructions-${this.buildVersion}.md`);
    fs.writeFileSync(instructionsPath, instructions);
    console.log('✅ Installation instructions generated');
  }
}

// Execute if run directly
if (require.main === module) {
  const builder = new InternalTestingBuilder();
  builder.build().catch(console.error);
}

module.exports = InternalTestingBuilder;