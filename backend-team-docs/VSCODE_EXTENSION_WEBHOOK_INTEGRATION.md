# VSCode Extension Webhook Integration Guide

## 🎯 Overview

The MCP system now supports **real-time webhook notifications** for job completion events. When a job completes (successfully or with errors), the system will automatically send an HTTP POST request to your specified webhook endpoint with complete job data.

This enables your VSCode extension to:
- ✅ Receive instant notifications when code processing is complete
- ✅ Access complete job results and metadata immediately
- ✅ Provide real-time feedback to users
- ✅ Retrieve processed data from the vector store efficiently

## 🚀 Quick Start

### 1. Set Up Webhook Endpoint

Create an HTTP endpoint in your VSCode extension backend to receive webhook notifications:

```typescript
// Example Express.js endpoint
app.post('/api/webhook/job-complete', (req, res) => {
    const jobData = req.body;
    
    console.log(`Job ${jobData.job_id} completed with status: ${jobData.status}`);
    
    if (jobData.success) {
        // Handle successful job completion
        handleJobSuccess(jobData);
    } else {
        // Handle job failure
        handleJobFailure(jobData);
    }
    
    res.status(200).json({ received: true });
});
```

### 2. Include Webhook URL in Job Requests

When creating jobs via the MCP API, include your webhook URL in the job metadata:

```typescript
const jobRequest = {
    job_type: "file_processing",
    user_id: "your_user_id",
    metadata: {
        file_path: "/workspace/src/example.py",
        chunk_index: 0,
        content_length: 1024,
        webhook_url: "https://your-extension-backend.com/api/webhook/job-complete",
        source: "vscode-extension",
        extension_version: "1.2.3",
        workspace_id: "workspace-123"
    }
};
```

### 3. Handle Webhook Notifications

Process the webhook payload to access job results:

```typescript
function handleJobSuccess(jobData: WebhookPayload) {
    const { job_id, result_data, metadata, metrics } = jobData;
    
    // Access processed chunks
    const chunksProcessed = result_data.chunks_processed;
    
    // Get vector storage information
    const vectorInfo = result_data.vector_storage;
    const collectionName = vectorInfo.collection_name;
    
    // Access performance metrics
    const processingTime = metrics.processing_time_ms;
    
    // Notify user in VSCode
    vscode.window.showInformationMessage(
        `Code processing complete! ${chunksProcessed} chunks processed in ${processingTime}ms`
    );
    
    // Update UI or trigger next actions
    updateCodeAnalysisView(result_data);
}
```

## 📋 Webhook Payload Structure

The webhook payload contains complete job information in JSON format:

```json
{
    "job_id": "f004a3c5-0c84-4b03-a65d-d1f7c116d68a",
    "status": "completed",
    "success": true,
    "completed_at": "2024-06-05T12:34:56.789Z",
    "duration_seconds": 12.5,
    "result_data": {
        "chunks_processed": 8,
        "file_path": "/workspace/src/example.py",
        "vector_storage": {
            "collection_name": "user_test_user_123_code",
            "embeddings_generated": 8,
            "storage_success": true,
            "vector_ids": ["vec_1", "vec_2", "vec_3", "vec_4", "vec_5", "vec_6", "vec_7", "vec_8"]
        },
        "analysis_result": {
            "functions_found": 5,
            "classes_found": 2,
            "imports_found": 3,
            "complexity_score": 7.2
        },
        "file_metadata": {
            "language": "python",
            "line_count": 156,
            "character_count": 4096
        }
    },
    "error_message": null,
    "warnings": ["Large file processed - consider splitting"],
    "metrics": {
        "processing_time_ms": 2500,
        "chunks_count": 8,
        "file_size_bytes": 4096,
        "embedding_time_ms": 1200,
        "storage_time_ms": 300
    },
    "metadata": {
        "file_path": "/workspace/src/example.py",
        "chunk_index": 0,
        "content_length": 1024,
        "webhook_url": "https://your-extension-backend.com/api/webhook/job-complete",
        "source": "vscode-extension",
        "extension_version": "1.2.3",
        "workspace_id": "workspace-123"
    }
}
```

