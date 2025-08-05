/**
 * Wallabag Chrome拡張機能 - Options Page JavaScript
 * 設定ページのUI管理とAPI連携
 */

// 設定キー
const STORAGE_KEY = 'wallabag_config';
const BEHAVIOR_KEY = 'wallabag_behavior';

// UI要素
let elements = {};

// 初期化
document.addEventListener('DOMContentLoaded', initializeOptionsPage);

/**
 * オプションページの初期化
 */
async function initializeOptionsPage() {
  try {
    // UI要素の取得
    initializeElements();

    // イベントリスナーの設定
    setupEventListeners();

    // 設定の読み込み
    await loadConfiguration();

    // タブの初期化
    initializeTabs();

    console.log('オプションページが初期化されました');
  } catch (error) {
    console.error('オプションページの初期化に失敗しました:', error);
    showMessage('error', '初期化に失敗しました: ' + error.message);
  }
}

/**
 * UI要素の初期化
 */
function initializeElements() {
  elements = {
    // ナビゲーション
    navTabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),

    // 接続設定フォーム
    configForm: document.getElementById('config-form'),
    serverUrl: document.getElementById('server-url'),
    clientId: document.getElementById('client-id'),
    clientSecret: document.getElementById('client-secret'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    vouchProxyMode: document.getElementById('vouch-proxy-mode'),

    // ボタン
    testConnectionBtn: document.getElementById('test-connection'),
    saveConfigBtn: document.getElementById('save-config'),
    toggleSecretBtn: document.getElementById('toggle-secret'),
    togglePasswordBtn: document.getElementById('toggle-password'),

    // 接続状態
    connectionStatus: document.getElementById('connection-status'),
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),

    // 動作設定
    autoTags: document.getElementById('auto-tags'),
    defaultTags: document.getElementById('default-tags'),
    injectButton: document.getElementById('inject-button'),
    showNotifications: document.getElementById('show-notifications'),
    saveBehaviorBtn: document.getElementById('save-behavior'),

    // データ管理
    exportConfigBtn: document.getElementById('export-config'),
    importConfigBtn: document.getElementById('import-config'),
    importFile: document.getElementById('import-file'),
    clearDataBtn: document.getElementById('clear-data'),

    // メッセージ
    successMessage: document.getElementById('success-message'),
    errorMessage: document.getElementById('error-message'),
    infoMessage: document.getElementById('info-message'),
    successText: document.getElementById('success-text'),
    errorText: document.getElementById('error-text'),
    infoText: document.getElementById('info-text'),

    // メッセージ閉じるボタン
    successClose: document.getElementById('success-close'),
    errorClose: document.getElementById('error-close'),
    infoClose: document.getElementById('info-close'),
  };
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
  // タブナビゲーション
  elements.navTabs.forEach((tab) => {
    tab.addEventListener('click', handleTabClick);
  });

  // フォーム送信
  elements.configForm.addEventListener('submit', handleConfigSubmit);

  // ボタンクリック
  elements.testConnectionBtn.addEventListener('click', handleTestConnection);
  elements.saveConfigBtn.addEventListener('click', handleConfigSubmit);
  elements.saveBehaviorBtn.addEventListener('click', handleBehaviorSave);

  // パスワード表示切り替え
  if (elements.toggleSecretBtn) {
    elements.toggleSecretBtn.addEventListener('click', () =>
      togglePasswordVisibility('client-secret')
    );
  }
  if (elements.togglePasswordBtn) {
    elements.togglePasswordBtn.addEventListener('click', () =>
      togglePasswordVisibility('password')
    );
  }

  // データ管理
  elements.exportConfigBtn.addEventListener('click', handleExportConfig);
  elements.importConfigBtn.addEventListener('click', () =>
    elements.importFile.click()
  );
  elements.importFile.addEventListener('change', handleImportConfig);
  elements.clearDataBtn.addEventListener('click', handleClearData);

  // メッセージ閉じる
  elements.successClose.addEventListener('click', () => hideMessage('success'));
  elements.errorClose.addEventListener('click', () => hideMessage('error'));
  elements.infoClose.addEventListener('click', () => hideMessage('info'));

  // 入力検証
  elements.serverUrl.addEventListener('blur', validateServerUrl);
  elements.clientId.addEventListener('blur', validateClientId);
  elements.username.addEventListener('blur', validateUsername);
}

/**
 * タブの初期化
 */
function initializeTabs() {
  // URLパラメータからタブを決定
  const urlParams = new URLSearchParams(window.location.search);
  const tab = urlParams.get('tab') || 'connection';
  switchTab(tab);
}

/**
 * タブクリックハンドラ
 */
function handleTabClick(event) {
  const tabName = event.target.dataset.tab;
  switchTab(tabName);
}

/**
 * タブ切り替え
 */
