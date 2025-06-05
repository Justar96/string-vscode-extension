import * as assert from 'assert';
import * as vscode from 'vscode';
import { StatusManager } from '../../statusManager';
import { DashboardStats, IndexingState } from '../../types';

// Mock status bar item
class MockStatusBarItem implements vscode.StatusBarItem {
  public text: string = '';
  public tooltip: string | vscode.MarkdownString | undefined;
  public color: string | vscode.ThemeColor | undefined;
  public backgroundColor: vscode.ThemeColor | undefined;
  public command: string | vscode.Command | undefined;
  public accessibilityInformation: vscode.AccessibilityInformation | undefined;
  public alignment: vscode.StatusBarAlignment = vscode.StatusBarAlignment.Left;
  public priority: number | undefined;
  public id: string = 'test';
  public name: string | undefined;

  show(): void {}
  hide(): void {}
  dispose(): void {}
}

suite('StatusManager Tests', () => {
  let statusManager: StatusManager;
  let mockStatusBarItem: MockStatusBarItem;

  setup(() => {
    mockStatusBarItem = new MockStatusBarItem();
    statusManager = new StatusManager(mockStatusBarItem);
  });

  teardown(() => {
    statusManager.cleanup();
  });

  suite('Initialization', () => {
    test('should initialize with correct default state', () => {
      const state = statusManager.getIndexingState();

      assert.strictEqual(state.autoIndexEnabled, false, 'Auto index should be disabled by default');
      assert.strictEqual(state.isIndexing, false, 'Should not be indexing by default');
      assert.strictEqual(state.lastIndexed, null, 'No last indexed time by default');
      assert.strictEqual(state.totalFiles, 0, 'Total files should be 0');
      assert.strictEqual(state.indexedFiles, 0, 'Indexed files should be 0');
    });

    test('should initialize dashboard stats correctly', () => {
      const stats = statusManager.getDashboardStats();

      assert.strictEqual(stats.totalFiles, 0, 'Total files should be 0');
      assert.strictEqual(stats.processedFiles, 0, 'Processed files should be 0');
      assert.strictEqual(stats.totalChunks, 0, 'Total chunks should be 0');
      assert.strictEqual(stats.totalTokens, 0, 'Total tokens should be 0');
      assert.strictEqual(stats.averageProcessingTime, 0, 'Average processing time should be 0');
      assert.strictEqual(stats.activeJobs, 0, 'Active jobs should be 0');
      assert.strictEqual(stats.vectorStoreReady, false, 'Vector store should not be ready');
      assert.strictEqual(stats.processingErrors, 0, 'Processing errors should be 0');
      assert.strictEqual(stats.webhookStatus, 'disconnected', 'Webhook should be disconnected');
      assert.ok(Array.isArray(stats.collections), 'Collections should be an array');
      assert.strictEqual(stats.collections.length, 0, 'Collections should be empty');
    });
  });

  suite('Indexing State Management', () => {
    test('should update indexing state correctly', () => {
      const update: Partial<IndexingState> = {
        autoIndexEnabled: true,
        totalFiles: 10
      };

      statusManager.updateIndexingState(update);
      const state = statusManager.getIndexingState();

      assert.strictEqual(state.autoIndexEnabled, true, 'Auto index should be enabled');
      assert.strictEqual(state.totalFiles, 10, 'Total files should be updated');
      assert.strictEqual(state.isIndexing, false, 'Other properties should remain unchanged');
    });

    test('should set indexing in progress correctly', () => {
      statusManager.setIndexingInProgress(15);
      const state = statusManager.getIndexingState();

      assert.strictEqual(state.isIndexing, true, 'Should be indexing');
      assert.strictEqual(state.totalFiles, 15, 'Total files should be set');
      assert.strictEqual(state.indexedFiles, 0, 'Indexed files should be reset');
    });

    test('should increment indexed files correctly', () => {
      statusManager.setIndexingInProgress(5);
      statusManager.incrementIndexedFiles();
      statusManager.incrementIndexedFiles();

      const state = statusManager.getIndexingState();
      assert.strictEqual(state.indexedFiles, 2, 'Indexed files should be incremented');
    });

    test('should complete indexing successfully', () => {
      statusManager.setIndexingInProgress(5);
      statusManager.completeIndexing(true);

      const state = statusManager.getIndexingState();
      assert.strictEqual(state.isIndexing, false, 'Should not be indexing');
      assert.ok(state.lastIndexed instanceof Date, 'Should have last indexed time');
    });

    test('should complete indexing with failure', () => {
      statusManager.setIndexingInProgress(5);
      const previousLastIndexed = new Date('2023-01-01');
      statusManager.updateIndexingState({ lastIndexed: previousLastIndexed });

      statusManager.completeIndexing(false);

      const state = statusManager.getIndexingState();
      assert.strictEqual(state.isIndexing, false, 'Should not be indexing');
      assert.strictEqual(
        state.lastIndexed,
        previousLastIndexed,
        'Should preserve previous last indexed time'
      );
    });

    test('should toggle auto indexing', () => {
      assert.strictEqual(
        statusManager.getIndexingState().autoIndexEnabled,
        false,
        'Should start disabled'
      );

      statusManager.toggleAutoIndexing();
      assert.strictEqual(
        statusManager.getIndexingState().autoIndexEnabled,
        true,
        'Should be enabled after toggle'
      );

      statusManager.toggleAutoIndexing();
      assert.strictEqual(
        statusManager.getIndexingState().autoIndexEnabled,
        false,
        'Should be disabled after second toggle'
      );
    });
  });

  suite('Dashboard Stats Management', () => {
    test('should update dashboard stats correctly', () => {
      const update: Partial<DashboardStats> = {
        totalFiles: 20,
        vectorStoreReady: true,
        collections: ['test-collection']
      };

      statusManager.updateDashboardStats(update);
      const stats = statusManager.getDashboardStats();

      assert.strictEqual(stats.totalFiles, 20, 'Total files should be updated');
      assert.strictEqual(stats.vectorStoreReady, true, 'Vector store should be ready');
      assert.deepStrictEqual(
        stats.collections,
        ['test-collection'],
        'Collections should be updated'
      );
      assert.ok(stats.lastUpdate, 'Last update should be set');
    });

    test('should reset dashboard stats correctly', () => {
      // Set some initial values
      statusManager.updateDashboardStats({
        totalFiles: 10,
        processedFiles: 5,
        webhookStatus: 'connected',
        collections: ['test']
      });

      statusManager.resetDashboardStats();
      const stats = statusManager.getDashboardStats();

      assert.strictEqual(stats.totalFiles, 0, 'Total files should be reset');
      assert.strictEqual(stats.processedFiles, 0, 'Processed files should be reset');
      assert.strictEqual(stats.webhookStatus, 'connected', 'Webhook status should be preserved');
      assert.deepStrictEqual(stats.collections, ['test'], 'Collections should be preserved');
    });

    test('should clear active jobs', () => {
      // Add some jobs first
      statusManager.addJobMetrics('job1', 'file1.ts');
      statusManager.addJobMetrics('job2', 'file2.ts');

      assert.strictEqual(
        statusManager.getDashboardStats().activeJobs,
        2,
        'Should have 2 active jobs'
      );

      statusManager.clearActiveJobs();

      assert.strictEqual(
        statusManager.getDashboardStats().activeJobs,
        0,
        'Should have no active jobs'
      );
      assert.strictEqual(
        statusManager.getActiveJobMetrics().length,
        0,
        'Job metrics should be empty'
      );
    });
  });

  suite('Job Metrics Management', () => {
    test('should add job metrics correctly', () => {
      statusManager.addJobMetrics('job1', '/path/to/file.ts');

      const jobs = statusManager.getActiveJobMetrics();
      assert.strictEqual(jobs.length, 1, 'Should have 1 job');

      const job = jobs[0];
      assert.strictEqual(job.jobId, 'job1', 'Job ID should match');
      assert.strictEqual(job.fileName, 'file.ts', 'File name should be extracted');
      assert.strictEqual(job.status, 'processing', 'Status should be processing');
      assert.strictEqual(job.chunksProcessed, 0, 'Chunks processed should be 0');
      assert.strictEqual(job.tokensGenerated, 0, 'Tokens generated should be 0');
    });

    test('should update job metrics correctly', () => {
      statusManager.addJobMetrics('job1', 'file.ts');

      statusManager.updateJobMetrics('job1', {
        chunksProcessed: 5,
        tokensGenerated: 100
      });

      const job = statusManager.getActiveJobMetrics()[0];
      assert.strictEqual(job.chunksProcessed, 5, 'Chunks processed should be updated');
      assert.strictEqual(job.tokensGenerated, 100, 'Tokens generated should be updated');
    });

    test('should complete job successfully', done => {
      statusManager.addJobMetrics('job1', 'file.ts');

      statusManager.completeJob('job1', true, 10, 250);

      const stats = statusManager.getDashboardStats();
      assert.strictEqual(stats.processedFiles, 1, 'Processed files should be incremented');
      assert.strictEqual(stats.totalChunks, 10, 'Total chunks should be updated');
      assert.strictEqual(stats.totalTokens, 250, 'Total tokens should be updated');
      assert.ok(stats.averageProcessingTime > 0, 'Average processing time should be calculated');

      // Job should be removed after timeout
      setTimeout(() => {
        assert.strictEqual(statusManager.getActiveJobMetrics().length, 0, 'Job should be removed');
        done();
      }, 2100); // Wait slightly longer than the 2 second timeout
    });

    test('should complete job with failure', () => {
      statusManager.addJobMetrics('job1', 'file.ts');

      statusManager.completeJob('job1', false, 0, 0);

      const stats = statusManager.getDashboardStats();
      assert.strictEqual(stats.processedFiles, 1, 'Processed files should still be incremented');
      assert.strictEqual(stats.processingErrors, 1, 'Processing errors should be incremented');
      assert.strictEqual(stats.totalChunks, 0, 'Total chunks should not be updated');
      assert.strictEqual(stats.totalTokens, 0, 'Total tokens should not be updated');
    });

    test('should handle non-existent job updates gracefully', () => {
      statusManager.updateJobMetrics('non-existent', { chunksProcessed: 5 });
      statusManager.completeJob('non-existent', true, 5, 100);

      // Should not throw errors
      assert.ok(true, 'Should handle non-existent jobs gracefully');
    });

    test('should calculate average processing time correctly', () => {
      // Add multiple jobs with known processing times
      statusManager.addJobMetrics('job1', 'file1.ts');
      statusManager.addJobMetrics('job2', 'file2.ts');

      // Simulate processing time by manually setting start times
      const jobs = statusManager.getActiveJobMetrics();
      jobs[0].startTime = Date.now() - 1000; // 1 second ago
      jobs[1].startTime = Date.now() - 3000; // 3 seconds ago

      statusManager.completeJob('job1', true, 5, 100); // ~1 second
      statusManager.completeJob('job2', true, 10, 200); // ~3 seconds

      const stats = statusManager.getDashboardStats();
      assert.ok(stats.averageProcessingTime > 0, 'Average processing time should be calculated');
      assert.ok(stats.averageProcessingTime < 10, 'Average processing time should be reasonable');
    });
  });

  suite('Status Bar Updates', () => {
    test('should update status bar text for idle state', () => {
      statusManager.updateIndexingState({ autoIndexEnabled: false });

      assert.ok(mockStatusBarItem.text.includes('String'), 'Should contain String');
      assert.ok(mockStatusBarItem.text.includes('sync-ignored'), 'Should show disabled icon');
    });

    test('should update status bar text for auto-enabled state', () => {
      statusManager.updateIndexingState({ autoIndexEnabled: true });

      assert.ok(mockStatusBarItem.text.includes('String'), 'Should contain String');
      assert.ok(mockStatusBarItem.text.includes('$(sync)'), 'Should show enabled icon');
    });

    test('should update status bar text for indexing state', () => {
      statusManager.setIndexingInProgress(10);
      statusManager.incrementIndexedFiles();
      statusManager.incrementIndexedFiles();

      assert.ok(mockStatusBarItem.text.includes('Indexing'), 'Should show indexing text');
      assert.ok(mockStatusBarItem.text.includes('2/10'), 'Should show progress');
      assert.ok(mockStatusBarItem.text.includes('loading~spin'), 'Should show spinner');
    });

    test('should update status bar text with last indexed time', () => {
      const lastIndexed = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      statusManager.updateIndexingState({ lastIndexed });

      assert.ok(mockStatusBarItem.text.includes('String'), 'Should contain String');
      assert.ok(mockStatusBarItem.text.includes('5m ago'), 'Should show time since last index');
    });
  });

  suite('Error Handling and Edge Cases', () => {
    test('should handle cleanup properly', () => {
      statusManager.addJobMetrics('job1', 'file.ts');
      statusManager.addJobMetrics('job2', 'file.ts');

      assert.strictEqual(statusManager.getActiveJobMetrics().length, 2, 'Should have 2 jobs');

      statusManager.cleanup();

      assert.strictEqual(
        statusManager.getActiveJobMetrics().length,
        0,
        'Should clear all jobs on cleanup'
      );
    });

    test('should handle start job and complete job lifecycle', () => {
      statusManager.startJob('job1', 'test-file.ts');

      const jobs = statusManager.getActiveJobMetrics();
      assert.strictEqual(jobs.length, 1, 'Should have 1 job after start');
      assert.strictEqual(jobs[0].jobId, 'job1', 'Job ID should match');
      assert.strictEqual(jobs[0].fileName, 'test-file.ts', 'File name should match');
    });

    test('should handle zero division in average calculation', () => {
      // Complete a job with no previous jobs
      statusManager.completeJob('job1', true, 5, 100);

      const stats = statusManager.getDashboardStats();
      assert.ok(!isNaN(stats.averageProcessingTime), 'Average processing time should not be NaN');
      assert.ok(isFinite(stats.averageProcessingTime), 'Average processing time should be finite');
    });
  });
});
