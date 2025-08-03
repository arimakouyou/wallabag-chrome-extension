/**
 * Background Service Worker 単体テスト
 * メッセージハンドリング、イベント処理の全機能をテスト
 */

import {
    ExtensionMessage,
  MessageType,
  PageInfo,
  SaveResult,
  Config,
  ContextMenuItem
} from '../../src/lib/types';
} from '../../src/lib/types';

// モジュールのモック
jest.mock('../../src/lib/config-manager', () => ({
  ConfigManager: {
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    isConfigured: jest.fn(),
    hasAuthCredentials: jest.fn(),
    isTokenValid: jest.fn(),
    addConfigChangeListener: jest.fn(),
  },
}));

jest.mock('../../src/lib/wallabag-api', () => ({
  createWallabagClient: jest.fn(),
  savePage: jest.fn(),
}));

import { ConfigManager } from '../../src/lib/config-manager';
import { createWallabagClient, savePage } from '../../src/lib/wallabag-api';

const mockConfigManager = ConfigManager as jest.Mocked<typeof ConfigManager>;
const mockCreateWallabagClient = createWallabagClient as jest.MockedFunction<typeof createWallabagClient>;
const mockSavePage = savePage as jest.MockedFunction<typeof savePage>;

// BackgroundServiceを直接インポート（テスト用エクスポートがある場合）
// 実際のファイルではmodule.exportsでエクスポートされている
const BackgroundService = require('../../src/background/background').BackgroundService;

