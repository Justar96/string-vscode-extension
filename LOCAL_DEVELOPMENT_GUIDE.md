# 🛠️ Local Development Testing Guide

## **Prerequisites**

### **✅ Environment Requirements**
- **Node.js**: v20.x (Currently: v10.9.2 ✅)
- **npm**: Latest version 
- **VS Code**: Version 1.100.0 or higher
- **TypeScript**: v5.8.3 (included in devDependencies)

---

## **🚀 Development Setup**

### **1. Install Dependencies**
```bash
# Install all dependencies
npm install

# Verify installation
npm list --depth=0
```

### **2. Build the Extension**
```bash
# Compile TypeScript to JavaScript
npm run compile

# Or watch for changes during development
npm run watch
```

### **3. Run Linting**
```bash
# Check for code quality issues
npm run lint

# Run tests (optional)
npm run test
```

---

## **🧪 Testing in VS Code Development Mode**

### **Method 1: Extension Development Host (Recommended)**

1. **Open the extension project in VS Code**:
   ```bash
   code .
   ```

2. **Start the TypeScript compiler in watch mode**:
   ```bash
   npm run watch
   ```

3. **Launch Extension Development Host**:
   - Press `F5` (or `Ctrl+F5`)
   - OR: `View` → `Run and Debug` → Click `▶️ Run Extension`
   - OR: Command Palette (`Ctrl+Shift+P`) → `Debug: Start Debugging`

4. **A new VS Code window opens** with your extension loaded in development mode

### **Method 2: Manual Installation (VSIX)**

1. **Package the extension**:
   ```bash
   # Install vsce if not already installed
   npm install -g @vscode/vsce
   
   # Package the extension
   vsce package
   ```

2. **Install the VSIX file**:
   - `Extensions` → `⋯` (More Actions) → `Install from VSIX...`
   - Select the generated `.vsix` file

---

## **🔍 Testing Our Recent Fixes**

### **Test 1: Dashboard Reset on Stop**

**Steps**:
1. Open a workspace with code files
2. Start indexing: `Ctrl+Shift+P` → `String: Scan and Select Files`
3. Select some files and start indexing
4. **IMMEDIATELY** stop the process: `Ctrl+Shift+P` → `String: Stop Indexing`
5. Check the dashboard

**Expected Result**: 
- ✅ Dashboard should clear immediately
- ✅ No "phantom" active jobs
- ✅ Stats reset to zero

### **Test 2: Dashboard Reset Between Sessions**

**Steps**:
1. Complete a full indexing session
2. Wait for completion
3. Start a NEW indexing session
4. Check dashboard at start

**Expected Result**:
- ✅ Dashboard starts fresh (not accumulated from previous session)
- ✅ Total files shows current session count only

### **Test 3: File Selection Synchronization**

**Steps**:
1. Open the String sidebar (database icon in Activity Bar)
2. Select/deselect individual files
3. Select/deselect entire folders
4. Use "Select All" and "Deselect All" buttons

**Expected Result**:
- ✅ Tree view updates immediately
- ✅ Selection count is accurate
- ✅ Folder selection affects all child files

### **Test 4: Faster Job Cleanup**

**Steps**:
1. Index a few small files
2. Watch the "Active Jobs" section in dashboard
3. Time how long jobs remain visible after completion

**Expected Result**:
- ✅ Completed jobs disappear after ~2 seconds (was 3s before)

### **Test 5: Smart Auto-Refresh**

**Steps**:
1. Monitor dashboard refresh behavior
2. When jobs are active vs when idle

**Expected Result**:
- ✅ Faster refresh (2s) when jobs active
- ✅ Slower refresh (5s) when idle

---

## **🐛 Debugging Tips**

### **Console Logging**
- Open Developer Tools: `Help` → `Toggle Developer Tools`
- Check `Console` for extension logs
- Look for our debug messages starting with `🛑`, `✅`, `🧹`, etc.

### **Extension Output**
- `View` → `Output` → Select `Log (Extension Host)` from dropdown
- Shows extension activation and error messages

### **Common Debug Commands**
```javascript
// In extension development console
// Check extension state
console.log("Extension state:", extensionState);

// Check dashboard stats
console.log("Dashboard stats:", extensionState.statusManager.getDashboardStats());

// Check active jobs
console.log("Active jobs:", extensionState.statusManager.getActiveJobMetrics());
```

---

## **⚙️ Configuration for Testing**

### **Recommended Test Settings**
Add to VS Code settings.json for testing:

```json
{
  "string-codebase-indexer.url": "https://mcp.rabtune.com",
  "string-codebase-indexer.enableWebhooks": true,
  "string-codebase-indexer.webhookPort": 3000,
  "string-codebase-indexer.batchSize": 2,
  "string-codebase-indexer.maxChunkSize": 500,
  "string-codebase-indexer.autoIndexOnStartup": false,
  "string-codebase-indexer.showBothViewsOnStartup": true
}
```

### **Test with Mock Server (Optional)**
Create a simple test server to verify webhook functionality:

```javascript
// test-server.js
const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook/job-complete', (req, res) => {
  console.log('🎣 Received webhook:', req.body);
  res.json({ received: true, timestamp: new Date().toISOString() });
});

app.listen(3000, () => {
  console.log('🎯 Test webhook server running on port 3000');
});
```

---

## **📋 Testing Checklist**

### **Basic Functionality**
- [ ] Extension activates without errors
- [ ] String sidebar appears in Activity Bar
- [ ] File tree loads and displays correctly
- [ ] Dashboard webview loads

### **Our Recent Fixes**
- [ ] **Dashboard Reset**: Stops clear dashboard immediately
- [ ] **Session Isolation**: New sessions start with clean dashboard
- [ ] **Job Cleanup**: Completed jobs disappear in ~2 seconds
- [ ] **Selection Sync**: File selection updates tree view correctly
- [ ] **Auto-refresh**: Different refresh rates for active vs idle

### **Error Scenarios**
- [ ] Network errors handled gracefully
- [ ] Invalid server URL shows appropriate message
- [ ] Large file handling doesn't crash extension
- [ ] Cancellation works mid-process

---

## **🎯 Performance Testing**

### **Load Testing**
- Test with 100+ files
- Test with large files (>1MB)
- Test rapid start/stop cycles
- Test concurrent file selection changes

### **Memory Testing**
- Monitor extension memory usage in Task Manager
- Check for memory leaks during multiple sessions
- Verify cleanup after extension deactivation

---

## **📝 Reporting Issues**

When testing, document:
1. **Steps to reproduce**
2. **Expected vs actual behavior**
3. **Console error messages**
4. **Extension version and VS Code version**
5. **System specs (OS, Node version)**

---

## **🚀 Quick Start Commands**

```bash
# Full development cycle
npm install
npm run compile
code .
# Press F5 to launch Extension Development Host

# Continuous development
npm run watch  # In one terminal
# F5 in VS Code to test changes
```

This guide ensures you can thoroughly test all the fixes we implemented and catch any regressions! 🎉 