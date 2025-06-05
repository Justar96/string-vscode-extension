import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

// Mock interfaces matching the extension
interface FileItem {
  uri: vscode.Uri;
  relativePath: string;
  selected: boolean;
  language: string;
  size: number;
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

// Mock TreeItem implementation for testing
class MockTreeItem {
  public checkboxState: vscode.TreeItemCheckboxState = vscode.TreeItemCheckboxState.Unchecked;
  public description?: string;
  public contextValue?: string;

  constructor(
    public readonly node: ExplorerNode,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    if (node.type === 'file' && node.fileItem) {
      this.checkboxState = node.fileItem.selected 
        ? vscode.TreeItemCheckboxState.Checked 
        : vscode.TreeItemCheckboxState.Unchecked;
      this.contextValue = "mcpFile";
    } else if (node.type === 'folder') {
      const fileCount = this.countFilesInFolder(node);
      const selectedCount = this.countSelectedFilesInFolder(node);
      
      if (selectedCount === 0) {
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
      } else if (selectedCount === fileCount) {
        this.checkboxState = vscode.TreeItemCheckboxState.Checked;
      } else {
        this.checkboxState = vscode.TreeItemCheckboxState.Checked;
      }
      
      this.description = `${selectedCount}/${fileCount} files`;
      this.contextValue = "mcpFolder";
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

// Mock TreeDataProvider implementation for testing
class MockTreeDataProvider {
  private fileItems: FileItem[] = [];
  private rootNodes: ExplorerNode[] = [];

  constructor(initialFiles: FileItem[] = []) {
    this.fileItems = [...initialFiles];
    this.buildFileTree();
  }

  setFileItems(files: FileItem[]): void {
    this.fileItems = [...files];
    this.buildFileTree();
  }

  getFileItems(): FileItem[] {
    return [...this.fileItems];
  }

  getSelectedFiles(): FileItem[] {
    return this.fileItems.filter(item => item.selected);
  }

  selectAll(): void {
    this.fileItems.forEach(item => item.selected = true);
    this.buildFileTree();
  }

  deselectAll(): void {
    this.fileItems.forEach(item => item.selected = false);
    this.buildFileTree();
  }

  toggleFileSelection(relativePath: string): void {
    const fileItem = this.fileItems.find(f => f.relativePath === relativePath);
    if (fileItem) {
      fileItem.selected = !fileItem.selected;
      this.buildFileTree();
    }
  }

  toggleFolderSelection(folderPath: string): void {
    const folderNode = this.findFolderNode(folderPath);
    if (folderNode) {
      const totalFiles = this.countFilesInNode(folderNode);
      const selectedFiles = this.countSelectedFilesInNode(folderNode);
      
      const shouldSelect = selectedFiles < totalFiles;
      this.toggleFolderFiles(folderNode, shouldSelect);
      this.buildFileTree();
    }
  }

  private findFolderNode(folderPath: string): ExplorerNode | undefined {
    const findInNodes = (nodes: ExplorerNode[]): ExplorerNode | undefined => {
      for (const node of nodes) {
        if (node.type === 'folder' && node.relativePath === folderPath) {
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

  private buildFileTree(): void {
    if (this.fileItems.length === 0) {
      this.rootNodes = [];
      return;
    }

    const folderMap = new Map<string, ExplorerNode>();
    
    // Create a virtual root for all files
    const rootNode: ExplorerNode = {
      type: 'folder',
      label: 'root',
      uri: vscode.Uri.file('/workspace'),
      relativePath: '',
      children: []
    };
    folderMap.set('', rootNode);

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
            uri: vscode.Uri.file(path.join('/workspace', folderPathKey)),
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

  getRootNodes(): ExplorerNode[] {
    return [...this.rootNodes];
  }

  findNodeByPath(relativePath: string): ExplorerNode | undefined {
    const findInNodes = (nodes: ExplorerNode[]): ExplorerNode | undefined => {
      for (const node of nodes) {
        if (node.relativePath === relativePath) {
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

// Helper function to create mock file items
function createMockFileItems(): FileItem[] {
  return [
    {
      uri: vscode.Uri.file('/workspace/src/index.js'),
      relativePath: 'src/index.js',
      selected: true,
      language: 'JavaScript',
      size: 1024
    },
    {
      uri: vscode.Uri.file('/workspace/src/components/Header.tsx'),
      relativePath: 'src/components/Header.tsx',
      selected: true,
      language: 'TypeScript React',
      size: 2048
    },
    {
      uri: vscode.Uri.file('/workspace/src/components/Footer.tsx'),
      relativePath: 'src/components/Footer.tsx',
      selected: false,
      language: 'TypeScript React',
      size: 1536
    },
    {
      uri: vscode.Uri.file('/workspace/src/utils/helpers.ts'),
      relativePath: 'src/utils/helpers.ts',
      selected: true,
      language: 'TypeScript',
      size: 512
    },
    {
      uri: vscode.Uri.file('/workspace/tests/index.test.js'),
      relativePath: 'tests/index.test.js',
      selected: false,
      language: 'JavaScript',
      size: 3072
    },
    {
      uri: vscode.Uri.file('/workspace/README.md'),
      relativePath: 'README.md',
      selected: false,
      language: 'Markdown',
      size: 256
    }
  ];
}

suite('Tree Data Provider Tests', () => {

  suite('Basic Tree Construction', () => {
    test('should build tree structure from file list', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);
      const rootNodes = provider.getRootNodes();

      assert.ok(rootNodes.length > 0, 'Should have root nodes');
      
      // Should have src, tests folders and README.md file at root
      const srcNode = rootNodes.find(n => n.label === 'src');
      const testsNode = rootNodes.find(n => n.label === 'tests');
      const readmeNode = rootNodes.find(n => n.label === 'README.md');

      assert.ok(srcNode, 'Should have src folder');
      assert.ok(testsNode, 'Should have tests folder');
      assert.ok(readmeNode, 'Should have README.md file');

      assert.strictEqual(srcNode!.type, 'folder', 'src should be a folder');
      assert.strictEqual(readmeNode!.type, 'file', 'README.md should be a file');
    });

    test('should sort folders before files', () => {
      const mockFiles = [
        {
          uri: vscode.Uri.file('/workspace/file1.js'),
          relativePath: 'file1.js',
          selected: true,
          language: 'JavaScript',
          size: 100
        },
        {
          uri: vscode.Uri.file('/workspace/folder/file2.js'),
          relativePath: 'folder/file2.js',
          selected: true,
          language: 'JavaScript',
          size: 100
        }
      ];

      const provider = new MockTreeDataProvider(mockFiles);
      const rootNodes = provider.getRootNodes();

      assert.strictEqual(rootNodes.length, 2, 'Should have 2 root nodes');
      assert.strictEqual(rootNodes[0].type, 'folder', 'First node should be folder');
      assert.strictEqual(rootNodes[1].type, 'file', 'Second node should be file');
    });

    test('should handle nested folder structures', () => {
      const mockFiles = [
        {
          uri: vscode.Uri.file('/workspace/src/components/ui/Button.tsx'),
          relativePath: 'src/components/ui/Button.tsx',
          selected: true,
          language: 'TypeScript React',
          size: 1024
        }
      ];

      const provider = new MockTreeDataProvider(mockFiles);
      const rootNodes = provider.getRootNodes();

      const srcNode = rootNodes.find(n => n.label === 'src');
      assert.ok(srcNode, 'Should have src folder');

      const componentsNode = srcNode!.children?.find(n => n.label === 'components');
      assert.ok(componentsNode, 'Should have components folder');

      const uiNode = componentsNode!.children?.find(n => n.label === 'ui');
      assert.ok(uiNode, 'Should have ui folder');

      const buttonNode = uiNode!.children?.find(n => n.label === 'Button.tsx');
      assert.ok(buttonNode, 'Should have Button.tsx file');
      assert.strictEqual(buttonNode!.type, 'file', 'Button.tsx should be a file');
    });

    test('should handle empty file list', () => {
      const provider = new MockTreeDataProvider([]);
      const rootNodes = provider.getRootNodes();

      assert.strictEqual(rootNodes.length, 0, 'Empty file list should produce no root nodes');
    });
  });

  suite('File Selection Management', () => {
    test('should track file selection state', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);

      const selectedFiles = provider.getSelectedFiles();
      const selectedCount = selectedFiles.length;

      // Count expected selected files from mock data
      const expectedCount = mockFiles.filter(f => f.selected).length;
      assert.strictEqual(selectedCount, expectedCount, 'Should track correct number of selected files');
    });

    test('should toggle individual file selection', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);

      const initialSelected = provider.getSelectedFiles().length;
      
      // Toggle a file that's currently selected
      provider.toggleFileSelection('src/index.js');
      
      const afterToggle = provider.getSelectedFiles().length;
      assert.strictEqual(afterToggle, initialSelected - 1, 'Should decrease selection count');

      // Toggle it back
      provider.toggleFileSelection('src/index.js');
      
      const afterToggleBack = provider.getSelectedFiles().length;
      assert.strictEqual(afterToggleBack, initialSelected, 'Should restore original selection count');
    });

    test('should select all files', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);

      provider.selectAll();
      
      const selectedFiles = provider.getSelectedFiles();
      assert.strictEqual(selectedFiles.length, mockFiles.length, 'Should select all files');
      
      // Verify all files are marked as selected
      const allFiles = provider.getFileItems();
      const allSelected = allFiles.every(f => f.selected);
      assert.ok(allSelected, 'All files should be marked as selected');
    });

    test('should deselect all files', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);

      provider.deselectAll();
      
      const selectedFiles = provider.getSelectedFiles();
      assert.strictEqual(selectedFiles.length, 0, 'Should deselect all files');
      
      // Verify no files are marked as selected
      const allFiles = provider.getFileItems();
      const noneSelected = allFiles.every(f => !f.selected);
      assert.ok(noneSelected, 'No files should be marked as selected');
    });
  });

  suite('Folder Operations', () => {
    test('should toggle folder selection', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);

      // Count files in src folder initially
      const srcFiles = mockFiles.filter(f => f.relativePath.startsWith('src/'));
      const initialSelectedInSrc = srcFiles.filter(f => f.selected).length;

      // Toggle src folder
      provider.toggleFolderSelection('src');

      const afterToggle = provider.getSelectedFiles().filter(f => f.relativePath.startsWith('src/')).length;
      
      // Should either select all or deselect all files in src folder
      assert.ok(
        afterToggle === 0 || afterToggle === srcFiles.length,
        'Folder toggle should select all or deselect all files in folder'
      );
    });

    test('should handle nested folder selection', () => {
      const mockFiles = [
        {
          uri: vscode.Uri.file('/workspace/src/components/Header.tsx'),
          relativePath: 'src/components/Header.tsx',
          selected: false,
          language: 'TypeScript React',
          size: 1024
        },
        {
          uri: vscode.Uri.file('/workspace/src/components/Footer.tsx'),
          relativePath: 'src/components/Footer.tsx',
          selected: false,
          language: 'TypeScript React',
          size: 1024
        },
        {
          uri: vscode.Uri.file('/workspace/src/utils/helper.ts'),
          relativePath: 'src/utils/helper.ts',
          selected: false,
          language: 'TypeScript',
          size: 512
        }
      ];

      const provider = new MockTreeDataProvider(mockFiles);

      // Toggle components folder
      provider.toggleFolderSelection('src/components');

      const selectedFiles = provider.getSelectedFiles();
      const selectedInComponents = selectedFiles.filter(f => f.relativePath.startsWith('src/components/')).length;
      const selectedInUtils = selectedFiles.filter(f => f.relativePath.startsWith('src/utils/')).length;

      assert.strictEqual(selectedInComponents, 2, 'Should select both files in components folder');
      assert.strictEqual(selectedInUtils, 0, 'Should not affect files in utils folder');
    });
  });

  suite('Tree Item Creation', () => {
    test('should create tree items with correct checkbox states', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);
      const rootNodes = provider.getRootNodes();

      const srcNode = rootNodes.find(n => n.label === 'src')!;
      const treeItem = new MockTreeItem(srcNode, vscode.TreeItemCollapsibleState.Collapsed);

      assert.ok(treeItem.description, 'Folder tree item should have description');
      assert.ok(treeItem.description!.includes('/'), 'Description should show file count ratio');
      assert.strictEqual(treeItem.contextValue, 'mcpFolder', 'Folder should have correct context value');
    });

    test('should show correct file counts in folder descriptions', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);
      const rootNodes = provider.getRootNodes();

      const srcNode = rootNodes.find(n => n.label === 'src')!;
      const treeItem = new MockTreeItem(srcNode);

      // Count files in src folder
      const srcFiles = mockFiles.filter(f => f.relativePath.startsWith('src/'));
      const selectedSrcFiles = srcFiles.filter(f => f.selected);

      const expectedDescription = `${selectedSrcFiles.length}/${srcFiles.length} files`;
      assert.strictEqual(treeItem.description, expectedDescription, 'Should show correct file count');
    });

