import * as vscode from 'vscode';
import { DashboardStats, IndexingState, JobMetrics } from './types';

export class StatusManager {
  private statusBarItem: vscode.StatusBarItem;
  private indexingState: IndexingState;
  private dashboardStats: DashboardStats;
  private activeJobMetrics: Map<string, JobMetrics>;

  constructor(statusBarItem: vscode.StatusBarItem) {
    this.statusBarItem = statusBarItem;
    this.indexingState = {
      autoIndexEnabled: false,
      isIndexing: false,
      lastIndexed: null,
      totalFiles: 0,
      indexedFiles: 0
    };

    this.dashboardStats = {
      totalFiles: 0,
      processedFiles: 0,
      totalChunks: 0,
      totalTokens: 0,
      averageProcessingTime: 0,
      activeJobs: 0,
      vectorStoreReady: false,
      lastUpdate: new Date().toISOString(),
      processingErrors: 0,
      webhookStatus: 'disconnected',
      collections: []
    };

    this.activeJobMetrics = new Map();
  }

  // ─── Indexing State Management ─────────────────────────────────────────
  getIndexingState(): IndexingState {
    return { ...this.indexingState };
  }

  updateIndexingState(update: Partial<IndexingState>): void {
    this.indexingState = { ...this.indexingState, ...update };
    this.updateStatusBar();
  }

  setIndexingInProgress(totalFiles: number): void {
    this.updateIndexingState({
      isIndexing: true,
      totalFiles,
      indexedFiles: 0
    });
  }

  incrementIndexedFiles(): void {
    this.updateIndexingState({
      indexedFiles: this.indexingState.indexedFiles + 1
    });
  }

  completeIndexing(successful: boolean = true): void {
    this.updateIndexingState({
      isIndexing: false,
      lastIndexed: successful ? new Date() : this.indexingState.lastIndexed
    });
  }

  setIndexingState(isIndexing: boolean, totalFiles: number, indexedFiles: number = 0): void {
    this.updateIndexingState({
      isIndexing,
      totalFiles,
      indexedFiles
    });
  }

  startJob(jobId: string, fileName: string): void {
    this.addJobMetrics(jobId, fileName);
  }

  toggleAutoIndexing(): void {
    this.updateIndexingState({
      autoIndexEnabled: !this.indexingState.autoIndexEnabled
    });
  }

  // ─── Dashboard Stats Management ────────────────────────────────────────
  getDashboardStats(): DashboardStats {
    return { ...this.dashboardStats };
  }

  updateDashboardStats(update: Partial<DashboardStats>): void {
    this.dashboardStats = { ...this.dashboardStats, ...update, lastUpdate: new Date().toISOString() };
  }

  resetDashboardStats(): void {
    this.dashboardStats = {
      totalFiles: 0,
      processedFiles: 0,
      totalChunks: 0,
      totalTokens: 0,
      averageProcessingTime: 0,
      activeJobs: 0,
      vectorStoreReady: false,
      lastUpdate: new Date().toISOString(),
      processingErrors: 0,
      webhookStatus: this.dashboardStats.webhookStatus, // Preserve webhook status
      collections: this.dashboardStats.collections // Preserve collections
    };
  }

  clearActiveJobs(): void {
    this.activeJobMetrics.clear();
    this.updateDashboardStats({ activeJobs: 0 });
  }

  // ─── Job Metrics Management ────────────────────────────────────────────
  addJobMetrics(jobId: string, fileName: string): void {
    const metrics: JobMetrics = {
      jobId,
      fileName: fileName.split(/[/\\]/).pop() || fileName, // Get just the filename
      chunksProcessed: 0,
      tokensGenerated: 0,
      processingTimeMs: 0,
      status: 'processing',
      startTime: Date.now()
    };

    this.activeJobMetrics.set(jobId, metrics);
    this.updateDashboardStats({ activeJobs: this.activeJobMetrics.size });
  }

  updateJobMetrics(jobId: string, update: Partial<JobMetrics>): void {
    const existing = this.activeJobMetrics.get(jobId);
    if (existing) {
      this.activeJobMetrics.set(jobId, { ...existing, ...update });
    }
  }