### Payload Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | Unique identifier for the job |
| `status` | string | Job status: "completed" or "failed" |
| `success` | boolean | Whether the job completed successfully |
| `completed_at` | string | ISO timestamp of job completion |
| `duration_seconds` | number | Total job execution time |
| `result_data` | object | Job-specific results and processed data |
| `error_message` | string\|null | Error details if job failed |
| `warnings` | string[] | Non-fatal warnings during processing |
| `metrics` | object | Performance metrics and timing data |
| `metadata` | object | Original job metadata (preserved) |

## 🔧 Implementation Examples

### TypeScript Interface

```typescript
interface WebhookPayload {
    job_id: string;
    status: 'completed' | 'failed';
    success: boolean;
    completed_at: string;
    duration_seconds: number;
    result_data: {
        chunks_processed: number;
        file_path: string;
        vector_storage: {
            collection_name: string;
            embeddings_generated: number;
            storage_success: boolean;
            vector_ids: string[];
        };
        analysis_result: {
            functions_found: number;
            classes_found: number;
            imports_found: number;
            complexity_score: number;
        };
        file_metadata: {
            language: string;
            line_count: number;
            character_count: number;
        };
    };
    error_message: string | null;
    warnings: string[];
    metrics: {
        processing_time_ms: number;
        chunks_count: number;
        file_size_bytes: number;
        embedding_time_ms: number;
        storage_time_ms: number;
    };
    metadata: Record<string, any>;
}
```

