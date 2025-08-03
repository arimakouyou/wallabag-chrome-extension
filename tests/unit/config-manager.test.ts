/**
 * 設定管理システム単体テスト
 * ConfigManagerクラスの全機能をテスト
 */

import { ConfigManager } from '../../src/lib/config-manager';
import { Config } from '../../src/lib/types';

// Chrome Storage APIのモック
const mockStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
  onChanged: {
    addListener: jest.fn(),
  },
};

// global chromeオブジェクトのモック
global.chrome = {
  storage: mockStorage
} as any;

// btoa/atobのモック（Node.js環境用）
global.btoa = jest.fn((str: string) => Buffer.from(str).toString('base64'));
global.atob = jest.fn((str: string) => Buffer.from(str, 'base64').toString());

describe('ConfigManager', () => {
  const mockConfig: Config = {
    serverUrl: 'https://wallabag.example.com',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret-123456',
    username: 'testuser',
    password: 'testpassword',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    tokenExpiresAt: Math.floor(Date.now() / 1000) + 3600
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('getConfig', () => {
    it('正常に設定を取得する', async () => {
      const encryptedConfig = {
        serverUrl: mockConfig.serverUrl,
        clientId: mockConfig.clientId,
        clientSecret: 'encrypted-secret',
        username: mockConfig.username,
        password: 'encrypted-password',
        accessToken: 'encrypted-token',
        refreshToken: 'encrypted-refresh',
        tokenExpiresAt: mockConfig.tokenExpiresAt
      };

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: encryptedConfig
      });

      // atobをモックして復号化をシミュレート
      (global.atob as jest.Mock).mockImplementation((encoded: string) => {
        const mapping: Record<string, string> = {
          'encrypted-secret': mockConfig.clientSecret!,
          'encrypted-password': mockConfig.password!,
          'encrypted-token': mockConfig.accessToken!,
          'encrypted-refresh': mockConfig.refreshToken!
        };
        return mapping[encoded] || encoded;
      });

      const result = await ConfigManager.getConfig();

      expect(mockStorage.local.get).toHaveBeenCalledWith('wallabag_config');
      expect(result).toEqual(mockConfig);
    });

    it('設定が存在しない場合に空オブジェクトを返す', async () => {
      mockStorage.local.get.mockResolvedValue({});

      const result = await ConfigManager.getConfig();

      expect(result).toEqual({});
    });

    it('Storage APIエラー時に空オブジェクトを返す', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await ConfigManager.getConfig();

      expect(result).toEqual({});
    });

    it('復号化エラー時に元の値を保持する', async () => {
      const configWithInvalidEncryption = {
        serverUrl: mockConfig.serverUrl,
        password: 'invalid-base64!'
      };

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: configWithInvalidEncryption
      });

      (global.atob as jest.Mock).mockImplementation((str: string) => {
        if (str === 'invalid-base64!') {
          throw new Error('Invalid character');
        }
        return str;
      });

      const result = await ConfigManager.getConfig();

      expect(result.serverUrl).toBe(mockConfig.serverUrl);
      expect(result.password).toBe('invalid-base64!'); // 復号化失敗時は元の値を保持
    });
  });

  describe('setConfig', () => {
    it('正常に設定を保存する', async () => {
      mockStorage.local.set.mockResolvedValue(undefined);

      // btoaをモックして暗号化をシミュレート
      (global.btoa as jest.Mock).mockImplementation((str: string) => {
        return `encrypted-${str}`;
      });

      await ConfigManager.setConfig(mockConfig);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        wallabag_config: expect.objectContaining({
          serverUrl: mockConfig.serverUrl,
          clientId: mockConfig.clientId,
          clientSecret: 'encrypted-test-client-secret-123456',
          username: mockConfig.username,
          password: 'encrypted-testpassword',
          accessToken: 'encrypted-test-access-token',
          refreshToken: 'encrypted-test-refresh-token',
          tokenExpiresAt: mockConfig.tokenExpiresAt
        })
      });
    });

    it('Storage APIエラー時にエラーを投げる', async () => {
      mockStorage.local.set.mockRejectedValue(new Error('Storage error'));

      await expect(ConfigManager.setConfig(mockConfig)).rejects.toThrow('設定の保存に失敗しました');
    });
  });

  describe('updateConfig', () => {
    it('正常に設定を部分更新する', async () => {
      const currentConfig = {
        serverUrl: mockConfig.serverUrl,
        clientId: mockConfig.clientId
      };

      const updates = {
        username: 'newuser',
        password: 'newpassword'
      };

      // getConfigのモック
      mockStorage.local.get.mockResolvedValue({
        wallabag_config: currentConfig
      });

      // setConfigのモック
      mockStorage.local.set.mockResolvedValue(undefined);
      (global.btoa as jest.Mock).mockImplementation(str => `encrypted-${str}`);

      await ConfigManager.updateConfig(updates);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        wallabag_config: expect.objectContaining({
          serverUrl: mockConfig.serverUrl,
          clientId: mockConfig.clientId,
          username: 'newuser',
          password: 'encrypted-newpassword'
        })
      });
    });
  });

  describe('clearConfig', () => {
    it('正常に設定をクリアする', async () => {
      mockStorage.local.remove.mockResolvedValue(undefined);

      await ConfigManager.clearConfig();

      expect(mockStorage.local.remove).toHaveBeenCalledWith('wallabag_config');
    });

    it('Storage APIエラー時にエラーを投げる', async () => {
      mockStorage.local.remove.mockRejectedValue(new Error('Storage error'));

      await expect(ConfigManager.clearConfig()).rejects.toThrow('設定のクリアに失敗しました');
    });
  });

  describe('validateConfig', () => {
    it('有効な設定で成功を返す', () => {
      const result = ConfigManager.validateConfig(mockConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('必須フィールド不足時にエラーを返す', () => {
      const incompleteConfig: Partial<Config> = {
        serverUrl: mockConfig.serverUrl,
        clientId: mockConfig.clientId
        // clientSecret, username, passwordが不足
      };

      const result = ConfigManager.validateConfig(incompleteConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('クライアントシークレットは必須です');
      expect(result.errors).toContain('ユーザー名は必須です');
      expect(result.errors).toContain('パスワードは必須です');
    });

    it('空文字フィールドでエラーを返す', () => {
      const configWithEmptyFields: Partial<Config> = {
        serverUrl: '',
        clientId: '   ',
        clientSecret: mockConfig.clientSecret,
        username: mockConfig.username,
        password: mockConfig.password
      };

      const result = ConfigManager.validateConfig(configWithEmptyFields);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('サーバーURLは必須です');
      expect(result.errors).toContain('クライアントIDは必須です');
    });

    it('無効なURL形式でエラーを返す', () => {
      const configWithInvalidUrl: Partial<Config> = {
        ...mockConfig,
        serverUrl: 'invalid-url'
      };

      const result = ConfigManager.validateConfig(configWithInvalidUrl);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('サーバーURLの形式が正しくありません');
    });

    it('HTTP URLで警告を返す', () => {
      const configWithHttpUrl: Partial<Config> = {
        ...mockConfig,
        serverUrl: 'http://wallabag.example.com'
      };

      const result = ConfigManager.validateConfig(configWithHttpUrl);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('セキュリティのためHTTPSの使用を推奨します');
    });

    it('短いクライアントIDで警告を返す', () => {
      const configWithShortClientId: Partial<Config> = {
        ...mockConfig,
        clientId: 'short'
      };

      const result = ConfigManager.validateConfig(configWithShortClientId);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('クライアントIDが短すぎる可能性があります');
    });

    it('短いクライアントシークレットで警告を返す', () => {
      const configWithShortSecret: Partial<Config> = {
        ...mockConfig,
        clientSecret: 'short'
      };

      const result = ConfigManager.validateConfig(configWithShortSecret);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('クライアントシークレットが短すぎる可能性があります');
    });

    it('短いユーザー名でエラーを返す', () => {
      const configWithShortUsername: Partial<Config> = {
        ...mockConfig,
        username: 'ab'
      };

      const result = ConfigManager.validateConfig(configWithShortUsername);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ユーザー名は3文字以上で入力してください');
    });

    it('短いパスワードで警告を返す', () => {
      const configWithShortPassword: Partial<Config> = {
        ...mockConfig,
        password: '123'
      };

      const result = ConfigManager.validateConfig(configWithShortPassword);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('パスワードが短すぎる可能性があります');
    });
  });

  describe('isConfigured', () => {
    it('有効な設定でtrueを返す', async () => {
      mockStorage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });

      (global.atob as jest.Mock).mockImplementation(str => str.replace('encrypted-', ''));

      const result = await ConfigManager.isConfigured();

      expect(result).toBe(true);
    });

    it('無効な設定でfalseを返す', async () => {
      const incompleteConfig = {
        serverUrl: mockConfig.serverUrl
        // 他の必須フィールドが不足
      };

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: incompleteConfig
      });

      const result = await ConfigManager.isConfigured();

      expect(result).toBe(false);
    });
  });

  describe('hasAuthCredentials', () => {
    it('認証情報が完全な場合にtrueを返す', async () => {
      mockStorage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });

      (global.atob as jest.Mock).mockImplementation(str => str.replace('encrypted-', ''));

      const result = await ConfigManager.hasAuthCredentials();

      expect(result).toBe(true);
    });

    it('認証情報が不完全な場合にfalseを返す', async () => {
      const incompleteConfig = {
        serverUrl: mockConfig.serverUrl,
        clientId: mockConfig.clientId
        // clientSecret, username, passwordが不足
      };

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: incompleteConfig
      });

      const result = await ConfigManager.hasAuthCredentials();

      expect(result).toBe(false);
    });
  });

  describe('isTokenValid', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('有効なトークンでtrueを返す', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1時間後
      
      const configWithValidToken = {
        ...mockConfig,
        accessToken: 'valid-token',
        tokenExpiresAt: futureTime
      };

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: configWithValidToken
      });

      (global.atob as jest.Mock).mockImplementation(str => str.replace('encrypted-', ''));

      const result = await ConfigManager.isTokenValid();

      expect(result).toBe(true);
    });

    it('期限切れトークンでfalseを返す', async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1時間前
      
      const configWithExpiredToken = {
        ...mockConfig,
        accessToken: 'expired-token',
        tokenExpiresAt: pastTime
      };

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: configWithExpiredToken
      });

      (global.atob as jest.Mock).mockImplementation(str => str.replace('encrypted-', ''));

      const result = await ConfigManager.isTokenValid();

      expect(result).toBe(false);
    });

    it('マージン時間内の期限切れでfalseを返す', async () => {
      const nearFutureTime = Math.floor(Date.now() / 1000) + 200; // 200秒後（5分未満）
      
      const configWithSoonToExpireToken = {
        ...mockConfig,
        accessToken: 'soon-to-expire-token',
        tokenExpiresAt: nearFutureTime
      };

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: configWithSoonToExpireToken
      });

      (global.atob as jest.Mock).mockImplementation(str => str.replace('encrypted-', ''));

      const result = await ConfigManager.isTokenValid();

      expect(result).toBe(false);
    });

    it('トークンが存在しない場合にfalseを返す', async () => {
      const configWithoutToken = {
        serverUrl: mockConfig.serverUrl
        // accessToken, tokenExpiresAtが不足
      };

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: configWithoutToken
      });

      const result = await ConfigManager.isTokenValid();

      expect(result).toBe(false);
    });
  });

  describe('saveTokens', () => {
    it('正常にトークンを保存する', async () => {
      const currentTime = Date.now();
      jest.setSystemTime(currentTime);

      const accessToken = 'new-access-token';
      const expiresIn = 3600;
      const refreshToken = 'new-refresh-token';

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: { serverUrl: mockConfig.serverUrl }
      });
      
      mockStorage.local.set.mockResolvedValue(undefined);
      (global.btoa as jest.Mock).mockImplementation(str => `encrypted-${str}`);

      await ConfigManager.saveTokens(accessToken, expiresIn, refreshToken);

      const expectedExpiresAt = Math.floor(currentTime / 1000) + expiresIn;

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        wallabag_config: expect.objectContaining({
          serverUrl: mockConfig.serverUrl,
          accessToken: 'encrypted-new-access-token',
          refreshToken: 'encrypted-new-refresh-token',
          tokenExpiresAt: expectedExpiresAt
        })
      });
    });

    it('リフレッシュトークンなしでも正常に保存する', async () => {
      const accessToken = 'new-access-token';
      const expiresIn = 3600;

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: { serverUrl: mockConfig.serverUrl }
      });
      
      mockStorage.local.set.mockResolvedValue(undefined);
      (global.btoa as jest.Mock).mockImplementation(str => `encrypted-${str}`);

      await ConfigManager.saveTokens(accessToken, expiresIn);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        wallabag_config: expect.objectContaining({
          accessToken: 'encrypted-new-access-token'
        })
      });
    });
  });

  describe('clearTokens', () => {
    it('正常にトークンをクリアする', async () => {
      mockStorage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });
      
      mockStorage.local.set.mockResolvedValue(undefined);

      await ConfigManager.clearTokens();

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        wallabag_config: expect.objectContaining({
          accessToken: undefined,
          refreshToken: undefined,
          tokenExpiresAt: undefined
        })
      });
    });
  });

  describe('exportConfig', () => {
    it('機密情報を除いた設定をエクスポートする', async () => {
      mockStorage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });

      (global.atob as jest.Mock).mockImplementation(str => str.replace('encrypted-', ''));

      const result = await ConfigManager.exportConfig();

      expect(result).toEqual({
        serverUrl: mockConfig.serverUrl,
        clientId: mockConfig.clientId,
        username: mockConfig.username
      });

      // 機密情報が含まれていないことを確認
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('clientSecret');
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).not.toHaveProperty('tokenExpiresAt');
    });
  });

  describe('addConfigChangeListener', () => {
    it('設定変更リスナーを登録する', () => {
      const mockCallback = jest.fn();

      ConfigManager.addConfigChangeListener(mockCallback);

      expect(mockStorage.onChanged.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );

      // リスナー関数をテスト
      const listenerFunction = mockStorage.onChanged.addListener.mock.calls[0][0];
      
      // wallabag_config変更時
      const changes = {
        wallabag_config: {
          oldValue: { serverUrl: 'old-url' },
          newValue: { serverUrl: 'new-url' }
        }
      };

      listenerFunction(changes, 'local');

      expect(mockCallback).toHaveBeenCalledWith(changes.wallabag_config);
    });

    it('他のキーの変更では呼び出されない', () => {
      const mockCallback = jest.fn();

      ConfigManager.addConfigChangeListener(mockCallback);

      const listenerFunction = mockStorage.onChanged.addListener.mock.calls[0][0];
      
      // 他のキーの変更
      const changes = {
        other_config: {
          oldValue: 'old',
          newValue: 'new'
        }
      };

      listenerFunction(changes, 'local');

      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('sync storageの変更では呼び出されない', () => {
      const mockCallback = jest.fn();

      ConfigManager.addConfigChangeListener(mockCallback);

      const listenerFunction = mockStorage.onChanged.addListener.mock.calls[0][0];
      
      const changes = {
        wallabag_config: {
          oldValue: { serverUrl: 'old-url' },
          newValue: { serverUrl: 'new-url' }
        }
      };

      listenerFunction(changes, 'sync');

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('debugConfig', () => {
    it('機密情報をマスクして設定を表示する', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockStorage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });

      (global.atob as jest.Mock).mockImplementation(str => str.replace('encrypted-', ''));

      await ConfigManager.debugConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        '現在の設定:',
        expect.objectContaining({
          serverUrl: mockConfig.serverUrl,
          clientId: mockConfig.clientId,
          username: mockConfig.username,
          password: '************', // マスクされている
          clientSecret: expect.stringMatching(/^\*{8}.*$/), // 最初8文字がマスク
          accessToken: expect.stringMatching(/^.{8}\.\.\.$/), // 最初8文字のみ表示
          refreshToken: expect.stringMatching(/^.{8}\.\.\.$/), // 最初8文字のみ表示
        })
      );

      consoleSpy.mockRestore();
    });
  });
});