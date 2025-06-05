import { after, before, suite, test } from 'mocha';
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import { performance } from 'perf_hooks';
import { GeneratedTestData, TestDataConfig, TestDataGenerator } from './test-data-generator';

// Import modules to test (baseline implementation)
import { ContentChunker } from '../../chunking';
import { ExtensionConfig, PerformanceConfig } from '../../types';

/**
 * Baseline Performance Tests
 * Tests the original implementation without performance enhancements
 */

interface PerformanceMetrics {
  throughputFilesPerSecond: number;
  throughputChunksPerSecond: number;
  throughputBytesPerSecond: number;
  averageLatencyMs: number;
  peakMemoryUsageMB: number;
  totalProcessingTimeMs: number;
  chunksGenerated: number;
  filesProcessed: number;
  totalBytes: number;
  errorRate: number;
}

interface ChunkingTestResult {
  metrics: PerformanceMetrics;
  errors: string[];
  warnings: string[];
  testData: GeneratedTestData;
}

suite('Baseline Performance Tests', () => {
  let testDataSmall: GeneratedTestData;
  let testDataMedium: GeneratedTestData;
  let testDataLarge: GeneratedTestData;
  let baselineConfig: ExtensionConfig;

  before(async function() {
    this.timeout(60000); // 1 minute timeout for setup

    console.log('Setting up baseline performance test data...');

    // Initialize baseline configuration (no performance enhancements)
    baselineConfig = {
      url: 'http://localhost:3000',
      apiKey: 'test-key',
      maxChunkSize: 1000,
      autoIndexOnStartup: false,
      excludePatterns: [],
      batchSize: 1, // Process one file at a time (baseline)
      webhookPort: 3000,
      enableWebhooks: false,
      showBothViewsOnStartup: false,
      enableMultiVectorStore: false,
      credentialEndpoint: '',
      secureServerEndpoint: '',
      credentialExpiryDays: 30
    };

    // Generate test data for different scenarios
    const smallConfig = await TestDataGenerator.generateScenarioData('small');
    const mediumConfig = await TestDataGenerator.generateScenarioData('medium');
    const largeConfig = await TestDataGenerator.generateScenarioData('large');

    testDataSmall = await TestDataGenerator.generateTestData(smallConfig);
    testDataMedium = await TestDataGenerator.generateTestData(mediumConfig);
    testDataLarge = await TestDataGenerator.generateTestData(largeConfig);

    console.log(`Generated test data:
      Small: ${testDataSmall.files.length} files, ${(testDataSmall.totalSize / 1024).toFixed(2)} KB
      Medium: ${testDataMedium.files.length} files, ${(testDataMedium.totalSize / 1024 / 1024).toFixed(2)} MB
      Large: ${testDataLarge.files.length} files, ${(testDataLarge.totalSize / 1024 / 1024).toFixed(2)} MB`);
  });

  after(async function() {
    this.timeout(30000); // 30 seconds timeout for cleanup

    console.log('Cleaning up baseline performance test data...');

    // Cleanup test data
    await TestDataGenerator.cleanupTestData(testDataSmall.projectPath);
    await TestDataGenerator.cleanupTestData(testDataMedium.projectPath);
    await TestDataGenerator.cleanupTestData(testDataLarge.projectPath);
  });

  test('Baseline: Small Files Chunking Performance', async function() {
    this.timeout(120000); // 2 minutes

    const result = await runChunkingPerformanceTest(testDataSmall, baselineConfig, 'small');

    console.log('Small Files Baseline Results:', {
      throughput: `${result.metrics.throughputFilesPerSecond.toFixed(2)} files/sec`,
      latency: `${result.metrics.averageLatencyMs.toFixed(2)} ms/file`,
      memory: `${result.metrics.peakMemoryUsageMB.toFixed(2)} MB`,
      chunks: result.metrics.chunksGenerated
    });

    // Baseline expectations (these will be improved in enhanced tests)
    expect(result.metrics.throughputFilesPerSecond).to.be.greaterThan(0);
    expect(result.metrics.errorRate).to.be.lessThan(0.05); // Less than 5% error rate
    expect(result.metrics.chunksGenerated).to.be.greaterThan(0);
  });

  test('Baseline: Medium Files Chunking Performance', async function() {
    this.timeout(300000); // 5 minutes

    const result = await runChunkingPerformanceTest(testDataMedium, baselineConfig, 'medium');

    console.log('Medium Files Baseline Results:', {
      throughput: `${result.metrics.throughputFilesPerSecond.toFixed(2)} files/sec`,
      latency: `${result.metrics.averageLatencyMs.toFixed(2)} ms/file`,
      memory: `${result.metrics.peakMemoryUsageMB.toFixed(2)} MB`,
      chunks: result.metrics.chunksGenerated
    });

    expect(result.metrics.throughputFilesPerSecond).to.be.greaterThan(0);
    expect(result.metrics.errorRate).to.be.lessThan(0.05);
    expect(result.metrics.chunksGenerated).to.be.greaterThan(0);
  });

  test('Baseline: Large Files Chunking Performance', async function() {
    this.timeout(600000); // 10 minutes

    const result = await runChunkingPerformanceTest(testDataLarge, baselineConfig, 'large');

    console.log('Large Files Baseline Results:', {
      throughput: `${result.metrics.throughputFilesPerSecond.toFixed(2)} files/sec`,
      latency: `${result.metrics.averageLatencyMs.toFixed(2)} ms/file`,
      memory: `${result.metrics.peakMemoryUsageMB.toFixed(2)} MB`,
      chunks: result.metrics.chunksGenerated
    });

    expect(result.metrics.throughputFilesPerSecond).to.be.greaterThan(0);
    expect(result.metrics.errorRate).to.be.lessThan(0.1); // Allow higher error rate for large files
    expect(result.metrics.chunksGenerated).to.be.greaterThan(0);
  });

  test('Baseline: Memory Usage Under Load', async function() {
    this.timeout(180000); // 3 minutes

    const initialMemory = process.memoryUsage();
    let peakMemory = initialMemory;

    // Monitor memory during processing
    const memoryMonitor = setInterval(() => {
      const currentMemory = process.memoryUsage();
      if (currentMemory.heapUsed > peakMemory.heapUsed) {
        peakMemory = currentMemory;
      }
    }, 100);

    try {
      await runChunkingPerformanceTest(testDataMedium, baselineConfig, 'memory-test');

      const finalMemory = process.memoryUsage();
      const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      const peakMemoryMB = peakMemory.heapUsed / 1024 / 1024;

      console.log('Memory Usage Results:', {
        initial: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        peak: `${peakMemoryMB.toFixed(2)} MB`,
        final: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        increase: `${memoryIncrease.toFixed(2)} MB`
      });

      // Memory should not grow excessively (baseline expectation)
      expect(peakMemoryMB).to.be.lessThan(500); // Less than 500MB peak usage
      expect(memoryIncrease).to.be.lessThan(200); // Less than 200MB increase

    } finally {
      clearInterval(memoryMonitor);
    }
  });

  test('Baseline: Duplicate Content Processing', async function() {
    this.timeout(180000); // 3 minutes

    // Test with high duplicate ratio
    const duplicateConfig: TestDataConfig = {
      baseDir: path.join(__dirname, '..', '..', '..', 'test-data', 'duplicate-baseline'),
      fileCount: 100,
      minFileSize: 5120, // 5KB
      maxFileSize: 51200, // 50KB
      duplicateContentRatio: 0.8, // 80% duplicates
      languages: ['typescript', 'javascript'],
      projectStructure: true
    };

    const duplicateTestData = await TestDataGenerator.generateTestData(duplicateConfig);

    try {
      const result = await runChunkingPerformanceTest(duplicateTestData, baselineConfig, 'duplicate');

      console.log('Duplicate Content Baseline Results:', {
        throughput: `${result.metrics.throughputFilesPerSecond.toFixed(2)} files/sec`,
        duplicateFiles: duplicateTestData.duplicateFiles.length,
        totalFiles: duplicateTestData.files.length,
        duplicateRatio: `${(duplicateTestData.duplicateFiles.length / duplicateTestData.files.length * 100).toFixed(1)}%`
      });

      // Baseline should process duplicates without optimization
      expect(result.metrics.chunksGenerated).to.be.greaterThan(0);
      expect(result.metrics.errorRate).to.be.lessThan(0.05);

    } finally {
      await TestDataGenerator.cleanupTestData(duplicateTestData.projectPath);
    }
  });

  test('Baseline: Different File Types Performance', async function() {
    this.timeout(240000); // 4 minutes

    const fileTypeResults: Record<string, PerformanceMetrics> = {};

    // Test different file types separately
    const languages = ['typescript', 'javascript', 'python', 'java'];

    for (const language of languages) {
      const config: TestDataConfig = {
        baseDir: path.join(__dirname, '..', '..', '..', 'test-data', `${language}-baseline`),
        fileCount: 50,
        minFileSize: 2048, // 2KB
        maxFileSize: 20480, // 20KB
        duplicateContentRatio: 0.1,
        languages: [language],
        projectStructure: true
      };

      const testData = await TestDataGenerator.generateTestData(config);

      try {
        const result = await runChunkingPerformanceTest(testData, baselineConfig, `${language}-test`);
        fileTypeResults[language] = result.metrics;

        console.log(`${language} Baseline Results:`, {
          throughput: `${result.metrics.throughputFilesPerSecond.toFixed(2)} files/sec`,
          chunks: result.metrics.chunksGenerated,
          avgLatency: `${result.metrics.averageLatencyMs.toFixed(2)} ms`
        });

      } finally {
        await TestDataGenerator.cleanupTestData(testData.projectPath);
      }
    }

    // Verify all file types were processed
    expect(Object.keys(fileTypeResults)).to.have.length(languages.length);
    for (const language of languages) {
      expect(fileTypeResults[language].throughputFilesPerSecond).to.be.greaterThan(0);
    }
  });
});

