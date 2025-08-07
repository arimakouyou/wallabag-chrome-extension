/**
 * Wallabag Chrome拡張機能 - セキュア暗号化マネージャー
 * Web Crypto APIを使用した真の暗号化による機密情報保護
 */

/**
 * Web Crypto APIを使用したセキュアな暗号化管理クラス
 * AES-GCM暗号化による認証情報とトークンの安全な保存
 */
export class SecureCryptoManager {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12; // GCMモードでは12バイトが推奨
  private static readonly MASTER_KEY_STORAGE_KEY = 'secure_master_key';
  
  // キャッシュされたマスターキー（メモリ内のみ）
  private static cachedMasterKey: CryptoKey | null = null;

  /**
   * マスターキーを生成・取得
   * 初回のみ生成、以後は保存済みキーを使用
   * @returns CryptoKey マスターキー
   */
  private static async getMasterKey(): Promise<CryptoKey> {
    // メモリ内キャッシュがあれば使用
    if (this.cachedMasterKey) {
      return this.cachedMasterKey;
    }

    try {
      // 既存のキーを検索
      const result = await chrome.storage.local.get(this.MASTER_KEY_STORAGE_KEY);
      
      if (result[this.MASTER_KEY_STORAGE_KEY]) {
        // 既存のキーをインポート
        const keyData = new Uint8Array(result[this.MASTER_KEY_STORAGE_KEY]);
        this.cachedMasterKey = await window.crypto.subtle.importKey(
          'raw',
          keyData,
          { name: this.ALGORITHM },
          false, // extractable: false（セキュリティ強化）
          ['encrypt', 'decrypt']
        );
        
        console.log('既存のマスターキーを読み込みました');
        return this.cachedMasterKey;
      } else {
        // 新しいキーを生成
        const key = await window.crypto.subtle.generateKey(
          {
            name: this.ALGORITHM,
            length: this.KEY_LENGTH,
          },
          true, // extractable (保存のため一時的にtrue)
          ['encrypt', 'decrypt']
        );

        // キーをエクスポートして保存
        const exportedKey = await window.crypto.subtle.exportKey('raw', key);
        await chrome.storage.local.set({
          [this.MASTER_KEY_STORAGE_KEY]: Array.from(new Uint8Array(exportedKey))
        });

        // 非抽出可能な形でキャッシュ
        this.cachedMasterKey = await window.crypto.subtle.importKey(
          'raw',
          exportedKey,
          { name: this.ALGORITHM },
          false, // extractable: false
          ['encrypt', 'decrypt']
        );

        console.log('新しいマスターキーを生成しました');
        return this.cachedMasterKey;
      }
    } catch (error) {
      console.error('マスターキーの取得に失敗しました:', error);
      throw new Error('暗号化キーの取得に失敗しました');
    }
  }

  /**
   * 暗号学的にセキュアなランダムIVを生成
   * @returns Uint8Array ランダムな初期化ベクトル
   */
  private static generateIV(): Uint8Array {
    return window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
  }