function switchTab(tabName) {
  // ナビゲーションタブの更新
  elements.navTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // タブコンテンツの更新
  elements.tabContents.forEach((content) => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });

  // URLの更新
  const url = new URL(window.location);
  url.searchParams.set('tab', tabName);
  window.history.replaceState({}, '', url);
}

/**
 * 設定の読み込み
 */
async function loadConfiguration() {
  try {
    // 接続設定の読み込み
    const config = await getConfig();

    if (config.serverUrl) elements.serverUrl.value = config.serverUrl;
    if (config.clientId) elements.clientId.value = config.clientId;
    if (config.clientSecret) elements.clientSecret.value = config.clientSecret;
    if (config.username) elements.username.value = config.username;
    if (config.password) elements.password.value = config.password;
    if (config.vouchProxyMode) elements.vouchProxyMode.checked = config.vouchProxyMode;

    // 動作設定の読み込み
    const behavior = await getBehaviorConfig();

    elements.autoTags.checked = behavior.autoTags || false;
    elements.defaultTags.value = behavior.defaultTags || '';
    elements.injectButton.checked = behavior.injectButton || false;
    elements.showNotifications.checked = behavior.showNotifications !== false; // デフォルトtrue

    // 接続状態の更新
    await updateConnectionStatus();
  } catch (error) {
    console.error('設定の読み込みに失敗しました:', error);
    showMessage('error', '設定の読み込みに失敗しました');
  }
}

/**
 * 設定の取得
 */
async function getConfig() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const config = result[STORAGE_KEY] || {};
    return decryptSensitiveFields(config);
  } catch (error) {
    console.error('設定の取得に失敗しました:', error);
    return {};
  }
}

/**
 * 動作設定の取得
 */
async function getBehaviorConfig() {
  try {
    const result = await chrome.storage.local.get(BEHAVIOR_KEY);
    return result[BEHAVIOR_KEY] || {};
  } catch (error) {
    console.error('動作設定の取得に失敗しました:', error);
    return {};
  }
}

/**
 * 設定フォーム送信ハンドラ
 */
async function handleConfigSubmit(event) {
  event.preventDefault();

  const saveBtn = elements.saveConfigBtn;
  const originalText = saveBtn.innerHTML;

  try {
    // ボタンを無効化
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="btn-icon">⏳</span>保存中...';

    // 設定の収集
    const config = {
      serverUrl: elements.serverUrl.value.trim(),
      clientId: elements.clientId.value.trim(),
      clientSecret: elements.clientSecret.value.trim(),
      username: elements.username.value.trim(),
      password: elements.password.value,
      vouchProxyMode: elements.vouchProxyMode.checked,
    };

    // 検証
    const validation = validateConfig(config);
    if (!validation.valid) {
      showMessage('error', validation.errors.join('、'));
      return;
    }

    // 警告の表示
    if (validation.warnings.length > 0) {
      showMessage('info', validation.warnings.join('、'));
    }

    // 設定の保存
    await setConfig(config);

    // 接続状態の更新
    await updateConnectionStatus();

    showMessage('success', '設定が正常に保存されました');
  } catch (error) {
    console.error('設定の保存に失敗しました:', error);
    showMessage('error', '設定の保存に失敗しました: ' + error.message);
  } finally {
    // ボタンを有効化
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
  }
}

/**
 * 接続テストハンドラ
 */
async function handleTestConnection(event) {
  event.preventDefault();

  const testBtn = elements.testConnectionBtn;
  const originalText = testBtn.innerHTML;

  try {
    // ボタンを無効化
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="btn-icon">⏳</span>テスト中...';

    // 現在の設定を取得
    const config = {
      serverUrl: elements.serverUrl.value.trim(),
      clientId: elements.clientId.value.trim(),
      clientSecret: elements.clientSecret.value.trim(),
      username: elements.username.value.trim(),
      password: elements.password.value,
    };

    // 検証
    const validation = validateConfig(config);
    if (!validation.valid) {
      showMessage('error', '設定が不完全です: ' + validation.errors.join('、'));
      return;
    }

    // 接続テスト
    const success = await testConnection(config);

    if (success) {
      showMessage('success', '接続テストが成功しました');
      updateConnectionStatusDisplay('connected', '接続済み');
    } else {
      showMessage('error', '接続テストに失敗しました');
      updateConnectionStatusDisplay('error', '接続エラー');
    }
  } catch (error) {
    console.error('接続テストに失敗しました:', error);
    showMessage('error', '接続テストに失敗しました: ' + error.message);
    updateConnectionStatusDisplay('error', '接続エラー');
  } finally {
    // ボタンを有効化
    testBtn.disabled = false;
    testBtn.innerHTML = originalText;
  }
}

/**
 * 動作設定保存ハンドラ
 */
