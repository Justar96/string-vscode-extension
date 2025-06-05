import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  SUPPORTED_EXTENSIONS,
  anySignal,
  createExcludeGlob,
  createFilePattern,
  debounce,
  formatFileSize,
  getExtensionConfig,
  getLanguageFromPath,
  getOrCreateUserId
} from '../../utils';

suite('Utils Tests', () => {
  suite('getLanguageFromPath', () => {
    test('should detect TypeScript files', () => {
      assert.strictEqual(getLanguageFromPath('test.ts'), 'TypeScript');
      assert.strictEqual(getLanguageFromPath('/path/to/file.ts'), 'TypeScript');
      assert.strictEqual(getLanguageFromPath('complex.path.with.dots.ts'), 'TypeScript');
    });

    test('should detect TypeScript React files', () => {
      assert.strictEqual(getLanguageFromPath('component.tsx'), 'TypeScript React');
    });

    test('should detect JavaScript files', () => {
      assert.strictEqual(getLanguageFromPath('script.js'), 'JavaScript');
      assert.strictEqual(getLanguageFromPath('module.mjs'), 'MJS'); // mjs not in map
    });

    test('should detect JavaScript React files', () => {
      assert.strictEqual(getLanguageFromPath('component.jsx'), 'JavaScript React');
    });

    test('should detect Python files', () => {
      assert.strictEqual(getLanguageFromPath('script.py'), 'Python');
    });

    test('should detect Java files', () => {
      assert.strictEqual(getLanguageFromPath('Main.java'), 'Java');
    });

    test('should detect Go files', () => {
      assert.strictEqual(getLanguageFromPath('main.go'), 'Go');
    });

    test('should detect Rust files', () => {
      assert.strictEqual(getLanguageFromPath('main.rs'), 'Rust');
    });

    test('should detect C++ files', () => {
      assert.strictEqual(getLanguageFromPath('main.cpp'), 'C++');
      assert.strictEqual(getLanguageFromPath('header.hpp'), 'C++ Header');
    });

    test('should detect C files', () => {
      assert.strictEqual(getLanguageFromPath('main.c'), 'C');
      assert.strictEqual(getLanguageFromPath('header.h'), 'C/C++ Header');
    });

    test('should detect C# files', () => {
      assert.strictEqual(getLanguageFromPath('Program.cs'), 'C#');
    });

    test('should detect PHP files', () => {
      assert.strictEqual(getLanguageFromPath('index.php'), 'PHP');
    });

    test('should detect Ruby files', () => {
      assert.strictEqual(getLanguageFromPath('app.rb'), 'Ruby');
    });

    test('should handle unknown extensions', () => {
      assert.strictEqual(getLanguageFromPath('readme.md'), 'MD');
      assert.strictEqual(getLanguageFromPath('config.yaml'), 'YAML');
      assert.strictEqual(getLanguageFromPath('data.unknown'), 'UNKNOWN');
    });

    test('should handle files without extensions', () => {
      assert.strictEqual(getLanguageFromPath('Dockerfile'), 'Unknown');
      assert.strictEqual(getLanguageFromPath('README'), 'Unknown');
    });

    test('should handle case insensitivity', () => {
      assert.strictEqual(getLanguageFromPath('FILE.TS'), 'TypeScript');
      assert.strictEqual(getLanguageFromPath('FILE.JS'), 'JavaScript');
      assert.strictEqual(getLanguageFromPath('FILE.PY'), 'Python');
    });

    test('should handle edge cases', () => {
      assert.strictEqual(getLanguageFromPath(''), 'Unknown');
      assert.strictEqual(getLanguageFromPath('.ts'), 'TypeScript');
      assert.strictEqual(getLanguageFromPath('.'), 'Unknown');
    });
  });

  suite('formatFileSize', () => {
    test('should format zero bytes', () => {
      assert.strictEqual(formatFileSize(0), '0 B');
    });

    test('should format bytes', () => {
      assert.strictEqual(formatFileSize(512), '512 B');
      assert.strictEqual(formatFileSize(1023), '1023 B');
    });

    test('should format kilobytes', () => {
      assert.strictEqual(formatFileSize(1024), '1 KB');
      assert.strictEqual(formatFileSize(1536), '1.5 KB');
      assert.strictEqual(formatFileSize(2048), '2 KB');
    });

    test('should format megabytes', () => {
      assert.strictEqual(formatFileSize(1024 * 1024), '1 MB');
      assert.strictEqual(formatFileSize(1.5 * 1024 * 1024), '1.5 MB');
      assert.strictEqual(formatFileSize(2.7 * 1024 * 1024), '2.7 MB');
    });

    test('should format gigabytes', () => {
      assert.strictEqual(formatFileSize(1024 * 1024 * 1024), '1 GB');
      assert.strictEqual(formatFileSize(2.5 * 1024 * 1024 * 1024), '2.5 GB');
    });

    test('should format terabytes', () => {
      assert.strictEqual(formatFileSize(1024 * 1024 * 1024 * 1024), '1 TB');
      assert.strictEqual(formatFileSize(1.2 * 1024 * 1024 * 1024 * 1024), '1.2 TB');
    });

    test('should handle decimal precision correctly', () => {
      // Test rounding
      const size = 1024 * 1024 * 1.333333; // Should round to 1.3 MB
      const formatted = formatFileSize(size);
      assert.ok(formatted.includes('1.3'), 'Should round to 1 decimal place');
    });
  });

  suite('getExtensionConfig', () => {
    test('should return configuration with defaults', () => {
      // Mock workspace configuration
      const mockConfig = {
        get: (key: string, defaultValue?: any) => {
          const defaults: { [key: string]: any } = {
            url: 'https://mcp.rabtune.com',
            apiKey: '',
            maxChunkSize: 1000,
            autoIndexOnStartup: false,
            excludePatterns: [
              'node_modules',
              'venv',
              '.venv',
              'target',
              'build',
              'dist',
              '__pycache__',
              '.git'
            ],
            batchSize: 3,
            webhookPort: 3000,
            enableWebhooks: true,
            showBothViewsOnStartup: true,
            enableMultiVectorStore: false,
            credentialEndpoint: 'https://secure.rabtune.com/credentials',
            secureServerEndpoint: 'https://vault.rabtune.com',
            defaultVectorStore: undefined,
            credentialExpiryDays: 30
          };
          return defaults[key] ?? defaultValue;
        }
      };

      const originalGetConfiguration = vscode.workspace.getConfiguration;
      (vscode.workspace as any).getConfiguration = () => mockConfig;

      try {
        const config = getExtensionConfig();

        assert.strictEqual(config.url, 'https://mcp.rabtune.com');
        assert.strictEqual(config.apiKey, '');
        assert.strictEqual(config.maxChunkSize, 1000);
        assert.strictEqual(config.autoIndexOnStartup, false);
        assert.ok(Array.isArray(config.excludePatterns));
        assert.strictEqual(config.batchSize, 3);
        assert.strictEqual(config.webhookPort, 3000);
        assert.strictEqual(config.enableWebhooks, true);
        assert.strictEqual(config.showBothViewsOnStartup, true);
        assert.strictEqual(config.enableMultiVectorStore, false);
        assert.strictEqual(config.credentialExpiryDays, 30);
      } finally {
        (vscode.workspace as any).getConfiguration = originalGetConfiguration;
      }
    });
  });

  suite('debounce', () => {
    test('should debounce function calls', done => {
      let callCount = 0;
      const testFunction = () => {
        callCount++;
        return 'result';
      };

      const debouncedFunction = debounce(testFunction, 100);

      // Call multiple times quickly
      debouncedFunction();
      debouncedFunction();
      debouncedFunction();

      // Should not have been called yet
      assert.strictEqual(callCount, 0, 'Function should not be called immediately');

      // Wait for debounce period
      setTimeout(() => {
        assert.strictEqual(callCount, 1, 'Function should be called once after debounce period');
        done();
      }, 150);
    });

    test('should reset debounce timer on subsequent calls', done => {
      let callCount = 0;
      const testFunction = () => {
        callCount++;
      };

      const debouncedFunction = debounce(testFunction, 100);

      debouncedFunction();

      setTimeout(() => {
        debouncedFunction(); // Reset timer
      }, 50);

      setTimeout(() => {
        assert.strictEqual(callCount, 0, 'Function should not be called yet');
      }, 120);

      setTimeout(() => {
        assert.strictEqual(callCount, 1, 'Function should be called after reset timer expires');
        done();
      }, 180);
    });

    test('should pass arguments correctly', done => {
      let receivedArgs: any[] = [];
      const testFunction = (...args: any[]) => {
        receivedArgs = args;
        return args.join(',');
      };

      const debouncedFunction = debounce(testFunction, 50);
      debouncedFunction('a', 'b', 'c');

      setTimeout(() => {
        assert.deepStrictEqual(
          receivedArgs,
          ['a', 'b', 'c'],
          'Arguments should be passed correctly'
        );
        done();
      }, 100);
    });
  });

  suite('getOrCreateUserId', () => {
    test('should create a user ID', () => {
      const userId = getOrCreateUserId();

      assert.ok(userId, 'Should return a user ID');
      assert.ok(userId.startsWith('vscode_'), 'Should start with vscode_');
      assert.ok(userId.length > 10, 'Should be reasonably long');
    });

    test('should return the same user ID on subsequent calls', () => {
      const userId1 = getOrCreateUserId();
      const userId2 = getOrCreateUserId();

      assert.strictEqual(userId1, userId2, 'Should return the same user ID');
    });

    test('should handle workspace name in user ID', () => {
      // Mock workspace name
      const originalWorkspaceName = vscode.workspace.name;
      (vscode.workspace as any).name = 'test-workspace';

      try {
        // Reset session user ID to test with workspace name
        const utils = require('../utils');
        utils.sessionUserId = '';

        const userId = getOrCreateUserId();
        assert.ok(userId.includes('test-workspace'), 'Should include workspace name');
      } finally {
        (vscode.workspace as any).name = originalWorkspaceName;
      }
    });
  });

  suite('anySignal', () => {
    test('should create combined abort signal', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const combinedSignal = anySignal(controller1.signal, controller2.signal);

      assert.ok(combinedSignal, 'Should return a signal');
      assert.strictEqual(combinedSignal.aborted, false, 'Should not be aborted initially');
    });

    test('should abort when first signal aborts', done => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const combinedSignal = anySignal(controller1.signal, controller2.signal);

      combinedSignal.addEventListener('abort', () => {
        assert.strictEqual(combinedSignal.aborted, true, 'Combined signal should be aborted');
        done();
      });

      controller1.abort();
    });

    test('should abort when second signal aborts', done => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const combinedSignal = anySignal(controller1.signal, controller2.signal);

      combinedSignal.addEventListener('abort', () => {
        assert.strictEqual(combinedSignal.aborted, true, 'Combined signal should be aborted');
        done();
      });

      controller2.abort();
    });

    test('should handle already aborted signal', () => {
      const controller = new AbortController();
      controller.abort();

      const combinedSignal = anySignal(controller.signal);

      assert.strictEqual(combinedSignal.aborted, true, 'Should be aborted immediately');
    });

    test('should handle empty signal list', () => {
      const combinedSignal = anySignal();

      assert.ok(combinedSignal, 'Should return a signal');
      assert.strictEqual(combinedSignal.aborted, false, 'Should not be aborted');
    });
  });

  suite('createFilePattern', () => {
    test('should create relative pattern for workspace folder', () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test-workspace',
        index: 0
      };

      const pattern = createFilePattern(mockWorkspaceFolder);

      assert.ok(pattern instanceof vscode.RelativePattern, 'Should return RelativePattern');
      assert.strictEqual(
        pattern.base,
        '/test/workspace',
        'Should use workspace folder path as base'
      );
      assert.ok(pattern.pattern.includes('**/*.'), 'Should include glob pattern');
    });

    test('should include supported extensions', () => {
      const mockWorkspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file('/test'),
        name: 'test',
        index: 0
      };

      const pattern = createFilePattern(mockWorkspaceFolder);
      const patternString = pattern.pattern;

      // Check that it includes some expected extensions
      assert.ok(patternString.includes('py'), 'Should include Python extension');
      assert.ok(patternString.includes('ts'), 'Should include TypeScript extension');
      assert.ok(patternString.includes('js'), 'Should include JavaScript extension');
    });
  });

  suite('createExcludeGlob', () => {
    test('should create exclude glob from patterns', () => {
      const excludePatterns = ['node_modules', 'build', 'dist'];
      const excludeGlob = createExcludeGlob(excludePatterns);

      assert.ok(excludeGlob, 'Should return exclude glob');
      assert.ok(excludeGlob.includes('node_modules'), 'Should include node_modules');
      assert.ok(excludeGlob.includes('build'), 'Should include build');
      assert.ok(excludeGlob.includes('dist'), 'Should include dist');
    });

    test('should return undefined for empty patterns', () => {
      const excludeGlob = createExcludeGlob([]);
      assert.strictEqual(excludeGlob, undefined, 'Should return undefined for empty patterns');
    });

    test('should handle single pattern', () => {
      const excludeGlob = createExcludeGlob(['node_modules']);
      assert.ok(excludeGlob, 'Should return exclude glob');
      assert.ok(excludeGlob.includes('node_modules'), 'Should include the pattern');
    });
  });

  suite('SUPPORTED_EXTENSIONS constant', () => {
    test('should include common programming language extensions', () => {
      assert.ok(SUPPORTED_EXTENSIONS.includes('py'), 'Should include Python');
      assert.ok(SUPPORTED_EXTENSIONS.includes('ts'), 'Should include TypeScript');
      assert.ok(SUPPORTED_EXTENSIONS.includes('js'), 'Should include JavaScript');
      assert.ok(SUPPORTED_EXTENSIONS.includes('java'), 'Should include Java');
      assert.ok(SUPPORTED_EXTENSIONS.includes('go'), 'Should include Go');
      assert.ok(SUPPORTED_EXTENSIONS.includes('rs'), 'Should include Rust');
      assert.ok(SUPPORTED_EXTENSIONS.includes('cpp'), 'Should include C++');
      assert.ok(SUPPORTED_EXTENSIONS.includes('c'), 'Should include C');
      assert.ok(SUPPORTED_EXTENSIONS.includes('cs'), 'Should include C#');
      assert.ok(SUPPORTED_EXTENSIONS.includes('php'), 'Should include PHP');
      assert.ok(SUPPORTED_EXTENSIONS.includes('rb'), 'Should include Ruby');
    });

    test('should be in correct glob format', () => {
      assert.ok(SUPPORTED_EXTENSIONS.startsWith('{'), 'Should start with opening brace');
      assert.ok(SUPPORTED_EXTENSIONS.endsWith('}'), 'Should end with closing brace');
      assert.ok(SUPPORTED_EXTENSIONS.includes(','), 'Should contain comma separators');
    });
  });
});
