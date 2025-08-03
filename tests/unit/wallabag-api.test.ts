/**
 * Wallabag API クライアント単体テスト
 * WallabagApiClientクラスの全機能をテスト
 */

import { WallabagApiClient, createWallabagClient, savePage } from '../../src/lib/wallabag-api';
import { ConfigManager } from '../../src/lib/config-manager';
import {
  AuthResponse,
  AuthCredentials,
  RefreshTokenRequest,
  CreateEntryRequest,
  EntryResponse,
  EntriesResponse,
  ErrorType,
  Config
} from '../../src/lib/types';

// fetch APIのモック
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// ConfigManagerのモック
jest.mock('../../src/lib/config-manager', () => ({
  ConfigManager: {
    getConfig: jest.fn(),
    saveTokens: jest.fn(),
    clearTokens: jest.fn(),
    isTokenValid: jest.fn(),
  },
}));

const mockConfigManager = ConfigManager as jest.Mocked<typeof ConfigManager>;

describe('WallabagApiClient', () => {
  let client: WallabagApiClient;
  const baseUrl = 'https://wallabag.example.com';
  const mockConfig: Config = {
    serverUrl: baseUrl,
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    username: 'testuser',
    password: 'testpass',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    import {
  Config,
  AuthResponse,
  EntryResponse,
  EntriesResponse,
  ApiErrorResponse,
  HttpError
} from '../../src/lib/types';
// ...
    tokenExpiresAt: Date.now() + 3600000
  };

  beforeEach(() => {
    client = new WallabagApiClient(baseUrl);
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('正しくベースURLを設定する', () => {
      expect(client['baseUrl']).toBe(baseUrl);
    });

    it('末尾のスラッシュを除去する', () => {
      const clientWithSlash = new WallabagApiClient('https://example.com/');
      expect(clientWithSlash['baseUrl']).toBe('https://example.com');
    });

    it('デフォルトオプションを設定する', () => {
      expect(client['options']).toEqual({
        timeout: 30000,
        retries: 3,
        userAgent: 'Wallabag Chrome Extension 1.0',
        baseUrl: baseUrl
      });
    });

    it('カスタムオプションを設定する', () => {
      const customClient = new WallabagApiClient(baseUrl, {
        timeout: 10000,
        retries: 1,
        userAgent: 'Custom Agent'
      });
      
      expect(customClient['options']).toEqual({
        timeout: 10000,
        retries: 1,
        userAgent: 'Custom Agent',
        baseUrl: baseUrl
      });
    });
  });

  describe('authenticate', () => {
    const credentials: AuthCredentials = {
      grant_type: 'password',
      client_id: 'test-client',
      client_secret: 'test-secret',
      username: 'testuser',
      password: 'testpass'
    };

    const mockAuthResponse: AuthResponse = {
      access_token: 'new-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'read write',
      refresh_token: 'new-refresh-token'
    };

    it('正常に認証を実行する', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockAuthResponse)
      } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const result = await client.authenticate(credentials);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/oauth/v2/token`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Wallabag Chrome Extension 1.0'
          },
          body: expect.stringContaining('grant_type=password')
        })
      );

      expect(mockConfigManager.saveTokens).toHaveBeenCalledWith(
        mockAuthResponse.access_token,
        mockAuthResponse.expires_in,
        mockAuthResponse.refresh_token
      );

      expect(result).toEqual(mockAuthResponse);
    });

    it('認証失敗時にエラーを投げる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({
          error: 'invalid_grant',
          error_description: 'Invalid username and password combination'
        })
      } as any);

      await expect(client.authenticate(credentials)).rejects.toThrow('認証に失敗しました');
    });

    it('ネットワークエラーをハンドリングする', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.authenticate(credentials)).rejects.toThrow('認証に失敗しました');
    });
  });

  describe('refreshToken', () => {
    const refreshTokenRequest: RefreshTokenRequest = {
      grant_type: 'refresh_token',
      refresh_token: 'test-refresh-token',
      client_id: 'test-client',
      client_secret: 'test-secret'
    };

    const mockRefreshResponse: AuthResponse = {
      access_token: 'refreshed-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'read write',
      refresh_token: 'refreshed-refresh-token'
    };

    it('正常にトークンをリフレッシュする', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockRefreshResponse)
      } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const result = await client.refreshToken(refreshTokenRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/oauth/v2/token`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Wallabag Chrome Extension 1.0'
          },
          body: expect.stringContaining('grant_type=refresh_token')
        })
      );

      expect(result).toEqual(mockRefreshResponse);
    });

    it('リフレッシュ失敗時にトークンをクリアする', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token'
        })
      } as any);

      mockConfigManager.clearTokens.mockResolvedValue();

      await expect(client.refreshToken(refreshTokenRequest)).rejects.toThrow();
      expect(mockConfigManager.clearTokens).toHaveBeenCalled();
    });
  });

  describe('createEntry', () => {
    const entryRequest: CreateEntryRequest = {
      url: 'https://example.com/article',
      title: 'Test Article',
      tags: 'test,article'
    };

    const mockEntryResponse: EntryResponse = {
      id: 123,
      url: 'https://example.com/article',
      title: 'Test Article',
      content: 'Article content...',
      created_at: '2025-08-03T10:00:00Z',
      updated_at: '2025-08-03T10:00:00Z',
      starred: false,
      archived: false,
      tags: [
        { id: 1, label: 'test' },
        { id: 2, label: 'article' }
      ]
    };

    it('正常にエントリを作成する', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockEntryResponse)
      } as any);

      const result = await client.createEntry(entryRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/entries.json`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mockConfig.accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Wallabag Chrome Extension 1.0'
          },
          body: JSON.stringify(entryRequest)
        })
      );

      expect(result).toEqual(mockEntryResponse);
    });

    it('認証エラー時に再認証を実行する', async () => {
      // 最初は無効なトークン
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(false);

      // リフレッシュ成功
      const refreshResponse: AuthResponse = {
        access_token: 'new-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'new-refresh-token'
      };

      mockFetch
        // リフレッシュトークンリクエスト
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(refreshResponse)
        } as any)
        // エントリ作成リクエスト
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(mockEntryResponse)
        } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const result = await client.createEntry(entryRequest);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockEntryResponse);
    });
  });

  describe('getEntries', () => {
    const mockEntriesResponse: EntriesResponse = {
      page: 1,
      limit: 30,
      pages: 1,
      total: 2,
      _embedded: {
        items: [
          {
            id: 1,
            url: 'https://example.com/1',
            title: 'Article 1',
            content: 'Content 1',
            created_at: '2025-08-03T10:00:00Z',
            updated_at: '2025-08-03T10:00:00Z',
            starred: false,
            archived: false,
            tags: []
          },
          {
            id: 2,
            url: 'https://example.com/2',
            title: 'Article 2',
            content: 'Content 2',
            created_at: '2025-08-03T11:00:00Z',
            updated_at: '2025-08-03T11:00:00Z',
            starred: true,
            archived: false,
            tags: []
          }
        ]
      }
    };

    it('正常にエントリ一覧を取得する', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockEntriesResponse)
      } as any);

      const result = await client.getEntries();

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/entries.json`,
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${mockConfig.accessToken}`,
            'User-Agent': 'Wallabag Chrome Extension 1.0'
          }
        })
      );

      expect(result).toEqual(mockEntriesResponse);
    });

    it('パラメータ付きでエントリ一覧を取得する', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockEntriesResponse)
      } as any);

      const params = {
        archive: true,
        starred: false,
        page: 2,
        perPage: 10,
        tags: 'technology'
      };

      await client.getEntries(params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('archive=true&starred=false&page=2&perPage=10&tags=technology'),
        expect.any(Object)
      );
    });
  });

  describe('getEntry', () => {
    const entryId = 123;
    const mockEntry: EntryResponse = {
      id: entryId,
      url: 'https://example.com/article',
      title: 'Test Article',
      content: 'Full article content...',
      created_at: '2025-08-03T10:00:00Z',
      updated_at: '2025-08-03T10:00:00Z',
      starred: false,
      archived: false,
      tags: []
    };

    it('正常にエントリを取得する', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockEntry)
      } as any);

      const result = await client.getEntry(entryId);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/entries/${entryId}.json`,
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${mockConfig.accessToken}`,
            'User-Agent': 'Wallabag Chrome Extension 1.0'
          }
        })
      );

      expect(result).toEqual(mockEntry);
    });
  });

  describe('testConnection', () => {
    it('正常に接続テストを実行する', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      const mockAuthResponse: AuthResponse = {
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'test-refresh'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockAuthResponse)
      } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const result = await client.testConnection();

      expect(result).toBe(true);
    });

    it('設定不完全時にfalseを返す', async () => {
      const incompleteConfig = {
        ...mockConfig,
        clientSecret: '' // 不完全な設定
      };
      
      mockConfigManager.getConfig.mockResolvedValue(incompleteConfig);

      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    it('認証失敗時にfalseを返す', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({
          error: 'invalid_grant'
        })
      } as any);

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('エラーハンドリング', () => {
    beforeEach(() => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(true);
    });

    it('タイムアウトエラーをハンドリングする', async () => {
      // AbortErrorをシミュレート
      const abortError = new Error('Request timeout');
      abortError.name = 'AbortError';
      
      mockFetch.mockRejectedValue(abortError);

      await expect(client.createEntry({ url: 'https://test.com' }))
        .rejects.toThrow('エントリの作成に失敗しました');
    });

    it('HTTP 500エラーでリトライする', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue({})
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue({ id: 1, url: 'https://test.com' })
        } as any);

      // delay関数をモック
      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const result = await client.createEntry({ url: 'https://test.com' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 1, url: 'https://test.com' });
    });

    it('HTTP 429エラーでリトライする', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue({})
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue({ id: 1, url: 'https://test.com' })
        } as any);

      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const result = await client.createEntry({ url: 'https://test.com' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 1, url: 'https://test.com' });
    });

    it('HTTP 400エラーでリトライしない', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({
          error: 'invalid_request',
          error_description: 'Invalid URL format'
        })
      } as any);

      await expect(client.createEntry({ url: 'invalid-url' }))
        .rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createWallabagClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('設定からクライアントを作成する', async () => {
    const config: Config = {
      serverUrl: 'https://wallabag.test.com',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      username: 'testuser',
      password: 'testpass'
    };

    mockConfigManager.getConfig.mockResolvedValue(config);

    const client = await createWallabagClient();

    expect(client['baseUrl']).toBe('https://wallabag.test.com');
  });

  it('サーバーURL未設定時にエラーを投げる', async () => {
    const config: Config = {
      serverUrl: '',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      username: 'testuser',
      password: 'testpass'
    };

    mockConfigManager.getConfig.mockResolvedValue(config);

    await expect(createWallabagClient()).rejects.toThrow('Wallabagサーバーが設定されていません');
  });
});

describe('savePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常にページを保存する', async () => {
    const config: Config = {
      serverUrl: 'https://wallabag.test.com',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      username: 'testuser',
      password: 'testpass',
      accessToken: 'valid-token'
    };

    const mockEntry: EntryResponse = {
      id: 456,
      url: 'https://example.com/page',
      title: 'Test Page',
      content: 'Page content',
      created_at: '2025-08-03T12:00:00Z',
      updated_at: '2025-08-03T12:00:00Z',
      starred: false,
      archived: false,
      tags: []
    };

    mockConfigManager.getConfig.mockResolvedValue(config);
    mockConfigManager.isTokenValid.mockResolvedValue(true);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest.fn().mockResolvedValue(mockEntry)
    } as any);

    const result = await savePage(
      'https://example.com/page',
      'Test Page',
      'test,example'
    );

    expect(result).toEqual(mockEntry);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://wallabag.test.com/api/entries.json',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://example.com/page',
          title: 'Test Page',
          tags: 'test,example'
        })
      })
    );
  });
});