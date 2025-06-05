import * as path from 'path';
import * as vscode from 'vscode';
import { FileScanner } from './fileScanner';
import { ExplorerNode, FileItem } from './types';
import { formatFileSize } from './utils';

export class McpFileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly node: ExplorerNode,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None
  ) {
    super(node.label, collapsibleState);

    this.resourceUri = node.uri;
    this.tooltip = node.relativePath;

    if (node.type === 'file' && node.fileItem) {
      // File item - use native VS Code file icons with checkbox
      this.tooltip = `${node.fileItem.relativePath} • ${formatFileSize(node.fileItem.size)} • ${
        node.fileItem.selected ? '✅ Selected' : '⬜ Not selected'
      }`;
      this.contextValue = 'mcpFile';

      // Use native VS Code checkbox state
      this.checkboxState = node.fileItem.selected
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;

      // Enhanced description for selected files
      if (node.fileItem.selected) {
        this.description = `✅ ${formatFileSize(node.fileItem.size)}`;
        // Add visual emphasis for selected files
        this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'));
      } else {
        this.description = formatFileSize(node.fileItem.size);
        this.iconPath = vscode.ThemeIcon.File;
      }

      // Set command to open file when clicking on file name/icon
      this.command = {
        command: 'mcpIndex.openFile',
        title: 'Open File',
        arguments: [this]
      };
    } else if (node.type === 'folder') {
      // Folder item - use native VS Code folder icons with checkbox
      this.tooltip = `Folder: ${node.relativePath}`;
      this.contextValue = 'mcpFolder';

      // Calculate selection state for folder
      const fileCount = this.countFilesInFolder(node);
      const selectedCount = this.countSelectedFilesInFolder(node);

      // Use native VS Code checkbox state for folders
      if (selectedCount === 0) {
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
        this.description = `${fileCount} files`;
        this.iconPath = vscode.ThemeIcon.Folder;
      } else if (selectedCount === fileCount) {
        this.checkboxState = vscode.TreeItemCheckboxState.Checked;
        this.description = `✅ ${selectedCount}/${fileCount} files`;
        this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.green'));
      } else {
        // Partial selection - VS Code doesn't have a built-in "indeterminate" state for TreeItems
        // We'll use checked state but show file count in description
        this.checkboxState = vscode.TreeItemCheckboxState.Checked;
        this.description = `🔶 ${selectedCount}/${fileCount} files`;
        this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.orange'));
      }

      // Remove command to let checkbox handle selection
      // Users can still use context menu for manual toggle
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

export class McpTreeDataProvider implements vscode.TreeDataProvider<McpFileTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<McpFileTreeItem | undefined | null | void> =
    new vscode.EventEmitter<McpFileTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<McpFileTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _onDidChangeCheckboxState: vscode.EventEmitter<
    vscode.TreeCheckboxChangeEvent<McpFileTreeItem>
  > = new vscode.EventEmitter<vscode.TreeCheckboxChangeEvent<McpFileTreeItem>>();
  readonly onDidChangeCheckboxState: vscode.Event<vscode.TreeCheckboxChangeEvent<McpFileTreeItem>> =
    this._onDidChangeCheckboxState.event;

  // Event emitter for selection changes to update UI elements
  private _onDidChangeSelection: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly onDidChangeSelection: vscode.Event<void> = this._onDidChangeSelection.event;

  private fileItems: FileItem[] = [];
  private rootNodes: ExplorerNode[] = [];
  private fileScanner: FileScanner;

  constructor() {
    this.fileScanner = new FileScanner();
    this.refreshFiles();
  }

  refresh(): void {
    this.buildFileTree();
    this._onDidChangeTreeData.fire();
    this._onDidChangeSelection.fire();
  }

  getTreeItem(element: McpFileTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: McpFileTreeItem): Promise<McpFileTreeItem[]> {
    if (!element) {
      // Root level
      return Promise.resolve(
        this.rootNodes.map(
          node =>
            new McpFileTreeItem(
              node,
              node.children && node.children.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
            )
        )
      );
    } else if (element.node.children) {
      // Return children
      return Promise.resolve(
        element.node.children.map(
          node =>
            new McpFileTreeItem(
              node,
              node.children && node.children.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
            )
        )
      );
    }
    return Promise.resolve([]);
  }

  /**
   * Handles checkbox state changes when users click checkboxes
   */
  handleCheckboxChange(event: vscode.TreeCheckboxChangeEvent<McpFileTreeItem>): void {
    for (const [item, checkboxState] of event.items) {
      const isChecked = checkboxState === vscode.TreeItemCheckboxState.Checked;

      if (item.node.type === 'file' && item.node.fileItem) {
        // Handle file checkbox
        const fileItem = this.fileItems.find(f => f.uri.fsPath === item.node.fileItem!.uri.fsPath);
        if (fileItem) {
          fileItem.selected = isChecked;
        }
      } else if (item.node.type === 'folder') {
        // Handle folder checkbox - select/deselect all files in folder
        this.toggleFolderFiles(item.node, isChecked);
      }
    }

    // Refresh the tree to update UI
    this.refresh();
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
      const currentPathSegments: string[] = [];

      // Create intermediate folders
      for (let i = 0; i < relativePathParts.length - 1; i++) {
        const folderName = relativePathParts[i];
        currentPathSegments.push(folderName);
        const folderPathKey = currentPathSegments.join(path.sep);

        if (!folderMap.has(folderPathKey)) {
          const folderNode: ExplorerNode = {
            type: 'folder',
            label: folderName,
            uri: vscode.Uri.joinPath(rootFolder.uri, folderPathKey),
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
        fileItem,
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
    try {
      const refreshedFiles = await this.fileScanner.refreshFiles(this.fileItems);
      this.fileItems = refreshedFiles;
      this.refresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error refreshing files:', error);

      // Show user-friendly error with recovery option
      const retryAction = 'Retry Refresh';
      const selection = await vscode.window.showErrorMessage(
        `❌ Failed to refresh file list: ${errorMessage}`,
        retryAction
      );

      if (selection === retryAction) {
        // Retry after a short delay
        setTimeout(() => this.refreshFiles(), 1000);
      }
    }
  }

  toggleFileSelection(item: McpFileTreeItem): void {
    if (item.node.type === 'file' && item.node.fileItem) {
      const fileItem = this.fileItems.find(f => f.uri.fsPath === item.node.fileItem!.uri.fsPath);
      if (fileItem) {
        fileItem.selected = !fileItem.selected;
        this.refresh();
      }
    }
  }

  toggleFolderSelection(item: McpFileTreeItem): void {
    if (item.node.type === 'folder') {
      const totalFiles = this.countFilesInNode(item.node);
      const selectedFiles = this.countSelectedFilesInNode(item.node);

      const shouldSelect = selectedFiles < totalFiles;

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

  public toggleFolderFiles(folder: ExplorerNode, select: boolean): void {
    if (folder.children) {
      for (const child of folder.children) {
        if (child.type === 'file' && child.fileItem) {
          const mainFileItem = this.fileItems.find(
            fi => fi.uri.fsPath === child.fileItem!.uri.fsPath
          );
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
    this.fileItems.forEach(item => (item.selected = true));
    this.refresh();
  }

  deselectAll(): void {
    this.fileItems.forEach(item => (item.selected = false));
    this.refresh();
  }

  /**
   * Synchronizes tree view selection state with underlying file data
   */
  syncSelectionState(): void {
    // Force refresh to ensure tree view reflects current file selection state
    this.refresh();
  }

  /**
   * Updates file selection and ensures tree view stays synchronized
   */
  updateFileSelection(uri: vscode.Uri, selected: boolean): boolean {
    const fileItem = this.fileItems.find(f => f.uri.fsPath === uri.fsPath);
    if (fileItem) {
      fileItem.selected = selected;
      this.refresh();
      return true;
    }
    return false;
  }

  getSelectedFiles(): FileItem[] {
    return this.fileItems.filter(item => item.selected);
  }

  getFileItems(): FileItem[] {
    return this.fileItems;
  }

  /**
   * Get selection statistics for UI display
   */
  getSelectionStats(): {
    selectedCount: number;
    totalCount: number;
    selectedSizeBytes: number;
    totalSizeBytes: number;
    } {
    const selectedFiles = this.getSelectedFiles();
    const selectedSizeBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSizeBytes = this.fileItems.reduce((sum, file) => sum + file.size, 0);

    return {
      selectedCount: selectedFiles.length,
      totalCount: this.fileItems.length,
      selectedSizeBytes,
      totalSizeBytes
    };
  }

  /**
   * Check if any files are selected
   */
  hasSelectedFiles(): boolean {
    return this.fileItems.some(item => item.selected);
  }

  setFiles(files: FileItem[]): void {
    this.fileItems = files;
    this.refresh();
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
