import * as vscode from 'vscode';

// Import our modular components
import { FileScanner } from './fileScanner';
import { FileIndexer } from './indexing';
import { DashboardWebviewViewProvider, WebhookServer } from './services';
import { StatusManager } from './statusManager';
import { McpFileTreeItem, McpTreeDataProvider } from './treeView';
import { ExtensionConfigEnhanced, FileItem, PerformanceConfig } from './types';
import { debounce, getExtensionConfig } from './utils';
import { VectorStoreManager } from './vectorStoreManager';
import { VectorStoreWebviewProvider } from './vectorStoreWebview';

// ─── Global Extension State ────────────────────────────────────────────
class ExtensionState {
  public statusManager!: StatusManager;
  public treeDataProvider!: McpTreeDataProvider;
  public treeView!: vscode.TreeView<McpFileTreeItem>;
  public selectionStatusBar!: vscode.StatusBarItem;
  public dashboardViewProvider!: DashboardWebviewViewProvider;
  public vectorStoreWebviewProvider!: VectorStoreWebviewProvider;
  public fileScanner!: FileScanner;
  public fileIndexer!: FileIndexer;
  public webhookServer!: WebhookServer;
  public vectorStoreManager!: VectorStoreManager;

  public globalCancellationController: AbortController | null = null;
  public activeIndexingPromises: Set<Promise<unknown>> = new Set();

  initialize(context: vscode.ExtensionContext) {
    // Initialize status manager
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusManager = new StatusManager(statusBarItem);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Get performance configuration
    const config = getExtensionConfig() as ExtensionConfigEnhanced;
    const performanceConfig: PerformanceConfig = config.performance || {
      enableChunkDeduplication: true,
      enableCompression: true,
      compressionThreshold: 1024,
      enableSemanticChunking: true,
      enableDeltaIndexing: true,
      enableConnectionPooling: true,
      maxConnectionPoolSize: 5,
      enableRequestCoalescing: true,
      coalescingWindowMs: 100,
      enableProgressiveStreaming: true,
      streamingChunkSize: 2000,
      enableEnhancedProgress: true,
      cacheExpiryHours: 24,
      maxCacheSize: 10000
    };

    // Initialize file services with performance config
    this.fileScanner = new FileScanner();
    const cacheDir = context.globalStorageUri.fsPath;
    this.fileIndexer = new FileIndexer(cacheDir, performanceConfig);

    // Initialize vector store manager
    this.vectorStoreManager = new VectorStoreManager(context);

    // Connect vector store manager to file indexer
    this.fileIndexer.setVectorStoreManager(this.vectorStoreManager);

    // Initialize file indexer with performance features
    this.fileIndexer.initialize().catch(error => {
      console.error('Failed to initialize file indexer:', error);
    });

    // Initialize tree view
    this.treeDataProvider = new McpTreeDataProvider();
    this.treeView = vscode.window.createTreeView('mcpCodebaseIndexer', {
      treeDataProvider: this.treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });

    // Initialize selection status bar
    this.selectionStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      200
    );
    this.selectionStatusBar.command = 'mcpIndex.indexSelectedFiles';
    this.selectionStatusBar.show();
    context.subscriptions.push(this.selectionStatusBar);

    // Register checkbox event handler
    this.treeView.onDidChangeCheckboxState(event => {
      this.treeDataProvider.handleCheckboxChange(event);
    });

    // Register selection change handler to update status bar
    this.treeDataProvider.onDidChangeSelection(() => {
      this.updateSelectionStatusBar();
    });

    context.subscriptions.push(this.treeView);

    // Initialize webhook server
    this.webhookServer = new WebhookServer(
      this.handleWebhookData.bind(this),
      this.handleWebhookStatusUpdate.bind(this)
    );