### Express.js Webhook Handler

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/webhook/job-complete', (req, res) => {
    try {
        const jobData = req.body;
        
        // Validate payload
        if (!jobData.job_id || !jobData.status) {
            return res.status(400).json({ error: 'Invalid payload' });
        }
        
        // Log job completion
        console.log(`[WEBHOOK] Job ${jobData.job_id} ${jobData.status}`);
        
        if (jobData.success) {
            // Handle successful completion
            const { result_data, metrics } = jobData;
            
            console.log(`Processed ${result_data.chunks_processed} chunks in ${metrics.processing_time_ms}ms`);
            
            // Store results for extension access
            storeJobResults(jobData.job_id, result_data);
            
            // Notify VSCode extension
            notifyExtension('job-completed', {
                jobId: jobData.job_id,
                chunksProcessed: result_data.chunks_processed,
                collectionName: result_data.vector_storage.collection_name,
                processingTime: metrics.processing_time_ms
            });
            
        } else {
            // Handle job failure
            console.error(`Job failed: ${jobData.error_message}`);
            
            // Notify extension of failure
            notifyExtension('job-failed', {
                jobId: jobData.job_id,
                error: jobData.error_message,
                warnings: jobData.warnings
            });
        }
        
        // Always respond with 200 to acknowledge receipt
        res.status(200).json({ 
            received: true, 
            timestamp: new Date().toISOString() 
        });
        
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function storeJobResults(jobId, resultData) {
    // Store results in your preferred storage (Redis, database, etc.)
    // This allows the extension to retrieve results later if needed
}

function notifyExtension(event, data) {
    // Send notification to VSCode extension
    // This could be via WebSocket, Server-Sent Events, or polling
}
```

### VSCode Extension Integration

```typescript
// In your VSCode extension
import * as vscode from 'vscode';

class CodeProcessingManager {
    private activeJobs = new Map<string, JobInfo>();
    
    async processFile(filePath: string): Promise<void> {
        const jobId = await this.submitProcessingJob(filePath);
        
        // Store job info for tracking
        this.activeJobs.set(jobId, {
            filePath,
            startTime: Date.now(),
            status: 'processing'
        });
        
        // Show progress to user
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Processing ${path.basename(filePath)}...`,
            cancellable: false
        }, async (progress) => {
            // Wait for webhook notification or timeout
            return this.waitForJobCompletion(jobId);
        });
    }
    
    async submitProcessingJob(filePath: string): Promise<string> {
        const response = await fetch('https://mcp-api.example.com/jobs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                job_type: 'file_processing',
                user_id: this.userId,
                metadata: {
                    file_path: filePath,
                    webhook_url: 'https://your-backend.com/api/webhook/job-complete',
                    source: 'vscode-extension',
                    extension_version: this.extensionVersion,
                    workspace_id: vscode.workspace.name
                }
            })
        });
        
        const result = await response.json();
        return result.job_id;
    }
    
    handleWebhookNotification(jobData: WebhookPayload): void {
        const jobInfo = this.activeJobs.get(jobData.job_id);
        if (!jobInfo) return;
        
        if (jobData.success) {
            // Update UI with results
            this.showProcessingResults(jobData);
            
            // Store vector collection info for future queries
            this.storeVectorInfo(jobData.result_data.vector_storage);
            
        } else {
            // Show error to user
            vscode.window.showErrorMessage(
                `Code processing failed: ${jobData.error_message}`
            );
        }
        
        // Clean up
        this.activeJobs.delete(jobData.job_id);
    }
    
    private showProcessingResults(jobData: WebhookPayload): void {
        const { result_data, metrics } = jobData;
        
        vscode.window.showInformationMessage(
            `✅ Processing complete! ${result_data.chunks_processed} chunks processed in ${metrics.processing_time_ms}ms`
        );
        
        // Update code analysis view
        this.updateAnalysisView(result_data.analysis_result);
    }
}
```

## 🛡️ Error Handling & Best Practices

### 1. Webhook Endpoint Requirements

- **Always return HTTP 200** for successful receipt
- **Respond quickly** (< 5 seconds) to avoid timeouts
- **Validate payload** before processing
- **Handle errors gracefully** without crashing

### 2. Reliability Considerations

```typescript
app.post('/api/webhook/job-complete', async (req, res) => {
    // Respond immediately to acknowledge receipt
    res.status(200).json({ received: true });
    
    // Process webhook asynchronously
    setImmediate(async () => {
        try {
            await processWebhookData(req.body);
        } catch (error) {
            console.error('Async webhook processing failed:', error);
            // Handle error without affecting webhook response
        }
    });
});
```

### 3. Security Considerations

- **Validate webhook source** (consider adding signature verification)
- **Sanitize input data** before processing
- **Use HTTPS** for webhook URLs
- **Implement rate limiting** to prevent abuse

### 4. Monitoring & Debugging

```typescript
// Add comprehensive logging
app.post('/api/webhook/job-complete', (req, res) => {
    const startTime = Date.now();
    const jobId = req.body?.job_id || 'unknown';
    
    console.log(`[WEBHOOK] Received notification for job ${jobId}`);
    
    try {
        processJobCompletion(req.body);
        
        const duration = Date.now() - startTime;
        console.log(`[WEBHOOK] Successfully processed job ${jobId} in ${duration}ms`);
        
        res.status(200).json({ received: true, processing_time_ms: duration });
        
    } catch (error) {
        console.error(`[WEBHOOK] Failed to process job ${jobId}:`, error);
        res.status(200).json({ received: true, error: 'Processing failed' });
    }
});
```

## 🔍 Testing Your Integration

### 1. Test Webhook Endpoint

Use tools like ngrok for local testing:

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use the ngrok URL as your webhook_url
# https://abc123.ngrok.io/api/webhook/job-complete
```

### 2. Validate Payload Processing

```typescript
// Test with sample payload
const samplePayload = {
    job_id: "test-job-123",
    status: "completed",
    success: true,
    completed_at: new Date().toISOString(),
    duration_seconds: 5.2,
    result_data: {
        chunks_processed: 3,
        file_path: "/test/sample.py",
        vector_storage: {
            collection_name: "user_test_code",
            embeddings_generated: 3,
            storage_success: true,
            vector_ids: ["vec_1", "vec_2", "vec_3"]
        }
    },
    error_message: null,
    warnings: [],
    metrics: {
        processing_time_ms: 1500,
        chunks_count: 3,
        file_size_bytes: 1024
    },
    metadata: {
        file_path: "/test/sample.py",
        source: "vscode-extension"
    }
};

// Test your handler
handleWebhookNotification(samplePayload);
```

## 📞 Support & Troubleshooting

### Common Issues

1. **Webhook not received**: Check URL accessibility and firewall settings
2. **Timeout errors**: Ensure webhook endpoint responds within 10 seconds
3. **Missing data**: Verify payload structure matches expected format
4. **Duplicate notifications**: Implement idempotency using job_id

### Debug Checklist

- ✅ Webhook URL is accessible from external networks
- ✅ Endpoint returns HTTP 200 status code
- ✅ Request/response logging is enabled
- ✅ Error handling is implemented
- ✅ Payload validation is working

### Contact Information

For technical support or questions about webhook integration:
- 📧 Email: mcp-support@example.com
- 📚 Documentation: https://docs.mcp-system.com
- 🐛 Issues: https://github.com/mcp-system/issues

---

**Happy coding! 🚀**
