import * as vscode from "vscode";
import { DashboardStats, JobMetrics } from "./types";
import { getExtensionConfig } from "./utils";

// ─── Webhook Server ────────────────────────────────────────────────────
export class WebhookServer {
  private server: any = null;
  private app: any = null;
  
  constructor(
    private onWebhookReceived: (jobData: any) => void,
    private onStatusUpdate: (status: 'connected' | 'disconnected' | 'error') => void
  ) {}

  async start(): Promise<void> {
    const config = getExtensionConfig();
    
    if (!config.enableWebhooks) {
      this.onStatusUpdate('disconnected');
      return;
    }

    try {
      const express = require('express');
      this.app = express();
      
      this.app.use(express.json());
      
      // Health check endpoint
      this.app.get('/health', (req: any, res: any) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
      });
      
      // Job completion webhook endpoint
      this.app.post('/webhook/job-complete', (req: any, res: any) => {
        try {
          const jobData = req.body;
          console.log('🎣 Webhook received:', JSON.stringify(jobData, null, 2));
          
          if (!jobData.job_id || !jobData.status) {
            console.warn('Invalid webhook payload - missing required fields');
            return res.status(200).json({ 
              received: true, 
              error: 'Invalid payload structure',
              timestamp: new Date().toISOString() 
            });
          }
          
          this.onWebhookReceived(jobData);
          
          res.status(200).json({ 
            received: true, 
            timestamp: new Date().toISOString(),
            processed_job_id: jobData.job_id 
          });
          
        } catch (error) {
          console.error('Webhook processing error:', error);
          res.status(200).json({ 
            received: true, 
            error: 'Internal processing error',
            timestamp: new Date().toISOString() 
          });
        }
      });
      
      this.server = this.app.listen(config.webhookPort, 'localhost', () => {
        console.log(`🎣 Webhook server started on http://localhost:${config.webhookPort}`);
        this.onStatusUpdate('connected');
        
        vscode.window.showInformationMessage(
          `🎣 Webhook server ready on port ${config.webhookPort} for real-time notifications`
        );
      });
      
      this.server.on('error', (error: any) => {
        console.error('Webhook server error:', error);
        this.onStatusUpdate('error');
        
        if (error.code === 'EADDRINUSE') {
          vscode.window.showWarningMessage(
            `Port ${config.webhookPort} is already in use. Webhook notifications disabled. You can change the port in settings.`
          );
        } else {
          vscode.window.showWarningMessage(
            `Webhook server failed to start: ${error.message}. Real-time notifications disabled.`
          );
        }
      });
      
    } catch (error) {
      console.error('Failed to start webhook server:', error);
      this.onStatusUpdate('error');
      vscode.window.showWarningMessage(
        `Could not start webhook server: ${error instanceof Error ? error.message : String(error)}. Install express with 'npm install express' if missing.`
      );
    }
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        console.log('🎣 Webhook server stopped');
        this.onStatusUpdate('disconnected');
      });
      this.server = null;
      this.app = null;
    }
  }
}

