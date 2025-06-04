/**
 * String VS Code Extension - Main Entry Point
 * 
 * This extension provides intelligent codebase indexing with real-time processing
 * dashboard and webhook notifications. It allows users to select files from their
 * workspace and submit them to a backend server for AI processing.
 * 
 * Key Features:
 * - Tree view file selector with checkbox selection
 * - Real-time webhook notifications
 * - Live dashboard with processing metrics
 * - Configurable chunk sizes and batch processing
 * - Auto-show views on startup
 * 
 * Architecture:
 * - TreeDataProvider: Manages file selection UI
 * - WebhookServer: Express.js server for real-time notifications
 * - DashboardProvider: Live status updates and metrics
 * - IndexingEngine: File processing and HTTP submission
 * 
 * For developers: See DEVELOPER_SETUP.md for configuration and customization
 */

import * as vscode from "vscode";
import { promises as fs } from "fs";
import * as path from "path";

// ─── interfaces and types ──────────────────────────────────────────────
interface FileItem {
  uri: vscode.Uri;
  relativePath: string;
  selected: boolean;
  language: string;
  size: number;
}

interface IndexingState {
  autoIndexEnabled: boolean;
  isIndexing: boolean;
  lastIndexed: Date | null;
  totalFiles: number;
  indexedFiles: number;
}

interface ExplorerNode {
  type: 'folder' | 'file';
  label: string;
  uri: vscode.Uri;
  relativePath: string;
  children?: ExplorerNode[];
  fileItem?: FileItem;
  parent?: ExplorerNode;
}

// ─── tree view data provider ───────────────────────────────────────────
class McpFileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly node: ExplorerNode,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(node.label, collapsibleState);
    
    this.resourceUri = node.uri;
    this.tooltip = node.relativePath;
    
    if (node.type === 'file' && node.fileItem) {
      // File item - use native VS Code file icons with checkbox
      this.tooltip = `${node.fileItem.relativePath} • ${formatFileSize(node.fileItem.size)} • ${node.fileItem.selected ? 'Selected' : 'Not selected'}`;
      this.contextValue = "mcpFile";
      
      // Use native VS Code checkbox state
      this.checkboxState = node.fileItem.selected 
        ? vscode.TreeItemCheckboxState.Checked 
        : vscode.TreeItemCheckboxState.Unchecked;
      
      // Command to toggle selection on click
      this.command = {
        command: "mcpIndex.toggleFileSelection",
        title: "Toggle Selection",
        arguments: [this]
      };
    } else if (node.type === 'folder') {
      // Folder item - use native VS Code folder icons with checkbox
      this.tooltip = `Folder: ${node.relativePath}`;
      this.contextValue = "mcpFolder";
      
      // Calculate selection state for folder
      const fileCount = this.countFilesInFolder(node);
      const selectedCount = this.countSelectedFilesInFolder(node);
      
      // Use native VS Code checkbox state for folders
      if (selectedCount === 0) {
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
      } else if (selectedCount === fileCount) {
        this.checkboxState = vscode.TreeItemCheckboxState.Checked;
      } else {
        // Partial selection - VS Code doesn't have a built-in "indeterminate" state for TreeItems
        // We'll use checked state but show file count in description
        this.checkboxState = vscode.TreeItemCheckboxState.Checked;
      }
      
      // Show file count in description
      this.description = `${selectedCount}/${fileCount} files`;
      
      // Use VS Code's native folder icons
      this.iconPath = vscode.ThemeIcon.Folder;
      
      // Command to toggle folder selection on click
      this.command = {
        command: "mcpIndex.toggleFolderSelection",
        title: "Toggle Folder Selection",
        arguments: [this]
      };
    }
  }
  
  private countFilesInFolder(folder: ExplorerNode): number {
    let count = 0;
    if (folder.children) {
      for (const child of folder.children) {
        if (child.type === 'file') {
          count++;
        } else if (child.type === 'folder') {
          count += this.countFilesInFolder(child);
        }
      }
    }
    return count;
  }
  
  private countSelectedFilesInFolder(folder: ExplorerNode): number {
    let count = 0;
    if (folder.children) {
      for (const child of folder.children) {
        if (child.type === 'file' && child.fileItem?.selected) {
          count++;
        } else if (child.type === 'folder') {
          count += this.countSelectedFilesInFolder(child);
        }
      }
    }
    return count;
  }
}

