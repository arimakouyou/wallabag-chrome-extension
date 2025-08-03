# Wallabag Chrome Extension

<div align="center">

![Wallabag Extension Logo](src/assets/icon-128.png)

**ワンクリックでページをWallabagに保存**

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-brightgreen)](https://chromewebstore.google.com/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/arimakouyou/wallabag-chrome-extension)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/arimakouyou/wallabag-chrome-extension/actions)

</div>

## 📖 概要

Wallabag Chrome ExtensionはWallabag（オープンソースの「後で読む」サービス）にページを簡単に保存できるChrome拡張機能です。ワンクリックで現在閲覧中のページをWallabagサーバーに送信し、後で読むことができます。

## ✨ 主な機能

- **ワンクリック保存**: ブラウザアクションボタンまたは右クリックメニューからページを保存
- **自動認証**: OAuth 2.0による安全な認証とトークン自動更新
- **視覚的フィードバック**: 保存状況をリアルタイムで表示
- **セキュア設定**: 認証情報の暗号化保存
- **多言語対応**: 日本語・英語対応
- **軽量設計**: 最小限のリソース使用量

## 🚀 インストール

### Chrome Web Store からインストール

1. [Chrome Web Store](https://chromewebstore.google.com/)でWallabag Extensionを検索
2. 「Chromeに追加」ボタンをクリック
3. インストール後、ツールバーにWallabagアイコンが表示されます

### 開発版を手動インストール

1. このリポジトリをクローン:
   ```bash
   git clone https://github.com/arimakouyou/wallabag-chrome-extension.git
   cd wallabag-chrome-extension
   ```

2. 依存関係をインストール:
   ```bash
   npm install
   ```

3. ビルド実行:
   ```bash
   npm run build:prod
   ```

4. Chromeで拡張機能を読み込み:
   - Chrome設定 → 拡張機能 → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」
   - `dist` フォルダを選択

## ⚙️ 設定

### 初回設定

1. **Wallabagサーバー情報の取得**:
   - あなたのWallabagサーバーにログイン
   - 設定 → API clients management → 新しいクライアントを作成
   - Client IDとClient Secretをメモ

2. **拡張機能の設定**:
   - 拡張機能アイコンをクリック
   - 「設定」ボタンをクリック
   - 以下の情報を入力:
     - **サーバーURL**: `https://your-wallabag-server.com`
     - **クライアントID**: 上記で取得したClient ID
     - **クライアントシークレット**: 上記で取得したClient Secret
     - **ユーザー名**: Wallabagのユーザー名
     - **パスワード**: Wallabagのパスワード

3. **接続テスト**:
   - 「接続テスト」ボタンをクリック
   - 成功メッセージが表示されれば設定完了

### セキュリティ設定

- **HTTPS必須**: セキュリティのため、WallabagサーバーはHTTPS接続を推奨
- **認証情報の暗号化**: パスワードやトークンは暗号化してローカルに保存
- **最小権限**: 必要最小限のブラウザ権限のみを要求

## 🎯 使用方法

### ページを保存する

#### 方法1: ブラウザアクションボタン
1. 保存したいページを開く
2. ツールバーのWallabagアイコンをクリック
3. ポップアップで「このページを保存」ボタンをクリック

#### 方法2: 右クリックメニュー
1. 保存したいページで右クリック
2. コンテキストメニューから「Wallabagに保存」を選択

### 保存状況の確認

- **成功**: 緑のチェックマークとメッセージ
- **エラー**: 赤のエラーアイコンとエラー詳細
- **処理中**: スピナーアニメーション

### 通知

- 保存成功/失敗時にデスクトップ通知を表示
- 通知をクリックしてWallabagサーバーにアクセス可能

## 🛠️ 開発

### 前提条件

- Node.js 18+
- npm 9+
- Google Chrome

### 開発環境セットアップ

1. **リポジトリクローン**:
   ```bash
   git clone https://github.com/arimakouyou/wallabag-chrome-extension.git
   cd wallabag-chrome-extension
   ```

2. **依存関係インストール**:
   ```bash
   npm install
   ```

3. **開発サーバー起動**:
   ```bash
   npm run dev
   ```

### スクリプトコマンド

```bash
# 開発
npm run dev                # 開発モードでwatch
npm run build              # 基本的な本番ビルド
npm run build:prod         # 最適化本番ビルド
npm run build:analyze      # バンドルサイズ分析

# 品質管理
npm run lint               # ESLintチェック
npm run lint:fix           # ESLint自動修正
npm run format             # Prettierフォーマット
npm run typecheck          # TypeScript型チェック
npm run test               # テスト実行
npm run test:coverage      # カバレッジ付きテスト

# パッケージング
npm run package            # Chrome拡張機能パッケージ作成
npm run clean              # ビルド成果物削除
```

### プロジェクト構造

```
wallabag-extension/
├── src/
│   ├── background/         # バックグラウンドサービス
│   ├── content/           # コンテンツスクリプト
│   ├── popup/             # ポップアップUI
│   ├── options/           # 設定ページ
│   ├── lib/              # 共通ライブラリ
│   └── assets/           # アイコンなどの静的ファイル
├── tests/                # テストファイル
├── docs/                 # ドキュメント
├── scripts/              # ビルドスクリプト
├── manifest.json         # Chrome拡張機能設定
├── webpack.config.js     # Webpack設定
└── package.json          # NPM設定
```

### 技術スタック

- **TypeScript**: 型安全なJavaScript
- **Webpack**: モジュールバンドラー
- **Jest**: テストフレームワーク
- **ESLint + Prettier**: コード品質管理
- **Chrome Extension API**: Manifest V3対応

## 🧪 テスト

### テスト実行

```bash
npm run test              # 全テスト実行
npm run test:coverage     # カバレッジレポート付き
npm run test:watch        # watch モード
```

### テストカバレッジ

- **目標**: 80%以上
- **単体テスト**: API、設定管理、メッセージハンドリング
- **統合テスト**: Chrome API、Wallabag API
- **E2Eテスト**: ユーザーフロー全体
- **セキュリティテスト**: XSS、CSP、認証保護

## 🔒 セキュリティ

### セキュリティ機能

- **OAuth 2.0認証**: 安全な認証フロー
- **認証情報暗号化**: ローカル保存の認証情報を暗号化
- **HTTPS強制**: 全通信でHTTPS必須
- **CSP準拠**: Content Security Policy対応
- **最小権限**: 必要最小限のブラウザ権限

### セキュリティレポート

セキュリティ脆弱性を発見した場合は、[security@your-domain.com](mailto:security@your-domain.com) にご報告ください。

## 📊 パフォーマンス

### 性能指標

- **起動時間**: <500ms
- **ページ保存**: <3秒
- **メモリ使用量**: <10MB
- **バンドルサイズ**: <1MB

### 最適化施策

- **コード分割**: 機能別バンドル分離
- **Tree Shaking**: 未使用コード除去
- **圧縮**: Terserによる最適化
- **キャッシュ**: API応答キャッシュ

## 🤝 貢献

プロジェクトへの貢献を歓迎します！

### 貢献手順

1. リポジトリをフォーク
2. 機能ブランチを作成: `git checkout -b feature/amazing-feature`
3. 変更をコミット: `git commit -m 'Add amazing feature'`
4. ブランチにプッシュ: `git push origin feature/amazing-feature`
5. プルリクエストを作成

### 開発ガイドライン

- **コーディング規約**: ESLint + Prettier設定に従う
- **コミットメッセージ**: Conventional Commits形式
- **テスト**: 新機能にはテストを追加
- **ドキュメント**: 変更に応じてドキュメント更新

## 📝 ライセンス

本プロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルをご確認ください。

## 🙏 謝辞

- [Wallabag](https://wallabag.org/) - 素晴らしい「後で読む」サービス
- Chrome Extension コミュニティ
- オープンソース貢献者の皆様

## 📞 サポート

### よくある質問

**Q: 認証エラーが発生します**
A: Wallabagサーバーの設定を確認し、正しいClient IDとSecretが入力されているか確認してください。

**Q: ページが保存されません**
A: ネットワーク接続とWallabagサーバーの状態を確認してください。

**Q: 拡張機能が動作しません**
A: Chromeを再起動し、拡張機能を一度無効にしてから再度有効にしてください。

### バグレポート

問題が発生した場合は、以下の情報と共に[Issues](https://github.com/arimakouyou/wallabag-chrome-extension/issues)にご報告ください：

- Chrome バージョン
- 拡張機能バージョン
- エラーメッセージ
- 再現手順

### 連絡先

- **Issues**: [GitHub Issues](https://github.com/arimakouyou/wallabag-chrome-extension/issues)
- **Email**: [arimakouyou@github.com](mailto:arimakouyou@github.com)
- **GitHub**: [@arimakouyou](https://github.com/arimakouyou)

---

<div align="center">

**[🏠 ホーム](https://github.com/arimakouyou/wallabag-chrome-extension) | [📖 ドキュメント](docs/) | [🐛 バグ報告](https://github.com/arimakouyou/wallabag-chrome-extension/issues) | [💬 議論](https://github.com/arimakouyou/wallabag-chrome-extension/discussions)**

Made with ❤️ for the Wallabag community

</div>