// ─── Dashboard Webview Provider ────────────────────────────────────────
export class DashboardWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mcpStatusDashboardView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private getDashboardStats: () => DashboardStats,
    private getActiveJobMetrics: () => JobMetrics[]
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    this.updateContent();

    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.type) {
        case 'refresh':
          this.updateContent();
          break;
      }
    });
  }

  public updateContent() {
    if (this._view) {
      this._view.webview.html = this.generateCompactDashboardHTML();
    }
  }

  private generateCompactDashboardHTML(): string {
    const stats = this.getDashboardStats();
    const activeJobs = this.getActiveJobMetrics();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Status</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            padding: 8px;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            margin: 0;
        }
        
        .header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
        }
        
        .header h3 {
            margin: 0;
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-sideBarSectionHeader-foreground);
        }
        
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            animation: ${stats.vectorStoreReady ? 'pulse 2s infinite' : 'none'};
        }
        
        .status-ready { background: #28a745; }
        .status-processing { background: #ffc107; }
        .status-error { background: #dc3545; }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .stats-compact {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 12px;
        }
        
        .stat-item {
            text-align: center;
            padding: 6px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        
        .stat-value {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-charts-blue);
            display: block;
        }
        
        .stat-label {
            font-size: 10px;
            opacity: 0.7;
            text-transform: uppercase;
        }
        
        .webhook-status {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 12px;
            padding: 6px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            font-size: 11px;
        }
        
        .webhook-icon {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${stats.webhookStatus === 'connected' ? '#28a745' : stats.webhookStatus === 'error' ? '#dc3545' : '#6c757d'};
        }
        
        .section {
            margin-bottom: 12px;
        }
        
        .section-title {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--vscode-sideBarSectionHeader-foreground);
            text-transform: uppercase;
        }
        
        .active-jobs {
            background: var(--vscode-input-background);
            border-radius: 4px;
            overflow: hidden;
            max-height: 120px;
            overflow-y: auto;
        }
        
        .job-item {
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-input-border);
            font-size: 11px;
        }
        
        .job-item:last-child {
            border-bottom: none;
        }
        
        .job-name {
            font-weight: 500;
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .job-details {
            display: flex;
            justify-content: space-between;
            align-items: center;
            opacity: 0.7;
        }
        
        .job-progress {
            font-size: 10px;
        }
        
        .job-status {
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-processing-job {
            background: rgba(255, 193, 7, 0.2);
            color: #ffc107;
        }
        
        .status-completed {
            background: rgba(40, 167, 69, 0.2);
            color: #28a745;
        }
        
        .status-failed {
            background: rgba(220, 53, 69, 0.2);
            color: #dc3545;
        }
        
        .collections-list {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        
        .collection-tag {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 9px;
            font-family: var(--vscode-editor-font-family);
        }
        
        .empty-state {
            text-align: center;
            padding: 12px;
            opacity: 0.6;
            font-size: 11px;
        }
        
        .refresh-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            width: 100%;
            margin-top: 8px;
        }
        
        .refresh-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .progress-bar {
            width: 100%;
            height: 3px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 4px;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-foreground);
            transition: width 0.3s ease;
            width: ${stats.totalFiles > 0 ? (stats.processedFiles / stats.totalFiles) * 100 : 0}%;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="status-indicator ${stats.vectorStoreReady ? 'status-ready' : (stats.activeJobs > 0 ? 'status-processing' : 'status-error')}"></span>
        <h3>📊 String Status</h3>
    </div>
    
    <div class="webhook-status">
        <div class="webhook-icon"></div>
        <span>Webhook: ${stats.webhookStatus === 'connected' ? '🟢' : stats.webhookStatus === 'error' ? '🔴' : '🟡'}</span>
    </div>
    
    <div class="stats-compact">
        <div class="stat-item">
            <span class="stat-value">${stats.totalFiles}</span>
            <span class="stat-label">Total</span>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
        </div>
        
        <div class="stat-item">
            <span class="stat-value">${stats.processedFiles}</span>
            <span class="stat-label">Processed</span>
        </div>
        
        <div class="stat-item">
            <span class="stat-value">${stats.totalChunks}</span>
            <span class="stat-label">Chunks</span>
        </div>
        
        <div class="stat-item">
            <span class="stat-value">${(stats.totalTokens / 1000).toFixed(1)}K</span>
            <span class="stat-label">Tokens</span>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">⚡ Active Jobs (${stats.activeJobs})</div>
        <div class="active-jobs">
            ${activeJobs.length === 0 ? `
                <div class="empty-state">
                    🎯 No active jobs
                </div>
            ` : activeJobs.slice(0, 3).map(job => `
                <div class="job-item">
                    <div class="job-name">📄 ${job.fileName}</div>
                    <div class="job-details">
                        <span class="job-progress">${job.chunksProcessed} chunks</span>
                        <span class="job-status status-${job.status === 'processing' ? 'processing-job' : job.status}">
                            ${job.status}
                        </span>
                    </div>
                </div>
            `).join('')}
            ${activeJobs.length > 3 ? `
                <div class="job-item">
                    <div class="job-name">...and ${activeJobs.length - 3} more</div>
                </div>
            ` : ''}
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">🗃️ Collections (${stats.collections.length})</div>
        ${stats.collections.length === 0 ? `
            <div class="empty-state">
                📭 No collections
            </div>
        ` : `
            <div class="collections-list">
                ${stats.collections.slice(0, 2).map(collection => `
                    <div class="collection-tag">${collection}</div>
                `).join('')}
                ${stats.collections.length > 2 ? `
                    <div class="collection-tag">+${stats.collections.length - 2}</div>
                ` : ''}
            </div>
        `}
    </div>
    
    <button class="refresh-button" onclick="refresh()">
        🔄 Refresh
    </button>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }
        
        // Auto-refresh every 2 seconds when jobs are active, every 5 seconds otherwise
        ${stats.activeJobs > 0 ? `
            setTimeout(() => {
                refresh();
            }, 2000);
        ` : `
            setTimeout(() => {
                refresh();
            }, 5000);
        `}
    </script>
</body>
</html>`;
  }
} 