  completeJob(jobId: string, success: boolean, chunksProcessed: number = 0, tokensGenerated: number = 0): void {
    const job = this.activeJobMetrics.get(jobId);
    if (job) {
      const processingTime = Date.now() - job.startTime;

      this.updateJobMetrics(jobId, {
        status: success ? 'completed' : 'failed',
        chunksProcessed,
        tokensGenerated,
        processingTimeMs: processingTime
      });

      // Update global stats
      this.dashboardStats.processedFiles++;
      this.dashboardStats.totalChunks += chunksProcessed;
      this.dashboardStats.totalTokens += tokensGenerated;

      if (success) {
        this.dashboardStats.averageProcessingTime =
          (this.dashboardStats.averageProcessingTime * (this.dashboardStats.processedFiles - 1) + processingTime / 1000) /
          this.dashboardStats.processedFiles;
      } else {
        this.dashboardStats.processingErrors++;
      }

      // Remove completed job after 2 seconds (faster cleanup)
      setTimeout(() => {
        this.activeJobMetrics.delete(jobId);
        this.updateDashboardStats({ activeJobs: this.activeJobMetrics.size });
      }, 2000);

      this.updateDashboardStats({});
    }
  }

  getActiveJobMetrics(): JobMetrics[] {
    return Array.from(this.activeJobMetrics.values());
  }

  // ─── Status Bar Management ─────────────────────────────────────────────
  private updateStatusBar(): void {
    const autoIcon = this.indexingState.autoIndexEnabled ? '$(sync)' : '$(sync-ignored)';

    let text: string;
    let tooltip: string;
    let commandId: string | undefined;

    if (this.indexingState.isIndexing) {
      text = `$(loading~spin) String Indexing (${this.indexingState.indexedFiles}/${this.indexingState.totalFiles}) $(stop)`;
      tooltip = 'String is currently indexing files. Click to stop indexing.';
      commandId = 'mcpIndex.stopIndexing';
    } else {
      const indexingIcon = '$(database)';
      text = `${autoIcon} ${indexingIcon} String`;

      if (this.indexingState.lastIndexed) {
        const timeAgo = Math.round((Date.now() - this.indexingState.lastIndexed.getTime()) / 60000);
        text += ` (${timeAgo}m ago)`;
      }

      tooltip = `${this.indexingState.autoIndexEnabled ? 'String Auto-indexing enabled' : 'String Auto-indexing disabled'}. Click for options.`;
      commandId = 'mcpIndex.showMenu';
    }

    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip;
    this.statusBarItem.command = commandId;
  }

  // ─── Status Information ────────────────────────────────────────────────
  showStatusInfo(): void {
    const info = [
      `Auto-indexing on file changes: ${this.indexingState.autoIndexEnabled ? 'Enabled' : 'Disabled'}`,
      `Currently indexing: ${this.indexingState.isIndexing ? 'Yes' : 'No'}`,
      `Last indexed: ${this.indexingState.lastIndexed ? this.indexingState.lastIndexed.toLocaleString() : 'Never'}`,
      this.indexingState.isIndexing || this.indexingState.totalFiles > 0 ?
        `Files processed in last/current run: ${this.indexingState.indexedFiles}/${this.indexingState.totalFiles}` :
        `No active or recent indexing run.`
    ].join('\n');

    vscode.window.showInformationMessage(info, { modal: true });
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────
  cleanup(): void {
    this.clearActiveJobs();
    this.resetDashboardStats();
    this.updateIndexingState({
      isIndexing: false,
      totalFiles: 0,
      indexedFiles: 0
    });
  }

  cleanupOnStop(): void {
    // Immediate cleanup when user stops process
    this.clearActiveJobs();
    this.resetDashboardStats();
    this.updateIndexingState({
      isIndexing: false,
      totalFiles: 0,
      indexedFiles: 0
    });
  }

  dispose(): void {
    this.statusBarItem.dispose();
    this.cleanup();
  }
}