  /**
   * データを暗号化
   * @param plaintext 平文データ
   * @returns Promise<string> Base64エンコードされた暗号化データ（IV + 暗号文）
   */
  public static async encrypt(plaintext: string): Promise<string> {
    if (!plaintext || plaintext.length === 0) {
      throw new Error('暗号化対象データが空です');
    }

    try {
      const key = await this.getMasterKey();
      const iv = this.generateIV();
      const encoder = new TextEncoder();

      // AES-GCM暗号化実行
      const ciphertext = await window.crypto.subtle.encrypt(
        {
          name: this.ALGORITHM,
          iv: new Uint8Array(iv),
        },
        key,
        encoder.encode(plaintext)
      );

      // IV + 暗号化データを結合
      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(ciphertext), iv.length);

      // Base64エンコードして返却
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('暗号化処理中にエラーが発生しました:', error);
      throw new Error('データの暗号化に失敗しました');
    }
  }

  /**
   * データを復号化
   * @param encryptedData Base64エンコードされた暗号化データ
   * @returns Promise<string> 復号化された平文データ
   */
  public static async decrypt(encryptedData: string): Promise<string> {
    if (!encryptedData || encryptedData.length === 0) {
      throw new Error('復号化対象データが空です');
    }

    try {
      const key = await this.getMasterKey();
      
      // Base64デコード
      let combined: Uint8Array;
      try {
        combined = new Uint8Array(
          atob(encryptedData).split('').map(char => char.charCodeAt(0))
        );
      } catch (error) {
        throw new Error('不正な暗号化データ形式です');
      }

      // データ長の検証
      if (combined.length <= this.IV_LENGTH) {
        throw new Error('暗号化データが短すぎます');
      }

      // IVと暗号化データを分離
      const iv = combined.slice(0, this.IV_LENGTH);
      const ciphertext = combined.slice(this.IV_LENGTH);

      // AES-GCM復号化実行
      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: new Uint8Array(iv),
        },
        key,
        ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('復号化処理中にエラーが発生しました:', error);
      
      // 具体的なエラータイプに応じたメッセージ
      if (error instanceof Error) {
        if (error.message.includes('不正な暗号化データ')) {
          throw error;
        }
        if (error.name === 'OperationError') {
          throw new Error('暗号化データが破損しているか、正しくないキーです');
        }
      }
      
      throw new Error('データの復号化に失敗しました');
    }
  }

  /**
   * Base64データかどうかを判定
   * @param data 判定対象データ
   * @returns boolean Base64データの場合true
   */
  public static isBase64Data(data: string): boolean {
    if (!data || data.length === 0) {
      return false;
    }

    try {
      // Base64形式の正規表現チェック
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(data)) {
        return false;
      }

      // 実際にデコードを試行
      const decoded = atob(data);
      
      // Base64でエンコードした場合の長さが元の長さと一致するかチェック
      return btoa(decoded) === data;
    } catch {
      return false;
    }
  }

  /**
   * Web Crypto API暗号化データかどうかを判定
   * @param data 判定対象データ
   * @returns boolean Web Crypto API暗号化データの場合true
   */
  public static async isWebCryptoData(data: string): Promise<boolean> {
    if (!data || data.length === 0) {
      return false;
    }

    try {
      // Base64デコードを試行
      const combined = new Uint8Array(
        atob(data).split('').map(char => char.charCodeAt(0))
      );

      // 最小長チェック（IV + 最低限の暗号文）
      if (combined.length <= this.IV_LENGTH + 16) {
        return false;
      }

      // 実際の復号化を試行（テストのみ、結果は使用しない）
      await this.decrypt(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * セキュリティ強化: マスターキーのローテーション
   * 全ての暗号化データを新しいキーで再暗号化
   */
  public static async rotateKey(): Promise<void> {
    console.log('マスターキーローテーションを開始します...');

    try {
      // 現在の設定を取得（復号化済み）
      const { ConfigManager } = await import('./config-manager');
      const currentConfig = await ConfigManager.getConfig();

      // 古いキーを削除
      await chrome.storage.local.remove(this.MASTER_KEY_STORAGE_KEY);
      this.cachedMasterKey = null;

      // 新しいキーで設定を再暗号化して保存
      await ConfigManager.setConfig(currentConfig);

      console.log('マスターキーローテーションが完了しました');
    } catch (error) {
      console.error('マスターキーローテーション中にエラーが発生しました:', error);
      throw new Error('マスターキーローテーションに失敗しました');
    }
  }

  /**
   * 暗号化システムの健全性チェック
   * @returns Promise<boolean> システムが正常な場合true
   */
  public static async healthCheck(): Promise<boolean> {
    try {
      const testData = 'health-check-test-data-' + Date.now();
      
      // 暗号化・復号化のテスト
      const encrypted = await this.encrypt(testData);
      const decrypted = await this.decrypt(encrypted);

      if (decrypted !== testData) {
        console.error('健全性チェック失敗: 復号化データが一致しません');
        return false;
      }

      console.log('暗号化システムの健全性チェックが完了しました');
      return true;
    } catch (error) {
      console.error('健全性チェック中にエラーが発生しました:', error);
      return false;
    }
  }

  /**
   * キャッシュされたキーをクリア（セキュリティ向上のため）
   */
  public static clearKeyCache(): void {
    this.cachedMasterKey = null;
    console.log('マスターキーキャッシュをクリアしました');
  }

  /**
   * 暗号化統計情報の取得（デバッグ・監視用）
   */
  public static async getEncryptionInfo(): Promise<{
    algorithm: string;
    keyLength: number;
    ivLength: number;
    hasStoredKey: boolean;
    cacheStatus: boolean;
  }> {
    const result = await chrome.storage.local.get(this.MASTER_KEY_STORAGE_KEY);
    
    return {
      algorithm: this.ALGORITHM,
      keyLength: this.KEY_LENGTH,
      ivLength: this.IV_LENGTH,
      hasStoredKey: !!result[this.MASTER_KEY_STORAGE_KEY],
      cacheStatus: !!this.cachedMasterKey,
    };
  }
}