async function handleBehaviorSave(event) {
  event.preventDefault();

  const saveBtn = elements.saveBehaviorBtn;
  const originalText = saveBtn.innerHTML;

  try {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="btn-icon">⏳</span>保存中...';

    const behavior = {
      autoTags: elements.autoTags.checked,
      defaultTags: elements.defaultTags.value.trim(),
      injectButton: elements.injectButton.checked,
      showNotifications: elements.showNotifications.checked,
    };

    await setBehaviorConfig(behavior);
    showMessage('success', '動作設定が保存されました');
  } catch (error) {
    console.error('動作設定の保存に失敗しました:', error);
    showMessage('error', '動作設定の保存に失敗しました: ' + error.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
  }
}

/**
 * 設定エクスポートハンドラ
 */
async function handleExportConfig() {
  try {
    const config = await getConfig();
    const behavior = await getBehaviorConfig();

    // 機密情報を除外
    const { ...safeConfig } = config;

    const exportData = {
      config: safeConfig,
      behavior,
      exportDate: new Date().toISOString(),
      version: '1.0.0',
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallabag-extension-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('success', '設定がエクスポートされました');
  } catch (error) {
    console.error('設定のエクスポートに失敗しました:', error);
    showMessage('error', '設定のエクスポートに失敗しました: ' + error.message);
  }
}

/**
 * 設定インポートハンドラ
 */
async function handleImportConfig(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    // データの検証
    if (!importData.config || !importData.behavior) {
      throw new Error('無効な設定ファイルです');
    }

    // 設定の適用
    if (importData.config.serverUrl)
      elements.serverUrl.value = importData.config.serverUrl;
    if (importData.config.clientId)
      elements.clientId.value = importData.config.clientId;
    if (importData.config.username)
      elements.username.value = importData.config.username;

    // 動作設定の適用
    elements.autoTags.checked = importData.behavior.autoTags || false;
    elements.defaultTags.value = importData.behavior.defaultTags || '';
    elements.injectButton.checked = importData.behavior.injectButton || false;
    elements.showNotifications.checked =
      importData.behavior.showNotifications !== false;

    showMessage(
      'success',
      '設定がインポートされました。保存ボタンをクリックして適用してください。'
    );
  } catch (error) {
    console.error('設定のインポートに失敗しました:', error);
    showMessage('error', '設定のインポートに失敗しました: ' + error.message);
  } finally {
    // ファイル入力をクリア
    event.target.value = '';
  }
}

/**
 * データクリアハンドラ
 */
async function handleClearData() {
  if (
    !confirm('すべての設定とデータを削除しますか？この操作は元に戻せません。')
  ) {
    return;
  }

  try {
    await chrome.storage.local.clear();

    // フォームをクリア
    elements.configForm.reset();
    elements.autoTags.checked = false;
    elements.defaultTags.value = '';
    elements.injectButton.checked = false;
    elements.showNotifications.checked = true;

    // 接続状態をリセット
    updateConnectionStatusDisplay('disconnected', '未設定');

    showMessage('success', 'すべてのデータが削除されました');
  } catch (error) {
    console.error('データの削除に失敗しました:', error);
    showMessage('error', 'データの削除に失敗しました: ' + error.message);
  }
}

/**
 * パスワード表示切り替え
 */
function togglePasswordVisibility(fieldId) {
  const field = document.getElementById(fieldId);
  const button = document.getElementById(`toggle-${fieldId.replace('-', '')}`);

  if (field.type === 'password') {
    field.type = 'text';
    button.textContent = '🙈';
  } else {
    field.type = 'password';
    button.textContent = '👁️';
  }
}

/**
 * 設定の保存
 */
async function setConfig(config) {
  const encryptedConfig = encryptSensitiveFields(config);
  await chrome.storage.local.set({
    [STORAGE_KEY]: encryptedConfig,
  });
}

/**
 * 動作設定の保存
 */
async function setBehaviorConfig(behavior) {
  await chrome.storage.local.set({
    [BEHAVIOR_KEY]: behavior,
  });
}

/**
 * 接続テスト
 */
async function testConnection(config) {
  try {
    const url = `${config.serverUrl.replace(/\/$/, '')}/oauth/v2/token`;

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: config.username,
      password: config.password,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (response.ok) {
      const data = await response.json();
      // トークンを保存
      await saveTokens(data.access_token, data.expires_in, data.refresh_token);
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error('接続テストエラー:', error);
    return false;
  }
}

/**
 * トークンの保存
 */
async function saveTokens(accessToken, expiresIn, refreshToken) {
  const config = await getConfig();
  config.accessToken = accessToken;
  config.tokenExpiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  if (refreshToken) {
    config.refreshToken = refreshToken;
  }
  await setConfig(config);
}

/**
 * 接続状態の更新
 */
async function updateConnectionStatus() {
  try {
    const config = await getConfig();
    const validation = validateConfig(config);

    if (!validation.valid) {
      updateConnectionStatusDisplay('disconnected', '未設定');
      return;
    }

    // トークンの有効性をチェック
    if (config.accessToken && config.tokenExpiresAt) {
      const now = Date.now() / 1000;
      const margin = 5 * 60; // 5分のマージン

      if (config.tokenExpiresAt - now > margin) {
        updateConnectionStatusDisplay('connected', '接続済み');
        return;
      }
    }

    updateConnectionStatusDisplay('disconnected', '認証が必要');
  } catch (error) {
    console.error('接続状態の更新に失敗しました:', error);
    updateConnectionStatusDisplay('error', 'エラー');
  }
}

/**
 * 接続状態表示の更新
 */
function updateConnectionStatusDisplay(status, text) {
  elements.connectionStatus.className = `connection-status ${status}`;
  elements.statusText.textContent = text;
}

/**
 * 設定の検証
 */
function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // 必須フィールドの検証
  if (!config.serverUrl?.trim()) errors.push('サーバーURLは必須です');
  if (!config.clientId?.trim()) errors.push('クライアントIDは必須です');
  if (!config.clientSecret?.trim())
    errors.push('クライアントシークレットは必須です');
  if (!config.username?.trim()) errors.push('ユーザー名は必須です');
  if (!config.password?.trim()) errors.push('パスワードは必須です');

  // サーバーURLの検証
  if (config.serverUrl) {
    try {
      new URL(config.serverUrl);
      if (!config.serverUrl.startsWith('https://')) {
        warnings.push('セキュリティのためHTTPSの使用を推奨します');
      }
    } catch {
      errors.push('サーバーURLの形式が正しくありません');
    }
  }

  // その他の検証
  if (config.clientId && config.clientId.length < 8) {
    warnings.push('クライアントIDが短すぎる可能性があります');
  }

  if (config.clientSecret && config.clientSecret.length < 16) {
    warnings.push('クライアントシークレットが短すぎる可能性があります');
  }

  if (config.username && config.username.length < 3) {
    errors.push('ユーザー名は3文字以上で入力してください');
  }

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
 * 個別フィールドの検証
 */
function validateServerUrl() {
  const url = elements.serverUrl.value.trim();
  if (url) {
    try {
      new URL(url);
      elements.serverUrl.classList.remove('invalid');
    } catch {
      elements.serverUrl.classList.add('invalid');
    }
  }
}

function validateClientId() {
  const clientId = elements.clientId.value.trim();
  if (clientId && clientId.length < 8) {
    elements.clientId.classList.add('warning');
  } else {
    elements.clientId.classList.remove('warning');
  }
}

function validateUsername() {
  const username = elements.username.value.trim();
  if (username && username.length < 3) {
    elements.username.classList.add('invalid');
  } else {
    elements.username.classList.remove('invalid');
  }
}

/**
 * 機密フィールドの暗号化
 */
function encryptSensitiveFields(config) {
  const encrypted = { ...config };
  const sensitiveFields = [
    'password',
    'clientSecret',
    'accessToken',
    'refreshToken',
  ];

  for (const field of sensitiveFields) {
    if (encrypted[field]) {
      // 簡単なBase64エンコーディング（実際の実装ではより強力な暗号化を使用）
      encrypted[field] = btoa(encrypted[field]);
    }
  }

  return encrypted;
}

/**
 * 機密フィールドの復号化
 */
function decryptSensitiveFields(config) {
  const decrypted = { ...config };
  const sensitiveFields = [
    'password',
    'clientSecret',
    'accessToken',
    'refreshToken',
  ];

  for (const field of sensitiveFields) {
    if (decrypted[field]) {
      try {
        decrypted[field] = atob(decrypted[field]);
      } catch (error) {
        console.warn(`フィールド ${field} の復号化に失敗しました:`, error);
      }
    }
  }

  return decrypted;
}

/**
 * メッセージの表示
 */
function showMessage(type, message) {
  const messageElement = elements[`${type}Message`];
  const textElement = elements[`${type}Text`];

  textElement.textContent = message;
  messageElement.style.display = 'flex';

  // 5秒後に自動的に隠す
  setTimeout(() => {
    hideMessage(type);
  }, 5000);
}

/**
 * メッセージの非表示
 */
function hideMessage(type) {
  const messageElement = elements[`${type}Message`];
  messageElement.style.display = 'none';
}

// CSS動的追加（検証スタイル）
const style = document.createElement('style');
style.textContent = `
    .form-input.invalid {
        border-color: #dc3545 !important;
        box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.1) !important;
    }
    
    .form-input.warning {
        border-color: #ffc107 !important;
        box-shadow: 0 0 0 3px rgba(255, 193, 7, 0.1) !important;
    }
`;
document.head.appendChild(style);
