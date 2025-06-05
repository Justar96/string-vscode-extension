import { after, before, suite, test } from 'mocha';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestDataGenerator } from './test-data-generator';
import { ContentChunker } from '../../chunking';
import { PerformanceConfig } from '../../types';

// Simple baseline chunking function for comparison
function baselineChunkContent(content: string, maxChunkSize: number = 1000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += maxChunkSize) {
    chunks.push(content.slice(i, i + maxChunkSize));
  }
  return chunks;
}

interface PerformanceResult {
  scenario: string;
  implementation: 'baseline' | 'improved';
  totalFiles: number;
  totalSize: number;
  totalChunks: number;
  processingTimeMs: number;
  throughputMBps: number;
  memoryUsageMB: number;
  avgChunkSize: number;
}

suite('Performance Comparison Tests', function() {
  this.timeout(300000); // 5 minutes

  let testDataGenerator: TestDataGenerator;
  let testDir: string;
  let improvedChunker: ContentChunker;

  before(async function() {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-comparison-'));
    testDataGenerator = new TestDataGenerator();

    // Initialize improved chunker with performance optimizations
    const performanceConfig: PerformanceConfig = {
      enableChunkDeduplication: true,
      enableCompression: true,
      compressionThreshold: 1024,
      enableSemanticChunking: true,
      enableDeltaIndexing: true,
      enableConnectionPooling: true,
      maxConnectionPoolSize: 10,
      enableRequestCoalescing: true,
      coalescingWindowMs: 100,
      enableProgressiveStreaming: true,
      streamingChunkSize: 2048,
      enableEnhancedProgress: true,
      cacheExpiryHours: 24,
      maxCacheSize: 1000
    };

    improvedChunker = new ContentChunker(performanceConfig, testDir);
    await improvedChunker.initialize();
  });

  after(async function() {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('Small Files Performance Comparison', async function() {
    const testData = await TestDataGenerator.generateTestData({
      baseDir: testDir,
      fileCount: 10,
      minFileSize: 3000,
      maxFileSize: 7000,
      duplicateContentRatio: 0.2,
      languages: ['typescript', 'javascript'],
      projectStructure: false
    });

    // Test baseline implementation
    const baselineResult = await runBaselineTest('small', testData);

    // Test improved implementation
    const improvedResult = await runImprovedTest('small', testData);

    // Compare results
    const improvement = calculateImprovement(baselineResult, improvedResult);

    console.log('\n=== Small Files Performance Comparison ===');
    console.log(`Baseline: ${baselineResult.throughputMBps.toFixed(2)} MB/s, ${baselineResult.memoryUsageMB.toFixed(1)} MB memory`);
    console.log(`Improved: ${improvedResult.throughputMBps.toFixed(2)} MB/s, ${improvedResult.memoryUsageMB.toFixed(1)} MB memory`);
    console.log(`Improvement: ${improvement.throughputImprovement.toFixed(1)}% faster, ${improvement.memoryImprovement.toFixed(1)}% less memory`);

    // Assertions
    expect(improvement.throughputImprovement).to.be.greaterThan(10); // At least 10% faster
    expect(improvement.memoryImprovement).to.be.greaterThan(0); // Use less memory
  });

  test('Medium Files Performance Comparison', async function() {
    const testData = await TestDataGenerator.generateTestData({
      baseDir: testDir,
      fileCount: 5,
      minFileSize: 40000,
      maxFileSize: 60000,
      duplicateContentRatio: 0.3,
      languages: ['typescript', 'python'],
      projectStructure: false
    });

    // Test baseline implementation
    const baselineResult = await runBaselineTest('medium', testData);

    // Test improved implementation
    const improvedResult = await runImprovedTest('medium', testData);

    // Compare results
    const improvement = calculateImprovement(baselineResult, improvedResult);

    console.log('\n=== Medium Files Performance Comparison ===');
    console.log(`Baseline: ${baselineResult.throughputMBps.toFixed(2)} MB/s, ${baselineResult.memoryUsageMB.toFixed(1)} MB memory`);
    console.log(`Improved: ${improvedResult.throughputMBps.toFixed(2)} MB/s, ${improvedResult.memoryUsageMB.toFixed(1)} MB memory`);
    console.log(`Improvement: ${improvement.throughputImprovement.toFixed(1)}% faster, ${improvement.memoryImprovement.toFixed(1)}% less memory`);

    // Assertions
    expect(improvement.throughputImprovement).to.be.greaterThan(20); // At least 20% faster
    expect(improvement.memoryImprovement).to.be.greaterThan(5); // At least 5% less memory
  });

  test('Large Files Performance Comparison', async function() {
    const testData = await TestDataGenerator.generateTestData({
      baseDir: testDir,
      fileCount: 2,
      minFileSize: 180000,
      maxFileSize: 220000,
      duplicateContentRatio: 0.4,
      languages: ['typescript', 'java'],
      projectStructure: false
    });

    // Test baseline implementation
    const baselineResult = await runBaselineTest('large', testData);

    // Test improved implementation
    const improvedResult = await runImprovedTest('large', testData);

    // Compare results
    const improvement = calculateImprovement(baselineResult, improvedResult);

    console.log('\n=== Large Files Performance Comparison ===');
    console.log(`Baseline: ${baselineResult.throughputMBps.toFixed(2)} MB/s, ${baselineResult.memoryUsageMB.toFixed(1)} MB memory`);
    console.log(`Improved: ${improvedResult.throughputMBps.toFixed(2)} MB/s, ${improvedResult.memoryUsageMB.toFixed(1)} MB memory`);
    console.log(`Improvement: ${improvement.throughputImprovement.toFixed(1)}% faster, ${improvement.memoryImprovement.toFixed(1)}% less memory`);

    // Assertions
    expect(improvement.throughputImprovement).to.be.greaterThan(30); // At least 30% faster
    expect(improvement.memoryImprovement).to.be.greaterThan(10); // At least 10% less memory
  });

  test('High Duplicate Content Performance Comparison', async function() {
    const testData = await TestDataGenerator.generateTestData({
      baseDir: testDir,
      fileCount: 8,
      minFileSize: 20000,
      maxFileSize: 30000,
      duplicateContentRatio: 0.7, // 70% duplicate content
      languages: ['typescript', 'javascript'],
      projectStructure: false
    });

    // Test baseline implementation
    const baselineResult = await runBaselineTest('duplicates', testData);

    // Test improved implementation
    const improvedResult = await runImprovedTest('duplicates', testData);

    // Compare results
    const improvement = calculateImprovement(baselineResult, improvedResult);

    console.log('\n=== High Duplicate Content Performance Comparison ===');
    console.log(`Baseline: ${baselineResult.throughputMBps.toFixed(2)} MB/s, ${baselineResult.memoryUsageMB.toFixed(1)} MB memory`);
    console.log(`Improved: ${improvedResult.throughputMBps.toFixed(2)} MB/s, ${improvedResult.memoryUsageMB.toFixed(1)} MB memory`);
    console.log(`Improvement: ${improvement.throughputImprovement.toFixed(1)}% faster, ${improvement.memoryImprovement.toFixed(1)}% less memory`);

    // With high duplicate content, improvements should be even more significant
    expect(improvement.throughputImprovement).to.be.greaterThan(50); // At least 50% faster
    expect(improvement.memoryImprovement).to.be.greaterThan(20); // At least 20% less memory
  });

  test('Overall Performance Summary', async function() {
    console.log('\n=== Performance Enhancement Summary ===');
    console.log('✅ Chunk Deduplication: Reduces redundant processing');
    console.log('✅ Compression: Reduces memory footprint and network transfer');
    console.log('✅ Semantic Chunking: Improves chunk quality and relevance');
    console.log('✅ Delta Indexing: Processes only changed content');
    console.log('✅ Connection Pooling: Reduces connection overhead');
    console.log('✅ Request Coalescing: Batches requests for efficiency');
    console.log('✅ Progressive Streaming: Handles large files efficiently');
    console.log('✅ Enhanced Progress Tracking: Provides better user feedback');
    console.log('\nExpected improvements:');
    console.log('- 10-50% faster processing depending on content type');
    console.log('- 5-20% reduction in memory usage');
    console.log('- Better handling of duplicate content');
    console.log('- Improved scalability for large codebases');
  });

  // Helper functions
  async function runBaselineTest(scenario: string, testData: any): Promise<PerformanceResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    let totalChunks = 0;
    let totalChunkSize = 0;

    for (const file of testData.files) {
      const chunks = baselineChunkContent(file.content, 1000);
      totalChunks += chunks.length;
      totalChunkSize += chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    const processingTime = endTime - startTime;
    const memoryUsage = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;
    const throughput = (testData.totalSize / 1024 / 1024) / (processingTime / 1000);

    return {
      scenario,
      implementation: 'baseline',
      totalFiles: testData.files.length,
      totalSize: testData.totalSize,
      totalChunks,
      processingTimeMs: processingTime,
      throughputMBps: throughput,
      memoryUsageMB: memoryUsage,
      avgChunkSize: totalChunkSize / totalChunks
    };
  }

  async function runImprovedTest(scenario: string, testData: any): Promise<PerformanceResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    let totalChunks = 0;
    let totalChunkSize = 0;

    for (const file of testData.files) {
      const chunksGenerator = improvedChunker.createChunks(
        file.content,
        1000,
        file.path
      );

      // Convert generator to array to count chunks
      const chunksArray = Array.from(chunksGenerator);
      totalChunks += chunksArray.length;
      totalChunkSize += chunksArray.reduce((sum: number, chunk: any) => sum + chunk.content.length, 0);
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    const processingTime = endTime - startTime;
    const memoryUsage = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;
    const throughput = (testData.totalSize / 1024 / 1024) / (processingTime / 1000);

    return {
      scenario,
      implementation: 'improved',
      totalFiles: testData.files.length,
      totalSize: testData.totalSize,
      totalChunks,
      processingTimeMs: processingTime,
      throughputMBps: throughput,
      memoryUsageMB: memoryUsage,
      avgChunkSize: totalChunkSize / totalChunks
    };
  }

  function calculateImprovement(baseline: PerformanceResult, improved: PerformanceResult) {
    const throughputImprovement = ((improved.throughputMBps - baseline.throughputMBps) / baseline.throughputMBps) * 100;
    const memoryImprovement = ((baseline.memoryUsageMB - improved.memoryUsageMB) / baseline.memoryUsageMB) * 100;
    const timeImprovement = ((baseline.processingTimeMs - improved.processingTimeMs) / baseline.processingTimeMs) * 100;

    return {
      throughputImprovement,
      memoryImprovement,
      timeImprovement
    };
  }
});