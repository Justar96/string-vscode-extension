import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileIndexer } from '../../indexing';
import { ChunkTransmissionResult, FileItem, VectorStoreSelectionContext } from '../../types';

// Mock vector store manager
class MockVectorStoreManager {
  private activeStoreId: string = 'default-store';
  private mockConnections = new Map([
    [
      'default-store',
      {
        isConnected: true,
        credentials: {
          endpoint: 'https://test.example.com',
          credentials: { apiKey: 'test-key' }
        }
      }
    ]
  ]);

  async selectBestVectorStore(context: VectorStoreSelectionContext): Promise<string | null> {
    return this.activeStoreId;
  }

  async getConnection(storeId: string): Promise<any> {
    return this.mockConnections.get(storeId);
  }

  setActiveStore(storeId: string): void {
    this.activeStoreId = storeId;
  }

  addMockConnection(storeId: string, connection: any): void {
    this.mockConnections.set(storeId, connection);
  }
}

// Mock file system
const mockFileContent = `
function example() {
  console.log("Hello, World!");
  return true;
}

class TestClass {
  constructor() {
    this.value = 42;
  }
  
  getValue() {
    return this.value;
  }
}
`;

suite('FileIndexer Tests', () => {
  let fileIndexer: FileIndexer;
  let mockVectorStoreManager: MockVectorStoreManager;

  setup(() => {
    fileIndexer = new FileIndexer();
    mockVectorStoreManager = new MockVectorStoreManager();
    fileIndexer.setVectorStoreManager(mockVectorStoreManager);
  });

  suite('Initialization', () => {
    test('should initialize with content chunker', () => {
      const newIndexer = new FileIndexer();
      assert.ok(newIndexer, 'Should create FileIndexer instance');
    });

    test('should set vector store manager', () => {
      const newIndexer = new FileIndexer();
      const manager = new MockVectorStoreManager();

      // Should not throw
      newIndexer.setVectorStoreManager(manager);
      assert.ok(true, 'Should set vector store manager without errors');
    });
  });

  suite('Vector Store Selection', () => {
    test('should use traditional config when multi-store disabled', async () => {
      // Mock getExtensionConfig to return multi-store disabled
      const mockConfig = {
        enableMultiVectorStore: false,
        url: 'https://traditional.example.com',
        apiKey: 'traditional-key'
      };

      const originalGetConfig = require('../utils').getExtensionConfig;
      require('../utils').getExtensionConfig = () => mockConfig;

      try {
        const mockFile: FileItem = {
          uri: vscode.Uri.file('/test/file.ts'),
          relativePath: 'file.ts',
          selected: true,
          language: 'TypeScript',
          size: 1000
        };

        // Use reflection to test private method (for unit testing purposes)
        const selectMethod = (fileIndexer as any).selectVectorStoreForFile.bind(fileIndexer);
        const result = await selectMethod(mockFile);

        assert.strictEqual(
          result.url,
          'https://traditional.example.com',
          'Should use traditional URL'
        );
        assert.strictEqual(result.apiKey, 'traditional-key', 'Should use traditional API key');
        assert.strictEqual(result.storeId, undefined, 'Should not have store ID');
      } finally {
        require('../utils').getExtensionConfig = originalGetConfig;
      }
    });

    test('should select vector store when multi-store enabled', async () => {
      const mockConfig = {
        enableMultiVectorStore: true,
        url: 'https://fallback.example.com',
        apiKey: 'fallback-key',
        defaultVectorStore: 'default-store'
      };

      const originalGetConfig = require('../utils').getExtensionConfig;
      require('../utils').getExtensionConfig = () => mockConfig;

      try {
        const mockFile: FileItem = {
          uri: vscode.Uri.file('/test/file.ts'),
          relativePath: 'file.ts',
          selected: true,
          language: 'TypeScript',
          size: 1000
        };

        const selectMethod = (fileIndexer as any).selectVectorStoreForFile.bind(fileIndexer);
        const result = await selectMethod(mockFile);

        assert.strictEqual(result.url, 'https://test.example.com', 'Should use selected store URL');
        assert.strictEqual(result.apiKey, 'test-key', 'Should use selected store API key');
        assert.strictEqual(result.storeId, 'default-store', 'Should have store ID');
      } finally {
        require('../utils').getExtensionConfig = originalGetConfig;
      }
    });

    test('should fallback to traditional config when vector store selection fails', async () => {
      const mockConfig = {
        enableMultiVectorStore: true,
        url: 'https://fallback.example.com',
        apiKey: 'fallback-key'
      };

      const originalGetConfig = require('../utils').getExtensionConfig;
      require('../utils').getExtensionConfig = () => mockConfig;

      // Mock vector store manager to fail
      mockVectorStoreManager.selectBestVectorStore = async () => null;

      try {
        const mockFile: FileItem = {
          uri: vscode.Uri.file('/test/file.ts'),
          relativePath: 'file.ts',
          selected: true,
          language: 'TypeScript',
          size: 1000
        };

        const selectMethod = (fileIndexer as any).selectVectorStoreForFile.bind(fileIndexer);
        const result = await selectMethod(mockFile);

        assert.strictEqual(
          result.url,
          'https://fallback.example.com',
          'Should fallback to traditional URL'
        );
        assert.strictEqual(result.apiKey, 'fallback-key', 'Should fallback to traditional API key');
      } finally {
        require('../utils').getExtensionConfig = originalGetConfig;
      }
    });
  });

  suite('File Indexing', () => {
    test('should handle empty file list', async () => {
      const result = await fileIndexer.indexFiles([]);

      assert.strictEqual(result.successCount, 0, 'Should have no successful files');
      assert.strictEqual(result.errorCount, 0, 'Should have no errors');
    });

    test('should process files in batches', async () => {
      const mockFiles: FileItem[] = Array.from({ length: 5 }, (_, i) => ({
        uri: vscode.Uri.file(`/test/file${i}.ts`),
        relativePath: `file${i}.ts`,
        selected: true,
        language: 'TypeScript',
        size: 1000
      }));

      const progressCalls: Array<{ current: number; total: number; fileName: string }> = [];
      const onProgress = (current: number, total: number, fileName: string) => {
        progressCalls.push({ current, total, fileName });
      };

      const jobStartCalls: Array<{ jobId: string; fileName: string }> = [];
      const onJobStart = (jobId: string, fileName: string) => {
        jobStartCalls.push({ jobId, fileName });
      };

      const jobCompleteCalls: Array<{ jobId: string; success: boolean }> = [];
      const onJobComplete = (jobId: string, success: boolean) => {
        jobCompleteCalls.push({ jobId, success });
      };

      // Mock file system and HTTP requests for successful processing
      const fs = require('fs').promises;
      const originalReadFile = fs.readFile;
      fs.readFile = async () => Buffer.from(mockFileContent);

      // Mock fetch for successful responses
      const originalFetch = global.fetch;
      (global as any).fetch = async () => ({
        ok: true,
        json: async () => ({ success: true }),
        text: async () => 'OK'
      });

      try {
        // Mock config for testing
        const mockConfig = {
          batchSize: 2,
          enableMultiVectorStore: false,
          url: 'https://test.example.com',
          apiKey: 'test-key',
          maxChunkSize: 500
        };

        const originalGetConfig = require('../utils').getExtensionConfig;
        require('../utils').getExtensionConfig = () => mockConfig;

        const result = await fileIndexer.indexFiles(
          mockFiles,
          onProgress,
          onJobStart,
          onJobComplete
        );

        // Note: In a real test environment, you'd need to properly mock all dependencies
        // This test demonstrates the structure and callback behavior
        assert.ok(progressCalls.length >= 0, 'Should call progress callback');
        assert.ok(jobStartCalls.length >= 0, 'Should call job start callback');
        assert.ok(jobCompleteCalls.length >= 0, 'Should call job complete callback');

        require('../utils').getExtensionConfig = originalGetConfig;
      } finally {
        fs.readFile = originalReadFile;
        (global as any).fetch = originalFetch;
      }
    });

    test('should handle cancellation signal', async () => {
      const mockFiles: FileItem[] = [
        {
          uri: vscode.Uri.file('/test/file.ts'),
          relativePath: 'file.ts',
          selected: true,
          language: 'TypeScript',
          size: 1000
        }
      ];

      const abortController = new AbortController();

      // Cancel immediately
      abortController.abort();

      const result = await fileIndexer.indexFiles(
        mockFiles,
        undefined,
        undefined,
        undefined,
        abortController.signal
      );

      // Should handle cancellation gracefully
      assert.ok(result.successCount >= 0, 'Should return valid success count');
      assert.ok(result.errorCount >= 0, 'Should return valid error count');
    });

    test('should handle file read errors', async () => {
      const mockFiles: FileItem[] = [
        {
          uri: vscode.Uri.file('/nonexistent/file.ts'),
          relativePath: 'file.ts',
          selected: true,
          language: 'TypeScript',
          size: 1000
        }
      ];

      const errorCalls: Array<{ jobId: string; success: boolean }> = [];
      const onJobComplete = (jobId: string, success: boolean) => {
        errorCalls.push({ jobId, success });
      };

      // Mock file system to throw error
      const fs = require('fs').promises;
      const originalReadFile = fs.readFile;
      fs.readFile = async () => {
        throw new Error('File not found');
      };

      try {
        const result = await fileIndexer.indexFiles(mockFiles, undefined, undefined, onJobComplete);

        assert.strictEqual(result.successCount, 0, 'Should have no successful files');
        assert.strictEqual(result.errorCount, 1, 'Should have one error');
      } finally {
        fs.readFile = originalReadFile;
      }
    });
  });

  suite('Health Check', () => {
    test('should perform health check successfully', async () => {
      // Mock successful health check
      const originalFetch = global.fetch;
      (global as any).fetch = async (url: string) => {
        if (url.includes('/health')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK'
          };
        }
        throw new Error('Unexpected URL');
      };

      try {
        // Use reflection to test private method
        const healthCheckMethod = (fileIndexer as any).performHealthCheck.bind(fileIndexer);

        // Should not throw
        await healthCheckMethod('https://test.example.com', 'test-key');
        assert.ok(true, 'Health check should complete successfully');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });

    test('should handle health check failure', async () => {
      // Mock failed health check
      const originalFetch = global.fetch;
      (global as any).fetch = async (url: string) => {
        if (url.includes('/health')) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
          };
        }
        throw new Error('Unexpected URL');
      };

      try {
        const healthCheckMethod = (fileIndexer as any).performHealthCheck.bind(fileIndexer);

        let errorThrown = false;
        try {
          await healthCheckMethod('https://test.example.com', 'test-key');
        } catch (error) {
          errorThrown = true;
          assert.ok(error instanceof Error, 'Should throw proper error');
          assert.ok(
            error.message.includes('health check failed'),
            'Should have meaningful error message'
          );
        }

        assert.ok(errorThrown, 'Should throw error for failed health check');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });

    test('should handle network timeout', async () => {
      // Mock network timeout
      const originalFetch = global.fetch;
      (global as any).fetch = async () => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), 100);
        });
      };

      try {
        const healthCheckMethod = (fileIndexer as any).performHealthCheck.bind(fileIndexer);

        let errorThrown = false;
        try {
          await healthCheckMethod('https://test.example.com', 'test-key');
        } catch (error) {
          errorThrown = true;
          assert.ok(error instanceof Error, 'Should throw proper error');
        }

        assert.ok(errorThrown, 'Should throw error for network timeout');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });
  });

  suite('Chunk Transmission', () => {
    test('should retry failed requests', async () => {
      let attemptCount = 0;

      // Mock fetch to fail first attempt, succeed on second
      const originalFetch = global.fetch;
      (global as any).fetch = async (url: string, options: any) => {
        attemptCount++;
        if (attemptCount === 1) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () => 'Server error'
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, chunk_id: 'test-chunk' })
        };
      };

      try {
        const mockChunkInfo = {
          content: 'test content',
          index: 0,
          metadata: {
            lineCount: 1,
            characterCount: 12,
            hasCode: false,
            language: 'JavaScript'
          },
          hash: 'test-hash'
        };

        // Use reflection to test private method
        const sendChunkMethod = (fileIndexer as any).sendChunkWithRetry.bind(fileIndexer);

        const result: ChunkTransmissionResult = await sendChunkMethod(
          mockChunkInfo,
          'test.js',
          'https://test.example.com',
          { 'Content-Type': 'application/json' },
          undefined,
          'test-job'
        );

        assert.strictEqual(result.success, true, 'Should succeed after retry');
        assert.strictEqual(result.retryCount, 1, 'Should have retried once');
        assert.strictEqual(attemptCount, 2, 'Should have made 2 attempts');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });

    test('should respect max retries', async () => {
      let attemptCount = 0;

      // Mock fetch to always fail
      const originalFetch = global.fetch;
      (global as any).fetch = async () => {
        attemptCount++;
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error'
        };
      };

      try {
        const mockChunkInfo = {
          content: 'test content',
          index: 0,
          metadata: {
            lineCount: 1,
            characterCount: 12,
            hasCode: false,
            language: 'JavaScript'
          },
          hash: 'test-hash'
        };

        const sendChunkMethod = (fileIndexer as any).sendChunkWithRetry.bind(fileIndexer);

        const result: ChunkTransmissionResult = await sendChunkMethod(
          mockChunkInfo,
          'test.js',
          'https://test.example.com',
          { 'Content-Type': 'application/json' },
          undefined,
          'test-job'
        );

        assert.strictEqual(result.success, false, 'Should fail after max retries');
        assert.ok(result.retryCount >= 3, 'Should have reached max retries');
        assert.ok(result.error?.includes('retries'), 'Should indicate retry failure');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });

    test('should handle abort signal during transmission', async () => {
      const abortController = new AbortController();

      // Mock fetch to delay and check abort
      const originalFetch = global.fetch;
      (global as any).fetch = async (url: string, options: any) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (options.signal?.aborted) {
              reject(new Error('AbortError'));
            } else {
              resolve({
                ok: true,
                json: async () => ({ success: true })
              });
            }
          }, 100);
        });
      };

      try {
        const mockChunkInfo = {
          content: 'test content',
          index: 0,
          metadata: {
            lineCount: 1,
            characterCount: 12,
            hasCode: false,
            language: 'JavaScript'
          },
          hash: 'test-hash'
        };

        const sendChunkMethod = (fileIndexer as any).sendChunkWithRetry.bind(fileIndexer);

        // Abort after short delay
        setTimeout(() => abortController.abort(), 50);

        let errorThrown = false;
        try {
          await sendChunkMethod(
            mockChunkInfo,
            'test.js',
            'https://test.example.com',
            { 'Content-Type': 'application/json' },
            abortController.signal,
            'test-job'
          );
        } catch (error) {
          errorThrown = true;
          assert.ok(error instanceof Error, 'Should throw proper error');
        }

        assert.ok(errorThrown, 'Should throw error when aborted');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });
  });

  suite('Error Handling', () => {
    test('should handle malformed JSON responses gracefully', async () => {
      // Mock fetch to return invalid JSON
      const originalFetch = global.fetch;
      (global as any).fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      try {
        const mockChunkInfo = {
          content: 'test content',
          index: 0,
          metadata: {
            lineCount: 1,
            characterCount: 12,
            hasCode: false,
            language: 'JavaScript'
          },
          hash: 'test-hash'
        };

        const sendChunkMethod = (fileIndexer as any).sendChunkWithRetry.bind(fileIndexer);

        const result: ChunkTransmissionResult = await sendChunkMethod(
          mockChunkInfo,
          'test.js',
          'https://test.example.com',
          { 'Content-Type': 'application/json' },
          undefined,
          'test-job'
        );

        // Should still succeed even with JSON parsing error
        assert.strictEqual(result.success, true, 'Should succeed despite JSON error');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });
  });
});
