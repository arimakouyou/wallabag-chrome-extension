# API リファレンス

Wallabag Chrome Extension の内部 API とアーキテクチャについて説明します。

## 目次

1. [概要](#概要)
2. [Background Service Worker API](#background-service-worker-api)
3. [Wallabag API クライアント](#wallabag-api-クライアント)
4. [設定管理 API](#設定管理-api)
5. [メッセージング API](#メッセージング-api)
6. [型定義](#型定義)
7. [イベント](#イベント)

## 概要

この拡張機能は以下のコンポーネントで構成されています：

- **Background Service Worker**: メインロジックと API 通信
- **Content Script**: ページ情報の取得
- **Popup UI**: ユーザーインターフェース
- **Options Page**: 設定管理画面

## Background Service Worker API

### BackgroundService クラス

メインのバックグラウンドサービスクラス。

```typescript
class BackgroundService {
  initialize(): Promise<void>
  handleSavePage(pageInfo: PageInfo): Promise<SaveResult>
  refreshAuthentication(): Promise<void>
  setupContextMenus(): void
  handleBrowserAction(): void
}
```

#### メソッド

##### `initialize()`

サービスワーカーの初期化を行います。

```typescript
async initialize(): Promise<void>
```

**説明**: 
- イベントリスナーの設定
- コンテキストメニューの作成
- 初期認証状態の確認

**使用例**:
```typescript
const service = new BackgroundService();
await service.initialize();
```

##### `handleSavePage(pageInfo)`

ページをWallabagに保存します。

```typescript
async handleSavePage(pageInfo: PageInfo): Promise<SaveResult>
```

**パラメータ**:
- `pageInfo: PageInfo` - 保存するページの情報

**戻り値**: `Promise<SaveResult>` - 保存結果

**使用例**:
```typescript
const pageInfo = {
  url: 'https://example.com',
  title: 'Example Page',
  description: 'An example page',
  favicon: 'https://example.com/favicon.ico'
};

const result = await service.handleSavePage(pageInfo);
console.log(result.success ? '保存成功' : '保存失敗');
```

## Wallabag API クライアント

### WallabagApiClient クラス

Wallabag サーバーとの通信を担当します。

```typescript
class WallabagApiClient {
  constructor(serverUrl: string)
  authenticate(credentials: AuthCredentials): Promise<AuthResponse>
  createEntry(entry: CreateEntryRequest): Promise<EntryResponse>
  getEntries(params?: GetEntriesParams): Promise<EntriesResponse>
  refreshToken(): Promise<void>
  isAuthenticated(): Promise<boolean>
}
```

#### コンストラクタ

```typescript
constructor(serverUrl: string)
```

**パラメータ**:
- `serverUrl: string` - Wallabag サーバーの URL

#### メソッド

##### `authenticate(credentials)`

Wallabag サーバーで認証を行います。

```typescript
async authenticate(credentials: AuthCredentials): Promise<AuthResponse>
```

**パラメータ**:
```typescript
interface AuthCredentials {
  grant_type: 'password';
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
}
```

**戻り値**:
```typescript
interface AuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
}
```

##### `createEntry(entry)`

新しいエントリを作成します。

```typescript
async createEntry(entry: CreateEntryRequest): Promise<EntryResponse>
```

**パラメータ**:
```typescript
interface CreateEntryRequest {
  url: string;
  title?: string;
  tags?: string;
  starred?: boolean;
  archive?: boolean;
}
```

**戻り値**:
```typescript
interface EntryResponse {
  id: number;
  url: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  starred: boolean;
  archived: boolean;
  tags: Array<{
    id: number;
    label: string;
  }>;
}
```

## 設定管理 API

### ConfigManager クラス

拡張機能の設定を管理します。

```typescript
class ConfigManager {
  static getConfig(): Promise<Config>
  static setConfig(config: Partial<Config>): Promise<void>
  static clearConfig(): Promise<void>
  static validateConfig(config: Config): ValidationResult
  static saveTokens(tokens: TokenInfo): Promise<void>
  static getValidAccessToken(): Promise<string | null>
  static isTokenValid(): Promise<boolean>
}
```

#### メソッド

##### `getConfig()`

現在の設定を取得します。

```typescript
static async getConfig(): Promise<Config>
```

**戻り値**:
```typescript
interface Config {
  serverUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}
```

##### `setConfig(config)`

設定を保存します。

```typescript
static async setConfig(config: Partial<Config>): Promise<void>
```

**パラメータ**:
- `config: Partial<Config>` - 保存する設定（部分的な更新も可能）

##### `validateConfig(config)`

設定の妥当性を検証します。

```typescript
static validateConfig(config: Config): ValidationResult
```

**戻り値**:
```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

## メッセージング API

### Message Types

コンポーネント間の通信で使用されるメッセージタイプ。

```typescript
type MessageType = 
  | 'SAVE_PAGE'
  | 'GET_PAGE_INFO' 
  | 'UPDATE_STATUS'
  | 'CHECK_AUTH'
  | 'REFRESH_TOKEN';
```

### Message Structure

```typescript
interface Message<T = any> {
  type: MessageType;
  data?: T;
  tabId?: number;
}
```

#### メッセージ例

##### ページ保存

```typescript
// Content Script → Background
const message: Message<PageInfo> = {
  type: 'SAVE_PAGE',
  data: {
    url: 'https://example.com',
    title: 'Example Page',
    description: 'Description',
    favicon: 'https://example.com/favicon.ico'
  }
};

chrome.runtime.sendMessage(message);
```

##### 認証状態確認

```typescript
// Popup → Background
const message: Message = {
  type: 'CHECK_AUTH'
};

const response = await chrome.runtime.sendMessage(message);
console.log('認証済み:', response.authenticated);
```

## 型定義

### 基本型

#### PageInfo

```typescript
interface PageInfo {
  url: string;
  title: string;
  description?: string;
  favicon?: string;
}
```

#### SaveResult

```typescript
interface SaveResult {
  success: boolean;
  message: string;
  entryId?: number;
  error?: string;
}
```

#### Config

```typescript
interface Config {
  serverUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}
```

### API レスポンス型

#### AuthResponse

```typescript
interface AuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
}
```

#### EntryResponse

```typescript
interface EntryResponse {
  id: number;
  url: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  starred: boolean;
  archived: boolean;
  tags: Array<{
    id: number;
    label: string;
  }>;
}
```

#### EntriesResponse

```typescript
interface EntriesResponse {
  page: number;
  limit: number;
  pages: number;
  total: number;
  _embedded: {
    items: EntryResponse[];
  };
}
```

### エラー型

#### WallabagError

```typescript
class WallabagError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'WallabagError';
  }
}
```

#### ConfigError

```typescript
class ConfigError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
```

## イベント

### Chrome Extension Events

#### chrome.runtime.onMessage

メッセージ受信時のイベント。

```typescript
chrome.runtime.onMessage.addListener(
  (message: Message, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    switch (message.type) {
      case 'SAVE_PAGE':
        handleSavePage(message.data).then(sendResponse);
        return true; // 非同期レスポンス
      
      case 'CHECK_AUTH':
        checkAuthentication().then(sendResponse);
        return true;
    }
  }
);
```

#### chrome.action.onClicked

ブラウザアクションクリック時のイベント。

```typescript
chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  if (tab.id) {
    const pageInfo = await getPageInfo(tab.id);
    await handleSavePage(pageInfo);
  }
});
```

#### chrome.contextMenus.onClicked

コンテキストメニュークリック時のイベント。

```typescript
chrome.contextMenus.onClicked.addListener(async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (info.menuItemId === 'save-to-wallabag' && tab?.id) {
    const pageInfo = await getPageInfo(tab.id);
    await handleSavePage(pageInfo);
  }
});
```

### カスタムイベント

#### SavePageEvent

ページ保存イベント。

```typescript
interface SavePageEvent {
  type: 'save-page';
  pageInfo: PageInfo;
  result: SaveResult;
  timestamp: number;
}
```

#### AuthEvent

認証関連イベント。

```typescript
interface AuthEvent {
  type: 'auth-success' | 'auth-failure' | 'token-refresh';
  timestamp: number;
  details?: string;
}
```

## エラーハンドリング

### エラータイプ

```typescript
enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}
```

### エラーハンドリングパターン

```typescript
try {
  const result = await wallabagClient.createEntry(entryData);
  return { success: true, entryId: result.id };
} catch (error) {
  if (error instanceof WallabagError) {
    if (error.statusCode === 401) {
      // 認証エラー - トークン更新を試行
      await refreshToken();
      return await retry();
    }
  }
  
  console.error('保存エラー:', error);
  return { success: false, error: error.message };
}
```

## 開発時のデバッグ

### ログレベル

```typescript
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}
```

### デバッグヘルパー

```typescript
class Logger {
  static error(message: string, ...args: any[]): void
  static warn(message: string, ...args: any[]): void
  static info(message: string, ...args: any[]): void
  static debug(message: string, ...args: any[]): void
}
```

### 開発者ツール

Chrome の開発者ツールでデバッグ情報を確認：

1. F12 で開発者ツールを開く
2. Console タブで拡張機能のログを確認
3. Application → Storage で設定データを確認
4. Network タブで API 通信を監視

---

このAPIリファレンスを参考に、拡張機能の理解と開発にお役立てください。