import express from 'express';
import * as vscode from 'vscode';
import { DashboardStats, JobMetrics } from './types';
import { getExtensionConfig } from './utils';

// ─── Webhook Server ────────────────────────────────────────────────────
export class WebhookServer {
  private server: any = null;
  private app: express.Application | null = null;

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
      this.app = express();

      if (!this.app) {
        throw new Error('Failed to initialize express application');
      }

      this.app.use(express.json());

      // Health check endpoint
      this.app.get('/health', (req: express.Request, res: express.Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
      });

      // Job completion webhook endpoint
      this.app.post('/webhook/job-complete', (req: express.Request, res: express.Response) => {
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
        `Could not start webhook server: ${
          error instanceof Error ? error.message : String(error)
        }. Install express with 'npm install express' if missing.`
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
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
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

  public generateCompactDashboardHTML(): string {
    const stats = this.getDashboardStats();
    const activeJobs = this.getActiveJobMetrics();
    const progressPercentage =
      stats.totalFiles > 0 ? (stats.processedFiles / stats.totalFiles) * 100 : 0;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>String Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            padding: 10px;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            margin: 0;
            line-height: 1.4;
        }
        
        .dashboard-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 12px;
            margin-bottom: 16px;
        }
        
        .status-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .main-status {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        
        .status-ready { 
            background: #28a745;
        }
        .status-processing { 
            background: #ffc107;
        }
        .status-error { 
            background: #dc3545;
        }
        

        
        .status-text {
            font-weight: 600;
            font-size: 13px;
            color: var(--vscode-foreground);
        }
        
        .webhook-mini {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        
        .webhook-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: ${
  stats.webhookStatus === 'connected'
    ? '#28a745'
    : stats.webhookStatus === 'error'
      ? '#dc3545'
      : '#6c757d'
};
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
            gap: 10px;
            margin-bottom: 16px;
        }
        
        .metric-card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 12px 8px;
            text-align: center;
            position: relative;
        }
        
        .metric-value {
            font-size: 16px;
            font-weight: 700;
            color: var(--vscode-charts-blue);
            display: block;
            margin-bottom: 2px;
        }
        
        .metric-label {
            font-size: 9px;
            opacity: 0.8;
            text-transform: uppercase;
            font-weight: 500;
            letter-spacing: 0.5px;
        }
        
        .metric-change {
            position: absolute;
            top: 4px;
            right: 4px;
            font-size: 8px;
            color: var(--vscode-charts-green);
        }
        
        .overall-progress {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 10px;
            margin-bottom: 16px;
        }
        
        .progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }
        
