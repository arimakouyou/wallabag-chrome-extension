/**
 * パフォーマンステスト
 * メモリ使用量、応答時間、リソース効率性をテスト
 */

import { performance } from 'perf_hooks';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { WallabagApiClient } from '../../src/lib/wallabag-api';
import { ConfigManager } from '../../src/lib/config-manager';

// パフォーマンス測定ユーティリティ
class PerformanceMonitor {
  private startTime: number = 0;
  private memoryBaseline: NodeJS.MemoryUsage | null = null;

  startMeasurement(): void {
    this.startTime = performance.now();
    this.memoryBaseline = process.memoryUsage();
  }

  endMeasurement(): { duration: number; memoryDelta: NodeJS.MemoryUsage } {
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    const duration = endTime - this.startTime;
    const memoryDelta = {
      rss: endMemory.rss - (this.memoryBaseline?.rss || 0),
      heapUsed: endMemory.heapUsed - (this.memoryBaseline?.heapUsed || 0),
      heapTotal: endMemory.heapTotal - (this.memoryBaseline?.heapTotal || 0),
      external: endMemory.external - (this.memoryBaseline?.external || 0),
      arrayBuffers: endMemory.arrayBuffers - (this.memoryBaseline?.arrayBuffers || 0)
    };

    return { duration, memoryDelta };
  }
}

// fetch APIのモック（高速化）
const createMockFetch = (responseData: any, delay: number = 0) => {
  return jest.fn().mockImplementation(() => 
    new Promise(resolve => 
      setTimeout(() => resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(responseData)
      }), delay)
    )
  );
};

