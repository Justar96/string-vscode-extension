import * as vscode from 'vscode';
import { VectorStoreCredentials } from './types';
import { VectorStoreManager } from './vectorStoreManager';

// ─── Vector Store Management Webview ───────────────────────────────────
export class VectorStoreWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vectorStoreManagerView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private vectorStoreManager: VectorStoreManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    this.updateContent();

    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
      case 'refresh':
        this.updateContent();
        break;
      case 'addVectorStore':
        await this.handleAddVectorStore(data.storeData);
        break;
      case 'removeVectorStore':
        await this.handleRemoveVectorStore(data.storeId);
        break;
      case 'testConnection':
        await this.handleTestConnection(data.storeId);
        break;
      case 'setActiveStore':
        await this.handleSetActiveStore(data.storeId);
        break;
      case 'requestWebCredentials':
        await this.handleRequestWebCredentials(data.storeType, data.userInfo);
        break;
      }
    });
  }

  private async handleAddVectorStore(storeData: any): Promise<void> {
    try {
      const credentials: VectorStoreCredentials = {
        id: `store_${Date.now()}`,
        name: storeData.name,
        provider: storeData.provider,
        endpoint: storeData.endpoint,
        credentials: storeData.credentials,
        metadata: {
          createdAt: new Date(),
          isActive: false,
          capabilities: storeData.capabilities || []
        }
      };

      const success = await this.vectorStoreManager.registerVectorStore(credentials);
      if (success) {
        this.updateContent().catch(error => {
          console.error('Failed to update vector store webview content:', error);
          vscode.window.showErrorMessage('Failed to refresh vector store view');
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to add vector store: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleRemoveVectorStore(storeId: string): Promise<void> {
    const success = await this.vectorStoreManager.removeVectorStore(storeId);
    if (success) {
      this.updateContent().catch(error => {
        console.error('Failed to update vector store webview content after removal:', error);
        vscode.window.showErrorMessage('Failed to refresh vector store view');
      });
    }
  }

  private async handleTestConnection(storeId: string): Promise<void> {
    await this.vectorStoreManager.testConnection(storeId);
    this.updateContent().catch(error => {
      console.error('Failed to update vector store webview content after test:', error);
      vscode.window.showErrorMessage('Failed to refresh vector store view');
    });
  }

  private async handleSetActiveStore(storeId: string): Promise<void> {
    this.vectorStoreManager.setActiveStore(storeId);
    this.updateContent().catch(error => {
      console.error(
        'Failed to update vector store webview content after setting active store:',
        error
      );
      vscode.window.showErrorMessage('Failed to refresh vector store view');
    });
  }

  private async handleRequestWebCredentials(storeType: string, userInfo: any): Promise<void> {
    try {
      const result = await this.vectorStoreManager.requestCredentialsFromWeb(storeType, userInfo);
      if (result.success) {
        vscode.window.showInformationMessage('✅ Credentials received and stored securely');
        this.updateContent().catch(error => {
          console.error(
            'Failed to update vector store webview content after credential request:',
            error
          );
          vscode.window.showErrorMessage('Failed to refresh vector store view');
        });
      } else {
        vscode.window.showErrorMessage(`❌ Failed to get credentials: ${result.error}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `❌ Credential request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public async updateContent(): Promise<void> {
    if (this._view) {
      this._view.webview.html = await this.generateWebviewHTML();
    }
  }

  private async generateStoreListHTML(): Promise<string> {
    const connections = await this.vectorStoreManager.getAllConnections();
    const activeStoreId = this.vectorStoreManager.getActiveStore();

    if (connections.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🔗</div>
          <div class="empty-title">No Vector Stores</div>
          <div class="empty-description">
            Connect to vector databases like Pinecone, Weaviate, Chroma, or Qdrant to start indexing your codebase.
          </div>
          <button class="action-btn" onclick="toggleAddForm()">
            ➕ Add Your First Store
          </button>
        </div>
      `;
    }

    return connections
      .map(store => {
        const isActive = store.id === activeStoreId;
        const collections = store.collections || [];

        return `
        <div class="store-card ${isActive ? 'active' : ''}">
          <div class="store-header">
            <div class="store-info">
              <div class="store-name">${store.credentials.name}</div>
              <div class="store-provider">${store.credentials.provider.toUpperCase()}</div>
            </div>
            <div class="connection-status">
              <div class="status-dot ${store.isConnected ? 'connected' : 'disconnected'}"></div>
              <span>${store.isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          
          <div class="store-details">
            <div class="detail-row">
              <span class="detail-label">Endpoint:</span>
              <span class="detail-value" title="${store.credentials.endpoint}">
                ${
  store.credentials.endpoint.length > 30
    ? `${store.credentials.endpoint.substring(0, 30)}...`
    : store.credentials.endpoint
}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Created:</span>
              <span class="detail-value">
                ${
  store.credentials.metadata?.createdAt
    ? new Date(store.credentials.metadata.createdAt).toLocaleDateString()
    : 'Unknown'
}
              </span>
            </div>
          </div>
          
          ${
  collections.length > 0
    ? `
            <div class="collections-preview">
              <div class="collections-title">Collections (${collections.length})</div>
              <div class="collections-tags">
                ${collections
    .slice(0, 3)
    .map(
      collection => `
                  <span class="collection-tag">${collection}</span>
                `
    )
    .join('')}
                ${
  collections.length > 3
    ? `
                  <span class="collection-tag">+${collections.length - 3} more</span>
                `
    : ''
}
              </div>
            </div>
          `
    : ''
}
          
          <div class="store-actions">
            ${
  isActive && store.isConnected
    ? `<button class="store-btn success" disabled>✓ Active</button>`
    : `<button class="store-btn primary tooltip" data-tooltip="Set as default store" onclick="setActiveStore('${store.id}')">Activate</button>`
}
            <button class="store-btn secondary tooltip" data-tooltip="Test connection" onclick="testConnection('${
  store.id
}')">Test</button>
            <button class="store-btn danger tooltip" data-tooltip="Remove store" onclick="removeStore('${
  store.id
}')">Delete</button>
          </div>
        </div>
      `;
      })
      .join('');
  }

  private async generateWebviewHTML(): Promise<string> {
    const storeListHTML = await this.generateStoreListHTML();
    const connections = await this.vectorStoreManager.getAllConnections();
    const connectedCount = connections.filter(c => c.isConnected).length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vector Store Manager</title>
    <style>
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            padding: 12px;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            margin: 0;
            line-height: 1.4;
        }
        
        .dashboard-header {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 12px;
            margin-bottom: 12px;
        }
        
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .header-title {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .header-title h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        
        .header-stats {
            display: flex;
            gap: 12px;
            font-size: 11px;
        }
        
        .stat-item {
            text-align: center;
        }
        
        .stat-value {
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        
        .stat-label {
            color: var(--vscode-descriptionForeground);
            font-size: 9px;
            text-transform: uppercase;
        }
        
        .quick-actions {
            display: flex;
            gap: 6px;
            margin-top: 8px;
        }
        
        .action-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 6px 10px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .action-btn.secondary {
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
        }
        
        .section {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            margin-bottom: 12px;
        }
        
        .section-header {
            padding: 10px 12px;
            background: var(--vscode-input-background);
            border-bottom: 1px solid var(--vscode-input-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .section-title {
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .section-content {
            padding: 12px;
        }
        
        .store-grid {
            display: grid;
            gap: 8px;
        }
        
        .store-card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 12px;
        }
        
        .store-card.active {
            border-color: var(--vscode-charts-green);
        }
        
        .store-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
        }
        
        .store-info {
            flex: 1;
        }
        
        .store-name {
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground);
            margin-bottom: 3px;
        }
        
        .store-provider {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            font-weight: 500;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            padding: 2px 4px;
            border-radius: 3px;
            display: inline-block;
        }
        
        .connection-status {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            font-weight: 500;
        }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        
        .status-dot.connected {
            background: #28a745;
        }
        
        .status-dot.disconnected {
            background: #dc3545;
        }
        
        .status-dot.testing {
            background: #ffc107;
        }
        
        .store-details {
            margin-bottom: 8px;
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 10px;
        }
        
        .detail-label {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }
        
        .detail-value {
            color: var(--vscode-foreground);
            font-weight: 500;
            max-width: 60%;
            text-align: right;
            word-break: break-all;
        }
        
        .collections-preview {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 6px;
            margin-bottom: 8px;
        }
        
        .collections-title {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            font-weight: 500;
            margin-bottom: 3px;
        }
        
        .collections-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
        }
        
        .collection-tag {
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 8px;
            font-weight: 400;
        }
        
        .store-actions {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }
        
        .store-btn {
            padding: 4px 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            cursor: pointer;
            font-size: 9px;
            font-weight: 500;
            flex: 1;
            min-width: 50px;
            text-align: center;
        }
        
        .store-btn.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .store-btn.secondary {
            background: var(--vscode-input-background);
            color: var(--vscode-foreground);
        }
        
        .store-btn.danger {
            background: var(--vscode-input-background);
            color: var(--vscode-testing-iconFailed);
        }
        
        .store-btn.success {
            background: var(--vscode-input-background);
            color: var(--vscode-charts-green);
            cursor: default;
        }
        
        .empty-state {
            text-align: center;
            padding: 24px 16px;
            color: var(--vscode-descriptionForeground);
        }
        
        .empty-icon {
            font-size: 32px;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        
        .empty-title {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--vscode-foreground);
        }
        
        .empty-description {
            font-size: 11px;
            line-height: 1.4;
            margin-bottom: 16px;
        }
        
        .form-section {
            margin-bottom: 12px;
        }
        
        .form-header {
            padding: 10px 12px;
            background: var(--vscode-input-background);
            border-radius: 3px 3px 0 0;
            border-bottom: 1px solid var(--vscode-input-border);
            cursor: pointer;
            user-select: none;
        }
        
        .form-header h4 {
            margin: 0;
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .form-content {
            padding: 12px;
            background: var(--vscode-input-background);
            border-radius: 0 0 3px 3px;
        }
        
        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        
        .form-group {
            margin-bottom: 12px;
        }
        
        .form-group.full-width {
            grid-column: 1 / -1;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-weight: 500;
            color: var(--vscode-foreground);
            font-size: 11px;
        }
        
        .form-group input, .form-group select, .form-group textarea {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 12px;
        }
        
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .form-actions {
            display: flex;
            gap: 6px;
            justify-content: flex-end;
            margin-top: 12px;
        }
        
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <!-- Dashboard Header -->
    <div class="dashboard-header">
        <div class="header-content">
            <div class="header-title">
                <h3>🔗 Vector Stores</h3>
            </div>
            <div class="header-stats">
                <div class="stat-item">
                    <span class="stat-value">${connections.length}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${connectedCount}</span>
                    <span class="stat-label">Connected</span>
                </div>
            </div>
        </div>
        <div class="quick-actions">
            <button class="action-btn" onclick="toggleWebCredentials()">
                🌐 Get Credentials
            </button>
            <button class="action-btn secondary" onclick="toggleAddForm()">
                ➕ Add Store
            </button>
        </div>
    </div>

    <!-- Web Credentials Section -->
    <div id="webCredentialsSection" class="section hidden">
        <div class="section-header">
            <div class="section-title">🔐 Secure Credential Management</div>
        </div>
        <div class="section-content">
            <p style="margin-bottom: 16px; color: var(--vscode-descriptionForeground); font-size: 13px; line-height: 1.5;">
                Request credentials from your secure web endpoint for quick setup.
            </p>
            <div class="form-grid">
                <div class="form-group">
                    <label for="storeTypeSelect">Store Type:</label>
                    <select id="storeTypeSelect">
                        <option value="pinecone">Pinecone</option>
                        <option value="weaviate">Weaviate</option>
                        <option value="chroma">Chroma</option>
                        <option value="qdrant">Qdrant</option>
                        <option value="string">String</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="userInfo">User Info (optional):</label>
                    <input type="text" id="userInfo" placeholder="Username or email">
                </div>
            </div>
            <div class="form-actions">
                <button class="action-btn" onclick="requestWebCredentials()">
                    🌐 Request Credentials
                </button>
            </div>
        </div>
    </div>
    
    <!-- Manual Add Form -->
    <div id="addStoreForm" class="section hidden">
        <div class="section-header">
            <div class="section-title">➕ Add Vector Store Manually</div>
        </div>
        <div class="section-content">
            <div class="form-grid">
                <div class="form-group">
                    <label for="storeName">Store Name:</label>
                    <input type="text" id="storeName" placeholder="My Vector Store">
                </div>
                <div class="form-group">
                    <label for="provider">Provider:</label>
                    <select id="provider">
                        <option value="string">String</option>
                        <option value="pinecone">Pinecone</option>
                        <option value="weaviate">Weaviate</option>
                        <option value="chroma">Chroma</option>
                        <option value="qdrant">Qdrant</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>
                <div class="form-group full-width">
                    <label for="endpoint">Endpoint URL:</label>
                    <input type="text" id="endpoint" placeholder="https://your-vector-store.com/api">
                </div>
                <div class="form-group full-width">
                    <label for="apiKey">API Key:</label>
                    <input type="password" id="apiKey" placeholder="Your API key">
                </div>
                <div class="form-group full-width">
                    <label for="capabilities">Capabilities (comma-separated):</label>
                    <input type="text" id="capabilities" placeholder="search,insert,delete,update">
                </div>
            </div>
            <div class="form-actions">
                <button class="action-btn" onclick="addVectorStore()">
                    ✅ Add Store
                </button>
                <button class="action-btn secondary" onclick="toggleAddForm()">
                    ❌ Cancel
                </button>
            </div>
        </div>
    </div>
    
    <!-- Store List -->
    <div class="section">
        <div class="section-header">
            <div class="section-title">📊 Your Vector Stores</div>
            ${
  connections.length > 0
    ? `<button class="action-btn secondary" onclick="refreshStores()">🔄 Refresh</button>`
    : ''
}
        </div>
        <div class="section-content">
            <div class="store-grid" id="storeList">
                ${storeListHTML}
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function toggleAddForm() {
            const form = document.getElementById('addStoreForm');
            const webCredentials = document.getElementById('webCredentialsSection');
            
            form.classList.toggle('hidden');
            if (!form.classList.contains('hidden')) {
                webCredentials.classList.add('hidden');
            }
        }
        
        function toggleWebCredentials() {
            const webCredentials = document.getElementById('webCredentialsSection');
            const addForm = document.getElementById('addStoreForm');
            
            webCredentials.classList.toggle('hidden');
            if (!webCredentials.classList.contains('hidden')) {
                addForm.classList.add('hidden');
            }
        }
        
        function refreshStores() {
            vscode.postMessage({ type: 'refresh' });
        }
        
        function addVectorStore() {
            const storeData = {
                name: document.getElementById('storeName').value,
                provider: document.getElementById('provider').value,
                endpoint: document.getElementById('endpoint').value,
                credentials: {
                    apiKey: document.getElementById('apiKey').value
                },
                capabilities: document.getElementById('capabilities').value.split(',').map(c => c.trim())
            };
            
            if (!storeData.name || !storeData.endpoint) {
                alert('Please fill in required fields');
                return;
            }
            
            vscode.postMessage({
                type: 'addVectorStore',
                storeData: storeData
            });
            
            toggleAddForm();
        }
        
        function requestWebCredentials() {
            const storeType = document.getElementById('storeTypeSelect').value;
            const userInfo = document.getElementById('userInfo').value;
            
            vscode.postMessage({
                type: 'requestWebCredentials',
                storeType: storeType,
                userInfo: userInfo || null
            });
        }
        
        function removeStore(storeId) {
            if (confirm('Are you sure you want to remove this vector store?')) {
                vscode.postMessage({
                    type: 'removeVectorStore',
                    storeId: storeId
                });
            }
        }
        
        function testConnection(storeId) {
            vscode.postMessage({
                type: 'testConnection',
                storeId: storeId
            });
        }
        
        function setActiveStore(storeId) {
            vscode.postMessage({
                type: 'setActiveStore',
                storeId: storeId
            });
        }
        
        // Load initial data
        vscode.postMessage({ type: 'refresh' });
    </script>
</body>
</html>`;
  }
}
