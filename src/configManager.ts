import * as vscode from 'vscode';
import { ExtensionConfigEnhanced, PerformanceConfig } from './types';

export class ConfigManager {
  private static readonly PERFORMANCE_CONFIG_KEY = 'performance';

  /**
   * Gets the enhanced extension configuration with performance settings
   */
  static getEnhancedConfig(): ExtensionConfigEnhanced {
    const config = vscode.workspace.getConfiguration('mcpCodebaseIndexer');

    const baseConfig = {
      url: config.get<string>('url', 'http://localhost:8000'),
      apiKey: config.get<string>('apiKey', ''),
      maxChunkSize: config.get<number>('maxChunkSize', 1000),
      autoIndexOnStartup: config.get<boolean>('autoIndexOnStartup', false),
      excludePatterns: config.get<string[]>('excludePatterns', []),
      batchSize: config.get<number>('batchSize', 5),
      webhookPort: config.get<number>('webhookPort', 3001),
      enableWebhooks: config.get<boolean>('enableWebhooks', false),
      showBothViewsOnStartup: config.get<boolean>('showBothViewsOnStartup', false),
      enableMultiVectorStore: config.get<boolean>('enableMultiVectorStore', false),
      credentialEndpoint: config.get<string>('credentialEndpoint', ''),
      secureServerEndpoint: config.get<string>('secureServerEndpoint', ''),
      defaultVectorStore: config.get<string>('defaultVectorStore'),
      credentialExpiryDays: config.get<number>('credentialExpiryDays', 30)
    };

    const performanceConfig: PerformanceConfig = {
      enableChunkDeduplication: config.get<boolean>('performance.enableChunkDeduplication', true),
      enableCompression: config.get<boolean>('performance.enableCompression', true),
      compressionThreshold: config.get<number>('performance.compressionThreshold', 1024),
      enableSemanticChunking: config.get<boolean>('performance.enableSemanticChunking', true),
      enableDeltaIndexing: config.get<boolean>('performance.enableDeltaIndexing', true),
      enableConnectionPooling: config.get<boolean>('performance.enableConnectionPooling', true),
      maxConnectionPoolSize: config.get<number>('performance.maxConnectionPoolSize', 5),
      enableRequestCoalescing: config.get<boolean>('performance.enableRequestCoalescing', true),
      coalescingWindowMs: config.get<number>('performance.coalescingWindowMs', 100),
      enableProgressiveStreaming: config.get<boolean>('performance.enableProgressiveStreaming', true),
      streamingChunkSize: config.get<number>('performance.streamingChunkSize', 2000),
      enableEnhancedProgress: config.get<boolean>('performance.enableEnhancedProgress', true),
      cacheExpiryHours: config.get<number>('performance.cacheExpiryHours', 24),
      maxCacheSize: config.get<number>('performance.maxCacheSize', 10000)
    };

    return {
      ...baseConfig,
      performance: performanceConfig
    };
  }

