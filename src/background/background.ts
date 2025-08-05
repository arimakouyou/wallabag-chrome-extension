/**
 * Wallabag Chrome拡張機能 - Background Service Worker
 * Manifest V3対応のバックグラウンドサービス
 * メインロジック、イベントハンドリング、API通信の中心
 */

import {
  ExtensionMessage,
  MessageType,
  SaveResult,
  PageInfo,
  ErrorType,
  ContextMenuItem,
  isPageInfo,
  isPartialConfig,
  Config,
} from '../lib/types';
import { ConfigManager } from '../lib/config-manager';
import { createWallabagClient, savePage } from '../lib/wallabag-api';

/**
 * Background Service Workerクラス
 * 拡張機能のメインロジックを管理
 */
class BackgroundService {
  private isInitialized = false;

  /**
   * サービスワーカーの初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('Wallabag Chrome Extension Background Service を初期化中...');

    try {
      // イベントリスナーの設定
      this.setupEventListeners();

      // コンテキストメニューの初期化
      await this.setupContextMenus();

      // アイコンの初期状態設定
      await this.updateExtensionIcon();

      this.isInitialized = true;
      console.log('Background Service の初期化が完了しました');
    } catch (error) {
      console.error('Background Service の初期化に失敗しました:', error);
    }
  }

  /**
   * イベントリスナーの設定
   */
  private setupEventListeners(): void {
    // メッセージリスナー（Popup、Content Script からのメッセージ）
    chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, sender, sendResponse) => {
        this.handleMessage(message, sender)
          .then(sendResponse)
          .catch((error) => {
            console.error('メッセージ処理エラー:', error);
            sendResponse({
              type: MessageType.ERROR_NOTIFICATION,
              payload: {
                error: error.message,
                type: ErrorType.UNKNOWN_ERROR,
              },
            });
          });

        // 非同期レスポンスを示すためtrueを返す
        return true;
      }
    );

    // 拡張機能アクション（ツールバーボタンクリック）
    chrome.action.onClicked.addListener(async (tab) => {
      await this.handleActionClick(tab);
    });

    // コンテキストメニュークリック
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      await this.handleContextMenuClick(info, tab);
    });

    // 設定変更の監視
    ConfigManager.addConfigChangeListener(async () => {
      await this.updateExtensionIcon();
      await this.setupContextMenus();
    });

    // タブ更新時の処理
    chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        await this.updateExtensionIcon();
      }
    });

    console.log('イベントリスナーが設定されました');
  }

  /**
   * メッセージハンドリング
   * @param message 受信メッセージ
   * @param sender 送信者情報
   * @returns レスポンス
   */
  private async handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender
  ): Promise<ExtensionMessage> {
    console.log('メッセージを受信:', message.type, message.payload);

    switch (message.type) {
      case MessageType.SAVE_PAGE:
        if (isPageInfo(message.payload)) {
          return await this.handleSavePage(message.payload);
        }
        throw new Error('Invalid payload for SAVE_PAGE');

      case MessageType.GET_CONFIG:
        return await this.handleGetConfig();

      case MessageType.SET_CONFIG:
        if (isPartialConfig(message.payload)) {
          return await this.handleSetConfig(message.payload);
        }
        throw new Error('Invalid payload for SET_CONFIG');

      case MessageType.CHECK_AUTH:
        return await this.handleCheckAuth();

      case MessageType.REFRESH_TOKEN:
        return await this.handleRefreshToken();

      case MessageType.GET_PAGE_INFO:
        // sender.tabが無効な場合は現在のアクティブタブを取得
        const tab = sender.tab || (await this.getCurrentActiveTab());
        return await this.handleGetPageInfo(tab);

      default:
        throw new Error(`未知のメッセージタイプ: ${message.type}`);
    }
  }

  /**
   * ページ保存処理
   * @param pageInfo ページ情報
   * @returns 保存結果
   */
  private async handleSavePage(pageInfo: PageInfo): Promise<ExtensionMessage> {
    try {
      console.log('ページを保存中:', pageInfo.url);

      // 設定の確認
      const isConfigured = await ConfigManager.isConfigured();
      if (!isConfigured) {
        return {
          type: MessageType.SAVE_PAGE_RESPONSE,
          payload: {
            success: false,
            message:
              '設定が完了していません。オプションページで設定を行ってください。',
            error: 'not_configured',
          } as SaveResult,
        };
      }

      // ページ保存実行
      const entry = await savePage(pageInfo.url, pageInfo.title);

      const result: SaveResult = {
        success: true,
        message: 'ページが正常に保存されました',
        entryId: entry.id,
      };

      // 成功通知
      await this.showNotification(
        '保存完了',
        'ページがWallabagに保存されました'
      );

      return {
        type: MessageType.SAVE_PAGE_RESPONSE,
        payload: result,
      };
    } catch (error: unknown) {
      console.error('ページ保存エラー:', error);

      let errorMessage = 'ページの保存に失敗しました';
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      const result: SaveResult = {
        success: false,
        message: errorMessage,
        error:
          error instanceof Error && 'type' in error
            ? (error as { type: string }).type
            : ErrorType.UNKNOWN_ERROR,
      };

      return {
        type: MessageType.SAVE_PAGE_RESPONSE,
        payload: result,
      };
    }
  }

  /**
   * 設定取得処理
   */
  private async handleGetConfig(): Promise<ExtensionMessage> {
    const config = await ConfigManager.getConfig();
    return {
      type: MessageType.CONFIG_RESPONSE,
      payload: config,
    };
  }

  /**
   * 設定保存処理
   * @param config 設定データ
   */
  private async handleSetConfig(
    config: Partial<Config>
  ): Promise<ExtensionMessage> {
    try {
      await ConfigManager.setConfig(config);
      return {
        type: MessageType.CONFIG_RESPONSE,
        payload: { success: true },
      };
    } catch (error: unknown) {
      let errorMessage = '設定の保存に失敗しました';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return {
        type: MessageType.CONFIG_RESPONSE,
        payload: {
          success: false,
          error: errorMessage,
        },
      };
    }
  }

  /**
   * 認証状態確認
   */
  private async handleCheckAuth(): Promise<ExtensionMessage> {
    try {
      const isConfigured = await ConfigManager.isConfigured();
      const hasCredentials = await ConfigManager.hasAuthCredentials();
      const isTokenValid = await ConfigManager.isTokenValid();

      return {
        type: MessageType.AUTH_RESPONSE,
        payload: {
          isConfigured,
          hasCredentials,
          isTokenValid,
          isAuthenticated: isConfigured && hasCredentials && isTokenValid,
        },
      };
    } catch (error: unknown) {
      let errorMessage = '認証状態の確認に失敗しました';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return {
        type: MessageType.AUTH_RESPONSE,
        payload: {
          isConfigured: false,
          hasCredentials: false,
          isTokenValid: false,
          isAuthenticated: false,
          error: errorMessage,
        },
      };
    }
  }

  /**
   * トークン更新処理
   */
  private async handleRefreshToken(): Promise<ExtensionMessage> {
    try {
      const client = await createWallabagClient();
      const config = await ConfigManager.getConfig();

      if (!config.refreshToken || !config.clientId || !config.clientSecret) {
        throw new Error('リフレッシュトークンまたは認証情報が不足しています');
      }

      await client.refreshToken({
        grant_type: 'refresh_token',
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      return {
        type: MessageType.AUTH_RESPONSE,
        payload: { success: true },
      };
    } catch (error: unknown) {
      let errorMessage = 'トークンの更新に失敗しました';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return {
        type: MessageType.AUTH_RESPONSE,
        payload: {
          success: false,
          error: errorMessage,
        },
      };
    }
  }

  /**
   * 現在のアクティブタブを取得
   * @returns アクティブタブ
   */
  private async getCurrentActiveTab(): Promise<chrome.tabs.Tab | undefined> {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      return tab;
    } catch (error) {
      console.error('アクティブタブの取得に失敗:', error);
      return undefined;
    }
  }

  /**
   * ページ情報取得処理
   * @param tab タブ情報
   */
  private async handleGetPageInfo(
    tab?: chrome.tabs.Tab
  ): Promise<ExtensionMessage> {
    if (!tab || !tab.id) {
      throw new Error('タブ情報が取得できません');
    }

    try {
      // Content Scriptからページ情報を取得
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: MessageType.GET_PAGE_INFO,
      });

      return response;
    } catch (error: unknown) {
      console.warn('Content Scriptからの取得に失敗、基本情報を使用:', error);

      // Content Scriptが読み込まれていない場合は基本情報のみ返す
      const pageInfo: PageInfo = {
        url: tab.url || '',
        title: tab.title || 'タイトルなし',
      };

      return {
        type: MessageType.PAGE_INFO_RESPONSE,
        payload: pageInfo,
      };
    }
  }

  /**
   * アクションボタンクリック処理
   * @param tab クリックされたタブ
   */
  private async handleActionClick(tab: chrome.tabs.Tab): Promise<void> {
    try {
      if (!tab.url || !tab.id) {
        await this.showNotification('エラー', '現在のページを取得できません');
        return;
      }

      // ページ情報を取得
      const pageInfo: PageInfo = {
        url: tab.url,
        title: tab.title || 'タイトルなし',
      };

      // ページを保存
      const response = await this.handleSavePage(pageInfo);
      const result = response.payload as SaveResult;

      if (!result.success) {
        await this.showNotification('エラー', result.message);
      }
    } catch (error: unknown) {
      console.error('アクションクリック処理エラー:', error);
      await this.showNotification('エラー', 'ページの保存に失敗しました');
    }
  }

  /**
   * コンテキストメニュークリック処理
   * @param info メニュー情報
   * @param tab タブ情報
   */
  private async handleContextMenuClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): Promise<void> {
    if (info.menuItemId === 'save-to-wallabag' && tab) {
      await this.handleActionClick(tab);
    }
  }

  /**
   * コンテキストメニューの設定
   */
  private async setupContextMenus(): Promise<void> {
    try {
      // 既存のコンテキストメニューをクリア
      await chrome.contextMenus.removeAll();

      const isConfigured = await ConfigManager.isConfigured();

      if (isConfigured) {
        const menuItem: ContextMenuItem = {
          id: 'save-to-wallabag',
          title: 'Wallabagに保存',
          contexts: ['page', 'link', 'selection'],
        };

        chrome.contextMenus.create(menuItem);
        console.log('コンテキストメニューを作成しました');
      }
    } catch (error) {
      console.error('コンテキストメニューの設定に失敗しました:', error);
    }
  }

  /**
   * 拡張機能アイコンの更新
   */
  private async updateExtensionIcon(): Promise<void> {
    try {
      const isConfigured = await ConfigManager.isConfigured();
      const isTokenValid = await ConfigManager.isTokenValid();

      let iconPath: string;
      let title: string;

      if (!isConfigured) {
        iconPath = '/icons/icon-48.png';
        title = 'Wallabag (設定が必要)';
      } else if (!isTokenValid) {
        iconPath = '/icons/icon-48.png';
        title = 'Wallabag (認証が必要)';
      } else {
        iconPath = '/icons/icon-48.png';
        title = 'Wallabag (ページを保存)';
      }

      await chrome.action.setIcon({ path: iconPath });
      await chrome.action.setTitle({ title });
    } catch (error) {
      console.error('アイコンの更新に失敗しました:', error);
    }
  }

  /**
   * 通知の表示
   * @param title 通知タイトル
   * @param message 通知メッセージ
   */
  private async showNotification(
    title: string,
    message: string
  ): Promise<void> {
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icons/icon-48.png',
        title,
        message,
      });
    } catch (error) {
      console.error('通知の表示に失敗しました:', error);
    }
  }
}

// Service Workerのインスタンス
const backgroundService = new BackgroundService();

// Service Worker起動時の初期化
chrome.runtime.onStartup.addListener(async () => {
  await backgroundService.initialize();
});

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('拡張機能がインストール/更新されました:', details.reason);
  await backgroundService.initialize();

  // 初回インストール時は設定ページを開く
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('/options/options.html'),
    });
  }
});

// テスト用にエクスポート
export { BackgroundService };
