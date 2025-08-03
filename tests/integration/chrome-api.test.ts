/**
 * Chrome API 統合テスト
 * Chrome Extension APIとの統合機能をテスト
 */

import { ConfigManager } from '../../src/lib/config-manager';
import {
  Config,
  PageInfo,
  ExtensionMessage,
  MessageType,
  SaveResult
} from '../../src/lib/types';

describe('Chrome API 統合テスト', () => {
  let mockChrome: any;
  let mockConfig: Config;

  beforeEach(() => {
    // Chrome APIの完全なモック
    mockChrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
        sync: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
        onChanged: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
      },
      runtime: {
        onMessage: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
        onInstalled: {
          addListener: jest.fn(),
        },
        onStartup: {
          addListener: jest.fn(),
        },
        sendMessage: jest.fn(),
        getURL: jest.fn(),
        getManifest: jest.fn(),
        id: 'test-extension-id',
      },
      tabs: {
        query: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        sendMessage: jest.fn(),
        onUpdated: {
          addListener: jest.fn(),
        },
      },
      action: {
        onClicked: {
          addListener: jest.fn(),
        },
        setIcon: jest.fn(),
        setTitle: jest.fn(),
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn(),
      },
      contextMenus: {
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        removeAll: jest.fn(),
        onClicked: {
          addListener: jest.fn(),
        },
      },
      notifications: {
        create: jest.fn(),
        update: jest.fn(),
        clear: jest.fn(),
        getAll: jest.fn(),
        onClicked: {
          addListener: jest.fn(),
        },
      },
      permissions: {
        request: jest.fn(),
        contains: jest.fn(),
        remove: jest.fn(),
      },
      alarms: {
        create: jest.fn(),
        get: jest.fn(),
        getAll: jest.fn(),
        clear: jest.fn(),
        clearAll: jest.fn(),
        onAlarm: {
          addListener: jest.fn(),
        },
      },
    };

    global.chrome = mockChrome;

    mockConfig = {
      serverUrl: 'https://wallabag.test.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      username: 'testuser',
      password: 'testpassword',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      tokenExpiresAt: Math.floor(Date.now() / 1000) + 3600
    };

    jest.clearAllMocks();
  });

  describe('Chrome Storage API統合', () => {
    it('設定の保存と取得が正常に動作する', async () => {
      // 設定保存のモック
      mockChrome.storage.local.set.mockResolvedValue();
      
      // 設定取得のモック（暗号化された形で保存される）
      mockChrome.storage.local.get.mockResolvedValue({
        wallabag_config: {
          serverUrl: mockConfig.serverUrl,
          clientId: mockConfig.clientId,
          clientSecret: btoa(mockConfig.clientSecret!),
          username: mockConfig.username,
          password: btoa(mockConfig.password!),
          accessToken: btoa(mockConfig.accessToken!),
          refreshToken: btoa(mockConfig.refreshToken!),
          tokenExpiresAt: mockConfig.tokenExpiresAt
        }
      });

      // 設定保存
      await ConfigManager.setConfig(mockConfig);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        wallabag_config: expect.objectContaining({
          serverUrl: mockConfig.serverUrl,
          clientId: mockConfig.clientId,
          // 暗号化されたフィールドは直接比較しない
          username: mockConfig.username,
          tokenExpiresAt: mockConfig.tokenExpiresAt
        })
      });

      // 設定取得
      const retrievedConfig = await ConfigManager.getConfig();

      expect(retrievedConfig).toEqual(mockConfig);
    });

    it('Storage変更イベントが正常に処理される', async () => {
      const mockCallback = jest.fn();
      
      // 変更リスナーを登録
      ConfigManager.addConfigChangeListener(mockCallback);

      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalled();

      // リスナー関数を取得
      const listenerFunction = mockChrome.storage.onChanged.addListener.mock.calls[0][0];

      // ストレージ変更イベントをシミュレート
      const changes = {
        wallabag_config: {
          oldValue: { serverUrl: 'https://old.wallabag.com' },
          newValue: { serverUrl: 'https://new.wallabag.com' }
        }
      };

      listenerFunction(changes, 'local');

      expect(mockCallback).toHaveBeenCalledWith(changes.wallabag_config);
    });

    it('Storage API エラーが適切にハンドリングされる', async () => {
      mockChrome.storage.local.set.mockRejectedValue(new Error('Quota exceeded'));

      await expect(ConfigManager.setConfig(mockConfig)).rejects.toThrow('設定の保存に失敗しました');
    });

    it('Storage容量制限を考慮した設定管理', async () => {
      // 大きなデータを設定に含める
      const largeConfig = {
        ...mockConfig,
        largeData: 'x'.repeat(1000000) // 1MB のダミーデータ
      };

      mockChrome.storage.local.set.mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

      await expect(ConfigManager.setConfig(largeConfig)).rejects.toThrow('設定の保存に失敗しました');
    });
  });

  describe('Chrome Tabs API統合', () => {
    it('現在のタブ情報を正常に取得する', async () => {
      const mockTab = {
        id: 1,
        url: 'https://example.com/article',
        title: 'Test Article',
        active: true,
        windowId: 1
      };

      mockChrome.tabs.query.mockResolvedValue([mockTab]);

      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });

      expect(tabs).toEqual([mockTab]);
      expect(mockChrome.tabs.query).toHaveBeenCalledWith(
        { active: true, currentWindow: true },
        expect.any(Function)
      );
    });

    it('タブへのメッセージ送信が正常に動作する', async () => {
      const tabId = 1;
      const message: ExtensionMessage = {
        type: MessageType.GET_PAGE_INFO,
        payload: {}
      };

      const expectedResponse: PageInfo = {
        url: 'https://example.com',
        title: 'Example Page',
        description: 'Example description',
        favicon: 'https://example.com/favicon.ico'
      };

      mockChrome.tabs.sendMessage.mockResolvedValue(expectedResponse);

      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, resolve);
      });

      expect(response).toEqual(expectedResponse);
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        message,
        expect.any(Function)
      );
    });

    it('新しいタブの作成が正常に動作する', async () => {
      const url = 'https://wallabag.test.com/options';
      const mockNewTab = {
        id: 2,
        url,
        title: 'Wallabag Options',
        active: true
      };

      mockChrome.tabs.create.mockResolvedValue(mockNewTab);

      const newTab = await new Promise<chrome.tabs.Tab>((resolve) => {
        chrome.tabs.create({ url }, resolve);
      });

      expect(newTab).toEqual(mockNewTab);
      expect(mockChrome.tabs.create).toHaveBeenCalledWith(
        { url },
        expect.any(Function)
      );
    });

    it('タブ更新イベントが正常に処理される', () => {
      const mockListener = jest.fn();

      chrome.tabs.onUpdated.addListener(mockListener);

      expect(mockChrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(mockListener);

      // イベントハンドラーを取得してテスト
      const eventHandler = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      const tabId = 1;
      const changeInfo = { status: 'complete', url: 'https://example.com' };
      const tab = { id: tabId, url: 'https://example.com', title: 'Example' };

      eventHandler(tabId, changeInfo, tab);

      expect(mockListener).toHaveBeenCalledWith(tabId, changeInfo, tab);
    });
  });

  describe('Chrome Action API統合', () => {
    it('アクションアイコンの設定が正常に動作する', async () => {
      const iconPath = '/assets/icons/icon-48.png';

      await new Promise<void>((resolve) => {
        chrome.action.setIcon({ path: iconPath }, resolve);
      });

      expect(mockChrome.action.setIcon).toHaveBeenCalledWith(
        { path: iconPath },
        expect.any(Function)
      );
    });

    it('アクションタイトルの設定が正常に動作する', async () => {
      const title = 'Wallabag - Ready to save';

      await new Promise<void>((resolve) => {
        chrome.action.setTitle({ title }, resolve);
      });

      expect(mockChrome.action.setTitle).toHaveBeenCalledWith(
        { title },
        expect.any(Function)
      );
    });

    it('バッジテキストの設定が正常に動作する', async () => {
      const text = '5';

      await new Promise<void>((resolve) => {
        chrome.action.setBadgeText({ text }, resolve);
      });

      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith(
        { text },
        expect.any(Function)
      );
    });

    it('アクションクリックイベントが正常に処理される', () => {
      const mockListener = jest.fn();

      chrome.action.onClicked.addListener(mockListener);

      expect(mockChrome.action.onClicked.addListener).toHaveBeenCalledWith(mockListener);

      // イベントハンドラーをテスト
      const eventHandler = mockChrome.action.onClicked.addListener.mock.calls[0][0];
      const tab = { id: 1, url: 'https://example.com', title: 'Example' };

      eventHandler(tab);

      expect(mockListener).toHaveBeenCalledWith(tab);
    });
  });

  describe('Chrome ContextMenus API統合', () => {
    it('コンテキストメニューの作成が正常に動作する', () => {
      const menuItem = {
        id: 'save-to-wallabag',
        title: 'Wallabagに保存',
        contexts: ['page', 'link', 'selection'] as chrome.contextMenus.ContextType[]
      };

      chrome.contextMenus.create(menuItem);

      expect(mockChrome.contextMenus.create).toHaveBeenCalledWith(menuItem);
    });

    it('すべてのコンテキストメニューの削除が正常に動作する', async () => {
      await new Promise<void>((resolve) => {
        chrome.contextMenus.removeAll(resolve);
      });

      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalledWith(expect.any(Function));
    });

    it('コンテキストメニュークリックイベントが正常に処理される', () => {
      const mockListener = jest.fn();

      chrome.contextMenus.onClicked.addListener(mockListener);

      expect(mockChrome.contextMenus.onClicked.addListener).toHaveBeenCalledWith(mockListener);

      // イベントハンドラーをテスト
      const eventHandler = mockChrome.contextMenus.onClicked.addListener.mock.calls[0][0];
      const info = {
        menuItemId: 'save-to-wallabag',
        pageUrl: 'https://example.com'
      };
      const tab = { id: 1, url: 'https://example.com' };

      eventHandler(info, tab);

      expect(mockListener).toHaveBeenCalledWith(info, tab);
    });
  });

  describe('Chrome Notifications API統合', () => {
    it('通知の作成が正常に動作する', async () => {
      const notificationOptions = {
        type: 'basic' as chrome.notifications.TemplateType,
        iconUrl: '/assets/icons/icon-48.png',
        title: 'Wallabag',
        message: 'ページが保存されました'
      };

      const notificationId = 'test-notification-id';
      mockChrome.notifications.create.mockResolvedValue(notificationId);

      const result = await new Promise<string>((resolve) => {
        chrome.notifications.create(notificationOptions, resolve);
      });

      expect(result).toBe(notificationId);
      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        notificationOptions,
        expect.any(Function)
      );
    });

    it('通知のクリアが正常に動作する', async () => {
      const notificationId = 'test-notification-id';

      await new Promise<boolean>((resolve) => {
        chrome.notifications.clear(notificationId, resolve);
      });

      expect(mockChrome.notifications.clear).toHaveBeenCalledWith(
        notificationId,
        expect.any(Function)
      );
    });

    it('通知クリックイベントが正常に処理される', () => {
      const mockListener = jest.fn();

      chrome.notifications.onClicked.addListener(mockListener);

      expect(mockChrome.notifications.onClicked.addListener).toHaveBeenCalledWith(mockListener);

      // イベントハンドラーをテスト
      const eventHandler = mockChrome.notifications.onClicked.addListener.mock.calls[0][0];
      const notificationId = 'test-notification-id';

      eventHandler(notificationId);

      expect(mockListener).toHaveBeenCalledWith(notificationId);
    });
  });

  describe('Chrome Runtime API統合', () => {
    it('メッセージ送信が正常に動作する', async () => {
      const message: ExtensionMessage = {
        type: MessageType.SAVE_PAGE,
        payload: {
          url: 'https://example.com',
          title: 'Example Page'
        }
      };

      const expectedResponse: SaveResult = {
        success: true,
        message: 'ページが保存されました',
        entryId: 123
      };

      mockChrome.runtime.sendMessage.mockResolvedValue(expectedResponse);

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(message, resolve);
      });

      expect(response).toEqual(expectedResponse);
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        message,
        expect.any(Function)
      );
    });

    it('メッセージリスナーが正常に登録される', () => {
      const mockListener = jest.fn();

      chrome.runtime.onMessage.addListener(mockListener);

      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalledWith(mockListener);
    });

    it('拡張機能URLの生成が正常に動作する', () => {
      const path = '/options/options.html';
      const expectedUrl = `chrome-extension://test-extension-id${path}`;

      mockChrome.runtime.getURL.mockReturnValue(expectedUrl);

      const url = chrome.runtime.getURL(path);

      expect(url).toBe(expectedUrl);
      expect(mockChrome.runtime.getURL).toHaveBeenCalledWith(path);
    });

    it('拡張機能のマニフェスト取得が正常に動作する', () => {
      const mockManifest = {
        name: 'Wallabag Extension',
        version: '1.0.0',
        manifest_version: 3
      };

      mockChrome.runtime.getManifest.mockReturnValue(mockManifest);

      const manifest = chrome.runtime.getManifest();

      expect(manifest).toEqual(mockManifest);
      expect(mockChrome.runtime.getManifest).toHaveBeenCalled();
    });

    it('拡張機能インストールイベントが正常に処理される', () => {
      const mockListener = jest.fn();

      chrome.runtime.onInstalled.addListener(mockListener);

      expect(mockChrome.runtime.onInstalled.addListener).toHaveBeenCalledWith(mockListener);

      // イベントハンドラーをテスト
      const eventHandler = mockChrome.runtime.onInstalled.addListener.mock.calls[0][0];
      const details = { reason: 'install' as chrome.runtime.OnInstalledReason };

      eventHandler(details);

      expect(mockListener).toHaveBeenCalledWith(details);
    });
  });

  describe('Chrome Permissions API統合', () => {
    it('権限の要求が正常に動作する', async () => {
      const permissions = {
        origins: ['https://wallabag.test.com/*']
      };

      mockChrome.permissions.request.mockResolvedValue(true);

      const granted = await new Promise<boolean>((resolve) => {
        chrome.permissions.request(permissions, resolve);
      });

      expect(granted).toBe(true);
      expect(mockChrome.permissions.request).toHaveBeenCalledWith(
        permissions,
        expect.any(Function)
      );
    });

    it('権限の確認が正常に動作する', async () => {
      const permissions = {
        origins: ['https://wallabag.test.com/*']
      };

      mockChrome.permissions.contains.mockResolvedValue(true);

      const hasPermission = await new Promise<boolean>((resolve) => {
        chrome.permissions.contains(permissions, resolve);
      });

      expect(hasPermission).toBe(true);
      expect(mockChrome.permissions.contains).toHaveBeenCalledWith(
        permissions,
        expect.any(Function)
      );
    });

    it('権限の削除が正常に動作する', async () => {
      const permissions = {
        origins: ['https://wallabag.test.com/*']
      };

      mockChrome.permissions.remove.mockResolvedValue(true);

      const removed = await new Promise<boolean>((resolve) => {
        chrome.permissions.remove(permissions, resolve);
      });

      expect(removed).toBe(true);
      expect(mockChrome.permissions.remove).toHaveBeenCalledWith(
        permissions,
        expect.any(Function)
      );
    });
  });

  describe('Chrome Alarms API統合', () => {
    it('アラームの作成が正常に動作する', () => {
      const alarmInfo = {
        delayInMinutes: 1,
        periodInMinutes: 60
      };

      chrome.alarms.create('token-refresh', alarmInfo);

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('token-refresh', alarmInfo);
    });

    it('アラームの取得が正常に動作する', async () => {
      const mockAlarm = {
        name: 'token-refresh',
        scheduledTime: Date.now() + 60000,
        periodInMinutes: 60
      };

      mockChrome.alarms.get.mockResolvedValue(mockAlarm);

      const alarm = await new Promise<chrome.alarms.Alarm>((resolve) => {
        chrome.alarms.get('token-refresh', resolve);
      });

      expect(alarm).toEqual(mockAlarm);
      expect(mockChrome.alarms.get).toHaveBeenCalledWith(
        'token-refresh',
        expect.any(Function)
      );
    });

    it('すべてのアラームのクリアが正常に動作する', async () => {
      await new Promise<boolean>((resolve) => {
        chrome.alarms.clearAll(resolve);
      });

      expect(mockChrome.alarms.clearAll).toHaveBeenCalledWith(expect.any(Function));
    });

    it('アラームイベントが正常に処理される', () => {
      const mockListener = jest.fn();

      chrome.alarms.onAlarm.addListener(mockListener);

      expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalledWith(mockListener);

      // イベントハンドラーをテスト
      const eventHandler = mockChrome.alarms.onAlarm.addListener.mock.calls[0][0];
      const alarm = {
        name: 'token-refresh',
        scheduledTime: Date.now()
      };

      eventHandler(alarm);

      expect(mockListener).toHaveBeenCalledWith(alarm);
    });
  });

  describe('統合エラーハンドリング', () => {
    it('Chrome API が利用できない環境でのエラーハンドリング', async () => {
      // Chrome APIを一時的に削除
      const originalChrome = global.chrome;
      delete (global as any).chrome;

      // ConfigManager が正常にフォールバックするかテスト
      let error: Error | null = null;
      try {
        await ConfigManager.getConfig();
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeTruthy();

      // Chrome APIを復元
      global.chrome = originalChrome;
    });

    it('API レート制限のハンドリング', async () => {
      // storage.local.set が連続して呼ばれた場合のレート制限シミュレート
      mockChrome.storage.local.set
        .mockResolvedValueOnce() // 1回目は成功
        .mockResolvedValueOnce() // 2回目も成功
        .mockRejectedValueOnce(new Error('Rate limit exceeded')); // 3回目は失敗

      await ConfigManager.setConfig({ serverUrl: 'https://test1.com' });
      await ConfigManager.setConfig({ serverUrl: 'https://test2.com' });

      await expect(
        ConfigManager.setConfig({ serverUrl: 'https://test3.com' })
      ).rejects.toThrow('設定の保存に失敗しました');
    });

    it('非同期操作のタイムアウトハンドリング', async () => {
      // タブへのメッセージ送信がタイムアウトする場合
      mockChrome.tabs.sendMessage.mockImplementation(() => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
      });

      const tabId = 1;
      const message = { type: MessageType.GET_PAGE_INFO, payload: {} };

      let error: Error | null = null;
      try {
        await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error?.message).toBe('Timeout');
    });
  });
});