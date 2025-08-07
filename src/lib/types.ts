/**
 * Wallabag Chrome拡張機能 - 型定義
 * 拡張機能全体で使用されるTypeScriptインターフェースと型定義
 */

/**
 * ページ情報
 * Content Scriptで取得されるページの基本情報
 */
export interface PageInfo {
  /** ページURL */
  url: string;
  /** ページタイトル */
  title: string;
  /** ページ説明文（meta description） */
  description?: string;
  /** ファビコンURL */
  favicon?: string;
}

/**
 * Wallabag設定情報
 * chrome.storage.localに保存される設定データ
 */
export interface Config {
  /** WallabagサーバーURL */
  serverUrl: string;
  /** クライアントID */
  clientId: string;
  /** クライアントシークレット */
  clientSecret: string;
  /** ユーザー名 */
  username: string;
  /** パスワード */
  password: string;
  /** アクセストークン（認証後に取得） */
  accessToken?: string;
  /** リフレッシュトークン（認証後に取得） */
  refreshToken?: string;
  /** トークン有効期限（UNIX timestamp） */
  tokenExpiresAt?: number;
}

/**
 * ページ保存結果
 * savePage操作の結果を表す
 */
export interface SaveResult {
  /** 保存成功フラグ */
  success: boolean;
  /** 結果メッセージ */
  message: string;
  /** 作成されたエントリID（成功時） */
  entryId?: number;
  /** エラー詳細（失敗時） */
  error?: string;
}

/**
 * Wallabag認証レスポンス
 * /oauth/v2/token エンドポイントのレスポンス
 */
export interface AuthResponse {
  /** アクセストークン */
  access_token: string;
  /** 有効期限（秒） */
  expires_in: number;
  /** トークンタイプ */
  token_type: string;
  /** スコープ */
  scope: string;
  /** リフレッシュトークン */
  refresh_token: string;
}

/**
 * Wallabagエントリレスポンス
 * /api/entries.json エンドポイントのレスポンス
 */
export interface EntryResponse {
  /** エントリID */
  id: number;
  /** URL */
  url: string;
  /** タイトル */
  title: string;
  /** コンテンツ */
  content: string;
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
  /** お気に入り */
  starred: boolean;
  /** アーカイブ済み */
  archived: boolean;
  /** タグ一覧 */
  tags: Array<{
    id: number;
    label: string;
  }>;
  /** プレビュー画像 */
  preview_picture?: string;
  /** 読了時間 */
  reading_time?: number;
  /** ドメイン名 */
  domain_name?: string;
}

/**
 * エントリ一覧レスポンス
 * /api/entries.json エンドポイントのレスポンス（一覧取得時）
 */
export interface EntriesResponse {
  /** 現在のページ */
  page: number;
  /** 1ページあたりの件数 */
  limit: number;
  /** 総ページ数 */
  pages: number;
  /** 総件数 */
  total: number;
  /** エントリ一覧 */
  _embedded: {
    items: EntryResponse[];
  };
}

/**
 * エントリ作成リクエスト
 * /api/entries.json エンドポイントへのPOSTリクエスト
 */
export interface CreateEntryRequest {
  /** URL（必須） */
  url: string;
  /** タイトル */
  title?: string;
  /** タグ（カンマ区切り） */
  tags?: string;
  /** お気に入り */
  starred?: boolean;
  /** アーカイブ */
  archive?: boolean;
}

/**
 * 認証情報
 * Wallabag認証に必要な情報
 */
export interface AuthCredentials {
  /** クライアントID */
  client_id: string;
  /** クライアントシークレット */
  client_secret: string;
  /** ユーザー名 */
  username: string;
  /** パスワード */
  password: string;
  /** グラントタイプ */
  grant_type: 'password';
}

/**
 * トークン更新リクエスト
 * リフレッシュトークンを使用したトークン更新
 */
export interface RefreshTokenRequest {
  /** グラントタイプ */
  grant_type: 'refresh_token';
  /** リフレッシュトークン */
  refresh_token: string;
  /** クライアントID */
  client_id: string;
  /** クライアントシークレット */
  client_secret: string;
}

/**
 * Chrome拡張機能メッセージ
 * Background ⇔ Content Script ⇔ Popup間の通信
 */
