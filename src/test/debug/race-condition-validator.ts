import { PersistentCacheManager } from '../../cacheManager';
import { HttpConnectionPool } from '../../connectionPool';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Race Condition Validation Script
 *
 * This script validates the diagnostic logging we've added to detect:
 * 1. Cache Manager race conditions in timer management
 * 2. Connection Pool resource management issues
 */

async function validateCacheManagerRaceConditions() {
  console.log('\n=== CACHE MANAGER RACE CONDITION TEST ===');

  // Create a temporary cache directory
  const tempDir = path.join(__dirname, 'temp-cache-test');
  await fs.mkdir(tempDir, { recursive: true });

  const cacheManager = new PersistentCacheManager(tempDir, 100, 24);
  await cacheManager.initialize();

  console.log('Starting rapid concurrent cache operations...');

  // Simulate rapid concurrent cache operations that should trigger race conditions
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(
      cacheManager.set(`key-${i}`, {
        hash: `hash-${i}`,
        exists: true,
        timestamp: new Date(),
        chunkId: `chunk-${i}`
      })
    );

    // Add some deletions to trigger more scheduleSave() calls
    if (i % 3 === 0) {
      promises.push(cacheManager.delete(`key-${i - 1}`));
    }
  }

  // Execute all operations concurrently
  await Promise.all(promises);

  console.log('Cache operations completed. Check logs for [CACHE-DEBUG] entries.');

  // Cleanup
  await cacheManager.dispose();
  await fs.rmdir(tempDir, { recursive: true });
}

async function validateConnectionPoolResourceManagement() {
  console.log('\n=== CONNECTION POOL RESOURCE MANAGEMENT TEST ===');

  const pool = new HttpConnectionPool(3); // Small pool to force queuing

  console.log('Starting rapid concurrent connection operations...');

  // Simulate rapid concurrent connection requests
  const connections: any[] = [];
  const acquirePromises = [];

  // Request more connections than the pool size to force queuing
  for (let i = 0; i < 10; i++) {
    acquirePromises.push(
      pool.acquire().then(conn => {
        connections.push(conn);
        return conn;
      })
    );
  }

  // Wait for all acquisitions
  await Promise.all(acquirePromises);

  console.log('All connections acquired. Now releasing them rapidly...');

  // Release connections rapidly to trigger race conditions
  const releasePromises = connections.map((conn, index) => {
    return new Promise(resolve => {
      // Stagger releases slightly to create more race condition opportunities
      setTimeout(() => {
        pool.release(conn);
        resolve(void 0);
      }, index * 10);
    });
  });

  await Promise.all(releasePromises);

  console.log('Connection operations completed. Check logs for [POOL-DEBUG] entries.');
  console.log('Final pool stats:', pool.getStats());

  await pool.destroy();
}

async function runValidation() {
  console.log('🔍 Starting Race Condition Validation');
  console.log('This script will generate diagnostic logs to validate our identified issues.');
  console.log('Look for [CACHE-DEBUG] and [POOL-DEBUG] entries in the output.\n');

  try {
    await validateCacheManagerRaceConditions();
    await validateConnectionPoolResourceManagement();

    console.log('\n✅ Validation completed successfully!');
    console.log('\n📋 WHAT TO LOOK FOR IN THE LOGS:');
    console.log('1. [CACHE-DEBUG] Multiple scheduleSave() calls with overlapping timers');
    console.log('2. [CACHE-DEBUG] Timer clearing and rescheduling patterns');
    console.log('3. [POOL-DEBUG] Connection acquisition/release timing and counts');
    console.log('4. [POOL-DEBUG] Queue management and connection reuse patterns');
    console.log('\n🚨 POTENTIAL ISSUES TO IDENTIFY:');
    console.log('- Multiple timer IDs being cleared/set rapidly (cache race condition)');
    console.log('- Connection count mismatches between acquire/release operations');
    console.log('- Unexpected queue sizes or connection pool state inconsistencies');

  } catch (error) {
    console.error('❌ Validation failed:', error);
  }
}

// Run the validation if this file is executed directly
if (require.main === module) {
  runValidation().catch(console.error);
}

export { runValidation, validateCacheManagerRaceConditions, validateConnectionPoolResourceManagement };