# Contributing to Wallabag Chrome Extension

プロジェクトへの貢献をありがとうございます！このガイドでは、効率的で建設的な貢献方法を説明します。

## 🤝 貢献方法

### バグレポート

バグを発見した場合は、以下の情報を含めてIssueを作成してください：

- **Chrome バージョン**
- **拡張機能バージョン**
- **OS（Windows, Mac, Linux）**
- **Wallabagサーバーバージョン**
- **再現手順**
- **期待される動作**
- **実際の動作**
- **エラーメッセージ（あれば）**
- **スクリーンショット（あれば）**

### 機能リクエスト

新機能の提案は歓迎します。以下の点を含めてください：

- **機能の詳細説明**
- **使用例**
- **期待される利益**
- **実装の複雑さ（分かる範囲で）**

### プルリクエスト

1. **リポジトリをフォーク**
2. **機能ブランチを作成**: `git checkout -b feature/your-feature-name`
3. **変更を実装**
4. **テストを追加/更新**
5. **変更をコミット**: `git commit -m 'feat: add new feature'`
6. **ブランチにプッシュ**: `git push origin feature/your-feature-name`
7. **プルリクエストを作成**

## 💻 開発環境セットアップ

### 前提条件

- Node.js 18.0.0 以上
- npm 9.0.0 以上
- Google Chrome（最新版）

### セットアップ手順

```bash
# リポジトリをクローン
git clone https://github.com/arimakouyou/wallabag-chrome-extension.git
cd wallabag-chrome-extension

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

### Chrome拡張機能の読み込み

1. Chrome で `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist` フォルダを選択

## 📋 開発ガイドライン

### コーディング規約

#### TypeScript/JavaScript

- **ESLint + Prettier** 設定に従う
- **TypeScript** を優先的に使用
- **関数型プログラミング** を可能な限り採用
- **`any` 型の使用を避ける**

#### ファイル構成

```
src/
├── background/     # Service Worker
├── content/        # Content Scripts
├── popup/          # Popup UI
├── options/        # Options Page
├── lib/           # Shared Libraries
└── assets/        # Static Assets
```

#### 命名規約

- **ファイル名**: kebab-case (`wallabag-api.ts`)
- **関数名**: camelCase (`handleSavePage()`)
- **クラス名**: PascalCase (`WallabagApiClient`)
- **定数**: UPPER_SNAKE_CASE (`API_TIMEOUT`)

### Git コミット規約

[Conventional Commits](https://www.conventionalcommits.org/) 形式を使用：

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Type

- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメントのみの変更
- `style`: コードの意味に影響しない変更（空白、フォーマット、セミコロンなど）
- `refactor`: バグ修正でも機能追加でもないコード変更
- `perf`: パフォーマンス向上のためのコード変更
- `test`: テストの追加や既存テストの修正
- `chore`: ビルドプロセスや補助ツールの変更

#### 例

```bash
feat(popup): add star and archive options
fix(auth): handle token expiration correctly
docs: update installation instructions
```

### テスト要件

#### 新機能のテスト

- **単体テスト**: 新しい関数/クラスに対して
- **統合テスト**: API統合や Chrome Extension API
- **E2Eテスト**: 重要なユーザーフロー

#### テスト実行

```bash
# 全テスト実行
npm run test

# カバレッジ付きテスト
npm run test:coverage

# 特定のテストファイル
npm run test -- background.test.ts
```

#### テストカバレッジ

- **目標**: 80% 以上
- **必須**: 新機能は必ずテストを含める

### コードレビュー基準

#### 品質基準

- [ ] **機能要件を満たしている**
- [ ] **既存機能を破壊していない**
- [ ] **適切なエラーハンドリング**
- [ ] **セキュリティ考慮**
- [ ] **パフォーマンス影響が最小限**

#### コード品質

- [ ] **TypeScript型定義が適切**
- [ ] **ESLint/Prettier チェック通過**
- [ ] **不要なconsole.log削除**
- [ ] **適切なコメント**
- [ ] **テストカバレッジ維持**

## 🔒 セキュリティ

### セキュリティ脆弱性の報告

セキュリティに関する問題は、公開のIssueではなく、直接メールでご報告ください：

**連絡先**: arimakouyou@github.com または GitHub Security Advisory

### セキュリティ考慮事項

- **機密情報の適切な取り扱い**
- **XSS攻撃の防止**
- **CSP（Content Security Policy）の遵守**
- **最小権限の原則**

## 📚 開発リソース

### ドキュメント

- [Chrome Extension API](https://developer.chrome.com/docs/extensions/)
- [Wallabag API Documentation](https://doc.wallabag.org/en/developer/api/readme.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### ツール

- **開発**: TypeScript, Webpack, Jest
- **品質**: ESLint, Prettier, Husky
- **CI/CD**: GitHub Actions

### 有用なコマンド

```bash
# コード品質チェック
npm run lint
npm run typecheck
npm run format

# ビルド
npm run build:prod
npm run build:analyze

# パッケージング
npm run package
```

## 🎯 プロジェクトの方向性

### 短期目標

- [ ] パフォーマンス最適化
- [ ] エラーハンドリング改善
- [ ] テストカバレッジ向上

### 長期目標

- [ ] 国際化対応
- [ ] オフライン機能
- [ ] 高度な認証オプション

## 🙋‍♀️ 質問・サポート

質問がある場合は、以下の方法でお気軽にお問い合わせください：

- **GitHub Discussions**: 一般的な質問や議論
- **GitHub Issues**: バグレポートや機能リクエスト
- **Email**: 個人的な質問やセキュリティ関連

## 🎉 謝辞

貢献していただく全ての方に感謝いたします！あなたの貢献により、このプロジェクトはより良いものになります。

### トップコントリビューター

<!-- This section will be updated automatically -->

---

**Happy Coding! 🚀**