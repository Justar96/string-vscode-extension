import * as vscode from "vscode";
import { promises as fs } from "fs";
import * as path from "path";
import { FileItem } from "./types";
import { getLanguageFromPath, createFilePattern, createExcludeGlob, getExtensionConfig } from "./utils";

export class FileScanner {
  
  /**
   * Scans the workspace for supported code files
   * @returns Array of FileItem objects
   */
  async scanWorkspace(): Promise<FileItem[]> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return [];
    }

    const config = getExtensionConfig();
    const excludeGlob = createExcludeGlob(config.excludePatterns);
    const pattern = createFilePattern(folder);
    
    const uris = await vscode.workspace.findFiles(pattern, excludeGlob);
    const fileItems: FileItem[] = [];

    for (const uri of uris) {
      try {
        const stat = await fs.stat(uri.fsPath);
        // Skip empty files or directories that might match pattern
        if (stat.isDirectory() || stat.size === 0) continue;

        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        const language = getLanguageFromPath(uri.fsPath);

        fileItems.push({
          uri,
          relativePath,
          selected: true, // Default new files to selected
          language,
          size: stat.size
        });
      } catch (error) {
        console.warn(`Skipping file ${uri.fsPath} due to error:`, error);
        continue;
      }
    }

    return fileItems;
  }

  /**
   * Refreshes existing file items with current workspace state
   * @param existingFiles Current file items to refresh
   * @returns Updated file items with preserved selection state
   */
  async refreshFiles(existingFiles: FileItem[]): Promise<FileItem[]> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return [];
    }

    const config = getExtensionConfig();
    const excludeGlob = createExcludeGlob(config.excludePatterns);
    const pattern = createFilePattern(folder);
    
    const uris = await vscode.workspace.findFiles(pattern, excludeGlob);
    const newFileItems: FileItem[] = [];

    for (const uri of uris) {
      try {
        const stat = await fs.stat(uri.fsPath);
        if (stat.isDirectory() || stat.size === 0) continue;

        const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
        const language = getLanguageFromPath(uri.fsPath);

        // Preserve selection state from existing files
        const existingItem = existingFiles.find(item => item.uri.fsPath === uri.fsPath);
        const selected = existingItem ? existingItem.selected : true;

        newFileItems.push({
          uri,
          relativePath,
          selected,
          language,
          size: stat.size
        });
      } catch (error) {
        console.warn(`Skipping file ${uri.fsPath} during refresh:`, error);
        continue;
      }
    }

    return newFileItems;
  }

  /**
   * Shows a file selection dialog for choosing files to index
   * @param files Files to present for selection
   * @returns Selected files or undefined if cancelled
   */
  async showFileSelectionDialog(files: FileItem[]): Promise<FileItem[] | undefined> {
    if (!files || files.length === 0) {
      vscode.window.showInformationMessage("No files available to select for indexing.");
      return undefined;
    }
    
    const quickPickItems = files.map(file => ({
      label: `$(file-code) ${file.relativePath}`,
      description: `${file.language}${file.size > 0 ? ` • ${this.formatFileSize(file.size)}` : ''}`,
      detail: file.uri.fsPath,
      picked: file.selected,
      fileItem: file
    }));

    const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: `Select files to index (${files.length} files found). Uncheck to exclude.`,
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selectedItems || selectedItems.length === 0) {
      vscode.window.showInformationMessage("No files selected for indexing.");
      return undefined;
    }

    return selectedItems.map(item => item.fileItem);
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
} 