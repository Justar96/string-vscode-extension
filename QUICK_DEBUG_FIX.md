# 🔧 Quick Fix: F5 Extension Debugging Issue

## **Problem**
When pressing F5, VS Code shows a dialog about "JSON with Comments" extension instead of launching the extension development host.

## **✅ Solution Steps**

### **1. Close the Dialog**
- Click **"Cancel"** on the JSON extension dialog

### **2. Verify Workspace Context**
Make sure you have the **extension project folder** open as the main workspace:
```
File → Open Folder → Select: mcp-codebase-indexer
```

### **3. Use the Debug Panel Method**
Instead of F5, use the Run and Debug panel:

1. **Open Debug Panel**: 
   - Click the "Run and Debug" icon in the Activity Bar (play button with bug icon)
   - OR: `Ctrl+Shift+D`

2. **Select Configuration**:
   - In the dropdown at the top, select **"Run Extension"**
   - Click the green ▶️ **"Start Debugging"** button

### **4. Alternative: Command Palette Method**
1. Open Command Palette: `Ctrl+Shift+P`
2. Type: `Debug: Start Debugging`
3. Select **"Run Extension"** from the list

### **5. Manual F5 Fix**
If F5 still doesn't work:

1. **Open a TypeScript file** in the project (like `src/extension.ts`)
2. **Then press F5** - this gives VS Code the right context
3. Select **"Run Extension"** when prompted

## **🎯 Expected Result**
- A new VS Code window opens with "[Extension Development Host]" in the title
- Your extension is loaded and active in that window
- Console should show: "String Codebase Indexer is now active!"

## **🐛 If Still Not Working**

### **Rebuild and Try Again**
```bash
# Clean and rebuild
npm run compile
```

### **Check the Output Panel**
- `View → Output`
- Select "Tasks" from dropdown
- Look for any compilation errors

### **Verify Extension Activation**
In the new Extension Development Host window:
- Look for the database icon in the Activity Bar (String extension)
- If not visible, check `Extensions` view - your extension should be listed

## **🚀 Quick Test Commands**
Once the Extension Development Host is running:

1. **Open Command Palette**: `Ctrl+Shift+P`
2. **Type "String"** - you should see your extension commands:
   - `String: Scan and Select Files`
   - `String: Show Options Menu`
   - `String: Toggle Auto-indexing`

If you see these commands, your extension is working! 🎉 