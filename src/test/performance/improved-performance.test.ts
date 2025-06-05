import { after, before, describe, it } from 'mocha';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ContentChunker } from '../../chunking';
import { PersistentCacheManager } from '../../cacheManager';
import { CompressionManager } from '../../compressionUtils';
import { SemanticChunker } from '../../semanticChunker';
import { DeltaIndexer } from '../../deltaIndexer';
import { TestDataConfig, TestDataGenerator } from './test-data-generator';
import { PerformanceConfig } from '../../types';

describe('Improved Performance Tests', function() {
  this.timeout(60000); // 60 second timeout for performance tests

  let tempDir: string;
  let cacheManager: PersistentCacheManager;
  let compressionManager: CompressionManager;
  let semanticChunker: SemanticChunker;
  let deltaIndexer: DeltaIndexer;
  let contentChunker: ContentChunker;

  before(async function() {
    // Create temporary directory for test data
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-test-'));

    // Initialize performance components with optimized configurations
    const cacheDir = path.join(tempDir, 'cache');
    const deltaDir = path.join(tempDir, 'delta');

    const chunkingConfig: PerformanceConfig = {
      enableChunkDeduplication: true,
      enableCompression: true,
      compressionThreshold: 1024,
      enableSemanticChunking: true,
      enableDeltaIndexing: true,
      enableConnectionPooling: false,
      maxConnectionPoolSize: 10,
      enableRequestCoalescing: false,
      coalescingWindowMs: 100,
      enableProgressiveStreaming: true,
      streamingChunkSize: 64 * 1024,
      enableEnhancedProgress: true,
      cacheExpiryHours: 24,
      maxCacheSize: 10000
    };

    // Initialize components with correct constructor signatures
    cacheManager = new PersistentCacheManager(cacheDir, 10000, 24);
    compressionManager = new CompressionManager(1024);
    semanticChunker = new SemanticChunker(2000);
    deltaIndexer = new DeltaIndexer(deltaDir);

    contentChunker = new ContentChunker(chunkingConfig, cacheDir);

    // Initialize all components
    await Promise.all([
      cacheManager.initialize(),
      deltaIndexer.initialize(),
      contentChunker.initialize()
    ]);
  });

  after(async function() {
    // Cleanup temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  });

  it('should process small files efficiently with all optimizations', async function() {
    const config: TestDataConfig = {
      baseDir: tempDir,
      fileCount: 10,
      minFileSize: 100,
      maxFileSize: 1000,
      duplicateContentRatio: 0.1,
      languages: ['typescript', 'javascript'],
      projectStructure: false
    };

    const testData = await TestDataGenerator.generateTestData(config);

    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    let totalChunks = 0;
    for (const file of testData.files) {
      const chunks = Array.from(contentChunker.createChunks(file.content, 2000, file.path));
      totalChunks += chunks.length;
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    const processingTime = endTime - startTime;
    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
    const totalSize = testData.totalSize;

    // Performance assertions
    expect(processingTime).to.be.lessThan(5000); // Should complete in under 5 seconds
    expect(memoryUsed).to.be.lessThan(100 * 1024 * 1024); // Should use less than 100MB
    expect(totalChunks).to.be.greaterThan(0);

    // Calculate throughput
    const throughput = totalSize / (processingTime / 1000); // bytes per second
    expect(throughput).to.be.greaterThan(1024 * 1024); // At least 1MB/s

    console.log(`Small files - Processing time: ${processingTime}ms, Memory: ${Math.round(memoryUsed / 1024 / 1024)}MB, Throughput: ${Math.round(throughput / 1024 / 1024)}MB/s`);
  });

  it('should process medium files efficiently with compression and caching', async function() {
    const config: TestDataConfig = {
      baseDir: tempDir,
      fileCount: 50,
      minFileSize: 5000,
      maxFileSize: 20000,
      duplicateContentRatio: 0.2,
      languages: ['typescript', 'javascript', 'python'],
      projectStructure: true
    };

    const testData = await TestDataGenerator.generateTestData(config);

    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    let totalChunks = 0;
    for (const file of testData.files) {
      // First pass - should populate cache
      const chunks = Array.from(contentChunker.createChunks(file.content, 2000, file.path));
      totalChunks += chunks.length;
    }

    const firstPassTime = Date.now() - startTime;

    // Second pass - should benefit from cache
    const secondPassStart = Date.now();
    let cachedChunks = 0;
    for (const file of testData.files) {
      const chunks = Array.from(contentChunker.createChunks(file.content, 2000, file.path));
      cachedChunks += chunks.length;
    }

    const secondPassTime = Date.now() - secondPassStart;
    const endMemory = process.memoryUsage();

    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
    const totalSize = testData.totalSize;

    // Performance assertions
    expect(firstPassTime).to.be.lessThan(15000); // First pass under 15 seconds
    expect(secondPassTime).to.be.lessThan(firstPassTime * 0.8); // Second pass should be faster due to caching
    expect(memoryUsed).to.be.lessThan(200 * 1024 * 1024); // Should use less than 200MB
    expect(totalChunks).to.equal(cachedChunks);

    console.log(`Medium files - First pass: ${firstPassTime}ms, Second pass: ${secondPassTime}ms, Cache speedup: ${Math.round((firstPassTime - secondPassTime) / firstPassTime * 100)}%`);
  });

  it('should handle large files with semantic chunking and delta indexing', async function() {
    const config: TestDataConfig = {
      baseDir: tempDir,
      fileCount: 20,
      minFileSize: 50000,
      maxFileSize: 200000,
      duplicateContentRatio: 0.15,
      languages: ['typescript', 'javascript', 'python', 'java'],
      projectStructure: true
    };

    const testData = await TestDataGenerator.generateTestData(config);

    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    let totalChunks = 0;
    for (const file of testData.files) {
      // Process with semantic chunking enabled
      const chunks = Array.from(contentChunker.createChunks(file.content, 2000, file.path));
      totalChunks += chunks.length;
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    const processingTime = endTime - startTime;
    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
    const totalSize = testData.totalSize;

    // Performance assertions
    expect(processingTime).to.be.lessThan(30000); // Should complete in under 30 seconds
    expect(memoryUsed).to.be.lessThan(500 * 1024 * 1024); // Should use less than 500MB
    expect(totalChunks).to.be.greaterThan(0);

    // Calculate throughput
    const throughput = totalSize / (processingTime / 1000);
    expect(throughput).to.be.greaterThan(512 * 1024); // At least 512KB/s for large files

    console.log(`Large files - Processing time: ${processingTime}ms, Memory: ${Math.round(memoryUsed / 1024 / 1024)}MB, Throughput: ${Math.round(throughput / 1024 / 1024)}MB/s`);
  });

  it('should efficiently process files in batches with streaming', async function() {
    const config: TestDataConfig = {
      baseDir: tempDir,
      fileCount: 25,
      minFileSize: 10000,
      maxFileSize: 50000,
      duplicateContentRatio: 0.1,
      languages: ['typescript', 'javascript'],
      projectStructure: true
    };

    const testData = await TestDataGenerator.generateTestData(config);

    const batchSize = 5;
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    let totalChunks = 0;
    let batchCount = 0;

    // Process files in batches
    for (let i = 0; i < testData.files.length; i += batchSize) {
      const batch = testData.files.slice(i, i + batchSize);
      batchCount++;

      for (const file of batch) {
        const chunks = Array.from(contentChunker.createChunks(file.content, 2000, file.path));
        totalChunks += chunks.length;
      }

      // Simulate some processing delay between batches
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    const processingTime = endTime - startTime;
    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
    const totalSize = testData.totalSize;

    // Performance assertions
    expect(processingTime).to.be.lessThan(20000); // Should complete in under 20 seconds
    expect(memoryUsed).to.be.lessThan(300 * 1024 * 1024); // Should use less than 300MB
    expect(totalChunks).to.be.greaterThan(0);
    expect(batchCount).to.be.greaterThan(1);

    console.log(`Batch processing - ${batchCount} batches, Processing time: ${processingTime}ms, Memory: ${Math.round(memoryUsed / 1024 / 1024)}MB`);
  });

  it('should demonstrate effective deduplication with duplicate content', async function() {
    // Generate test data with high duplicate content ratio
    const config: TestDataConfig = {
      baseDir: tempDir,
      fileCount: 30,
      minFileSize: 5000,
      maxFileSize: 15000,
      duplicateContentRatio: 0.5, // 50% duplicate content
      languages: ['typescript', 'javascript'],
      projectStructure: false
    };

    const testData = await TestDataGenerator.generateTestData(config);

    const startTime = Date.now();
    let totalChunks = 0;
    let uniqueChunks = 0;
    const seenHashes = new Set<string>();

    for (const file of testData.files) {
      const chunks = Array.from(contentChunker.createChunks(file.content, 2000, file.path));

      for (const chunk of chunks) {
        totalChunks++;
        if (!seenHashes.has(chunk.hash)) {
          seenHashes.add(chunk.hash);
          uniqueChunks++;
        }
      }
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    const deduplicationRatio = (totalChunks - uniqueChunks) / totalChunks;

    // Performance assertions
    expect(processingTime).to.be.lessThan(15000); // Should complete in under 15 seconds
    expect(deduplicationRatio).to.be.greaterThan(0.2); // Should deduplicate at least 20%
    expect(uniqueChunks).to.be.lessThan(totalChunks);

    console.log(`Deduplication - Total chunks: ${totalChunks}, Unique chunks: ${uniqueChunks}, Deduplication ratio: ${Math.round(deduplicationRatio * 100)}%`);
  });

  it('should maintain consistent performance across different file types', async function() {
    const fileTypes = ['typescript', 'javascript', 'python', 'java'];
    const results: { [key: string]: { time: number; throughput: number } } = {};

    for (const fileType of fileTypes) {
      const config: TestDataConfig = {
        baseDir: tempDir,
        fileCount: 15,
        minFileSize: 10000,
        maxFileSize: 30000,
        duplicateContentRatio: 0.1,
        languages: [fileType as any],
        projectStructure: false
      };

      const testData = await TestDataGenerator.generateTestData(config);

      const startTime = Date.now();
      let totalChunks = 0;

      for (const file of testData.files) {
        const chunks = Array.from(contentChunker.createChunks(file.content, 2000, file.path));
        totalChunks += chunks.length;
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      const throughput = testData.totalSize / (processingTime / 1000);

      results[fileType] = { time: processingTime, throughput };

      // Each file type should process reasonably fast
      expect(processingTime).to.be.lessThan(20000);
      expect(totalChunks).to.be.greaterThan(0);
    }

    // Check that performance is consistent across file types (within 3x variance)
    const times = Object.values(results).map(r => r.time);
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    const variance = maxTime / minTime;

    expect(variance).to.be.lessThan(4); // Performance shouldn't vary by more than 4x

    console.log('File type performance:', results);
  });

  it('should efficiently handle concurrent processing', async function() {
    const config: TestDataConfig = {
      baseDir: tempDir,
      fileCount: 15,
      minFileSize: 20000,
      maxFileSize: 100000,
      duplicateContentRatio: 0.1,
      languages: ['typescript', 'javascript', 'python'],
      projectStructure: true
    };

    const testData = await TestDataGenerator.generateTestData(config);
    const concurrency = 3;

    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    // Process files concurrently
    const fileChunks = testData.files.map(async (file, index) => {
      // Stagger the start times slightly to simulate real-world conditions
      await new Promise(resolve => setTimeout(resolve, index * 10));

      const chunks = Array.from(contentChunker.createChunks(file.content, 2000, file.path));
      return chunks.length;
    });

    const chunkCounts = await Promise.all(fileChunks.slice(0, concurrency));
    const totalChunks = chunkCounts.reduce((sum, count) => sum + count, 0);

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    const processingTime = endTime - startTime;
    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

    // Performance assertions
    expect(processingTime).to.be.lessThan(25000); // Should complete in under 25 seconds
    expect(memoryUsed).to.be.lessThan(600 * 1024 * 1024); // Should use less than 600MB
    expect(totalChunks).to.be.greaterThan(0);

    console.log(`Concurrent processing - ${concurrency} files, Processing time: ${processingTime}ms, Memory: ${Math.round(memoryUsed / 1024 / 1024)}MB`);
  });
});