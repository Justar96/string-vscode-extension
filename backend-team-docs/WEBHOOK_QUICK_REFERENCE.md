# 🚀 Webhook Integration Quick Reference

## ⚡ TL;DR

1. **Add webhook URL** to job metadata: `webhook_url: "https://your-backend.com/webhook"`
2. **Create HTTP endpoint** that accepts POST requests
3. **Return HTTP 200** to acknowledge receipt
4. **Process job data** from the webhook payload

## 📋 Essential Payload Fields

```json
{
    "job_id": "unique-job-id",
    "status": "completed|failed", 
    "success": true|false,
    "result_data": {
        "chunks_processed": 8,
        "vector_storage": {
            "collection_name": "user_123_code",
            "vector_ids": ["vec_1", "vec_2", ...]
        }
    },
    "metrics": {
        "processing_time_ms": 2500
    },
    "metadata": { /* your original job metadata */ }
}
```

## 🔧 Minimal Webhook Handler

```typescript
app.post('/webhook', (req, res) => {
    const { job_id, success, result_data } = req.body;
    
    if (success) {
        console.log(`✅ Job ${job_id} completed: ${result_data.chunks_processed} chunks`);
        // Handle success
    } else {
        console.log(`❌ Job ${job_id} failed: ${req.body.error_message}`);
        // Handle failure  
    }
    
    res.status(200).json({ received: true });
});
```

## 🎯 Job Submission with Webhook

```typescript
const jobRequest = {
    job_type: "file_processing",
    user_id: "your_user_id", 
    metadata: {
        file_path: "/path/to/file.py",
        webhook_url: "https://your-backend.com/webhook", // ← Add this!
        source: "vscode-extension"
    }
};
```

## ⚠️ Important Notes

- **Always return HTTP 200** (even for processing errors)
- **Respond within 10 seconds** to avoid timeout
- **Use HTTPS** for webhook URLs
- **Validate payload** before processing
- **Handle errors gracefully** without crashing

## 🔍 Testing with ngrok

```bash
# Install and run ngrok
npm install -g ngrok
ngrok http 3000

# Use the ngrok URL as your webhook_url
# https://abc123.ngrok.io/webhook
```

## 📊 Key Metrics Available

- `processing_time_ms` - Total processing time
- `chunks_count` - Number of code chunks created
- `file_size_bytes` - Original file size
- `embedding_time_ms` - Time to generate embeddings
- `storage_time_ms` - Time to store in vector database

## 🚨 Error Handling

```typescript
app.post('/webhook', (req, res) => {
    // Always respond first
    res.status(200).json({ received: true });
    
    // Process asynchronously
    setImmediate(() => {
        try {
            processJobData(req.body);
        } catch (error) {
            console.error('Webhook processing failed:', error);
            // Don't let errors crash the webhook
        }
    });
});
```

## 🎉 Success Indicators

✅ **Webhook received**: HTTP 200 response logged  
✅ **Job completed**: `success: true` in payload  
✅ **Data available**: `result_data.chunks_processed > 0`  
✅ **Vector stored**: `result_data.vector_storage.storage_success: true`  

## 🔗 Next Steps

1. **Set up webhook endpoint** using the examples above
2. **Test with sample job** to verify integration
3. **Add error handling** and logging
4. **Implement user notifications** in VSCode
5. **Query vector store** using collection name from webhook

---

**Need help?** Check the full integration guide: `VSCODE_EXTENSION_WEBHOOK_INTEGRATION.md`
