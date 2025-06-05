import { ChunkInfo, ChunkValidationResult, PerformanceConfig } from './types';
import { getLanguageFromPath } from './utils';
import * as crypto from 'crypto';
import { SemanticChunker } from './semanticChunker';
import { CompressionManager } from './compressionUtils';
import { PersistentCacheManager } from './cacheManager';

export class ContentChunker {
  private semanticChunker: SemanticChunker;
  private compressionManager: CompressionManager;
  private cacheManager: PersistentCacheManager | null = null;
  private performanceConfig: PerformanceConfig;

  constructor(performanceConfig: PerformanceConfig, cacheDir?: string) {
    this.performanceConfig = performanceConfig;
    this.semanticChunker = new SemanticChunker(performanceConfig.streamingChunkSize);
    this.compressionManager = new CompressionManager(performanceConfig.compressionThreshold);

    if (cacheDir && performanceConfig.enableChunkDeduplication) {
      this.cacheManager = new PersistentCacheManager(
        cacheDir,
        performanceConfig.maxCacheSize,
        performanceConfig.cacheExpiryHours
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.cacheManager) {
      await this.cacheManager.initialize();
    }
  }

  /**
   * Validates a chunk of content
   */
  validateChunk(content: string, filePath: string, index: number, configuredMaxChunkSize: number): ChunkValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const SERVER_ABSOLUTE_MAX_CHUNK_SIZE = 100000; // Example: Absolute server limit

    if (!content || content.trim().length === 0) {
      errors.push('Chunk content is empty');
    }

    if (content.length > configuredMaxChunkSize) {
      errors.push(`Chunk (length ${content.length}) exceeds configured max chunk size (${configuredMaxChunkSize})`);
    }
    if (content.length > SERVER_ABSOLUTE_MAX_CHUNK_SIZE) {
      errors.push(`Chunk (length ${content.length}) exceeds absolute server maximum size limit (${SERVER_ABSOLUTE_MAX_CHUNK_SIZE} chars)`);
    }

    if (content.includes('\uFFFD')) {
      warnings.push('Chunk contains replacement characters (likely encoding issues)');
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

  /**
   * Generates a hash for a chunk
   */
  generateChunkHash(content: string, filePath: string, index: number): string {
    return crypto.createHash('md5')
      .update(`${filePath}:${index}:${content}`)
      .digest('hex');
  }

  /**
   * Creates chunks from text content
   */
  *createChunks(text: string, maxChunkSizeChars: number, filePath: string = ''): Generator<ChunkInfo, void, unknown> {
    if (!text || text.length === 0) return;

    // Use semantic chunking if enabled
    if (this.performanceConfig.enableSemanticChunking) {
      yield* this.semanticChunker.createSemanticChunks(text, filePath);
      return;
    }

    // Fallback to line-based chunking
    yield* this.createLineBasedChunks(text, maxChunkSizeChars, filePath);
  }

  private *createLineBasedChunks(text: string, maxChunkSizeChars: number, filePath: string): Generator<ChunkInfo, void, unknown> {
    const lines = text.split('\n');
    let currentChunk = '';
    let chunkIndex = 0;

    for (const line of lines) {
      const lineWithNewline = `${line}\n`;

      if (currentChunk.length + lineWithNewline.length > maxChunkSizeChars) {
        if (currentChunk.length > 0) {
          const content = currentChunk.trimEnd();
          const validation = this.validateChunk(content, filePath, chunkIndex, maxChunkSizeChars);
          yield {
            content,
            index: chunkIndex++,
            metadata: validation.metadata,
            hash: this.generateChunkHash(content, filePath, chunkIndex - 1)
          };
          currentChunk = '';
        }

        if (lineWithNewline.length > maxChunkSizeChars) {
          for (let i = 0; i < lineWithNewline.length; i += maxChunkSizeChars) {
            const content = lineWithNewline.slice(i, i + maxChunkSizeChars);
            const validation = this.validateChunk(content, filePath, chunkIndex, maxChunkSizeChars);
            yield {
              content,
              index: chunkIndex++,
              metadata: validation.metadata,
              hash: this.generateChunkHash(content, filePath, chunkIndex - 1)
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
      const validation = this.validateChunk(content, filePath, chunkIndex, maxChunkSizeChars);
      yield {
        content,
        index: chunkIndex,
        metadata: validation.metadata,
        hash: this.generateChunkHash(content, filePath, chunkIndex)
      };
    }
  }

  /**
   * Checks if a chunk already exists in cache
   */
  async isChunkCached(hash: string): Promise<boolean> {
    if (!this.cacheManager || !this.performanceConfig.enableChunkDeduplication) {
      return false;
    }
    return await this.cacheManager.has(hash);
  }

  /**
   * Adds chunk to cache
   */
  async cacheChunk(hash: string, chunkId: string): Promise<void> {
    if (!this.cacheManager || !this.performanceConfig.enableChunkDeduplication) {
      return;
    }

    await this.cacheManager.set(hash, {
      hash,
      exists: true,
      timestamp: new Date(),
      chunkId
    });
  }

  /**
   * Compresses chunk content if beneficial
   */
  async compressChunk(content: string): Promise<{ content: string; compressed: boolean; originalSize: number; compressedSize: number }> {
    if (!this.performanceConfig.enableCompression) {
      return {
        content,
        compressed: false,
        originalSize: content.length,
        compressedSize: content.length
      };
    }

    const compressionResult = await this.compressionManager.compressIfBeneficial(content);

    if (compressionResult) {
      return {
        content: compressionResult.compressed.toString('base64'),
        compressed: true,
        originalSize: compressionResult.originalSize,
        compressedSize: compressionResult.compressedSize
      };
    }

    return {
      content,
      compressed: false,
      originalSize: content.length,
      compressedSize: content.length
    };
  }

  /**
   * Creates streaming chunks for large files
   */
  async *createStreamingChunks(
    text: string,
    maxChunkSizeChars: number,
    filePath: string,
    onProgress?: (bytesProcessed: number, totalBytes: number) => void
  ): AsyncGenerator<ChunkInfo, void, unknown> {
    if (!this.performanceConfig.enableProgressiveStreaming) {
      yield* this.createChunks(text, maxChunkSizeChars, filePath);
      return;
    }

    const totalBytes = Buffer.byteLength(text, 'utf8');
    let bytesProcessed = 0;

    for (const chunk of this.createChunks(text, maxChunkSizeChars, filePath)) {
      bytesProcessed += Buffer.byteLength(chunk.content, 'utf8');
      onProgress?.(bytesProcessed, totalBytes);
      yield chunk;

      // Add small delay for backpressure handling
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  async dispose(): Promise<void> {
    if (this.cacheManager) {
      await this.cacheManager.dispose();
    }
  }

  /**
   * Helper function to convert generator to array
   */
  chunk(text: string, max: number = 1000, filePath: string = ''): ChunkInfo[] {
    return Array.from(this.createChunks(text, max, filePath));
  }
}
