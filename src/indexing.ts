import * as vscode from "vscode";
import { promises as fs } from "fs";
import * as path from "path";
import { FileItem, ChunkTransmissionResult, FileIndexingStats, ChunkInfo, VectorStoreSelectionContext } from "./types";
import { getExtensionConfig, getOrCreateUserId, anySignal } from "./utils";
import { ContentChunker } from "./chunking";

export class FileIndexer {
  private contentChunker: ContentChunker;
  private vectorStoreManager?: any; // Will be injected later

  constructor() {
    this.contentChunker = new ContentChunker();
  }

  setVectorStoreManager(manager: any): void {
    this.vectorStoreManager = manager;
  }

  private async selectVectorStoreForFile(file: FileItem): Promise<{ url: string; apiKey: string; storeId?: string }> {
    const config = getExtensionConfig();
    
    // If multi-vector store is not enabled, use traditional config
    if (!config.enableMultiVectorStore || !this.vectorStoreManager) {
      return {
        url: config.url.replace(/\/$/, ""),
        apiKey: config.apiKey
      };
    }

    // Create selection context based on file
    const selectionContext: VectorStoreSelectionContext = {
      selectedStoreId: config.defaultVectorStore,
      autoDetectBestStore: true,
      fallbackStores: [],
      targetCollection: vscode.workspace.name || 'default'
    };

    try {
      const selectedStoreId = await this.vectorStoreManager.selectBestVectorStore(selectionContext);
      
      if (selectedStoreId) {
        const connection = await this.vectorStoreManager.getConnection(selectedStoreId);
        if (connection?.isConnected) {
          return {
            url: connection.credentials.endpoint.replace(/\/$/, ""),
            apiKey: connection.credentials.credentials.apiKey || '',
            storeId: selectedStoreId
          };
        }
      }
    } catch (error) {
      console.warn('Failed to select vector store, falling back to default:', error);
    }

    // Fallback to traditional config
    return {
      url: config.url.replace(/\/$/, ""),
      apiKey: config.apiKey
    };
  }

  /**
   * Indexes multiple files with progress tracking
   */
  async indexFiles(
    files: FileItem[],
    onProgress?: (current: number, total: number, fileName: string) => void,
    onJobStart?: (jobId: string, fileName: string) => void,
    onJobComplete?: (jobId: string, success: boolean, chunksProcessed?: number, tokensGenerated?: number) => void,
    abortSignal?: AbortSignal
  ): Promise<{ successCount: number; errorCount: number }> {
    let successCount = 0;
    let errorCount = 0;
    const config = getExtensionConfig();
    const batchSize = Math.max(1, Math.min(config.batchSize, 10));
    
    for (let i = 0; i < files.length; i += batchSize) {
      if (abortSignal?.aborted) break;

      const batch = files.slice(i, Math.min(i + batchSize, files.length));
      
      const batchPromises = batch.map(async (file, index) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        onJobStart?.(jobId, file.relativePath);
        
        try {
          // Select appropriate vector store for this file
          const { url, apiKey, storeId } = await this.selectVectorStoreForFile(file);
          
          // Health check for the selected store
          await this.performHealthCheck(url, apiKey);
          
          const stats = await this.indexFile(file.uri, url, apiKey, config.maxChunkSize, abortSignal, jobId, storeId);
          const estimatedTokens = Math.round(stats.totalBytes / 4);
          
          onJobComplete?.(jobId, true, stats.successfulChunks, estimatedTokens);
          successCount++;
          
          onProgress?.(i + index + 1, files.length, file.relativePath);
          return stats;
        } catch (error) {
          onJobComplete?.(jobId, false);
          errorCount++;
          console.error(`Error indexing file ${file.relativePath}:`, error);
          return null;
        }
      });

      await Promise.allSettled(batchPromises);
      
      // Small delay between batches
      if (i + batchSize < files.length && !abortSignal?.aborted) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return { successCount, errorCount };
  }