export interface ExtensionMessage {
  /** メッセージタイプ */
  type: MessageType;
  /** ペイロード */
  payload?: unknown;
  /** リクエストID（レスポンス識別用） */
  requestId?: string;
}

/**
 * メッセージタイプ
 * 拡張機能内通信で使用されるメッセージの種類
 */
export enum MessageType {
  // ページ保存関連
  SAVE_PAGE = 'SAVE_PAGE',
  SAVE_PAGE_RESPONSE = 'SAVE_PAGE_RESPONSE',

  // 設定関連
  GET_CONFIG = 'GET_CONFIG',
  SET_CONFIG = 'SET_CONFIG',
  CONFIG_RESPONSE = 'CONFIG_RESPONSE',

  // 認証関連
  CHECK_AUTH = 'CHECK_AUTH',
  AUTH_RESPONSE = 'AUTH_RESPONSE',
  REFRESH_TOKEN = 'REFRESH_TOKEN',
  TEST_CONNECTION = 'TEST_CONNECTION',

  // ページ情報取得
  GET_PAGE_INFO = 'GET_PAGE_INFO',
  PAGE_INFO_RESPONSE = 'PAGE_INFO_RESPONSE',

  // 状態通知
  STATUS_UPDATE = 'STATUS_UPDATE',
  ERROR_NOTIFICATION = 'ERROR_NOTIFICATION',
}

/**
 * Chrome拡張機能のコンテキストメニューアイテム
 */
export interface ContextMenuItem {
  /** メニューID */
  id: string;
  /** 表示タイトル */
  title: string;
  /** 表示コンテキスト */
  contexts: chrome.contextMenus.ContextType[];
}

/**
 * 拡張機能の状態
 * Popup UIで表示される状態情報
 */
export enum ExtensionStatus {
  /** 初期状態 */
  IDLE = 'idle',
  /** 保存中 */
  SAVING = 'saving',
  /** 保存完了 */
  SUCCESS = 'success',
  /** エラー */
  ERROR = 'error',
  /** 設定未完了 */
  NOT_CONFIGURED = 'not_configured',
  /** 認証エラー */
  AUTH_ERROR = 'auth_error',
}

/**
 * エラータイプ
 * アプリケーション内で発生するエラーの分類
 */
export enum ErrorType {
  /** ネットワークエラー */
  NETWORK_ERROR = 'network_error',
  /** 認証エラー */
  AUTH_ERROR = 'auth_error',
  /** API エラー */
  API_ERROR = 'api_error',
  /** 設定エラー */
  CONFIG_ERROR = 'config_error',
  /** 不明なエラー */
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * APIエラーレスポンス
 * Wallabag APIからのエラーレスポンス
 */
export interface ApiErrorResponse {
  /** エラーコード */
  error: string;
  /** エラー説明 */
  error_description: string;
  /** HTTPステータスコード */
  status?: number;
}

/**
 * HTTPエラー
 * APIクライアント内で使用されるカスタムエラー
 */
export interface HttpError extends Error {
  status?: number;
  response?: ApiErrorResponse | null;
  type?: ErrorType;
  originalError?: unknown;
}

/**
 * 拡張機能設定の検証結果
 */
export interface ConfigValidationResult {
  /** 検証成功フラグ */
  valid: boolean;
  /** エラーメッセージ一覧 */
  errors: string[];
  /** 警告メッセージ一覧 */
  warnings: string[];
}

/**
 * Wallabag APIクライアントのオプション
 */
export interface WallabagApiOptions {
  /** リクエストタイムアウト（ミリ秒） */
  timeout?: number;
  /** リトライ回数 */
  retries?: number;
  /** ベースURL */
  baseUrl: string;
  /** User-Agent */
  userAgent?: string;
}

/**
 * ページ保存オプション
 */
export interface SavePageOptions {
  /** タグを追加 */
  tags?: string;
  /** お気に入りに追加 */
  starred?: boolean;
  /** アーカイブに追加 */
  archive?: boolean;
}

export function isPageInfo(payload: unknown): payload is PageInfo {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'url' in payload &&
    'title' in payload
  );
}

export function isPartialConfig(payload: unknown): payload is Partial<Config> {
  return typeof payload === 'object' && payload !== null;
}
