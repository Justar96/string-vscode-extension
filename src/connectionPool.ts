import { BatchRequest, ChunkTransmissionResult, ConnectionPool, ConnectionPoolStats, RequestBatcher } from './types';

export class HttpConnectionPool implements ConnectionPool {
  private connections: Set<any> = new Set();
  private availableConnections: any[] = [];
  private maxConnections: number;
  private stats: ConnectionPoolStats;
  private requestQueue: Array<{ resolve: (conn: any) => void; reject: (error: Error) => void }> = [];

  constructor(maxConnections: number = 5) {
    this.maxConnections = maxConnections;
    this.stats = {
      activeConnections: 0,
      queuedRequests: 0,
      totalRequests: 0,
      averageResponseTime: 0
    };
  }

  async acquire(): Promise<any> {
    const acquireId = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();

    console.log(`[POOL-DEBUG] acquire() called - ID: ${acquireId}, available: ${this.availableConnections.length}, active: ${this.stats.activeConnections}, total connections: ${this.connections.size}, queue: ${this.requestQueue.length}`);

    this.stats.totalRequests++;
    this.stats.queuedRequests++;

    return new Promise((resolve, reject) => {
      if (this.availableConnections.length > 0) {
        const connection = this.availableConnections.pop();
        this.stats.queuedRequests--;
        this.stats.activeConnections++;
        console.log(`[POOL-DEBUG] Reused connection ${connection?.id} - acquire ID: ${acquireId}, active: ${this.stats.activeConnections}, time: ${Date.now() - timestamp}ms`);
        resolve(connection);
        return;
      }

      if (this.connections.size < this.maxConnections) {
        const connection = this.createConnection();
        this.connections.add(connection);
        this.stats.queuedRequests--;
        this.stats.activeConnections++;
        console.log(`[POOL-DEBUG] Created new connection ${connection?.id} - acquire ID: ${acquireId}, total: ${this.connections.size}, active: ${this.stats.activeConnections}, time: ${Date.now() - timestamp}ms`);
        resolve(connection);
        return;
      }

      // Queue the request
      console.log(`[POOL-DEBUG] Queuing request - acquire ID: ${acquireId}, queue size: ${this.requestQueue.length + 1}, active: ${this.stats.activeConnections}`);
      this.requestQueue.push({ resolve, reject });
    });
  }

  release(connection: any): void {
    const releaseId = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();

    console.log(`[POOL-DEBUG] release() called - ID: ${releaseId}, connection: ${connection?.id}, active before: ${this.stats.activeConnections}, queue: ${this.requestQueue.length}, available: ${this.availableConnections.length}`);

    this.stats.activeConnections--;

    if (this.requestQueue.length > 0) {
      const { resolve } = this.requestQueue.shift()!;
      this.stats.queuedRequests--;
      this.stats.activeConnections++;
      console.log(`[POOL-DEBUG] Reusing connection ${connection?.id} for queued request - release ID: ${releaseId}, active after: ${this.stats.activeConnections}, queue remaining: ${this.requestQueue.length}, time: ${Date.now() - timestamp}ms`);
      resolve(connection);
    } else {
      this.availableConnections.push(connection);
      console.log(`[POOL-DEBUG] Connection ${connection?.id} returned to pool - release ID: ${releaseId}, active after: ${this.stats.activeConnections}, available: ${this.availableConnections.length}, time: ${Date.now() - timestamp}ms`);
    }
  }

  getStats(): ConnectionPoolStats {
    return { ...this.stats };
  }

  async destroy(): Promise<void> {
    // Reject all queued requests
    for (const { reject } of this.requestQueue) {
      reject(new Error('Connection pool destroyed'));
    }
    this.requestQueue.length = 0;

    // Close all connections
    this.connections.clear();
    this.availableConnections.length = 0;
    this.stats.activeConnections = 0;
    this.stats.queuedRequests = 0;
  }

  private createConnection(): any {
    // Return a mock connection object
    // In real implementation, this would create actual HTTP connections
    return {
      id: Math.random().toString(36).substr(2, 9),
      created: Date.now(),
      lastUsed: Date.now()
    };
  }
}

