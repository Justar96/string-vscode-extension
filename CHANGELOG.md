# Changelog

All notable changes to the String Codebase Indexer extension are documented in this file.

## [0.0.4] - 2024-12-19

### Changed
- **Extension Name**: Changed from "MCP Codebase Indexer" to "String Codebase Indexer"
- **Configuration**: Updated all configuration keys from `mcp-codebase-indexer.*` to `string-codebase-indexer.*`
- **Settings**: Updated VS Code settings.json to use new configuration namespace
- **Documentation**: Updated all documentation files to reflect new extension name

### Migration Notes
- Users upgrading from v0.0.3 will need to update their settings.json configuration keys
- All functionality remains identical, only the naming has changed

## [0.0.3] - 2024-12-19

### Added

#### Webhook Integration
- Implemented Express.js HTTP server for receiving job completion notifications from MCP servers
- Added webhook URL injection in chunk submission payloads when webhooks are enabled
- Created job tracking system using in-memory Map to correlate webhook responses with submitted files
- Added configuration options: `enableWebhooks` (boolean) and `webhookPort` (number)

#### Real-Time UI Updates
- Enhanced status bar to display active job count and webhook connectivity status
- Implemented immediate notification system for processing completion and failures
- Added webhook status indicators in main menu and status information displays
- Created live job tracking with automatic cleanup on completion

#### Enhanced Payload Structure
- Extended chunk submission payload with metadata object including:
  - SHA-256 content hash for validation
  - ISO timestamp for submission tracking
  - Webhook callback URL for completion notifications
  - Source identification and extension version
  - Job type classification and user identification

### Changed

#### Processing Architecture
- Modified chunk submission to include webhook metadata when enabled
- Updated status bar logic to handle both traditional indexing and webhook-based job tracking
- Enhanced error handling to gracefully degrade when webhook server fails to start
- Improved job lifecycle management with proper cleanup on completion/failure

#### Configuration Management
- Consolidated webhook-related settings under new configuration section
- Updated configuration validation to ensure webhook port availability
- Enhanced settings documentation with technical implementation details

### Technical Details

#### Dependencies
- Added Express.js 4.21.2 for webhook server implementation
- Added @types/express 4.17.22 for TypeScript development support

#### Server Implementation
- Webhook server binds to localhost on configurable port (default: 3000)
- Implements `/webhook/job-complete` endpoint for receiving MCP server notifications
- Includes `/health` endpoint for connectivity verification
- Automatic server lifecycle management (start on activation, cleanup on deactivation)

#### Error Handling
- Graceful fallback when webhook server fails to start (port conflicts, permissions)
- Automatic retry logic for webhook delivery failures
- Comprehensive error logging for debugging webhook connectivity issues

## [0.0.1] - 2024-12-19

### Added
- Initial extension implementation with VS Code TreeView integration
- Workspace file discovery with configurable exclusion patterns
- Multi-language support: Python, TypeScript, JavaScript, Java, Go
- Intelligent code chunking with configurable size limits
- HTTP POST integration with MCP server `/index/chunk` endpoint
- Batch processing with concurrency control to manage server load
- Visual progress tracking during file processing operations
- Command palette integration for manual workspace scanning
- Configuration system for server URL, API authentication, and processing parameters