class McpTreeDataProvider implements vscode.TreeDataProvider<McpFileTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<McpFileTreeItem | undefined | null | void> = new vscode.EventEmitter<McpFileTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<McpFileTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private fileItems: FileItem[] = [];
  private rootNodes: ExplorerNode[] = [];

  constructor() {
    this.refreshFiles();
  }

  refresh(): void {
    this.buildFileTree();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: McpFileTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: McpFileTreeItem): Thenable<McpFileTreeItem[]> {
    if (!element) {
      // Root level
      return Promise.resolve(
        this.rootNodes.map(node => new McpFileTreeItem(
          node,
          node.children && node.children.length > 0 
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        ))
      );
    } else if (element.node.children) {
      // Return children
      return Promise.resolve(
        element.node.children.map(node => new McpFileTreeItem(
          node,
          node.children && node.children.length > 0 
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        ))
      );
    }
    return Promise.resolve([]);
  }

  private buildFileTree(): void {
    const rootFolder = vscode.workspace.workspaceFolders?.[0];
    if (!rootFolder) {
      this.rootNodes = [];
      return;
    }

    const folderMap = new Map<string, ExplorerNode>();
    
    const rootNode: ExplorerNode = {
      type: 'folder',
      label: path.basename(rootFolder.uri.fsPath),
      uri: rootFolder.uri,
      relativePath: '', // Root relative path is empty
      children: []
    };
    folderMap.set('', rootNode); // Use empty string for root path key

    for (const fileItem of this.fileItems) {
      const relativePathParts = fileItem.relativePath.split(path.sep);
      
      let currentParent = rootNode;
      let currentPathSegments: string[] = [];
      
      // Create intermediate folders
      for (let i = 0; i < relativePathParts.length - 1; i++) {
        const folderName = relativePathParts[i];
        currentPathSegments.push(folderName);
        const folderPathKey = currentPathSegments.join(path.sep);
        
        if (!folderMap.has(folderPathKey)) {
          const folderNode: ExplorerNode = {
            type: 'folder',
            label: folderName,
            uri: vscode.Uri.joinPath(rootFolder.uri, folderPathKey), // Use Uri.joinPath
            relativePath: folderPathKey,
            children: [],
            parent: currentParent
          };
          
          folderMap.set(folderPathKey, folderNode);
          currentParent.children!.push(folderNode);
        }
        
        currentParent = folderMap.get(folderPathKey)!;
      }
      
      // Add the file
      const fileName = relativePathParts[relativePathParts.length - 1];
      const fileNode: ExplorerNode = {
        type: 'file',
        label: fileName,
        uri: fileItem.uri,
        relativePath: fileItem.relativePath,
        fileItem: fileItem,
        parent: currentParent
      };
      
      currentParent.children!.push(fileNode);
    }

    this.sortNodeChildren(rootNode);
    this.rootNodes = rootNode.children || [];
  }

  private sortNodeChildren(node: ExplorerNode): void {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.label.localeCompare(b.label, undefined, { numeric: true });
      });
      
      node.children.forEach(child => this.sortNodeChildren(child));
    }
  }

  async refreshFiles(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.fileItems = [];
      this.refresh();
      return;
    }

    try {
      const config = vscode.workspace.getConfiguration("string-codebase-indexer");
      const excludePatterns = config.get<string[]>("excludePatterns", []);
      // Construct a single glob string for exclusions
      const excludeGlob = excludePatterns.length > 0 ? `**/{${excludePatterns.join(",")}}/**` : undefined;
      
      // Define supported file extensions pattern
      const supportedExtensions = "{py,ts,js,jsx,tsx,java,go,rs,cpp,c,h,hpp,cs,php,rb}";
      const pattern = new vscode.RelativePattern(folder, `**/*.${supportedExtensions}`);
      
      const uris = await vscode.workspace.findFiles(pattern, excludeGlob);

      const newFileItems: FileItem[] = [];
      for (const uri of uris) {
        try {
          const stat = await fs.stat(uri.fsPath);
          // Skip empty files or directories that might match pattern
          if (stat.isDirectory() || stat.size === 0) continue;

          const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
          const language = getLanguageFromPath(uri.fsPath);

          const existingItem = this.fileItems.find(item => item.uri.fsPath === uri.fsPath);
          const selected = existingItem ? existingItem.selected : true; // Default new files to selected

          newFileItems.push({
            uri,
            relativePath,
            selected,
            language,
            size: stat.size
          });
        } catch (error) {
          console.warn(`Skipping file ${uri.fsPath} due to error:`, error);
          continue;
        }
      }

      this.fileItems = newFileItems;
      this.refresh();
    } catch (error) {
      console.error("Error refreshing files:", error);
      vscode.window.showErrorMessage(`Error refreshing file list: ${error instanceof Error ? error.message : String(error)}`);
      this.fileItems = []; // Clear items on error
      this.refresh();
    }
  }

  toggleFileSelection(item: McpFileTreeItem): void {
    if (item.node.type === 'file' && item.node.fileItem) {
      const fileItem = this.fileItems.find(f => f.uri.fsPath === item.node.fileItem!.uri.fsPath);
      if (fileItem) {
        fileItem.selected = !fileItem.selected;
        this.refresh(); // Refresh the entire tree to update parent folder states
      }
    }
  }

  toggleFolderSelection(item: McpFileTreeItem): void {
    if (item.node.type === 'folder') {
      const totalFiles = this.countFilesInNode(item.node);
      const selectedFiles = this.countSelectedFilesInNode(item.node);
      
      const shouldSelect = selectedFiles < totalFiles; // If not all are selected, select all. Else, deselect all.
      
      this.toggleFolderFiles(item.node, shouldSelect);
      this.refresh();
    }
  }

  selectFolderFiles(item: McpFileTreeItem): void {
    if (item.node.type === 'folder') {
      this.toggleFolderFiles(item.node, true);
      this.refresh();
    }
  }

  deselectFolderFiles(item: McpFileTreeItem): void {
    if (item.node.type === 'folder') {
      this.toggleFolderFiles(item.node, false);
      this.refresh();
    }
  }

  private countFilesInNode(node: ExplorerNode): number {
    let count = 0;
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'file') {
          count++;
        } else if (child.type === 'folder') {
          count += this.countFilesInNode(child);
        }
      }
    }
    return count;
  }

  private countSelectedFilesInNode(node: ExplorerNode): number {
    let count = 0;
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'file' && child.fileItem?.selected) {
          count++;
        } else if (child.type === 'folder') {
          count += this.countSelectedFilesInNode(child);
        }
      }
    }
    return count;
  }

  private toggleFolderFiles(folder: ExplorerNode, select: boolean): void {
    if (folder.children) {
      for (const child of folder.children) {
        if (child.type === 'file' && child.fileItem) {
          // Find the actual item in fileItems array to modify its 'selected' state
          const mainFileItem = this.fileItems.find(fi => fi.uri.fsPath === child.fileItem!.uri.fsPath);
          if (mainFileItem) {
            mainFileItem.selected = select;
          }
        } else if (child.type === 'folder') {
          this.toggleFolderFiles(child, select);
        }
      }
    }
  }

  selectAll(): void {
    this.fileItems.forEach(item => item.selected = true);
    this.refresh();
  }

  deselectAll(): void {
    this.fileItems.forEach(item => item.selected = false);
    this.refresh();
  }

  getSelectedFiles(): FileItem[] {
    return this.fileItems.filter(item => item.selected);
  }

  getFileItems(): FileItem[] {
    return this.fileItems;
  }

  findNodeByUri(uri: vscode.Uri): ExplorerNode | undefined {
    const findInNodes = (nodes: ExplorerNode[]): ExplorerNode | undefined => {
      for (const node of nodes) {
        if (node.uri.fsPath === uri.fsPath) {
          return node;
        }
        if (node.children) {
          const found = findInNodes(node.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return findInNodes(this.rootNodes);
  }
}

// ─── enhanced content chunker with validation ─────────────────────────
interface ChunkValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    lineCount: number;
    characterCount: number;
    hasCode: boolean;
    language: string;
  };
}

interface ChunkInfo {
  content: string;
  index: number;
  metadata: ChunkValidationResult['metadata'];
  hash: string;
}

function validateChunk(content: string, filePath: string, index: number, configuredMaxChunkSize: number): ChunkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const SERVER_ABSOLUTE_MAX_CHUNK_SIZE = 100000; // Example: Absolute server limit, if any (e.g. 100KB)

  if (!content || content.trim().length === 0) {
    errors.push("Chunk content is empty");
  }

  if (content.length > configuredMaxChunkSize) {
     // This should ideally not happen if createChunks respects configuredMaxChunkSize
    errors.push(`Chunk (length ${content.length}) exceeds configured max chunk size (${configuredMaxChunkSize})`);
  }
  if (content.length > SERVER_ABSOLUTE_MAX_CHUNK_SIZE) {
    errors.push(`Chunk (length ${content.length}) exceeds absolute server maximum size limit (${SERVER_ABSOLUTE_MAX_CHUNK_SIZE} chars)`);
  }


  if (content.includes('\uFFFD')) {
    warnings.push("Chunk contains replacement characters (likely encoding issues)");
  }

  const lines = content.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);
  const hasCode = nonEmptyLines.some(line =>
    /^[\s]*[a-zA-Z_$][\w$]*[\s]*[=:({]/.test(line) || 
    /^[\s]*(import|from|class|def|function|const|let|var)[\s]/.test(line)
  );

  const language = getLanguageFromPath(filePath);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      lineCount: lines.length,
      characterCount: content.length,
      hasCode,
      language
    }
  };
}

function generateChunkHash(content: string, filePath: string, index: number): string {
  const crypto = require('crypto'); // Standard for Node.js environment in VS Code extensions
  return crypto.createHash('md5')
    .update(`${filePath}:${index}:${content}`)
    .digest('hex');
}

function* createChunks(text: string, maxChunkSizeChars: number, filePath: string = ''): Generator<ChunkInfo, void, unknown> {
  if (!text || text.length === 0) return;

  const lines = text.split('\n');
  let currentChunk = '';
  let chunkIndex = 0;

  for (const line of lines) {
    const lineWithNewline = line + '\n';

    if (currentChunk.length + lineWithNewline.length > maxChunkSizeChars) {
      if (currentChunk.length > 0) {
        const content = currentChunk.trimEnd(); // Remove trailing newline if it's the last thing
        const validation = validateChunk(content, filePath, chunkIndex, maxChunkSizeChars);
        yield {
          content,
          index: chunkIndex++,
          metadata: validation.metadata,
          hash: generateChunkHash(content, filePath, chunkIndex - 1)
        };
        currentChunk = '';
      }

      if (lineWithNewline.length > maxChunkSizeChars) {
        for (let i = 0; i < lineWithNewline.length; i += maxChunkSizeChars) {
          const content = lineWithNewline.slice(i, i + maxChunkSizeChars);
          const validation = validateChunk(content, filePath, chunkIndex, maxChunkSizeChars);
          yield {
            content,
            index: chunkIndex++,
            metadata: validation.metadata,
            hash: generateChunkHash(content, filePath, chunkIndex - 1)
          };
        }
      } else {
        currentChunk = lineWithNewline;
      }
    } else {
      currentChunk += lineWithNewline;
    }
  }

  if (currentChunk.length > 0) {
    const content = currentChunk.trimEnd();
    const validation = validateChunk(content, filePath, chunkIndex, maxChunkSizeChars);
    yield {
      content,
      index: chunkIndex,
      metadata: validation.metadata,
      hash: generateChunkHash(content, filePath, chunkIndex)
    };
  }
}

// Helper function (not directly used in main indexing flow but can be useful)
function chunk(text: string, max: number = 1000, filePath: string = ''): ChunkInfo[] {
  return Array.from(createChunks(text, max, filePath));
}

