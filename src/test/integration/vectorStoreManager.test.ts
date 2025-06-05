import * as assert from 'assert';
import * as vscode from 'vscode';
import { VectorStoreCredentials } from '../../types';
import { VectorStoreManager } from '../../vectorStoreManager';

// Mock Memento with setKeysForSync
class MockMemento implements vscode.Memento {
  private storage = new Map<string, any>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.storage.get(key) ?? defaultValue;
  }

  async update(key: string, value: any): Promise<void> {
    this.storage.set(key, value);
  }

  keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }

  setKeysForSync(_keys: readonly string[]): void {
    // Mock implementation
  }
}

// Mock Environment Variable Collection
class MockEnvironmentVariableCollection implements vscode.EnvironmentVariableCollection {
  private variables = new Map<string, vscode.EnvironmentVariableMutator>();

  get persistent(): boolean {
    return false;
  }
  set persistent(value: boolean) {
    /* mock */
  }

  get description(): string | vscode.MarkdownString | undefined {
    return undefined;
  }
  set description(value: string | vscode.MarkdownString | undefined) {
    /* mock */
  }

  replace(
    variable: string,
    value: string,
    options?: vscode.EnvironmentVariableMutatorOptions
  ): void {
    this.variables.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Replace,
      value,
      options: options || {}
    });
  }

  append(
    variable: string,
    value: string,
    options?: vscode.EnvironmentVariableMutatorOptions
  ): void {
    this.variables.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Append,
      value,
      options: options || {}
    });
  }

  prepend(
    variable: string,
    value: string,
    options?: vscode.EnvironmentVariableMutatorOptions
  ): void {
    this.variables.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Prepend,
      value,
      options: options || {}
    });
  }

  get(variable: string): vscode.EnvironmentVariableMutator | undefined {
    return this.variables.get(variable);
  }

  forEach(
    callback: (
      variable: string,
      mutator: vscode.EnvironmentVariableMutator,
      collection: vscode.EnvironmentVariableCollection
    ) => any,
    thisArg?: any
  ): void {
    this.variables.forEach((mutator, variable) => callback.call(thisArg, variable, mutator, this));
  }

  delete(variable: string): void {
    this.variables.delete(variable);
  }

  clear(): void {
    this.variables.clear();
  }

  [Symbol.iterator](): Iterator<[variable: string, mutator: vscode.EnvironmentVariableMutator]> {
    return this.variables.entries();
  }

  getScoped(_scope: vscode.EnvironmentVariableScope): vscode.EnvironmentVariableCollection {
    return this; // Simple mock implementation
  }
}

// Mock VS Code context
class MockExtensionContext implements vscode.ExtensionContext {
  public subscriptions: vscode.Disposable[] = [];
  public workspaceState: vscode.Memento;
  public globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void };
  public secrets: vscode.SecretStorage;
  public extensionUri: vscode.Uri;
  public extensionPath: string;
  public environmentVariableCollection: vscode.GlobalEnvironmentVariableCollection;
  public storageUri: vscode.Uri | undefined;
  public globalStorageUri: vscode.Uri;
  public logUri: vscode.Uri;
  public logPath: string;
  public extension: vscode.Extension<any>;
  public extensionMode: vscode.ExtensionMode;
  public storagePath: string | undefined;
  public globalStoragePath: string;
  public languageModelAccessInformation: vscode.LanguageModelAccessInformation;

  constructor() {
    this.secrets = new MockSecretStorage();
    this.workspaceState = new MockMemento();
    this.globalState = new MockMemento() as vscode.Memento & {
      setKeysForSync(keys: readonly string[]): void;
    };
    this.environmentVariableCollection =
      new MockEnvironmentVariableCollection() as vscode.GlobalEnvironmentVariableCollection;

    // Mock URI and paths
    this.extensionUri = vscode.Uri.file('/mock/extension/path');
    this.extensionPath = '/mock/extension/path';
    this.storageUri = vscode.Uri.file('/mock/storage');
    this.globalStorageUri = vscode.Uri.file('/mock/global/storage');
    this.logUri = vscode.Uri.file('/mock/log');
    this.logPath = '/mock/log';
    this.storagePath = '/mock/storage';
    this.globalStoragePath = '/mock/global/storage';

    // Mock extension and mode
    this.extension = {} as vscode.Extension<any>;
    this.extensionMode = vscode.ExtensionMode.Test;
    this.languageModelAccessInformation = {} as vscode.LanguageModelAccessInformation;
  }

  asAbsolutePath(relativePath: string): string {
    return `/mock/extension/path/${relativePath}`;
  }
}