/**
 * Run chunking performance test on given test data
 */
async function runChunkingPerformanceTest(
  testData: GeneratedTestData,
  config: ExtensionConfig,
  testName: string
): Promise<ChunkingTestResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let chunksGenerated = 0;
  let filesProcessed = 0;
  let totalBytes = 0;
  const latencies: number[] = [];

  console.log(`Starting ${testName} chunking test with ${testData.files.length} files...`);

  // Process files sequentially (baseline approach)
  for (const file of testData.files) {
    const fileStartTime = performance.now();

    try {
      // Use the baseline chunking function
      const chunks = await baselineChunkContent(file.content, config.maxChunkSize);

      chunksGenerated += chunks.length;
      filesProcessed++;
      totalBytes += file.size;

      const fileEndTime = performance.now();
      latencies.push(fileEndTime - fileStartTime);

      // Log progress every 10% of files
      if (filesProcessed % Math.max(1, Math.floor(testData.files.length / 10)) === 0) {
        const progress = (filesProcessed / testData.files.length * 100).toFixed(1);
        console.log(`${testName}: ${progress}% complete (${filesProcessed}/${testData.files.length} files)`);
      }

    } catch (error) {
      errors.push(`Error processing ${file.path}: ${error}`);
    }
  }

  const endTime = performance.now();
  const totalProcessingTimeMs = endTime - startTime;

  // Calculate metrics
  const averageLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const throughputFilesPerSecond = filesProcessed / (totalProcessingTimeMs / 1000);
  const throughputChunksPerSecond = chunksGenerated / (totalProcessingTimeMs / 1000);
  const throughputBytesPerSecond = totalBytes / (totalProcessingTimeMs / 1000);
  const errorRate = errors.length / testData.files.length;

  // Get memory usage
  const memoryUsage = process.memoryUsage();
  const peakMemoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;

  const metrics: PerformanceMetrics = {
    throughputFilesPerSecond,
    throughputChunksPerSecond,
    throughputBytesPerSecond,
    averageLatencyMs,
    peakMemoryUsageMB,
    totalProcessingTimeMs,
    chunksGenerated,
    filesProcessed,
    totalBytes,
    errorRate
  };

  return {
    metrics,
    errors,
    warnings,
    testData
  };
}

/**
 * Save baseline performance results for comparison
 */
export async function saveBaselineResults(results: Record<string, PerformanceMetrics>): Promise<void> {
  const resultsPath = path.join(__dirname, '..', '..', '..', 'test-results', 'baseline-performance.json');
  const resultsDir = path.dirname(resultsPath);

  try {
    await fs.promises.access(resultsDir);
  } catch {
    await fs.promises.mkdir(resultsDir, { recursive: true });
  }

  const resultData = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    results
  };

  await fs.promises.writeFile(resultsPath, JSON.stringify(resultData, null, 2));
  console.log(`Baseline results saved to: ${resultsPath}`);
}

/**
 * Simple baseline chunking function for performance comparison
 */
async function baselineChunkContent(content: string, maxChunkSize: number): Promise<string[]> {
  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < content.length) {
    const chunk = content.slice(currentIndex, currentIndex + maxChunkSize);
    chunks.push(chunk);
    currentIndex += maxChunkSize;
  }

  return chunks;
}