        .progress-title {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .progress-percentage {
            font-size: 11px;
            color: var(--vscode-charts-blue);
            font-weight: 600;
        }
        
        .progress-bar-container {
            width: 100%;
            height: 6px;
            background: var(--vscode-progressBar-background);
            border-radius: 3px;
            overflow: hidden;
        }
        
        .progress-bar-fill {
            height: 100%;
            background: var(--vscode-progressBar-foreground);
            border-radius: 3px;
            width: ${progressPercentage}%;
        }
        
        .section {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 12px;
            margin-bottom: 12px;
        }
        
        .section-title {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        

        
        .active-jobs-container {
            max-height: 140px;
            overflow-y: auto;
            border-radius: 4px;
        }
        
        .job-item {
            background: var(--vscode-list-hoverBackground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 8px;
            margin-bottom: 6px;
            font-size: 11px;
        }
        
        .job-item:last-child {
            margin-bottom: 0;
        }
        
        .job-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        
        .job-name {
            font-weight: 600;
            color: var(--vscode-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 60%;
        }
        
        .job-status {
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-processing-job {
            background: rgba(255, 193, 7, 0.2);
            color: #ffc107;
            border: 1px solid var(--vscode-input-border);
        }
        
        .status-completed {
            background: rgba(40, 167, 69, 0.2);
            color: #28a745;
            border: 1px solid var(--vscode-input-border);
        }
        
        .status-failed {
            background: rgba(220, 53, 69, 0.2);
            color: #dc3545;
            border: 1px solid var(--vscode-input-border);
        }
        
        .job-progress {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .job-progress-bar {
            width: 40px;
            height: 2px;
            background: var(--vscode-progressBar-background);
            border-radius: 1px;
            overflow: hidden;
        }
        
        .job-progress-fill {
            height: 100%;
            background: var(--vscode-charts-blue);
            transition: width 0.3s ease;
        }
        
        .collections-section {
            margin-top: 8px;
        }
        
        .collections-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 6px;
        }
        
        .collection-item {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 6px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-family: var(--vscode-editor-font-family);
            text-align: center;
            transition: all 0.2s ease;
        }
        

        
        .empty-state {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            font-style: italic;
        }
        
        .empty-state-icon {
            font-size: 24px;
            margin-bottom: 8px;
            opacity: 0.5;
        }
        
        .action-bar {
            display: flex;
            gap: 8px;
            margin-top: 16px;
        }
        
        .refresh-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            flex: 1;
        }
        
        .auto-refresh-indicator {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
            justify-content: center;
        }
        
        .refresh-dot {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--vscode-charts-green);
        }
    </style>
</head>
<body>
    <!-- Unified String Status Header -->
    <div class="dashboard-header">
        <div class="status-group">
            <div class="main-status">
                <span class="status-indicator ${
  stats.vectorStoreReady
    ? 'status-ready'
    : stats.activeJobs > 0
      ? 'status-processing'
      : 'status-error'
}"></span>
                <span class="status-text">📊 String</span>
            </div>
            <div class="webhook-mini">
                <div class="webhook-dot"></div>
                <span>${
  stats.webhookStatus === 'connected'
    ? 'Live'
    : stats.webhookStatus === 'error'
      ? 'Error'
      : 'Offline'
}</span>
            </div>
        </div>
        <div style="font-size: 10px; color: var(--vscode-descriptionForeground);">
            ${new Date().toLocaleTimeString()}
        </div>
    </div>

    <!-- Overall Progress -->
    ${
  stats.totalFiles > 0
    ? `
    <div class="overall-progress">
        <div class="progress-header">
            <span class="progress-title">⚡ Processing Progress</span>
            <span class="progress-percentage">${progressPercentage.toFixed(1)}%</span>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar-fill"></div>
        </div>
    </div>
    `
    : ''
}

    <!-- Metrics Grid -->
    <div class="metrics-grid">
        <div class="metric-card">
            <span class="metric-value">${stats.totalFiles}</span>
            <span class="metric-label">Files</span>
            ${stats.totalFiles > 0 ? '<span class="metric-change">+</span>' : ''}
        </div>
        
        <div class="metric-card">
            <span class="metric-value">${stats.processedFiles}</span>
            <span class="metric-label">Done</span>
        </div>
        
        <div class="metric-card">
            <span class="metric-value">${stats.totalChunks}</span>
            <span class="metric-label">Chunks</span>
        </div>
        
        <div class="metric-card">
            <span class="metric-value">${
  stats.totalTokens > 1000
    ? `${(stats.totalTokens / 1000).toFixed(1)}K`
    : stats.totalTokens
}</span>
            <span class="metric-label">Tokens</span>
        </div>
    </div>
    <!-- Active Jobs Section -->
    <div class="section">
        <div class="section-title">⚡ Active Jobs (${stats.activeJobs})</div>
        <div class="active-jobs-container">
            ${
  activeJobs.length === 0
    ? `
                <div class="empty-state">
                    <div class="empty-state-icon">🎯</div>
                    <div>No active jobs</div>
                </div>
            `
    : activeJobs
      .slice(0, 4)
      .map(
        job => `
                <div class="job-item">
                    <div class="job-header">
                        <span class="job-name">📄 ${job.fileName}</span>
                        <span class="job-status status-${
  job.status === 'processing' ? 'processing-job' : job.status
}">
                            ${job.status}
                        </span>
                    </div>
                    <div class="job-progress">
                        <span>${job.chunksProcessed || 0} chunks</span>
                        <div class="job-progress-bar">
                            <div class="job-progress-fill" style="width: ${
  job.chunksProcessed > 0
    ? Math.min((job.chunksProcessed / 100) * 100, 100)
    : 0
}%"></div>
                        </div>
                    </div>
                </div>
            `
      )
      .join('')
}
            ${
  activeJobs.length > 4
    ? `
                <div class="job-item" style="text-align: center; font-style: italic; opacity: 0.7;">
                    ...and ${activeJobs.length - 4} more jobs
                </div>
            `
    : ''
}
        </div>
    </div>
    
    <!-- Collections Section -->
    <div class="section">
        <div class="section-title">🗃️ Collections (${stats.collections.length})</div>
        <div class="collections-section">
            ${
  stats.collections.length === 0
    ? `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div>No collections yet</div>
                </div>
            `
    : `
                <div class="collections-grid">
                    ${stats.collections
    .slice(0, 4)
    .map(
      collection => `
                        <div class="collection-item" title="${collection}">
                            ${
  collection.length > 15
    ? `${collection.substring(0, 12)}...`
    : collection
}
                        </div>
                    `
    )
    .join('')}
                    ${
  stats.collections.length > 4
    ? `
                        <div class="collection-item" style="opacity: 0.7; font-style: italic;">
                            +${stats.collections.length - 4} more
                        </div>
                    `
    : ''
}
                </div>
            `
}
        </div>
    </div>
    
    <!-- Action Bar -->
    <div class="action-bar">
        <button class="refresh-button" onclick="refresh()">
            🔄 Refresh
        </button>
    </div>
    
    <div class="auto-refresh-indicator">
        <div class="refresh-dot"></div>
        <span>Auto-refresh ${stats.activeJobs > 0 ? '2s' : '5s'}</span>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }
        
        // Auto-refresh every 2 seconds when jobs are active, every 5 seconds otherwise
        ${
  stats.activeJobs > 0
    ? `
            setTimeout(() => {
                refresh();
            }, 2000);
        `
    : `
            setTimeout(() => {
                refresh();
            }, 5000);
        `
}
    </script>
</body>
</html>`;
  }
}
