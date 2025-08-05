/**
 * Wallabag Chrome拡張機能 - Content Script
 * Webページに注入され、ページ情報の取得とメタデータ抽出を行う
 */

import { ExtensionMessage, MessageType, PageInfo } from '../lib/types';

/**
 * Content Scriptクラス
 * ページ情報の取得とメタデータの抽出を管理
 */
class ContentScript {
  private isInitialized = false;

  /**
   * Content Scriptの初期化
   */
  initialize(): void {
    if (this.isInitialized) return;

    try {
      this.setupMessageListener();
      this.isInitialized = true;
    } catch (error) {
      console.error('Content Script の初期化に失敗しました:', error);
    }
  }

  /**
   * メッセージリスナーの設定
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, _sender, sendResponse) => {
        this.handleMessage(message)
          .then(sendResponse)
          .catch((error) => {
            console.error('Content Script メッセージ処理エラー:', error);
            sendResponse({
              type: MessageType.ERROR_NOTIFICATION,
              payload: { error: error.message },
            });
          });

        // 非同期レスポンスを示すためtrueを返す
        return true;
      }
    );
  }

  /**
   * メッセージハンドリング
   * @param message 受信メッセージ
   * @returns レスポンス
   */
  private async handleMessage(
    message: ExtensionMessage
  ): Promise<ExtensionMessage> {
    switch (message.type) {
      case MessageType.GET_PAGE_INFO:
        return {
          type: MessageType.PAGE_INFO_RESPONSE,
          payload: this.getPageInfo(),
        };

      default:
        throw new Error(`未知のメッセージタイプ: ${message.type}`);
    }
  }

  /**
   * 現在のページ情報を取得
   * @returns ページ情報
   */
  getPageInfo(): PageInfo {
    const pageInfo: PageInfo = {
      url: window.location.href,
      title: this.getPageTitle(),
    };

    const description = this.getMetaDescription();
    if (description) {
      pageInfo.description = description;
    }

    const favicon = this.getFaviconUrl();
    if (favicon) {
      pageInfo.favicon = favicon;
    }

    // ページ情報を取得しました
    return pageInfo;
  }

  /**
   * ページタイトルを取得
   * @returns ページタイトル
   */
  private getPageTitle(): string {
    // document.titleを優先
    if (document.title && document.title.trim()) {
      return document.title.trim();
    }

    // h1タグから取得を試行
    const h1Elements = document.querySelectorAll('h1');
    for (const h1 of Array.from(h1Elements)) {
      const text = h1.textContent?.trim();
      if (text && text.length > 0) {
        return text;
      }
    }

    // og:titleから取得を試行
    const ogTitle = this.getMetaProperty('og:title');
    if (ogTitle) {
      return ogTitle;
    }

    // twitter:titleから取得を試行
    const twitterTitle = this.getMetaProperty('twitter:title');
    if (twitterTitle) {
      return twitterTitle;
    }

    // URLから推測
    try {
      const url = new URL(window.location.href);
      const pathname = url.pathname;

      // パスの最後の部分を取得
      const lastSegment = pathname.split('/').filter(Boolean).pop();
      if (lastSegment) {
        // ファイル拡張子を除去
        const title = lastSegment.replace(/\.[^/.]+$/, '');
        // ハイフンやアンダースコアをスペースに変換
        return title.replace(/[-_]/g, ' ');
      }

      // ドメイン名を返す
      return url.hostname;
    } catch {
      return 'タイトルなし';
    }
  }

  /**
   * メタディスクリプションを取得
   * @returns ディスクリプション
   */
  private getMetaDescription(): string | undefined {
    // standard meta description
    const metaDesc = this.getMetaByName('description');
    if (metaDesc) {
      return this.cleanText(metaDesc);
    }

    // og:description
    const ogDesc = this.getMetaProperty('og:description');
    if (ogDesc) {
      return this.cleanText(ogDesc);
    }

    // twitter:description
    const twitterDesc = this.getMetaProperty('twitter:description');
    if (twitterDesc) {
      return this.cleanText(twitterDesc);
    }

    // 最初のpタグから取得を試行
    const firstParagraph = document.querySelector('p');
    if (firstParagraph && firstParagraph.textContent) {
      const text = this.cleanText(firstParagraph.textContent);
      if (text.length > 20) {
        // 150文字で切り詰め
        return text.length > 150 ? text.substring(0, 150) + '...' : text;
      }
    }

    return undefined;
  }

