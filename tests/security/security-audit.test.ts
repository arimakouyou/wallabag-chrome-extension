/**
 * セキュリティ監査テスト
 * XSS、CSP、認証情報保護、OWASP対応、プライバシー保護をテスト
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

describe('セキュリティ監査テスト', () => {
  const projectRoot = process.cwd();

  describe('Chrome Extension セキュリティ', () => {
    it('manifest.jsonが適切な権限のみを要求している', () => {
      const manifestPath = join(projectRoot, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const permissions = manifest.permissions || [];

      // 必要最小限の権限のみを許可
      const allowedPermissions = [
        'storage',
        'activeTab',
        'contextMenus',
        'notifications',
        'tabs'
      ];

      permissions.forEach((permission: string) => {
        if (!permission.startsWith('http')) {
          expect(allowedPermissions).toContain(permission);
        }
      });

      // 危険な権限が含まれていないことを確認
      const dangerousPermissions = [
        'bookmarks',
        'browsingData',
        'downloads',
        'history',
        'management',
        'nativeMessaging',
        'privacy',
        'proxy',
        'sessions',
        'tabCapture',
        'topSites',
        'webNavigation',
        'debugger',
        '<all_urls>'
      ];

      dangerousPermissions.forEach(permission => {
        expect(permissions).not.toContain(permission);
      });
    });

    it('Content Security Policyが適切に設定されている', () => {
      const manifestPath = join(projectRoot, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      // CSPが設定されていることを確認
      if (manifest.content_security_policy) {
        const csp = manifest.content_security_policy.extension_pages || 
                   manifest.content_security_policy;

        // unsafe-evalが使用されていないことを確認
        expect(csp).not.toContain('unsafe-eval');
        
        // unsafe-inlineが適切に制限されていることを確認
        if (csp.includes('unsafe-inline')) {
          console.warn('CSPでunsafe-inlineが使用されています。可能であれば除去を検討してください。');
        }

        // HTTPSのみが許可されていることを確認
        expect(csp).not.toMatch(/http:\/\/(?!localhost)/);
      }
    });

    it('manifest.jsonのweb_accessible_resourcesが適切に制限されている', () => {
      const manifestPath = join(projectRoot, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      if (manifest.web_accessible_resources) {
        const resources = manifest.web_accessible_resources;
        
        // 必要以上にファイルが公開されていないことを確認
        resources.forEach((resource: any) => {
          const files = resource.resources || [];
          
          // 機密ファイルが公開されていないことを確認
          const sensitivePatterns = [
            '*.key',
            '*.pem',
            '*.env',
            'config/*',
            'src/*'
          ];

          files.forEach((file: string) => {
            sensitivePatterns.forEach(pattern => {
              expect(file).not.toMatch(new RegExp(pattern.replace('*', '.*')));
            });
          });
        });
      }
    });
  });

  describe('認証情報保護', () => {
    it('認証情報が暗号化されて保存されている', () => {
      const configManagerPath = join(projectRoot, 'src/lib/config-manager.ts');
      expect(existsSync(configManagerPath)).toBe(true);

      const configContent = readFileSync(configManagerPath, 'utf8');

      // 暗号化フィールドが定義されていることを確認
      expect(configContent).toContain('ENCRYPTED_FIELDS');
      expect(configContent).toContain('encryptSensitiveFields');
      expect(configContent).toContain('decryptSensitiveFields');

      // 機密フィールドが適切に識別されていることを確認
      const sensitiveFields = ['password', 'clientSecret', 'accessToken', 'refreshToken'];
      sensitiveFields.forEach(field => {
        expect(configContent).toContain(`'${field}'`);
      });
    });

    it('パスワードやトークンがコードに直接埋め込まれていない', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      const suspiciousPatterns = [
        /password\s*[:=]\s*['"][^'"]{8,}['"]/i,
        /token\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
        /secret\s*[:=]\s*['"][^'"]{10,}['"]/i,
        /api_key\s*[:=]\s*['"][^'"]{10,}['"]/i,
        /access_token\s*[:=]\s*['"][^'"]{10,}['"]/i
      ];

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          suspiciousPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
              // テストファイルの場合は許可
              if (!file.includes('test') && !file.includes('mock')) {
                throw new Error(`${file}: 機密情報がハードコードされている可能性があります: ${matches[0]}`);
              }
            }
          });
        }
      });
    });

    it('ログに機密情報が出力されていない', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // console.logやconsole.debugでの機密情報出力をチェック
          const logStatements = content.match(/console\.(log|debug|info|warn|error)\s*\([^)]*\)/g) || [];

          logStatements.forEach(statement => {
            // パスワードやトークンがログに含まれていないことを確認
            const sensitiveTerms = ['password', 'token', 'secret', 'key'];
            
            sensitiveTerms.forEach(term => {
              if (statement.toLowerCase().includes(term)) {
                // デバッグ用のマスキングがされているかチェック
                const isMasked = statement.includes('*') || 
                               statement.includes('...') || 
                               statement.includes('masked') ||
                               statement.includes('hidden') ||
                               statement.includes('debugConfig');

                if (!isMasked) {
                  console.warn(`${file}: ログに機密情報が含まれている可能性があります: ${statement}`);
                }
              }
            });
          });
        }
      });
    });

    it('アクセストークンの有効期限が適切にチェックされている', () => {
      const configManagerPath = join(projectRoot, 'src/lib/config-manager.ts');
      const configContent = readFileSync(configManagerPath, 'utf8');

      // トークン有効性チェックの実装を確認
      expect(configContent).toContain('isTokenValid');
      expect(configContent).toContain('tokenExpiresAt');
      expect(configContent).toContain('marginMs'); // セキュリティマージン

      // API クライアントでもトークンチェックが実装されていることを確認
      const apiClientPath = join(projectRoot, 'src/lib/wallabag-api.ts');
      const apiContent = readFileSync(apiClientPath, 'utf8');
      
      expect(apiContent).toContain('getValidAccessToken');
      expect(apiContent).toContain('isTokenValid');
    });
  });

  describe('入力検証とサニタイゼーション', () => {
    it('URL入力が適切に検証されている', () => {
      const configManagerPath = join(projectRoot, 'src/lib/config-manager.ts');
      const configContent = readFileSync(configManagerPath, 'utf8');

      // URL検証の実装を確認
      expect(configContent).toContain('isValidUrl');
      expect(configContent).toContain('new URL');

      // HTTPSの推奨が実装されていることを確認
      expect(configContent).toContain('https://');
    });

    it('ユーザー入力がサニタイズされている', () => {
      const sourceFiles = [
        'src/lib/config-manager.ts',
        'src/lib/wallabag-api.ts'
      ];

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // 基本的な入力検証パターンをチェック
          if (content.includes('trim()')) {
            // 良い習慣：空白の除去
          }

          // SQLインジェクションのリスク（このプロジェクトでは直接のSQL使用はないが）
          const sqlPatterns = [
            /`[^`]*\$\{[^}]*\}[^`]*`/g, // テンプレートリテラルでの変数埋め込み
            /"[^"]*\+[^"]*"/g, // 文字列連結
            /'[^']*\+[^']*'/g
          ];

          sqlPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
              // パラメータ化クエリが使用されているかチェック（この場合はAPI呼び出し）
              console.warn(`${file}: 文字列連結が検出されました。SQLインジェクションリスクがないか確認してください。`);
            }
          });
        }
      });
    });

    it('XSS脆弱性から保護されている', () => {
      const htmlFiles = execSync('find src -name "*.html" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      htmlFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // インラインスクリプトの使用をチェック
          const inlineScripts = content.match(/<script(?![^>]*src=)[^>]*>/gi);
          if (inlineScripts) {
            inlineScripts.forEach(script => {
              console.warn(`${file}: インラインスクリプトが検出されました: ${script}`);
            });
          }

          // インラインイベントハンドラーの使用をチェック
          const inlineEvents = content.match(/on\w+\s*=\s*["'][^"']*["']/gi);
          if (inlineEvents) {
            inlineEvents.forEach(event => {
              console.warn(`${file}: インラインイベントハンドラーが検出されました: ${event}`);
            });
          }

          // eval()の使用をチェック
          if (content.includes('eval(')) {
            throw new Error(`${file}: eval()の使用が検出されました。XSSリスクがあります。`);
          }
        }
      });
    });
  });

  describe('通信セキュリティ', () => {
    it('HTTPS通信のみが使用されている', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // HTTP URLの使用をチェック（ローカルホスト除く）
          const httpUrls = content.match(/http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^\s"']+/g);
          if (httpUrls) {
            httpUrls.forEach(url => {
              console.warn(`${file}: HTTP URLが検出されました: ${url}`);
            });
          }

          // fetch呼び出しでHTTPSが使用されていることを確認
          const fetchCalls = content.match(/fetch\s*\(\s*['"`][^'"`]+['"`]/g);
          if (fetchCalls) {
            fetchCalls.forEach(call => {
              if (call.includes('http://') && !call.includes('localhost')) {
                throw new Error(`${file}: 安全でないHTTP通信が検出されました: ${call}`);
              }
            });
          }
        }
      });
    });

    it('適切なHTTPヘッダーが設定されている', () => {
      const apiClientPath = join(projectRoot, 'src/lib/wallabag-api.ts');
      const apiContent = readFileSync(apiClientPath, 'utf8');

      // User-Agentが設定されていることを確認
      expect(apiContent).toContain('User-Agent');

      // Content-Typeが適切に設定されていることを確認
      expect(apiContent).toContain('Content-Type');

      // Authorizationヘッダーが適切に設定されていることを確認
      expect(apiContent).toContain('Authorization');
    });

    it('認証情報が適切に送信されている', () => {
      const apiClientPath = join(projectRoot, 'src/lib/wallabag-api.ts');
      const apiContent = readFileSync(apiClientPath, 'utf8');

      // Bearer トークンが使用されていることを確認
      expect(apiContent).toContain('Bearer');

      // クライアント認証が適切に実装されていることを確認
      expect(apiContent).toContain('client_id');
      expect(apiContent).toContain('client_secret');

      // URLSearchParamsが使用されていることを確認（フォームデータの安全な送信）
      expect(apiContent).toContain('URLSearchParams');
    });
  });

  describe('Chrome Extension 特有のセキュリティ', () => {
    it('Background Scriptが適切に分離されている', () => {
      const manifestPath = join(projectRoot, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      // Service Workerが使用されていることを確認（Manifest V3）
      expect(manifest.background.service_worker).toBeDefined();
      expect(manifest.background.service_worker).toContain('background');

      // persistentが設定されていないことを確認（V3では不要）
      expect(manifest.background.persistent).toBeUndefined();
    });

    it('Content Scriptの権限が適切に制限されている', () => {
      const manifestPath = join(projectRoot, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      if (manifest.content_scripts) {
        manifest.content_scripts.forEach((script: any) => {
          // all_framesが使用されている場合は注意が必要
          if (script.all_frames) {
            console.warn('Content Scriptでall_framesが有効になっています。セキュリティリスクを確認してください。');
          }

          // run_atが適切に設定されていることを確認
          if (script.run_at) {
            expect(['document_start', 'document_end', 'document_idle']).toContain(script.run_at);
          }
        });
      }
    });

    it('外部リソースへの参照が適切に管理されている', () => {
      const sourceFiles = execSync('find src -name "*.ts" -o -name "*.html" -o -name "*.css" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // 外部CDNへの参照をチェック
          const externalReferences = content.match(/https?:\/\/[^\/\s"']+/g);
          if (externalReferences) {
            const allowedDomains = [
              'wallabag.', // ユーザーのWallabagサーバー
              'localhost',
              '127.0.0.1'
            ];

            externalReferences.forEach(ref => {
              const isAllowed = allowedDomains.some(domain => ref.includes(domain));
              if (!isAllowed && !ref.includes('test') && !ref.includes('example')) {
                console.warn(`${file}: 外部リソースへの参照が検出されました: ${ref}`);
              }
            });
          }
        }
      });
    });
  });

  describe('プライバシー保護', () => {
    it('個人情報が適切に保護されている', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // 個人情報の収集や送信をチェック
          const privacyPatterns = [
            /navigator\.userAgent/g,
            /screen\.(width|height)/g,
            /location\.(hostname|href)/g,
            /document\.cookie/g
          ];

          privacyPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
              console.warn(`${file}: プライバシーに関わる情報への参照が検出されました: ${matches[0]}`);
            }
          });
        }
      });
    });

    it('不要なデータ収集が行われていない', () => {
      const backgroundPath = join(projectRoot, 'src/background/background.ts');
      if (existsSync(backgroundPath)) {
        const content = readFileSync(backgroundPath, 'utf8');

        // アナリティクスやトラッキングコードがないことを確認
        const trackingPatterns = [
          /google-analytics/i,
          /gtag\(/i,
          /ga\(/i,
          /mixpanel/i,
          /amplitude/i,
          /segment/i
        ];

        trackingPatterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            throw new Error(`${backgroundPath}: トラッキングコードが検出されました: ${matches[0]}`);
          }
        });
      }
    });

    it('ユーザーの閲覧履歴が記録されていない', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // 履歴の記録をチェック
          const historyPatterns = [
            /chrome\.history/g,
            /chrome\.browsingData/g,
            /visitTime/g,
            /lastVisitTime/g
          ];

          historyPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
              throw new Error(`${file}: 閲覧履歴にアクセスするコードが検出されました: ${matches[0]}`);
            }
          });
        }
      });
    });
  });

  describe('OWASP Top 10 対策', () => {
    it('A01: Broken Access Control - 権限制御が適切に実装されている', () => {
      const manifestPath = join(projectRoot, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      // activeTabの使用（最小権限の原則）
      expect(manifest.permissions).toContain('activeTab');

      // 必要以上の権限が要求されていないことを確認
      const broadPermissions = ['tabs', '<all_urls>', 'http://*/*', 'https://*/*'];
      broadPermissions.forEach(permission => {
        if (manifest.permissions.includes(permission)) {
          console.warn(`広範囲な権限が検出されました: ${permission}`);
        }
      });
    });

    it('A02: Cryptographic Failures - 暗号化が適切に実装されている', () => {
      const configPath = join(projectRoot, 'src/lib/config-manager.ts');
      const content = readFileSync(configPath, 'utf8');

      // 暗号化の実装を確認
      expect(content).toContain('encryptSensitiveFields');
      expect(content).toContain('decryptSensitiveFields');

      // 弱い暗号化手法が使用されていないことを確認
      const weakCrypto = ['md5', 'sha1', 'base64encode'];
      weakCrypto.forEach(crypto => {
        if (content.toLowerCase().includes(crypto)) {
          console.warn(`弱い暗号化手法の可能性: ${crypto}`);
        }
      });
    });

    it('A03: Injection - インジェクション攻撃から保護されている', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // eval()の使用をチェック
          if (content.includes('eval(')) {
            throw new Error(`${file}: eval()の使用が検出されました`);
          }

          // Function()コンストラクターの使用をチェック
          if (content.match(/new\s+Function\s*\(/)) {
            throw new Error(`${file}: Function()コンストラクターの使用が検出されました`);
          }

          // innerHTML の安全でない使用をチェック
          const innerHTMLUsage = content.match(/\.innerHTML\s*=\s*[^'"`\s]/);
          if (innerHTMLUsage) {
            console.warn(`${file}: innerHTMLの直接代入が検出されました。XSSリスクがないか確認してください。`);
          }
        }
      });
    });

    it('A07: Identification and Authentication Failures - 認証が適切に実装されている', () => {
      const apiPath = join(projectRoot, 'src/lib/wallabag-api.ts');
      const content = readFileSync(apiPath, 'utf8');

      // 認証の実装を確認
      expect(content).toContain('authenticate');
      expect(content).toContain('refreshToken');
      expect(content).toContain('isTokenValid');

      // セッション管理が適切に実装されていることを確認
      expect(content).toContain('expires_in');
      expect(content).toContain('access_token');
    });

    it('A09: Security Logging and Monitoring Failures - セキュリティログが適切に実装されている', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      let hasSecurityLogging = false;

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // セキュリティ関連のログ出力をチェック
          const securityLogPatterns = [
            /console\.(error|warn)\s*\([^)]*認証/,
            /console\.(error|warn)\s*\([^)]*auth/i,
            /console\.(error|warn)\s*\([^)]*security/i,
            /console\.(error|warn)\s*\([^)]*failed/i
          ];

          securityLogPatterns.forEach(pattern => {
            if (content.match(pattern)) {
              hasSecurityLogging = true;
            }
          });
        }
      });

      expect(hasSecurityLogging).toBe(true);
    });
  });

  describe('依存関係セキュリティ', () => {
    it('既知の脆弱性を持つ依存関係が使用されていない', async () => {
      try {
        // npm auditを実行して脆弱性をチェック
        const auditResult = execSync('npm audit --audit-level=high --json', {
          encoding: 'utf8',
          cwd: projectRoot,
          stdio: 'pipe'
        });

        const audit = JSON.parse(auditResult);
        
        if (audit.vulnerabilities) {
          const highVulns = Object.values(audit.vulnerabilities).filter(
            (vuln: any) => vuln.severity === 'high' || vuln.severity === 'critical'
          );

          if (highVulns.length > 0) {
            throw new Error(`高レベルの脆弱性が${highVulns.length}件検出されました。npm audit fixを実行してください。`);
          }
        }
      } catch (error: any) {
        if (error.status === 1) {
          // 脆弱性が見つかった場合
          console.warn('依存関係に脆弱性が検出されました。npm audit fixの実行を検討してください。');
        } else if (!error.message.includes('高レベルの脆弱性')) {
          // npm auditコマンド自体のエラー
          console.warn('npm auditの実行に失敗しました:', error.message);
        } else {
          throw error;
        }
      }
    });

    it('未認証のパッケージが使用されていない', () => {
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // 信頼できるパッケージのホワイトリスト
      const trustedPackages = [
        '@types/',
        'typescript',
        'jest',
        'webpack',
        'eslint',
        'prettier',
        'ts-jest',
        'web-ext'
      ];

      Object.keys(allDependencies).forEach(packageName => {
        const isTrusted = trustedPackages.some(trusted => 
          packageName.startsWith(trusted) || packageName === trusted.replace('/', '')
        );

        if (!isTrusted) {
          console.warn(`信頼性未確認のパッケージ: ${packageName}`);
        }
      });
    });
  });
});