// ─── global state ──────────────────────────────────────────────────────
let indexingState: IndexingState = {
  autoIndexEnabled: false,
  isIndexing: false,
  lastIndexed: null,
  totalFiles: 0,
  indexedFiles: 0
};

let statusBarItem: vscode.StatusBarItem;
let treeDataProvider: McpTreeDataProvider;
let treeView: vscode.TreeView<McpFileTreeItem>;
let dashboardViewProvider: DashboardWebviewViewProvider;

let globalCancellationController: AbortController | null = null;
let activeIndexingPromises: Set<Promise<any>> = new Set();

// ─── status dashboard types ────────────────────────────────────────────
interface DashboardStats {
  totalFiles: number;
  processedFiles: number;
  totalChunks: number;
  totalTokens: number;
  averageProcessingTime: number;
  activeJobs: number;
  vectorStoreReady: boolean;
  lastUpdate: string;
  processingErrors: number;
  webhookStatus: 'connected' | 'disconnected' | 'error';
  collections: string[];
}

interface JobMetrics {
  jobId: string;
  fileName: string;
  chunksProcessed: number;
  tokensGenerated: number;
  processingTimeMs: number;
  status: 'processing' | 'completed' | 'failed';
  startTime: number;
}

// ─── global dashboard state ────────────────────────────────────────────
let dashboardStats: DashboardStats = {
  totalFiles: 0,
  processedFiles: 0,
  totalChunks: 0,
  totalTokens: 0,
  averageProcessingTime: 0,
  activeJobs: 0,
  vectorStoreReady: false,
  lastUpdate: new Date().toISOString(),
  processingErrors: 0,
  webhookStatus: 'disconnected',
  collections: []
};
let activeJobMetrics: Map<string, JobMetrics> = new Map();

// ─── webhook server integration ───────────────────────────────────────
let webhookServer: any = null;
let webhookApp: any = null;

// Generate consistent user ID for the session
let sessionUserId: string = '';

function getOrCreateUserId(): string {
  if (!sessionUserId) {
    const workspaceName = vscode.workspace.name || 'default';
    const random = Math.random().toString(36).substr(2, 8);
    sessionUserId = `vscode_${workspaceName}_${random}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }
  return sessionUserId;
}

/**
 * Webhook Server Setup
 * 
 * Starts an Express.js server to receive job completion notifications from the backend.
 * This enables real-time UI updates when file processing is complete.
 * 
 * Configuration:
 * - Port: string-codebase-indexer.webhookPort (default: 3000)
 * - Enable/Disable: string-codebase-indexer.enableWebhooks
 * 
 * For developers: Customize webhook endpoints or add authentication here
 */
async function startWebhookServer() {
  const config = vscode.workspace.getConfiguration("string-codebase-indexer");
  const webhookEnabled = config.get<boolean>("enableWebhooks", true);
  const webhookPort = config.get<number>("webhookPort", 3000);

  if (!webhookEnabled) {
    updateDashboardStats({ webhookStatus: 'disconnected' });
    return;
  }

  try {
    // Dynamically import express
    const express = require('express');
    webhookApp = express();
    
    webhookApp.use(express.json());
    
    // Health check endpoint
    webhookApp.get('/health', (req: any, res: any) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // Job completion webhook endpoint - following backend documentation format
    webhookApp.post('/webhook/job-complete', (req: any, res: any) => {
      try {
        const jobData = req.body;
        console.log('🎣 Webhook received:', JSON.stringify(jobData, null, 2));
        
        // Validate payload structure according to backend docs
        if (!jobData.job_id || !jobData.status) {
          console.warn('Invalid webhook payload - missing required fields');
          return res.status(200).json({ 
            received: true, 
            error: 'Invalid payload structure',
            timestamp: new Date().toISOString() 
          });
        }
        
        console.log(`[WEBHOOK] Job ${jobData.job_id} ${jobData.status}`);
        
        if (jobData.success && jobData.result_data) {
          // Handle successful job completion according to backend docs
          const { result_data, metrics } = jobData;
          
          console.log(`Processed ${result_data.chunks_processed || 0} chunks in ${metrics?.processing_time_ms || 0}ms`);
          
          // Update vector store status if vector storage info is available
          if (result_data.vector_storage) {
            const vectorStorage = result_data.vector_storage;
            
            updateDashboardStats({
              vectorStoreReady: vectorStorage.storage_success || false,
              collections: vectorStorage.collection_name ? 
                Array.from(new Set([...dashboardStats.collections, vectorStorage.collection_name])) : 
                dashboardStats.collections
            });
            
            // Show success notification with detailed info
            vscode.window.showInformationMessage(
              `✅ Processing complete! ${result_data.chunks_processed || 0} chunks stored in collection: ${vectorStorage.collection_name}`
            );
          }
          
          // Find and complete the corresponding job using multiple job ID sources
          const jobId = jobData.job_id || jobData.metadata?.job_id;
          if (jobId && activeJobMetrics.has(jobId)) {
            const chunksProcessed = result_data.chunks_processed || 0;
            const estimatedTokens = Math.round((result_data.file_metadata?.character_count || 0) / 4);
            
            completeJob(jobId, true, chunksProcessed, estimatedTokens);
          }
          
        } else {
          // Handle job failure according to backend docs
          console.error(`Job failed: ${jobData.error_message || 'Unknown error'}`);
          
          updateDashboardStats({ processingErrors: dashboardStats.processingErrors + 1 });
          
          vscode.window.showErrorMessage(
            `❌ Processing failed: ${jobData.error_message || 'Unknown error'}`
          );
          
          // Complete the failed job
          const jobId = jobData.job_id || jobData.metadata?.job_id;
          if (jobId && activeJobMetrics.has(jobId)) {
            completeJob(jobId, false, 0, 0);
          }
        }
        
        // Always respond with 200 to acknowledge receipt (per backend docs)
        res.status(200).json({ 
          received: true, 
          timestamp: new Date().toISOString(),
          processed_job_id: jobData.job_id 
        });
        
      } catch (error) {
        console.error('Webhook processing error:', error);
        // Always return 200 even for processing errors (per backend docs)
        res.status(200).json({ 
          received: true, 
          error: 'Internal processing error',
          timestamp: new Date().toISOString() 
        });
      }
    });
    
    webhookServer = webhookApp.listen(webhookPort, 'localhost', () => {
      console.log(`🎣 Webhook server started on http://localhost:${webhookPort}`);
      updateDashboardStats({ webhookStatus: 'connected' });
      
      vscode.window.showInformationMessage(
        `🎣 Webhook server ready on port ${webhookPort} for real-time notifications`
      );
    });
    
    webhookServer.on('error', (error: any) => {
      console.error('Webhook server error:', error);
      updateDashboardStats({ webhookStatus: 'error' });
      
      if (error.code === 'EADDRINUSE') {
        vscode.window.showWarningMessage(
          `Port ${webhookPort} is already in use. Webhook notifications disabled. You can change the port in settings.`
        );
      } else {
        vscode.window.showWarningMessage(
          `Webhook server failed to start: ${error.message}. Real-time notifications disabled.`
        );
      }
    });
    
  } catch (error) {
    console.error('Failed to start webhook server:', error);
    updateDashboardStats({ webhookStatus: 'error' });
    vscode.window.showWarningMessage(
      `Could not start webhook server: ${error instanceof Error ? error.message : String(error)}. Install express with 'npm install express' if missing.`
    );
  }
}

function stopWebhookServer() {
  if (webhookServer) {
    webhookServer.close(() => {
      console.log('🎣 Webhook server stopped');
      updateDashboardStats({ webhookStatus: 'disconnected' });
    });
    webhookServer = null;
    webhookApp = null;
  }
}