export class ChunkRequestBatcher implements RequestBatcher {
  private batchQueue: BatchRequest[] = [];
  private coalescingWindowMs: number;
  private maxBatchSize: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  constructor(coalescingWindowMs: number = 100, maxBatchSize: number = 10) {
    this.coalescingWindowMs = coalescingWindowMs;
    this.maxBatchSize = maxBatchSize;
  }

  async addRequest(request: BatchRequest): Promise<ChunkTransmissionResult[]> {
    return new Promise((resolve, reject) => {
      const batchRequest = {
        ...request,
        resolve,
        reject
      } as BatchRequest & {
        resolve: (results: ChunkTransmissionResult[]) => void;
        reject: (error: Error) => void;
      };

      this.batchQueue.push(batchRequest);

      // Schedule flush if not already scheduled
      if (!this.flushTimer && !this.isProcessing) {
        this.scheduleFlush();
      }

      // Flush immediately if batch is full
      if (this.batchQueue.length >= this.maxBatchSize) {
        this.flushImmediate();
      }
    });
  }

  private scheduleFlush(): void {
    this.flushTimer = setTimeout(() => {
      this.flushImmediate();
    }, this.coalescingWindowMs);
  }

  private flushImmediate(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.batchQueue.length === 0 || this.isProcessing) {
      return;
    }

    this.flush().catch(error => {
      console.error('Batch flush failed:', error);
    });
  }

  async flush(): Promise<void> {
    if (this.isProcessing || this.batchQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const currentBatch = this.batchQueue.splice(0, this.maxBatchSize);

    try {
      // Group requests by file path for better batching
      const groupedRequests = this.groupRequestsByFile(currentBatch);

      for (const [filePath, requests] of groupedRequests.entries()) {
        try {
          const results = await this.processBatch(filePath, requests);

          // Resolve all requests in this group
          for (let i = 0; i < requests.length; i++) {
            const request = requests[i] as any;
            const result = results[i] || {
              success: false,
              error: 'No result returned',
              retryCount: 0,
              processingTimeMs: 0
            };
            request.resolve([result]);
          }
        } catch (error) {
          // Reject all requests in this group
          for (const request of requests) {
            (request as any).reject(error);
          }
        }
      }
    } finally {
      this.isProcessing = false;

      // Schedule next flush if there are more requests
      if (this.batchQueue.length > 0 && !this.flushTimer) {
        this.scheduleFlush();
      }
    }
  }

  private groupRequestsByFile(requests: BatchRequest[]): Map<string, BatchRequest[]> {
    const groups = new Map<string, BatchRequest[]>();

    for (const request of requests) {
      const existing = groups.get(request.filePath) || [];
      existing.push(request);
      groups.set(request.filePath, existing);
    }

    return groups;
  }

  private async processBatch(filePath: string, requests: BatchRequest[]): Promise<ChunkTransmissionResult[]> {
    // Combine all chunks from requests
    const allChunks = requests.flatMap(req => req.chunks);

    // Sort by priority
    allChunks.sort((a, b) => {
      const reqA = requests.find(req => req.chunks.includes(a));
      const reqB = requests.find(req => req.chunks.includes(b));
      return (reqB?.priority || 0) - (reqA?.priority || 0);
    });

    const results: ChunkTransmissionResult[] = [];

    // Process chunks in batch
    for (const chunk of allChunks) {
      try {
        // Simulate processing - in real implementation, this would send to server
        const result: ChunkTransmissionResult = {
          success: true,
          chunkId: `batch_${Date.now()}_${chunk.index}`,
          processingTimeMs: Math.random() * 100 + 50,
          retryCount: 0
        };
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          processingTimeMs: 0,
          retryCount: 0
        });
      }
    }

    return results;
  }

  getQueueSize(): number {
    return this.batchQueue.length;
  }

  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Reject all pending requests
    for (const request of this.batchQueue) {
      (request as any).reject(new Error('Request batcher destroyed'));
    }
    this.batchQueue.length = 0;
  }
}
