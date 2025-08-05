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
  EntryResponse,
  AuthResponse,
} from '../../src/lib/types';
import { ConfigManager } from '../../src/lib/config-manager';
import {
  createWallabagClient,
  savePage,
  WallabagApiClient,
} from '../../src/lib/wallabag-api';
import { BackgroundService } from '../../src/background/background';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

// モジュールのモック
jest.mock('../../src/lib/config-manager');
jest.mock('../../src/lib/wallabag-api');

const mockConfigManager = ConfigManager as jest.Mocked<typeof ConfigManager>;
const mockCreateWallabagClient =
  createWallabagClient as jest.MockedFunction<typeof createWallabagClient>;
const mockSavePage = savePage as jest.MockedFunction<typeof savePage>;

// chrome.tabs.Tabのモックを作成するヘルパー関数
const createMockTab = (
  overrides: Partial<chrome.tabs.Tab> = {}
): chrome.tabs.Tab => ({
  id: 1,
  index: 0,
  pinned: false,
  highlighted: false,
  windowId: 1,
  active: true,
  incognito: false,
  selected: true,
  url: 'https://example.com',
  title: 'Example Page',
  favIconUrl: 'https://example.com/favicon.ico',
  status: 'complete',
  audible: false,
  discarded: false,
  autoDiscardable: true,
  mutedInfo: { muted: false },
  width: 1920,
  height: 1080,
  sessionId: '1',
  groupId: -1,
  ...overrides,
});

const createMockEntryResponse = (
  overrides: Partial<EntryResponse> = {}
): EntryResponse => ({
  id: 123,
  url: 'https://example.com',
  title: 'Example Page',
  content: '<p>Example content</p>',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  starred: false,
  archived: false,
  tags: [],
  ...overrides,
});

