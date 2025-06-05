import { EnhancedProgressMetrics, StreamingProgress } from './types';

export class EnhancedProgressTracker {
  private startTime: Date;
  private bytesProcessed: number = 0;
  private chunksProcessed: number = 0;
  private totalBytes: number;
  private totalChunks: number;
  private processingTimes: number[] = [];
  private chunkSizes: number[] = [];
  private networkLatencies: number[] = [];
  private peakMemoryUsage: number = 0;
  private lastUpdateTime: Date;

  constructor(totalBytes: number, totalChunks: number) {
    this.startTime = new Date();
    this.lastUpdateTime = new Date();
    this.totalBytes = totalBytes;
    this.totalChunks = totalChunks;
  }

  updateProgress(bytesProcessed: number, chunksProcessed: number, chunkSize?: number, processingTime?: number, networkLatency?: number): void {
    this.bytesProcessed = bytesProcessed;
    this.chunksProcessed = chunksProcessed;
    this.lastUpdateTime = new Date();

    if (chunkSize !== undefined) {
      this.chunkSizes.push(chunkSize);
      // Keep only last 100 measurements for rolling average
      if (this.chunkSizes.length > 100) {
        this.chunkSizes.shift();
      }
    }

    if (processingTime !== undefined) {
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
    }

    if (networkLatency !== undefined) {
      this.networkLatencies.push(networkLatency);
      if (this.networkLatencies.length > 50) {
        this.networkLatencies.shift();
      }
    }

    // Update peak memory usage
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      this.peakMemoryUsage = Math.max(this.peakMemoryUsage, memUsage.heapUsed);
    }
  }

  getMetrics(): EnhancedProgressMetrics {
    const now = new Date();
    const elapsedMs = now.getTime() - this.startTime.getTime();
    const elapsedSeconds = elapsedMs / 1000;

    // Calculate throughput
    const throughputBytesPerSecond = elapsedSeconds > 0 ? this.bytesProcessed / elapsedSeconds : 0;
    const throughputChunksPerSecond = elapsedSeconds > 0 ? this.chunksProcessed / elapsedSeconds : 0;

    // Calculate ETA
    const remainingBytes = this.totalBytes - this.bytesProcessed;
    const remainingChunks = this.totalChunks - this.chunksProcessed;

    let estimatedTimeRemaining = 0;
    if (throughputBytesPerSecond > 0 && remainingBytes > 0) {
      const etaByBytes = remainingBytes / throughputBytesPerSecond;
      const etaByChunks = throughputChunksPerSecond > 0 ? remainingChunks / throughputChunksPerSecond : Infinity;
      estimatedTimeRemaining = Math.min(etaByBytes, etaByChunks);
    }

    // Calculate average chunk size
    const averageChunkSize = this.chunkSizes.length > 0
      ? this.chunkSizes.reduce((sum, size) => sum + size, 0) / this.chunkSizes.length
      : 0;

    // Calculate average network latency
    const networkLatency = this.networkLatencies.length > 0
      ? this.networkLatencies.reduce((sum, latency) => sum + latency, 0) / this.networkLatencies.length
      : 0;

    return {
      startTime: this.startTime,
      estimatedTimeRemaining,
      throughputBytesPerSecond,
      throughputChunksPerSecond,
      averageChunkSize,
      peakMemoryUsage: this.peakMemoryUsage,
      networkLatency
    };
  }

  getStreamingProgress(): StreamingProgress {
    return {
      bytesProcessed: this.bytesProcessed,
      totalBytes: this.totalBytes,
      chunksProcessed: this.chunksProcessed,
      totalChunks: this.totalChunks
    };
  }

  getProgressPercentage(): number {
    if (this.totalBytes === 0) return 0;
    return Math.min(100, (this.bytesProcessed / this.totalBytes) * 100);
  }

  getEstimatedTimeRemainingFormatted(): string {
    const metrics = this.getMetrics();
    const seconds = Math.round(metrics.estimatedTimeRemaining);

    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  getThroughputFormatted(): string {
    const metrics = this.getMetrics();
    const bytesPerSec = metrics.throughputBytesPerSecond;

    if (bytesPerSec < 1024) {
      return `${Math.round(bytesPerSec)} B/s`;
    } else if (bytesPerSec < 1024 * 1024) {
      return `${Math.round(bytesPerSec / 1024)} KB/s`;
    } else {
      return `${Math.round(bytesPerSec / (1024 * 1024))} MB/s`;
    }
  }

  getDetailedStatus(): string {
    const percentage = this.getProgressPercentage();
    const eta = this.getEstimatedTimeRemainingFormatted();
    const throughput = this.getThroughputFormatted();
    const metrics = this.getMetrics();

    return [
      `Progress: ${percentage.toFixed(1)}%`,
      `ETA: ${eta}`,
      `Speed: ${throughput}`,
      `Chunks/s: ${metrics.throughputChunksPerSecond.toFixed(1)}`,
      `Avg chunk: ${this.formatBytes(metrics.averageChunkSize)}`,
      `Latency: ${metrics.networkLatency.toFixed(0)}ms`
    ].join(' | ');
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${Math.round(bytes)} B`;
    } else if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    } else {
      return `${Math.round(bytes / (1024 * 1024))} MB`;
    }
  }

  reset(totalBytes: number, totalChunks: number): void {
    this.startTime = new Date();
    this.lastUpdateTime = new Date();
    this.totalBytes = totalBytes;
    this.totalChunks = totalChunks;
    this.bytesProcessed = 0;
    this.chunksProcessed = 0;
    this.processingTimes.length = 0;
    this.chunkSizes.length = 0;
    this.networkLatencies.length = 0;
    this.peakMemoryUsage = 0;
  }
}

export class StreamingProgressManager {
  private progressTrackers: Map<string, EnhancedProgressTracker> = new Map();
  private globalTracker: EnhancedProgressTracker | null = null;

  createTracker(id: string, totalBytes: number, totalChunks: number): EnhancedProgressTracker {
    const tracker = new EnhancedProgressTracker(totalBytes, totalChunks);
    this.progressTrackers.set(id, tracker);
    return tracker;
  }

  getTracker(id: string): EnhancedProgressTracker | null {
    return this.progressTrackers.get(id) || null;
  }

  removeTracker(id: string): void {
    this.progressTrackers.delete(id);
  }

  setGlobalTracker(totalBytes: number, totalChunks: number): void {
    this.globalTracker = new EnhancedProgressTracker(totalBytes, totalChunks);
  }

  updateGlobalProgress(bytesProcessed: number, chunksProcessed: number): void {
    if (this.globalTracker) {
      this.globalTracker.updateProgress(bytesProcessed, chunksProcessed);
    }
  }

  getGlobalMetrics(): EnhancedProgressMetrics | null {
    return this.globalTracker ? this.globalTracker.getMetrics() : null;
  }

  getGlobalStatus(): string | null {
    return this.globalTracker ? this.globalTracker.getDetailedStatus() : null;
  }

  getAllTrackerStatuses(): Record<string, string> {
    const statuses: Record<string, string> = {};
    for (const [id, tracker] of this.progressTrackers.entries()) {
      statuses[id] = tracker.getDetailedStatus();
    }
    return statuses;
  }

  cleanup(): void {
    this.progressTrackers.clear();
    this.globalTracker = null;
  }
}