// ─── extension entry point ─────────────────────────────────────────────
export async function activate(context: vscode.ExtensionContext) {
  treeDataProvider = new McpTreeDataProvider();
  treeView = vscode.window.createTreeView("mcpCodebaseIndexer", {
    treeDataProvider: treeDataProvider,
    showCollapseAll: true, // Changed to true for better usability
    canSelectMany: false // Keep false if single item operations are primary
  });
  context.subscriptions.push(treeView);

  // Register the dashboard webview view provider
  dashboardViewProvider = new DashboardWebviewViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardWebviewViewProvider.viewType, dashboardViewProvider)
  );

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const commands = [
    vscode.commands.registerCommand("mcpIndex.run", () => scanAndSelectFiles()), // Changed to use full scan
    vscode.commands.registerCommand("mcpIndex.toggleAuto", () => toggleAutoIndex()),
    vscode.commands.registerCommand("mcpIndex.showMenu", () => showIndexingMenu()),

    vscode.commands.registerCommand("mcpIndex.refreshTree", () => treeDataProvider.refreshFiles()),
    vscode.commands.registerCommand("mcpIndex.selectAll", () => treeDataProvider.selectAll()),
    vscode.commands.registerCommand("mcpIndex.deselectAll", () => treeDataProvider.deselectAll()),
    vscode.commands.registerCommand("mcpIndex.toggleFileSelection", (item: McpFileTreeItem) => treeDataProvider.toggleFileSelection(item)),
    vscode.commands.registerCommand("mcpIndex.indexSelectedFiles", () => indexSelectedFilesFromTree()),
    vscode.commands.registerCommand("mcpIndex.toggleFolderSelection", (item: McpFileTreeItem) => treeDataProvider.toggleFolderSelection(item)),
    vscode.commands.registerCommand("mcpIndex.selectFolder", (item: McpFileTreeItem) => treeDataProvider.selectFolderFiles(item)),
    vscode.commands.registerCommand("mcpIndex.deselectFolder", (item: McpFileTreeItem) => treeDataProvider.deselectFolderFiles(item)),
    vscode.commands.registerCommand("mcpIndex.openFile", (item: McpFileTreeItem) => {
      if (item.node.type === 'file' && item.node.fileItem) {
        vscode.window.showTextDocument(item.node.fileItem.uri);
      }
    }),
    vscode.commands.registerCommand("mcpIndex.stopIndexing", () => stopIndexingOperation()),
    vscode.commands.registerCommand("mcpIndex.indexSelected", (files: FileItem[]) => indexSelectedFiles(files)), // This command seems for internal use or programmatic calls
    vscode.commands.registerCommand("mcpIndex.openStatusDashboard", () => createStatusDashboard()),
    vscode.commands.registerCommand("mcpIndex.showBothViews", () => ensureBothViewsVisible())
  ];

  commands.forEach(cmd => context.subscriptions.push(cmd));

  // Start webhook server for real-time notifications
  await startWebhookServer();

  // Ensure both views are visible when extension activates
  await ensureBothViewsVisible();

  const config = vscode.workspace.getConfiguration("string-codebase-indexer");
  const autoIndexOnStartup = config.get<boolean>("autoIndexOnStartup", false); // Default to false if not specified
  if (autoIndexOnStartup) { // Removed && indexingState.autoIndexEnabled for more direct startup behavior
    setTimeout(() => scanAndSelectFiles(), 2000); 
  }

  // Watch for file changes - ensure watcher pattern matches scan/refresh patterns
  const supportedExtensionsWatcher = "{py,ts,js,jsx,tsx,java,go,rs,cpp,c,h,hpp,cs,php,rb}";
  const watcher = vscode.workspace.createFileSystemWatcher(`**/*.${supportedExtensionsWatcher}`);
  
  const debouncedRefresh = debounce(() => treeDataProvider.refreshFiles(), 1000);
  const debouncedAutoIndexTrigger = debounce(() => {
      if (indexingState.autoIndexEnabled && !indexingState.isIndexing) {
        vscode.window.showInformationMessage("File changes detected. Re-scanning for auto-indexing.");
        scanAndSelectFiles(); // Or a more targeted update if possible
      }
  }, 3000);


  watcher.onDidChange(() => {
    debouncedRefresh();
    debouncedAutoIndexTrigger();
  });
  watcher.onDidCreate(() => debouncedRefresh());
  watcher.onDidDelete(() => debouncedRefresh());
  context.subscriptions.push(watcher);
}

// ─── ensure both views are visible ─────────────────────────────────────
async function ensureBothViewsVisible() {
  const config = vscode.workspace.getConfiguration("string-codebase-indexer");
  const showBothViews = config.get<boolean>("showBothViewsOnStartup", true);
  
  if (!showBothViews) {
    console.log("Auto-showing both views is disabled in settings");
    return;
  }

  // Small delay to ensure VS Code is fully loaded
  setTimeout(async () => {
    try {
      // 1. Focus on our dedicated MCP activity bar container
      await vscode.commands.executeCommand('workbench.view.extension.mcpCodebaseIndexerContainer');
      
      // Small delay to let the container open
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 2. Focus on the file selector view to make it visible
      await vscode.commands.executeCommand('mcpCodebaseIndexer.focus');
      
      // Small delay between view focuses
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 3. Focus on the dashboard view to make it visible
      await vscode.commands.executeCommand('mcpStatusDashboardView.focus');
      
      // 4. Optional: Return focus to file selector for better UX
      setTimeout(() => {
        vscode.commands.executeCommand('mcpCodebaseIndexer.focus');
      }, 200);
      
      console.log("✅ Both String views are now visible in the dedicated String sidebar");
    } catch (error) {
      console.warn("Could not ensure both views are visible:", error);
      // Fallback: show a helpful message to the user
              vscode.window.showInformationMessage(
          "💡 To see both String views, click the database icon in the Activity Bar to open the String Codebase Indexer panel."
        );
    }
  }, 1500); // 1.5-second delay to allow VS Code to fully initialize
}

// ─── status bar management ─────────────────────────────────────────────
function updateStatusBar() {
  const autoIcon = indexingState.autoIndexEnabled ? "$(sync)" : "$(sync-ignored)";
  
  let text: string;
  let tooltip: string;
  let commandId: string | undefined; // Can be undefined if no command

  if (indexingState.isIndexing) {
    text = `$(loading~spin) String Indexing (${indexingState.indexedFiles}/${indexingState.totalFiles}) $(stop)`;
    tooltip = "String is currently indexing files. Click to stop indexing.";
    commandId = "mcpIndex.stopIndexing";
  } else {
    const indexingIcon = "$(database)";
    text = `${autoIcon} ${indexingIcon} String`;
    
    if (indexingState.lastIndexed) {
      const timeAgo = Math.round((Date.now() - indexingState.lastIndexed.getTime()) / 60000);
      text += ` (${timeAgo}m ago)`;
    }
    
    tooltip = `${indexingState.autoIndexEnabled ? "String Auto-indexing enabled" : "String Auto-indexing disabled"}. Click for options.`;
    commandId = "mcpIndex.showMenu";
  }

  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;
  statusBarItem.command = commandId;
}

// ─── debounced utility ───────────────────────────────────────────
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: NodeJS.Timeout | undefined;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise(resolve => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
}

