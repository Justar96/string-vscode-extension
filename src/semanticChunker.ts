import { ChunkInfo, SemanticBoundary } from './types';
import { getLanguageFromPath } from './utils';
import * as crypto from 'crypto';

export class SemanticChunker {
  private maxChunkSize: number;

  constructor(maxChunkSize: number = 2000) {
    this.maxChunkSize = maxChunkSize;
  }

  /**
   * Creates chunks with semantic boundaries
   */
  *createSemanticChunks(text: string, filePath: string): Generator<ChunkInfo, void, unknown> {
    if (!text || text.length === 0) return;

    const language = getLanguageFromPath(filePath);
    const boundaries = this.findSemanticBoundaries(text, language);

    if (boundaries.length === 0) {
      // Fallback to line-based chunking
      yield* this.createLineBasedChunks(text, filePath);
      return;
    }

    let chunkIndex = 0;
    let currentChunk = '';
    let currentBoundaries: SemanticBoundary[] = [];

    for (const boundary of boundaries) {
      const boundaryContent = boundary.content;

      // Check if adding this boundary would exceed chunk size
      if (currentChunk.length + boundaryContent.length > this.maxChunkSize && currentChunk.length > 0) {
        // Yield current chunk
        yield this.createChunkFromBoundaries(currentBoundaries, chunkIndex++, filePath);
        currentChunk = '';
        currentBoundaries = [];
      }

      currentChunk += boundaryContent;
      currentBoundaries.push(boundary);
    }

    // Yield remaining chunk
    if (currentBoundaries.length > 0) {
      yield this.createChunkFromBoundaries(currentBoundaries, chunkIndex, filePath);
    }
  }

  /**
   * Finds semantic boundaries in code
   */
  private findSemanticBoundaries(text: string, language: string): SemanticBoundary[] {
    const lines = text.split('\n');
    const boundaries: SemanticBoundary[] = [];

    let currentBoundary: Partial<SemanticBoundary> | null = null;
    let braceDepth = 0;
    let inMultiLineComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Handle multi-line comments
      if (this.isMultiLineCommentStart(trimmedLine, language)) {
        inMultiLineComment = true;
      }
      if (this.isMultiLineCommentEnd(trimmedLine, language)) {
        inMultiLineComment = false;
        continue;
      }

      if (inMultiLineComment) {
        continue;
      }

      // Track brace depth
      braceDepth += this.countBraces(line);

      // Detect semantic boundaries
      const boundaryType = this.detectBoundaryType(trimmedLine, language);

      if (boundaryType) {
        // Close previous boundary if exists
        if (currentBoundary && currentBoundary.startLine !== undefined) {
          currentBoundary.endLine = i - 1;
          currentBoundary.content = this.extractContent(lines, currentBoundary.startLine, currentBoundary.endLine);
          boundaries.push(currentBoundary as SemanticBoundary);
        }

        // Start new boundary
        currentBoundary = {
          type: boundaryType,
          startLine: i,
          importance: this.calculateImportance(boundaryType, trimmedLine)
        };
      }

      // Close boundary when brace depth returns to 0 (for functions/classes)
      if (currentBoundary && braceDepth === 0 && currentBoundary.type !== 'comment' && currentBoundary.type !== 'import') {
        currentBoundary.endLine = i;
        currentBoundary.content = this.extractContent(lines, currentBoundary.startLine!, currentBoundary.endLine);
        boundaries.push(currentBoundary as SemanticBoundary);
        currentBoundary = null;
      }
    }

    // Close final boundary
    if (currentBoundary && currentBoundary.startLine !== undefined) {
      currentBoundary.endLine = lines.length - 1;
      currentBoundary.content = this.extractContent(lines, currentBoundary.startLine, currentBoundary.endLine);
      boundaries.push(currentBoundary as SemanticBoundary);
    }

