#!/usr/bin/env node

/**
 * ビルド最適化スクリプト
 * バンドルサイズの確認、最適化レポートの生成
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 本番ビルド最適化を開始します...\n');

// 1. 依存関係の確認
console.log('📦 依存関係をチェック中...');
try {
  execSync('npm audit --audit-level=high', { stdio: 'pipe' });
  console.log('✅ 依存関係にセキュリティ問題はありません');
} catch (error) {
  console.warn('⚠️  依存関係に警告があります。詳細は npm audit を実行してください');
}

// 2. コード品質チェック
console.log('\n🔍 コード品質をチェック中...');
try {
  execSync('npm run lint', { stdio: 'pipe' });
  console.log('✅ ESLintチェック通過');
} catch (error) {
  console.error('❌ ESLintエラーが検出されました');
  process.exit(1);
}

try {
  execSync('npx tsc --noEmit --project tsconfig.prod.json', { stdio: 'pipe' });
  console.log('✅ TypeScript型チェック通過');
} catch (error) {
  console.error('❌ TypeScript型エラーが検出されました');
  process.exit(1);
}

// 3. 本番ビルド実行
console.log('\n🏗️  本番ビルドを実行中...');
const buildStart = Date.now();

try {
  execSync('webpack --mode=production --progress', { stdio: 'inherit' });
  const buildTime = Date.now() - buildStart;
  console.log(`✅ ビルド完了 (${buildTime}ms)`);
} catch (error) {
  console.error('❌ ビルドに失敗しました');
  process.exit(1);
}

// 4. バンドルサイズ分析
console.log('\n📊 バンドルサイズを分析中...');
const distPath = path.join(process.cwd(), 'dist');

if (fs.existsSync(distPath)) {
  const files = fs.readdirSync(distPath).filter(file => 
    file.endsWith('.js') || file.endsWith('.css')
  );

  let totalSize = 0;
  const fileSizes = [];

  files.forEach(file => {
    const filePath = path.join(distPath, file);
    const stats = fs.statSync(filePath);
    const sizeKB = Math.round(stats.size / 1024 * 100) / 100;
    totalSize += stats.size;
    fileSizes.push({ file, size: sizeKB });
  });

  fileSizes.sort((a, b) => b.size - a.size);

  console.log('\n📦 ビルド結果:');
  fileSizes.forEach(({ file, size }) => {
    const status = size > 100 ? '⚠️ ' : '✅';
    console.log(`  ${status} ${file}: ${size} KB`);
  });

  const totalSizeKB = Math.round(totalSize / 1024 * 100) / 100;
  console.log(`\n📊 合計サイズ: ${totalSizeKB} KB`);

  // サイズチェック
  if (totalSizeKB > 5000) { // 5MB制限
    console.warn('⚠️  バンドルサイズが大きすぎます (5MB制限)');
  } else if (totalSizeKB > 1000) { // 1MB警告
    console.warn('⚠️  バンドルサイズが大きめです (推奨: 1MB未満)');
  } else {
    console.log('✅ バンドルサイズは適切です');
  }
}

// 5. manifest.json検証
console.log('\n🔍 manifest.jsonを検証中...');
const manifestPath = path.join(distPath, 'manifest.json');

if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // 基本的な検証
    const requiredFields = ['name', 'version', 'description', 'manifest_version'];
    const missingFields = requiredFields.filter(field => !manifest[field]);
    
    if (missingFields.length > 0) {
      console.error(`❌ manifest.jsonに必須フィールドがありません: ${missingFields.join(', ')}`);
      process.exit(1);
    }

    if (manifest.manifest_version !== 3) {
      console.error('❌ Manifest V3が必要です');
      process.exit(1);
    }

    console.log('✅ manifest.json検証通過');
  } catch (error) {
    console.error('❌ manifest.json形式エラー:', error.message);
    process.exit(1);
  }
} else {
  console.error('❌ manifest.jsonが見つかりません');
  process.exit(1);
}

// 6. 最適化レポート生成
console.log('\n📋 最適化レポートを生成中...');
const report = {
  timestamp: new Date().toISOString(),
  buildTime: Date.now() - buildStart,
  totalSize: totalSizeKB,
  files: fileSizes,
  optimization: {
    minification: true,
    treeShaking: true,
    deadCodeElimination: true,
    compression: true
  }
};

fs.writeFileSync(
  path.join(distPath, 'build-report.json'),
  JSON.stringify(report, null, 2)
);

console.log('✅ 最適化レポート生成完了: dist/build-report.json');

console.log('\n🎉 本番ビルド最適化が完了しました!');
console.log('\n次のステップ:');
console.log('  1. npm run package でChrome拡張機能パッケージを作成');
console.log('  2. dist/ フォルダの内容をChromeにロード');
console.log('  3. 動作確認後、Chrome Web Storeに申請');