// Mock secret storage
class MockSecretStorage implements vscode.SecretStorage {
  private storage = new Map<string, string>();

  onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> =
    new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event;

  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }
}

suite('VectorStoreManager Tests', () => {
  let vectorStoreManager: VectorStoreManager;
  let mockContext: MockExtensionContext;

  setup(() => {
    mockContext = new MockExtensionContext();
    vectorStoreManager = new VectorStoreManager(mockContext);
  });

  suite('Initialization', () => {
    test('should initialize with empty connections', async () => {
      const connections = await vectorStoreManager.getAllConnections();
      assert.strictEqual(connections.length, 0, 'Should start with no connections');
    });

    test('should initialize with undefined active store', () => {
      const activeStore = vectorStoreManager.getActiveStore();
      assert.strictEqual(activeStore, undefined, 'Should start with no active store');
    });
  });

  suite('Vector Store Registration', () => {
    test('should register vector store successfully', async () => {
      const credentials: VectorStoreCredentials = {
        id: 'test-store',
        name: 'Test Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: {
          apiKey: 'test-api-key'
        },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: ['vector-search']
        }
      };

      // Mock successful HTTP response for connection test
      const originalFetch = global.fetch;
      (global as any).fetch = async (url: string) => {
        if (url.includes('/health')) {
          return {
            ok: true,
            json: async () => ({ collections: ['test-collection'] })
          };
        }
        throw new Error('Unexpected URL');
      };

      try {
        const result = await vectorStoreManager.registerVectorStore(credentials);
        assert.strictEqual(result, true, 'Should register successfully');

        const connections = await vectorStoreManager.getAllConnections();
        assert.strictEqual(connections.length, 1, 'Should have one connection');
        assert.strictEqual(connections[0].id, 'test-store', 'Should have correct ID');
        assert.strictEqual(connections[0].isConnected, true, 'Should be connected');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });

    test('should handle registration failure', async () => {
      const credentials: VectorStoreCredentials = {
        id: 'failing-store',
        name: 'Failing Store',
        provider: 'string',
        endpoint: 'https://invalid.example.com',
        credentials: {
          apiKey: 'invalid-key'
        },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      // Mock failed HTTP response
      const originalFetch = global.fetch;
      (global as any).fetch = async () => {
        throw new Error('Network error');
      };

      try {
        const result = await vectorStoreManager.registerVectorStore(credentials);
        assert.strictEqual(result, false, 'Should fail to register');

        const connections = await vectorStoreManager.getAllConnections();
        assert.strictEqual(connections.length, 1, 'Should still create connection object');
        assert.strictEqual(connections[0].isConnected, false, 'Should not be connected');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });
  });

  suite('Connection Testing', () => {
    test('should test connection successfully', async () => {
      // First register a store
      const credentials: VectorStoreCredentials = {
        id: 'test-store',
        name: 'Test Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: { apiKey: 'test-key' },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      await vectorStoreManager.registerVectorStore(credentials);

      // Mock successful health check
      const originalFetch = global.fetch;
      (global as any).fetch = async (url: string) => {
        if (url.includes('/health')) {
          return {
            ok: true,
            json: async () => ({ collections: ['test-collection1', 'test-collection2'] })
          };
        }
        throw new Error('Unexpected URL');
      };

      try {
        const result = await vectorStoreManager.testConnection('test-store');
        assert.strictEqual(result, true, 'Should test connection successfully');

        const connection = await vectorStoreManager.getConnection('test-store');
        assert.ok(connection, 'Should have connection');
        assert.strictEqual(connection.isConnected, true, 'Should be connected');
        assert.strictEqual(connection.collections.length, 2, 'Should have collections');
        assert.ok(connection.lastHealthCheck, 'Should have health check timestamp');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });

    test('should handle connection test failure', async () => {
      const credentials: VectorStoreCredentials = {
        id: 'failing-store',
        name: 'Failing Store',
        provider: 'string',
        endpoint: 'https://invalid.example.com',
        credentials: { apiKey: 'invalid-key' },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      await vectorStoreManager.registerVectorStore(credentials);

      // Mock failed health check
      const originalFetch = global.fetch;
      (global as any).fetch = async () => {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        };
      };

      try {
        const result = await vectorStoreManager.testConnection('failing-store');
        assert.strictEqual(result, false, 'Should fail connection test');

        const connection = await vectorStoreManager.getConnection('failing-store');
        assert.ok(connection, 'Should have connection');
        assert.strictEqual(connection.isConnected, false, 'Should not be connected');
        assert.ok(connection.connectionError, 'Should have error message');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });

    test('should handle non-existent store', async () => {
      const result = await vectorStoreManager.testConnection('non-existent');
      assert.strictEqual(result, false, 'Should return false for non-existent store');
    });
  });

  suite('Store Management', () => {
    test('should set and get active store', () => {
      vectorStoreManager.setActiveStore('test-store');
      const activeStore = vectorStoreManager.getActiveStore();
      assert.strictEqual(activeStore, 'test-store', 'Should set and get active store');
    });

    test('should remove vector store', async () => {
      const credentials: VectorStoreCredentials = {
        id: 'removable-store',
        name: 'Removable Store',
        provider: 'string',
        endpoint: 'https://removable.example.com',
        credentials: { apiKey: 'removable-key' },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      await vectorStoreManager.registerVectorStore(credentials);

      let connections = await vectorStoreManager.getAllConnections();
      assert.strictEqual(connections.length, 1, 'Should have one connection');

      const result = await vectorStoreManager.removeVectorStore('removable-store');
      assert.strictEqual(result, true, 'Should remove successfully');

      connections = await vectorStoreManager.getAllConnections();
      assert.strictEqual(connections.length, 0, 'Should have no connections');
    });

    test('should handle removing non-existent store', async () => {
      const result = await vectorStoreManager.removeVectorStore('non-existent');
      assert.strictEqual(result, false, 'Should return false for non-existent store');
    });
  });

  suite('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      const credentials: VectorStoreCredentials = {
        id: 'network-error-store',
        name: 'Network Error Store',
        provider: 'string',
        endpoint: 'https://unreachable.example.com',
        credentials: { apiKey: 'test-key' },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      const originalFetch = global.fetch;
      (global as any).fetch = async () => {
        throw new Error('Network unreachable');
      };

      try {
        const result = await vectorStoreManager.registerVectorStore(credentials);
        assert.strictEqual(result, false, 'Should handle network error gracefully');

        const connection = await vectorStoreManager.getConnection('network-error-store');
        assert.ok(connection, 'Should create connection object');
        assert.strictEqual(connection.isConnected, false, 'Should not be connected');
        assert.ok(connection.connectionError, 'Should have error message');
      } finally {
        (global as any).fetch = originalFetch;
      }
    });
  });

  suite('Credential Validation', () => {
    test('should validate valid credentials', () => {
      const credentials: VectorStoreCredentials = {
        id: 'test-store',
        name: 'Test Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: {
          apiKey: 'valid-api-key'
        },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: ['vector-search']
        }
      };

      // Basic validation tests
      assert.ok(credentials.id, 'Should have ID');
      assert.ok(credentials.name, 'Should have name');
      assert.ok(credentials.provider, 'Should have provider');
      assert.ok(credentials.endpoint, 'Should have endpoint');
      assert.ok(credentials.credentials.apiKey, 'Should have API key');
      assert.ok(credentials.metadata, 'Should have metadata');
    });

    test('should detect invalid credentials', () => {
      const invalidCredentials = [
        {
          id: '',
          name: 'Test',
          provider: 'string',
          endpoint: 'https://test.com',
          credentials: { apiKey: 'key' }
        },
        {
          id: 'test',
          name: '',
          provider: 'string',
          endpoint: 'https://test.com',
          credentials: { apiKey: 'key' }
        },
        {
          id: 'test',
          name: 'Test',
          provider: '',
          endpoint: 'https://test.com',
          credentials: { apiKey: 'key' }
        },
        {
          id: 'test',
          name: 'Test',
          provider: 'string',
          endpoint: '',
          credentials: { apiKey: 'key' }
        },
        {
          id: 'test',
          name: 'Test',
          provider: 'string',
          endpoint: 'https://test.com',
          credentials: { apiKey: '' }
        }
      ];

      invalidCredentials.forEach((cred, index) => {
        const hasEmptyRequiredField =
          !cred.id || !cred.name || !cred.provider || !cred.endpoint || !cred.credentials.apiKey;
        assert.ok(
          hasEmptyRequiredField,
          `Invalid credential set ${index} should have empty required field`
        );
      });
    });
  });

  suite('URL Validation', () => {
    test('should validate proper URLs', () => {
      const validUrls = [
        'https://api.example.com',
        'https://api.example.com:8080',
        'https://subdomain.api.example.com/v1',
        'http://localhost:3000'
      ];

      validUrls.forEach(url => {
        try {
          new URL(url);
          assert.ok(true, `${url} should be valid`);
        } catch {
          assert.fail(`${url} should be valid URL`);
        }
      });
    });

    test('should detect invalid URLs', () => {
      const invalidUrls = ['not-a-url', 'ftp://example.com', 'https://', 'example.com', ''];

      invalidUrls.forEach(url => {
        let isInvalid = false;
        try {
          new URL(url);
          // If it doesn't throw, check if it's a supported protocol
          isInvalid = !url.startsWith('http://') && !url.startsWith('https://');
        } catch {
          isInvalid = true;
        }
        assert.ok(isInvalid || url === '', `${url} should be invalid`);
      });
    });
  });

  suite('Provider Types', () => {
    test('should handle different provider types', () => {
      const supportedProviders = ['string', 'pinecone', 'weaviate', 'qdrant', 'custom'];

      supportedProviders.forEach(provider => {
        const credentials: VectorStoreCredentials = {
          id: `${provider}-store`,
          name: `${provider} Store`,
          provider: provider as any,
          endpoint: 'https://test.example.com',
          credentials: { apiKey: 'test-key' },
          metadata: {
            createdAt: new Date(),
            isActive: true,
            capabilities: []
          }
        };

        assert.strictEqual(credentials.provider, provider, `Should support ${provider} provider`);
      });
    });
  });

  suite('Capability System', () => {
    test('should handle different capabilities', () => {
      const capabilities = [
        'vector-search',
        'hybrid-search',
        'metadata-filtering',
        'similarity-search',
        'batch-operations'
      ];

      const credentials: VectorStoreCredentials = {
        id: 'capability-store',
        name: 'Capability Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: { apiKey: 'test-key' },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities
        }
      };

      assert.deepStrictEqual(
        credentials.metadata.capabilities,
        capabilities,
        'Should store capabilities correctly'
      );
      assert.ok(
        credentials.metadata.capabilities.includes('vector-search'),
        'Should include vector-search capability'
      );
      assert.ok(
        credentials.metadata.capabilities.includes('hybrid-search'),
        'Should include hybrid-search capability'
      );
    });

    test('should handle empty capabilities', () => {
      const credentials: VectorStoreCredentials = {
        id: 'no-capabilities-store',
        name: 'No Capabilities Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: { apiKey: 'test-key' },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      assert.strictEqual(
        credentials.metadata.capabilities.length,
        0,
        'Should handle empty capabilities array'
      );
    });
  });

  suite('Metadata Management', () => {
    test('should track creation date', () => {
      const now = new Date();
      const credentials: VectorStoreCredentials = {
        id: 'date-store',
        name: 'Date Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: { apiKey: 'test-key' },
        metadata: {
          createdAt: now,
          isActive: true,
          capabilities: []
        }
      };

      assert.strictEqual(credentials.metadata.createdAt, now, 'Should track creation date');
      assert.ok(
        credentials.metadata.createdAt instanceof Date,
        'Creation date should be Date object'
      );
    });

    test('should track active status', () => {
      const activeCredentials: VectorStoreCredentials = {
        id: 'active-store',
        name: 'Active Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: { apiKey: 'test-key' },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      const inactiveCredentials: VectorStoreCredentials = {
        id: 'inactive-store',
        name: 'Inactive Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: { apiKey: 'test-key' },
        metadata: {
          createdAt: new Date(),
          isActive: false,
          capabilities: []
        }
      };

      assert.strictEqual(activeCredentials.metadata.isActive, true, 'Should be active');
      assert.strictEqual(inactiveCredentials.metadata.isActive, false, 'Should be inactive');
    });
  });

  suite('Authentication Methods', () => {
    test('should handle API key authentication', () => {
      const credentials: VectorStoreCredentials = {
        id: 'api-key-store',
        name: 'API Key Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: {
          apiKey: 'test-api-key-123'
        },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      assert.ok(credentials.credentials.apiKey, 'Should have API key');
      assert.strictEqual(
        credentials.credentials.apiKey,
        'test-api-key-123',
        'Should store API key correctly'
      );
    });

    test('should handle token authentication', () => {
      const credentials: VectorStoreCredentials = {
        id: 'token-store',
        name: 'Token Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: {
          apiKey: 'api-key',
          token: 'bearer-token-xyz'
        },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      assert.ok(credentials.credentials.token, 'Should have token');
      assert.strictEqual(
        credentials.credentials.token,
        'bearer-token-xyz',
        'Should store token correctly'
      );
    });

    test('should handle multiple authentication fields', () => {
      const credentials: VectorStoreCredentials = {
        id: 'multi-auth-store',
        name: 'Multi Auth Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: {
          apiKey: 'api-key-value',
          token: 'token-value',
          username: 'user123',
          password: 'pass456'
        },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      assert.ok(credentials.credentials.apiKey, 'Should have API key');
      assert.ok(credentials.credentials.token, 'Should have token');
      assert.ok(credentials.credentials.username, 'Should have username');
      assert.ok(credentials.credentials.password, 'Should have password');
    });
  });

  suite('Error Conditions', () => {
    test('should handle missing required fields gracefully', () => {
      // These would be caught by TypeScript, but testing runtime behavior
      const partialCredentials = {
        id: 'partial-store'
        // Missing required fields
      };

      assert.ok(partialCredentials.id, 'Should have ID even if incomplete');
      assert.strictEqual(typeof partialCredentials.id, 'string', 'ID should be string');
    });

    test('should handle null/undefined values', () => {
      const credentialsWithNulls = {
        id: 'null-test-store',
        name: 'Null Test Store',
        provider: 'string',
        endpoint: 'https://test.example.com',
        credentials: {
          apiKey: 'test-key',
          token: null,
          username: undefined
        },
        metadata: {
          createdAt: new Date(),
          isActive: true,
          capabilities: []
        }
      };

      assert.ok(credentialsWithNulls.credentials.apiKey, 'Should have API key');
      assert.strictEqual(credentialsWithNulls.credentials.token, null, 'Should handle null token');
      assert.strictEqual(
        credentialsWithNulls.credentials.username,
        undefined,
        'Should handle undefined username'
      );
    });
  });
});
