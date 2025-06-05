import * as vscode from "vscode";
import * as path from "path";

// Import our modular components
import { FileItem, VectorStoreSelectionContext } from "./types";
import { getExtensionConfig, debounce } from "./utils";
import { FileScanner } from "./fileScanner";
import { McpTreeDataProvider, McpFileTreeItem } from "./treeView";
import { StatusManager } from "./statusManager";
import { FileIndexer } from "./indexing";
import { WebhookServer, DashboardWebviewViewProvider } from "./services";
import { VectorStoreManager } from "./vectorStoreManager";
import { VectorStoreWebviewProvider } from "./vectorStoreWebview";

// ─── Global Extension State ────────────────────────────────────────────
class ExtensionState {
  public statusManager!: StatusManager;
  public treeDataProvider!: McpTreeDataProvider;
  public treeView!: vscode.TreeView<McpFileTreeItem>;
  public dashboardViewProvider!: DashboardWebviewViewProvider;
  public vectorStoreWebviewProvider!: VectorStoreWebviewProvider;
  public fileScanner!: FileScanner;
  public fileIndexer!: FileIndexer;
  public webhookServer!: WebhookServer;
  public vectorStoreManager!: VectorStoreManager;
  
  public globalCancellationController: AbortController | null = null;
  public activeIndexingPromises: Set<Promise<any>> = new Set();

