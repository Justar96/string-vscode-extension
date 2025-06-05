import { ChunkInfo, ChunkValidationResult } from './types';
import { getLanguageFromPath } from './utils';
import * as crypto from 'crypto';

export class ContentChunker {

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
   * Helper function to convert generator to array
   */
  chunk(text: string, max: number = 1000, filePath: string = ''): ChunkInfo[] {
    return Array.from(this.createChunks(text, max, filePath));
  }
}
