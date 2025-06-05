import * as vscode from "vscode";
import { VectorStoreManager } from "./vectorStoreManager";
import { VectorStoreCredentials } from "./types";

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
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
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
        this.updateContent();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add vector store: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleRemoveVectorStore(storeId: string): Promise<void> {
    const success = await this.vectorStoreManager.removeVectorStore(storeId);
    if (success) {
      this.updateContent();
    }
  }

  private async handleTestConnection(storeId: string): Promise<void> {
    await this.vectorStoreManager.testConnection(storeId);
    this.updateContent();
  }

  private async handleSetActiveStore(storeId: string): Promise<void> {
    this.vectorStoreManager.setActiveStore(storeId);
    this.updateContent();
  }

  private async handleRequestWebCredentials(storeType: string, userInfo: any): Promise<void> {
    try {
      const result = await this.vectorStoreManager.requestCredentialsFromWeb(storeType, userInfo);
      if (result.success) {
        vscode.window.showInformationMessage("✅ Credentials received and stored securely");
        this.updateContent();
      } else {
        vscode.window.showErrorMessage(`❌ Failed to get credentials: ${result.error}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`❌ Credential request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public updateContent(): void {
    if (this._view) {
      this._view.webview.html = this.generateWebviewHTML();
    }
  }

  private generateWebviewHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vector Store Manager</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            padding: 16px;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            margin: 0;
        }
        
        .header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
        }
        
        .header h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-sideBarSectionHeader-foreground);
        }
        
        .store-list {
            margin-bottom: 16px;
        }
        
        .store-item {
            padding: 12px;
            margin-bottom: 8px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            background: var(--vscode-editor-background);
        }
        
        .store-item.active {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }
        
        .store-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .store-name {
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .store-provider {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
        }
        
        .store-status {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
        }
        
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        
        .status-connected { background: #28a745; }
        .status-disconnected { background: #dc3545; }
        .status-testing { background: #ffc107; }
        
        .store-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        
        .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
        }
        
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-danger {
            background: var(--vscode-errorForeground);
            color: var(--vscode-errorBackground);
        }
        
        .add-store-section {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 16px;
        }
        
        .form-group {
            margin-bottom: 12px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .form-group input, .form-group select, .form-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 13px;
        }
        
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .web-credentials-section {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-focusBorder);
            padding: 12px;
            margin-bottom: 16px;
            border-radius: 4px;
        }
        
        .web-credentials-section h4 {
            margin: 0 0 8px 0;
            color: var(--vscode-foreground);
        }
        
        .web-credentials-section p {
            margin: 0 0 8px 0;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        
        .hidden {
            display: none;
        }
        
        .collapsible {
            cursor: pointer;
            user-select: none;
        }
        
        .collapsible:hover {
            background: var(--vscode-list-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h3>🔗 Vector Stores</h3>
        <button class="btn btn-primary" onclick="toggleAddForm()">+ Add Store</button>
    </div>
    
    <div class="web-credentials-section">
        <h4>🔐 Secure Credential Management</h4>
        <p>Request credentials from your secure web endpoint or add them manually below.</p>
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
        <button class="btn btn-primary" onclick="requestWebCredentials()">🌐 Request from Web</button>
    </div>
    
    <div id="addStoreForm" class="add-store-section hidden">
        <h4>Add Vector Store Manually</h4>
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
        <div class="form-group">
            <label for="endpoint">Endpoint URL:</label>
            <input type="text" id="endpoint" placeholder="https://your-vector-store.com/api">
        </div>
        <div class="form-group">
            <label for="apiKey">API Key:</label>
            <input type="password" id="apiKey" placeholder="Your API key">
        </div>
        <div class="form-group">
            <label for="capabilities">Capabilities (comma-separated):</label>
            <input type="text" id="capabilities" placeholder="search,insert,delete,update">
        </div>
        <button class="btn btn-primary" onclick="addVectorStore()">Add Store</button>
        <button class="btn btn-secondary" onclick="toggleAddForm()">Cancel</button>
    </div>
    
    <div class="store-list" id="storeList">
        <p>Loading vector stores...</p>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function toggleAddForm() {
            const form = document.getElementById('addStoreForm');
            form.classList.toggle('hidden');
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