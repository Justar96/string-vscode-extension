# Developer Setup Guide

Welcome to the String VS Code Extension project! This guide will help you set up the development environment and customize the extension for your own use.

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- VS Code
- Git

### 1. Clone and Setup
```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
npm install
```

### 2. Development
```bash
# Compile TypeScript
npm run compile

# Watch for changes during development
npm run watch

# Run in Extension Development Host
# Press F5 in VS Code to launch extension development instance
```

### 3. Testing
```bash
# Run tests
npm test

# Lint code
npm run lint
```

## 📝 Configuration for Your Project

### Required Changes

1. **Update package.json**:
   ```json
   {
     "name": "your-extension-name",
     "displayName": "Your Extension Display Name",
     "publisher": "your-publisher-name",
     "repository": {
       "url": "https://github.com/your-username/your-repo-name.git"
     }
   }
   ```

2. **Configure Server Settings**:
   - Update `string-codebase-indexer.url` default in package.json
   - Set your server endpoint (default: http://localhost:8000)
   - Configure API authentication if needed

3. **Customize Branding**:
   - Replace `icon.png` with your 128x128 icon
   - Update `icon.svg` for development
   - Modify display names and descriptions

### Server Integration

Your backend server should implement these endpoints:

#### POST /index/chunk
Submit code chunks for indexing:
```json
{
  "user_id": "unique-user-identifier",
  "job_id": "unique-job-identifier", 
  "webhook_url": "http://localhost:3000/webhook/job-complete",
  "chunks": [
    {
      "file_path": "src/example.ts",
      "content": "code content here",
      "line_start": 1,
      "line_end": 50
    }
  ]
}
```

#### POST /webhook/job-complete (Extension → Server notification)
Extension listens for completion notifications:
```json
{
  "job_id": "unique-job-identifier",
  "status": "completed",
  "processed_files": 5,
  "total_chunks": 25,
  "total_tokens": 15000
}
```

### Environment Variables (Optional)

Create `.env` file for development:
```env
# Development server settings
DEFAULT_SERVER_URL=http://localhost:8000
DEFAULT_API_KEY=your-dev-api-key
WEBHOOK_PORT=3000
```

## 🏗️ Architecture Overview

### Core Components

1. **TreeDataProvider** (`src/extension.ts`):
   - File selection and management
   - Checkbox state handling
   - Folder/file tree structure

2. **Dashboard Provider** (`src/extension.ts`):
   - Real-time status display
   - Progress tracking
   - Webhook notifications

3. **Indexing Engine**:
   - File chunking and processing
   - Batch HTTP requests
   - Error handling and retries

4. **Webhook Server**:
   - Express.js server for notifications
   - Real-time UI updates
   - Job completion tracking

### File Structure
```
src/
├── extension.ts          # Main extension logic
├── test/                 # Test files
└── ...

out/                      # Compiled JavaScript
package.json             # Extension manifest
README.md               # User documentation
DEVELOPER_SETUP.md      # This file
```

## 🔧 Customization Options

### Adding New Features

1. **New Commands**: Add to `package.json` contributes.commands
2. **Settings**: Add to `package.json` contributes.configuration  
3. **Views**: Modify contributes.views for UI changes
4. **Keybindings**: Add contributes.keybindings

### Webhook Integration

The extension includes a built-in Express.js server for real-time notifications. To customize:

1. **Change Webhook Port**: Modify `webhookPort` setting
2. **Add Authentication**: Extend webhook middleware
3. **Custom Endpoints**: Add routes to webhook server

### UI Customization

1. **Icons**: Update VS Code built-in icons or add custom ones
2. **Colors**: Use VS Code theme colors for consistency
3. **Layout**: Modify webview HTML in dashboard provider

## 📦 Publishing

### VS Code Marketplace

1. **Install vsce**: `npm install -g @vscode/vsce`
2. **Create Publisher**: https://marketplace.visualstudio.com/manage
3. **Package**: `vsce package`
4. **Publish**: `vsce publish`

### Open Source Release

1. **Update Version**: `npm version patch/minor/major`
2. **Update CHANGELOG.md**: Document changes
3. **Create Release**: GitHub releases with .vsix file
4. **Tag Release**: `git tag v0.0.5 && git push --tags`

## 🐛 Troubleshooting

### Common Issues

1. **Server Connection**: Check URL and network connectivity
2. **Webhook Port**: Ensure port 3000 is available
3. **File Permissions**: Verify workspace read permissions
4. **Extension Loading**: Check Output → String for errors

### Debug Mode

Enable debug logging:
```json
{
  "string-codebase-indexer.debug": true
}
```

### Development Console

View extension logs:
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run "Developer: Toggle Developer Tools"
3. Check Console tab for extension logs

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push branch: `git push origin feature/your-feature`
5. Submit Pull Request

### Code Style

- Use TypeScript strict mode
- Follow VS Code extension conventions
- Add JSDoc comments for public methods
- Update tests for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 