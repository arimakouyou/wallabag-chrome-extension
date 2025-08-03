/**
 * 基本操作 E2E テスト
 * ユーザーの基本的な操作フローをエンドツーエンドでテスト
 */

import { 
  Config,
  PageInfo,
  ExtensionMessage,
  MessageType
} from '../../src/lib/types';

// E2Eテスト用のChrome Extension環境シミュレート
describe('基本操作 E2E テスト', () => {
  let mockChrome: any;
  let mockConfig: Config;

  beforeEach(() => {
    // Chrome Extension API の完全なモック
    mockChrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
        onChanged: {
          addListener: jest.fn(),
        },
      },
      runtime: {
        onMessage: {
          addListener: jest.fn(),
        },
        sendMessage: jest.fn(),
        getURL: jest.fn(),
        onInstalled: {
          addListener: jest.fn(),
        },
      },
      tabs: {
        query: jest.fn(),
        create: jest.fn(),
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
      },
      contextMenus: {
        create: jest.fn(),
        removeAll: jest.fn(),
        onClicked: {
          addListener: jest.fn(),
        },
      },
      notifications: {
        create: jest.fn(),
      },
    };

    global.chrome = mockChrome;

    mockConfig = {
      serverUrl: 'https://wallabag.example.com',
      clientId: 'e2e-test-client',
      clientSecret: 'e2e-test-secret',
      username: 'e2euser',
      password: 'e2epassword',
      accessToken: 'e2e-access-token',
      refreshToken: 'e2e-refresh-token',
      tokenExpiresAt: Math.floor(Date.now() / 1000) + 3600
    };

    // Fetch APIのモック
    global.fetch = jest.fn();

    jest.clearAllMocks();
  });

  describe('初回セットアップフロー', () => {
    it('拡張機能インストール → 設定 → 接続テストの完全フロー', async () => {
      // 1. 拡張機能インストール時の初期化
      mockChrome.storage.local.get.mockResolvedValue({}); // 初期状態は空

      // インストールイベントをシミュレート
      const installListener = jest.fn();
      mockChrome.runtime.onInstalled.addListener(installListener);

      const installDetails = { reason: 'install' };
      if (installListener.mock.calls.length > 0) {
        const handler = installListener.mock.calls[0][0];
        await handler(installDetails);
      }

      // 設定ページの自動オープンを確認
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('/options/options.html')
      });

      // 2. ユーザーが設定を入力
      mockChrome.storage.local.set.mockResolvedValue();

      // 設定保存をシミュレート
      const ConfigManager = require('../../src/lib/config-manager').ConfigManager;
      await ConfigManager.setConfig(mockConfig);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        wallabag_config: expect.any(Object)
      });

      // 3. 接続テスト
      const mockAuthResponse = {
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'test-refresh'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockAuthResponse)
      });

      const WallabagApiClient = require('../../src/lib/wallabag-api').WallabagApiClient;
      const client = new WallabagApiClient(mockConfig.serverUrl);

      const connectionResult = await client.testConnection();

      expect(connectionResult).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/v2/token'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });
  });

  describe('ページ保存フロー', () => {
    beforeEach(() => {
      // 設定済み状態をモック
      mockChrome.storage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });
    });

    it('ブラウザアクションクリック → ページ保存の完全フロー', async () => {
      // 1. ユーザーがブラウザアクションボタンをクリック
      const currentTab = {
        id: 1,
        url: 'https://example.com/interesting-article',
        title: '面白い記事のタイトル',
        active: true
      };

      mockChrome.tabs.query.mockResolvedValue([currentTab]);

      // 2. Background Serviceがページ情報を取得
      const BackgroundService = require('../../src/background/background').BackgroundService;
      const backgroundService = new BackgroundService();
      await backgroundService.initialize();

      // アクションクリックハンドラーを取得
      const actionClickHandler = mockChrome.action.onClicked.addListener.mock.calls[0][0];

      // 3. Wallabag APIへの保存リクエスト
      const mockEntryResponse = {
        id: 12345,
        url: currentTab.url,
        title: currentTab.title,
        content: '記事の本文内容...',
        created_at: '2025-08-03T22:00:00Z',
        updated_at: '2025-08-03T22:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockEntryResponse)
      });

      // 4. アクションクリックを実行
      await actionClickHandler(currentTab);

      // 5. APIが正しく呼ばれることを確認
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockConfig.serverUrl}/api/entries.json`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockConfig.accessToken}`,
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            url: currentTab.url,
            title: currentTab.title
          })
        })
      );

      // 6. 成功通知が表示されることを確認
      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: '保存完了',
        message: 'ページがWallabagに保存されました'
      });
    });

    it('コンテキストメニュー → ページ保存の完全フロー', async () => {
      // 1. コンテキストメニューの初期化
      const BackgroundService = require('../../src/background/background').BackgroundService;
      const backgroundService = new BackgroundService();
      await backgroundService.initialize();

      // コンテキストメニューが作成されることを確認
      expect(mockChrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'save-to-wallabag',
        title: 'Wallabagに保存',
        contexts: ['page', 'link', 'selection']
      });

      // 2. ユーザーがコンテキストメニューをクリック
      const contextMenuHandler = mockChrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      const menuInfo = {
        menuItemId: 'save-to-wallabag',
        pageUrl: 'https://example.com/context-menu-article'
      };

      const tab = {
        id: 2,
        url: 'https://example.com/context-menu-article',
        title: 'コンテキストメニューテスト記事'
      };

      // 3. Wallabag APIへの保存
      const mockEntryResponse = {
        id: 67890,
        url: tab.url,
        title: tab.title,
        content: 'コンテキストメニューからの保存記事...',
        created_at: '2025-08-03T23:00:00Z',
        updated_at: '2025-08-03T23:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockEntryResponse)
      });

      // 4. コンテキストメニューハンドラーを実行
      await contextMenuHandler(menuInfo, tab);

      // 5. 結果確認
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockConfig.serverUrl}/api/entries.json`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            url: tab.url,
            title: tab.title
          })
        })
      );

      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: '保存完了',
        message: 'ページがWallabagに保存されました'
      });
    });

    it('Popup UI → ページ保存の完全フロー', async () => {
      // 1. Popupが開かれる
      const currentTab = {
        id: 3,
        url: 'https://example.com/popup-test-article',
        title: 'Popupテスト記事',
        active: true
      };

      mockChrome.tabs.query.mockResolvedValue([currentTab]);

      // 2. PopupがBackground Serviceにメッセージを送信
      const mockEntryResponse = {
        id: 11111,
        url: currentTab.url,
        title: currentTab.title,
        content: 'Popupからの保存記事...',
        created_at: '2025-08-04T00:00:00Z',
        updated_at: '2025-08-04T00:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(mockEntryResponse)
      });

      // Background Serviceの初期化
      const BackgroundService = require('../../src/background/background').BackgroundService;
      const backgroundService = new BackgroundService();
      await backgroundService.initialize();

      // メッセージハンドラーを取得
      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      // 3. SAVE_PAGEメッセージの送信をシミュレート
      const saveMessage: ExtensionMessage = {
        type: MessageType.SAVE_PAGE,
        payload: {
          url: currentTab.url,
          title: currentTab.title
        } as PageInfo
      };

      const mockSendResponse = jest.fn();

      // 4. メッセージハンドラーを実行
      await messageHandler(saveMessage, { tab: currentTab }, mockSendResponse);

      // 5. 応答の確認
      expect(mockSendResponse).toHaveBeenCalledWith({
        type: MessageType.SAVE_PAGE_RESPONSE,
        payload: expect.objectContaining({
          success: true,
          message: 'ページが正常に保存されました',
          entryId: mockEntryResponse.id
        })
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockConfig.serverUrl}/api/entries.json`,
        expect.objectContaining({
          method: 'POST'
        })
      );
    });
  });

  describe('設定変更フロー', () => {
    it('設定更新 → アイコン変更 → コンテキストメニュー更新の完全フロー', async () => {
      // 1. 初期状態：未設定
      mockChrome.storage.local.get.mockResolvedValue({});

      const BackgroundService = require('../../src/background/background').BackgroundService;
      const backgroundService = new BackgroundService();
      await backgroundService.initialize();

      // 設定変更リスナーを取得
      const ConfigManager = require('../../src/lib/config-manager').ConfigManager;
      const configChangeListener = ConfigManager.addConfigChangeListener.mock.calls[0][0];

      // 2. 設定が追加される
      mockChrome.storage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });

      // 設定変更イベントをシミュレート
      const changes = {
        wallabag_config: {
          oldValue: {},
          newValue: mockConfig
        }
      };

      await configChangeListener(changes.wallabag_config);

      // 3. アイコンが更新されることを確認
      expect(mockChrome.action.setIcon).toHaveBeenCalledWith({
        path: '/assets/icons/icon.png'
      });

      expect(mockChrome.action.setTitle).toHaveBeenCalledWith({
        title: 'Wallabag (ページを保存)'
      });

      // 4. コンテキストメニューが再作成されることを確認
      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(mockChrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'save-to-wallabag',
        title: 'Wallabagに保存',
        contexts: ['page', 'link', 'selection']
      });
    });
  });

  describe('認証エラー回復フロー', () => {
    it('期限切れトークン → 自動リフレッシュ → ページ保存の完全フロー', async () => {
      // 1. 期限切れトークンの設定
      const expiredConfig = {
        ...mockConfig,
        accessToken: 'expired-token',
        tokenExpiresAt: Math.floor(Date.now() / 1000) - 3600 // 1時間前に期限切れ
      };

      mockChrome.storage.local.get.mockResolvedValue({
        wallabag_config: expiredConfig
      });

      // 2. リフレッシュトークンの成功レスポンス
      const refreshResponse = {
        access_token: 'new-fresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'new-refresh-token'
      };

      // 3. エントリ作成の成功レスポンス
      const entryResponse = {
        id: 22222,
        url: 'https://example.com/auto-refresh-test',
        title: 'Auto Refresh Test',
        content: 'Content...',
        created_at: '2025-08-04T01:00:00Z',
        updated_at: '2025-08-04T01:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      (global.fetch as jest.Mock)
        // リフレッシュトークンリクエスト
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(refreshResponse)
        })
        // エントリ作成リクエスト
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse)
        });

      // 4. Background Serviceでページ保存を実行
      const BackgroundService = require('../../src/background/background').BackgroundService;
      const backgroundService = new BackgroundService();
      await backgroundService.initialize();

      const tab = {
        id: 4,
        url: 'https://example.com/auto-refresh-test',
        title: 'Auto Refresh Test'
      };

      const actionClickHandler = mockChrome.action.onClicked.addListener.mock.calls[0][0];
      await actionClickHandler(tab);

      // 5. リフレッシュとエントリ作成の両方が呼ばれることを確認
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // リフレッシュトークンリクエスト
      expect(global.fetch).toHaveBeenNthCalledWith(1,
        `${mockConfig.serverUrl}/oauth/v2/token`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('grant_type=refresh_token')
        })
      );

      // エントリ作成リクエスト
      expect(global.fetch).toHaveBeenNthCalledWith(2,
        `${mockConfig.serverUrl}/api/entries.json`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${refreshResponse.access_token}`
          })
        })
      );

      // 成功通知
      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: '保存完了',
        message: 'ページがWallabagに保存されました'
      });
    });
  });

  describe('エラーハンドリングフロー', () => {
    beforeEach(() => {
      mockChrome.storage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });
    });

    it('ネットワークエラー → リトライ → 成功の完全フロー', async () => {
      // 1. 最初の2回は失敗、3回目は成功
      const entryResponse = {
        id: 33333,
        url: 'https://example.com/retry-test',
        title: 'Retry Test',
        content: 'Content...',
        created_at: '2025-08-04T02:00:00Z',
        updated_at: '2025-08-04T02:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: jest.fn().mockResolvedValue(entryResponse)
        });

      // 2. Background Service初期化
      const BackgroundService = require('../../src/background/background').BackgroundService;
      const backgroundService = new BackgroundService();
      await backgroundService.initialize();

      const tab = {
        id: 5,
        url: 'https://example.com/retry-test',
        title: 'Retry Test'
      };

      // delay関数をモック
      jest.useFakeTimers();

      // 3. アクションクリックを実行
      const actionClickHandler = mockChrome.action.onClicked.addListener.mock.calls[0][0];
      const actionPromise = actionClickHandler(tab);

      // タイマーを進める
      jest.runAllTimers();

      await actionPromise;

      // 4. リトライが正常に動作することを確認
      expect(global.fetch).toHaveBeenCalledTimes(3);

      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: '保存完了',
        message: 'ページがWallabagに保存されました'
      });

      jest.useRealTimers();
    });

    it('未設定状態でのページ保存試行 → エラー通知の完全フロー', async () => {
      // 1. 未設定状態
      mockChrome.storage.local.get.mockResolvedValue({});

      const BackgroundService = require('../../src/background/background').BackgroundService;
      const backgroundService = new BackgroundService();
      await backgroundService.initialize();

      const tab = {
        id: 6,
        url: 'https://example.com/unconfigured-test',
        title: 'Unconfigured Test'
      };

      // 2. アクションクリックを実行
      const actionClickHandler = mockChrome.action.onClicked.addListener.mock.calls[0][0];
      await actionClickHandler(tab);

      // 3. エラー通知が表示されることを確認
      expect(mockChrome.notifications.create).toHaveBeenCalledWith({
        type: 'basic',
        iconUrl: '/assets/icons/icon-48.png',
        title: 'エラー',
        message: '設定が完了していません。オプションページで設定を行ってください。'
      });

      // APIが呼ばれないことを確認
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('タブ更新イベントフロー', () => {
    it('タブナビゲーション → アイコン更新の完全フロー', async () => {
      // 1. 設定済み状態
      mockChrome.storage.local.get.mockResolvedValue({
        wallabag_config: mockConfig
      });

      const BackgroundService = require('../../src/background/background').BackgroundService;
      const backgroundService = new BackgroundService();
      await backgroundService.initialize();

      // 2. タブ更新イベントリスナーを取得
      const tabUpdateHandler = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      const tabId = 7;
      const changeInfo = {
        status: 'complete',
        url: 'https://example.com/new-page'
      };
      const tab = {
        id: tabId,
        url: 'https://example.com/new-page',
        title: 'New Page'
      };

      // 3. タブ更新イベントを実行
      await tabUpdateHandler(tabId, changeInfo, tab);

      // 4. アイコンが更新されることを確認
      expect(mockChrome.action.setIcon).toHaveBeenCalled();
      expect(mockChrome.action.setTitle).toHaveBeenCalled();
    });
  });
});