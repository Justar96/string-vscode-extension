import { PersistentCacheManager } from '../../cacheManager';
import { HttpConnectionPool } from '../../connectionPool';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * High-Concurrency Stress Test Validator
 *
 * This script performs extreme stress testing to gather comprehensive diagnostic data
 * about race conditions under high-concurrency scenarios that mirror production loads.
 */

interface StressTestResults {
  cacheResults: CacheStressResults;
  poolResults: PoolStressResults;
  systemMetrics: SystemMetrics;
}

interface CacheStressResults {
  totalOperations: number;
  timerRaceConditions: number;
  dataCorruptionEvents: number;
  memoryLeakIndicators: number;
  averageTimerClearDelay: number;
  maxConcurrentTimers: number;
}

interface PoolStressResults {
  totalAcquires: number;
  totalReleases: number;
  connectionLeaks: number;
  queueOverflows: number;
  stateInconsistencies: number;
  maxQueueSize: number;
  averageAcquireTime: number;
}

interface SystemMetrics {
  peakMemoryUsage: number;
  cpuUtilization: number;
  testDuration: number;
  errorCount: number;
}

class StressTestValidator {
  private cacheMetrics: CacheStressResults = {
    totalOperations: 0,
    timerRaceConditions: 0,
    dataCorruptionEvents: 0,
    memoryLeakIndicators: 0,
    averageTimerClearDelay: 0,
    maxConcurrentTimers: 0
  };

  private poolMetrics: PoolStressResults = {
    totalAcquires: 0,
    totalReleases: 0,
    connectionLeaks: 0,
    queueOverflows: 0,
    stateInconsistencies: 0,
    maxQueueSize: 0,
    averageAcquireTime: 0
  };

  private systemMetrics: SystemMetrics = {
    peakMemoryUsage: 0,
    cpuUtilization: 0,
    testDuration: 0,
    errorCount: 0
  };

  private timerEvents: Array<{ timestamp: number; action: string; timerId: string }> = [];
  private poolEvents: Array<{ timestamp: number; action: string; stats: any }> = [];

  async runExtremeCacheStressTest(): Promise<void> {
    console.log('\n🔥 EXTREME CACHE STRESS TEST - 1000 CONCURRENT OPERATIONS');

    const tempDir = path.join(__dirname, 'stress-cache-test');
    await fs.mkdir(tempDir, { recursive: true });

    const cacheManager = new PersistentCacheManager(tempDir, 50, 24);
    await cacheManager.initialize();

    // Hook into console.log to capture diagnostic data
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      if (message.includes('[CACHE-DEBUG]')) {
        this.analyzeCacheLogEntry(message);
      }
      originalLog(...args);
    };

    const startTime = Date.now();
    const promises: Promise<any>[] = [];

