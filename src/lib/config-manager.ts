/**
 * Wallabag Chrome拡張機能 - 設定管理システム
 * Chrome Storage APIを使用した設定の保存・取得・検証
 */

import { Config, ConfigValidationResult } from './types';

/**
 * 設定管理クラス
 * Chrome Storage APIを使用してWallabag設定を管理
 */
export class ConfigManager {
  private static readonly STORAGE_KEY = 'wallabag_config';
  private static readonly ENCRYPTED_FIELDS = [
    'password',
    'clientSecret',
    'accessToken',
    'refreshToken',
  ];

  /**
   * 設定を取得
   * @returns 設定オブジェクト（未設定の場合は空のオブジェクト）
   */
  static async getConfig(): Promise<Partial<Config>> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const config = result[this.STORAGE_KEY] || {};

      // 暗号化されたフィールドを復号化
      return this.decryptSensitiveFields(config);
    } catch (error) {
      console.error('設定の取得に失敗しました:', error);
      return {};
    }
  }

  /**
   * 設定を保存
   * @param config 保存する設定
   */
  static async setConfig(config: Partial<Config>): Promise<void> {
    try {
      // 機密情報を暗号化
      const encryptedConfig = this.encryptSensitiveFields(config);

      await chrome.storage.local.set({
        [this.STORAGE_KEY]: encryptedConfig,
      });

      console.log('設定が正常に保存されました');
    } catch (error) {
      console.error('設定の保存に失敗しました:', error);
      throw new Error('設定の保存に失敗しました');
    }
  }

  /**
   * 設定を更新（部分更新）
   * @param updates 更新する設定項目
   */
  static async updateConfig(updates: Partial<Config>): Promise<void> {
    const currentConfig = await this.getConfig();
    const mergedConfig = { ...currentConfig, ...updates };
    await this.setConfig(mergedConfig);
  }

  /**
   * 設定をクリア
   */
  static async clearConfig(): Promise<void> {
    try {
      await chrome.storage.local.remove(this.STORAGE_KEY);
      console.log('設定がクリアされました');
    } catch (error) {
      console.error('設定のクリアに失敗しました:', error);
      throw new Error('設定のクリアに失敗しました');
    }
  }

  /**
   * 設定の検証
   * @param config 検証する設定
   * @returns 検証結果
   */
  static validateConfig(config: Partial<Config>): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必須フィールドの検証
    const requiredFields: (keyof Config)[] = [
      'serverUrl',
      'clientId',
      'clientSecret',
      'username',
      'password',
    ];

    for (const field of requiredFields) {
      if (!config[field] || String(config[field]).trim() === '') {
        errors.push(`${this.getFieldDisplayName(field)}は必須です`);
      }
    }

    // サーバーURLの検証
    if (config.serverUrl) {
      if (!this.isValidUrl(config.serverUrl)) {
        errors.push('サーバーURLの形式が正しくありません');
      } else if (!config.serverUrl.startsWith('https://')) {
        warnings.push('セキュリティのためHTTPSの使用を推奨します');
      }
    }

    // クライアントIDの検証
    if (config.clientId && config.clientId.length < 8) {
      warnings.push('クライアントIDが短すぎる可能性があります');
    }

    // クライアントシークレットの検証
    if (config.clientSecret && config.clientSecret.length < 16) {
      warnings.push('クライアントシークレットが短すぎる可能性があります');
    }

    // ユーザー名の検証
    if (config.username && config.username.length < 3) {
      errors.push('ユーザー名は3文字以上で入力してください');
    }

    // パスワードの検証
    if (config.password && config.password.length < 4) {
      warnings.push('パスワードが短すぎる可能性があります');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 設定が完了しているかチェック
   * @returns 設定完了フラグ
   */
  static async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    const validation = this.validateConfig(config);
    return validation.valid;
  }

  /**
   * 認証情報が設定されているかチェック
   * @returns 認証情報の有無
   */
  static async hasAuthCredentials(): Promise<boolean> {
    const config = await this.getConfig();
    return !!(
      config.serverUrl &&
      config.clientId &&
      config.clientSecret &&
      config.username &&
      config.password
    );
  }

  /**
   * アクセストークンの有効性をチェック
   * @returns トークンの有効性
   */
  static async isTokenValid(): Promise<boolean> {
    const config = await this.getConfig();

    if (!config.accessToken || !config.tokenExpiresAt) {
      return false;
    }

    // 現在時刻から5分のマージンを持たせてチェック
    const now = Date.now();
    const expiresAt = config.tokenExpiresAt * 1000; // ミリ秒に変換
    const marginMs = 5 * 60 * 1000; // 5分のマージン

    return expiresAt - now > marginMs;
  }

  /**
   * 認証トークンを保存
   * @param accessToken アクセストークン
   * @param expiresIn 有効期限（秒）
   * @param refreshToken リフレッシュトークン
   */
  static async saveTokens(
    accessToken: string,
    expiresIn: number,
    refreshToken?: string
  ): Promise<void> {
    const tokenExpiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    const updates: Partial<Config> = {
      accessToken,
      tokenExpiresAt,
    };

    if (refreshToken) {
      updates.refreshToken = refreshToken;
    }

    await this.updateConfig(updates);
  }

  /**
   * 認証トークンをクリア
   */
  static async clearTokens(): Promise<void> {
    const config = await this.getConfig();
    delete config.accessToken;
    delete config.refreshToken;
    delete config.tokenExpiresAt;
    await this.setConfig(config);
  }

  /**
   * 設定のエクスポート（機密情報を除く）
   * @returns エクスポート用設定
   */
  static async exportConfig(): Promise<Partial<Config>> {
    const config = await this.getConfig();

    // 機密情報を除外
    const { ...safeConfig } = config;

    return safeConfig;
  }

  /**
   * 機密フィールドの暗号化
   * @param config 設定オブジェクト
   * @returns 暗号化された設定
   */
  private static encryptSensitiveFields(
    config: Partial<Config>
  ): Partial<Config> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newConfig: any = {};
    for (const key in config) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        const value = config[key as keyof Config];
        if (this.ENCRYPTED_FIELDS.includes(key) && typeof value === 'string') {
          newConfig[key as keyof Config] = btoa(value);
        } else {
          newConfig[key as keyof Config] = value;
        }
      }
    }
    return newConfig;
  }

  /**
   * 機密フィールドの復号化
   * @param config 暗号化された設定オブジェクト
   * @returns 復号化された設定
   */
  private static decryptSensitiveFields(
    config: Partial<Config>
  ): Partial<Config> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newConfig: any = {};
    for (const key in config) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        const value = config[key as keyof Config];
        if (this.ENCRYPTED_FIELDS.includes(key) && typeof value === 'string') {
          try {
            newConfig[key as keyof Config] = atob(value);
          } catch (error) {
            console.warn(`フィールド ${key} の復号化に失敗しました:`, error);
            newConfig[key as keyof Config] = value;
          }
        } else {
          newConfig[key as keyof Config] = value;
        }
      }
    }
    return newConfig;
  }

  /**
   * URLの妥当性をチェック
   * @param url チェックするURL
   * @returns URLの妥当性
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * フィールド名の表示名を取得
   * @param field フィールド名
   * @returns 表示名
   */
  private static getFieldDisplayName(field: keyof Config): string {
    const displayNames: Record<keyof Config, string> = {
      serverUrl: 'サーバーURL',
      clientId: 'クライアントID',
      clientSecret: 'クライアントシークレット',
      username: 'ユーザー名',
      password: 'パスワード',
      accessToken: 'アクセストークン',
      refreshToken: 'リフレッシュトークン',
      tokenExpiresAt: 'トークン有効期限',
    };

    return displayNames[field] || field;
  }

  /**
   * 設定変更の監視
   * @param callback 設定変更時のコールバック
   */
  static addConfigChangeListener(
    callback: (changes: chrome.storage.StorageChange) => void
  ): void {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes[this.STORAGE_KEY]) {
        callback(changes[this.STORAGE_KEY]);
      }
    };

    chrome.storage.onChanged.addListener(listener);
  }

  /**
   * デバッグ用：現在の設定を表示（機密情報は隠す）
   */
  static async debugConfig(): Promise<void> {
    const config = await this.getConfig();
    const safeConfig = { ...config };

    // 機密情報をマスク
    if (safeConfig.password)
      safeConfig.password = '*'.repeat(safeConfig.password.length);
    if (safeConfig.clientSecret)
      safeConfig.clientSecret =
        '*'.repeat(8) + safeConfig.clientSecret.slice(-4);
    if (safeConfig.accessToken)
      safeConfig.accessToken = safeConfig.accessToken.slice(0, 8) + '...';
    if (safeConfig.refreshToken)
      safeConfig.refreshToken = safeConfig.refreshToken.slice(0, 8) + '...';

    console.log('現在の設定:', safeConfig);
  }
}