// ─── main menu ─────────────────────────────────────────────────────────
async function showIndexingMenu() {
  const selectedCount = treeDataProvider.getSelectedFiles().length;
  const totalFileItems = treeDataProvider.getFileItems().length; // Use FileItems for total count
  
  const items: vscode.QuickPickItem[] = [
    {
      label: "$(file-directory) Scan and Select Files",
      description: "Choose specific files to index from the workspace",
      detail: "This will re-scan your workspace and show a file selection dialog."
    },
    {
      label: "$(list-tree) Focus on File Selector",
      description: `View files in dedicated String sidebar (${selectedCount}/${totalFileItems} selected)`,
      detail: "Opens the String Codebase Indexer panel and focuses the file selector view."
    },
    {
      label: "$(dashboard) Status Dashboard",
      description: "Real-time indexing progress and vector store status",
      detail: "Opens a detailed dashboard showing tokens, chunks, and processing metrics."
    },
    {
      label: "$(split-horizontal) Show Both Views",
      description: "Ensure both file selector and dashboard views are visible",
      detail: "Opens the String sidebar and focuses both views for optimal workflow."
    },
    {
      label: indexingState.autoIndexEnabled ? "$(sync-ignored) Disable Auto-indexing" : "$(sync) Enable Auto-indexing",
      description: indexingState.autoIndexEnabled ? "Turn off automatic indexing on file changes" : "Turn on automatic indexing on file changes",
    },
    {
      label: "$(gear) Settings",
      description: "Configure String server URL, API key, and other options",
      detail: "Opens the VS Code settings page for this extension."
    },
    {
      label: "$(info) Status",
      description: "Show current indexing status and statistics",
    }
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "String Codebase Indexer Options"
  });

  if (!selected) return;

  if (selected.label.includes("Scan and Select Files")) {
    await scanAndSelectFiles();
  } else if (selected.label.includes("Focus on File Selector")) {
    vscode.commands.executeCommand('workbench.view.extension.mcpCodebaseIndexerContainer'); // Open our dedicated container
    if (treeView) { // Check if treeView is initialized
        const children = await treeDataProvider.getChildren();
        const firstNode = children.length > 0 ? children[0] : undefined;
        if (firstNode) {
            treeView.reveal(firstNode, { select: false, focus: true, expand: true });
        } else {
             // If no items, just focus the view container. VS Code handles this.
            vscode.commands.executeCommand('mcpCodebaseIndexer.focus');
        }
    } else {
        vscode.commands.executeCommand('mcpCodebaseIndexer.focus');
    }
  } else if (selected.label.includes("Status Dashboard")) {
    createStatusDashboard();
  } else if (selected.label.includes("Show Both Views")) {
    await ensureBothViewsVisible();
  } else if (selected.label.includes("Auto-indexing")) {
    toggleAutoIndex();
  } else if (selected.label.includes("Settings")) {
    vscode.commands.executeCommand("workbench.action.openSettings", "string-codebase-indexer");
  } else if (selected.label.includes("Status")) {
    showStatusInfo();
  }
}

// ─── file scanning and selection ───────────────────────────────────────
async function scanAndSelectFiles() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage("No workspace folder open to scan for files.");
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "String: Scanning workspace...", cancellable: false },
    async (progress) => {
      progress.report({ message: "Finding code files..." });

      const config = vscode.workspace.getConfiguration("string-codebase-indexer");
      const excludePatterns = config.get<string[]>("excludePatterns", []);
      const excludeGlob = excludePatterns.length > 0 ? `**/{${excludePatterns.join(",")}}/**` : undefined;
      
      const supportedExtensions = "{py,ts,js,jsx,tsx,java,go,rs,cpp,c,h,hpp,cs,php,rb}";
      const pattern = new vscode.RelativePattern(folder, `**/*.${supportedExtensions}`);
      
      const uris = await vscode.workspace.findFiles(pattern, excludeGlob);

      progress.report({ message: "Analyzing file properties..." });

      const fileItems: FileItem[] = [];
      for (const uri of uris) {
        try {
          const stat = await fs.stat(uri.fsPath);
          if (stat.isDirectory() || stat.size === 0) continue;

          const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
          const language = getLanguageFromPath(uri.fsPath);

          fileItems.push({
            uri,
            relativePath,
            selected: true, // Default to selected
            language,
            size: stat.size
          });
        } catch (error) {
          console.warn(`Skipping file ${uri.fsPath} during scan:`, error);
          continue;
        }
      }

      if (fileItems.length === 0) {
        vscode.window.showInformationMessage("No supported code files found in the current workspace matching criteria.");
        return;
      }

      // Update tree data provider with newly scanned files before showing dialog
      // This is not strictly necessary if showFileSelectionDialog directly leads to indexing,
      // but good if the dialog is cancelled and user expects tree to be updated.
      // For now, let's assume showFileSelectionDialog will lead to indexing or cancellation.
      // treeDataProvider.setFileItems(fileItems); // Potentially add a method like this if needed

      await showFileSelectionDialog(fileItems);
    }
  );
}

async function showFileSelectionDialog(preScannedFiles: FileItem[]) { // Always expect preScannedFiles
  if (!preScannedFiles || preScannedFiles.length === 0) {
    vscode.window.showInformationMessage("No files available to select for indexing.");
    return;
  }
  
  const quickPickItems = preScannedFiles.map(file => ({
    label: `$(file-code) ${file.relativePath}`,
    description: `${file.language}${file.size > 0 ? ` • ${formatFileSize(file.size)}` : ''}`,
    detail: file.uri.fsPath, // Using fsPath for detail might be long, but unique
    picked: file.selected, // Reflect current selection state (defaults to true from scan)
    fileItem: file
  }));

  const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
    placeHolder: `Select files to index (${preScannedFiles.length} files found). Uncheck to exclude.`,
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selectedItems || selectedItems.length === 0) {
    vscode.window.showInformationMessage("No files selected for indexing.");
    return;
  }

  const filesToIndex = selectedItems.map(item => item.fileItem);
  await indexSelectedFiles(filesToIndex);
}

// ─── utility functions ─────────────────────────────────────────────────
function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: { [key: string]: string } = {
    '.py': 'Python', '.ts': 'TypeScript', '.tsx': 'TypeScript React', '.js': 'JavaScript',
    '.jsx': 'JavaScript React', '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
    '.cpp': 'C++', '.c': 'C', '.h': 'C/C++ Header', '.hpp': 'C++ Header',
    '.cs': 'C#', '.php': 'PHP', '.rb': 'Ruby'
    // Add more as needed
  };
  return languageMap[ext] || path.extname(filePath).substring(1).toUpperCase() || 'Unknown';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function toggleAutoIndex() {
  indexingState.autoIndexEnabled = !indexingState.autoIndexEnabled;
  updateStatusBar();
  const message = indexingState.autoIndexEnabled
    ? "String Auto-indexing on file changes enabled."
    : "String Auto-indexing on file changes disabled.";
  vscode.window.showInformationMessage(message);
}

function showStatusInfo() {
  const info = [
    `Auto-indexing on file changes: ${indexingState.autoIndexEnabled ? 'Enabled' : 'Disabled'}`,
    `Currently indexing: ${indexingState.isIndexing ? 'Yes' : 'No'}`,
    `Last indexed: ${indexingState.lastIndexed ? indexingState.lastIndexed.toLocaleString() : 'Never'}`,
    indexingState.isIndexing || indexingState.totalFiles > 0 ? `Files processed in last/current run: ${indexingState.indexedFiles}/${indexingState.totalFiles}` : `No active or recent indexing run.`
  ].join('\n');

  vscode.window.showInformationMessage(info, { modal: true });
}

