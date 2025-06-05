import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { DeltaIndexingInfo, FileItem } from './types';

export class DeltaIndexer {
  private indexFilePath: string;
  private fileIndex: Map<string, DeltaIndexingInfo> = new Map();
  private isDirty: boolean = false;

  constructor(indexDir: string) {
    this.indexFilePath = path.join(indexDir, 'delta-index.json');
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.indexFilePath), { recursive: true });
      await this.loadIndex();
    } catch (error) {
      console.warn('Failed to initialize delta indexer:', error);
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexFilePath, 'utf8');
      const indexData = JSON.parse(data);

      for (const [filePath, info] of Object.entries(indexData)) {
        const deltaInfo = info as any;
        this.fileIndex.set(filePath, {
          ...deltaInfo,
          lastModified: new Date(deltaInfo.lastModified)
        });
      }
    } catch {
      // Index file doesn't exist or is corrupted, start fresh
      this.fileIndex.clear();
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this.isDirty) return;

    try {
      const indexData: Record<string, any> = {};
      for (const [filePath, info] of this.fileIndex.entries()) {
        indexData[filePath] = {
          ...info,
          lastModified: info.lastModified.toISOString()
        };
      }

      await fs.writeFile(this.indexFilePath, JSON.stringify(indexData, null, 2));
      this.isDirty = false;
    } catch (error) {
      console.error('Failed to save delta index:', error);
    }
  }

  async getFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      throw new Error(`Failed to hash file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getFileModificationTime(filePath: string): Promise<Date> {
    try {
      const stats = await fs.stat(filePath);
      return stats.mtime;
    } catch (error) {
      throw new Error(`Failed to get modification time for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isFileModified(file: FileItem): Promise<boolean> {
    const filePath = file.uri.fsPath;
    const existingInfo = this.fileIndex.get(filePath);

    if (!existingInfo) {
      return true; // New file
    }

    try {
      const currentModTime = await this.getFileModificationTime(filePath);
      const currentHash = await this.getFileHash(filePath);

      return (
        currentModTime > existingInfo.lastModified ||
        currentHash !== existingInfo.fileHash
      );
    } catch {
      return true; // Assume modified if we can't check
    }
  }

  async updateFileInfo(file: FileItem, chunks: any[]): Promise<void> {
    const filePath = file.uri.fsPath;

    try {
      const fileHash = await this.getFileHash(filePath);
      const lastModified = await this.getFileModificationTime(filePath);

      this.fileIndex.set(filePath, {
        fileHash,
        lastModified,
        chunks,
        isModified: false
      });

      this.isDirty = true;
      setTimeout(() => this.saveIndex(), 1000); // Debounced save
    } catch (error) {
      console.error(`Failed to update file info for ${filePath}:`, error);
    }
  }

  async getModifiedFiles(files: FileItem[]): Promise<FileItem[]> {
    const modifiedFiles: FileItem[] = [];

    for (const file of files) {
      try {
        if (await this.isFileModified(file)) {
          modifiedFiles.push(file);
        }
      } catch (error) {
        console.warn(`Error checking modification status for ${file.relativePath}:`, error);
        modifiedFiles.push(file); // Include in case of error
      }
    }

    return modifiedFiles;
  }

  async removeFileInfo(filePath: string): Promise<void> {
    if (this.fileIndex.delete(filePath)) {
      this.isDirty = true;
      setTimeout(() => this.saveIndex(), 1000);
    }
  }

  async getIndexStats(): Promise<{
    totalFiles: number;
    totalChunks: number;
    lastUpdate: Date | null;
  }> {
    let totalChunks = 0;
    let lastUpdate: Date | null = null;

    for (const info of this.fileIndex.values()) {
      totalChunks += info.chunks.length;
      if (!lastUpdate || info.lastModified > lastUpdate) {
        lastUpdate = info.lastModified;
      }
    }

    return {
      totalFiles: this.fileIndex.size,
      totalChunks,
      lastUpdate
    };
  }

  async cleanup(): Promise<void> {
    // Remove entries for files that no longer exist
    const filesToRemove: string[] = [];

    for (const filePath of this.fileIndex.keys()) {
      try {
        await fs.access(filePath);
      } catch {
        filesToRemove.push(filePath);
      }
    }

    for (const filePath of filesToRemove) {
      this.fileIndex.delete(filePath);
    }

    if (filesToRemove.length > 0) {
      this.isDirty = true;
      await this.saveIndex();
    }
  }

  async dispose(): Promise<void> {
    await this.saveIndex();
  }
}