    test('should handle file tree items correctly', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);
      
      const readmeFile = mockFiles.find(f => f.relativePath === 'README.md')!;
      const fileNode: ExplorerNode = {
        type: 'file',
        label: 'README.md',
        uri: readmeFile.uri,
        relativePath: 'README.md',
        fileItem: readmeFile
      };

      const treeItem = new MockTreeItem(fileNode);

      assert.strictEqual(treeItem.contextValue, 'mcpFile', 'File should have correct context value');
      assert.strictEqual(
        treeItem.checkboxState, 
        readmeFile.selected ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked,
        'File checkbox state should match selection'
      );
    });
  });

  suite('Node Finding and Navigation', () => {
    test('should find nodes by relative path', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);

      const srcNode = provider.findNodeByPath('src');
      assert.ok(srcNode, 'Should find src folder');
      assert.strictEqual(srcNode!.type, 'folder', 'Found node should be a folder');

      const indexFile = provider.findNodeByPath('src/index.js');
      assert.ok(indexFile, 'Should find index.js file');
      assert.strictEqual(indexFile!.type, 'file', 'Found node should be a file');

      const nonExistent = provider.findNodeByPath('non/existent/path');
      assert.strictEqual(nonExistent, undefined, 'Should return undefined for non-existent path');
    });

    test('should handle path separators correctly', () => {
      const mockFiles = [
        {
          uri: vscode.Uri.file('/workspace/folder/subfolder/file.js'),
          relativePath: 'folder/subfolder/file.js',
          selected: true,
          language: 'JavaScript',
          size: 100
        }
      ];

      const provider = new MockTreeDataProvider(mockFiles);

      const folderNode = provider.findNodeByPath('folder');
      const subfolderNode = provider.findNodeByPath('folder/subfolder');
      const fileNode = provider.findNodeByPath('folder/subfolder/file.js');

      assert.ok(folderNode, 'Should find folder');
      assert.ok(subfolderNode, 'Should find subfolder');
      assert.ok(fileNode, 'Should find file');

      assert.strictEqual(folderNode!.type, 'folder', 'Folder should be correct type');
      assert.strictEqual(subfolderNode!.type, 'folder', 'Subfolder should be correct type');
      assert.strictEqual(fileNode!.type, 'file', 'File should be correct type');
    });
  });

  suite('Edge Cases and Error Handling', () => {
    test('should handle files with special characters in names', () => {
      const mockFiles = [
        {
          uri: vscode.Uri.file('/workspace/test-file_with-special@chars.js'),
          relativePath: 'test-file_with-special@chars.js',
          selected: true,
          language: 'JavaScript',
          size: 100
        },
        {
          uri: vscode.Uri.file('/workspace/folder with spaces/file (1).js'),
          relativePath: 'folder with spaces/file (1).js',
          selected: true,
          language: 'JavaScript',
          size: 100
        }
      ];

      const provider = new MockTreeDataProvider(mockFiles);
      const rootNodes = provider.getRootNodes();

      assert.ok(rootNodes.length > 0, 'Should handle special characters in file names');
      
      const specialFile = provider.findNodeByPath('test-file_with-special@chars.js');
      const spacedFolder = provider.findNodeByPath('folder with spaces');
      
      assert.ok(specialFile, 'Should find file with special characters');
      assert.ok(spacedFolder, 'Should find folder with spaces');
    });

    test('should handle duplicate file names in different folders', () => {
      const mockFiles = [
        {
          uri: vscode.Uri.file('/workspace/src/index.js'),
          relativePath: 'src/index.js',
          selected: true,
          language: 'JavaScript',
          size: 100
        },
        {
          uri: vscode.Uri.file('/workspace/tests/index.js'),
          relativePath: 'tests/index.js',
          selected: false,
          language: 'JavaScript',
          size: 200
        }
      ];

      const provider = new MockTreeDataProvider(mockFiles);

      const srcIndex = provider.findNodeByPath('src/index.js');
      const testsIndex = provider.findNodeByPath('tests/index.js');

      assert.ok(srcIndex, 'Should find src/index.js');
      assert.ok(testsIndex, 'Should find tests/index.js');
      assert.notStrictEqual(srcIndex, testsIndex, 'Should be different nodes');
      assert.strictEqual(srcIndex!.fileItem!.size, 100, 'Should have correct size for src file');
      assert.strictEqual(testsIndex!.fileItem!.size, 200, 'Should have correct size for tests file');
    });

    test('should maintain parent-child relationships', () => {
      const mockFiles = createMockFileItems();
      const provider = new MockTreeDataProvider(mockFiles);

      const srcNode = provider.findNodeByPath('src')!;
      const componentsNode = provider.findNodeByPath('src/components')!;
      const headerFile = provider.findNodeByPath('src/components/Header.tsx')!;

      // Check parent relationships
      assert.strictEqual(componentsNode.parent, srcNode, 'Components should have src as parent');
      assert.strictEqual(headerFile.parent, componentsNode, 'Header file should have components as parent');

      // Check children relationships
      assert.ok(srcNode.children?.includes(componentsNode), 'Src should contain components in children');
      assert.ok(componentsNode.children?.includes(headerFile), 'Components should contain header file in children');
    });
  });
}); 