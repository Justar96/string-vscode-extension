import * as vscode from "vscode";

// ─── Core Data Types ───────────────────────────────────────────────────
export interface FileItem {
  uri: vscode.Uri;
  relativePath: string;
  selected: boolean;
  language: string;
  size: number;
}

export interface ExplorerNode {
  type: 'folder' | 'file';
  label: string;
  uri: vscode.Uri;
  relativePath: string;
  children?: ExplorerNode[];
  fileItem?: FileItem;
  parent?: ExplorerNode;
}

// ─── State Management Types ────────────────────────────────────────────
export interface IndexingState {
  autoIndexEnabled: boolean;
  isIndexing: boolean;
  lastIndexed: Date | null;
  totalFiles: number;
  indexedFiles: number;
}

// ─── Chunking and Processing Types ─────────────────────────────────────
export interface ChunkValidationResult {
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

export interface ChunkInfo {
  content: string;
  index: number;
  metadata: ChunkValidationResult['metadata'];
  hash: string;
}

export interface ChunkTransmissionResult {
  success: boolean;
  chunkId?: string;
  processingTimeMs: number;
  error?: string;
  retryCount: number;
}

export interface FileIndexingStats {
  totalChunks: number;
  successfulChunks: number;
  failedChunks: number;
  totalBytes: number;
  processingTimeMs: number;
  errors: string[];
}

// ─── Dashboard and Status Types ────────────────────────────────────────
export interface DashboardStats {
  totalFiles: number;
  processedFiles: number;
  totalChunks: number;
  totalTokens: number;
  averageProcessingTime: number;
  activeJobs: number;
  vectorStoreReady: boolean;
  lastUpdate: string;
  processingErrors: number;
  webhookStatus: 'connected' | 'disconnected' | 'error';
  collections: string[];
}

export interface JobMetrics {
  jobId: string;
  fileName: string;
  chunksProcessed: number;
  tokensGenerated: number;
  processingTimeMs: number;
  status: 'processing' | 'completed' | 'failed';
  startTime: number;
}

// ─── Vector Store and Multi-Backend Types ──────────────────────────────
export interface VectorStoreCredentials {
  id: string;
  name: string;
  provider: 'string' | 'pinecone' | 'weaviate' | 'chroma' | 'qdrant' | 'custom';
  endpoint: string;
  credentials: {
    apiKey?: string;
    token?: string;
    username?: string;
    password?: string;
    region?: string;
    namespace?: string;
    [key: string]: any;
  };
  metadata: {
    createdAt: Date;
    lastUsed?: Date;
    isActive: boolean;
    capabilities: string[];
    description?: string;
  };
}

export interface VectorStoreConnection {
  id: string;
  credentials: VectorStoreCredentials;
  isConnected: boolean;
  lastHealthCheck?: Date;
  connectionError?: string;
  collections: string[];
}

export interface SecureCredentialResponse {
  success: boolean;
  credentialId: string;
  encryptedToken: string;
  expiresAt?: Date;
  error?: string;
}

export interface VectorStoreSelectionContext {
  selectedStoreId?: string;
  targetCollection?: string;
  autoDetectBestStore: boolean;
  fallbackStores: string[];
}

// ─── Configuration Types ───────────────────────────────────────────────
export interface ExtensionConfig {
  url: string;
  apiKey: string;
  maxChunkSize: number;
  autoIndexOnStartup: boolean;
  excludePatterns: string[];
  batchSize: number;
  webhookPort: number;
  enableWebhooks: boolean;
  showBothViewsOnStartup: boolean;
  enableMultiVectorStore: boolean;
  credentialEndpoint: string;
  secureServerEndpoint: string;
  defaultVectorStore?: string;
  credentialExpiryDays: number;
} 