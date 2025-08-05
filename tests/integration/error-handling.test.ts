/**
 * エラーハンドリング統合テスト
 * 様々なエラーシナリオでのシステムの動作をテスト
 */
import { mock, MockProxy } from 'jest-mock-extended';
import { WallabagApiClient } from '../../src/lib/wallabag-api';
import { ConfigManager } from '../../src/lib/config-manager';
import {
  Config,
  PageInfo,
  ExtensionMessage,
  MessageType,
} from '../../src/lib/types';
import { BackgroundService } from '../../src/background/background';

// Chrome APIのモック型
type MockChrome = {
  storage: {
    local: MockProxy<chrome.storage.LocalStorageArea>;
  };
  runtime: MockProxy<chrome.runtime.Runtime>;
  tabs: MockProxy<chrome.tabs.Tabs>;
  notifications: MockProxy<chrome.notifications.Notifications>;
  action: MockProxy<chrome.action.Action>;
};

// Fetch APIのモック
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// ConfigManagerのモック
jest.mock('../../src/lib/config-manager');
const mockConfigManager = ConfigManager as jest.Mocked<typeof ConfigManager>;

describe('エラーハンドリング統合テスト', () => {
  let mockChrome: MockChrome;
  let baseUrl: string;
  let client: WallabagApiClient;

  beforeEach(() => {
    baseUrl = 'https://wallabag.test.com';
    client = new WallabagApiClient(baseUrl);

    // Chrome APIのモック
    mockChrome = {
      storage: {
        local: mock<chrome.storage.LocalStorageArea>(),
      },
      runtime: mock<chrome.runtime.Runtime>(),
      tabs: mock<chrome.tabs.Tabs>(),
      notifications: mock<chrome.notifications.Notifications>(),
      action: mock<chrome.action.Action>(),
    };

    global.chrome = mockChrome as any;

    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('ネットワークエラーハンドリング', () => {
    it('接続タイムアウトエラーを適切にハンドリングする', async () => {
      // AbortErrorをシミュレート
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'AbortError';

      mockFetch.mockRejectedValue(timeoutError);

      const credentials = {
        grant_type: 'password' as const,
        client_id: 'test-client',
        client_secret: 'test-secret',
        username: 'testuser',
        password: 'testpass',
      };

      await expect(client.authenticate(credentials)).rejects.toThrow(
        '認証に失敗しました'
      );

      // リトライが実行されることを確認（デフォルト3回）
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('DNS解決失敗エラーを適切にハンドリングする', async () => {
      // DNS解決失敗をシミュレート
      const dnsError = new Error('getaddrinfo ENOTFOUND');
      dnsError.name = 'TypeError';

      mockFetch.mockRejectedValue(dnsError);

      await expect(client.testConnection()).rejects.toThrow();

      // リトライが実行されることを確認
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('ネットワーク断線エラーを適切にハンドリングする', async () => {
      const networkError = new Error('Failed to fetch');
      networkError.name = 'TypeError';

      mockFetch.mockRejectedValue(networkError);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        clientId: 'test-client',
        clientSecret: 'test-secret',
        username: 'testuser',
        password: 'testpass',
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      await expect(
        client.createEntry({ url: 'https://example.com' })
      ).rejects.toThrow('エントリの作成に失敗しました');

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('HTTPエラーハンドリング', () => {
    it('HTTP 400 Bad Requestエラーを適切にハンドリングする', async () => {
      const errorResponse = {
        error: 'invalid_request',
        error_description: 'URL parameter is required',
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(errorResponse),
      } as unknown as Response);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      await expect(client.createEntry({ url: '' })).rejects.toThrow(
        'エントリの作成に失敗しました'
      );

      // 400エラーはリトライしないことを確認
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('HTTP 401 Unauthorizedエラーを適切にハンドリングする', async () => {
      const errorResponse = {
        error: 'invalid_token',
        error_description: 'The access token provided is invalid',
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(errorResponse),
      } as unknown as Response);

      const credentials = {
        grant_type: 'password' as const,
        client_id: 'invalid-client',
        client_secret: 'invalid-secret',
        username: 'testuser',
        password: 'testpass',
      };

      await expect(client.authenticate(credentials)).rejects.toThrow(
        '認証に失敗しました'
      );

      // 401エラーはリトライしないことを確認
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('HTTP 404 Not Foundエラーを適切にハンドリングする', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({
          error: 'not_found',
          error_description: 'Entry not found',
        }),
      } as unknown as Response);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      await expect(client.getEntry(99999)).rejects.toThrow(
        'エントリの取得に失敗しました'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('HTTP 429 Too Many Requestsエラーを適切にハンドリングする', async () => {
      const entryResponse = {
        id: 123,
        url: 'https://example.com',
        title: 'Test',
        content: 'Content',
        created_at: '2025-08-03T10:00:00Z',
        updated_at: '2025-08-03T10:00:00Z',
        starred: false,
        archived: false,
        tags: [],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({
            'content-type': 'application/json',
            'retry-after': '60',
          }),
          json: jest.fn().mockResolvedValue({
            error: 'rate_limit_exceeded',
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse),
        } as unknown as Response);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      // delay関数をモック
      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const result = await client.createEntry({ url: 'https://example.com' });

      expect(result).toEqual(entryResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('HTTP 500 Internal Server Errorエラーを適切にハンドリングする', async () => {
      const entryResponse = {
        id: 456,
        url: 'https://example.com',
        title: 'Test',
        content: 'Content',
        created_at: '2025-08-03T10:00:00Z',
        updated_at: '2025-08-03T10:00:00Z',
        starred: false,
        archived: false,
        tags: [],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue({}),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse),
        } as unknown as Response);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const result = await client.createEntry({ url: 'https://example.com' });

      expect(result).toEqual(entryResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('HTTP 503 Service Unavailableエラーを適切にハンドリングする', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({
          error: 'service_unavailable',
          error_description: 'Service temporarily unavailable',
        }),
      } as unknown as Response);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      await expect(
        client.createEntry({ url: 'https://example.com' })
      ).rejects.toThrow('エントリの作成に失敗しました');

      // 503エラーはリトライされることを確認
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('認証エラーハンドリング', () => {
    it('無効なクライアント認証情報エラーを適切にハンドリングする', async () => {
      const errorResponse = {
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(errorResponse),
      } as unknown as Response);

      const credentials = {
        grant_type: 'password' as const,
        client_id: 'invalid-client',
        client_secret: 'invalid-secret',
        username: 'testuser',
        password: 'testpass',
      };

      await expect(client.authenticate(credentials)).rejects.toThrow(
        '認証に失敗しました'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/oauth/v2/token`,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('無効なユーザー認証情報エラーを適切にハンドリングする', async () => {
      const errorResponse = {
        error: 'invalid_grant',
        error_description: 'Invalid username and password combination',
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(errorResponse),
      } as unknown as Response);

      const credentials = {
        grant_type: 'password' as const,
        client_id: 'valid-client',
        client_secret: 'valid-secret',
        username: 'invalid-user',
        password: 'invalid-pass',
      };

      await expect(client.authenticate(credentials)).rejects.toThrow(
        '認証に失敗しました'
      );
    });

    it('リフレッシュトークンエラーでトークンをクリアする', async () => {
      const errorResponse = {
        error: 'invalid_grant',
        error_description: 'The refresh token is invalid',
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(errorResponse),
      } as unknown as Response);

      mockConfigManager.clearTokens.mockResolvedValue();

      const refreshRequest = {
        grant_type: 'refresh_token' as const,
        refresh_token: 'invalid-refresh-token',
        client_id: 'test-client',
        client_secret: 'test-secret',
      };

      await expect(client.refreshToken(refreshRequest)).rejects.toThrow();

      // トークンがクリアされることを確認
      expect(mockConfigManager.clearTokens).toHaveBeenCalled();
    });
  });

  describe('設定エラーハンドリング', () => {
    it('Chrome Storage容量制限エラーを適切にハンドリングする', async () => {
      mockChrome.storage.local.set.mockRejectedValue(
        new Error('QUOTA_BYTES quota exceeded')
      );

      const config: Partial<Config> = {
        serverUrl: 'https://wallabag.test.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        username: 'testuser',
        password: 'testpass',
      };

      await expect(ConfigManager.setConfig(config)).rejects.toThrow(
        '設定の保存に失敗しました'
      );
    });

    it('Chrome Storage読み込みエラーを適切にハンドリングする', async () => {
      mockChrome.storage.local.get.mockRejectedValue(
        new Error('Storage is not available')
      );

      const config = await ConfigManager.getConfig();

      // エラー時は空オブジェクトを返すことを確認
      expect(config).toEqual({});
    });

    it('不正な設定データエラーを適切にハンドリングする', async () => {
      const invalidConfig = {
        serverUrl: 'invalid-url',
        clientId: '',
        clientSecret: 'short',
        username: 'ab', // 3文字未満
        password: '123', // 短すぎる
      };

      const validation = ConfigManager.validateConfig(invalidConfig);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('サーバーURLの形式が正しくありません');
      expect(validation.errors).toContain('クライアントIDは必須です');
      expect(validation.errors).toContain('ユーザー名は3文字以上で入力してください');
      expect(validation.warnings).toContain(
        'クライアントシークレットが短すぎる可能性があります'
      );
      expect(validation.warnings).toContain('パスワードが短すぎる可能性があります');
    });
  });

  describe('Background Service エラーハンドリング', () => {
    let backgroundService: BackgroundService;

    beforeEach(async () => {
      backgroundService = new BackgroundService();
      await backgroundService.initialize();
    });

    it('未設定状態でのページ保存エラーを適切にハンドリングする', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(false);

      const pageInfo: PageInfo = {
        url: 'https://example.com',
        title: 'Test Page',
      };

      const saveMessage: ExtensionMessage = {
        type: MessageType.SAVE_PAGE,
        payload: pageInfo,
      };

      const response = await backgroundService['handleMessage'](saveMessage, {
        tab: { id: 1 },
      });

      expect(response.type).toBe(MessageType.SAVE_PAGE_RESPONSE);
      expect(response.payload.success).toBe(false);
      expect(response.payload.message).toContain('設定が完了していません');
    });

    it('API エラー時の適切なエラーレスポンスを確認する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(true);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({}),
      } as unknown as Response);

      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const pageInfo: PageInfo = {
        url: 'https://example.com',
        title: 'Test Page',
      };

      const saveMessage: ExtensionMessage = {
        type: MessageType.SAVE_PAGE,
        payload: pageInfo,
      };

      const response = await backgroundService['handleMessage'](saveMessage, {
        tab: { id: 1 },
      });

      expect(response.type).toBe(MessageType.SAVE_PAGE_RESPONSE);
      expect(response.payload.success).toBe(false);
      expect(response.payload.message).toContain('失敗しました');
    });

    it('Chrome API エラーを適切にハンドリングする', async () => {
      mockChrome.notifications.create.mockRejectedValue(
        new Error('Notifications API not available')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await backgroundService['showNotification']('Test', 'Message');

      expect(consoleSpy).toHaveBeenCalledWith(
        '通知の表示に失敗しました:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('タブが存在しない場合のエラーハンドリングを確認する', async () => {
      const getPageInfoMessage: ExtensionMessage = {
        type: MessageType.GET_PAGE_INFO,
        payload: {},
      };

      await expect(
        backgroundService['handleMessage'](getPageInfoMessage, {})
      ).rejects.toThrow('タブ情報が取得できません');
    });

    it('Content Script通信エラーを適切にハンドリングする', async () => {
      mockChrome.tabs.sendMessage.mockRejectedValue(
        new Error('Could not establish connection')
      );

      const getPageInfoMessage: ExtensionMessage = {
        type: MessageType.GET_PAGE_INFO,
        payload: {},
      };

      const response = await backgroundService['handleMessage'](
        getPageInfoMessage,
        { tab: { id: 1, url: 'https://example.com', title: 'Test' } }
      );

      expect(response.type).toBe(MessageType.PAGE_INFO_RESPONSE);
      expect(response.payload).toEqual({
        url: 'https://example.com',
        title: 'Test',
      });
    });
  });

  describe('レスポンス形式エラーハンドリング', () => {
    it('非JSON レスポンスエラーを適切にハンドリングする', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        json: jest
          .fn()
          .mockRejectedValue(new Error('Unexpected token < in JSON')),
      } as unknown as Response);

      const credentials = {
        grant_type: 'password' as const,
        client_id: 'test-client',
        client_secret: 'test-secret',
        username: 'testuser',
        password: 'testpass',
      };

      await expect(client.authenticate(credentials)).rejects.toThrow();
    });

    it('空のレスポンスエラーを適切にハンドリングする', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(null),
      } as unknown as Response);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      const result = await client.createEntry({ url: 'https://example.com' });

      expect(result).toBeNull();
    });

    it('不正なJSON構造エラーを適切にハンドリングする', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest
          .fn()
          .mockRejectedValue(new Error('Unexpected end of JSON input')),
      } as unknown as Response);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      await expect(
        client.createEntry({ url: 'https://example.com' })
      ).rejects.toThrow();
    });
  });

  describe('リソース制限エラーハンドリング', () => {
    it('メモリ不足エラーを適切にハンドリングする', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest
          .fn()
          .mockRejectedValue(new Error('Maximum call stack size exceeded')),
      } as unknown as Response);

      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      await expect(client.getEntry(1)).rejects.toThrow();
    });

    it('同時リクエスト制限エラーを適切にハンドリングする', async () => {
      const config: Partial<Config> = {
        serverUrl: baseUrl,
        accessToken: 'valid-token',
      };

      mockConfigManager.getConfig.mockResolvedValue(config);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      // 最初のリクエストは制限エラー、2回目は成功
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue({
            error: 'rate_limit_exceeded',
            error_description: 'Too many concurrent requests',
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue({
            id: 1,
            url: 'https://example.com',
            title: 'Test',
            content: 'Content',
            created_at: '2025-08-03T10:00:00Z',
            updated_at: '2025-08-03T10:00:00Z',
            starred: false,
            archived: false,
            tags: [],
          }),
        } as unknown as Response);

      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const result = await client.createEntry({ url: 'https://example.com' });

      expect(result.id).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});