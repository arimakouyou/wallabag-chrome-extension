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
import { ConfigMigration } from '../lib/config-migration';

/**
 * Background Service Workerクラス
 * 拡張機能のメインロジックを管理
 */
class BackgroundService {
  private isInitialized = false;
  private isContextMenuSetup = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  /**
   * サービスワーカーの初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }


    try {
      // Chrome API の可用性チェック
      if (!chrome.runtime) {
        throw new Error('Chrome Runtime API が利用できません');
      }
      if (!chrome.storage) {
        throw new Error('Chrome Storage API が利用できません');
      }

      // 🔒 セキュリティ強化: 自動マイグレーション実行
      await ConfigMigration.autoMigrate();

      // イベントリスナーの設定
      this.setupEventListeners();

      // コンテキストメニューの初期化
      await this.setupContextMenus();

      // アイコンの初期状態設定
      await this.updateExtensionIcon();

      // Service Worker生存維持機能の開始
      this.startKeepAlive();

      this.isInitialized = true;
    } catch (error) {
      throw error; // エラーを再投下して呼び出し元に伝播
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
      // 設定変更時のみコンテキストメニューを再設定
      this.isContextMenuSetup = false;
      await this.setupContextMenus();
    });

    // タブ更新時のアイコン更新と Content Script 管理
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab?.id && tab.url) {
        // アイコン更新
        await this.updateExtensionIcon();
        
        // Content Script の自動注入（主要サイトのみ）
        if (this.shouldAutoInjectScript(tab.url)) {
          try {
            await this.ensureContentScriptInjected(tabId);
          } catch (error) {
          }
        }
      }
    });

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

    switch (message.type) {
      case MessageType.HEALTH_CHECK:
        return {
          type: MessageType.HEALTH_CHECK_RESPONSE,
          payload: { 
            status: 'healthy',
            timestamp: Date.now(),
            initialized: this.isInitialized
          }
        };

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

      case MessageType.TEST_CONNECTION:
        return await this.handleTestConnection();

      case MessageType.REFRESH_TOKEN:
        return await this.handleRefreshToken();

      case MessageType.GET_PAGE_INFO: {
        // sender.tabが無効な場合は現在のアクティブタブを取得
        const tab = sender.tab || (await this.getCurrentActiveTab());
        return await this.handleGetPageInfo(tab);
      }

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

      // ページ保存実行（認証エラー時の自動回復付き）
      const entry = await this.savePageWithRetry(pageInfo.url, pageInfo.title);

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

      // エラーの詳細分析
      let errorMessage = 'ページの保存に失敗しました';
      let errorType = ErrorType.UNKNOWN_ERROR;
      let shouldShowReconnectSuggestion = false;
      
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid_token') || msg.includes('expired')) {
          errorMessage = '認証エラーが発生しました。オプションページで「接続テスト」を実行してください。';
          errorType = ErrorType.AUTH_ERROR;
          shouldShowReconnectSuggestion = true;
        } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
          errorMessage = 'ネットワークエラーが発生しました。インターネット接続とWallabagサーバーの状態を確認してください。';
          errorType = ErrorType.NETWORK_ERROR;
        } else if (msg.includes('timeout')) {
          errorMessage = 'タイムアウトが発生しました。しばらく時間をおいて再試行してください。';
          errorType = ErrorType.NETWORK_ERROR;
        } else {
          errorMessage = `保存エラー: ${error.message}`;
          errorType = error instanceof Error && 'type' in error
            ? (error as { type: ErrorType }).type
            : ErrorType.UNKNOWN_ERROR;
        }
      }

      const result: SaveResult = {
        success: false,
        message: errorMessage,
        error: errorType,
        shouldReconnect: shouldShowReconnectSuggestion,
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
   * 実際の接続テスト処理
   */
  private async handleTestConnection(): Promise<ExtensionMessage> {
    try {
      // 詳細な診断情報を取得（未使用の変数を削除）
      

      const client = await createWallabagClient();
      
      // 実際のAPI呼び出しでトークンの有効性をテスト
      // エントリ一覧を1件取得することで接続を確認
      await client.getEntries({ perPage: 1 });

      return {
        type: MessageType.AUTH_RESPONSE,
        payload: {
          isConfigured: true,
          hasCredentials: true,
          isTokenValid: true,
          isAuthenticated: true,
          connectionTested: true,
        },
      };
    } catch (error: unknown) {
      
      try {
        // 接続が失敗した場合、自動的に再認証を試行
        const client = await createWallabagClient();
        const config = await ConfigManager.getConfig();

        if (config.clientId && config.clientSecret && config.username && config.password) {
          
          // 既存のトークンをクリア
          await ConfigManager.clearTokens();
          
          // 再認証を実行
          await client.authenticate({
            grant_type: 'password',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            username: config.username,
            password: config.password,
          });

          
          // 再認証後に再度接続をテスト
          await client.getEntries({ perPage: 1 });

          return {
            type: MessageType.AUTH_RESPONSE,
            payload: {
              isConfigured: true,
              hasCredentials: true,
              isTokenValid: true,
              isAuthenticated: true,
              connectionTested: true,
              reconnected: true,
            },
          };
        } else {
          throw new Error('認証情報が不足しています');
        }
      } catch (reconnectError: unknown) {
        
        let errorMessage = '接続テストと自動再接続に失敗しました';
        if (reconnectError instanceof Error) {
          // より具体的なエラーメッセージを提供
          if (reconnectError.message.includes('401') || reconnectError.message.includes('Unauthorized')) {
            errorMessage = '認証情報が間違っています。設定を確認してください。';
          } else if (reconnectError.message.includes('404') || reconnectError.message.includes('Not Found')) {
            errorMessage = 'サーバーURLが間違っているか、Wallabag APIが利用できません。';
          } else if (reconnectError.message.includes('timeout') || reconnectError.message.includes('TIMEOUT')) {
            errorMessage = 'サーバーへの接続がタイムアウトしました。';
          } else if (reconnectError.message.includes('fetch') || reconnectError.message.includes('network')) {
            errorMessage = 'ネットワークエラーが発生しました。インターネット接続を確認してください。';
          } else {
            errorMessage = `認証に失敗しました: ${reconnectError.message}`;
          }
        }

        return {
          type: MessageType.AUTH_RESPONSE,
          payload: {
            isConfigured: await ConfigManager.isConfigured(),
            hasCredentials: await ConfigManager.hasAuthCredentials(),
            isTokenValid: false,
            isAuthenticated: false,
            connectionTested: true,
            error: errorMessage,
          },
        };
      }
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
      // Content Script注入の確認と必要に応じて注入
      await this.ensureContentScriptInjected(tab.id);
      
      // Content Scriptからページ情報を取得（タイムアウト付き）
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, {
          type: MessageType.GET_PAGE_INFO,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Content Script応答タイムアウト')), 3000)
        )
      ]);