  /**
   * ファビコンURLを取得
   * @returns ファビコンURL
   */
  private getFaviconUrl(): string | undefined {
    // link rel="icon" を探す
    const iconLinks = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]',
    ];

    for (const selector of iconLinks) {
      const link = document.querySelector<HTMLLinkElement>(selector);
      if (link && link.href) {
        return this.resolveUrl(link.href);
      }
    }

    // デフォルトファビコンパスを試行
    const defaultPaths = [
      '/favicon.ico',
      '/favicon.png',
      '/assets/favicon.ico',
      '/static/favicon.ico',
    ];

    const baseUrl = window.location.origin;
    for (const path of defaultPaths) {
      // 実際に存在するかはチェックしない（レスポンス時間考慮）
      return baseUrl + path;
    }

    return undefined;
  }

  /**
   * name属性でmetaタグの内容を取得
   * @param name name属性の値
   * @returns content属性の値
   */
  private getMetaByName(name: string): string | null {
    const meta = document.querySelector<HTMLMetaElement>(
      `meta[name="${name}"]`
    );
    return meta?.content || null;
  }

  /**
   * property属性でmetaタグの内容を取得
   * @param property property属性の値
   * @returns content属性の値
   */
  private getMetaProperty(property: string): string | null {
    const meta = document.querySelector<HTMLMetaElement>(
      `meta[property="${property}"]`
    );
    return meta?.content || null;
  }

  /**
   * テキストのクリーニング
   * @param text 元のテキスト
   * @returns クリーニング済みテキスト
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // 複数の空白を単一スペースに
      .replace(/\n/g, ' ') // 改行をスペースに
      .trim(); // 前後の空白を削除
  }

  /**
   * 相対URLを絶対URLに変換
   * @param url 変換するURL
   * @returns 絶対URL
   */
  private resolveUrl(url: string): string {
    try {
      // 既に絶対URLの場合はそのまま返す
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }

      // 相対URLを絶対URLに変換
      const baseUrl = window.location.origin;
      if (url.startsWith('/')) {
        return baseUrl + url;
      } else {
        return new URL(url, window.location.href).href;
      }
    } catch {
      return url; // 変換に失敗した場合は元のURLを返す
    }
  }

  /**
   * ページにWallabag保存ボタンを挿入（オプション機能）
   * 設定で有効化された場合のみ動作
   */
  async injectSaveButton(): Promise<void> {
    try {
      // 既にボタンが存在する場合はスキップ
      if (document.getElementById('wallabag-save-button')) {
        return;
      }

      // 設定を確認（Background Scriptから取得）
      const response = await chrome.runtime.sendMessage({
        type: MessageType.GET_CONFIG,
      });

      // インジェクション機能が無効な場合はスキップ
      if (!response.payload?.enableButtonInjection) {
        return;
      }

      // 保存ボタンを作成
      const button = document.createElement('button');
      button.id = 'wallabag-save-button';
      button.textContent = '📖 Wallabagに保存';
      button.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: background-color 0.2s;
      `;

      // ホバー効果
      button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = '#1976d2';
      });

      button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = '#1e88e5';
      });

      // クリック処理
      button.addEventListener('click', async () => {
        try {
          button.textContent = '保存中...';
          button.disabled = true;

          const pageInfo = this.getPageInfo();
          await chrome.runtime.sendMessage({
            type: MessageType.SAVE_PAGE,
            payload: pageInfo,
          });

          button.textContent = '✅ 保存完了';
          setTimeout(() => {
            button.textContent = '📖 Wallabagに保存';
            button.disabled = false;
          }, 2000);
        } catch (error) {
          console.error('保存エラー:', error);
          button.textContent = '❌ 保存失敗';
          setTimeout(() => {
            button.textContent = '📖 Wallabagに保存';
            button.disabled = false;
          }, 2000);
        }
      });

      // ページに追加
      document.body.appendChild(button);
      console.log('Wallabag保存ボタンを挿入しました');
    } catch (error) {
      console.error('保存ボタンの挿入に失敗しました:', error);
    }
  }

  /**
   * キーボードショートカットの設定
   */
  setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', async (event) => {
      // Ctrl+Shift+S または Cmd+Shift+S でページを保存
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key === 'S'
      ) {
        event.preventDefault();

        try {
          const pageInfo = this.getPageInfo();
          await chrome.runtime.sendMessage({
            type: MessageType.SAVE_PAGE,
            payload: pageInfo,
          });

          console.log('キーボードショートカットでページを保存しました');
        } catch (error) {
          console.error('キーボードショートカット保存エラー:', error);
        }
      }
    });
  }
}

// Content Scriptのインスタンス作成と初期化
const contentScript = new ContentScript();

// DOMの読み込み完了を待って初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    contentScript.initialize();
  });
} else {
  contentScript.initialize();
}

// ページの読み込み完了後にオプション機能を初期化
window.addEventListener('load', () => {
  // 保存ボタン挿入（設定により制御）
  contentScript.injectSaveButton();

  // キーボードショートカット設定
  contentScript.setupKeyboardShortcuts();
});

// エクスポート（テスト用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentScript };
}
