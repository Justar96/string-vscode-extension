import * as assert from 'assert';
import { createFilePattern, debounce, getLanguageFromPath } from '../../utils';

// Import vscode mock from test setup
import mockVscode from '../test-setup';

suite('Utils Unit Tests', () => {
  suite('getLanguageFromPath', () => {
    test('should detect TypeScript files', () => {
      assert.strictEqual(getLanguageFromPath('src/test.ts'), 'TypeScript');
      assert.strictEqual(getLanguageFromPath('component.tsx'), 'TypeScript React');
    });

    test('should detect JavaScript files', () => {
      assert.strictEqual(getLanguageFromPath('script.js'), 'JavaScript');
      assert.strictEqual(getLanguageFromPath('component.jsx'), 'JavaScript React');
    });

    test('should detect Python files', () => {
      assert.strictEqual(getLanguageFromPath('main.py'), 'Python');
    });

    test('should detect other programming languages', () => {
      assert.strictEqual(getLanguageFromPath('Main.java'), 'Java');
      assert.strictEqual(getLanguageFromPath('main.go'), 'Go');
      assert.strictEqual(getLanguageFromPath('lib.rs'), 'Rust');
      assert.strictEqual(getLanguageFromPath('app.cpp'), 'C++');
      assert.strictEqual(getLanguageFromPath('program.c'), 'C');
      assert.strictEqual(getLanguageFromPath('Program.cs'), 'C#');
    });

    test('should handle unknown extensions', () => {
      assert.strictEqual(getLanguageFromPath('file.xyz'), 'XYZ');
      assert.strictEqual(getLanguageFromPath('file.unknown'), 'UNKNOWN');
    });

    test('should handle files without extensions', () => {
      assert.strictEqual(getLanguageFromPath('Makefile'), 'Unknown');
      assert.strictEqual(getLanguageFromPath('README'), 'Unknown');
    });

    test('should handle empty paths', () => {
      assert.strictEqual(getLanguageFromPath(''), 'Unknown');
    });

    test('should be case insensitive for extensions', () => {
      assert.strictEqual(getLanguageFromPath('Test.JS'), 'JavaScript');
      assert.strictEqual(getLanguageFromPath('Component.TSX'), 'TypeScript React');
    });
  });

  suite('debounce', () => {
    test('should debounce function calls', done => {
      let callCount = 0;
      const testFunction = () => {
        callCount++;
      };

      const debouncedFunction = debounce(testFunction, 50);

      // Call multiple times quickly
      debouncedFunction();
      debouncedFunction();
      debouncedFunction();

      // Should not have been called yet
      assert.strictEqual(callCount, 0, 'Function should not be called immediately');

      setTimeout(() => {
        assert.strictEqual(callCount, 1, 'Function should be called exactly once after delay');
        done();
      }, 100);
    });

    test('should reset debounce timer on subsequent calls', done => {
      let callCount = 0;
      const testFunction = () => {
        callCount++;
      };

      const debouncedFunction = debounce(testFunction, 50);

      debouncedFunction();

      setTimeout(() => {
        debouncedFunction(); // This should reset the timer
      }, 25);

      setTimeout(() => {
        assert.strictEqual(callCount, 0, 'Function should not be called yet');
      }, 60);

      setTimeout(() => {
        assert.strictEqual(callCount, 1, 'Function should be called after extended delay');
        done();
      }, 100);
    });

    test('should pass arguments correctly', done => {
      let receivedArgs: any[] = [];
      const testFunction = (...args: any[]) => {
        receivedArgs = args;
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

    test('should use latest arguments when called multiple times', done => {
      let receivedArgs: any[] = [];
      const testFunction = (...args: any[]) => {
        receivedArgs = args;
      };

      const debouncedFunction = debounce(testFunction, 50);
      debouncedFunction('first');
      debouncedFunction('second');
      debouncedFunction('third');

      setTimeout(() => {
        assert.deepStrictEqual(receivedArgs, ['third'], 'Should use latest arguments');
        done();
      }, 100);
    });
  });

  suite('createFilePattern', () => {
    test('should create proper file pattern', () => {
      const mockWorkspaceFolder = {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0
      } as any;
      const pattern = createFilePattern(mockWorkspaceFolder);

      assert.ok(pattern instanceof mockVscode.RelativePattern, 'Should return RelativePattern');
      assert.strictEqual(
        pattern.base,
        mockWorkspaceFolder,
        'Should use workspace folder object as base'
      );
      assert.ok(pattern.pattern.includes('**/*.'), 'Should include glob pattern');
      assert.ok(pattern.pattern.includes('{'), 'Should include extension group');
      assert.ok(
        pattern.pattern.includes('py,ts,js'),
        'Should include Python, TypeScript, JavaScript extensions'
      );
      assert.ok(pattern.pattern.includes('tsx,java'), 'Should include TSX and Java extensions');
    });

    test('should handle case when no workspace folders exist', () => {
      // Temporarily modify the mock
      const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
      mockVscode.workspace.workspaceFolders = undefined as any;

      try {
        const mockWorkspaceFolder = {
          uri: { fsPath: '/fallback/workspace' },
          name: 'fallback-workspace',
          index: 0
        } as any;
        const pattern = createFilePattern(mockWorkspaceFolder);
        // Should still return a pattern with reasonable defaults
        assert.ok(
          pattern instanceof mockVscode.RelativePattern,
          'Should return RelativePattern even without workspace'
        );
      } finally {
        // Restore original value
        mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
      }
    });
  });

  suite('integration tests', () => {
    test('should work together for common workflows', () => {
      // Test a common workflow: detect language and create pattern
      const filePath = 'src/components/Button.tsx';
      const language = getLanguageFromPath(filePath);
      const mockWorkspaceFolder = {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0
      } as any;
      const pattern = createFilePattern(mockWorkspaceFolder);

      assert.strictEqual(language, 'TypeScript React', 'Should detect TSX files');
      assert.ok(pattern.pattern.includes('tsx'), 'Pattern should include tsx extension');
    });

    test('should handle edge cases gracefully', () => {
      // Test edge cases together
      const emptyPath = getLanguageFromPath('');
      const unknownExt = getLanguageFromPath('file.unknown');

      assert.strictEqual(emptyPath, 'Unknown', 'Should handle empty paths');
      assert.strictEqual(unknownExt, 'UNKNOWN', 'Should handle unknown extensions');
    });
  });
});
