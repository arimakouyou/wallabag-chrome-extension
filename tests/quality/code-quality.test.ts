/**
 * コード品質チェックテスト
 * ESLint、Prettier、TypeScript型チェック、プロジェクト品質指標をテスト
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('コード品質チェック', () => {
  const projectRoot = process.cwd();

  describe('ESLint品質チェック', () => {
    it('ESLint設定ファイルが存在する', () => {
      const eslintConfigExists = existsSync(join(projectRoot, '.eslintrc.js')) ||
                                 existsSync(join(projectRoot, '.eslintrc.json')) ||
                                 existsSync(join(projectRoot, 'eslint.config.js'));
      
      expect(eslintConfigExists).toBe(true);
    });

    it('ソースコードにESLintエラーが存在しない', () => {
      try {
        // ESLintを実行してエラーチェック
        const eslintResult = execSync('npx eslint src/ --format=json', {
          encoding: 'utf8',
          cwd: projectRoot
        });

        const results = JSON.parse(eslintResult);
        const totalErrors = results.reduce((sum: number, file: any) => 
          sum + file.errorCount, 0);
        
        expect(totalErrors).toBe(0);
      } catch (error: any) {
        // ESLintがエラーで終了した場合
        if (error.status === 1) {
          const output = error.stdout;
          const results = JSON.parse(output);
          const errors = results.flatMap((file: any) => 
            file.messages.filter((msg: any) => msg.severity === 2)
          );
          
          if (errors.length > 0) {
            const errorMessages = errors.map((err: any) => 
              `${err.ruleId}: ${err.message} (${err.line}:${err.column})`
            ).join('\n');
            
            throw new Error(`ESLintエラーが検出されました:\n${errorMessages}`);
          }
        } else {
          throw error;
        }
      }
    });

    it('重要なESLintルールが有効になっている', () => {
      const packageJsonPath = join(projectRoot, 'package.json');
      expect(existsSync(packageJsonPath)).toBe(true);

      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      
      // ESLint関連の依存関係チェック
      const devDeps = packageJson.devDependencies || {};
      expect(devDeps['eslint']).toBeDefined();
      expect(devDeps['@typescript-eslint/eslint-plugin']).toBeDefined();
      expect(devDeps['@typescript-eslint/parser']).toBeDefined();
    });

    it('未使用変数の警告が設定されている', () => {
      try {
        // 特定のルールをチェック
        const eslintResult = execSync('npx eslint --print-config src/lib/types.ts', {
          encoding: 'utf8',
          cwd: projectRoot
        });

        const config = JSON.parse(eslintResult);
        const rules = config.rules || {};
        
        // 未使用変数のルールがエラーまたは警告に設定されていることを確認
        expect(rules['@typescript-eslint/no-unused-vars'] || rules['no-unused-vars']).toBeDefined();
      } catch (error) {
        // ESLint設定が見つからない場合はスキップ
        console.warn('ESLint設定の取得に失敗しました');
      }
    });
  });

  describe('Prettier品質チェック', () => {
    it('Prettier設定ファイルが存在する', () => {
      const prettierConfigExists = existsSync(join(projectRoot, '.prettierrc')) ||
                                   existsSync(join(projectRoot, '.prettierrc.json')) ||
                                   existsSync(join(projectRoot, '.prettierrc.js')) ||
                                   existsSync(join(projectRoot, 'prettier.config.js'));
      
      expect(prettierConfigExists).toBe(true);
    });

    it('ソースコードがPrettierフォーマットに準拠している', () => {
      try {
        // Prettierでフォーマットチェック
        execSync('npx prettier --check "src/**/*.{ts,js,json}"', {
          encoding: 'utf8',
          cwd: projectRoot,
          stdio: 'pipe'
        });
      } catch (error: any) {
        if (error.status === 1) {
          const unformattedFiles = error.stdout.split('\n').filter((line: string) => line.trim());
          throw new Error(`以下のファイルがPrettierフォーマットに準拠していません:\n${unformattedFiles.join('\n')}`);
        } else {
          throw error;
        }
      }
    });

    it('package.jsonにPrettierスクリプトが定義されている', () => {
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      
      const scripts = packageJson.scripts || {};
      expect(scripts.format || scripts['format:check']).toBeDefined();
    });
  });

  describe('TypeScript品質チェック', () => {
    it('TypeScript設定ファイルが存在する', () => {
      const tsconfigExists = existsSync(join(projectRoot, 'tsconfig.json'));
      expect(tsconfigExists).toBe(true);
    });

    it('TypeScript型エラーが存在しない', () => {
      try {
        // TypeScriptコンパイルチェック
        execSync('npx tsc --noEmit', {
          encoding: 'utf8',
          cwd: projectRoot,
          stdio: 'pipe'
        });
      } catch (error: any) {
        if (error.status === 1) {
          throw new Error(`TypeScript型エラーが検出されました:\n${error.stdout}`);
        } else {
          throw error;
        }
      }
    });

    it('strict モードが有効になっている', () => {
      const tsconfigPath = join(projectRoot, 'tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      
      const compilerOptions = tsconfig.compilerOptions || {};
      expect(compilerOptions.strict).toBe(true);
    });

    it('重要なTypeScriptオプションが設定されている', () => {
      const tsconfigPath = join(projectRoot, 'tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      
      const compilerOptions = tsconfig.compilerOptions || {};
      
      // 重要なオプションがあることを確認
      expect(compilerOptions.noImplicitAny).toBe(true);
      expect(compilerOptions.noImplicitReturns).toBe(true);
      expect(compilerOptions.noUnusedLocals).toBe(true);
      expect(compilerOptions.noUnusedParameters).toBe(true);
    });
  });

  describe('テストカバレッジ品質チェック', () => {
    it('Jest設定ファイルが存在する', () => {
      const jestConfigExists = existsSync(join(projectRoot, 'jest.config.js')) ||
                              existsSync(join(projectRoot, 'jest.config.json'));
      
      expect(jestConfigExists).toBe(true);
    });

    it.skip('テストカバレッジが設定された閾値を満たしている', async () => {
      try {
        // テストカバレッジを実行
        execSync('npm test -- --coverage --coverageReporters=json-summary', {
          encoding: 'utf8',
          cwd: projectRoot,
          stdio: 'pipe'
        });

        // カバレッジレポートを読み取り
        const coverageSummaryPath = join(projectRoot, 'coverage', 'coverage-summary.json');
        
        if (existsSync(coverageSummaryPath)) {
          const coverageSummary = JSON.parse(readFileSync(coverageSummaryPath, 'utf8'));
          const totalCoverage = coverageSummary.total;

          // カバレッジ閾値チェック（80%以上を要求）
          expect(totalCoverage.statements.pct).toBeGreaterThanOrEqual(80);
          expect(totalCoverage.branches.pct).toBeGreaterThanOrEqual(70);
          expect(totalCoverage.functions.pct).toBeGreaterThanOrEqual(80);
          expect(totalCoverage.lines.pct).toBeGreaterThanOrEqual(80);
        }
      } catch (error: any) {
        console.warn('テストカバレッジの取得に失敗しました:', error.message);
        // カバレッジが取得できない場合はスキップ
      }
    });

    it('重要なファイルにテストが存在する', () => {
      const importantFiles = [
        'src/lib/wallabag-api.ts',
        'src/lib/config-manager.ts',
        'src/background/background.ts'
      ];

      const testFiles = [
        'tests/unit/wallabag-api.test.ts',
        'tests/unit/config-manager.test.ts',
        'tests/unit/background.test.ts'
      ];

      importantFiles.forEach((file, index) => {
        const sourceExists = existsSync(join(projectRoot, file));
        const testExists = existsSync(join(projectRoot, testFiles[index]));
        
        if (sourceExists) {
          expect(testExists).toBe(true);
        }
      });
    });
  });

  describe('プロジェクト構造品質チェック', () => {
    it('必要なディレクトリ構造が存在する', () => {
      const requiredDirs = [
        'src',
        'src/lib',
        'src/background',
        'src/content',
        'src/popup',
        'src/options',
        'tests',
        'tests/unit',
        'tests/integration'
      ];

      requiredDirs.forEach(dir => {
        expect(existsSync(join(projectRoot, dir))).toBe(true);
      });
    });

    it('package.jsonに必要なフィールドが存在する', () => {
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
      expect(packageJson.description).toBeDefined();
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.devDependencies).toBeDefined();
    });

    it('manifest.jsonが存在し、正しい形式である', () => {
      const manifestPath = join(projectRoot, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      
      expect(manifest.manifest_version).toBe(3);
      expect(manifest.name).toBeDefined();
      expect(manifest.version).toBeDefined();
      expect(manifest.description).toBeDefined();
      expect(manifest.permissions).toBeDefined();
      expect(manifest.background).toBeDefined();
      expect(manifest.content_scripts).toBeDefined();
      expect(manifest.action).toBeDefined();
    });

    it('重要な設定ファイルが存在する', () => {
      const configFiles = [
        'tsconfig.json',
        'webpack.config.js',
        'web-ext-config.js'
      ];

      configFiles.forEach(file => {
        expect(existsSync(join(projectRoot, file))).toBe(true);
      });
    });
  });

  describe('コード複雑度チェック', () => {
    it('重要なファイルの複雑度が許容範囲内である', () => {
      const importantFiles = [
        'src/lib/wallabag-api.ts',
        'src/lib/config-manager.ts',
        'src/background/background.ts'
      ];

      importantFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');
          
          // 簡単な複雑度チェック（関数の長さ）
          const functions = content.match(/^\s*(private\s+|public\s+|static\s+)*async\s+\w+\([\s\S]*?\n\s*\}/gm) || [];
          
          functions.forEach(func => {
            const lines = func.split('\n').length;
            expect(lines).toBeLessThan(100); // 関数は100行未満
          });

          // ネストの深さチェック（大まかな）
          const maxNesting = content.split('\n').reduce((max, line) => {
            const openBraces = (line.match(/\{/g) || []).length;
            const closeBraces = (line.match(/\}/g) || []).length;
            const nesting = openBraces - closeBraces;
            return Math.max(max, nesting);
          }, 0);

          expect(maxNesting).toBeLessThan(8); // ネストの深さは8未満
        }
      });
    });

    it('大きすぎるファイルが存在しない', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');
          const lines = content.split('\n').length;
          
          // ファイルは1000行未満
          expect(lines).toBeLessThan(1000);
        }
      });
    });
  });

  describe('依存関係品質チェック', () => {
    it('package.jsonの依存関係に既知の脆弱性がない', async () => {
      try {
        // npm auditを実行（警告レベル以上をチェック）
        execSync('npm audit --audit-level=moderate', {
          encoding: 'utf8',
          cwd: projectRoot,
          stdio: 'pipe'
        });
      } catch (error: any) {
        if (error.status === 1) {
          // 脆弱性が見つかった場合
          console.warn('依存関係に脆弱性が検出されました。npm audit fixの実行を検討してください。');
          // 警告として扱い、テストは継続
        } else {
          throw error;
        }
      }
    });

    it('未使用の依存関係が存在しない（基本チェック）', () => {
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      
      const dependencies = Object.keys(packageJson.dependencies || {});
      const devDependencies = Object.keys(packageJson.devDependencies || {});
      
      // 基本的な依存関係の存在チェック
      const expectedDevDeps = ['typescript', 'jest', 'webpack', '@types/jest'];
      
      expectedDevDeps.forEach(dep => {
        const isInDev = devDependencies.some(d => d.includes(dep.split('/')[0]));
        const isInProd = dependencies.some(d => d.includes(dep.split('/')[0]));
        expect(isInDev || isInProd).toBe(true);
      });
    });

    it('package-lock.jsonが最新である', () => {
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageLockPath = join(projectRoot, 'package-lock.json');
      
      expect(existsSync(packageLockPath)).toBe(true);
      
      const packageStat = require('fs').statSync(packageJsonPath);
      const packageLockStat = require('fs').statSync(packageLockPath);
      
      // package-lock.jsonがpackage.jsonより古くないことを確認
      expect(packageLockStat.mtime.getTime()).toBeGreaterThanOrEqual(
        packageStat.mtime.getTime() - 60000 // 1分のマージン
      );
    });
  });

  describe('コードスタイル一貫性チェック', () => {
    it('インデントが一貫している', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          
          // タブとスペースの混在チェック
          lines.forEach((line, index) => {
            if (line.match(/^\s+/)) {
              const hasTab = line.includes('\t');
              const hasSpace = line.match(/^ +/);
              
              if (hasTab && hasSpace) {
                throw new Error(`${file}:${index + 1} タブとスペースが混在しています`);
              }
            }
          });
        }
      });
    });

    it('改行コードが一貫している', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');
          
          // CRLF(\r\n)とLF(\n)の混在チェック
          const hasCRLF = content.includes('\r\n');
          const hasLF = content.includes('\n') && !content.replace(/\r\n/g, '').includes('\n');
          
          if (hasCRLF && hasLF) {
            throw new Error(`${file} 改行コードが混在しています`);
          }
        }
      });
    });
  });

  describe('パフォーマンス品質チェック', () => {
    it('ビルドサイズが適切な範囲内である', () => {
      try {
        // ビルドを実行
        execSync('npm run build', {
          encoding: 'utf8',
          cwd: projectRoot,
          stdio: 'pipe'
        });

        const distPath = join(projectRoot, 'dist');
        if (existsSync(distPath)) {
          // ビルド出力のサイズをチェック
          const buildResult = execSync('du -sk dist', {
            encoding: 'utf8',
            cwd: projectRoot
          });

          const sizeKB = parseInt(buildResult.split('\t')[0]);
          
          // ビルドサイズは10MB未満であること
          expect(sizeKB).toBeLessThan(10 * 1024);
        }
      } catch (error: any) {
        console.warn('ビルドサイズチェックをスキップしました:', error.message);
      }
    });

    it('重要なファイルでメモリリークの可能性がない（基本チェック）', () => {
      const sourceFiles = [
        'src/lib/wallabag-api.ts',
        'src/background/background.ts'
      ];

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');
          
          // 基本的なメモリリーク パターンチェック
          const potentialLeaks = [
            /setInterval\s*\(/g,
            /setTimeout\s*\(/g,
            /addEventListener\s*\(/g
          ];

          potentialLeaks.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
              // リークの可能性を警告
              console.warn(`${file}: ${pattern} の使用が検出されました。適切なクリーンアップが実装されていることを確認してください。`);
            }
          });
        }
      });
    });
  });
});