  /**
   * Updates performance configuration
   */
  static async updatePerformanceConfig(updates: Partial<PerformanceConfig>): Promise<void> {
    const config = vscode.workspace.getConfiguration('mcpCodebaseIndexer');

    for (const [key, value] of Object.entries(updates)) {
      await config.update(`performance.${key}`, value, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Resets performance configuration to defaults
   */
  static async resetPerformanceConfig(): Promise<void> {
    const defaultConfig: PerformanceConfig = {
      enableChunkDeduplication: true,
      enableCompression: true,
      compressionThreshold: 1024,
      enableSemanticChunking: true,
      enableDeltaIndexing: true,
      enableConnectionPooling: true,
      maxConnectionPoolSize: 5,
      enableRequestCoalescing: true,
      coalescingWindowMs: 100,
      enableProgressiveStreaming: true,
      streamingChunkSize: 2000,
      enableEnhancedProgress: true,
      cacheExpiryHours: 24,
      maxCacheSize: 10000
    };

    await this.updatePerformanceConfig(defaultConfig);
  }

  /**
   * Gets a specific performance setting
   */
  static getPerformanceSetting<K extends keyof PerformanceConfig>(
    key: K,
    defaultValue: PerformanceConfig[K]
  ): PerformanceConfig[K] {
    const config = vscode.workspace.getConfiguration('mcpCodebaseIndexer');
    return config.get<PerformanceConfig[K]>(`performance.${key}`, defaultValue);
  }

  /**
   * Validates performance configuration
   */
  static validatePerformanceConfig(config: PerformanceConfig): string[] {
    const errors: string[] = [];

    if (config.compressionThreshold < 100) {
      errors.push('Compression threshold must be at least 100 bytes');
    }

    if (config.maxConnectionPoolSize < 1 || config.maxConnectionPoolSize > 20) {
      errors.push('Connection pool size must be between 1 and 20');
    }

    if (config.coalescingWindowMs < 10 || config.coalescingWindowMs > 5000) {
      errors.push('Coalescing window must be between 10ms and 5000ms');
    }

    if (config.streamingChunkSize < 500 || config.streamingChunkSize > 10000) {
      errors.push('Streaming chunk size must be between 500 and 10000 characters');
    }

    if (config.cacheExpiryHours < 1 || config.cacheExpiryHours > 168) {
      errors.push('Cache expiry must be between 1 and 168 hours (1 week)');
    }

    if (config.maxCacheSize < 100 || config.maxCacheSize > 100000) {
      errors.push('Max cache size must be between 100 and 100000 entries');
    }

    return errors;
  }

  /**
   * Creates performance configuration commands for VS Code
   */
  static registerPerformanceCommands(context: vscode.ExtensionContext): void {
    // Toggle chunk deduplication
    const toggleDeduplication = vscode.commands.registerCommand(
      'mcpIndex.toggleChunkDeduplication',
      async () => {
        const current = this.getPerformanceSetting('enableChunkDeduplication', true);
        await this.updatePerformanceConfig({ enableChunkDeduplication: !current });
        vscode.window.showInformationMessage(
          `Chunk deduplication ${!current ? 'enabled' : 'disabled'}`
        );
      }
    );

    // Toggle compression
    const toggleCompression = vscode.commands.registerCommand(
      'mcpIndex.toggleCompression',
      async () => {
        const current = this.getPerformanceSetting('enableCompression', true);
        await this.updatePerformanceConfig({ enableCompression: !current });
        vscode.window.showInformationMessage(
          `Compression ${!current ? 'enabled' : 'disabled'}`
        );
      }
    );

    // Toggle semantic chunking
    const toggleSemanticChunking = vscode.commands.registerCommand(
      'mcpIndex.toggleSemanticChunking',
      async () => {
        const current = this.getPerformanceSetting('enableSemanticChunking', true);
        await this.updatePerformanceConfig({ enableSemanticChunking: !current });
        vscode.window.showInformationMessage(
          `Semantic chunking ${!current ? 'enabled' : 'disabled'}`
        );
      }
    );

    // Toggle delta indexing
    const toggleDeltaIndexing = vscode.commands.registerCommand(
      'mcpIndex.toggleDeltaIndexing',
      async () => {
        const current = this.getPerformanceSetting('enableDeltaIndexing', true);
        await this.updatePerformanceConfig({ enableDeltaIndexing: !current });
        vscode.window.showInformationMessage(
          `Delta indexing ${!current ? 'enabled' : 'disabled'}`
        );
      }
    );

    // Show performance settings
    const showPerformanceSettings = vscode.commands.registerCommand(
      'mcpIndex.showPerformanceSettings',
      () => {
        const config = this.getEnhancedConfig().performance;
        const settings = [
          `Chunk Deduplication: ${config.enableChunkDeduplication ? 'Enabled' : 'Disabled'}`,
          `Compression: ${config.enableCompression ? 'Enabled' : 'Disabled'}`,
          `Semantic Chunking: ${config.enableSemanticChunking ? 'Enabled' : 'Disabled'}`,
          `Delta Indexing: ${config.enableDeltaIndexing ? 'Enabled' : 'Disabled'}`,
          `Connection Pooling: ${config.enableConnectionPooling ? 'Enabled' : 'Disabled'}`,
          `Request Coalescing: ${config.enableRequestCoalescing ? 'Enabled' : 'Disabled'}`,
          `Progressive Streaming: ${config.enableProgressiveStreaming ? 'Enabled' : 'Disabled'}`,
          `Enhanced Progress: ${config.enableEnhancedProgress ? 'Enabled' : 'Disabled'}`
        ].join('\n');

        vscode.window.showInformationMessage(
          `Performance Settings:\n\n${settings}`,
          { modal: true }
        );
      }
    );

    context.subscriptions.push(
      toggleDeduplication,
      toggleCompression,
      toggleSemanticChunking,
      toggleDeltaIndexing,
      showPerformanceSettings
    );
  }
}
