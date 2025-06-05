import * as assert from 'assert';

interface ChunkInfo {
  content: string;
  index: number;
  metadata: {
    lineCount: number;
    characterCount: number;
    hasCode: boolean;
    language: string;
  };
  hash: string;
}

interface ChunkValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    lineCount: number;
    characterCount: number;
    hasCode: boolean;
    language: string;
  };
}

// Helper functions (extracted from main extension for testing)
function* createChunks(text: string, maxChunkSizeChars: number, filePath: string = ''): Generator<ChunkInfo, void, unknown> {
  if (!text || text.length === 0) return;

  const lines = text.split('\n');
  let currentChunk = '';
  let chunkIndex = 0;

  for (const line of lines) {
    const lineWithNewline = line + '\n';

    if (currentChunk.length + lineWithNewline.length > maxChunkSizeChars) {
      if (currentChunk.length > 0) {
        const content = currentChunk.trimEnd();
        yield {
          content,
          index: chunkIndex++,
          metadata: {
            lineCount: content.split('\n').length,
            characterCount: content.length,
            hasCode: /^[\s]*[a-zA-Z_$][\w$]*[\s]*[=:({]/.test(content),
            language: getLanguageFromPath(filePath)
          },
          hash: generateChunkHash(content, filePath, chunkIndex - 1)
        };
        currentChunk = '';
      }

      if (lineWithNewline.length > maxChunkSizeChars) {
        for (let i = 0; i < lineWithNewline.length; i += maxChunkSizeChars) {
          const content = lineWithNewline.slice(i, i + maxChunkSizeChars);
          yield {
            content,
            index: chunkIndex++,
            metadata: {
              lineCount: content.split('\n').length,
              characterCount: content.length,
              hasCode: /^[\s]*[a-zA-Z_$][\w$]*[\s]*[=:({]/.test(content),
              language: getLanguageFromPath(filePath)
            },
            hash: generateChunkHash(content, filePath, chunkIndex - 1)
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
    yield {
      content,
      index: chunkIndex,
      metadata: {
        lineCount: content.split('\n').length,
        characterCount: content.length,
        hasCode: /^[\s]*[a-zA-Z_$][\w$]*[\s]*[=:({]/.test(content),
        language: getLanguageFromPath(filePath)
      },
      hash: generateChunkHash(content, filePath, chunkIndex)
    };
  }
}

function validateChunk(content: string, filePath: string, index: number, configuredMaxChunkSize: number): ChunkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    errors.push("Chunk content is empty");
  }

  if (content.length > configuredMaxChunkSize) {
    errors.push(`Chunk exceeds configured max chunk size (${configuredMaxChunkSize})`);
  }

  if (content.includes('\uFFFD')) {
    warnings.push("Chunk contains replacement characters (likely encoding issues)");
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

function generateChunkHash(content: string, filePath: string, index: number): string {
  // Simple hash implementation for testing
  let hash = 0;
  const str = `${filePath}:${index}:${content}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: { [key: string]: string } = {
    'py': 'Python', 'ts': 'TypeScript', 'tsx': 'TypeScript React', 'js': 'JavaScript',
    'jsx': 'JavaScript React', 'java': 'Java', 'go': 'Go', 'rs': 'Rust',
    'cpp': 'C++', 'c': 'C', 'h': 'C/C++ Header', 'hpp': 'C++ Header',
    'cs': 'C#', 'php': 'PHP', 'rb': 'Ruby'
  };
  return languageMap[ext] || ext.toUpperCase() || 'Unknown';
}

suite('Chunking Functionality Tests', () => {

  suite('Basic Chunking', () => {
    test('should create chunks within size limits', () => {
      const content = 'function test() {\n  console.log("Hello World");\n  return true;\n}';
      const chunks = Array.from(createChunks(content, 25, 'test.js'));

      assert.ok(chunks.length > 0, 'Should create at least one chunk');
      chunks.forEach((chunk, i) => {
        assert.ok(chunk.content.length <= 25, `Chunk ${i} should be within size limit`);
        assert.strictEqual(chunk.index, i, `Chunk ${i} should have correct index`);
      });
    });

    test('should handle empty input', () => {
      const chunks = Array.from(createChunks('', 100));
      assert.strictEqual(chunks.length, 0, 'Empty input should produce no chunks');
    });

    test('should handle whitespace-only input', () => {
      const chunks = Array.from(createChunks('   \n  \n   ', 100));
      // Should either produce no chunks or chunks with empty content after trimming
      if (chunks.length > 0) {
        chunks.forEach(chunk => {
          assert.ok(chunk.content.trim().length === 0, 'Whitespace-only chunks should be empty after trimming');
        });
      }
    });

    test('should preserve line structure when possible', () => {
      const content = 'line1\nline2\nline3\nline4';
      const chunks = Array.from(createChunks(content, 20));

      // Reconstruct content from chunks
      const reconstructed = chunks.map(c => c.content).join('\n');
      const originalTrimmed = content.replace(/\n+$/, '');
      const reconstructedTrimmed = reconstructed.replace(/\n+$/, '');
      
      // Should contain all original content parts
      assert.ok(reconstructedTrimmed.includes('line1'), 'Should contain line1');
      assert.ok(reconstructedTrimmed.includes('line4'), 'Should contain line4');
    });
  });

  suite('Edge Cases', () => {
    test('should handle very long single lines', () => {
      const longLine = 'a'.repeat(1000);
      const chunks = Array.from(createChunks(longLine, 100));

      assert.strictEqual(chunks.length, 10, 'Should split long line into 10 chunks');
      chunks.forEach(chunk => {
        assert.ok(chunk.content.length <= 100, 'Each chunk should be within limit');
      });

      // Reconstruct should equal original
      const reconstructed = chunks.map(c => c.content).join('');
      assert.strictEqual(reconstructed, longLine, 'Should reconstruct original line');
    });

    test('should handle mixed line lengths', () => {
      const content = [
        'short',
        'a'.repeat(500), // Very long line
        'medium length line here',
        'x'.repeat(200)  // Long line
      ].join('\n');

      const chunks = Array.from(createChunks(content, 100));
      
      assert.ok(chunks.length > 1, 'Should create multiple chunks');
      chunks.forEach(chunk => {
        assert.ok(chunk.content.length <= 100, 'Each chunk should be within limit');
      });
    });

    test('should handle unicode characters', () => {
      const content = '🚀 Unicode test: café, naïve, 中文, 🎉\n函数 测试() {\n  返回 "你好世界";\n}';
      const chunks = Array.from(createChunks(content, 50));

      assert.ok(chunks.length > 0, 'Should handle unicode content');
      chunks.forEach(chunk => {
        assert.ok(chunk.content.length <= 50, 'Unicode chunks should respect size limit');
      });

      // Check that unicode is preserved
      const reconstructed = chunks.map(c => c.content).join('\n');
      assert.ok(reconstructed.includes('🚀'), 'Should preserve emoji');
      assert.ok(reconstructed.includes('中文'), 'Should preserve Chinese characters');
    });

    test('should handle code with nested structures', () => {
      const content = `
function complexFunction() {
  if (condition) {
    for (let i = 0; i < array.length; i++) {
      if (array[i].property) {
        doSomething({
          key: value,
          nested: {
            deeper: "value"
          }
        });
      }
    }
  }
}`;
      
      const chunks = Array.from(createChunks(content, 80, 'test.js'));
      
      assert.ok(chunks.length > 0, 'Should chunk complex code');
      
      // Check that at least some chunks are identified as containing code
      const hasCodeChunks = chunks.filter(c => c.metadata.hasCode);
      assert.ok(hasCodeChunks.length > 0, 'Should identify code content');
    });
  });

  suite('Chunk Validation', () => {
    test('should validate normal chunks', () => {
      const content = 'function test() { return true; }';
      const result = validateChunk(content, 'test.js', 0, 1000);

      assert.ok(result.isValid, 'Valid chunk should pass validation');
      assert.strictEqual(result.errors.length, 0, 'Should have no errors');
      assert.ok(result.metadata.hasCode, 'Should detect code');
      assert.strictEqual(result.metadata.language, 'JavaScript', 'Should identify language');
    });

    test('should catch empty chunks', () => {
      const result = validateChunk('', 'test.js', 0, 1000);

      assert.ok(!result.isValid, 'Empty chunk should fail validation');
      assert.ok(result.errors.includes('Chunk content is empty'), 'Should detect empty content');
    });

    test('should catch oversized chunks', () => {
      const content = 'a'.repeat(2000);
      const result = validateChunk(content, 'test.js', 0, 1000);

      assert.ok(!result.isValid, 'Oversized chunk should fail validation');
      assert.ok(result.errors.some(e => e.includes('exceeds configured max')), 'Should detect size violation');
    });

    test('should warn about encoding issues', () => {
      const content = 'test\uFFFDcontent';
      const result = validateChunk(content, 'test.js', 0, 1000);

      assert.ok(result.warnings.some(w => w.includes('replacement characters')), 'Should warn about encoding issues');
    });

    test('should detect different content types', () => {
      const testCases = [
        { content: 'function test() {}', hasCode: true },
        { content: 'const x = 5;', hasCode: true },
        { content: 'import React from "react";', hasCode: true },
        { content: 'Just plain text content', hasCode: false },
        { content: '# This is a comment\n## Another comment', hasCode: false }
      ];

      testCases.forEach(({ content, hasCode }) => {
        const result = validateChunk(content, 'test.js', 0, 1000);
        assert.strictEqual(result.metadata.hasCode, hasCode, `Content "${content}" code detection failed`);
      });
    });
  });

  suite('Performance Tests', () => {
    test('should handle large files efficiently', () => {
      // Create a large file content (approximately 100KB)
      const largeContent = Array(1000).fill(
        'function test() {\n  console.log("This is a test function");\n  return true;\n}\n'
      ).join('\n');

      const startTime = Date.now();
      const chunks = Array.from(createChunks(largeContent, 1000));
      const endTime = Date.now();

      const processingTime = endTime - startTime;
      
      assert.ok(chunks.length > 0, 'Should create chunks from large content');
      assert.ok(processingTime < 1000, `Processing should be fast (${processingTime}ms), but was slow`);
      
      // Verify chunks are properly sized
      chunks.forEach(chunk => {
        assert.ok(chunk.content.length <= 1000, 'Large file chunks should respect size limit');
      });
    });

    test('should handle many small chunks efficiently', () => {
      // Create content that will result in many small chunks
      const content = Array(500).fill('x\n').join('');

      const startTime = Date.now();
      const chunks = Array.from(createChunks(content, 10)); // Very small chunks
      const endTime = Date.now();

      const processingTime = endTime - startTime;
      
      assert.ok(chunks.length > 100, 'Should create many small chunks');
      assert.ok(processingTime < 500, `Many small chunks should process efficiently (${processingTime}ms)`);
    });
  });

  suite('Hash Generation', () => {
    test('should generate consistent hashes', () => {
      const content = 'test content';
      const hash1 = generateChunkHash(content, 'test.js', 0);
      const hash2 = generateChunkHash(content, 'test.js', 0);

      assert.strictEqual(hash1, hash2, 'Same input should generate same hash');
    });

    test('should generate different hashes for different inputs', () => {
      const hash1 = generateChunkHash('content1', 'test.js', 0);
      const hash2 = generateChunkHash('content2', 'test.js', 0);
      const hash3 = generateChunkHash('content1', 'test.js', 1);
      const hash4 = generateChunkHash('content1', 'other.js', 0);

      assert.notStrictEqual(hash1, hash2, 'Different content should generate different hash');
      assert.notStrictEqual(hash1, hash3, 'Different index should generate different hash');
      assert.notStrictEqual(hash1, hash4, 'Different file should generate different hash');
    });

    test('should generate valid hex strings', () => {
      const hash = generateChunkHash('test', 'test.js', 0);
      
      assert.ok(typeof hash === 'string', 'Hash should be a string');
      assert.ok(hash.length > 0, 'Hash should not be empty');
      assert.ok(/^[0-9a-f]+$/.test(hash), 'Hash should be valid hex string');
    });
  });

  suite('Language Detection', () => {
    test('should detect languages from file extensions', () => {
      const testCases = [
        { path: 'test.py', expected: 'Python' },
        { path: 'component.tsx', expected: 'TypeScript React' },
        { path: 'script.js', expected: 'JavaScript' },
        { path: 'Main.java', expected: 'Java' },
        { path: 'program.go', expected: 'Go' },
        { path: 'lib.rs', expected: 'Rust' },
        { path: 'app.cpp', expected: 'C++' },
        { path: 'header.h', expected: 'C/C++ Header' },
        { path: 'unknown.xyz', expected: 'XYZ' }
      ];

      testCases.forEach(({ path, expected }) => {
        const language = getLanguageFromPath(path);
        assert.strictEqual(language, expected, `Language detection failed for ${path}`);
      });
    });

    test('should handle files without extensions', () => {
      const language = getLanguageFromPath('Makefile');
      assert.strictEqual(language, 'Unknown', 'Files without extension should return Unknown');
    });

    test('should handle empty file paths', () => {
      const language = getLanguageFromPath('');
      assert.strictEqual(language, 'Unknown', 'Empty path should return Unknown');
    });
  });
}); 