    // Generate 1000 concurrent cache operations
    for (let batch = 0; batch < 10; batch++) {
      for (let i = 0; i < 100; i++) {
        const key = `stress-key-${batch}-${i}`;

        // Mix of operations to maximize race condition opportunities
        if (i % 4 === 0) {
          promises.push(cacheManager.set(key, {
            hash: `hash-${batch}-${i}`,
            exists: true,
            timestamp: new Date(),
            chunkId: `chunk-${batch}-${i}`
          }));
        } else if (i % 4 === 1) {
          promises.push(cacheManager.get(key));
        } else if (i % 4 === 2) {
          promises.push(cacheManager.delete(key));
        } else {
          promises.push(cacheManager.has(key));
        }

        this.cacheMetrics.totalOperations++;
      }

      // Add small delays between batches to create timing variations
      if (batch % 3 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    console.log(`Executing ${promises.length} concurrent cache operations...`);
    await Promise.all(promises);

    this.systemMetrics.testDuration = Date.now() - startTime;
    console.log(`Cache stress test completed in ${this.systemMetrics.testDuration}ms`);

    // Restore console.log
    console.log = originalLog;

    await cacheManager.dispose();
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  async runExtremePoolStressTest(): Promise<void> {
    console.log('\n🔥 EXTREME CONNECTION POOL STRESS TEST - 500 CONCURRENT CONNECTIONS');

    const pool = new HttpConnectionPool(5); // Very small pool to force extreme queuing

    // Hook into console.log to capture diagnostic data
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      if (message.includes('[POOL-DEBUG]')) {
        this.analyzePoolLogEntry(message);
      }
      originalLog(...args);
    };

    const startTime = Date.now();
    const connections: any[] = [];
    const acquirePromises: Promise<any>[] = [];
    const acquireTimes: number[] = [];

    // Request 500 connections from a pool of 5
    for (let i = 0; i < 500; i++) {
      const acquireStart = Date.now();
      acquirePromises.push(
        pool.acquire().then(conn => {
          const acquireTime = Date.now() - acquireStart;
          acquireTimes.push(acquireTime);
          connections.push(conn);
          this.poolMetrics.totalAcquires++;
          return conn;
        }).catch(error => {
          this.systemMetrics.errorCount++;
          console.error(`Acquire failed for request ${i}:`, error.message);
          return null;
        })
      );

      // Vary timing to create race conditions
      if (i % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    console.log('Waiting for all acquisitions...');
    const acquiredConnections = await Promise.all(acquirePromises);
    const validConnections = acquiredConnections.filter(conn => conn !== null);

    console.log(`Acquired ${validConnections.length} connections. Starting rapid releases...`);

    // Release connections with varying timing patterns
    const releasePromises = validConnections.map((conn, index) => {
      return new Promise<void>(resolve => {
        // Create different timing patterns to maximize race conditions
        const delay = index % 10; // 0-9ms delays
        setTimeout(() => {
          try {
            pool.release(conn);
            this.poolMetrics.totalReleases++;
          } catch (error) {
            this.systemMetrics.errorCount++;
            console.error(`Release failed for connection ${index}:`, error);
          }
          resolve();
        }, delay);
      });
    });

    await Promise.all(releasePromises);

    // Calculate metrics
    this.poolMetrics.averageAcquireTime = acquireTimes.reduce((a, b) => a + b, 0) / acquireTimes.length;
    this.systemMetrics.testDuration += Date.now() - startTime;

    console.log('Pool stress test completed');
    console.log('Final pool stats:', pool.getStats());

    // Restore console.log
    console.log = originalLog;

    await pool.destroy();
  }

  private analyzeCacheLogEntry(message: string): void {
    const timestamp = Date.now();

    if (message.includes('existing timer: YES')) {
      this.cacheMetrics.timerRaceConditions++;
    }

    if (message.includes('Clearing existing timer')) {
      const timerIdMatch = message.match(/ID: ([^,]+)/);
      if (timerIdMatch) {
        this.timerEvents.push({
          timestamp,
          action: 'clear',
          timerId: timerIdMatch[1]
        });
      }
    }

    if (message.includes('New timer scheduled')) {
      const timerIdMatch = message.match(/ID: ([^,]+)/);
      if (timerIdMatch) {
        this.timerEvents.push({
          timestamp,
          action: 'schedule',
          timerId: timerIdMatch[1]
        });
      }
    }
  }

  private analyzePoolLogEntry(message: string): void {
    const timestamp = Date.now();

    if (message.includes('queue size:')) {
      const queueMatch = message.match(/queue size: (\d+)/);
      if (queueMatch) {
        const queueSize = parseInt(queueMatch[1]);
        this.poolMetrics.maxQueueSize = Math.max(this.poolMetrics.maxQueueSize, queueSize);

        if (queueSize > 100) {
          this.poolMetrics.queueOverflows++;
        }
      }
    }

    if (message.includes('total:') && message.includes('active:')) {
      const totalMatch = message.match(/total: (\d+)/);
      const activeMatch = message.match(/active: (\d+)/);

      if (totalMatch && activeMatch) {
        const total = parseInt(totalMatch[1]);
        const active = parseInt(activeMatch[1]);

        // Detect potential state inconsistencies
        if (active > total) {
          this.poolMetrics.stateInconsistencies++;
        }

        this.poolEvents.push({
          timestamp,
          action: 'state_check',
          stats: { total, active }
        });
      }
    }
  }

  private analyzeTimerPatterns(): void {
    console.log('\n📊 TIMER PATTERN ANALYSIS:');

    // Group timer events by ID to detect rapid clear/schedule cycles
    const timerGroups = new Map<string, Array<{ timestamp: number; action: string }>>();

    this.timerEvents.forEach(event => {
      if (!timerGroups.has(event.timerId)) {
        timerGroups.set(event.timerId, []);
      }
      timerGroups.get(event.timerId)!.push({
        timestamp: event.timestamp,
        action: event.action
      });
    });

    let rapidCycles = 0;
    let maxConcurrentTimers = 0;
    const concurrentTimers = new Set<string>();

    timerGroups.forEach((events, timerId) => {
      // Check for rapid clear/schedule cycles (< 10ms apart)
      for (let i = 1; i < events.length; i++) {
        const timeDiff = events[i].timestamp - events[i-1].timestamp;
        if (timeDiff < 10 && events[i-1].action === 'clear' && events[i].action === 'schedule') {
          rapidCycles++;
        }
      }

      // Track concurrent timers
      events.forEach(event => {
        if (event.action === 'schedule') {
          concurrentTimers.add(timerId);
        } else if (event.action === 'clear') {
          concurrentTimers.delete(timerId);
        }
        maxConcurrentTimers = Math.max(maxConcurrentTimers, concurrentTimers.size);
      });
    });

    this.cacheMetrics.maxConcurrentTimers = maxConcurrentTimers;
    console.log(`- Rapid timer cycles detected: ${rapidCycles}`);
    console.log(`- Maximum concurrent timers: ${maxConcurrentTimers}`);
    console.log(`- Total timer race conditions: ${this.cacheMetrics.timerRaceConditions}`);
  }

  private analyzePoolPatterns(): void {
    console.log('\n📊 CONNECTION POOL PATTERN ANALYSIS:');

    // Analyze connection state transitions
    let stateTransitions = 0;
    for (let i = 1; i < this.poolEvents.length; i++) {
      const prev = this.poolEvents[i-1];
      const curr = this.poolEvents[i];

      if (prev.stats && curr.stats) {
        if (prev.stats.total !== curr.stats.total || prev.stats.active !== curr.stats.active) {
          stateTransitions++;
        }
      }
    }

    console.log(`- Connection state transitions: ${stateTransitions}`);
    console.log(`- Maximum queue size reached: ${this.poolMetrics.maxQueueSize}`);
    console.log(`- Queue overflow events: ${this.poolMetrics.queueOverflows}`);
    console.log(`- State inconsistencies detected: ${this.poolMetrics.stateInconsistencies}`);
    console.log(`- Average acquire time: ${this.poolMetrics.averageAcquireTime.toFixed(2)}ms`);
  }

  async runComprehensiveStressTest(): Promise<StressTestResults> {
    console.log('🚀 STARTING COMPREHENSIVE STRESS TEST SUITE');
    console.log('This will generate extreme concurrency to reveal race condition patterns.\n');

    const startTime = Date.now();
    const initialMemory = process.memoryUsage();

    try {
      await this.runExtremeCacheStressTest();
      await this.runExtremePoolStressTest();

      this.systemMetrics.testDuration = Date.now() - startTime;
      const finalMemory = process.memoryUsage();
      this.systemMetrics.peakMemoryUsage = Math.max(
        finalMemory.heapUsed - initialMemory.heapUsed,
        0
      );

      // Analyze patterns
      this.analyzeTimerPatterns();
      this.analyzePoolPatterns();

      console.log('\n✅ COMPREHENSIVE STRESS TEST COMPLETED');
      this.printSummaryReport();

      return {
        cacheResults: this.cacheMetrics,
        poolResults: this.poolMetrics,
        systemMetrics: this.systemMetrics
      };

    } catch (error) {
      console.error('❌ Stress test failed:', error);
      this.systemMetrics.errorCount++;
      throw error;
    }
  }

  private printSummaryReport(): void {
    console.log('\n📋 STRESS TEST SUMMARY REPORT');
    console.log('=====================================');

    console.log('\n🔴 CRITICAL FINDINGS:');
    if (this.cacheMetrics.timerRaceConditions > 50) {
      console.log(`- SEVERE: ${this.cacheMetrics.timerRaceConditions} cache timer race conditions detected`);
    }
    if (this.poolMetrics.stateInconsistencies > 0) {
      console.log(`- SEVERE: ${this.poolMetrics.stateInconsistencies} connection pool state inconsistencies`);
    }
    if (this.poolMetrics.queueOverflows > 10) {
      console.log(`- HIGH: ${this.poolMetrics.queueOverflows} connection queue overflow events`);
    }

    console.log('\n📊 PERFORMANCE METRICS:');
    console.log(`- Total test duration: ${this.systemMetrics.testDuration}ms`);
    console.log(`- Peak memory increase: ${(this.systemMetrics.peakMemoryUsage / 1024 / 1024).toFixed(2)}MB`);
    console.log(`- Total errors encountered: ${this.systemMetrics.errorCount}`);
    console.log(`- Cache operations completed: ${this.cacheMetrics.totalOperations}`);
    console.log(`- Pool acquisitions: ${this.poolMetrics.totalAcquires}`);
    console.log(`- Pool releases: ${this.poolMetrics.totalReleases}`);

    console.log('\n🎯 RACE CONDITION SEVERITY ASSESSMENT:');
    const cacheRisk = this.cacheMetrics.timerRaceConditions > 100 ? 'CRITICAL' :
      this.cacheMetrics.timerRaceConditions > 50 ? 'HIGH' : 'MODERATE';
    const poolRisk = this.poolMetrics.stateInconsistencies > 5 ? 'CRITICAL' :
      this.poolMetrics.queueOverflows > 20 ? 'HIGH' : 'MODERATE';

    console.log(`- Cache Manager Risk Level: ${cacheRisk}`);
    console.log(`- Connection Pool Risk Level: ${poolRisk}`);
  }
}

// Export for use in other test files
export { StressTestValidator, StressTestResults };

// Run the comprehensive stress test if this file is executed directly
if (require.main === module) {
  const validator = new StressTestValidator();
  validator.runComprehensiveStressTest()
    .then(results => {
      console.log('\n🎉 Stress testing completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Stress testing failed:', error);
      process.exit(1);
    });
}
