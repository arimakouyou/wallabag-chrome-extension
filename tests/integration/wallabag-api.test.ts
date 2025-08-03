/**
 * Wallabag API 統合テスト
 * 実際のWallabag API v2との統合機能をテスト
 */

import { WallabagApiClient } from '../../src/lib/wallabag-api';
import {
  Config,
  AuthResponse,
  EntryResponse,
  EntriesResponse,
  ApiErrorResponse,
  HttpError
} from '../../src/lib/types';

// 実際のHTTPリクエストをモック
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// ConfigManagerのモック
jest.mock('../../src/lib/config-manager', () => ({
  ConfigManager: {
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    saveTokens: jest.fn(),
    clearTokens: jest.fn(),
    isTokenValid: jest.fn(),
    isConfigured: jest.fn(),
    hasAuthCredentials: jest.fn(),
  },
}));

const mockConfigManager = ConfigManager as jest.Mocked<typeof ConfigManager>;

describe('Wallabag API 統合テスト', () => {
  const baseUrl = 'https://wallabag-test.example.com';
  const mockConfig: Config = {
    serverUrl: baseUrl,
    clientId: 'integration-test-client',
    clientSecret: 'integration-test-secret',
    username: 'testuser',
    password: 'testpassword',
    accessToken: 'valid-access-token',
    refreshToken: 'valid-refresh-token',
    tokenExpiresAt: Math.floor(Date.now() / 1000) + 3600
  };

  let client: WallabagApiClient;

  beforeEach(() => {
    client = new WallabagApiClient(baseUrl);
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('認証フロー統合テスト', () => {
    it('完全な認証フローが正常に動作する', async () => {
      const authResponse: AuthResponse = {
        access_token: 'test-access-token-12345',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'test-refresh-token-12345'
      };

      // 認証リクエストの成功をモック
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(authResponse)
      } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const credentials = {
        grant_type: 'password' as const,
        client_id: mockConfig.clientId!,
        client_secret: mockConfig.clientSecret!,
        username: mockConfig.username!,
        password: mockConfig.password!
      };

      const result = await client.authenticate(credentials);

      // 正しいエンドポイントが呼ばれることを確認
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/oauth/v2/token`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          }),
          body: expect.stringContaining('grant_type=password')
        })
      );

      // トークンが保存されることを確認
      expect(mockConfigManager.saveTokens).toHaveBeenCalledWith(
        authResponse.access_token,
        authResponse.expires_in,
        authResponse.refresh_token
      );

      expect(result).toEqual(authResponse);
    });

    it('リフレッシュトークンフローが正常に動作する', async () => {
      const refreshResponse: AuthResponse = {
        access_token: 'refreshed-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'refreshed-refresh-token'
      };

      // リフレッシュトークンリクエストの成功をモック
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(refreshResponse)
      } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const refreshRequest = {
        grant_type: 'refresh_token' as const,
        refresh_token: mockConfig.refreshToken!,
        client_id: mockConfig.clientId!,
        client_secret: mockConfig.clientSecret!
      };

      const result = await client.refreshToken(refreshRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/oauth/v2/token`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          }),
          body: expect.stringContaining('grant_type=refresh_token')
        })
      );

      expect(result).toEqual(refreshResponse);
    });

    it('認証エラーレスポンスを適切にハンドリングする', async () => {
      const errorResponse = {
        error: 'invalid_grant',
        error_description: 'Invalid username and password combination'
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(errorResponse)
      } as any);

      const credentials = {
        grant_type: 'password' as const,
        client_id: mockConfig.clientId!,
        client_secret: mockConfig.clientSecret!,
        username: 'invalid-user',
        password: 'invalid-password'
      };

      await expect(client.authenticate(credentials)).rejects.toThrow('認証に失敗しました');
    });
  });

  describe('エントリ管理統合テスト', () => {
    beforeEach(() => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(true);
    });

    it('エントリ作成の完全なフローが正常に動作する', async () => {
      const entryRequest: CreateEntryRequest = {
        url: 'https://example.com/article-123',
        title: 'Integration Test Article',
        tags: 'test,integration,wallabag'
      };

      const entryResponse: EntryResponse = {
        id: 456,
        url: entryRequest.url,
        title: entryRequest.title!,
        content: 'This is the content of the integration test article...',
        created_at: '2025-08-03T15:30:00Z',
        updated_at: '2025-08-03T15:30:00Z',
        starred: false,
        archived: false,
        tags: [
          { id: 1, label: 'test' },
          { id: 2, label: 'integration' },
          { id: 3, label: 'wallabag' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(entryResponse)
      } as any);

      const result = await client.createEntry(entryRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/entries.json`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockConfig.accessToken}`,
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(entryRequest)
        })
      );

      expect(result).toEqual(entryResponse);
    });

    it('エントリ一覧取得が正常に動作する', async () => {
      const entriesResponse: EntriesResponse = {
        page: 1,
        limit: 30,
        pages: 2,
        total: 45,
        _embedded: {
          items: [
            {
              id: 1,
              url: 'https://example.com/article-1',
              title: 'Article 1',
              content: 'Content of article 1',
              created_at: '2025-08-03T10:00:00Z',
              updated_at: '2025-08-03T10:00:00Z',
              starred: false,
              archived: false,
              tags: []
            },
            {
              id: 2,
              url: 'https://example.com/article-2',
              title: 'Article 2',
              content: 'Content of article 2',
              created_at: '2025-08-03T11:00:00Z',
              updated_at: '2025-08-03T11:00:00Z',
              starred: true,
              archived: false,
              tags: [{ id: 1, label: 'favorite' }]
            }
          ]
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(entriesResponse)
      } as any);

      const params = {
        page: 1,
        perPage: 30,
        starred: false
      };

      const result = await client.getEntries(params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/entries.json?starred=false&page=1&perPage=30'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockConfig.accessToken}`
          })
        })
      );

      expect(result).toEqual(entriesResponse);
    });

    it('特定エントリの取得が正常に動作する', async () => {
      const entryId = 789;
      const entryResponse: EntryResponse = {
        id: entryId,
        url: 'https://example.com/specific-article',
        title: 'Specific Article for Integration Test',
        content: 'Full content of the specific article...',
        created_at: '2025-08-03T12:00:00Z',
        updated_at: '2025-08-03T12:00:00Z',
        starred: true,
        archived: false,
        tags: [
          { id: 5, label: 'important' },
          { id: 6, label: 'reference' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(entryResponse)
      } as any);

      const result = await client.getEntry(entryId);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/entries/${entryId}.json`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockConfig.accessToken}`
          })
        })
      );

      expect(result).toEqual(entryResponse);
    });
  });

  describe('自動認証統合テスト', () => {
    it('期限切れトークンの自動リフレッシュが動作する', async () => {
      // 最初は期限切れトークン
      const expiredConfig = {
        ...mockConfig,
        accessToken: 'expired-token'
      };

      mockConfigManager.getConfig.mockResolvedValue(expiredConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(false);

      // リフレッシュトークンの成功
      const refreshResponse: AuthResponse = {
        access_token: 'new-fresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'new-refresh-token'
      };

      // エントリ作成の成功
      const entryResponse: EntryResponse = {
        id: 999,
        url: 'https://example.com/test-auto-refresh',
        title: 'Auto Refresh Test',
        content: 'Content...',
        created_at: '2025-08-03T16:00:00Z',
        updated_at: '2025-08-03T16:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      mockFetch
        // リフレッシュトークンリクエスト
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(refreshResponse)
        } as any)
        // エントリ作成リクエスト
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse)
        } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const entryRequest = {
        url: 'https://example.com/test-auto-refresh',
        title: 'Auto Refresh Test'
      };

      const result = await client.createEntry(entryRequest);

      // リフレッシュとエントリ作成の両方が呼ばれることを確認
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // リフレッシュトークンが保存されることを確認
      expect(mockConfigManager.saveTokens).toHaveBeenCalledWith(
        refreshResponse.access_token,
        refreshResponse.expires_in,
        refreshResponse.refresh_token
      );

      expect(result).toEqual(entryResponse);
    });

    it('リフレッシュトークンも無効な場合の再認証が動作する', async () => {
      const configWithInvalidTokens = {
        ...mockConfig,
        accessToken: 'expired-token',
        refreshToken: 'invalid-refresh-token'
      };

      mockConfigManager.getConfig.mockResolvedValue(configWithInvalidTokens);
      mockConfigManager.isTokenValid.mockResolvedValue(false);

      // リフレッシュトークンの失敗
      const refreshError = {
        error: 'invalid_grant',
        error_description: 'The refresh token is invalid'
      };

      // 再認証の成功
      const authResponse: AuthResponse = {
        access_token: 'new-auth-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'new-auth-refresh'
      };

      // エントリ作成の成功
      const entryResponse: EntryResponse = {
        id: 888,
        url: 'https://example.com/test-reauth',
        title: 'Re-auth Test',
        content: 'Content...',
        created_at: '2025-08-03T17:00:00Z',
        updated_at: '2025-08-03T17:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      mockFetch
        // リフレッシュトークンリクエスト（失敗）
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(refreshError)
        } as any)
        // 再認証リクエスト（成功）
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(authResponse)
        } as any)
        // エントリ作成リクエスト（成功）
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse)
        } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const entryRequest = {
        url: 'https://example.com/test-reauth',
        title: 'Re-auth Test'
      };

      const result = await client.createEntry(entryRequest);

      // リフレッシュ、再認証、エントリ作成の全てが呼ばれることを確認
      expect(mockFetch).toHaveBeenCalledTimes(3);

      expect(result).toEqual(entryResponse);
    });
  });

  describe('エラーハンドリング統合テスト', () => {
    beforeEach(() => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(true);
    });

    it('ネットワークエラーでのリトライ機能が動作する', async () => {
      const entryResponse: EntryResponse = {
        id: 777,
        url: 'https://example.com/retry-test',
        title: 'Retry Test',
        content: 'Content...',
        created_at: '2025-08-03T18:00:00Z',
        updated_at: '2025-08-03T18:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      // 最初の2回は失敗、3回目は成功
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse)
        } as any);

      // delay関数をモック
      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const entryRequest = {
        url: 'https://example.com/retry-test',
        title: 'Retry Test'
      };

      const result = await client.createEntry(entryRequest);

      // 3回のリクエストが実行されることを確認
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual(entryResponse);
    });

    it('HTTP 500エラーでのリトライが動作する', async () => {
      const entryResponse: EntryResponse = {
        id: 666,
        url: 'https://example.com/server-error-test',
        title: 'Server Error Test',
        content: 'Content...',
        created_at: '2025-08-03T19:00:00Z',
        updated_at: '2025-08-03T19:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

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
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse)
        } as any);

      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const result = await client.createEntry({
        url: 'https://example.com/server-error-test',
        title: 'Server Error Test'
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(entryResponse);
    });

    it('HTTP 429 (Rate Limit)エラーでのリトライが動作する', async () => {
      const entryResponse: EntryResponse = {
        id: 555,
        url: 'https://example.com/rate-limit-test',
        title: 'Rate Limit Test',
        content: 'Content...',
        created_at: '2025-08-03T20:00:00Z',
        updated_at: '2025-08-03T20:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 
            'content-type': 'application/json',
            'retry-after': '60'
          }),
          json: jest.fn().mockResolvedValue({
            error: 'rate_limit_exceeded',
            error_description: 'Too many requests'
          })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse)
        } as any);

      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const result = await client.createEntry({
        url: 'https://example.com/rate-limit-test',
        title: 'Rate Limit Test'
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(entryResponse);
    });

    it('HTTP 400エラーでリトライしないことを確認', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({
          error: 'invalid_request',
          error_description: 'URL is required'
        })
      } as any);

      await expect(
        client.createEntry({ url: '' })
      ).rejects.toThrow('エントリの作成に失敗しました');

      // リトライせずに1回のみ呼び出されることを確認
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('統合ヘルパー関数テスト', () => {
    it('createWallabagClient が正常に動作する', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      const client = await createWallabagClient();

      expect(client).toBeInstanceOf(WallabagApiClient);
      expect(client['baseUrl']).toBe(mockConfig.serverUrl);
    });

    it('createWallabagClient でサーバーURL未設定時にエラーを投げる', async () => {
      const incompleteConfig = {
        ...mockConfig,
        serverUrl: ''
      };

      mockConfigManager.getConfig.mockResolvedValue(incompleteConfig);

      await expect(createWallabagClient()).rejects.toThrow('Wallabagサーバーが設定されていません');
    });

    it('savePage ヘルパー関数が正常に動作する', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      const entryResponse: EntryResponse = {
        id: 444,
        url: 'https://example.com/helper-test',
        title: 'Helper Test',
        content: 'Content...',
        created_at: '2025-08-03T21:00:00Z',
        updated_at: '2025-08-03T21:00:00Z',
        starred: false,
        archived: false,
        tags: [{ id: 7, label: 'helper' }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(entryResponse)
      } as any);

      const result = await savePage(
        'https://example.com/helper-test',
        'Helper Test',
        'helper'
      );

      expect(result).toEqual(entryResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockConfig.serverUrl}/api/entries.json`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            url: 'https://example.com/helper-test',
            title: 'Helper Test',
            tags: 'helper'
          })
        })
      );
    });
  });

  describe('接続テスト統合', () => {
    it('testConnection が正常に動作する', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      const authResponse: AuthResponse = {
        access_token: 'test-connection-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'test-connection-refresh'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(authResponse)
      } as any);

      mockConfigManager.saveTokens.mockResolvedValue();

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/oauth/v2/token`,
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('testConnection で認証失敗時にfalseを返す', async () => {
      const incompleteConfig = {
        ...mockConfig,
        password: ''
      };

      mockConfigManager.getConfig.mockResolvedValue(incompleteConfig);

      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    it('testConnection でAPI エラー時にfalseを返す', async () => {
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({
          error: 'invalid_client'
        })
      } as any);

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });
});