/**
 * コード品質チェックテスト
 * ESLint、Prettier、TypeScript型チェックをテスト
 */

import { exec } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ESLintの出力結果の型定義
interface EslintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
  column: number;
}

interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

// execのカスタムエラー型
interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
  status?: number;
}

// tsconfigの型定義
interface TsConfig {
    compilerOptions?: {
        strict?: boolean;
        noImplicitAny?: boolean;
        noImplicitReturns?: boolean;
        noUnusedLocals?: boolean;
        noUnusedParameters?: boolean;
    };
}


// tsconfig.jsonからコメントを除去してパースする関数
const parseJsonc = (content: string): object => {
  const sanitizedContent = content.replace(
    /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm,
    '$1'
  );
  return JSON.parse(sanitizedContent);
};

describe('コード品質チェック', () => {
  const projectRoot = process.cwd();
  jest.setTimeout(120000); // タイムアウトを120秒に延長

  describe('ESLint品質チェック', () => {
    it('ESLint設定ファイルが存在する', () => {
      const eslintConfigExists =
        existsSync(join(projectRoot, '.eslintrc.js')) ||
        existsSync(join(projectRoot, '.eslintrc.json')) ||
        existsSync(join(projectRoot, 'eslint.config.js'));

      expect(eslintConfigExists).toBe(true);
    });

    it('ソースコードにESLintエラーが存在しない', async () => {
      try {
        const { stdout } = await execAsync('npx eslint src/ --format=json', {
          cwd: projectRoot,
        });
        const results: EslintFileResult[] = JSON.parse(stdout);
        const totalErrors = results.reduce(
          (sum: number, file: EslintFileResult) => sum + file.errorCount,
          0
        );
        expect(totalErrors).toBe(0);
      } catch (error) {
        const execError = error as ExecError;
        if (execError.stdout) {
          try {
            const results: EslintFileResult[] = JSON.parse(execError.stdout);
            const errors = results.flatMap((file: EslintFileResult) =>
              file.messages.filter((msg: EslintMessage) => msg.severity === 2)
            );

            if (errors.length > 0) {
              const errorMessages = errors
                .map(
                  (err: EslintMessage) =>
                    `${err.ruleId || 'error'}: ${err.message} (${err.line}:${
                      err.column
                    })`
                )
                .join('\n');
              throw new Error(`ESLintエラーが検出されました:\n${errorMessages}`);
            }
          } catch (parseError) {
             throw new Error(`ESLintの出力の解析に失敗しました: ${execError.stdout}`);
          }
        }
        // ESLintエラーがない場合は、他の実行時エラーをスロー
        if (!execError.stdout) {
          throw error;
        }
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

    it('ソースコードがPrettierフォーマットに準拠している', async () => {
      try {
        await execAsync('npx prettier --check "src/**/*.{ts,js,json}"', {
          cwd: projectRoot,
        });
      } catch (error) {
        const execError = error as ExecError;
        throw new Error(
          `以下のファイルがPrettierフォーマットに準拠していません:\n${execError.stdout}`
        );
      }
    });
  });

  describe('TypeScript品質チェック', () => {
    let tsconfig: TsConfig;

    beforeAll(() => {
      const tsconfigPath = join(projectRoot, 'tsconfig.json');
      if (existsSync(tsconfigPath)) {
        const tsconfigContent = readFileSync(tsconfigPath, 'utf8');
        tsconfig = parseJsonc(tsconfigContent) as TsConfig;
      }
    });

    it('TypeScript設定ファイルが存在する', () => {
      expect(tsconfig).toBeDefined();
    });

    it('TypeScript型エラーが存在しない', async () => {
      try {
        await execAsync('npx tsc --noEmit', { cwd: projectRoot });
      } catch (error) {
        const execError = error as ExecError;
        throw new Error(`TypeScript型エラーが検出されました:\n${execError.stdout}`);
      }
    });

    it('strict モードが有効になっている', () => {
      const compilerOptions = tsconfig.compilerOptions || {};
      expect(compilerOptions.strict).toBe(true);
    });

    it('重要なTypeScriptオプションが設定されている', () => {
      const compilerOptions = tsconfig.compilerOptions || {};
      expect(compilerOptions.noImplicitAny).toBe(true);
      expect(compilerOptions.noImplicitReturns).toBe(true);
      expect(compilerOptions.noUnusedLocals).toBe(true);
      expect(compilerOptions.noUnusedParameters).toBe(true);
    });
  });
});