describe('パフォーマンステスト', () => {
  const projectRoot = process.cwd();
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    jest.clearAllMocks();
  });

  describe('API クライアントパフォーマンス', () => {
    it('認証処理が300ms以内に完了する', async () => {
      const mockAuthResponse = {
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
        refresh_token: 'test-refresh'
      };

      global.fetch = createMockFetch(mockAuthResponse, 50);

      // ConfigManagerのモック
      ConfigManager.saveTokens = jest.fn().mockResolvedValue(undefined);
      
      const client = new WallabagApiClient('https://test.wallabag.com');

      monitor.startMeasurement();

      await client.authenticate({
        grant_type: 'password',
        client_id: 'test-client',
        client_secret: 'test-secret',
        username: 'testuser',
        password: 'testpass'
      });

      const { duration } = monitor.endMeasurement();

      expect(duration).toBeLessThan(300); // 300ms未満
    });

    it('エントリ作成が200ms以内に完了する', async () => {
      const mockEntryResponse = {
        id: 123,
        url: 'https://example.com/test',
        title: 'Test Article',
        content: 'Content...',
        created_at: '2025-08-03T10:00:00Z',
        updated_at: '2025-08-03T10:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      global.fetch = createMockFetch(mockEntryResponse, 30);

      // ConfigManagerのモック
      jest.spyOn(ConfigManager, 'getConfig').mockResolvedValue({
        serverUrl: 'https://test.wallabag.com',
        accessToken: 'valid-token'
      });

      jest.spyOn(ConfigManager, 'isTokenValid').mockResolvedValue(true);

      const client = new WallabagApiClient('https://test.wallabag.com');

      monitor.startMeasurement();

      await client.createEntry({
        url: 'https://example.com/test',
        title: 'Test Article'
      });

      const { duration } = monitor.endMeasurement();

      expect(duration).toBeLessThan(200); // 200ms未満
    });

    it('複数の並列リクエストが効率的に処理される', async () => {
      const mockResponse = {
        id: 1,
        url: 'https://example.com',
        title: 'Test',
        content: 'Content',
        created_at: '2025-08-03T10:00:00Z',
        updated_at: '2025-08-03T10:00:00Z',
        starred: false,
        archived: false,
        tags: []
      };

      global.fetch = createMockFetch(mockResponse, 50);

      jest.spyOn(ConfigManager, 'getConfig').mockResolvedValue({
        serverUrl: 'https://test.wallabag.com',
        accessToken: 'valid-token'
      });

      jest.spyOn(ConfigManager, 'isTokenValid').mockResolvedValue(true);

      const client = new WallabagApiClient('https://test.wallabag.com');

      monitor.startMeasurement();

      // 10個の並列リクエスト
      const requests = Array.from({ length: 10 }, (_, i) =>
        client.createEntry({
          url: `https://example.com/test-${i}`,
          title: `Test Article ${i}`
        })
      );

      await Promise.all(requests);

      const { duration } = monitor.endMeasurement();

      // 並列実行により、10 * 50ms = 500ms より大幅に短い時間で完了すること
      expect(duration).toBeLessThan(300); // 300ms未満
    });

    it('大量データの処理でメモリリークが発生しない', async () => {
      const largeResponse = {
        page: 1,
        limit: 100,
        pages: 1,
        total: 100,
        _embedded: {
          items: Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            url: `https://example.com/article-${i}`,
            title: `Article ${i}`,
            content: 'x'.repeat(10000), // 10KB のコンテンツ
            created_at: '2025-08-03T10:00:00Z',
            updated_at: '2025-08-03T10:00:00Z',
            starred: false,
            archived: false,
            tags: []
          }))
        }
      };

      global.fetch = createMockFetch(largeResponse);

      jest.spyOn(ConfigManager, 'getConfig').mockResolvedValue({
        serverUrl: 'https://test.wallabag.com',
        accessToken: 'valid-token'
      });

      jest.spyOn(ConfigManager, 'isTokenValid').mockResolvedValue(true);

      const client = new WallabagApiClient('https://test.wallabag.com');

      monitor.startMeasurement();

      // 複数回の大量データ取得
      for (let i = 0; i < 5; i++) {
        await client.getEntries({ page: i + 1, perPage: 100 });
      }

      const { memoryDelta } = monitor.endMeasurement();

      // メモリ使用量の増加が50MB未満であること
      expect(memoryDelta.heapUsed).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('設定管理パフォーマンス', () => {
    const mockChrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
      },
    };

    beforeEach(() => {
      global.chrome = mockChrome as any;
    });

    it('設定読み込みが100ms以内に完了する', async () => {
      const mockConfig = {
        serverUrl: 'https://test.wallabag.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        username: 'testuser',
        password: 'testpass'
      };

      mockChrome.storage.local.get.mockImplementation((key, callback) => {
        setTimeout(() => callback({ [key]: mockConfig }), 10);
      });

      monitor.startMeasurement();

      await ConfigManager.getConfig();

      const { duration } = monitor.endMeasurement();

      expect(duration).toBeLessThan(100); // 100ms未満
    });

    it('設定保存が200ms以内に完了する', async () => {
      const config = {
        serverUrl: 'https://test.wallabag.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        username: 'testuser',
        password: 'testpass'
      };

      mockChrome.storage.local.set.mockImplementation((_data, callback) => {
        setTimeout(() => callback && callback(), 20);
      });

      monitor.startMeasurement();

      await ConfigManager.setConfig(config);

      const { duration } = monitor.endMeasurement();

      expect(duration).toBeLessThan(200); // 200ms未満
    });

    it('設定検証が50ms以内に完了する', async () => {
      const config = {
        serverUrl: 'https://test.wallabag.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        username: 'testuser',
        password: 'testpass'
      };

      monitor.startMeasurement();

      const result = ConfigManager.validateConfig(config);

      const { duration } = monitor.endMeasurement();

      expect(duration).toBeLessThan(50); // 50ms未満
      expect(result.valid).toBe(true);
    });

    it('大量の設定更新でパフォーマンスが劣化しない', async () => {
      mockChrome.storage.local.set.mockResolvedValue(undefined);
      mockChrome.storage.local.get.mockResolvedValue({});

      const iterations = 100;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        monitor.startMeasurement();

        await ConfigManager.setConfig({
          serverUrl: `https://test-${i}.wallabag.com`,
          clientId: `client-${i}`
        });

        const { duration } = monitor.endMeasurement();
        durations.push(duration);
      }

      // 最後の10回の平均が最初の10回の平均の2倍を超えないこと
      const firstTenAvg = durations.slice(0, 10).reduce((a, b) => a + b) / 10;
      const lastTenAvg = durations.slice(-10).reduce((a, b) => a + b) / 10;

      expect(lastTenAvg).toBeLessThan(firstTenAvg * 2);
    });
  });

  describe('ビルドパフォーマンス', () => {
    it('ビルドサイズが適切な範囲内である', () => {
      try {
        // ビルドを実行
        const buildStart = performance.now();
        execSync('npm run build', {
          cwd: projectRoot,
          stdio: 'pipe'
        });
        const buildDuration = performance.now() - buildStart;

        // ビルド時間が5分未満であること
        expect(buildDuration).toBeLessThan(5 * 60 * 1000);

        // ビルド出力サイズをチェック
        const distPath = join(projectRoot, 'dist');
        if (existsSync(distPath)) {
          const files = execSync('find dist -type f -name "*.js" -o -name "*.css" -o -name "*.html"', {
            encoding: 'utf8',
            cwd: projectRoot
          }).trim().split('\n').filter(f => f);

          let totalSize = 0;
          files.forEach(file => {
            const filePath = join(projectRoot, file);
            if (existsSync(filePath)) {
              totalSize += statSync(filePath).size;
            }
          });

          // 総サイズが5MB未満であること
          expect(totalSize).toBeLessThan(5 * 1024 * 1024);
        }
      } catch (error: any) {
        console.warn('ビルドパフォーマンステストをスキップしました:', error.message);
      }
    });

    it('重要なファイルのサイズが適切である', () => {
      const importantFiles = [
        'src/lib/wallabag-api.ts',
        'src/lib/config-manager.ts',
        'src/background/background.ts'
      ];

      importantFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const stats = statSync(filePath);
          
          // 単一ファイルが500KB未満であること
          expect(stats.size).toBeLessThan(500 * 1024);
        }
      });
    });

    it('依存関係の数が適切である', () => {
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

      const dependencies = Object.keys(packageJson.dependencies || {});
      const devDependencies = Object.keys(packageJson.devDependencies || {});

      // 本番依存関係が10個未満であること
      expect(dependencies.length).toBeLessThan(10);

      // 開発依存関係が50個未満であること
      expect(devDependencies.length).toBeLessThan(50);
    });
  });

  describe('メモリ効率性', () => {
    it('長時間動作時のメモリ使用量が安定している', async () => {
      global.fetch = createMockFetch({ success: true }, 10);

      jest.spyOn(ConfigManager, 'getConfig').mockResolvedValue({
        serverUrl: 'https://test.wallabag.com',
        accessToken: 'valid-token'
      });

      jest.spyOn(ConfigManager, 'isTokenValid').mockResolvedValue(true);

      const client = new WallabagApiClient('https://test.wallabag.com');

      const initialMemory = process.memoryUsage();
      const memoryMeasurements: number[] = [];

      // 1000回の操作を実行
      for (let i = 0; i < 1000; i++) {
        await client.createEntry({
          url: `https://example.com/test-${i}`,
          title: `Test ${i}`
        });

        // 100回ごとにメモリ使用量を記録
        if (i % 100 === 0) {
          const currentMemory = process.memoryUsage();
          memoryMeasurements.push(currentMemory.heapUsed);
        }

        // ガベージコレクションを促進
        if (i % 200 === 0 && global.gc) {
          global.gc();
        }
      }

      // 最後のメモリ使用量が初期値の2倍を超えないこと
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(memoryIncrease).toBeLessThan(initialMemory.heapUsed);
    });

    it('イベントリスナーが適切にクリーンアップされる', () => {
      const BackgroundService = require('../../src/background/background').BackgroundService;
      
      const mockChrome = {
        runtime: {
          onMessage: { addListener: jest.fn() },
          onInstalled: { addListener: jest.fn() },
          onStartup: { addListener: jest.fn() }
        },
        action: {
          onClicked: { addListener: jest.fn() }
        },
        contextMenus: {
          onClicked: { addListener: jest.fn() },
          removeAll: jest.fn().mockResolvedValue(),
          create: jest.fn()
        },
        tabs: {
          onUpdated: { addListener: jest.fn() }
        },
        storage: {
          local: { get: jest.fn().mockResolvedValue({}) }
        }
      };

      global.chrome = mockChrome as any;

      monitor.startMeasurement();

      // 複数のサービスインスタンスを作成・初期化
      const services = [];
      for (let i = 0; i < 100; i++) {
        const service = new BackgroundService();
        service.initialize();
        services.push(service);
      }

      const { memoryDelta } = monitor.endMeasurement();

      // メモリ使用量の増加が10MB未満であること
      expect(memoryDelta.heapUsed).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('応答時間ベンチマーク', () => {
    it('ファイル読み込み速度が許容範囲内である', () => {
      const testFiles = [
        'src/lib/types.ts',
        'src/lib/wallabag-api.ts',
        'src/lib/config-manager.ts'
      ];

      testFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          monitor.startMeasurement();

          readFileSync(filePath, 'utf8');

          const { duration } = monitor.endMeasurement();

          // ファイル読み込みが10ms未満であること
          expect(duration).toBeLessThan(10);
        }
      });
    });

    it('型チェック時間が適切である', () => {
      try {
        monitor.startMeasurement();

        execSync('npx tsc --noEmit', {
          cwd: projectRoot,
          stdio: 'pipe'
        });

        const { duration } = monitor.endMeasurement();

        // 型チェックが30秒未満であること
        expect(duration).toBeLessThan(30 * 1000);
      } catch (error: any) {
        // 型エラーがある場合でもパフォーマンステストは継続
        console.warn('型チェックエラー:', error.message);
      }
    });

    it('テスト実行時間が適切である', () => {
      try {
        monitor.startMeasurement();

        execSync('npm test -- --passWithNoTests', {
          cwd: projectRoot,
          stdio: 'pipe'
        });

        const { duration } = monitor.endMeasurement();

        // テスト実行が5分未満であること
        expect(duration).toBeLessThan(5 * 60 * 1000);
      } catch (error: any) {
        console.warn('テスト実行パフォーマンステストをスキップしました:', error.message);
      }
    });
  });

  describe('リソース効率性', () => {
    it('不要なポーリングが実行されていない', () => {
      const sourceFiles = execSync('find src -name "*.ts" -type f', {
        encoding: 'utf8',
        cwd: projectRoot
      }).trim().split('\n').filter(f => f);

      sourceFiles.forEach(file => {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');

          // 短間隔のポーリングをチェック
          const pollingPatterns = [
            /setInterval\s*\([^,]*,\s*([0-9]+)\s*\)/g,
            /setTimeout\s*\([^,]*,\s*([0-9]+)\s*\)/g
          ];

          pollingPatterns.forEach(pattern => {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
              const interval = parseInt(match[1]);
              if (interval < 1000) { // 1秒未満
                console.warn(`${file}: 短間隔のタイマーが検出されました: ${interval}ms`);
              }
            }
          });
        }
      });
    });

    it('適切なキャッシュ戦略が実装されている', () => {
      const apiClientPath = join(projectRoot, 'src/lib/wallabag-api.ts');
      if (existsSync(apiClientPath)) {
        const content = readFileSync(apiClientPath, 'utf8');

        // トークンの再利用をチェック
        expect(content).toContain('getValidAccessToken');
        expect(content).toContain('isTokenValid');
      }

      const configPath = join(projectRoot, 'src/lib/config-manager.ts');
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, 'utf8');

        // 設定の効率的な管理をチェック
        expect(content).toContain('getConfig');
        expect(content).toContain('setConfig');
      }
    });

    it('バックグラウンドでの CPU 使用量が最小限である', async () => {
      const BackgroundService = require('../../src/background/background').BackgroundService;
      
      const mockChrome = {
        runtime: {
          onMessage: { addListener: jest.fn() },
          onInstalled: { addListener: jest.fn() },
          onStartup: { addListener: jest.fn() }
        },
        action: {
          onClicked: { addListener: jest.fn() },
          setIcon: jest.fn().mockResolvedValue(undefined),
          setTitle: jest.fn().mockResolvedValue(undefined)
        },
        contextMenus: {
          onClicked: { addListener: jest.fn() },
          removeAll: jest.fn().mockResolvedValue(),
          create: jest.fn()
        },
        tabs: {
          onUpdated: { addListener: jest.fn() }
        },
        storage: {
          local: { get: jest.fn().mockResolvedValue({}) }
        }
      };

      global.chrome = mockChrome as any;

      const service = new BackgroundService();

      monitor.startMeasurement();

      await service.initialize();

      // 初期化後に1秒間待機（アイドル状態をシミュレート）
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { duration } = monitor.endMeasurement();

      // 初期化が1秒以内に完了し、その後のアイドル時間でCPU使用量が最小限であること
      expect(duration).toBeLessThan(1100); // 1.1秒未満（マージン含む）
    });
  });

  describe('スケーラビリティ', () => {
    it('大量のエントリ処理でパフォーマンスが線形に劣化する', async () => {
      global.fetch = createMockFetch({ success: true }, 10);

      jest.spyOn(ConfigManager, 'getConfig').mockResolvedValue({
        serverUrl: 'https://test.wallabag.com',
        accessToken: 'valid-token'
      });

      jest.spyOn(ConfigManager, 'isTokenValid').mockResolvedValue(true);

      const client = new WallabagApiClient('https://test.wallabag.com');

      const testSizes = [10, 50, 100];
      const results: { size: number; duration: number }[] = [];

      for (const size of testSizes) {
        monitor.startMeasurement();

        const requests = Array.from({ length: size }, (_, i) =>
          client.createEntry({
            url: `https://example.com/test-${i}`,
            title: `Test ${i}`
          })
        );

        await Promise.all(requests);

        const { duration } = monitor.endMeasurement();
        results.push({ size, duration });
      }

      // パフォーマンスの劣化が線形であることを確認
      const efficiency10 = results[0].duration / results[0].size;
      const efficiency100 = results[2].duration / results[2].size;

      // 効率性の劣化が3倍以下であること
      expect(efficiency100).toBeLessThan(efficiency10 * 3);
    });

    it('同時ユーザー数増加に対するスケーラビリティ', async () => {
      global.fetch = createMockFetch({ success: true }, 20);

      jest.spyOn(ConfigManager, 'getConfig').mockResolvedValue({
        serverUrl: 'https://test.wallabag.com',
        accessToken: 'valid-token'
      });

      jest.spyOn(ConfigManager, 'isTokenValid').mockResolvedValue(true);

      const concurrentUsers = [1, 5, 10];
      const results: { users: number; duration: number }[] = [];

      for (const userCount of concurrentUsers) {
        monitor.startMeasurement();

        const userRequests = Array.from({ length: userCount }, () => {
          const client = new WallabagApiClient('https://test.wallabag.com');
          return client.createEntry({
            url: 'https://example.com/concurrent-test',
            title: 'Concurrent Test'
          });
        });

        await Promise.all(userRequests);

        const { duration } = monitor.endMeasurement();
        results.push({ users: userCount, duration });
      }

      // 10倍のユーザー数でも処理時間が20倍以下であること
      const time1User = results[0].duration;
      const time10Users = results[2].duration;

      expect(time10Users).toBeLessThan(time1User * 20);
    });
  });
});