/**
 * Wallabag Chrome拡張機能 - Popup JavaScript
 * ポップアップUIの操作、API連携、状態管理
 */

import { 
  ExtensionMessage, 
  MessageType, 
  PageInfo, 
  SaveResult, 
  ExtensionStatus,
  Config,
  isPageInfo
} from '../lib/types';

/**
 * Popupクラス
 * ポップアップUIの全体的な管理を行う
 */
class PopupController {
  private currentPageInfo: PageInfo | null = null;
  private isConfigured = false;
  private isAuthenticated = false;
  private saveOptions = {
    starred: false,
    archive: false,
    tags: ''
  };

  // DOM要素
  private elements = {
    statusIndicator: document.getElementById('status-indicator') as HTMLElement,
    statusText: document.getElementById('status-text') as HTMLElement,
    pageTitle: document.getElementById('page-title') as HTMLElement,
    pageUrl: document.getElementById('page-url') as HTMLElement,
    savePageBtn: document.getElementById('save-page-btn') as HTMLButtonElement,
    saveLoading: document.getElementById('save-loading') as HTMLElement,
    starBtn: document.getElementById('star-btn') as HTMLButtonElement,
    archiveBtn: document.getElementById('archive-btn') as HTMLButtonElement,
    tagsBtn: document.getElementById('tags-btn') as HTMLButtonElement,
    tagsInputArea: document.getElementById('tags-input-area') as HTMLElement,
    tagsInput: document.getElementById('tags-input') as HTMLInputElement,
    tagsConfirm: document.getElementById('tags-confirm') as HTMLButtonElement,
    tagsCancel: document.getElementById('tags-cancel') as HTMLButtonElement,
    statusMessage: document.getElementById('status-message') as HTMLElement,
    errorMessage: document.getElementById('error-message') as HTMLElement,
    errorText: document.getElementById('error-text') as HTMLElement,
    errorClose: document.getElementById('error-close') as HTMLButtonElement,
    successMessage: document.getElementById('success-message') as HTMLElement,
    successText: document.getElementById('success-text') as HTMLElement,
    viewEntryLink: document.getElementById('view-entry-link') as HTMLAnchorElement,
    configRequired: document.getElementById('config-required') as HTMLElement,
    openOptions: document.getElementById('open-options') as HTMLButtonElement,
    optionsLink: document.getElementById('options-link') as HTMLAnchorElement,
    helpLink: document.getElementById('help-link') as HTMLAnchorElement
  };

  /**
   * 初期化
   */
  async initialize(): Promise<void> {
    try {
      // イベントリスナーの設定
      this.setupEventListeners();
      
      // 初期状態の確認
      await this.checkExtensionStatus();
      
      // ページ情報の取得
      await this.loadPageInfo();
    } catch (error) {
      console.error('Popup Controller の初期化に失敗しました:', error);
      this.showError('初期化に失敗しました');
    }
  }