    return this.optimizeBoundaries(boundaries);
  }

  private detectBoundaryType(line: string, language: string): SemanticBoundary['type'] | null {
    // Import statements
    if (this.isImportStatement(line, language)) {
      return 'import';
    }

    // Comments
    if (this.isComment(line, language)) {
      return 'comment';
    }

    // Function definitions
    if (this.isFunctionDefinition(line, language)) {
      return 'function';
    }

    // Class definitions
    if (this.isClassDefinition(line, language)) {
      return 'class';
    }

    // Method definitions
    if (this.isMethodDefinition(line, language)) {
      return 'method';
    }

    // Block statements
    if (this.isBlockStatement(line, language)) {
      return 'block';
    }

    return null;
  }

  private isImportStatement(line: string, language: string): boolean {
    const patterns = {
      typescript: /^(import|export)\s+/,
      javascript: /^(import|export|require)\s+/,
      python: /^(import|from)\s+/,
      java: /^import\s+/,
      csharp: /^using\s+/,
      cpp: /^#include\s+/
    };

    const pattern = patterns[language as keyof typeof patterns] || patterns.typescript;
    return pattern.test(line);
  }

  private isComment(line: string, language: string): boolean {
    const singleLinePatterns = {
      typescript: /^\s*\/\//,
      javascript: /^\s*\/\//,
      python: /^\s*#/,
      java: /^\s*\/\//,
      csharp: /^\s*\/\//,
      cpp: /^\s*\/\//
    };

    const pattern = singleLinePatterns[language as keyof typeof singleLinePatterns] || singleLinePatterns.typescript;
    return pattern.test(line);
  }

  private isFunctionDefinition(line: string, language: string): boolean {
    const patterns = {
      typescript: /^\s*(export\s+)?(async\s+)?function\s+\w+|^\s*\w+\s*\([^)]*\)\s*[:{]/,
      javascript: /^\s*(export\s+)?(async\s+)?function\s+\w+|^\s*\w+\s*\([^)]*\)\s*[:{]/,
      python: /^\s*def\s+\w+/,
      java: /^\s*(public|private|protected)?\s*(static\s+)?\w+\s+\w+\s*\(/,
      csharp: /^\s*(public|private|protected)?\s*(static\s+)?\w+\s+\w+\s*\(/,
      cpp: /^\s*\w+\s+\w+\s*\([^)]*\)\s*{/
    };

    const pattern = patterns[language as keyof typeof patterns] || patterns.typescript;
    return pattern.test(line);
  }

  private isClassDefinition(line: string, language: string): boolean {
    const patterns = {
      typescript: /^\s*(export\s+)?(abstract\s+)?class\s+\w+/,
      javascript: /^\s*(export\s+)?class\s+\w+/,
      python: /^\s*class\s+\w+/,
      java: /^\s*(public|private|protected)?\s*(abstract\s+)?class\s+\w+/,
      csharp: /^\s*(public|private|protected)?\s*(abstract\s+)?class\s+\w+/,
      cpp: /^\s*class\s+\w+/
    };

    const pattern = patterns[language as keyof typeof patterns] || patterns.typescript;
    return pattern.test(line);
  }

  private isMethodDefinition(line: string, language: string): boolean {
    // Similar to function but within class context
    return this.isFunctionDefinition(line, language) && line.includes('(');
  }

  private isBlockStatement(line: string, language: string): boolean {
    const patterns = {
      typescript: /^\s*(if|for|while|switch|try|catch|finally)\s*\(/,
      javascript: /^\s*(if|for|while|switch|try|catch|finally)\s*\(/,
      python: /^\s*(if|for|while|try|except|finally|with)\s+/,
      java: /^\s*(if|for|while|switch|try|catch|finally)\s*\(/,
      csharp: /^\s*(if|for|while|switch|try|catch|finally)\s*\(/,
      cpp: /^\s*(if|for|while|switch|try|catch)\s*\(/
    };

    const pattern = patterns[language as keyof typeof patterns] || patterns.typescript;
    return pattern.test(line);
  }

  private isMultiLineCommentStart(line: string, language: string): boolean {
    return line.includes('/*') || (language === 'python' && line.includes('"""'));
  }

  private isMultiLineCommentEnd(line: string, language: string): boolean {
    return line.includes('*/') || (language === 'python' && line.includes('"""'));
  }

  private countBraces(line: string): number {
    let count = 0;
    for (const char of line) {
      if (char === '{') count++;
      if (char === '}') count--;
    }
    return count;
  }

  private calculateImportance(type: SemanticBoundary['type'], line: string): number {
    const baseImportance = {
      class: 10,
      function: 8,
      method: 6,
      block: 4,
      import: 2,
      comment: 1
    };

    let importance = baseImportance[type];

    // Boost importance for exported items
    if (line.includes('export')) {
      importance += 2;
    }

    // Boost importance for public methods
    if (line.includes('public')) {
      importance += 1;
    }

    return importance;
  }

  private extractContent(lines: string[], startLine: number, endLine: number): string {
    return lines.slice(startLine, endLine + 1).join('\n');
  }

  private optimizeBoundaries(boundaries: SemanticBoundary[]): SemanticBoundary[] {
    // Sort by importance and merge small adjacent boundaries
    boundaries.sort((a, b) => b.importance - a.importance);

    const optimized: SemanticBoundary[] = [];
    let currentGroup: SemanticBoundary[] = [];

    for (const boundary of boundaries) {
      if (boundary.content.length < 200 && currentGroup.length < 3) {
        currentGroup.push(boundary);
      } else {
        if (currentGroup.length > 0) {
          optimized.push(this.mergeBoundaries(currentGroup));
          currentGroup = [];
        }
        optimized.push(boundary);
      }
    }

    if (currentGroup.length > 0) {
      optimized.push(this.mergeBoundaries(currentGroup));
    }

    return optimized;
  }

  private mergeBoundaries(boundaries: SemanticBoundary[]): SemanticBoundary {
    const first = boundaries[0];
    const last = boundaries[boundaries.length - 1];

    return {
      type: 'block',
      startLine: first.startLine,
      endLine: last.endLine,
      content: boundaries.map(b => b.content).join('\n'),
      importance: Math.max(...boundaries.map(b => b.importance))
    };
  }

  private createChunkFromBoundaries(boundaries: SemanticBoundary[], index: number, filePath: string): ChunkInfo {
    const content = boundaries.map(b => b.content).join('\n');
    const hash = crypto.createHash('md5')
      .update(`${filePath}:${index}:${content}`)
      .digest('hex');

    return {
      content,
      index,
      metadata: {
        lineCount: content.split('\n').length,
        characterCount: content.length,
        hasCode: boundaries.some(b => b.type !== 'comment'),
        language: getLanguageFromPath(filePath)
      },
      hash
    };
  }

  private *createLineBasedChunks(text: string, filePath: string): Generator<ChunkInfo, void, unknown> {
    const lines = text.split('\n');
    let currentChunk = '';
    let chunkIndex = 0;

    for (const line of lines) {
      const lineWithNewline = `${line}\n`;

      if (currentChunk.length + lineWithNewline.length > this.maxChunkSize) {
        if (currentChunk.length > 0) {
          yield this.createSimpleChunk(currentChunk.trimEnd(), chunkIndex++, filePath);
          currentChunk = '';
        }
      }

      currentChunk += lineWithNewline;
    }

    if (currentChunk.length > 0) {
      yield this.createSimpleChunk(currentChunk.trimEnd(), chunkIndex, filePath);
    }
  }

  private createSimpleChunk(content: string, index: number, filePath: string): ChunkInfo {
    const hash = crypto.createHash('md5')
      .update(`${filePath}:${index}:${content}`)
      .digest('hex');

    return {
      content,
      index,
      metadata: {
        lineCount: content.split('\n').length,
        characterCount: content.length,
        hasCode: /^[\s]*[a-zA-Z_$][\w$]*[\s]*[=:({]/.test(content),
        language: getLanguageFromPath(filePath)
      },
      hash
    };
  }
}