describe('BackgroundService', () => {
  let backgroundService: BackgroundService;
  let mockChrome: DeepMockProxy<typeof chrome>;
  let mockApiClient: DeepMockProxy<WallabagApiClient>;

  beforeEach(() => {
    // Chrome APIのモック
    mockChrome = mockDeep<typeof chrome>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.chrome = mockChrome as any;

    // Wallabag API Clientのモック
    mockApiClient = mockDeep<WallabagApiClient>();
    mockCreateWallabagClient.mockResolvedValue(mockApiClient);

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
      expect(mockConfigManager.addConfigChangeListener).toHaveBeenCalled();
      expect(mockChrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(mockChrome.contextMenus.create).toHaveBeenCalled();
      expect(mockChrome.action.setIcon).toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    it('SAVE_PAGE メッセージを処理する', async () => {
      const pageInfo: PageInfo = {
        url: 'https://example.com',
        title: 'Example Page',
      };
      const message: ExtensionMessage = {
        type: MessageType.SAVE_PAGE,
        payload: pageInfo,
      };
      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockSavePage.mockResolvedValue(createMockEntryResponse());

      const response = await backgroundService['handleMessage'](message, {
        tab: createMockTab(),
      } as chrome.runtime.MessageSender);

      expect(mockSavePage).toHaveBeenCalledWith(pageInfo.url, pageInfo.title);
      expect(response.type).toBe(MessageType.SAVE_PAGE_RESPONSE);
      expect((response.payload as SaveResult).success).toBe(true);
      expect((response.payload as SaveResult).entryId).toBe(123);
    });

    it('GET_CONFIG メッセージを処理する', async () => {
      const config: Config = {
        serverUrl: 'https://wallabag.example.com',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        username: 'user',
        password: 'password',
      };
      const message: ExtensionMessage = { type: MessageType.GET_CONFIG };
      mockConfigManager.getConfig.mockResolvedValue(config);

      const response = await backgroundService['handleMessage'](message, {
        tab: createMockTab(),
      } as chrome.runtime.MessageSender);

      expect(response.type).toBe(MessageType.CONFIG_RESPONSE);
      expect(response.payload).toEqual(config);
    });

    it('SET_CONFIG メッセージを処理する', async () => {
      const config: Partial<Config> = {
        serverUrl: 'https://wallabag.example.com',
      };
      const message: ExtensionMessage = {
        type: MessageType.SET_CONFIG,
        payload: config,
      };
      mockConfigManager.setConfig.mockResolvedValue(undefined);

      const response = await backgroundService['handleMessage'](message, {
        tab: createMockTab(),
      } as chrome.runtime.MessageSender);

      expect(mockConfigManager.setConfig).toHaveBeenCalledWith(config);
      expect(response.payload).toEqual({ success: true });
    });

    it('CHECK_AUTH メッセージを処理する', async () => {
      const message: ExtensionMessage = { type: MessageType.CHECK_AUTH };
      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockConfigManager.hasAuthCredentials.mockResolvedValue(true);
      mockConfigManager.isTokenValid.mockResolvedValue(true);

      const response = await backgroundService['handleMessage'](message, {
        tab: createMockTab(),
      } as chrome.runtime.MessageSender);

      expect(response.payload).toEqual({
        isConfigured: true,
        hasCredentials: true,
        isTokenValid: true,
        isAuthenticated: true,
      });
    });

    it('REFRESH_TOKEN メッセージを処理する', async () => {
      const message: ExtensionMessage = { type: MessageType.REFRESH_TOKEN };
      const mockAuthResponse: AuthResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
        scope: 'read write',
      };
      mockApiClient.refreshToken.mockResolvedValue(mockAuthResponse);

      mockConfigManager.getConfig.mockResolvedValue({
        refreshToken: 'refresh-token',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        serverUrl: 'url',
        username: 'user',
        password: 'password',
      });

      const response = await backgroundService['handleMessage'](message, {
        tab: createMockTab(),
      } as chrome.runtime.MessageSender);

      expect(mockApiClient.refreshToken).toHaveBeenCalled();
      expect(response.payload).toEqual({ success: true });
    });

    it('GET_PAGE_INFO メッセージを処理する (content scriptから取得)', async () => {
      const pageInfo: PageInfo = {
        url: 'https://example.com',
        title: 'Example Page from Content Script',
      };
      const message: ExtensionMessage = { type: MessageType.GET_PAGE_INFO };
      mockChrome.tabs.sendMessage.mockResolvedValue({
        type: MessageType.PAGE_INFO_RESPONSE,
        payload: pageInfo,
      });

      const response = await backgroundService['handleMessage'](message, {
        tab: createMockTab(),
      } as chrome.runtime.MessageSender);

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        type: MessageType.GET_PAGE_INFO,
      });
      expect(response.payload).toEqual(pageInfo);
    });

    it('GET_PAGE_INFO メッセージを処理する (content scriptから取得失敗)', async () => {
      const message: ExtensionMessage = { type: MessageType.GET_PAGE_INFO };
      mockChrome.tabs.sendMessage.mockRejectedValue(
        new Error('No content script')
      );

      const response = await backgroundService['handleMessage'](message, {
        tab: createMockTab({
          url: 'https://fallback.com',
          title: 'Fallback Title',
        }),
      } as chrome.runtime.MessageSender);

      expect(response.type).toBe(MessageType.PAGE_INFO_RESPONSE);
      expect(response.payload).toEqual({
        url: 'https://fallback.com',
        title: 'Fallback Title',
      });
    });

    it('不明なメッセージタイプを処理する', async () => {
      const message: ExtensionMessage = { type: 'UNKNOWN_TYPE' as MessageType };
      await expect(
        backgroundService['handleMessage'](message, {
          tab: createMockTab(),
        } as chrome.runtime.MessageSender)
      ).rejects.toThrow('未知のメッセージタイプ: UNKNOWN_TYPE');
    });
  });

  describe('Action Click Handling', () => {
    it('アクションボタンクリックでページを保存する', async () => {
      const tab = createMockTab();
      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockSavePage.mockResolvedValue(createMockEntryResponse());

      await backgroundService['handleActionClick'](tab);

      expect(mockSavePage).toHaveBeenCalledWith(tab.url, tab.title);
      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '保存完了',
        })
      );
    });

    it('設定が不完全な場合はエラー通知を表示する', async () => {
      const tab = createMockTab();
      mockConfigManager.isConfigured.mockResolvedValue(false);

      await backgroundService['handleActionClick'](tab);

      expect(mockSavePage).not.toHaveBeenCalled();
      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'エラー',
          message: '設定が完了していません。オプションページで設定を行ってください。',
        })
      );
    });
  });

  describe('Context Menu Handling', () => {
    it('コンテキストメニューをセットアップする', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(true);
      await backgroundService['setupContextMenus']();
      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(mockChrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'save-to-wallabag',
        title: 'Wallabagに保存',
        contexts: ['page', 'link', 'selection'],
      });
    });

    it('設定が不完全な場合はコンテキストメニューを作成しない', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(false);
      await backgroundService['setupContextMenus']();
      expect(mockChrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(mockChrome.contextMenus.create).not.toHaveBeenCalled();
    });
  });

  describe('Icon Handling', () => {
    it('設定済みでトークンが有効な場合に正しいアイコンを設定する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockConfigManager.isTokenValid.mockResolvedValue(true);
      await backgroundService['updateExtensionIcon']();
      expect(mockChrome.action.setIcon).toHaveBeenCalledWith({
        path: '/icons/icon-48.png',
      });
      expect(mockChrome.action.setTitle).toHaveBeenCalledWith({
        title: 'Wallabag (ページを保存)',
      });
    });

    it('設定済みでトークンが無効な場合に正しいアイコンを設定する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(true);
      mockConfigManager.isTokenValid.mockResolvedValue(false);
      await backgroundService['updateExtensionIcon']();
      expect(mockChrome.action.setIcon).toHaveBeenCalledWith({
        path: '/icons/icon-48.png',
      });
      expect(mockChrome.action.setTitle).toHaveBeenCalledWith({
        title: 'Wallabag (認証が必要)',
      });
    });

    it('未設定の場合に正しいアイコンを設定する', async () => {
      mockConfigManager.isConfigured.mockResolvedValue(false);
      await backgroundService['updateExtensionIcon']();
      expect(mockChrome.action.setIcon).toHaveBeenCalledWith({
        path: '/icons/icon-48.png',
      });
      expect(mockChrome.action.setTitle).toHaveBeenCalledWith({
        title: 'Wallabag (設定が必要)',
      });
    });
  });
});