// ─── robust stop operation ─────────────────────────────────────────────
async function stopIndexingOperation(): Promise<void> {
  if (!indexingState.isIndexing) {
    vscode.window.showInformationMessage("No indexing operation is currently in progress.");
    return;
  }

  console.log("🛑 User requested to stop indexing operation.");
  vscode.window.showInformationMessage("Attempting to stop indexing...");

  if (globalCancellationController) {
    globalCancellationController.abort();
  }

  if (activeIndexingPromises.size > 0) {
    console.log(`⏳ Waiting for ${activeIndexingPromises.size} active indexing operations to stop...`);
    try {
      await Promise.race([
        Promise.allSettled(Array.from(activeIndexingPromises)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Stop operation timed out after 5s")), 5000))
      ]);
    } catch (error) {
      console.warn("⚠️ Some indexing operations may not have stopped gracefully:", error);
    }
  }

  cleanupIndexingState(); // This will set isIndexing to false and update UI
  vscode.window.showInformationMessage("✅ Indexing operation has been stopped.");
}

function cleanupIndexingState(): void {
  indexingState.isIndexing = false;
  // Do not reset totalFiles/indexedFiles here if you want to show stats of the last run
  // Reset them when a new indexing operation starts.
  globalCancellationController = null; // Allow new controller for next run
  activeIndexingPromises.clear();
  updateStatusBar();
  console.log("🧹 Indexing state has been cleaned up.");
}

// ─── optimized indexing functions ──────────────────────────────────────
async function indexSelectedFiles(files: FileItem[]) {
  if (indexingState.isIndexing) {
    vscode.window.showWarningMessage("Indexing is already in progress.");
    return;
  }
  if (files.length === 0) {
    vscode.window.showWarningMessage("No files selected for indexing.");
    return;
  }

  // Update dashboard with total files
  updateDashboardStats({ 
    totalFiles: files.length, 
    processedFiles: 0,
    activeJobs: 0
  });

  const cfg = vscode.workspace.getConfiguration("string-codebase-indexer");
  const url = cfg.get<string>("url")?.replace(/\/$/, ""); // Ensure no trailing slash
  const apiKey = cfg.get<string>("apiKey") || "";
  const maxChunkSize = cfg.get<number>("maxChunkSize", 1000);

  if (!url) {
    vscode.window.showErrorMessage("Server URL is not configured. Please check extension settings.");
    return;
  }

  try {
    const fetch = (await import("node-fetch")).default;
    const healthCheckController = new AbortController();
    const healthTimeoutId = setTimeout(() => healthCheckController.abort(), 5000); // 5s timeout for health check
    
    const response = await fetch(`${url}/health`, { 
      method: "GET",
      signal: healthCheckController.signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    });
    clearTimeout(healthTimeoutId);
    
    if (!response.ok) {
      throw new Error(`Server health check failed: ${response.status} ${response.statusText}`);
    }
    console.log("String Server health check successful.");
  } catch (error) {
    console.error("String Server health check failed:", error);
    vscode.window.showErrorMessage(`Cannot connect to server at ${url}. Error: ${error instanceof Error ? error.message : String(error)}. Please check configuration and server status.`);
    return;
  }

  globalCancellationController = new AbortController(); // New controller for this run
  
  indexingState.isIndexing = true;
  indexingState.totalFiles = files.length;
  indexingState.indexedFiles = 0; // Reset for this run
  updateStatusBar();

  let successCount = 0;
  let errorCount = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "String: Indexing files...",
      cancellable: true // User can click the notification to cancel
    },
    async (progress, token) => {
      // Link VS Code's cancellation token with our global AbortController
      token.onCancellationRequested(() => {
        console.log("🛑 Indexing cancelled via notification.");
        globalCancellationController?.abort();
      });

      const BATCH_SIZE = Math.max(1, Math.min(cfg.get<number>("batchSize", 3), 10)); // Ensure 1-10
      
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        if (globalCancellationController?.signal.aborted) break;

        const batch = files.slice(i, Math.min(i + BATCH_SIZE, files.length));
        
        // Create job tracking for each file in the batch
        const batchPromises = batch.map(async (file) => {
          const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          addJobMetrics(jobId, file.relativePath);
          
          try {
            const stats = await indexFileOptimized(file.uri, url, apiKey, maxChunkSize, globalCancellationController!.signal, jobId);
            
            // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
            const estimatedTokens = Math.round(stats.totalBytes / 4);
            
            // Complete the job successfully
            completeJob(jobId, true, stats.successfulChunks, estimatedTokens);
            
            successCount++;
            indexingState.indexedFiles++; // Track files indexed
            
            // Update progress
            const progressPercent = Math.round((indexingState.indexedFiles / indexingState.totalFiles) * 100);
            progress.report({ 
              message: `✓ ${path.basename(file.relativePath)} (${stats.successfulChunks} chunks, ~${estimatedTokens.toLocaleString()} tokens)`,
              increment: 100 / indexingState.totalFiles 
            });
            
            updateStatusBar();
            return stats;
          } catch (error) {
            completeJob(jobId, false);
            errorCount++;
            
            console.error(`Error indexing file ${file.relativePath}:`, error);
            progress.report({ 
              message: `✗ Error processing ${path.basename(file.relativePath)}: ${error instanceof Error ? error.message : String(error)}` 
            });
            
            indexingState.indexedFiles++; // Still count as "processed" even if failed
            updateStatusBar();
            return null;
          }
        });

        activeIndexingPromises.add(Promise.all(batchPromises));
        
        try {
          await Promise.all(batchPromises);
        } catch (error) {
          // Errors are already handled individually above
        }
      }

      const wasCancelled = globalCancellationController?.signal.aborted;
      if (!wasCancelled) {
        indexingState.lastIndexed = new Date();
        const message = errorCount > 0 
          ? `String indexing complete. ✓ ${successCount} files fully/partially indexed, ✗ ${errorCount} files had errors.`
          : `String indexing complete! ✓ All ${successCount} selected files processed successfully.`;
        vscode.window.showInformationMessage(message);
      } else {
        vscode.window.showInformationMessage(`String indexing was cancelled. ${successCount} files may have been processed before cancellation.`);
      }

      cleanupIndexingState();
    }
  );
}

// ─── enhanced chunk transmission with robust error handling ───────────
interface ChunkTransmissionResult {
  success: boolean;
  chunkId?: string;
  processingTimeMs: number;
  error?: string;
  retryCount: number;
}

interface FileIndexingStats {
  totalChunks: number;
  successfulChunks: number;
  failedChunks: number;
  totalBytes: number;
  processingTimeMs: number;
  errors: string[];
}

async function sendChunkWithRetry(
  chunkInfo: ChunkInfo,
  filePathRelative: string, // Use relative path for payload
  url: string,
  headers: Record<string, string>,
  abortSignal: AbortSignal,
  jobId: string // Add jobId parameter for tracking
): Promise<ChunkTransmissionResult> {
  const maxRetries = 3;
  let retryCount = 0;
  const endpoint = `${url}/index/chunk`;

  // Get webhook configuration
  const config = vscode.workspace.getConfiguration("string-codebase-indexer");
  const webhookEnabled = config.get<boolean>("enableWebhooks", true);
  const webhookPort = config.get<number>("webhookPort", 3000);
  
  // Construct payload following backend documentation format
  const payload = {
    job_type: "file_processing",
    user_id: getOrCreateUserId(),
    metadata: {
      file_path: filePathRelative,
      chunk_index: chunkInfo.index,
      content_length: chunkInfo.content.length,
      hash: chunkInfo.hash,
      timestamp: new Date().toISOString(),
      source: "vscode-extension",
      extension_version: "0.0.4",
      workspace_id: vscode.workspace.name || 'default',
      job_id: jobId, // Include job ID for correlation
      ...(webhookEnabled ? { 
        webhook_url: `http://localhost:${webhookPort}/webhook/job-complete`
      } : {})
    },
    // Include chunk content and metadata in the format expected by the backend
    content: chunkInfo.content,
    chunk_metadata: {
      ...chunkInfo.metadata,
      index: chunkInfo.index,
      hash: chunkInfo.hash
    }
  };

  while (retryCount <= maxRetries) { // Allow initial attempt + maxRetries
    if (abortSignal.aborted) {
      // console.debug(`sendChunkWithRetry: Abort signal received for chunk ${chunkInfo.index} of ${filePathRelative}`);
      throw new Error("Indexing operation cancelled by user."); // AbortError is often used
    }

    const attemptStartTime = Date.now();
    try {
      const fetch = (await import("node-fetch")).default;
      const requestController = new AbortController(); // Per-request AbortController
      const requestTimeoutId = setTimeout(() => requestController.abort(), 30000); // 30s timeout per chunk request

      // Combine signals: if global abort or request timeout, then abort
      const combinedSignal = anySignal(abortSignal, requestController.signal);

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: combinedSignal,
      });

      clearTimeout(requestTimeoutId);
      const processingTimeMs = Date.now() - attemptStartTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Failed to read error response');
        // console.warn(`Chunk ${chunkInfo.index} of ${filePathRelative} - Server error ${response.status}: ${errorText}`);
        // Retry on 5xx errors, fail immediately on 4xx (unless specific 4xx are retryable)
        if (response.status >= 500 && retryCount < maxRetries) {
            throw new Error(`Server error ${response.status}: ${errorText} (will retry)`);
        }
        return { success: false, error: `Server error ${response.status}: ${errorText}`, retryCount, processingTimeMs };
      }

      let responseData: any = {};
      try { 
        responseData = await response.json(); 
        // Extract job_id from response if available - server may assign different ID
        if (responseData.job_id && responseData.job_id !== jobId) {
          console.log(`Server assigned job ID: ${responseData.job_id} for our job: ${jobId}`);
        }
      } catch (e) { /* Non-JSON response is ok */ }
      
      return { success: true, chunkId: responseData.chunk_id || responseData.job_id, retryCount, processingTimeMs };

    } catch (error: any) {
      const processingTimeMs = Date.now() - attemptStartTime;
      // console.debug(`sendChunkWithRetry: Attempt ${retryCount} for chunk ${chunkInfo.index} of ${filePathRelative} failed: ${error.message}`);
      if (abortSignal.aborted || error.name === 'AbortError') { // Check if it was an abort
        // console.log(`sendChunkWithRetry: Aborted during attempt ${retryCount} for chunk ${chunkInfo.index} of ${filePathRelative}`);
        throw error; // Re-throw AbortError to be caught by caller
      }

      retryCount++;
      if (retryCount > maxRetries) {
        // console.error(`Chunk ${chunkInfo.index} of ${filePathRelative} - Failed after ${maxRetries} retries: ${error.message}`);
        return { success: false, error: `Failed after ${maxRetries} retries: ${error.message}`, retryCount, processingTimeMs };
      }
      
      const delay = Math.pow(2, retryCount -1) * 1000 + Math.random() * 500; // Exponential backoff with jitter
      // console.log(`Chunk ${chunkInfo.index} of ${filePathRelative} - Retrying attempt ${retryCount}/${maxRetries} in ${delay.toFixed(0)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // Should not be reached if logic is correct
  return { success: false, error: "Max retries exceeded (unexpected path)", retryCount, processingTimeMs: 0 };
}

