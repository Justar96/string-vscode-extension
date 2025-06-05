// Test setup file to mock vscode module for unit tests
import { EventEmitter } from 'events';

// Mock vscode module for unit tests
const mockVscode = {
  // Mock workspace
  workspace: {
    getConfiguration: (section?: string) => ({
      get: (key: string, defaultValue?: any) => defaultValue,
      has: (key: string) => false,
      inspect: (key: string) => undefined,
      update: (key: string, value: any) => Promise.resolve()
    }),
    findFiles: (include: any, exclude?: any) => Promise.resolve([]),
    name: 'test-workspace',
    workspaceFolders: [
      {
        uri: { fsPath: '/test/workspace', scheme: 'file' },
        name: 'test-workspace',
        index: 0
      }
    ],
    createFileSystemWatcher: () => ({
      onDidCreate: () => ({ dispose: () => {} }),
      onDidDelete: () => ({ dispose: () => {} }),
      onDidChange: () => ({ dispose: () => {} }),
      dispose: () => {}
    })
  },

  // Mock window
  window: {
    showInformationMessage: (message: string, ...items: string[]) => Promise.resolve(undefined),
    showWarningMessage: (message: string, ...items: string[]) => Promise.resolve(undefined),
    showErrorMessage: (message: string, ...items: string[]) => Promise.resolve(undefined),
    showQuickPick: (items: any[], options?: any) => Promise.resolve(undefined),
    withProgress: (options: any, task: any) =>
      task({ report: () => {} }, { isCancellationRequested: false }),
    createStatusBarItem: () => ({
      text: '',
      tooltip: '',
      backgroundColor: undefined,
      color: undefined,
      command: '',
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }),
    createTreeView: () => ({
      onDidChangeCheckboxState: () => ({ dispose: () => {} }),
      dispose: () => {}
    }),
    registerWebviewViewProvider: () => ({ dispose: () => {} }),
    createWebviewPanel: () => ({
      webview: { html: '' },
      dispose: () => {}
    }),
    showTextDocument: () => Promise.resolve()
  },

  // Mock commands
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve()
  },

  // Mock Uri
  Uri: {
    file: (path: string) => ({
      fsPath: path,
      scheme: 'file',
      path,
      toString: () => path
    }),
    parse: (uriString: string) => ({
      fsPath: uriString,
      scheme: 'file',
      path: uriString,
      toString: () => uriString
    })
  },

  // Mock enums
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  },

  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },

  TreeItemCheckboxState: {
    Unchecked: 0,
    Checked: 1
  },

  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3
  },

  ProgressLocation: {
    Notification: 15
  },

  ThemeColor(id: string) {
    return { id };
  },

  RelativePattern: class {
    public base: string;
    public pattern: string;

    constructor(base: string, pattern: string) {
      this.base = base;
      this.pattern = pattern;
    }
  },

  // Mock event emitter
  EventEmitter
};

// Mock the module system require for vscode
const originalRequire = require;
(require as any).cache = (require as any).cache || {};

// Create a mock require that intercepts vscode module requests
function mockRequire(id: string) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return originalRequire(id);
}

// Apply mocking globally for test environment
const Module = require('module');
const originalLoad = Module._load;

Module._load = function (request: string, parent: any) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalLoad.apply(this, arguments);
};

export default mockVscode;