  /**
   * Indexes a single file
   */
  private async indexFile(
    uri: vscode.Uri,
    url: string,
    apiKey: string,
    maxChunkSizeChars: number,
    abortSignal?: AbortSignal,
    jobId?: string,
    storeId?: string
  ): Promise<FileIndexingStats> {
    const startTime = Date.now();
    const stats: FileIndexingStats = {
      totalChunks: 0, successfulChunks: 0, failedChunks: 0,
      totalBytes: 0, processingTimeMs: 0, errors: []
    };

    // Read file
    let fileContent: string;
    try {
      const fileBuffer = await fs.readFile(uri.fsPath);
      fileContent = fileBuffer.toString("utf8");
      stats.totalBytes = fileBuffer.length;
    } catch (error: any) {
      stats.errors.push(`File read error: ${error.message}`);
      stats.processingTimeMs = Date.now() - startTime;
      throw new Error(`Cannot read file ${uri.fsPath}: ${error.message}`);
    }

    if (!fileContent.trim()) {
      stats.processingTimeMs = Date.now() - startTime;
      return stats;
    }

    const headers = {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath) : path.basename(uri.fsPath);

    const chunks = Array.from(this.contentChunker.createChunks(fileContent, maxChunkSizeChars, uri.fsPath));
    stats.totalChunks = chunks.length;

    const config = getExtensionConfig();
    const concurrencyLimit = config.batchSize > 3 ? 2 : 1;
    
    for (let i = 0; i < chunks.length; i += concurrencyLimit) {
      if (abortSignal?.aborted) {
        stats.errors.push("Operation cancelled");
        break; 
      }

      const chunkBatch = chunks.slice(i, Math.min(i + concurrencyLimit, chunks.length));
      const batchPromises = chunkBatch.map(async (chunkInfo) => {
        if (abortSignal?.aborted) return;

        try {
          const result = await this.sendChunkWithRetry(chunkInfo, relativePath, url, headers, abortSignal, jobId || '');
          if (result.success) {
            stats.successfulChunks++;
          } else {
            stats.failedChunks++;
            stats.errors.push(`Chunk ${chunkInfo.index}: ${result.error || 'Unknown send error'}`);
          }
        } catch (error: any) {
          if (error.name === 'AbortError' || abortSignal?.aborted) {
            return;
          }
          stats.failedChunks++;
          stats.errors.push(`Chunk ${chunkInfo.index} critical error: ${error.message}`);
        }
      });

      await Promise.allSettled(batchPromises);
      if (abortSignal?.aborted) break;

      if (i + concurrencyLimit < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    if (abortSignal?.aborted && !stats.errors.includes("Operation cancelled")) {
      stats.errors.push("Operation cancelled during chunk processing");
    }

    stats.processingTimeMs = Date.now() - startTime;
    return stats;
  }

  /**
   * Sends a chunk with retry logic
   */
  private async sendChunkWithRetry(
    chunkInfo: ChunkInfo,
    filePathRelative: string,
    url: string,
    headers: Record<string, string>,
    abortSignal?: AbortSignal,
    jobId: string = ''
  ): Promise<ChunkTransmissionResult> {
    const maxRetries = 3;
    let retryCount = 0;
    const endpoint = `${url}/index/chunk`;

    const config = getExtensionConfig();
    
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
        extension_version: "0.0.5",
        workspace_id: vscode.workspace.name || 'default',
        job_id: jobId,
        ...(config.enableWebhooks ? { 
          webhook_url: `http://localhost:${config.webhookPort}/webhook/job-complete`
        } : {})
      },
      content: chunkInfo.content,
      chunk_metadata: {
        ...chunkInfo.metadata,
        index: chunkInfo.index,
        hash: chunkInfo.hash
      }
    };

    while (retryCount <= maxRetries) {
      if (abortSignal?.aborted) {
        throw new Error("Indexing operation cancelled by user.");
      }

      const attemptStartTime = Date.now();
      try {
        const fetch = (await import("node-fetch")).default;
        const requestController = new AbortController();
        const requestTimeoutId = setTimeout(() => requestController.abort(), 30000);

        const combinedSignal = abortSignal ? anySignal(abortSignal, requestController.signal) : requestController.signal;

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
          if (response.status >= 500 && retryCount < maxRetries) {
            throw new Error(`Server error ${response.status}: ${errorText} (will retry)`);
          }
          return { success: false, error: `Server error ${response.status}: ${errorText}`, retryCount, processingTimeMs };
        }

        let responseData: any = {};
        try { 
          responseData = await response.json(); 
        } catch (e) { /* Non-JSON response is ok */ }
        
        return { success: true, chunkId: responseData.chunk_id || responseData.job_id, retryCount, processingTimeMs };

      } catch (error: any) {
        const processingTimeMs = Date.now() - attemptStartTime;
        if (abortSignal?.aborted || error.name === 'AbortError') {
          throw error;
        }

        retryCount++;
        if (retryCount > maxRetries) {
          return { success: false, error: `Failed after ${maxRetries} retries: ${error.message}`, retryCount, processingTimeMs };
        }
        
        const delay = Math.pow(2, retryCount - 1) * 1000 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return { success: false, error: "Max retries exceeded (unexpected path)", retryCount: maxRetries, processingTimeMs: 0 };
  }

  /**
   * Performs health check on the server
   */
  private async performHealthCheck(url: string, apiKey: string): Promise<void> {
    try {
      const fetch = (await import("node-fetch")).default;
      const healthCheckController = new AbortController();
      const healthTimeoutId = setTimeout(() => healthCheckController.abort(), 5000);
      
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
      throw new Error(`Cannot connect to server at ${url}. Error: ${error instanceof Error ? error.message : String(error)}. Please check configuration and server status.`);
    }
  }
} 