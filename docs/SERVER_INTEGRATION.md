# Backend Server Integration Guide

This document explains how to integrate your backend server with the String VS Code Extension.

## Overview

The extension communicates with your backend server through HTTP APIs and optional webhook notifications. This allows for real-time processing feedback and status updates.

## Required Endpoints

### POST /index/chunk

Your server must implement this endpoint to receive code chunks for processing.

#### Request Format
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
      "line_end": 50,
      "hash": "sha256_hash_of_content"
    }
  ],
  "metadata": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "source": "vscode-extension",
    "extension_version": "0.0.4"
  }
}
```

#### Response Format
```json
{
  "success": true,
  "job_id": "unique-job-identifier",
  "message": "Chunks queued for processing",
  "estimated_time": "30s"
}
```

### GET /health (Optional)

Health check endpoint for connection testing.

#### Response Format
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Webhook Integration

For real-time status updates, your server can send completion notifications back to the extension.

### Webhook URL

The extension provides a webhook URL in each request: `http://localhost:{port}/webhook/job-complete`

### Webhook Payload

When processing is complete, POST to the webhook URL:

```json
{
  "job_id": "unique-job-identifier",
  "status": "completed",
  "success": true,
  "processed_files": 5,
  "total_chunks": 25,
  "total_tokens": 15000,
  "processing_time_ms": 1250,
  "result_data": {
    "vector_storage": {
      "collection_name": "my_codebase",
      "index_count": 25
    }
  },
  "error_message": null
}
```

## Implementation Examples

### Python FastAPI Example

```python
from fastapi import FastAPI, HTTPException
import httpx
import asyncio

app = FastAPI()

@app.post("/index/chunk")
async def process_chunks(request: ChunkRequest):
    try:
        # Process chunks asynchronously
        job_id = request.job_id
        
        # Start background processing
        asyncio.create_task(process_chunks_background(request))
        
        return {
            "success": True,
            "job_id": job_id,
            "message": "Chunks queued for processing"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def process_chunks_background(request: ChunkRequest):
    # Your processing logic here
    # ...
    
    # Send webhook notification when complete
    webhook_payload = {
        "job_id": request.job_id,
        "status": "completed",
        "success": True,
        "processed_files": len(request.chunks),
        "total_chunks": len(request.chunks)
    }
    
    async with httpx.AsyncClient() as client:
        await client.post(request.webhook_url, json=webhook_payload)
```

### Node.js Express Example

```javascript
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/index/chunk', async (req, res) => {
  try {
    const { job_id, chunks, webhook_url } = req.body;
    
    // Start background processing
    processChunksBackground(req.body);
    
    res.json({
      success: true,
      job_id: job_id,
      message: 'Chunks queued for processing'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function processChunksBackground(request) {
  // Your processing logic here
  // ...
  
  // Send webhook notification
  const webhookPayload = {
    job_id: request.job_id,
    status: 'completed',
    success: true,
    processed_files: request.chunks.length,
    total_chunks: request.chunks.length
  };
  
  try {
    await axios.post(request.webhook_url, webhookPayload);
  } catch (error) {
    console.error('Webhook delivery failed:', error);
  }
}
```

## Configuration

### Extension Settings

Configure these settings in VS Code:

```json
{
  "string-codebase-indexer.url": "http://localhost:8000",
  "string-codebase-indexer.apiKey": "your-api-key",
  "string-codebase-indexer.enableWebhooks": true,
  "string-codebase-indexer.webhookPort": 3000
}
```

### Server Configuration

Your server should:

1. **Handle Authentication**: Check API key if provided
2. **Validate Requests**: Ensure required fields are present
3. **Process Asynchronously**: Don't block the HTTP response
4. **Send Webhooks**: Notify completion via webhook URL
5. **Handle Errors**: Return appropriate error responses

## Testing

### Manual Testing

1. **Start your server** on the configured URL
2. **Configure extension** with your server URL
3. **Select files** in VS Code and start indexing
4. **Check server logs** for incoming requests
5. **Verify webhooks** are being sent back

### Mock Server

For development, you can use this simple mock server:

```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.post('/index/chunk', (req, res) => {
  console.log('Received chunks:', req.body.chunks.length);
  
  // Simulate processing time
  setTimeout(async () => {
    const webhookPayload = {
      job_id: req.body.job_id,
      status: 'completed',
      success: true,
      processed_files: req.body.chunks.length
    };
    
    // Send webhook
    const axios = require('axios');
    try {
      await axios.post(req.body.webhook_url, webhookPayload);
    } catch (error) {
      console.error('Webhook failed:', error.message);
    }
  }, 2000);
  
  res.json({
    success: true,
    job_id: req.body.job_id,
    message: 'Processing started'
  });
});

app.listen(8000, () => {
  console.log('Mock server running on port 8000');
});
```

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check server URL and port
2. **Webhook Timeout**: Ensure webhook port is accessible
3. **Authentication Errors**: Verify API key configuration
4. **Large Payloads**: Consider increasing server payload limits

### Debug Mode

Enable debug logging in VS Code:

```json
{
  "string-codebase-indexer.debug": true
}
```

### Server Logs

Monitor your server logs for:
- Incoming chunk requests
- Processing errors
- Webhook delivery status
- Performance metrics

## Security Considerations

1. **API Authentication**: Use secure API keys
2. **HTTPS**: Use HTTPS in production
3. **Input Validation**: Validate all incoming data
4. **Rate Limiting**: Implement rate limiting
5. **Error Handling**: Don't expose sensitive information in errors

## Performance Tips

1. **Batch Processing**: Process chunks in batches
2. **Async Operations**: Use asynchronous processing
3. **Connection Pooling**: Reuse HTTP connections
4. **Caching**: Cache processed results
5. **Resource Limits**: Monitor memory and CPU usage