  initialize(context: vscode.ExtensionContext) {
    // Initialize status manager
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusManager = new StatusManager(statusBarItem);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Initialize file services
    this.fileScanner = new FileScanner();
    this.fileIndexer = new FileIndexer();

    // Initialize vector store manager
    this.vectorStoreManager = new VectorStoreManager(context);

    // Initialize tree view
    this.treeDataProvider = new McpTreeDataProvider();
    this.treeView = vscode.window.createTreeView("mcpCodebaseIndexer", {
      treeDataProvider: this.treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });
    
    // Register checkbox event handler
    this.treeView.onDidChangeCheckboxState(event => {
      this.treeDataProvider.handleCheckboxChange(event);
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
    console.log(`[WEBHOOK] Job ${jobData.job_id} ${jobData.status}`);
    
    if (jobData.success && jobData.result_data) {
      const { result_data, metrics } = jobData;
      console.log(`Processed ${result_data.chunks_processed || 0} chunks in ${metrics?.processing_time_ms || 0}ms`);
      
      if (result_data.vector_storage) {
        const vectorStorage = result_data.vector_storage;
        this.statusManager.updateDashboardStats({
          vectorStoreReady: vectorStorage.storage_success || false,
          collections: vectorStorage.collection_name ? 
            Array.from(new Set([...this.statusManager.getDashboardStats().collections, vectorStorage.collection_name])) : 
            this.statusManager.getDashboardStats().collections
        });
        
        vscode.window.showInformationMessage(
          `✅ Processing complete! ${result_data.chunks_processed || 0} chunks stored in collection: ${vectorStorage.collection_name}`
        );
      }
      
      const jobId = jobData.job_id || jobData.metadata?.job_id;
      if (jobId) {
        const chunksProcessed = result_data.chunks_processed || 0;
        const estimatedTokens = Math.round((result_data.file_metadata?.character_count || 0) / 4);
        this.statusManager.completeJob(jobId, true, chunksProcessed, estimatedTokens);
      }
      
    } else {
      console.error(`Job failed: ${jobData.error_message || 'Unknown error'}`);
      this.statusManager.updateDashboardStats({ 
        processingErrors: this.statusManager.getDashboardStats().processingErrors + 1 
      });
      
      vscode.window.showErrorMessage(`❌ Processing failed: ${jobData.error_message || 'Unknown error'}`);
      
      const jobId = jobData.job_id || jobData.metadata?.job_id;
      if (jobId) {
        this.statusManager.completeJob(jobId, false, 0, 0);
      }
    }
    
    this.dashboardViewProvider.updateContent();
  }

  private handleWebhookStatusUpdate(status: 'connected' | 'disconnected' | 'error') {
    this.statusManager.updateDashboardStats({ webhookStatus: status });
    this.dashboardViewProvider.updateContent();
  }

  cleanup() {
    this.webhookServer?.stop();
    this.statusManager?.cleanup();
    
    if (this.globalCancellationController && !this.globalCancellationController.signal.aborted) {
      this.globalCancellationController.abort("Extension deactivation");
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
    vscode.commands.registerCommand("mcpIndex.run", () => scanAndSelectFiles()),
    vscode.commands.registerCommand("mcpIndex.toggleAuto", () => extensionState.statusManager.toggleAutoIndexing()),
    vscode.commands.registerCommand("mcpIndex.showMenu", () => showIndexingMenu()),
    vscode.commands.registerCommand("mcpIndex.refreshTree", () => extensionState.treeDataProvider.refreshFiles()),
    vscode.commands.registerCommand("mcpIndex.selectAll", () => extensionState.treeDataProvider.selectAll()),
    vscode.commands.registerCommand("mcpIndex.deselectAll", () => extensionState.treeDataProvider.deselectAll()),
    vscode.commands.registerCommand("mcpIndex.toggleFileSelection", (item: McpFileTreeItem) => 
      extensionState.treeDataProvider.toggleFileSelection(item)),
    vscode.commands.registerCommand("mcpIndex.indexSelectedFiles", () => indexSelectedFilesFromTree()),
    vscode.commands.registerCommand("mcpIndex.toggleFolderSelection", (item: McpFileTreeItem) => 
      extensionState.treeDataProvider.toggleFolderSelection(item)),
    vscode.commands.registerCommand("mcpIndex.selectFolder", (item: McpFileTreeItem) => 
      extensionState.treeDataProvider.selectFolderFiles(item)),
    vscode.commands.registerCommand("mcpIndex.deselectFolder", (item: McpFileTreeItem) => 
      extensionState.treeDataProvider.deselectFolderFiles(item)),
    vscode.commands.registerCommand("mcpIndex.openFile", (item: McpFileTreeItem) => {
      if (item.node.type === 'file' && item.node.fileItem) {
        vscode.window.showTextDocument(item.node.fileItem.uri);
      }
    }),
    vscode.commands.registerCommand("mcpIndex.stopIndexing", () => stopIndexingOperation()),
    vscode.commands.registerCommand("mcpIndex.indexSelected", (files: FileItem[]) => indexSelectedFiles(files)),
    vscode.commands.registerCommand("mcpIndex.openStatusDashboard", () => createStatusDashboard()),
    vscode.commands.registerCommand("mcpIndex.showBothViews", () => ensureBothViewsVisible())
  ];

  commands.forEach(cmd => context.subscriptions.push(cmd));
}

// ─── File System Watchers ──────────────────────────────────────────────
function setupFileWatchers(context: vscode.ExtensionContext) {
  const supportedExtensions = "{py,ts,js,jsx,tsx,java,go,rs,cpp,c,h,hpp,cs,php,rb}";
  const watcher = vscode.workspace.createFileSystemWatcher(`**/*.${supportedExtensions}`);
  
  const debouncedRefresh = debounce(() => extensionState.treeDataProvider.refreshFiles(), 1000);
  const debouncedAutoIndexTrigger = debounce(() => {
    const indexingState = extensionState.statusManager.getIndexingState();
    if (indexingState.autoIndexEnabled && !indexingState.isIndexing) {
      vscode.window.showInformationMessage("File changes detected. Re-scanning for auto-indexing.");
      scanAndSelectFiles();
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

// ─── Main Application Logic ────────────────────────────────────────────
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
      const fileItems = await extensionState.fileScanner.scanWorkspace();

      if (fileItems.length === 0) {
        vscode.window.showInformationMessage("No supported code files found in the current workspace matching criteria.");
        return;
      }

      progress.report({ message: "Showing file selection dialog..." });
      const selectedFiles = await extensionState.fileScanner.showFileSelectionDialog(fileItems);
      
      if (selectedFiles) {
        await indexSelectedFiles(selectedFiles);
      }
    }
  );
}

async function indexSelectedFiles(files: FileItem[]) {
  const indexingState = extensionState.statusManager.getIndexingState();
  if (indexingState.isIndexing) {
    vscode.window.showWarningMessage("Indexing is already in progress.");
    return;
  }
  if (files.length === 0) {
    vscode.window.showWarningMessage("No files selected for indexing.");
    return;
  }

  extensionState.globalCancellationController = new AbortController();
  
  // Reset dashboard for new indexing session
  extensionState.statusManager.resetDashboardStats();
  
  extensionState.statusManager.setIndexingInProgress(files.length);
  extensionState.statusManager.updateDashboardStats({ 
    totalFiles: files.length, 
    processedFiles: 0,
    activeJobs: 0
  });

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "String: Indexing files...",
      cancellable: true
    },
    async (progress, token) => {
      token.onCancellationRequested(() => {
        console.log("🛑 Indexing cancelled via notification.");
        extensionState.globalCancellationController?.abort();
      });

      try {
        const { successCount, errorCount } = await extensionState.fileIndexer.indexFiles(
          files,
          (current, total, fileName) => {
            extensionState.statusManager.incrementIndexedFiles();
            progress.report({ 
              message: `✓ ${path.basename(fileName)}`,
              increment: 100 / total 
            });
          },
          (jobId, fileName) => {
            extensionState.statusManager.addJobMetrics(jobId, fileName);
            extensionState.dashboardViewProvider.updateContent();
          },
          (jobId, success, chunksProcessed, tokensGenerated) => {
            extensionState.statusManager.completeJob(jobId, success, chunksProcessed, tokensGenerated);
            extensionState.dashboardViewProvider.updateContent();
          },
          extensionState.globalCancellationController!.signal
        );

        const wasCancelled = extensionState.globalCancellationController?.signal.aborted;
        extensionState.statusManager.completeIndexing(!wasCancelled && errorCount === 0);

        if (!wasCancelled) {
          const message = errorCount > 0 
            ? `String indexing complete. ✓ ${successCount} files fully/partially indexed, ✗ ${errorCount} files had errors.`
            : `String indexing complete! ✓ All ${successCount} selected files processed successfully.`;
          vscode.window.showInformationMessage(message);
        } else {
          vscode.window.showInformationMessage(`String indexing was cancelled. ${successCount} files may have been processed before cancellation.`);
        }

      } catch (error) {
        extensionState.statusManager.completeIndexing(false);
        console.error("Indexing failed:", error);
        vscode.window.showErrorMessage(`Indexing failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        cleanupIndexingState();
      }
    }
  );
}

async function indexSelectedFilesFromTree() {
  const indexingState = extensionState.statusManager.getIndexingState();
  if (indexingState.isIndexing) {
    vscode.window.showWarningMessage("Indexing is already in progress. Please wait or stop the current operation.");
    return;
  }
  
  const selectedFiles = extensionState.treeDataProvider.getSelectedFiles();
  if (selectedFiles.length === 0) {
    vscode.window.showWarningMessage("No files selected in the String Indexer tree. Please select files to index.");
    return;
  }

  const proceed = await vscode.window.showQuickPick(["Yes", "No"], {
    placeHolder: `Index ${selectedFiles.length} selected file(s) from the tree view?`
  });

  if (proceed === "Yes") {
    await indexSelectedFiles(selectedFiles);
  }
}

// ─── UI and Menu Functions ─────────────────────────────────────────────
async function showIndexingMenu() {
  const selectedCount = extensionState.treeDataProvider.getSelectedFiles().length;
  const totalFileItems = extensionState.treeDataProvider.getFileItems().length;
  
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
      label: extensionState.statusManager.getIndexingState().autoIndexEnabled ? 
        "$(sync-ignored) Disable Auto-indexing" : "$(sync) Enable Auto-indexing",
      description: extensionState.statusManager.getIndexingState().autoIndexEnabled ? 
        "Turn off automatic indexing on file changes" : "Turn on automatic indexing on file changes",
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
    vscode.commands.executeCommand('workbench.view.extension.mcpCodebaseIndexerContainer');
    if (extensionState.treeView) {
      const children = await extensionState.treeDataProvider.getChildren();
      const firstNode = children.length > 0 ? children[0] : undefined;
      if (firstNode) {
        extensionState.treeView.reveal(firstNode, { select: false, focus: true, expand: true });
      } else {
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
    extensionState.statusManager.toggleAutoIndexing();
  } else if (selected.label.includes("Settings")) {
    vscode.commands.executeCommand("workbench.action.openSettings", "string-codebase-indexer");
  } else if (selected.label.includes("Status")) {
    extensionState.statusManager.showStatusInfo();
  }
}

function createStatusDashboard() {
  vscode.commands.executeCommand('mcpStatusDashboardView.focus');
  extensionState.dashboardViewProvider.updateContent();
}

async function ensureBothViewsVisible() {
  const config = getExtensionConfig();
  if (!config.showBothViewsOnStartup) {
    console.log("Auto-showing both views is disabled in settings");
    return;
  }

  setTimeout(async () => {
    try {
      await vscode.commands.executeCommand('workbench.view.extension.mcpCodebaseIndexerContainer');
      await new Promise(resolve => setTimeout(resolve, 300));
      await vscode.commands.executeCommand('mcpCodebaseIndexer.focus');
      await new Promise(resolve => setTimeout(resolve, 200));
      await vscode.commands.executeCommand('mcpStatusDashboardView.focus');
      
      setTimeout(() => {
        vscode.commands.executeCommand('mcpCodebaseIndexer.focus');
      }, 200);
      
      console.log("✅ Both String views are now visible in the dedicated String sidebar");
    } catch (error) {
      console.warn("Could not ensure both views are visible:", error);
      vscode.window.showInformationMessage(
        "💡 To see both String views, click the database icon in the Activity Bar to open the String Codebase Indexer panel."
      );
    }
  }, 1500);
}

// ─── Operation Control ─────────────────────────────────────────────────
async function stopIndexingOperation(): Promise<void> {
  const indexingState = extensionState.statusManager.getIndexingState();
  if (!indexingState.isIndexing) {
    vscode.window.showInformationMessage("No indexing operation is currently in progress.");
    return;
  }

  console.log("🛑 User requested to stop indexing operation.");
  vscode.window.showInformationMessage("Attempting to stop indexing...");

  if (extensionState.globalCancellationController) {
    extensionState.globalCancellationController.abort();
  }

  if (extensionState.activeIndexingPromises.size > 0) {
    console.log(`⏳ Waiting for ${extensionState.activeIndexingPromises.size} active indexing operations to stop...`);
    try {
      await Promise.race([
        Promise.allSettled(Array.from(extensionState.activeIndexingPromises)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Stop operation timed out after 5s")), 5000))
      ]);
    } catch (error) {
      console.warn("⚠️ Some indexing operations may not have stopped gracefully:", error);
    }
  }

  cleanupIndexingState();
  vscode.window.showInformationMessage("✅ Indexing operation has been stopped.");
}

function cleanupIndexingState(): void {
  extensionState.statusManager.cleanupOnStop();
  extensionState.globalCancellationController = null;
  extensionState.activeIndexingPromises.clear();
  extensionState.dashboardViewProvider.updateContent();
  console.log("🧹 Indexing state has been cleaned up.");
}

// ─── Extension Deactivation ────────────────────────────────────────────
export function deactivate() {
  console.log("String Codebase Indexer deactivating.");
  extensionState.cleanup();
} 