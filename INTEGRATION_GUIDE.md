# Integration with Existing MCP Server

## Current Extension Configuration

The VS Code extension is configured to work with the following API contract:

### Default Settings
- **Endpoint**: `POST /index/chunk`
- **Base URL**: `http://localhost:8000` (configurable via `mcp.url`)
- **Authentication**: Bearer token via `mcp.apiKey` (optional)

### Request Format
```json
{
  "path": "/absolute/path/to/file.py",
  "idx": 0,
  "content": "chunk of code content..."
}
```

### Headers
```
Content-Type: application/json
Authorization: Bearer <token>  // if mcp.apiKey is set
```

## Adapting to Your Server

### Option 1: Server-Side Adapter (Recommended)
If your existing server uses a different format, create an adapter endpoint:

```python
# Add this to your existing server
@app.post("/index/chunk")
async def vscode_adapter(chunk: dict):
    """Adapter for VS Code extension"""
    # Transform to your server's format
    your_format = {
        "file_path": chunk["path"],
        "chunk_index": chunk["idx"],
        "code_content": chunk["content"]
        # ... other fields your server expects
    }
    
    # Call your existing processing function
    return await your_existing_chunk_handler(your_format)
```

### Option 2: Modify Extension
If you prefer to modify the extension, I can update it to match your server's API.

## Common Server Variations

### Different Endpoint
If your server uses `/api/v1/code/index` instead of `/index/chunk`:

**VS Code Settings:**
```json
{
  "mcp.url": "http://your-server.com/api/v1/code"
}
```

**Extension Change Needed:**
```typescript
// In src/extension.ts, change:
await fetch(url + "/index", {  // instead of "/index/chunk"
```

### Different Request Format
If your server expects:
```json
{
  "file_path": "/path/to/file.py",
  "chunk_id": 0,
  "source_code": "content...",
  "metadata": {
    "language": "python",
    "size": 1000
  }
}
```

**Extension Modification:**
```typescript
const payload = {
  file_path: uri.fsPath,
  chunk_id: i,
  source_code: slice,
  metadata: {
    language: getLanguageFromPath(uri.fsPath),
    size: slice.length
  }
};
```

### Authentication Variations

#### API Key in Header (Current)
```
Authorization: Bearer your-api-key
```

#### API Key in Query Parameter
```typescript
await fetch(`${url}/index/chunk?api_key=${apiKey}`, {
```

#### Custom Header
```typescript
headers: {
  "Content-Type": "application/json",
  "X-API-Key": apiKey
}
```

## Testing Integration

### 1. Test Server Connectivity
```bash
# Test if your server is accessible
curl -X GET http://your-server-url/health

# Test the chunk endpoint
curl -X POST http://your-server-url/index/chunk \
  -H "Content-Type: application/json" \
  -d '{"path":"/test.py","idx":0,"content":"print(\"hello\")"}'
```

### 2. Configure Extension
1. Open VS Code Settings (`Ctrl+,`)
2. Search for "mcp"
3. Set:
   - `mcp.url`: Your server URL
   - `mcp.apiKey`: Your API key (if required)
   - `mcp.maxChunkSize`: Appropriate chunk size

### 3. Test Extension
1. Open a workspace with code files
2. Watch for "MCP: indexing..." in status bar
3. Check your server logs for incoming requests

## Troubleshooting

### Connection Issues
- Verify server URL is correct and accessible
- Check firewall/network settings
- Ensure server is running and healthy

### Authentication Issues
- Verify API key is correct
- Check if your server expects different auth format
- Look at server logs for auth errors

### Format Issues
- Check server logs for request format errors
- Verify the payload structure matches expectations
- Test with curl first to isolate issues

## Quick Modifications

If you need the extension modified for your server, please provide:

1. **Your server's endpoint URL**
2. **Expected request format (JSON structure)**
3. **Authentication method**
4. **Any special headers required**

I can quickly update the extension code to match your server's requirements.

## Example Server Configurations

### Configuration A: Different Endpoint
```json
{
  "mcp.url": "https://api.yourcompany.com/v2/codebase",
  "mcp.apiKey": "your-secret-key"
}
```
Extension sends to: `POST https://api.yourcompany.com/v2/codebase/index/chunk`

### Configuration B: Local Development
```json
{
  "mcp.url": "http://localhost:3000/api",
  "mcp.maxChunkSize": 500
}
```
Extension sends to: `POST http://localhost:3000/api/index/chunk`

### Configuration C: Production with Auth
```json
{
  "mcp.url": "https://mcp-prod.yourcompany.com",
  "mcp.apiKey": "prod-api-key-here",
  "mcp.maxChunkSize": 2000
}
```
Extension sends to: `POST https://mcp-prod.yourcompany.com/index/chunk`

Let me know your server's specific requirements and I'll help you integrate perfectly!
