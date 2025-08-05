/**
 * Wallabag Chrome拡張機能 - Wallabag API クライアント
 * Wallabag API v2への認証、エントリ作成、管理機能
 */

import {
  AuthResponse,
  AuthCredentials,
  RefreshTokenRequest,
  CreateEntryRequest,
  EntryResponse,
  EntriesResponse,
  ApiErrorResponse,
  WallabagApiOptions,
  ErrorType,
  HttpError,
} from './types';
import { ConfigManager } from './config-manager';

/**
 * Wallabag APIクライアント
 * 認証、エントリ管理、エラーハンドリングを提供
 */
export class WallabagApiClient {
  private baseUrl: string;
  private options: WallabagApiOptions;

  constructor(baseUrl: string, options: Partial<WallabagApiOptions> = {}) {
    // URLの正規化（末尾のスラッシュを除去）
    this.baseUrl = baseUrl.replace(/\/$/, '');

    this.options = {
      timeout: 30000, // 30秒
      retries: 3,
      userAgent: 'Wallabag Chrome Extension 1.0',
      ...options,
      baseUrl: this.baseUrl,
    };
  }

  /**
   * 認証を実行
   * @param credentials 認証情報
   * @returns 認証レスポンス
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthResponse> {
    const url = `${this.baseUrl}/oauth/v2/token`;

    const body = new URLSearchParams({
      grant_type: credentials.grant_type,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      username: credentials.username,
      password: credentials.password,
    });

    try {
      const response = await this.makeRequest<AuthResponse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      // トークンを設定に保存
      await ConfigManager.saveTokens(
        response.access_token,
        response.expires_in,
        response.refresh_token
      );

      console.log('認証が正常に完了しました');
      return response;
    } catch (error) {
      console.error('認証に失敗しました:', error);
      throw this.createError(ErrorType.AUTH_ERROR, '認証に失敗しました', error);
    }
  }

  /**
   * リフレッシュトークンを使用してトークンを更新
   * @param refreshTokenRequest リフレッシュトークンリクエスト
   * @returns 新しい認証レスポンス
   */
  async refreshToken(
    refreshTokenRequest: RefreshTokenRequest
  ): Promise<AuthResponse> {
    const url = `${this.baseUrl}/oauth/v2/token`;

    const body = new URLSearchParams({
      grant_type: refreshTokenRequest.grant_type,
      refresh_token: refreshTokenRequest.refresh_token,
      client_id: refreshTokenRequest.client_id,
      client_secret: refreshTokenRequest.client_secret,
    });

    try {
      const response = await this.makeRequest<AuthResponse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      // 新しいトークンを保存
      await ConfigManager.saveTokens(
        response.access_token,
        response.expires_in,
        response.refresh_token
      );

      console.log('トークンの更新が完了しました');
      return response;
    } catch (error) {
      console.error('トークンの更新に失敗しました:', error);
      // トークンが無効な場合はクリア
      await ConfigManager.clearTokens();
      throw this.createError(
        ErrorType.AUTH_ERROR,
        'トークンの更新に失敗しました',
        error
      );
    }
  }