    // Initialize dashboard
    this.dashboardViewProvider = new DashboardWebviewViewProvider(
      context.extensionUri,
      () => this.statusManager.getDashboardStats(),
      () => this.statusManager.getActiveJobMetrics()
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        DashboardWebviewViewProvider.viewType,
        this.dashboardViewProvider
      )
    );

    // Initialize vector store webview
    this.vectorStoreWebviewProvider = new VectorStoreWebviewProvider(
      context.extensionUri,
      this.vectorStoreManager
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        VectorStoreWebviewProvider.viewType,
        this.vectorStoreWebviewProvider
      )
    );
  }

  private handleWebhookData(jobData: any) {
    try {
      console.log(`[WEBHOOK] Job ${jobData.job_id} ${jobData.status}`);

      if (jobData.success && jobData.result_data) {
        const { result_data, metrics } = jobData;
        console.log(
          `Processed ${result_data.chunks_processed || 0} chunks in ${
            metrics?.processing_time_ms || 0
          }ms`
        );

        if (result_data.vector_storage) {
          const vectorStorage = result_data.vector_storage;
          this.statusManager.updateDashboardStats({
            vectorStoreReady: vectorStorage.storage_success || false,
            collections: vectorStorage.collection_name
              ? Array.from(
                new Set([
                  ...this.statusManager.getDashboardStats().collections,
                  vectorStorage.collection_name
                ])
              )
              : this.statusManager.getDashboardStats().collections
          });

          vscode.window.showInformationMessage(
            `✅ Processing complete! ${
              result_data.chunks_processed || 0
            } chunks stored in collection: ${vectorStorage.collection_name}`
          );
        }

        const jobId = jobData.job_id || jobData.metadata?.job_id;
        if (jobId) {
          const chunksProcessed = result_data.chunks_processed || 0;
          const estimatedTokens = Math.round((result_data.file_metadata?.character_count || 0) / 4);
          this.statusManager.completeJob(jobId, true, chunksProcessed, estimatedTokens);
        }
      } else {
        const errorMessage = jobData.error_message || 'Unknown error';
        console.error(`Job failed: ${errorMessage}`);
        this.statusManager.updateDashboardStats({
          processingErrors: this.statusManager.getDashboardStats().processingErrors + 1
        });

        vscode.window.showErrorMessage(`❌ Processing failed: ${errorMessage}`);

        const jobId = jobData.job_id || jobData.metadata?.job_id;
        if (jobId) {
          this.statusManager.completeJob(jobId, false, 0, 0);
        }
      }

      this.dashboardViewProvider.updateContent();
    } catch (error) {
      console.error('Error handling webhook data:', error);
      vscode.window.showErrorMessage(
        `❌ Webhook processing error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private handleWebhookStatusUpdate(status: 'connected' | 'disconnected' | 'error') {
    this.statusManager.updateDashboardStats({ webhookStatus: status });
    this.dashboardViewProvider.updateContent();
  }

  public updateSelectionStatusBar() {
    if (!this.selectionStatusBar || !this.treeDataProvider) {
      return;
    }

    const stats = this.treeDataProvider.getSelectionStats();
    const hasSelection = this.treeDataProvider.hasSelectedFiles();

    if (hasSelection) {
      const sizeMB = (stats.selectedSizeBytes / (1024 * 1024)).toFixed(1);
      this.selectionStatusBar.text = `$(play) Index ${stats.selectedCount} files (${sizeMB} MB)`;
      this.selectionStatusBar.tooltip = `Click to index ${stats.selectedCount} selected files\nTotal size: ${sizeMB} MB`;
      this.selectionStatusBar.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.prominentBackground'
      );
      this.selectionStatusBar.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
    } else {
      this.selectionStatusBar.text = `$(file-directory) Select files to index`;
      this.selectionStatusBar.tooltip =
        'No files selected. Use the file tree to select files for indexing.';
      this.selectionStatusBar.backgroundColor = undefined;
      this.selectionStatusBar.color = undefined;
    }
  }

  cleanup() {
    this.webhookServer?.stop();
    this.statusManager?.cleanup();
    this.selectionStatusBar?.dispose();

    if (this.globalCancellationController && !this.globalCancellationController.signal.aborted) {
      this.globalCancellationController.abort('Extension deactivation');
    }

    this.activeIndexingPromises.clear();
  }
}

// Global state instance
const extensionState = new ExtensionState();

// ─── Main Extension Entry Point ────────────────────────────────────────
export async function activate(context: vscode.ExtensionContext) {
  // Initialize all components
  extensionState.initialize(context);

  // Register all commands
  registerCommands(context);

  // Start webhook server
  await extensionState.webhookServer.start();

  // Ensure both views are visible
  await ensureBothViewsVisible();

  // Setup file watchers
  setupFileWatchers(context);

  // Auto-index on startup if configured
  const config = getExtensionConfig();
  if (config.autoIndexOnStartup) {
    setTimeout(() => scanAndSelectFiles(), 2000);
  }
}

// ─── Command Registration ──────────────────────────────────────────────
function registerCommands(context: vscode.ExtensionContext) {
  const commands = [
    vscode.commands.registerCommand('mcpIndex.run', () => scanAndSelectFiles()),
    vscode.commands.registerCommand('mcpIndex.toggleAuto', () =>
      extensionState.statusManager.toggleAutoIndexing()
    ),
    vscode.commands.registerCommand('mcpIndex.showMenu', () => showIndexingMenu()),
    vscode.commands.registerCommand('mcpIndex.refreshTree', () =>
      extensionState.treeDataProvider.refreshFiles()
    ),
    vscode.commands.registerCommand('mcpIndex.selectAll', () =>
      extensionState.treeDataProvider.selectAll()
    ),
    vscode.commands.registerCommand('mcpIndex.deselectAll', () =>
      extensionState.treeDataProvider.deselectAll()
    ),
    vscode.commands.registerCommand('mcpIndex.toggleFileSelection', (item: McpFileTreeItem) =>
      extensionState.treeDataProvider.toggleFileSelection(item)
    ),
    vscode.commands.registerCommand('mcpIndex.indexSelectedFiles', () =>
      indexSelectedFilesFromTree()
    ),
    vscode.commands.registerCommand('mcpIndex.toggleFolderSelection', (item: McpFileTreeItem) =>
      extensionState.treeDataProvider.toggleFolderSelection(item)
    ),
    vscode.commands.registerCommand('mcpIndex.selectFolder', (item: McpFileTreeItem) =>
      extensionState.treeDataProvider.selectFolderFiles(item)
    ),
    vscode.commands.registerCommand('mcpIndex.deselectFolder', (item: McpFileTreeItem) =>
      extensionState.treeDataProvider.deselectFolderFiles(item)
    ),
    vscode.commands.registerCommand('mcpIndex.openFile', (item: McpFileTreeItem) => {
      if (item.node.type === 'file' && item.node.fileItem) {
        vscode.window.showTextDocument(item.node.fileItem.uri);
      }
    }),
    vscode.commands.registerCommand('mcpIndex.stopIndexing', () => stopIndexingOperation()),
    vscode.commands.registerCommand('mcpIndex.indexSelected', (files: FileItem[]) =>
      indexSelectedFiles(files)
    ),
    vscode.commands.registerCommand('mcpIndex.openStatusDashboard', () => createStatusDashboard()),
    vscode.commands.registerCommand('mcpIndex.showBothViews', () => ensureBothViewsVisible()),
    // New vector store commands
    vscode.commands.registerCommand('mcpIndex.manageVectorStores', () => showVectorStoreManager()),
    vscode.commands.registerCommand('mcpIndex.selectVectorStore', () => selectActiveVectorStore()),
    // Community support command
    vscode.commands.registerCommand('mcpIndex.supportCommunity', () => openCommunitySupport()),
    // Selection summary command
    vscode.commands.registerCommand('mcpIndex.showSelectionSummary', () => showSelectionSummary())
  ];

  commands.forEach(cmd => context.subscriptions.push(cmd));
}

// ─── File System Watchers ──────────────────────────────────────────────
function setupFileWatchers(context: vscode.ExtensionContext) {
  const supportedExtensions = '{py,ts,js,jsx,tsx,java,go,rs,cpp,c,h,hpp,cs,php,rb}';
  const watcher = vscode.workspace.createFileSystemWatcher(`**/*.${supportedExtensions}`);

  const debouncedRefresh = debounce(() => extensionState.treeDataProvider.refreshFiles(), 1000);
  const debouncedAutoIndexTrigger = debounce(() => {
    const indexingState = extensionState.statusManager.getIndexingState();
    if (indexingState.autoIndexEnabled && !indexingState.isIndexing) {
      scanAndSelectFiles();
    }
  }, 2000);

  watcher.onDidCreate(debouncedRefresh);
  watcher.onDidDelete(debouncedRefresh);
  watcher.onDidChange(debouncedAutoIndexTrigger);

  context.subscriptions.push(watcher);
}

// ─── Core Functionality ────────────────────────────────────────────────
async function scanAndSelectFiles() {
  try {
    const files = await extensionState.fileScanner.scanWorkspace();
    if (files.length === 0) {
      vscode.window.showInformationMessage('🔍 No supported code files found in workspace');
      return;
    }

    extensionState.treeDataProvider.setFiles(files);
    extensionState.updateSelectionStatusBar();
    await ensureBothViewsVisible();

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    vscode.window.showInformationMessage(
      `📁 Found ${files.length} files (${sizeMB} MB). Use the tree view or status bar to select and index files.`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to scan files:', error);

    // Provide actionable recovery options
    const retryAction = 'Retry Scan';
    const settingsAction = 'Check Settings';

    const selection = await vscode.window.showErrorMessage(
      `❌ Failed to scan workspace: ${errorMessage}`,
      retryAction,
      settingsAction
    );

    if (selection === retryAction) {
      // Retry after a short delay
      setTimeout(() => scanAndSelectFiles(), 1000);
    } else if (selection === settingsAction) {
      vscode.commands.executeCommand('workbench.action.openSettings', 'string-codebase-indexer');
    }
  }
}

async function indexSelectedFiles(files: FileItem[]) {
  if (files.length === 0) {
    vscode.window
      .showWarningMessage('🚫 No files selected for indexing', 'Select Files')
      .then(selection => {
        if (selection === 'Select Files') {
          scanAndSelectFiles();
        }
      });
    return;
  }

  // Show confirmation for large file sets
  if (files.length > 10) {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    const proceed = await vscode.window.showWarningMessage(
      `⚠️ You're about to index ${files.length} files (${sizeMB} MB). This may take some time.`,
      { modal: true },
      'Proceed with Indexing',
      'Cancel'
    );

    if (proceed !== 'Proceed with Indexing') {
      return;
    }
  }

  const config = getExtensionConfig();

  // Show vector store selection if multi-store is enabled
  if (config.enableMultiVectorStore) {
    const connections = await extensionState.vectorStoreManager.getAllConnections();
    const connectedStores = connections.filter(conn => conn.isConnected);

    if (connectedStores.length === 0) {
      vscode.window.showWarningMessage(
        '⚠️ No vector stores connected. Please configure vector stores first.'
      );
      return;
    }

    if (connectedStores.length > 1) {
      const selection = await vscode.window.showQuickPick(
        connectedStores.map(store => ({
          label: store.credentials.name,
          description: store.credentials.provider.toUpperCase(),
          detail: `${store.collections.length} collections • ${store.credentials.endpoint}`,
          storeId: store.id
        })),
        {
          title: 'Select Vector Store',
          placeHolder: 'Choose which vector store to use for indexing'
        }
      );

      if (selection) {
        extensionState.vectorStoreManager.setActiveStore(selection.storeId);
      } else {
        return; // User cancelled
      }
    }
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

  extensionState.statusManager.setIndexingState(true, files.length);

  extensionState.globalCancellationController = new AbortController();

  try {
    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: '🚀 Indexing Files',
      cancellable: true
    };

    const result = await vscode.window.withProgress(
      progressOptions,
      async (progress, cancellationToken) => {
        cancellationToken.onCancellationRequested(() => {
          if (
            extensionState.globalCancellationController &&
            !extensionState.globalCancellationController.signal.aborted
          ) {
            extensionState.globalCancellationController.abort('User cancelled indexing');
          }
        });

        const onProgress = (current: number, total: number, fileName: string) => {
          const percentage = Math.round((current / total) * 100);
          progress.report({
            increment: percentage / total,
            message: `Processing ${fileName} (${current}/${total}) • ${sizeMB} MB`
          });
        };

        const onJobStart = (jobId: string, fileName: string) => {
          extensionState.statusManager.startJob(jobId, fileName);
        };

        const onJobComplete = (
          jobId: string,
          success: boolean,
          chunksProcessed?: number,
          tokensGenerated?: number
        ) => {
          extensionState.statusManager.completeJob(
            jobId,
            success,
            chunksProcessed,
            tokensGenerated
          );
          extensionState.dashboardViewProvider.updateContent();
        };

        return await extensionState.fileIndexer.indexFiles(
          files,
          onProgress,
          onJobStart,
          onJobComplete,
          extensionState.globalCancellationController?.signal
        );
      }
    );

    const wasAborted = extensionState.globalCancellationController?.signal.aborted;

    extensionState.statusManager.setIndexingState(false, 0, result.successCount);

    if (wasAborted) {
      vscode.window.showWarningMessage(
        `⏹️ Indexing cancelled. Processed ${result.successCount}/${files.length} files successfully.`
      );
    } else if (result.errorCount > 0) {
      vscode.window.showWarningMessage(
        `⚠️ Indexing completed with errors. ${result.successCount}/${files.length} files successful.`
      );
    } else {
      vscode.window.showInformationMessage(
        `✅ Indexing completed successfully! All ${result.successCount} files processed.`
      );
    }
  } catch (error) {
    extensionState.statusManager.setIndexingState(false, 0, 0);

    if (extensionState.globalCancellationController?.signal.aborted) {
      vscode.window.showWarningMessage('⏹️ Indexing operation cancelled');
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Indexing failed:', error);

      // Provide more actionable error feedback
      const retryAction = 'Retry Indexing';
      const checkSettingsAction = 'Check Settings';
      const contactSupportAction = 'Get Help';

      const selection = await vscode.window.showErrorMessage(
        `❌ Indexing failed: ${errorMessage}`,
        retryAction,
        checkSettingsAction,
        contactSupportAction
      );

      if (selection === retryAction) {
        // Retry with the same files after a short delay
        setTimeout(() => indexSelectedFiles(files), 2000);
      } else if (selection === checkSettingsAction) {
        vscode.commands.executeCommand('workbench.action.openSettings', 'string-codebase-indexer');
      } else if (selection === contactSupportAction) {
        vscode.commands.executeCommand('mcpIndex.supportCommunity');
      }
    }
  } finally {
    cleanupIndexingState();
  }
}

async function indexSelectedFilesFromTree() {
  const selectedFiles = extensionState.treeDataProvider.getSelectedFiles();

  if (selectedFiles.length === 0) {
    vscode.window
      .showInformationMessage(
        '💡 Tip: Check the boxes next to files in the tree view to select them for indexing',
        'Show File Tree'
      )
      .then(selection => {
        if (selection === 'Show File Tree') {
          vscode.commands.executeCommand('mcpCodebaseIndexer.focus');
        }
      });
    return;
  }

  await indexSelectedFiles(selectedFiles);
}

async function showIndexingMenu() {
  const config = getExtensionConfig();
  const indexingState = extensionState.statusManager.getIndexingState();

  const menuItems = [
    {
      label: '📁 Scan and Select Files',
      description: 'Scan workspace for code files',
      action: 'scan'
    },
    {
      label: `🔄 Auto-indexing: ${indexingState.autoIndexEnabled ? 'ON' : 'OFF'}`,
      description: 'Toggle automatic file indexing on save',
      action: 'toggleAuto'
    }
  ];

  // Add vector store management if enabled
  if (config.enableMultiVectorStore) {
    menuItems.push(
      {
        label: '🔗 Manage Vector Stores',
        description: 'Configure and manage vector store connections',
        action: 'manageStores'
      },
      {
        label: '🎯 Select Active Vector Store',
        description: 'Choose which vector store to use for indexing',
        action: 'selectStore'
      }
    );
  }

  const selection = await vscode.window.showQuickPick(menuItems, {
    title: 'String Codebase Indexer',
    placeHolder: 'Choose an action'
  });

  if (!selection) return;

  switch (selection.action) {
  case 'scan':
    await scanAndSelectFiles();
    break;
  case 'toggleAuto':
    extensionState.statusManager.toggleAutoIndexing();
    break;
  case 'manageStores':
    await showVectorStoreManager();
    break;
  case 'selectStore':
    await selectActiveVectorStore();
    break;
  }
}

function createStatusDashboard() {
  const panel = vscode.window.createWebviewPanel(
    'mcpStatusDashboard',
    '📊 MCP Status Dashboard',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  panel.webview.html = extensionState.dashboardViewProvider.generateCompactDashboardHTML();
}

async function ensureBothViewsVisible() {
  const config = getExtensionConfig();
  if (config.showBothViewsOnStartup) {
    await vscode.commands.executeCommand('mcpCodebaseIndexer.focus');
    await vscode.commands.executeCommand('mcpStatusDashboardView.focus');
    await vscode.commands.executeCommand('vectorStoreManagerView.focus');
  }
}

// ─── Vector Store Management ──────────────────────────────────────────
async function showVectorStoreManager() {
  await vscode.commands.executeCommand('vectorStoreManagerView.focus');
}

// ─── Community Support ─────────────────────────────────────────────────
async function openCommunitySupport() {
  const supportUrl = 'https://coff.ee/justar1996';

  const selection = await vscode.window.showInformationMessage(
    '☕ Support the String Codebase Indexer development!',
    {
      detail:
        'Your support helps keep this extension free and actively maintained. Thank you for being part of our community! 💜',
      modal: false
    },
    '☕ Buy me a coffee',
    '🌟 Star on GitHub'
  );

  if (selection === '☕ Buy me a coffee') {
    vscode.env.openExternal(vscode.Uri.parse(supportUrl));
  } else if (selection === '🌟 Star on GitHub') {
    vscode.env.openExternal(
      vscode.Uri.parse('https://github.com/Justar96/string-vscode-extension')
    );
  }
}

async function selectActiveVectorStore() {
  const connections = await extensionState.vectorStoreManager.getAllConnections();
  const connectedStores = connections.filter(conn => conn.isConnected);

  if (connectedStores.length === 0) {
    vscode.window.showWarningMessage(
      '⚠️ No vector stores connected. Please configure vector stores first.'
    );
    return;
  }

  const selection = await vscode.window.showQuickPick(
    connectedStores.map(store => ({
      label: store.credentials.name,
      description: `${store.credentials.provider.toUpperCase()} • ${
        store.isConnected ? '🟢 Connected' : '🔴 Disconnected'
      }`,
      detail: `${store.collections.length} collections • ${store.credentials.endpoint}`,
      storeId: store.id
    })),
    {
      title: 'Select Active Vector Store',
      placeHolder: 'Choose the default vector store for indexing'
    }
  );

  if (selection) {
    extensionState.vectorStoreManager.setActiveStore(selection.storeId);
    vscode.window.showInformationMessage(`✅ Active vector store set to: ${selection.label}`);
  }
}

async function showSelectionSummary() {
  const stats = extensionState.treeDataProvider.getSelectionStats();
  const selectedFiles = extensionState.treeDataProvider.getSelectedFiles();

  if (stats.selectedCount === 0) {
    vscode.window
      .showInformationMessage('📂 No files currently selected for indexing', 'Scan Workspace')
      .then(selection => {
        if (selection === 'Scan Workspace') {
          scanAndSelectFiles();
        }
      });
    return;
  }

  const sizeMB = (stats.selectedSizeBytes / (1024 * 1024)).toFixed(2);
  const totalSizeMB = (stats.totalSizeBytes / (1024 * 1024)).toFixed(2);

  // Show detailed selection summary
  const actions = [
    '🚀 Index Selected Files',
    '📋 View File List',
    '🔄 Select All',
    '❌ Deselect All'
  ];

  const selection = await vscode.window.showInformationMessage(
    `📊 Selection Summary`,
    {
      detail: `Selected: ${stats.selectedCount}/${stats.totalCount} files (${sizeMB} MB / ${totalSizeMB} MB total)\n\nReady to index your selected files?`,
      modal: false
    },
    ...actions
  );

  switch (selection) {
  case '🚀 Index Selected Files':
    await indexSelectedFiles(selectedFiles);
    break;
  case '📋 View File List':
    await showFileList(selectedFiles);
    break;
  case '🔄 Select All':
    extensionState.treeDataProvider.selectAll();
    break;
  case '❌ Deselect All':
    extensionState.treeDataProvider.deselectAll();
    break;
  }
}

async function showFileList(files: FileItem[]) {
  const quickPickItems = files.map(file => ({
    label: `$(file-code) ${file.relativePath}`,
    description: `${file.language} • ${(file.size / 1024).toFixed(1)} KB`,
    detail: file.uri.fsPath
  }));

  await vscode.window.showQuickPick(quickPickItems, {
    title: `📋 Selected Files (${files.length})`,
    placeHolder: 'Files ready for indexing',
    matchOnDescription: true,
    matchOnDetail: true
  });
}

// ─── Utility Functions ──────────────────────────────────────────────────
async function stopIndexingOperation(): Promise<void> {
  if (
    !extensionState.globalCancellationController ||
    extensionState.globalCancellationController.signal.aborted
  ) {
    vscode.window.showInformationMessage('🚫 No active indexing operation to stop');
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    '⚠️ Are you sure you want to stop the current indexing operation?',
    { modal: true },
    'Yes, Stop Indexing'
  );

  if (confirmation === 'Yes, Stop Indexing') {
    extensionState.globalCancellationController.abort('User requested stop');
    vscode.window.showInformationMessage('⏹️ Indexing operation stopped');
  }
}

function cleanupIndexingState(): void {
  extensionState.globalCancellationController = null;
  extensionState.activeIndexingPromises.clear();
}

export function deactivate() {
  extensionState.cleanup();
}
