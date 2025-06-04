# String VS Code Extension

A Visual Studio Code extension for streaming code chunks to backend servers with real-time webhook notifications. This extension provides intelligent file scanning, selective indexing, and asynchronous processing with immediate feedback through webhook integration.

> **📋 For Developers**: This is an open-source extension template. See [DEVELOPER_SETUP.md](DEVELOPER_SETUP.md) for configuration and customization instructions.

## Core Features

### Real-Time Processing
- **Webhook Integration**: HTTP server listening on configurable port (default: 3000) for job completion notifications
- **Asynchronous Processing**: Non-blocking file processing with background job tracking
- **Live Status Updates**: Real-time UI updates based on server responses
- **Job Management**: In-memory tracking of active processing jobs with metadata

### File Management
- **Tree View Interface**: Native VS Code explorer integration with checkbox selection system
- **Selective Indexing**: File and folder-level selection with partial selection indicators
- **Workspace Scanning**: Automatic discovery of supported file types with configurable exclusion patterns
- **Batch Processing**: Configurable concurrent processing limits to manage server load

### Technical Capabilities
- **Multi-language Support**: Supports Python, TypeScript, JavaScript, Java, Go, Rust, C/C++, C#, PHP, Ruby
- **Intelligent Chunking**: Content-aware splitting with configurable chunk sizes and hash validation
- **Error Handling**: Retry logic with exponential backoff and graceful degradation
- **Auto-indexing**: Optional file change monitoring with debounced re-indexing

## Configuration

### Server Connection
```json
{
  "string-codebase-indexer.url": "http://localhost:8000",
  "string-codebase-indexer.apiKey": "",
  "string-codebase-indexer.maxChunkSize": 1000
}
```

### Webhook Configuration
```json
{
  "string-codebase-indexer.enableWebhooks": true,
  "string-codebase-indexer.webhookPort": 3000
}
```

### Processing Control
```json
{
  "string-codebase-indexer.autoIndexOnStartup": false,
  "string-codebase-indexer.batchSize": 3,
  "string-codebase-indexer.excludePatterns": [
    "node_modules", "venv", ".venv", "target", 
    "build", "dist", "__pycache__", ".git"
  ]
}
```

#### Configuration Details
- **url**: Backend server endpoint for chunk submission (configure this for your server)
- **apiKey**: Optional Bearer token for server authentication
- **maxChunkSize**: Character limit per code chunk (affects memory usage and processing granularity)
- **enableWebhooks**: Controls webhook server initialization and payload enhancement
- **webhookPort**: TCP port for Express.js webhook server (must be available on localhost)
- **batchSize**: Maximum concurrent file processing operations (tune based on server capacity)
- **excludePatterns**: Glob patterns for directories/files to skip during workspace scanning

## Usage

### Installation and Setup
1. Install the extension from VS Code marketplace or build from source
2. Configure server settings in VS Code preferences (`Ctrl+,`)
3. Ensure your backend server supports the `/index/chunk` endpoint
4. Optionally configure webhook settings if your server supports job notifications

### File Selection Interface
The extension adds a "MCP Indexer" tree view to the Explorer sidebar with the following functionality:
- **File Selection**: Click individual files to toggle selection state
- **Folder Operations**: Click folder checkboxes to select/deselect all contained files
- **Partial Selection Indicators**: Folders show different states based on child file selection
- **Toolbar Actions**: Use header buttons for bulk selection and processing operations

### Processing Workflow
1. **File Discovery**: Extension scans workspace for supported file types
2. **Content Chunking**: Files are split into configurable-size chunks with hash validation
3. **Batch Submission**: Chunks are sent to MCP server with concurrent request limiting
4. **Webhook Notifications**: Server sends completion status to local webhook endpoint (if enabled)
5. **UI Updates**: Status bar and notifications reflect real-time processing state

### Available Commands
- `MCP: Show Options Menu` - Access main extension menu
- `MCP: Scan and Select Files` - Trigger workspace file discovery
- `MCP: Toggle Auto-indexing` - Control automatic file change monitoring

