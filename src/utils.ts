import * as path from "path";
import * as vscode from "vscode";
import { ExtensionConfig } from "./types";

// ─── File and Language Utilities ──────────────────────────────────────
export function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: { [key: string]: string } = {
    '.py': 'Python', '.ts': 'TypeScript', '.tsx': 'TypeScript React', '.js': 'JavaScript',
    '.jsx': 'JavaScript React', '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
    '.cpp': 'C++', '.c': 'C', '.h': 'C/C++ Header', '.hpp': 'C++ Header',
    '.cs': 'C#', '.php': 'PHP', '.rb': 'Ruby'
  };
  return languageMap[ext] || path.extname(filePath).substring(1).toUpperCase() || 'Unknown';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Configuration Utilities ───────────────────────────────────────────
export function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("string-codebase-indexer");
  
  return {
    url: config.get("url", "https://mcp.rabtune.com"),
    apiKey: config.get("apiKey", ""),
    maxChunkSize: config.get("maxChunkSize", 1000),
    autoIndexOnStartup: config.get("autoIndexOnStartup", false),
    excludePatterns: config.get("excludePatterns", [
      "node_modules", "venv", ".venv", "target", "build", "dist",
      "__pycache__", ".git"
    ]),
    batchSize: config.get("batchSize", 3),
    webhookPort: config.get("webhookPort", 3000),
    enableWebhooks: config.get("enableWebhooks", true),
    showBothViewsOnStartup: config.get("showBothViewsOnStartup", true),
    // New multi-vector store config
    enableMultiVectorStore: config.get("enableMultiVectorStore", false),
    credentialEndpoint: config.get("credentialEndpoint", "https://secure.rabtune.com/credentials"),
    secureServerEndpoint: config.get("secureServerEndpoint", "https://vault.rabtune.com"),
    defaultVectorStore: config.get("defaultVectorStore", undefined),
    credentialExpiryDays: config.get("credentialExpiryDays", 30)
  };
}

// ─── Debounce Utility ──────────────────────────────────────────────────
export function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: NodeJS.Timeout | undefined;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise(resolve => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
}

// ─── Session and ID Generation ─────────────────────────────────────────
let sessionUserId: string = '';

export function getOrCreateUserId(): string {
  if (!sessionUserId) {
    const workspaceName = vscode.workspace.name || 'default';
    const random = Math.random().toString(36).substr(2, 8);
    sessionUserId = `vscode_${workspaceName}_${random}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }
  return sessionUserId;
}

// ─── AbortSignal Utilities ─────────────────────────────────────────────
export function anySignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { signal: controller.signal });
  }
  return controller.signal;
}

// ─── File Pattern Utilities ────────────────────────────────────────────
export const SUPPORTED_EXTENSIONS = "{py,ts,js,jsx,tsx,java,go,rs,cpp,c,h,hpp,cs,php,rb}";

export function createFilePattern(workspaceFolder: vscode.WorkspaceFolder): vscode.RelativePattern {
  return new vscode.RelativePattern(workspaceFolder, `**/*.${SUPPORTED_EXTENSIONS}`);
}

export function createExcludeGlob(excludePatterns: string[]): string | undefined {
  return excludePatterns.length > 0 ? `**/{${excludePatterns.join(",")}}/**` : undefined;
} 