  /**
   * エントリを作成
   * @param entry エントリ作成リクエスト
   * @returns 作成されたエントリ
   */
  async createEntry(entry: CreateEntryRequest): Promise<EntryResponse> {
    const url = `${this.baseUrl}/api/entries.json`;

    try {
      const accessToken = await this.getValidAccessToken();

      const response = await this.makeRequest<EntryResponse>(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });

      console.log('エントリが正常に作成されました:', response.id);
      return response;
    } catch (error) {
      console.error('エントリ作成に失敗しました:', error);
      throw this.createError(
        ErrorType.API_ERROR,
        'エントリの作成に失敗しました',
        error
      );
    }
  }

  /**
   * エントリ一覧を取得
   * @param params クエリパラメータ
   * @returns エントリ一覧
   */
  async getEntries(
    params: {
      archive?: boolean;
      starred?: boolean;
      page?: number;
      perPage?: number;
      tags?: string;
    } = {}
  ): Promise<EntriesResponse> {
    const url = `${this.baseUrl}/api/entries.json`;
    const queryParams = new URLSearchParams();

    // パラメータの設定
    if (params.archive !== undefined)
      queryParams.set('archive', params.archive.toString());
    if (params.starred !== undefined)
      queryParams.set('starred', params.starred.toString());
    if (params.page !== undefined)
      queryParams.set('page', params.page.toString());
    if (params.perPage !== undefined)
      queryParams.set('perPage', params.perPage.toString());
    if (params.tags) queryParams.set('tags', params.tags);

    const fullUrl = queryParams.toString() ? `${url}?${queryParams}` : url;

    try {
      const accessToken = await this.getValidAccessToken();

      const response = await this.makeRequest<EntriesResponse>(fullUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response;
    } catch (error) {
      console.error('エントリ一覧の取得に失敗しました:', error);
      throw this.createError(
        ErrorType.API_ERROR,
        'エントリ一覧の取得に失敗しました',
        error
      );
    }
  }

  /**
   * エントリを取得
   * @param entryId エントリID
   * @returns エントリ詳細
   */
  async getEntry(entryId: number): Promise<EntryResponse> {
    const url = `${this.baseUrl}/api/entries/${entryId}.json`;

    try {
      const accessToken = await this.getValidAccessToken();

      const response = await this.makeRequest<EntryResponse>(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response;
    } catch (error) {
      console.error('エントリの取得に失敗しました:', error);
      throw this.createError(
        ErrorType.API_ERROR,
        'エントリの取得に失敗しました',
        error
      );
    }
  }

  /**
   * 接続テスト
   * @returns 接続の成功/失敗
   */
  async testConnection(): Promise<boolean> {
    try {
      const config = await ConfigManager.getConfig();

      // 認証情報の確認
      if (
        !config.serverUrl ||
        !config.clientId ||
        !config.clientSecret ||
        !config.username ||
        !config.password
      ) {
        throw new Error('認証情報が不完全です');
      }

      // 認証テスト
      await this.authenticate({
        grant_type: 'password',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        username: config.username,
        password: config.password,
      });

      return true;
    } catch (error) {
      console.error('接続テストに失敗しました:', error);
      return false;
    }
  }

  /**
   * 有効なアクセストークンを取得
   * @returns アクセストークン
   * @private
   */
  private async getValidAccessToken(): Promise<string> {
    const config = await ConfigManager.getConfig();

    // トークンの有効性をチェック
    if ((await ConfigManager.isTokenValid()) && config.accessToken) {
      return config.accessToken;
    }

    // トークンが無効な場合、リフレッシュを試行
    if (config.refreshToken && config.clientId && config.clientSecret) {
      try {
        const refreshResponse = await this.refreshToken({
          grant_type: 'refresh_token',
          refresh_token: config.refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        });

        return refreshResponse.access_token;
      } catch (error) {
        console.warn(
          'トークンリフレッシュに失敗しました。再認証が必要です。',
          error
        );
      }
    }

    // リフレッシュも失敗した場合は再認証
    if (
      config.clientId &&
      config.clientSecret &&
      config.username &&
      config.password
    ) {
      const authResponse = await this.authenticate({
        grant_type: 'password',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        username: config.username,
        password: config.password,
      });

      return authResponse.access_token;
    }

    throw this.createError(ErrorType.AUTH_ERROR, '認証情報が不足しています');
  }

  /**
   * HTTPリクエストを実行（リトライ機能付き）
   * @param url リクエストURL
   * @param options フェッチオプション
   * @param retryCount 現在のリトライ回数
   * @returns レスポンス
   * @private
   */
  private async makeRequest<T>(
    url: string,
    options: RequestInit,
    retryCount = 0
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'User-Agent': this.options.userAgent || 'Wallabag Extension',
          ...options.headers,
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        await this.handleHttpError(response);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        throw new Error('期待されたJSON形式ではありません');
      }
    } catch (error) {
      clearTimeout(timeout);

      // リトライ可能なエラーかどうか判定
      if (this.shouldRetry(error, retryCount)) {
        console.warn(
          `リクエストをリトライします (${retryCount + 1}/${this.options.retries}):`,
          error
        );
        await this.delay(Math.pow(2, retryCount) * 1000); // 指数バックオフ
        return this.makeRequest<T>(url, options, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * HTTPエラーを処理
   * @param response エラーレスポンス
   * @private
   */
  private async handleHttpError(response: Response): Promise<void> {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errorData: ApiErrorResponse | null = null;

    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json();
        if (errorData?.error_description) {
          errorMessage = errorData.error_description;
        }
      }
    } catch {
      // JSON解析に失敗した場合は標準エラーメッセージを使用
    }

    const error: HttpError = new Error(errorMessage);
    error.status = response.status;
    error.response = errorData;

    throw error;
  }

  /**
   * リトライすべきエラーかどうか判定
   * @param error エラー
   * @param retryCount 現在のリトライ回数
   * @returns リトライ可否
   * @private
   */
  private shouldRetry(error: unknown, retryCount: number): boolean {
    if (retryCount >= this.options.retries!) {
      return false;
    }

    const httpError = error as HttpError;

    // ネットワークエラー、タイムアウト、5xxエラーはリトライ
    if (
      httpError.name === 'AbortError' ||
      httpError.name === 'TypeError' ||
      (httpError.status && httpError.status >= 500)
    ) {
      return true;
    }

    // 429 (Too Many Requests) もリトライ
    if (httpError.status === 429) {
      return true;
    }

    return false;
  }

  /**
   * 指定した時間待機
   * @param ms 待機時間（ミリ秒）
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * エラーオブジェクトを作成
   * @param type エラータイプ
   * @param message エラーメッセージ
   * @param originalError 元のエラー
   * @returns カスタムエラー
   * @private
   */
  private createError(
    type: ErrorType,
    message: string,
    originalError?: unknown
  ): HttpError {
    const error: HttpError = new Error(message);
    error.type = type;
    error.originalError = originalError;
    return error;
  }
}

/**
 * Wallabag APIクライアントのファクトリー関数
 * 設定から自動的にクライアントを作成
 */
export async function createWallabagClient(): Promise<WallabagApiClient> {
  const config = await ConfigManager.getConfig();

  if (!config.serverUrl) {
    throw new Error('Wallabagサーバーが設定されていません');
  }

  return new WallabagApiClient(config.serverUrl, {
    timeout: 30000,
    retries: 3,
  });
}

/**
 * 簡単なページ保存機能
 * @param url 保存するURL
 * @param title ページタイトル
 * @param tags タグ（カンマ区切り）
 * @returns 保存結果
 */
export async function savePage(
  url: string,
  title?: string,
  tags?: string
): Promise<EntryResponse> {
  const client = await createWallabagClient();

  const entry: CreateEntryRequest = { url };
  if (title) entry.title = title;
  if (tags) entry.tags = tags;

  return await client.createEntry(entry);
}