// Helper to combine AbortSignals
function anySignal(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort(signal.reason); // Propagate reason if available
            return controller.signal;
        }
        signal.addEventListener('abort', () => controller.abort(signal.reason), { signal: controller.signal });
    }
    return controller.signal;
}


async function indexFileOptimized(
  uri: vscode.Uri,
  url: string,
  apiKey: string,
  maxChunkSizeChars: number,
  abortSignal: AbortSignal, // Use this signal
  jobId: string
): Promise<FileIndexingStats> {
  const startTime = Date.now();
  const stats: FileIndexingStats = {
    totalChunks: 0, successfulChunks: 0, failedChunks: 0,
    totalBytes: 0, processingTimeMs: 0, errors: []
  };

  let fileContent: string;
  try {
    const fileBuffer = await fs.readFile(uri.fsPath);
    fileContent = fileBuffer.toString("utf8"); // Assume UTF-8
    stats.totalBytes = fileBuffer.length;
  } catch (error: any) {
    stats.errors.push(`File read error: ${error.message}`);
    stats.processingTimeMs = Date.now() - startTime;
    // console.error(`Cannot read file ${uri.fsPath}:`, error);
    // Re-throw if critical, or handle as a file-level failure
    throw new Error(`Cannot read file ${uri.fsPath}: ${error.message}`);
  }

  if (!fileContent.trim()) {
    // console.log(`Skipping empty file: ${uri.fsPath}`);
    stats.processingTimeMs = Date.now() - startTime;
    return stats; // No chunks to process
  }

  const headers = {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  // Get relative path for payload
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath) : path.basename(uri.fsPath);

  const chunks = Array.from(createChunks(fileContent, maxChunkSizeChars, uri.fsPath)); // uri.fsPath for validation context
  stats.totalChunks = chunks.length;

  if (stats.totalChunks === 0 && stats.totalBytes > 0) {
      // console.warn(`File ${relativePath} has content but generated 0 chunks.`);
      // This might indicate an issue with chunking logic for certain small files.
  }

  // Initialize job metrics with estimated tokens
  const estimatedTokens = Math.round(stats.totalBytes / 4);
  updateJobMetrics(jobId, {
    chunksProcessed: 0,
    tokensGenerated: estimatedTokens
  });


  const config = vscode.workspace.getConfiguration("string-codebase-indexer");
  const concurrencyLimit = config.get<number>("batchSize", 3) > 3 ? 2 : 1; // Limit concurrent chunk requests per file, related to overall batchSize
  
  for (let i = 0; i < chunks.length; i += concurrencyLimit) {
    if (abortSignal.aborted) {
      // console.debug(`indexFileOptimized: Abort signal received before processing chunk batch for ${relativePath}`);
      stats.errors.push("Operation cancelled");
      break; 
    }

    const chunkBatch = chunks.slice(i, Math.min(i + concurrencyLimit, chunks.length));
    const batchPromises = chunkBatch.map(async (chunkInfo) => {
      if (abortSignal.aborted) return; // Check before each chunk send

      try {
        const result = await sendChunkWithRetry(chunkInfo, relativePath, url, headers, abortSignal, jobId);
        if (result.success) {
          stats.successfulChunks++;
          // Update job metrics with progress
          updateJobMetrics(jobId, {
            chunksProcessed: stats.successfulChunks,
            processingTimeMs: Date.now() - startTime
          });
          // console.debug(`✓ Chunk ${chunkInfo.index} of ${relativePath} sent (${result.processingTimeMs}ms). ID: ${result.chunkId || 'N/A'}`);
        } else {
          stats.failedChunks++;
          stats.errors.push(`Chunk ${chunkInfo.index}: ${result.error || 'Unknown send error'}`);
          // console.warn(`✗ Chunk ${chunkInfo.index} of ${relativePath} failed after ${result.retryCount} retries: ${result.error}`);
        }
      } catch (error: any) { // Catch errors from sendChunkWithRetry, especially AbortError
        if (error.name === 'AbortError' || abortSignal.aborted) {
            // console.log(`Chunk ${chunkInfo.index} of ${relativePath} processing aborted.`);
            // This error will be added to stats.errors by the outer loop's break if needed
            return; // Don't count as failed if aborted
        }
        stats.failedChunks++;
        stats.errors.push(`Chunk ${chunkInfo.index} critical error: ${error.message}`);
        // console.error(`✗ Chunk ${chunkInfo.index} of ${relativePath} had critical error: ${error.message}`);
      }
    });

    await Promise.allSettled(batchPromises);
    if (abortSignal.aborted) break; // Check after batch processing

    // Small delay between chunk batches for the same file, if not already rate-limited by server
    if (i + concurrencyLimit < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
    }
  }
  
  if (abortSignal.aborted && !stats.errors.includes("Operation cancelled")) {
      stats.errors.push("Operation cancelled during chunk processing");
  }

  stats.processingTimeMs = Date.now() - startTime;
  return stats;
}

// ─── tree view helper functions ────────────────────────────────────────
async function indexSelectedFilesFromTree() {
  if (indexingState.isIndexing) {
    vscode.window.showWarningMessage("Indexing is already in progress. Please wait or stop the current operation.");
    return;
  }
  const selectedFiles = treeDataProvider.getSelectedFiles();
  if (selectedFiles.length === 0) {
    vscode.window.showWarningMessage("No files selected in the String tree. Please select files to index.");
    return;
  }

  const proceed = await vscode.window.showQuickPick(["Yes", "No"], {
    placeHolder: `Index ${selectedFiles.length} selected file(s) from the tree view?`
  });

  if (proceed === "Yes") {
    await indexSelectedFiles(selectedFiles);
  }
}