## Backend Server Integration

### Request Format
The extension sends HTTP POST requests to the `/index/chunk` endpoint. When webhooks are enabled, the payload includes additional metadata for job tracking:

```json
{
  "path": "/path/to/file.py",
  "idx": 0,
  "content": "chunk of code content...",
  "metadata": {
    "hash": "sha256_hash_of_content",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "webhook_url": "http://localhost:3000/webhook/job-complete",
    "source": "vscode-extension",
    "extension_version": "0.0.3"
  },
  "job_type": "file_processing",
  "user_id": "vscode_user_1234567890"
}
```

### Webhook Response Protocol
When processing is complete, the backend server should send an HTTP POST request to the provided webhook URL:

```json
{
  "job_id": "job_12345",
  "success": true,
  "status": "completed",
  "result_data": {
    "chunks_processed": 15,
    "vector_storage": {
      "collection_name": "my_codebase"
    }
  },
  "metrics": {
    "processing_time_ms": 1250
  },
  "error_message": null
}
```

### Implementation Notes
- The extension starts a local Express.js server on the configured port to receive webhooks
- Job IDs are tracked in memory and associated with file paths and processing metadata
- If webhook delivery fails, the extension gracefully falls back to standard processing flow
- Server implementations should handle webhook delivery asynchronously to avoid blocking chunk processing

Reference implementation examples available in the documentation.

## Requirements

### Runtime Requirements
- Visual Studio Code 1.100.0 or higher
- Network access to your backend server endpoint
- Available TCP port for webhook server (default: 3000, configurable)

### Development Requirements
- Node.js 18.0.0 or higher
- TypeScript 5.8.3 or higher
- npm or yarn package manager

### Backend Server Requirements
- Server implementing `/index/chunk` endpoint
- Optional: Webhook support for real-time notifications
- HTTP/HTTPS connectivity to VS Code webhook server (localhost)

## Technical Documentation

- **[WEBHOOK_INTEGRATION.md](./WEBHOOK_INTEGRATION.md)** - Webhook implementation details and troubleshooting
- **[ENHANCED_UI_GUIDE.md](./ENHANCED_UI_GUIDE.md)** - UI component architecture and customization
- **[MCP_SERVER_INTEGRATION.md](./MCP_SERVER_INTEGRATION.md)** - Server-side integration specifications

## Development

### Building from Source
```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
npm install
npm run compile
```

### Development Workflow
1. Make changes to TypeScript source files in `src/`
2. Run `npm run compile` or `npm run watch` for automatic compilation
3. Press `F5` in VS Code to launch Extension Development Host
4. Test changes in the development environment
5. Use `npm run lint` to check code style compliance

### Extension Structure
- `src/extension.ts` - Main extension entry point
- `package.json` - Extension manifest and configuration
- `tsconfig.json` - TypeScript compilation settings
- `eslint.config.mjs` - Code style and quality rules

### Testing
Run the test suite with:
```bash
npm test
```

## License

MIT License - see LICENSE file for details.

## ✨ Features

- **📂 Smart File Selection**: Tree-based interface with folder and file-level selection
- **⚡ Real-time Processing**: Live webhook notifications for instant feedback
- **📊 Split-View Dashboard**: Embedded status dashboard alongside file selector (auto-shows on startup)
- **🔄 Auto-indexing**: Optional automatic processing on file changes
- **🎯 Selective Indexing**: Choose exactly which files to process
- **📈 Progress Tracking**: Real-time job monitoring and metrics
- **🛠️ Configurable**: Customizable server URLs, API keys, and processing settings

## 🎯 Quick Start

When the extension activates, both the **📊 File Selector** and **📈 Live Dashboard** views will automatically appear in a dedicated String sidebar (database icon in Activity Bar), giving you an immediate split-view experience.

### Manual Control

- **Show Both Views**: Use `Ctrl+Shift+P` → "String: Show Both Views" or click the split icon in the file selector toolbar
- **Configure Auto-Show**: Disable automatic view showing in Settings → "Show Both Views On Startup"