      return response as ExtensionMessage;
    } catch (error: unknown) {

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
   * Content Scriptが注入されているかを確認し、必要に応じて注入
   */
  private async ensureContentScriptInjected(tabId: number): Promise<void> {
    try {
      // タブの状態確認
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        throw new Error('注入不可能なURL');
      }

      // ページの読み込み完了を待機
      if (tab.status !== 'complete') {
        await this.waitForTabComplete(tabId);
      }

      // Content Scriptの存在確認（短いタイムアウト）
      await Promise.race([
        chrome.tabs.sendMessage(tabId, { type: MessageType.PING }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PING timeout')), 1000))
      ]);
      
    } catch (error) {
      
      // Content Scriptが存在しない場合は注入を試行
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        
        
        // 注入後の確認
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // 注入確認
        try {
          await Promise.race([
            chrome.tabs.sendMessage(tabId, { type: MessageType.PING }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('注入確認失敗')), 2000))
          ]);
        } catch (confirmError) {
        }
      } catch (injectionError) {
        throw injectionError;
      }
    }
  }

  /**
   * タブの読み込み完了を待機
   */
  private async waitForTabComplete(tabId: number, maxWait: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkStatus = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.status === 'complete') {
            resolve();
          } else if (Date.now() - startTime > maxWait) {
            reject(new Error('タブ読み込みタイムアウト'));
          } else {
            setTimeout(checkStatus, 500);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      checkStatus();
    });
  }

  /**
   * Content Script の自動注入が必要かどうかを判断
   */
  private shouldAutoInjectScript(url: string): boolean {
    // chrome:// や extension:// などのシステムページは除外
    if (url.startsWith('chrome://') || 
        url.startsWith('chrome-extension://') || 
        url.startsWith('moz-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:')) {
      return false;
    }

    // HTTPSとHTTPのページのみ対象
    return url.startsWith('http://') || url.startsWith('https://');
  }

  /**
   * 認証エラー時の自動回復機能付きページ保存
   */
  private async savePageWithRetry(url: string, title?: string, maxRetries: number = 2): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await savePage(url, title);
      } catch (error: any) {
        const errorMessage = error?.message?.toLowerCase() || '';
        const isAuthError = errorMessage.includes('401') || 
                           errorMessage.includes('unauthorized') || 
                           errorMessage.includes('invalid_token') ||
                           errorMessage.includes('expired');

        if (isAuthError && attempt < maxRetries) {
          
          try {
            // 強制的に認証状態を再確認・更新
            await this.forceReauthenticate();
          } catch (reauthError) {
            // 再認証に失敗した場合は次の試行に進む
          }
        } else {
          // 最後の試行、または認証エラー以外の場合はエラーを再投下
          throw error;
        }
      }
    }

    throw new Error('ページ保存に失敗しました（最大試行回数に達しました）');
  }

  /**
   * 強制再認証
   */
  private async forceReauthenticate(): Promise<void> {
    try {
      const config = await ConfigManager.getConfig();
      
      if (!config.clientId || !config.clientSecret || !config.username || !config.password) {
        throw new Error('認証情報が不足しています');
      }

      const client = await createWallabagClient();
      
      // トークンをクリアして強制的に再認証
      await ConfigManager.clearTokens();
      
      // 新しいトークンを取得（authenticateメソッド内で自動保存される）
      await client.authenticate({
        grant_type: 'password',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        username: config.username,
        password: config.password,
      });

    } catch (error) {
      throw error;
    }
  }

  /**
   * Service Worker生存維持機能
   * 定期的にアクションを実行してService Workerが停止されないようにする
   */
  private startKeepAlive(): void {
    // 既存のインターバルをクリア
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // 25秒ごとに軽量な処理を実行（30秒でタイムアウトするため）
    this.keepAliveInterval = setInterval(() => {
      // Chrome Storage APIの軽量な操作でService Workerを活性化
      chrome.storage.local.get('__keepalive__').then(() => {
      }).catch(() => {
        // エラーは無視（Storage APIが利用できない場合）
      });
    }, 25000);

  }

  /**
   * Service Worker生存維持機能の停止
   * 必要に応じて外部から呼び出し可能
   */
  stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * 初期化状態をストレージに保存
   */
  async saveInitializationState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        '__service_worker_initialized__': {
          timestamp: Date.now(),
          isInitialized: this.isInitialized,
          isContextMenuSetup: this.isContextMenuSetup
        }
      });
    } catch (error) {
    }
  }

  /**
   * 初期化状態のgetter
   */
  get isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * 初期化状態をストレージから復元
   */
  async restoreInitializationState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('__service_worker_initialized__');
      const state = result['__service_worker_initialized__'];
      
      if (state && typeof state === 'object') {
        const timeDiff = Date.now() - (state.timestamp || 0);
        // 5分以内の状態のみ復元
        if (timeDiff < 5 * 60 * 1000) {
          this.isInitialized = state.isInitialized || false;
          this.isContextMenuSetup = state.isContextMenuSetup || false;
        }
      }
    } catch (error) {
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

      // 設定確認
      const isConfigured = await ConfigManager.isConfigured();
      if (!isConfigured) {
        await this.showNotification('設定が必要', 'オプションページで設定を行ってください');
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
        // 認証エラーの場合は自動再接続を試行
        if (result.error === ErrorType.AUTH_ERROR || result.error === 'auth_error' || result.message.includes('認証')) {
          try {
            const testResponse = await this.handleTestConnection();
            const testResult = testResponse.payload as {
              isAuthenticated: boolean;
              reconnected?: boolean;
            };

            if (testResult.reconnected) {
              await this.showNotification('接続復旧', 'Wallabagへの接続が復旧しました');
              // 再接続後に再度保存を試行
              const retryResponse = await this.handleSavePage(pageInfo);
              const retryResult = retryResponse.payload as SaveResult;
              
              if (!retryResult.success) {
                await this.showNotification('エラー', retryResult.message);
              }
              return;
            }
          } catch (reconnectError) {
          }
        }

        await this.showNotification('エラー', result.message);
      }
    } catch (error: unknown) {
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
    // 既に設定済みの場合はスキップ
    if (this.isContextMenuSetup) {
      return;
    }

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

        // コンテキストメニューが既に存在するかチェック
        try {
          // Promiseベースでcreateを待機
          await new Promise<void>((resolve, reject) => {
            chrome.contextMenus.create(menuItem, () => {
              if (chrome.runtime.lastError) {
                // 既に存在する場合のエラーは無視
                if (chrome.runtime.lastError.message?.includes('duplicate id')) {
                  resolve();
                } else {
                  reject(new Error(chrome.runtime.lastError.message));
                }
              } else {
                resolve();
              }
            });
          });
          this.isContextMenuSetup = true;
        } catch (createError) {
        }
      } else {
        // 設定されていない場合は設定済みフラグをセット（メニューが不要なため）
        this.isContextMenuSetup = true;
      }
    } catch (error) {
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
    }
  }
}

// Service Workerのインスタンス
const backgroundService = new BackgroundService();

// 初期化フラグ（重複初期化防止）
let isInitialized = false;

// 安全な初期化関数
async function safeInitialize(): Promise<void> {
  if (isInitialized) {
    return;
  }
  
  
  try {
    // 初期化状態の復元を試行
    await backgroundService.restoreInitializationState();
    
    // まだ初期化されていない場合のみ初期化実行
    if (!backgroundService.isServiceInitialized) {
      isInitialized = true;
      
      try {
        await backgroundService.initialize();
        await backgroundService.saveInitializationState();
      } catch (error) {
        isInitialized = false; // エラー時はフラグをリセット
        throw error; // エラーを再投下
      }
    } else {
      isInitialized = true;
    }
  } catch (error) {
    isInitialized = false;
    throw error;
  }
}

// Service Worker起動時の初期化
chrome.runtime.onStartup.addListener(safeInitialize);

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async (details) => {
  await safeInitialize();

  // 初回インストール時は設定ページを開く
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('/options/options.html'),
    });
  }
});

// Service Worker起動時に即座に初期化を実行
safeInitialize();

// テスト用にエクスポート
export { BackgroundService };