export function deactivate() {
    console.log("String Codebase Indexer deactivating.");
    
    // Stop webhook server
    stopWebhookServer();
    
    // If there's an ongoing indexing operation, try to signal it to stop.
    if (globalCancellationController && !globalCancellationController.signal.aborted) {
        globalCancellationController.abort("Extension deactivation");
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    
    // Clear job metrics
    activeJobMetrics.clear();
}

// ─── status dashboard functions ────────────────────────────────────────
function createStatusDashboard() {
  // Focus on the embedded dashboard view instead of creating a separate panel
  vscode.commands.executeCommand('mcpStatusDashboardView.focus');
  
  // Update the embedded dashboard content
  if (dashboardViewProvider) {
    dashboardViewProvider.updateContent();
  }
}

function updateDashboardContent() {
  // Legacy function - now handled by the embedded dashboard view provider
  // Keep for backwards compatibility but delegate to the embedded view
  if (dashboardViewProvider) {
    dashboardViewProvider.updateContent();
  }
}



function updateDashboardStats(update: Partial<DashboardStats>) {
  dashboardStats = { ...dashboardStats, ...update, lastUpdate: new Date().toISOString() };
  updateDashboardContent();
  // Also update the embedded dashboard view
  if (dashboardViewProvider) {
    dashboardViewProvider.updateContent();
  }
}

function addJobMetrics(jobId: string, fileName: string) {
  const metrics: JobMetrics = {
    jobId,
    fileName: path.basename(fileName),
    chunksProcessed: 0,
    tokensGenerated: 0,
    processingTimeMs: 0,
    status: 'processing',
    startTime: Date.now()
  };
  
  activeJobMetrics.set(jobId, metrics);
  updateDashboardStats({ activeJobs: activeJobMetrics.size });
}

function updateJobMetrics(jobId: string, update: Partial<JobMetrics>) {
  const existing = activeJobMetrics.get(jobId);
  if (existing) {
    activeJobMetrics.set(jobId, { ...existing, ...update });
    updateDashboardContent();
  }
}

function completeJob(jobId: string, success: boolean, chunksProcessed: number = 0, tokensGenerated: number = 0) {
  const job = activeJobMetrics.get(jobId);
  if (job) {
    const processingTime = Date.now() - job.startTime;
    
    updateJobMetrics(jobId, {
      status: success ? 'completed' : 'failed',
      chunksProcessed,
      tokensGenerated,
      processingTimeMs: processingTime
    });
    
    // Update global stats
    dashboardStats.processedFiles++;
    dashboardStats.totalChunks += chunksProcessed;
    dashboardStats.totalTokens += tokensGenerated;
    
    if (success) {
      dashboardStats.averageProcessingTime = 
        (dashboardStats.averageProcessingTime * (dashboardStats.processedFiles - 1) + processingTime / 1000) / 
        dashboardStats.processedFiles;
    } else {
      dashboardStats.processingErrors++;
    }
    
    // Remove completed job after 3 seconds
    setTimeout(() => {
      activeJobMetrics.delete(jobId);
      updateDashboardStats({ activeJobs: activeJobMetrics.size });
    }, 3000);
  }
}

// ─── status dashboard webview view provider ─────────────────────────────
class DashboardWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mcpStatusDashboardView';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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

    // Listen for messages from the webview
    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.type) {
        case 'refresh':
          this.updateContent();
          break;
      }
    });
  }

  public updateContent() {
    if (this._view) {
      this._view.webview.html = this.generateCompactDashboardHTML();
    }
  }

  private generateCompactDashboardHTML(): string {
    const stats = dashboardStats;
    const activeJobs = Array.from(activeJobMetrics.values());
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>String Status</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            padding: 8px;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            margin: 0;
        }
        
        .header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
        }
        
        .header h3 {
            margin: 0;
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-sideBarSectionHeader-foreground);
        }
        
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            animation: ${stats.vectorStoreReady ? 'pulse 2s infinite' : 'none'};
        }
        
        .status-ready { background: #28a745; }
        .status-processing { background: #ffc107; }
        .status-error { background: #dc3545; }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .stats-compact {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 12px;
        }
        
        .stat-item {
            text-align: center;
            padding: 6px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        
        .stat-value {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-charts-blue);
            display: block;
        }
        
        .stat-label {
            font-size: 10px;
            opacity: 0.7;
            text-transform: uppercase;
        }
        
        .webhook-status {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 12px;
            padding: 6px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            font-size: 11px;
        }
        
        .webhook-icon {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${stats.webhookStatus === 'connected' ? '#28a745' : stats.webhookStatus === 'error' ? '#dc3545' : '#6c757d'};
        }
        
        .section {
            margin-bottom: 12px;
        }
        
        .section-title {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--vscode-sideBarSectionHeader-foreground);
            text-transform: uppercase;
        }
        
        .active-jobs {
            background: var(--vscode-input-background);
            border-radius: 4px;
            overflow: hidden;
            max-height: 120px;
            overflow-y: auto;
        }
        
        .job-item {
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-input-border);
            font-size: 11px;
        }
        
        .job-item:last-child {
            border-bottom: none;
        }
        
        .job-name {
            font-weight: 500;
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .job-details {
            display: flex;
            justify-content: space-between;
            align-items: center;
            opacity: 0.7;
        }
        
        .job-progress {
            font-size: 10px;
        }
        
        .job-status {
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-processing-job {
            background: rgba(255, 193, 7, 0.2);
            color: #ffc107;
        }
        
        .status-completed {
            background: rgba(40, 167, 69, 0.2);
            color: #28a745;
        }
        
        .status-failed {
            background: rgba(220, 53, 69, 0.2);
            color: #dc3545;
        }
        
        .collections-list {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        
        .collection-tag {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 9px;
            font-family: var(--vscode-editor-font-family);
        }
        
        .empty-state {
            text-align: center;
            padding: 12px;
            opacity: 0.6;
            font-size: 11px;
        }
        
        .refresh-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            width: 100%;
            margin-top: 8px;
        }
        
        .refresh-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .progress-bar {
            width: 100%;
            height: 3px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 4px;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-foreground);
            transition: width 0.3s ease;
            width: ${stats.totalFiles > 0 ? (stats.processedFiles / stats.totalFiles) * 100 : 0}%;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="status-indicator ${stats.vectorStoreReady ? 'status-ready' : (stats.activeJobs > 0 ? 'status-processing' : 'status-error')}"></span>
        <h3>📊 String Status</h3>
    </div>
    
    <div class="webhook-status">
        <div class="webhook-icon"></div>
        <span>Webhook: ${stats.webhookStatus === 'connected' ? '🟢' : stats.webhookStatus === 'error' ? '🔴' : '🟡'}</span>
    </div>
    
    <div class="stats-compact">
        <div class="stat-item">
            <span class="stat-value">${stats.totalFiles}</span>
            <span class="stat-label">Total</span>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
        </div>
        
        <div class="stat-item">
            <span class="stat-value">${stats.processedFiles}</span>
            <span class="stat-label">Processed</span>
        </div>
        
        <div class="stat-item">
            <span class="stat-value">${stats.totalChunks}</span>
            <span class="stat-label">Chunks</span>
        </div>
        
        <div class="stat-item">
            <span class="stat-value">${(stats.totalTokens / 1000).toFixed(1)}K</span>
            <span class="stat-label">Tokens</span>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">⚡ Active Jobs (${stats.activeJobs})</div>
        <div class="active-jobs">
            ${activeJobs.length === 0 ? `
                <div class="empty-state">
                    🎯 No active jobs
                </div>
            ` : activeJobs.slice(0, 3).map(job => `
                <div class="job-item">
                    <div class="job-name">📄 ${job.fileName}</div>
                    <div class="job-details">
                        <span class="job-progress">${job.chunksProcessed} chunks</span>
                        <span class="job-status status-${job.status === 'processing' ? 'processing-job' : job.status}">
                            ${job.status}
                        </span>
                    </div>
                </div>
            `).join('')}
            ${activeJobs.length > 3 ? `
                <div class="job-item">
                    <div class="job-name">...and ${activeJobs.length - 3} more</div>
                </div>
            ` : ''}
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">🗃️ Collections (${stats.collections.length})</div>
        ${stats.collections.length === 0 ? `
            <div class="empty-state">
                📭 No collections
            </div>
        ` : `
            <div class="collections-list">
                ${stats.collections.slice(0, 2).map(collection => `
                    <div class="collection-tag">${collection}</div>
                `).join('')}
                ${stats.collections.length > 2 ? `
                    <div class="collection-tag">+${stats.collections.length - 2}</div>
                ` : ''}
            </div>
        `}
    </div>
    
    <button class="refresh-button" onclick="refresh()">
        🔄 Refresh
    </button>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }
        
        // Auto-refresh every 3 seconds when jobs are active
        ${stats.activeJobs > 0 ? `
            setTimeout(() => {
                refresh();
            }, 3000);
        ` : ''}
    </script>
</body>
</html>`;
  }
}

// ─── global state ──────────────────────────────────────────────────────