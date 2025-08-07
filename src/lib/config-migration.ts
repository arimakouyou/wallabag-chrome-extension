/**
 * Wallabag Chrome拡張機能 - 設定マイグレーション管理
 * Base64からWeb Crypto APIへの安全な移行処理
 */

import { ConfigManager } from './config-manager';
import { SecureCryptoManager } from './secure-crypto-manager';

/**
 * 設定データのマイグレーション管理クラス
 * 既存のBase64エンコーディングからWeb Crypto API暗号化への移行を管理
 */
export class ConfigMigration {
  private static readonly MIGRATION_KEY = 'migration_status';
  private static readonly CURRENT_VERSION = '2.0.0';

  /**
   * マイグレーションが必要かチェック
   * @returns Promise<boolean> マイグレーションが必要な場合true
   */
  static async needsMigration(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(this.MIGRATION_KEY);
      const migrationStatus = result[this.MIGRATION_KEY];

      // マイグレーション情報がない場合は必要
      if (!migrationStatus) {
        return true;
      }

      // バージョンチェック
      return migrationStatus.version !== this.CURRENT_VERSION;
    } catch (error) {
      console.error('マイグレーション必要性のチェックに失敗しました:', error);
      return true; // エラー時は安全のためマイグレーション実行
    }
  }

  /**
   * Base64データをWeb Crypto API暗号化に移行
   * 既存の設定を安全に新しい暗号化形式に変換
   */
  static async migrateFromBase64(): Promise<void> {
    console.log('Base64からWeb Crypto APIへのマイグレーションを開始します...');

    try {
      // 既存設定の取得（直接ストレージから取得してマイグレーション防止）
      const result = await chrome.storage.local.get(ConfigManager['STORAGE_KEY']);
      const config = result[ConfigManager['STORAGE_KEY']] || {};

      if (Object.keys(config).length === 0) {
        console.log('移行対象の設定データがありません');
        await this.markMigrationComplete();
        return;
      }

      let needsMigration = false;
      const migratedConfig: any = { ...config };
      const encryptedFields = ConfigManager['ENCRYPTED_FIELDS'];

      // 各機密フィールドをチェック・移行
      for (const key of encryptedFields) {
        if ((config as any)[key] && typeof (config as any)[key] === 'string' && (config as any)[key].length > 0) {
          try {
            // Base64データかどうかを判定
            if (SecureCryptoManager.isBase64Data((config as any)[key])) {
              console.log(`フィールド ${key} をBase64からWeb Crypto APIに移行中...`);
              
              // Base64デコード
              const decoded = atob((config as any)[key]);
              migratedConfig[key] = decoded;
              needsMigration = true;
              
              console.log(`✅ フィールド ${key} の移行が完了しました`);
            } else if (await SecureCryptoManager.isWebCryptoData((config as any)[key])) {
              console.log(`フィールド ${key} は既にWeb Crypto API形式です`);
            } else {
              console.log(`フィールド ${key} はプレーンテキストまたは不明な形式です`);
            }
          } catch (error) {
            console.error(`フィールド ${key} の移行中にエラーが発生しました:`, error);
            // エラーが発生したフィールドは空にして再入力を促す
            migratedConfig[key] = '';
          }
        }
      }

      if (needsMigration) {
        // ConfigManagerを通して再保存（Web Crypto API暗号化が適用される）
        await ConfigManager.setConfig(migratedConfig);
        console.log('✅ 設定のマイグレーションが完了しました');
      } else {
        console.log('マイグレーション対象のデータがありませんでした');
      }

      // マイグレーション完了をマーク
      await this.markMigrationComplete();

    } catch (error) {
      console.error('マイグレーション中にエラーが発生しました:', error);
      
      // エラー情報を保存
      await this.markMigrationError(error);
      throw new Error(`設定の移行に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 強制的な完全マイグレーション
   * 全てのデータをクリアして新しい形式で再構築
   */
  static async forceFullMigration(): Promise<void> {
    console.log('強制的な完全マイグレーションを開始します...');

    try {
      // 暗号化システムの健全性チェック
      const isHealthy = await SecureCryptoManager.healthCheck();
      if (!isHealthy) {
        throw new Error('暗号化システムが正常に動作していません');
      }

      // 既存の全設定をクリア
      await ConfigManager.clearConfig();
      
      // マスターキーもクリアして新規生成
      await chrome.storage.local.remove('secure_master_key');
      SecureCryptoManager.clearKeyCache();

      // マイグレーション状態をリセット
      await chrome.storage.local.remove(this.MIGRATION_KEY);

      console.log('✅ 完全マイグレーションが完了しました（設定の再入力が必要です）');
    } catch (error) {
      console.error('完全マイグレーション中にエラーが発生しました:', error);
      throw error;
    }
  }

  /**
   * マイグレーション完了をマーク
   */
  private static async markMigrationComplete(): Promise<void> {
    const migrationInfo = {
      version: this.CURRENT_VERSION,
      completedAt: new Date().toISOString(),
      method: 'base64_to_webcrypto',
      status: 'completed'
    };

    await chrome.storage.local.set({
      [this.MIGRATION_KEY]: migrationInfo
    });

    console.log('マイグレーション完了情報を保存しました');
  }

  /**
   * マイグレーションエラーをマーク
   */
  private static async markMigrationError(error: unknown): Promise<void> {
    const migrationInfo = {
      version: this.CURRENT_VERSION,
      errorAt: new Date().toISOString(),
      method: 'base64_to_webcrypto',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await chrome.storage.local.set({
      [this.MIGRATION_KEY]: migrationInfo
    });
  }

  /**
   * マイグレーション状態の取得
   */
  static async getMigrationStatus(): Promise<{
    version: string;
    status: 'completed' | 'error' | 'pending';
    timestamp?: string;
    error?: string;
  }> {
    try {
      const result = await chrome.storage.local.get(this.MIGRATION_KEY);
      const migrationInfo = result[this.MIGRATION_KEY];

      if (!migrationInfo) {
        return { version: 'unknown', status: 'pending' };
      }

      return {
        version: migrationInfo.version || 'unknown',
        status: migrationInfo.status || 'pending',
        timestamp: migrationInfo.completedAt || migrationInfo.errorAt,
        error: migrationInfo.error
      };
    } catch (error) {
      console.error('マイグレーション状態の取得に失敗しました:', error);
      return { version: 'unknown', status: 'error', error: 'Failed to get status' };
    }
  }

  /**
   * 暗号化システムの互換性チェック
   * 古い形式と新しい形式の両方に対応できるかテスト
   */
  static async compatibilityCheck(): Promise<{
    webCryptoSupported: boolean;
    base64Detection: boolean;
    encryptionHealth: boolean;
    overallStatus: 'ready' | 'needs_migration' | 'error';
  }> {
    const result = {
      webCryptoSupported: false,
      base64Detection: false,
      encryptionHealth: false,
      overallStatus: 'error' as 'ready' | 'needs_migration' | 'error'
    };

    try {
      // Web Crypto APIサポートチェック
      result.webCryptoSupported = !!(window.crypto && window.crypto.subtle);

      // Base64検出機能チェック
      const testBase64 = btoa('test-data');
      result.base64Detection = SecureCryptoManager.isBase64Data(testBase64);

      // 暗号化システムの健全性チェック
      result.encryptionHealth = await SecureCryptoManager.healthCheck();

      // 総合ステータス判定
      if (result.webCryptoSupported && result.base64Detection && result.encryptionHealth) {
        const needsMigration = await this.needsMigration();
        result.overallStatus = needsMigration ? 'needs_migration' : 'ready';
      }

    } catch (error) {
      console.error('互換性チェック中にエラーが発生しました:', error);
    }

    return result;
  }

  /**
   * 自動マイグレーション実行
   * システム起動時に自動的に実行される安全なマイグレーション
   */
  static async autoMigrate(): Promise<void> {
    try {
      // 互換性チェック
      const compatibility = await this.compatibilityCheck();
      
      if (compatibility.overallStatus === 'error') {
        console.error('システム互換性エラーのため、自動マイグレーションをスキップします');
        return;
      }

      if (compatibility.overallStatus === 'needs_migration') {
        console.log('自動マイグレーションを開始します...');
        await this.migrateFromBase64();
        console.log('✅ 自動マイグレーションが完了しました');
      } else {
        console.log('マイグレーション不要です');
      }

    } catch (error) {
      console.error('自動マイグレーション中にエラーが発生しました:', error);
      // 自動マイグレーションでエラーが発生した場合は、手動実行を促す
      console.warn('手動でのマイグレーション実行を検討してください');
    }
  }
}