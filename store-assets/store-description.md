# Chrome Web Store 説明文

## 拡張機能名
**Wallabag Saver**

## 短い説明 (132文字以内)
ワンクリックでWebページをWallabagに保存。記事を整理して後で読むための便利なChrome拡張機能です。

## 詳細説明

### 日本語版

**Wallabag Saver - 簡単記事保存拡張機能**

気になるWeb記事を見つけた時、後で読むために保存したいと思ったことはありませんか？Wallabag Saverは、ワンクリックで任意のWebページをWallabagに保存できるChrome拡張機能です。

**主な機能：**
• ワンクリック保存 - ブラウザアクションボタンまたは右クリックメニューから瞬時に保存
• 安全な認証 - WallabagサーバーとのセキュアなOAuth2認証
• 自動メタデータ取得 - ページタイトル、説明文、アイコンを自動取得
• 保存状況の確認 - 成功/失敗を視覚的にフィードバック
• 簡単設定 - 直感的な設定画面で簡単セットアップ

**使い方：**
1. 拡張機能をインストール
2. 設定ページでWallabagサーバー情報を入力
3. 保存したいページで拡張機能アイコンをクリック
4. 自動的にWallabagに記事が保存されます

**対応環境：**
• Wallabag v2.0以降
• HTTPS対応のWallabagサーバー
• Chrome拡張機能Manifest V3対応

**セキュリティ：**
• 認証情報は暗号化してローカルに保存
• HTTPSを用いた安全な通信
• 最小限の権限のみ要求

**オープンソース：**
このプロジェクトはオープンソースとして開発されており、GitHubで公開されています。機能改善の提案やバグ報告を歓迎します。

Wallabag Saverで、気になる記事を見逃すことなく、整理された読書体験を実現しましょう。

---

### English Version

**Wallabag Saver - Easy Article Saving Extension**

Save any web page to your Wallabag instance with just one click! Wallabag Saver is a Chrome extension designed to seamlessly integrate with your Wallabag server for effortless article management.

**Key Features:**
• One-Click Saving - Save articles instantly via browser action or context menu
• Secure Authentication - OAuth2 authentication with your Wallabag server
• Automatic Metadata - Captures page title, description, and favicon automatically
• Visual Feedback - Clear success/failure notifications
• Easy Setup - Intuitive configuration interface

**How to Use:**
1. Install the extension
2. Configure your Wallabag server settings in the options page
3. Click the extension icon on any page you want to save
4. Articles are automatically saved to your Wallabag library

**Requirements:**
• Wallabag v2.0 or later
• HTTPS-enabled Wallabag server
• Chrome with Manifest V3 support

**Security:**
• Encrypted local storage for credentials
• HTTPS-only communication
• Minimal permission requirements

**Open Source:**
This project is open source and available on GitHub. Contributions and feedback are welcome!

Transform your reading experience with Wallabag Saver - never lose track of interesting articles again.

## カテゴリ
- **Primary**: Productivity
- **Secondary**: Reading & Writing

## タグ (キーワード)
wallabag, read later, article saver, productivity, reading, bookmark, web clipper, offline reading, article management, save articles

## 対象年齢
All ages

## サポート用URL
https://github.com/yourusername/wallabag-chrome-extension

## プライバシーポリシーURL
https://github.com/yourusername/wallabag-chrome-extension/blob/main/PRIVACY.md

## ホームページURL
https://github.com/yourusername/wallabag-chrome-extension

## 権限の説明

### activeTab
現在閲覧中のタブの情報（URL、タイトル）を取得するために必要です。

### storage
拡張機能の設定（Wallabagサーバー情報、認証トークン）をローカルに保存するために必要です。

### contextMenus
右クリックメニューに「Wallabagに保存」オプションを追加するために必要です。

### host_permissions: ["<all_urls>"]
設定されたWallabagサーバーとの通信を行うために必要です。ユーザーが指定したサーバーのみにアクセスします。

## バージョン履歴

### v1.0.0 (Initial Release)
- ワンクリックでのWallabag記事保存機能
- OAuth2認証システム
- 設定ページとポップアップUI
- コンテキストメニュー統合
- エラーハンドリングと状態表示
- TypeScript実装とテストカバレッジ
- Manifest V3対応