  /**
   * イベントリスナーの設定
   */
  private setupEventListeners(): void {
    // 保存ボタン
    this.elements.savePageBtn.addEventListener('click', () => {
      this.savePage();
    });

    // オプションボタン
    this.elements.starBtn.addEventListener('click', () => {
      this.toggleOption('starred');
    });

    this.elements.archiveBtn.addEventListener('click', () => {
      this.toggleOption('archive');
    });

    this.elements.tagsBtn.addEventListener('click', () => {
      this.toggleTagsInput();
    });

    // タグ入力
    this.elements.tagsConfirm.addEventListener('click', () => {
      this.confirmTags();
    });

    this.elements.tagsCancel.addEventListener('click', () => {
      this.cancelTags();
    });

    this.elements.tagsInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.confirmTags();
      } else if (e.key === 'Escape') {
        this.cancelTags();
      }
    });

    // エラー閉じる
    this.elements.errorClose.addEventListener('click', () => {
      this.hideError();
    });

    // 設定を開く
    this.elements.openOptions.addEventListener('click', () => {
      this.openOptionsPage();
    });

    this.elements.optionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.openOptionsPage();
    });

    // ヘルプリンク
    this.elements.helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({
        url: 'https://wallabag.org/help'
      });
    });

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        if (this.elements.savePageBtn.disabled === false) {
          this.savePage();
        }
      }
    });
  }

  /**
   * 拡張機能の状態を確認
   */
  private async checkExtensionStatus(): Promise<void> {
    try {
      const response = await this.sendMessage({
        type: MessageType.CHECK_AUTH
      });

      const authStatus = response.payload as { isConfigured: boolean, isAuthenticated: boolean };
      this.isConfigured = authStatus.isConfigured;
      this.isAuthenticated = authStatus.isAuthenticated;

      // UI状態の更新
      this.updateStatusIndicator();
      this.updateUI();

    } catch (error) {
      console.error('状態確認エラー:', error);
      this.updateStatusIndicator(ExtensionStatus.ERROR);
      this.showError(`拡張機能の状態を確認できませんでした: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * ページ情報を読み込み
   */
  private async loadPageInfo(): Promise<void> {
    try {
      this.elements.statusMessage.textContent = 'ページ情報を取得中...';

      const response = await this.sendMessage({
        type: MessageType.GET_PAGE_INFO
      });

      if (isPageInfo(response.payload)) {
        this.currentPageInfo = response.payload;
        this.updatePageInfo();
      } else {
        console.error('無効なページ情報レスポンス:', response.payload);
        this.elements.pageTitle.textContent = 'ページ情報の形式が無効です';
        this.elements.pageUrl.textContent = '';
      }

    } catch (error) {
      console.error('ページ情報取得エラー:', error);
      this.elements.pageTitle.textContent = `ページ情報を取得できませんでした: ${error instanceof Error ? error.message : error}`;
      this.elements.pageUrl.textContent = '';
    } finally {
      this.elements.statusMessage.textContent = '';
    }
  }

  /**
   * ページを保存
   */
  private async savePage(): Promise<void> {
    if (!this.currentPageInfo) {
      this.showError('ページ情報が取得できていません');
      return;
    }

    if (!this.isConfigured) {
      this.showConfigRequired();
      return;
    }

    try {
      this.setSaveButtonState('loading');
      this.hideError();
      this.hideSuccess();

      // 保存リクエストの作成
      const saveRequest: PageInfo & {
        tags?: string;
        starred?: boolean;
        archive?: boolean;
      } = { ...this.currentPageInfo };

      if (this.saveOptions.tags) saveRequest.tags = this.saveOptions.tags;
      if (this.saveOptions.starred) saveRequest.starred = this.saveOptions.starred;
      if (this.saveOptions.archive) saveRequest.archive = this.saveOptions.archive;

      const response = await this.sendMessage({
        type: MessageType.SAVE_PAGE,
        payload: saveRequest
      });

      const result = response.payload as SaveResult;

      if (result.success) {
        this.setSaveButtonState('success');
        this.showSuccess('ページが正常に保存されました', result.entryId);
        
        // オプションをリセット
        this.resetSaveOptions();
      } else {
        this.setSaveButtonState('error');
        this.showError(result.message || '保存に失敗しました');
      }

    } catch (error: unknown) {
      console.error('保存エラー:', error);
      this.setSaveButtonState('error');
      const errorMessage = error instanceof Error ? error.message : 'ページの保存に失敗しました';
      this.showError(errorMessage);
    }

    // 2秒後にボタン状態をリセット
    setTimeout(() => {
      this.setSaveButtonState('default');
    }, 2000);
  }

  /**
   * オプションの切り替え
   */
  private toggleOption(option: 'starred' | 'archive'): void {
    this.saveOptions[option] = !this.saveOptions[option];
    
    const buttonElement = option === 'starred' ? this.elements.starBtn : this.elements.archiveBtn;
    
    if (this.saveOptions[option]) {
      buttonElement.classList.add('active');
    } else {
      buttonElement.classList.remove('active');
    }

    this.updateSaveButtonText();
  }

  /**
   * タグ入力の表示/非表示
   */
  private toggleTagsInput(): void {
    const isVisible = this.elements.tagsInputArea.style.display !== 'none';
    
    if (isVisible) {
      this.cancelTags();
    } else {
      this.elements.tagsInputArea.style.display = 'block';
      this.elements.tagsInput.value = this.saveOptions.tags;
      this.elements.tagsInput.focus();
      this.elements.tagsBtn.classList.add('active');
    }
  }

  /**
   * タグの確定
   */
  private confirmTags(): void {
    const tags = this.elements.tagsInput.value.trim();
    this.saveOptions.tags = tags;
    
    this.elements.tagsInputArea.style.display = 'none';
    
    if (tags) {
      this.elements.tagsBtn.classList.add('active');
    } else {
      this.elements.tagsBtn.classList.remove('active');
    }

    this.updateSaveButtonText();
  }

  /**
   * タグ入力のキャンセル
   */
  private cancelTags(): void {
    this.elements.tagsInputArea.style.display = 'none';
    this.elements.tagsInput.value = this.saveOptions.tags;
    
    if (!this.saveOptions.tags) {
      this.elements.tagsBtn.classList.remove('active');
    }
  }

  /**
   * 保存オプションのリセット
   */
  private resetSaveOptions(): void {
    this.saveOptions = {
      starred: false,
      archive: false,
      tags: ''
    };

    this.elements.starBtn.classList.remove('active');
    this.elements.archiveBtn.classList.remove('active');
    this.elements.tagsBtn.classList.remove('active');
    this.elements.tagsInput.value = '';
    this.elements.tagsInputArea.style.display = 'none';

    this.updateSaveButtonText();
  }

  /**
   * 状態インジケーターの更新
   */
  private updateStatusIndicator(status?: ExtensionStatus): void {
    const indicator = this.elements.statusIndicator;
    const statusText = this.elements.statusText;

    // クラスをリセット
    indicator.className = 'status-indicator';

    if (status) {
      // 明示的に指定された状態
      switch (status) {
        case ExtensionStatus.ERROR:
          indicator.classList.add('error');
          statusText.textContent = 'エラー';
          break;
        case ExtensionStatus.SUCCESS:
          indicator.classList.add('connected');
          statusText.textContent = '保存完了';
          break;
        default:
          statusText.textContent = status;
      }
    } else {
      // 現在の状態に基づく判定
      if (!this.isConfigured) {
        indicator.classList.add('disconnected');
        statusText.textContent = '設定が必要';
      } else if (!this.isAuthenticated) {
        indicator.classList.add('error');
        statusText.textContent = '認証エラー';
      } else {
        indicator.classList.add('connected');
        statusText.textContent = '接続済み';
      }
    }
  }

  /**
   * UIの状態更新
   */
  private updateUI(): void {
    if (!this.isConfigured) {
      this.showConfigRequired();
      this.elements.savePageBtn.disabled = true;
    } else {
      this.hideConfigRequired();
      this.elements.savePageBtn.disabled = false;
    }
  }

  /**
   * ページ情報の表示更新
   */
  private updatePageInfo(): void {
    if (this.currentPageInfo) {
      this.elements.pageTitle.textContent = this.currentPageInfo.title;
      this.elements.pageUrl.textContent = this.currentPageInfo.url;
    }
  }

  /**
   * 保存ボタンのテキスト更新
   */
  private updateSaveButtonText(): void {
    let text = 'このページを保存';
    const options: string[] = [];

    if (this.saveOptions.starred) options.push('お気に入り');
    if (this.saveOptions.archive) options.push('アーカイブ');
    if (this.saveOptions.tags) options.push('タグ付き');

    if (options.length > 0) {
      text += ` (${options.join(', ')})`;
    }

    const btnText = this.elements.savePageBtn.querySelector('.btn-text');
    if (btnText) {
      btnText.textContent = text;
    }
  }

  /**
   * 保存ボタンの状態設定
   */
  private setSaveButtonState(state: 'default' | 'loading' | 'success' | 'error'): void {
    const btn = this.elements.savePageBtn;
    
    // クラスをリセット
    btn.classList.remove('loading', 'success', 'error');
    
    switch (state) {
      case 'loading':
        btn.classList.add('loading');
        btn.disabled = true;
        break;
      case 'success':
        btn.classList.add('success');
        btn.disabled = false;
        break;
      case 'error':
        btn.classList.add('error');
        btn.disabled = false;
        break;
      default:
        btn.disabled = !this.isConfigured;
        break;
    }
  }

  /**
   * エラーメッセージの表示
   */
  private showError(message: string): void {
    this.elements.errorText.textContent = message;
    this.elements.errorMessage.style.display = 'flex';
    this.elements.errorMessage.classList.add('fade-in');
  }

  /**
   * エラーメッセージの非表示
   */
  private hideError(): void {
    this.elements.errorMessage.style.display = 'none';
    this.elements.errorMessage.classList.remove('fade-in');
  }

  /**
   * 成功メッセージの表示
   */
  private showSuccess(message: string, entryId?: number): void {
    this.elements.successText.textContent = message;
    
    if (entryId) {
      // Wallabagのエントリリンクを設定（設定から基本URLを取得）
      this.sendMessage({ type: MessageType.GET_CONFIG })
        .then(response => {
          const config = response.payload as Config;
          if (config.serverUrl) {
            this.elements.viewEntryLink.href = `${config.serverUrl}/view/${entryId}`;
            this.elements.viewEntryLink.style.display = 'inline';
          }
        })
        .catch(() => {
          this.elements.viewEntryLink.style.display = 'none';
        });
    } else {
      this.elements.viewEntryLink.style.display = 'none';
    }
    
    this.elements.successMessage.style.display = 'block';
    this.elements.successMessage.classList.add('fade-in');
    this.updateStatusIndicator(ExtensionStatus.SUCCESS);
  }

  /**
   * 成功メッセージの非表示
   */
  private hideSuccess(): void {
    this.elements.successMessage.style.display = 'none';
    this.elements.successMessage.classList.remove('fade-in');
  }

  /**
   * 設定必要メッセージの表示
   */
  private showConfigRequired(): void {
    this.elements.configRequired.style.display = 'block';
    this.elements.configRequired.classList.add('fade-in');
  }

  /**
   * 設定必要メッセージの非表示
   */
  private hideConfigRequired(): void {
    this.elements.configRequired.style.display = 'none';
    this.elements.configRequired.classList.remove('fade-in');
  }

  /**
   * 設定ページを開く
   */
  private openOptionsPage(): void {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html')
    });
    window.close();
  }

  /**
   * Background Scriptにメッセージを送信
   */
  private async sendMessage(message: ExtensionMessage): Promise<ExtensionMessage> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

// ポップアップの初期化
document.addEventListener('DOMContentLoaded', async () => {
  const popup = new PopupController();
  await popup.initialize();
});

// エクスポート（テスト用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PopupController };
}