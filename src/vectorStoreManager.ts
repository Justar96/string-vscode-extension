import * as vscode from "vscode";
import { 
  VectorStoreCredentials, 
  VectorStoreConnection, 
  SecureCredentialResponse,
  VectorStoreSelectionContext 
} from "./types";
import { getExtensionConfig } from "./utils";

// ─── Vector Store Manager ──────────────────────────────────────────────
export class VectorStoreManager {
  private connections: Map<string, VectorStoreConnection> = new Map();
  private activeStoreId: string | undefined;
  private secureStorage: vscode.SecretStorage;

  constructor(private context: vscode.ExtensionContext) {
    this.secureStorage = context.secrets;
    this.loadStoredConnections();
  }

  // ─── Credential Management ─────────────────────────────────────────────
  async registerVectorStore(credentials: VectorStoreCredentials): Promise<boolean> {
    try {
      // Store credentials securely
      await this.secureStorage.store(
        `vectorstore_${credentials.id}`, 
        JSON.stringify(credentials)
      );

      // Create connection object
      const connection: VectorStoreConnection = {
        id: credentials.id,
        credentials,
        isConnected: false,
        collections: []
      };

      this.connections.set(credentials.id, connection);
      
      // Test connection
      await this.testConnection(credentials.id);
      
      vscode.window.showInformationMessage(
        `✅ Vector store "${credentials.name}" registered successfully`
      );
      
      return true;
    } catch (error) {
      console.error("Failed to register vector store:", error);
      vscode.window.showErrorMessage(
        `❌ Failed to register vector store: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  async requestCredentialsFromWeb(storeType: string, userInfo: any): Promise<SecureCredentialResponse> {
    const config = getExtensionConfig();
    
    try {
      const response = await fetch(config.credentialEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storeType,
          userInfo,
          requestId: this.generateRequestId(),
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as SecureCredentialResponse;
      
      if (result.success) {
        // Decrypt and store the credentials
        const decryptedCredentials = await this.decryptCredentials(
          result.encryptedToken, 
          result.credentialId
        );
        
        if (decryptedCredentials) {
          await this.registerVectorStore(decryptedCredentials);
        }
      }

      return result;
    } catch (error) {
      console.error("Failed to request credentials:", error);
      return {
        success: false,
        credentialId: '',
        encryptedToken: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async decryptCredentials(encryptedToken: string, credentialId: string): Promise<VectorStoreCredentials | null> {
    const config = getExtensionConfig();
    
    try {
      const response = await fetch(`${config.secureServerEndpoint}/decrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          encryptedToken,
          credentialId
        })
      });

      if (!response.ok) {
        throw new Error(`Decryption failed: ${response.status}`);
      }

      return await response.json() as VectorStoreCredentials;
    } catch (error) {
      console.error("Failed to decrypt credentials:", error);
      return null;
    }
  }

  // ─── Connection Management ─────────────────────────────────────────────
  async testConnection(storeId: string): Promise<boolean> {
    const connection = this.connections.get(storeId);
    if (!connection) {
      return false;
    }

    try {
      const testResult = await this.performHealthCheck(connection.credentials);
      
      connection.isConnected = testResult.success;
      connection.lastHealthCheck = new Date();
      connection.connectionError = testResult.error;
      
      if (testResult.success) {
        connection.collections = testResult.collections || [];
      }

      return testResult.success;
    } catch (error) {
      connection.isConnected = false;
      connection.connectionError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  private async performHealthCheck(credentials: VectorStoreCredentials): Promise<{
    success: boolean;
    collections?: string[];
    error?: string;
  }> {
    try {
      const headers: any = {
        'Content-Type': 'application/json',
      };

      // Add provider-specific auth headers
      if (credentials.credentials.apiKey) {
        headers['Authorization'] = `Bearer ${credentials.credentials.apiKey}`;
      }
      if (credentials.credentials.token) {
        headers['X-API-Token'] = credentials.credentials.token;
      }

      const response = await fetch(`${credentials.endpoint}/health`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const result = await response.json() as { collections?: string[] };
      return {
        success: true,
        collections: result.collections || []
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // ─── Store Selection Logic ─────────────────────────────────────────────
  async selectBestVectorStore(context: VectorStoreSelectionContext): Promise<string | null> {
    const availableStores = Array.from(this.connections.values())
      .filter(conn => conn.isConnected);

    if (availableStores.length === 0) {
      return null;
    }

    // Use user's preferred store if available and connected
    if (context.selectedStoreId) {
      const preferred = this.connections.get(context.selectedStoreId);
      if (preferred?.isConnected) {
        return context.selectedStoreId;
      }
    }

    // Auto-detect best store based on capabilities and load
    if (context.autoDetectBestStore) {
      return this.autoSelectBestStore(availableStores, context);
    }

    // Use fallback stores
    for (const fallbackId of context.fallbackStores) {
      const fallback = this.connections.get(fallbackId);
      if (fallback?.isConnected) {
        return fallbackId;
      }
    }

    // Use the first available store
    return availableStores[0].id;
  }

  private autoSelectBestStore(
    availableStores: VectorStoreConnection[], 
    context: VectorStoreSelectionContext
  ): string {
    // Simple scoring algorithm - can be enhanced
    let bestStore = availableStores[0];
    let bestScore = 0;

    for (const store of availableStores) {
      let score = 0;
      
      // Prefer stores with target collection
      if (context.targetCollection && 
          store.collections.includes(context.targetCollection)) {
        score += 10;
      }
      
      // Prefer recently used stores
      if (store.credentials.metadata.lastUsed) {
        const daysSinceUsed = (Date.now() - store.credentials.metadata.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 5 - daysSinceUsed);
      }
      
      // Prefer stores with more capabilities
      score += store.credentials.metadata.capabilities.length;
      
      if (score > bestScore) {
        bestScore = score;
        bestStore = store;
      }
    }

    return bestStore.id;
  }

  // ─── Store Operations ──────────────────────────────────────────────────
  async getConnectionStatus(): Promise<Map<string, boolean>> {
    const status = new Map<string, boolean>();
    
    for (const [id, connection] of this.connections) {
      status.set(id, connection.isConnected);
    }
    
    return status;
  }

  async getAllConnections(): Promise<VectorStoreConnection[]> {
    return Array.from(this.connections.values());
  }

  async getConnection(storeId: string): Promise<VectorStoreConnection | undefined> {
    return this.connections.get(storeId);
  }

  async removeVectorStore(storeId: string): Promise<boolean> {
    try {
      // Remove from secure storage
      await this.secureStorage.delete(`vectorstore_${storeId}`);
      
      // Remove from memory
      this.connections.delete(storeId);
      
      // Update active store if needed
      if (this.activeStoreId === storeId) {
        this.activeStoreId = undefined;
      }
      
      return true;
    } catch (error) {
      console.error("Failed to remove vector store:", error);
      return false;
    }
  }

  // ─── Utility Methods ───────────────────────────────────────────────────
  private async loadStoredConnections(): Promise<void> {
    // This would typically load from secure storage on extension startup
    // Implementation depends on how VS Code handles secret enumeration
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setActiveStore(storeId: string): void {
    if (this.connections.has(storeId)) {
      this.activeStoreId = storeId;
      
      // Update last used timestamp
      const connection = this.connections.get(storeId);
      if (connection) {
        connection.credentials.metadata.lastUsed = new Date();
      }
    }
  }

  getActiveStore(): string | undefined {
    return this.activeStoreId;
  }
} 