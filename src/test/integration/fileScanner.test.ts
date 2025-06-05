import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileScanner } from '../../fileScanner';
import { FileItem } from '../../types';

// Mock VS Code API
const mockWorkspaceFolder: vscode.WorkspaceFolder = {
  uri: vscode.Uri.file('/test/workspace'),
  name: 'test-workspace',
  index: 0
};

// Mock file system data
const mockFileStats = {
  size: 1024,
  isDirectory: () => false,
  isFile: () => true
} as any;

const mockFiles = [
  vscode.Uri.file('/test/workspace/src/index.ts'),
  vscode.Uri.file('/test/workspace/src/utils.js'),
  vscode.Uri.file('/test/workspace/tests/test.py'),
  vscode.Uri.file('/test/workspace/README.md')
];

suite('FileScanner Tests', () => {
  let fileScanner: FileScanner;

  setup(() => {
    fileScanner = new FileScanner();
  });

  suite('scanWorkspace', () => {
    test('should return empty array when no workspace folder exists', async () => {
      // Mock no workspace
      const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
      (vscode.workspace as any).workspaceFolders = undefined;

      const result = await fileScanner.scanWorkspace();

      assert.strictEqual(result.length, 0, 'Should return empty array');

      // Restore
      (vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;
    });

    test('should scan and return file items correctly', async () => {
      // Mock workspace folders
      (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

      // Mock findFiles to return our test files
      const originalFindFiles = vscode.workspace.findFiles;
      (vscode.workspace as any).findFiles = async () => mockFiles.slice(0, 3); // Only supported files

      // Mock fs.stat
      const fs = require('fs').promises;
      const originalStat = fs.stat;
      fs.stat = async () => mockFileStats;

      try {
        const result = await fileScanner.scanWorkspace();

        assert.strictEqual(result.length, 3, 'Should return 3 file items');

        result.forEach((fileItem: FileItem) => {
          assert.ok(fileItem.uri, 'Should have URI');
          assert.ok(fileItem.relativePath, 'Should have relative path');
          assert.strictEqual(fileItem.selected, true, 'Should default to selected');
          assert.ok(fileItem.language, 'Should have language');
          assert.strictEqual(fileItem.size, 1024, 'Should have correct size');
        });

        // Test specific language detection
        const tsFile = result.find(f => f.relativePath.includes('index.ts'));
        assert.strictEqual(tsFile?.language, 'TypeScript', 'Should detect TypeScript');

        const jsFile = result.find(f => f.relativePath.includes('utils.js'));
        assert.strictEqual(jsFile?.language, 'JavaScript', 'Should detect JavaScript');

        const pyFile = result.find(f => f.relativePath.includes('test.py'));
        assert.strictEqual(pyFile?.language, 'Python', 'Should detect Python');
      } finally {
        // Restore mocks
        (vscode.workspace as any).findFiles = originalFindFiles;
        fs.stat = originalStat;
      }
    });

    test('should skip files with errors gracefully', async () => {
      (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

      const originalFindFiles = vscode.workspace.findFiles;
      (vscode.workspace as any).findFiles = async () => mockFiles.slice(0, 2);

      const fs = require('fs').promises;
      const originalStat = fs.stat;
      let callCount = 0;
      fs.stat = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Permission denied');
        }
        return mockFileStats;
      };

      try {
        const result = await fileScanner.scanWorkspace();

        assert.strictEqual(result.length, 1, 'Should return only successful file');
      } finally {
        (vscode.workspace as any).findFiles = originalFindFiles;
        fs.stat = originalStat;
      }
    });

    test('should skip empty files', async () => {
      (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

      const originalFindFiles = vscode.workspace.findFiles;
      (vscode.workspace as any).findFiles = async () => [mockFiles[0]];

      const fs = require('fs').promises;
      const originalStat = fs.stat;
      fs.stat = async () => ({ ...mockFileStats, size: 0 });

      try {
        const result = await fileScanner.scanWorkspace();

        assert.strictEqual(result.length, 0, 'Should skip empty files');
      } finally {
        (vscode.workspace as any).findFiles = originalFindFiles;
        fs.stat = originalStat;
      }
    });

    test('should skip directories', async () => {
      (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

      const originalFindFiles = vscode.workspace.findFiles;
      (vscode.workspace as any).findFiles = async () => [mockFiles[0]];

      const fs = require('fs').promises;
      const originalStat = fs.stat;
      fs.stat = async () => ({
        ...mockFileStats,
        isDirectory: () => true,
        isFile: () => false
      });

      try {
        const result = await fileScanner.scanWorkspace();

        assert.strictEqual(result.length, 0, 'Should skip directories');
      } finally {
        (vscode.workspace as any).findFiles = originalFindFiles;
        fs.stat = originalStat;
      }
    });
  });

  suite('refreshFiles', () => {
    test('should preserve selection state from existing files', async () => {
      const existingFiles: FileItem[] = [
        {
          uri: mockFiles[0],
          relativePath: 'src/index.ts',
          selected: false, // Was deselected
          language: 'TypeScript',
          size: 1024
        }
      ];

      (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

      const originalFindFiles = vscode.workspace.findFiles;
      (vscode.workspace as any).findFiles = async () => [mockFiles[0]];

      const fs = require('fs').promises;
      const originalStat = fs.stat;
      fs.stat = async () => mockFileStats;

      try {
        const result = await fileScanner.refreshFiles(existingFiles);

        assert.strictEqual(result.length, 1, 'Should return 1 file');
        assert.strictEqual(result[0].selected, false, 'Should preserve selection state');
      } finally {
        (vscode.workspace as any).findFiles = originalFindFiles;
        fs.stat = originalStat;
      }
    });

    test('should default new files to selected', async () => {
      const existingFiles: FileItem[] = [];

      (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

      const originalFindFiles = vscode.workspace.findFiles;
      (vscode.workspace as any).findFiles = async () => [mockFiles[0]];

      const fs = require('fs').promises;
      const originalStat = fs.stat;
      fs.stat = async () => mockFileStats;

      try {
        const result = await fileScanner.refreshFiles(existingFiles);

        assert.strictEqual(result.length, 1, 'Should return 1 file');
        assert.strictEqual(result[0].selected, true, 'New files should default to selected');
      } finally {
        (vscode.workspace as any).findFiles = originalFindFiles;
        fs.stat = originalStat;
      }
    });

    test('should handle workspace with no folders', async () => {
      (vscode.workspace as any).workspaceFolders = undefined;

      const result = await fileScanner.refreshFiles([]);

      assert.strictEqual(result.length, 0, 'Should return empty array');
    });
  });

  suite('showFileSelectionDialog', () => {
    test('should return undefined for empty file list', async () => {
      const result = await fileScanner.showFileSelectionDialog([]);

      assert.strictEqual(result, undefined, 'Should return undefined for empty list');
    });

    test('should return undefined when no files are provided', async () => {
      const result = await fileScanner.showFileSelectionDialog(null as any);

      assert.strictEqual(result, undefined, 'Should return undefined for null input');
    });

    // Note: Testing the actual QuickPick interaction would require more complex mocking
    // of VS Code's UI APIs, which is typically done in integration tests rather than unit tests
  });

  suite('Error Handling', () => {
    test('should handle file system errors gracefully', async () => {
      (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

      const originalFindFiles = vscode.workspace.findFiles;
      (vscode.workspace as any).findFiles = async () => {
        throw new Error('File system error');
      };

      try {
        const result = await fileScanner.scanWorkspace();

        // Should either return empty array or throw error (both are acceptable)
        assert.ok(Array.isArray(result), 'Should return an array');
      } catch (error) {
        // Error is also acceptable for file system failures
        assert.ok(error instanceof Error, 'Should throw proper error');
      } finally {
        (vscode.workspace as any).findFiles = originalFindFiles;
      }
    });
  });
});
