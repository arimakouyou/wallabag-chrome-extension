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
  
  beforeEach(() => {
    client = new WallabagApiClient(baseUrl);
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('正しくベースURLを設定する', () => {
      // eslint-disable-next-line @typescript-eslint/dot-notation
      expect(client['baseUrl']).toBe(baseUrl);
    });

    it('末尾のスラッシュを除去する', () => {
      const clientWithSlash = new WallabagApiClient('https://example.com/');
      // eslint-disable-next-line @typescript-eslint/dot-notation
      expect(clientWithSlash['baseUrl']).toBe('https://example.com');
    });
  });

  describe('authenticate', () => {
    const credentials: AuthCredentials = {
      grant_type: 'password',
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      username: 'testuser',
      password: 'testpassword',
    };
    const authResponse: AuthResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'read write'
    };

    it('認証に成功し、トークンを返す', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authResponse),
      } as Response);

      const result = await client.authenticate(credentials);
      expect(result).toEqual(authResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/oauth/v2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(credentials as unknown as Record<string, string>).toString(),
      });
    });

    it('認証に失敗した場合、エラーをスローする', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: () => Promise.resolve({ error: 'invalid_grant' }),
          } as Response);
    
          await expect(client.authenticate(credentials)).rejects.toThrow(
            '認証に失敗しました'
          );
    });
  });

  describe('refreshToken', () => {
    const refreshRequest: RefreshTokenRequest = {
        grant_type: 'refresh_token',
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        refresh_token: 'test-refresh-token',
    };
    const authResponse: AuthResponse = {
      access_token: 'refreshed-access-token',
      refresh_token: 'refreshed-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'read write'
    };

    it('トークンのリフレッシュに成功する', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authResponse),
      } as Response);

      const result = await client.refreshToken(refreshRequest);
      expect(result).toEqual(authResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(refreshRequest as unknown as Record<string, string>).toString(),
      });
    });
  });

  describe('API calls with token', () => {
    const mockAccessToken = 'test-access-token';
    
    beforeEach(async () => {
        (mockConfigManager.getConfig as jest.Mock).mockResolvedValue({ accessToken: mockAccessToken });
        (mockConfigManager.isTokenValid as jest.Mock).mockResolvedValue(true);
        // getValidAccessTokenをモック化
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.spyOn(WallabagApiClient.prototype as any, 'getValidAccessToken').mockResolvedValue(mockAccessToken);
    });

    describe('createEntry', () => {
        const entryRequest: CreateEntryRequest = {
          url: 'https://example.com/article',
          tags: 'test, article',
        };
        const entryResponse: EntryResponse = {
          id: 123,
          title: 'Test Article',
          url: 'https://example.com/article',
          tags: [{id: 1, label: 'test'}, {id: 2, label: 'article'}],
          archived: false,
          starred: false,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          content: '<p>Article content</p>',
        };
    
        it('エントリの作成に成功する', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(entryResponse),
          } as Response);
    
          const result = await client.createEntry(entryRequest);
          expect(result).toEqual(entryResponse);
          expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/api/entries.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mockAccessToken}`,
            },
            body: JSON.stringify(entryRequest),
          });
        });
      });
    
      describe('getEntries', () => {
        const entriesResponse: EntriesResponse = {
          _embedded: {
            items: [],
          },
          page: 1,
          pages: 1,
          limit: 30,
          total: 0,
        };
    
        it('エントリリストの取得に成功する', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(entriesResponse),
          } as Response);
    
          const result = await client.getEntries({ perPage: 10 });
          expect(result).toEqual(entriesResponse);
          expect(mockFetch).toHaveBeenCalledWith(
            `${baseUrl}/api/entries.json?perPage=10`,
            expect.objectContaining({
              headers: {
                Authorization: `Bearer ${mockAccessToken}`,
              },
            })
          );
        });
      });
  })
});

describe('createWallabagClient', () => {
    const mockConfig: Config = {
        serverUrl: 'https://wallabag.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        username: 'testuser',
        password: 'testpass',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenExpiresAt: Date.now() + 3600000
      };

    beforeEach(() => {
      jest.clearAllMocks();
      mockFetch.mockClear();
      (mockConfigManager.getConfig as jest.Mock).mockResolvedValue(mockConfig);
    });
  
    it('設定からクライアントを正常に作成する', async () => {
      const client = await createWallabagClient();
      expect(client).toBeInstanceOf(WallabagApiClient);
      // eslint-disable-next-line @typescript-eslint/dot-notation
      expect(client['baseUrl']).toBe(mockConfig.serverUrl);
    });
  
    it('設定が存在しない場合、エラーをスローする', async () => {
      (mockConfigManager.getConfig as jest.Mock).mockResolvedValueOnce({ serverUrl: '' });
      await expect(createWallabagClient()).rejects.toThrow('Wallabagサーバーが設定されていません');
    });
});

describe('savePage', () => {
    const pageInfo: CreateEntryRequest = {
      url: 'https://example.com/page-to-save',
      title: 'Page Title',
    };
    const mockConfig: Config = {
        serverUrl: 'https://wallabag.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        username: 'testuser',
        password: 'testpass',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenExpiresAt: Date.now() + 3600000
      };
  
    beforeEach(() => {
      jest.clearAllMocks();
      mockFetch.mockClear();
      (mockConfigManager.getConfig as jest.Mock).mockResolvedValue(mockConfig);
      (mockConfigManager.isTokenValid as jest.Mock).mockResolvedValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(WallabagApiClient.prototype as any, 'getValidAccessToken').mockResolvedValue('test-access-token');
    });
  
    it('ページの保存に成功する', async () => {
      const entryResponse: EntryResponse = {
        id: 456,
        title: 'Page Title',
        url: 'https://example.com/page-to-save',
        tags: [],
        archived: false,
        starred: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        content: '<p>Article content</p>',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(entryResponse),
      } as Response);
  
      const result = await savePage(pageInfo.url, pageInfo.title);
      expect(result).toEqual(entryResponse);
    });
  
    it('ページの保存に失敗した場合、エラーをスローする', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ error: 'Server is down' }),
          } as Response);
  
      await expect(savePage(pageInfo.url, pageInfo.title)).rejects.toThrow('エントリの作成に失敗しました');
    });
});