describe('BackgroundService', () => {
  let backgroundService: any;
  let mockChrome: any;

  beforeEach(() => {
    // Chrome APIのモック
    mockChrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(),
        },
        onStartup: {
          addListener: jest.fn(),
        },
        onInstalled: {
          addListener: jest.fn(),
        },
        getURL: jest.fn(),
      },
      action: {
        onClicked: {
          addListener: jest.fn(),
        },
        setIcon: jest.fn(),
        setTitle: jest.fn(),
      },
      contextMenus: {
        onClicked: {
          addListener: jest.fn(),
        },
        removeAll: jest.fn(),
        create: jest.fn(),
      },
      tabs: {
        onUpdated: {
          addListener: jest.fn(),
        },
        sendMessage: jest.fn(),
        create: jest.fn(),
      },
      notifications: {
        create: jest.fn(),
      },
    };

    global.chrome = mockChrome;

    backgroundService = new BackgroundService();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('正常に初期化を実行する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      await backgroundService.initialize();

      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(mockChrome.action.onClicked.addListener).toHaveBeenCalled();
      expect(mockChrome.contextMenus.onClicked.addListener).toHaveBeenCalled();
      expect(mockChrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(mockConfigManager.addConfigChangeListener).toHaveBeenCalled();
      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(mockChrome.action.setIcon).toHaveBeenCalled();
      expect(mockChrome.action.setTitle).toHaveBeenCalled();
    });

    it('重複初期化を防ぐ', async () => {
      await backgroundService.initialize();
      await backgroundService.initialize();

      // 最初の初期化のみ実行される
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    });

    it('初期化エラーをハンドリングする', async () => {
      mockChrome.contextMenus.removeAll.mockRejectedValue(new Error('Context menu error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await backgroundService.initialize();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Background Service の初期化に失敗しました:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('handleMessage', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    describe('SAVE_PAGE', () => {
      const pageInfo: PageInfo = {
        url: 'https://example.com/article',
        title: 'Test Article'
      };

      it('正常にページを保存する', async () => {
        mockConfigManager.isConfigured.mockResolvedValue(true);
        mockSavePage.mockResolvedValue({
          id: 123,
          url: pageInfo.url,
          title: pageInfo.title,
          content: 'Article content',
          created_at: '2025-08-03T10:00:00Z',
          updated_at: '2025-08-03T10:00:00Z',
          starred: false,
          archived: false,
          tags: []
        });

        const message: ExtensionMessage = {
          type: MessageType.SAVE_PAGE,
          payload: pageInfo
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.SAVE_PAGE_RESPONSE);
        expect((response.payload as SaveResult).success).toBe(true);
        expect((response.payload as SaveResult).entryId).toBe(123);
        expect(mockChrome.notifications.create).toHaveBeenCalledWith({
          type: 'basic',
          iconUrl: '/assets/icons/icon-48.png',
          title: '保存完了',
          message: 'ページがWallabagに保存されました'
        });
      });

      it('未設定時にエラーを返す', async () => {
        mockConfigManager.isConfigured.mockResolvedValue(false);

        const message: ExtensionMessage = {
          type: MessageType.SAVE_PAGE,
          payload: pageInfo
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.SAVE_PAGE_RESPONSE);
        expect((response.payload as SaveResult).success).toBe(false);
        expect((response.payload as SaveResult).message).toContain('設定が完了していません');
      });

      it('API エラーをハンドリングする', async () => {
        mockConfigManager.isConfigured.mockResolvedValue(true);
        mockSavePage.mockRejectedValue(new Error('API Error'));

        const message: ExtensionMessage = {
          type: MessageType.SAVE_PAGE,
          payload: pageInfo
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.SAVE_PAGE_RESPONSE);
        expect((response.payload as SaveResult).success).toBe(false);
        expect((response.payload as SaveResult).message).toBe('API Error');
      });
    });

    describe('GET_CONFIG', () => {
      it('正常に設定を取得する', async () => {
        const mockConfig: Partial<Config> = {
          serverUrl: 'https://wallabag.example.com',
          clientId: 'test-client'
        };

        mockConfigManager.getConfig.mockResolvedValue(mockConfig);

        const message: ExtensionMessage = {
          type: MessageType.GET_CONFIG,
          payload: {}
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.CONFIG_RESPONSE);
        expect(response.payload).toEqual(mockConfig);
      });
    });

    describe('SET_CONFIG', () => {
      it('正常に設定を保存する', async () => {
        const config: Partial<Config> = {
          serverUrl: 'https://wallabag.example.com',
          clientId: 'test-client'
        };

        mockConfigManager.setConfig.mockResolvedValue();

        const message: ExtensionMessage = {
          type: MessageType.SET_CONFIG,
          payload: config
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.CONFIG_RESPONSE);
        expect(response.payload).toEqual({ success: true });
        expect(mockConfigManager.setConfig).toHaveBeenCalledWith(config);
      });

      it('設定保存エラーをハンドリングする', async () => {
        const config: Partial<Config> = {
          serverUrl: 'invalid-url'
        };

        mockConfigManager.setConfig.mockRejectedValue(new Error('Invalid configuration'));

        const message: ExtensionMessage = {
          type: MessageType.SET_CONFIG,
          payload: config
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.CONFIG_RESPONSE);
        expect(response.payload).toEqual({
          success: false,
          error: 'Invalid configuration'
        });
      });
    });

    describe('CHECK_AUTH', () => {
      it('認証状態を正常に返す', async () => {
        mockConfigManager.isConfigured.mockResolvedValue(true);
        mockConfigManager.hasAuthCredentials.mockResolvedValue(true);
        mockConfigManager.isTokenValid.mockResolvedValue(true);

        const message: ExtensionMessage = {
          type: MessageType.CHECK_AUTH,
          payload: {}
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.AUTH_RESPONSE);
        expect(response.payload).toEqual({
          isConfigured: true,
          hasCredentials: true,
          isTokenValid: true,
          isAuthenticated: true
        });
      });

      it('認証エラーをハンドリングする', async () => {
        mockConfigManager.isConfigured.mockRejectedValue(new Error('Config error'));

        const message: ExtensionMessage = {
          type: MessageType.CHECK_AUTH,
          payload: {}
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.AUTH_RESPONSE);
        expect(response.payload).toEqual({
          isConfigured: false,
          hasCredentials: false,
          isTokenValid: false,
          isAuthenticated: false,
          error: 'Config error'
        });
      });
    });

    describe('REFRESH_TOKEN', () => {
      it('正常にトークンを更新する', async () => {
        const mockClient = {
          refreshToken: jest.fn().mockResolvedValue({
            access_token: 'new-token',
            expires_in: 3600,
            refresh_token: 'new-refresh-token'
          })
        };

        const config: Partial<Config> = {
          refreshToken: 'valid-refresh-token',
          clientId: 'test-client',
          clientSecret: 'test-secret'
        };

        mockCreateWallabagClient.mockResolvedValue(mockClient as any);
        mockConfigManager.getConfig.mockResolvedValue(config);

        const message: ExtensionMessage = {
          type: MessageType.REFRESH_TOKEN,
          payload: {}
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.AUTH_RESPONSE);
        expect(response.payload).toEqual({ success: true });
        expect(mockClient.refreshToken).toHaveBeenCalledWith({
          grant_type: 'refresh_token',
          refresh_token: config.refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret
        });
      });

      it('リフレッシュトークン不足時にエラーを返す', async () => {
        const config: Partial<Config> = {
          clientId: 'test-client'
          // refreshToken, clientSecretが不足
        };

        mockCreateWallabagClient.mockResolvedValue({} as any);
        mockConfigManager.getConfig.mockResolvedValue(config);

        const message: ExtensionMessage = {
          type: MessageType.REFRESH_TOKEN,
          payload: {}
        };

        const response = await backgroundService['handleMessage'](message, { tab: { id: 1 } });

        expect(response.type).toBe(MessageType.AUTH_RESPONSE);
        expect(response.payload).toEqual({
          success: false,
          error: 'リフレッシュトークンまたは認証情報が不足しています'
        });
      });
    });

    describe('GET_PAGE_INFO', () => {
      it('Content Scriptからページ情報を取得する', async () => {
        const expectedPageInfo: PageInfo = {
          url: 'https://example.com',
          title: 'Example Page',
          description: 'Example description',
          favicon: 'https://example.com/favicon.ico'
        };

        mockChrome.tabs.sendMessage.mockResolvedValue({
          payload: expectedPageInfo
        });

        const message: ExtensionMessage = {
          type: MessageType.GET_PAGE_INFO,
          payload: {}
        };

        const response = await backgroundService['handleMessage'](
          message,
          { tab: { id: 1, url: 'https://example.com', title: 'Example Page' } }
        );

        expect(response.type).toBe(MessageType.PAGE_INFO_RESPONSE);
        expect(response.payload).toEqual(expectedPageInfo);
        expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
          type: MessageType.GET_PAGE_INFO
        });
      });

      it('Content Script不在時に基本情報を返す', async () => {
        mockChrome.tabs.sendMessage.mockRejectedValue(new Error('Content script not available'));

        const message: ExtensionMessage = {
          type: MessageType.GET_PAGE_INFO,
          payload: {}
        };

        const response = await backgroundService['handleMessage'](
          message,
          { tab: { id: 1, url: 'https://example.com', title: 'Example Page' } }
        );

        expect(response.type).toBe(MessageType.PAGE_INFO_RESPONSE);
        expect(response.payload).toEqual({
          url: 'https://example.com',
          title: 'Example Page'
        });
      });

      it('タブ情報不在時にエラーを投げる', async () => {
        const message: ExtensionMessage = {
          type: MessageType.GET_PAGE_INFO,
          payload: {}
        };

        await expect(
          backgroundService['handleMessage'](message, {})
        ).rejects.toThrow('タブ情報が取得できません');
      });
    });

    it('未知のメッセージタイプでエラーを投げる', async () => {
      const message: ExtensionMessage = {
        type: 'UNKNOWN_TYPE' as MessageType,
        payload: {}
      };

      await expect(
        backgroundService['handleMessage'](message, { tab: { id: 1 } })
      ).rejects.toThrow('未知のメッセージタイプ: UNKNOWN_TYPE');
    });
  });

  describe('handleActionClick', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it('正常にページを保存する', async () => {
      const tab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example Page'
      };

      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockSavePage.mockResolvedValue({
        id: 123,
        url: tab.url,
        title: tab.title,
        content: 'Content',
        created_at: '2025-08-03T10:00:00Z',
        updated_at: '2025-08-03T10:00:00Z',
        starred: false,
        archived: false,
        tags: []
      });

      await backgroundService['handleActionClick'](tab);

      expect(mockSavePage).toHaveBeenCalledWith(tab.url, tab.title);
      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: '保存完了',
        message: 'ページがWallabagに保存されました'
      });
    });

    it('URL不在時にエラー通知を表示する', async () => {
      const tab = { id: 1 };

      await backgroundService['handleActionClick'](tab);

      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: 'エラー',
        message: '現在のページを取得できません'
      });
    });

    it('保存失敗時にエラー通知を表示する', async () => {
      const tab = {
        id: 1,
        url: 'https://example.com',
        title: 'Example Page'
      };

      mockConfigManager.isConfigured.mockResolvedValue(false);

      await backgroundService['handleActionClick'](tab);

      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: 'エラー',
        message: '設定が完了していません。オプションページで設定を行ってください。'
      });
    });
  });

  describe('setupContextMenus', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it('設定済みの場合にコンテキストメニューを作成する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(true);

      await backgroundService['setupContextMenus']();

      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(mockChrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'save-to-wallabag',
        title: 'Wallabagに保存',
        contexts: ['page', 'link', 'selection']
      });
    });

    it('未設定の場合にコンテキストメニューを作成しない', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(false);

      await backgroundService['setupContextMenus']();

      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(mockChrome.contextMenus.create).not.toHaveBeenCalled();
    });

    it('エラーをハンドリングする', async () => {
      mockChrome.contextMenus.removeAll.mockRejectedValue(new Error('Context menu error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await backgroundService['setupContextMenus']();

      expect(consoleSpy).toHaveBeenCalledWith(
        'コンテキストメニューの設定に失敗しました:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('updateExtensionIcon', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it('設定済み・認証済みの場合に通常アイコンを設定する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      await backgroundService['updateExtensionIcon']();

      expect(mockChrome.action.setIcon).toHaveBeenCalledWith({
        path: '/assets/icons/icon.png'
      });
      expect(mockChrome.action.setTitle).toHaveBeenCalledWith({
        title: 'Wallabag (ページを保存)'
      });
    });

    it('未設定の場合に無効アイコンを設定する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(false);

      await backgroundService['updateExtensionIcon']();

      expect(mockChrome.action.setIcon).toHaveBeenCalledWith({
        path: '/assets/icons/icon-disabled.png'
      });
      expect(mockChrome.action.setTitle).toHaveBeenCalledWith({
        title: 'Wallabag (設定が必要)'
      });
    });

    it('設定済み・認証未完了の場合に警告アイコンを設定する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockConfigManager.isTokenValid.mockResolvedValue(false);

      await backgroundService['updateExtensionIcon']();

      expect(mockChrome.action.setIcon).toHaveBeenCalledWith({
        path: '/assets/icons/icon-warning.png'
      });
      expect(mockChrome.action.setTitle).toHaveBeenCalledWith({
        title: 'Wallabag (認証が必要)'
      });
    });

    it('エラーをハンドリングする', async () => {
      mockConfigManager.isConfigured.mockRejectedValue(new Error('Config error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await backgroundService['updateExtensionIcon']();

      expect(consoleSpy).toHaveBeenCalledWith(
        'アイコンの更新に失敗しました:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('showNotification', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it('正常に通知を表示する', async () => {
      await backgroundService['showNotification']('テストタイトル', 'テストメッセージ');

      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: 'テストタイトル',
        message: 'テストメッセージ'
      });
    });

    it('通知エラーをハンドリングする', async () => {
      mockChrome.notifications.create.mockRejectedValue(new Error('Notification error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await backgroundService['showNotification']('テスト', 'メッセージ');

      expect(consoleSpy).toHaveBeenCalledWith(
        '通知の表示に失敗しました:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});