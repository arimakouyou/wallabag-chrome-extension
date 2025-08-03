# ビルド最適化ガイド

## 概要

Wallabag Chrome拡張機能の本番ビルド最適化設定とプロセスについて説明します。

## 最適化の内容

### 1. コード最適化

#### Terser による JavaScript 最適化
- **Dead Code Elimination**: 使用されないコードの除去
- **Tree Shaking**: 未使用のexportの除去
- **Minification**: 変数名の短縮、空白の除去
- **Console除去**: 本番環境での console.log 除去

#### CSS 最適化
- **Minification**: CSS の圧縮
- **コメント除去**: 本番ビルドでのコメント削除
- **重複除去**: 重複する CSS ルールの統合

### 2. バンドル最適化

#### Code Splitting
- **Vendor Bundle**: node_modules の分離
- **Common Bundle**: 共通コードの分離
- **Entry Points**: 各機能別の最適化

#### Performance Budget
- **Asset Size**: 最大 500KB/ファイル
- **Entry Point**: 最大 500KB/エントリ
- **警告レベル**: サイズ超過時の警告

### 3. TypeScript 最適化

#### 型チェック強化
```json
{
  "noImplicitAny": true,
  "noImplicitReturns": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "exactOptionalPropertyTypes": true
}
```

#### 出力最適化
- **removeComments**: コメント除去
- **preserveConstEnums**: false (Tree Shaking対応)
- **importsNotUsedAsValues**: "remove"

## ビルドコマンド

### 基本ビルド
```bash
npm run build              # 基本的な本番ビルド
npm run build:prod         # 最適化済み本番ビルド（推奨）
npm run build:analyze      # バンドルサイズ分析付きビルド
```

### 品質チェック
```bash
npm run validate           # lint + typecheck + test
npm run typecheck          # TypeScript型チェック
npm run lint:fix           # ESLint自動修正
npm run format:check       # Prettierフォーマットチェック
```

### パッケージング
```bash
npm run package            # Chrome拡張機能パッケージ作成
npm run package:sign       # 署名付きパッケージ作成
```

## 最適化スクリプト

### build-optimization.js の機能

1. **依存関係チェック**: セキュリティ脆弱性の確認
2. **コード品質**: ESLint、TypeScript検証
3. **ビルド実行**: 最適化設定でのビルド
4. **サイズ分析**: ファイルサイズ分析
5. **manifest検証**: Chrome拡張機能形式チェック
6. **レポート生成**: 最適化結果レポート

### 出力レポート例
```json
{
  "timestamp": "2025-08-03T10:00:00.000Z",
  "buildTime": 15000,
  "totalSize": 245.67,
  "files": [
    { "file": "background.js", "size": 89.23 },
    { "file": "content.js", "size": 45.12 },
    { "file": "popup.js", "size": 67.89 }
  ],
  "optimization": {
    "minification": true,
    "treeShaking": true,
    "deadCodeElimination": true,
    "compression": true
  }
}
```

## パフォーマンス目標

### サイズ制限
- **Total Bundle**: < 1MB (推奨), < 5MB (制限)
- **Individual Files**: < 500KB
- **Background Script**: < 200KB
- **Content Script**: < 100KB

### ビルド時間
- **開発ビルド**: < 10秒
- **本番ビルド**: < 30秒
- **型チェック**: < 15秒

### Chrome Web Store 対応
- **Manifest V3**: 必須
- **権限最小化**: 必要最小限の権限
- **CSP準拠**: Content Security Policy対応

## トラブルシューティング

### ビルドエラー

#### TypeScript エラー
```bash
npm run typecheck  # 詳細な型エラー確認
```

#### ESLint エラー
```bash
npm run lint:fix   # 自動修正可能なエラーを修正
```

#### バンドルサイズ超過
```bash
npm run build:analyze  # サイズ分析実行
```

### 最適化のトレードオフ

#### 開発効率 vs ファイルサイズ
- 開発時: ソースマップ有効
- 本番時: ソースマップ無効

#### デバッグ性 vs セキュリティ
- 開発時: console.log 有効
- 本番時: console.log 除去

## Chrome拡張機能特有の最適化

### Service Worker 最適化
- **起動時間**: 最小化
- **メモリ使用量**: 監視
- **イベントドリブン**: 適切な設計

### Content Script 最適化
- **注入サイズ**: 最小化
- **DOM操作**: 効率化
- **イベントリスナー**: 適切なクリーンアップ

### 権限最適化
- **activeTab**: 推奨（tabs の代替）
- **storage**: ローカルのみ
- **contextMenus**: 必要時のみ

## 継続的最適化

### 監視指標
1. **Bundle Size Trends**: バンドルサイズの推移
2. **Build Time**: ビルド時間の監視
3. **Error Rates**: 型エラー、Lintエラー率
4. **Dependency Health**: 依存関係の健全性

### 定期メンテナンス
1. **週次**: 依存関係更新チェック
2. **月次**: バンドルサイズ分析
3. **四半期**: パフォーマンス最適化レビュー

### 品質ゲート
- **Lint Error**: 0件必須
- **Type Error**: 0件必須
- **Test Coverage**: >80%必須
- **Bundle Size**: <1MB推奨

## 参考リンク

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Webpack Optimization](https://webpack.js.org/guides/production/)
- [Terser Configuration](https://github.com/terser/terser)
- [TypeScript Compiler Options](https://www.typescriptlang.org/tsconfig)