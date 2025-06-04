"""
VS Code Extension Integration for MCP Server

This module adds HTTP endpoints to receive code chunks from the VS Code extension
and integrates them with the existing MCP server's indexing capabilities.
"""

import logging
import json
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class CodeChunk(BaseModel):
    """Code chunk model for VS Code extension integration."""
    path: str = Field(..., description="Absolute path to the source file")
    idx: int = Field(..., description="Chunk index within the file")
    content: str = Field(..., description="Code content of the chunk")


class VSCodeIntegration:
    """Integration handler for VS Code extension."""
    
    def __init__(self, mcp_server, auth_manager=None):
        """
        Initialize VS Code integration.
        
        Args:
            mcp_server: The FastMCP server instance
            auth_manager: Optional authentication manager
        """
        self.mcp_server = mcp_server
        self.auth_manager = auth_manager
        self.chunk_storage = {}  # Temporary storage for chunks
        
    def register_endpoints(self):
        """Register VS Code integration endpoints with the MCP server."""
        
        @self.mcp_server.custom_route("/index/chunk", methods=["POST"])
        async def receive_code_chunk(request: Request) -> JSONResponse:
            """
            Receive code chunks from VS Code extension.
            
            This endpoint receives code chunks and processes them using
            the existing MCP server's indexing capabilities.
            """
            try:
                # Parse request body
                body = await request.body()
                chunk_data = json.loads(body)
                chunk = CodeChunk(**chunk_data)
                
                logger.info(f"Received chunk {chunk.idx} from {chunk.path}")
                logger.info(f"Content length: {len(chunk.content)} characters")
                
                # Authenticate if auth manager is available
                if self.auth_manager:
                    auth_header = request.headers.get("Authorization")
                    if auth_header and auth_header.startswith("Bearer "):
                        api_key = auth_header[7:]  # Remove "Bearer " prefix
                        if not self.auth_manager.validate_api_key(api_key):
                            return JSONResponse(
                                {"error": "Invalid API key"}, 
                                status_code=401
                            )
                    else:
                        return JSONResponse(
                            {"error": "Authorization header required"}, 
                            status_code=401
                        )
                
                # Process the chunk using existing MCP tools
                result = await self._process_chunk(chunk)
                
                return JSONResponse({
                    "status": "ok",
                    "message": f"Processed chunk {chunk.idx} from {chunk.path}",
                    "result": result
                })
                
            except json.JSONDecodeError:
                logger.error("Invalid JSON in request body")
                return JSONResponse(
                    {"error": "Invalid JSON"}, 
                    status_code=400
                )
            except Exception as e:
                logger.error(f"Error processing chunk: {e}")
                return JSONResponse(
                    {"error": f"Processing error: {str(e)}"}, 
                    status_code=500
                )
        
        @self.mcp_server.custom_route("/index/status", methods=["GET"])
        async def indexing_status(request: Request) -> JSONResponse:
            """Get indexing status and statistics."""
            try:
                status = {
                    "service": "vscode-mcp-integration",
                    "status": "healthy",
                    "timestamp": datetime.utcnow().isoformat(),
                    "chunks_processed": len(self.chunk_storage),
                    "endpoints": {
                        "POST /index/chunk": "Receive code chunks from VS Code",
                        "GET /index/status": "Get indexing status"
                    }
                }
                
                return JSONResponse(status)
                
            except Exception as e:
                logger.error(f"Error getting status: {e}")
                return JSONResponse(
                    {"error": f"Status error: {str(e)}"}, 
                    status_code=500
                )
    
    async def _process_chunk(self, chunk: CodeChunk) -> Dict[str, Any]:
        """
        Process a code chunk using existing MCP server capabilities.
        
        Args:
            chunk: The code chunk to process
            
        Returns:
            Processing result dictionary
        """
        try:
            # Store chunk temporarily (you might want to use a proper database)
            file_key = chunk.path
            if file_key not in self.chunk_storage:
                self.chunk_storage[file_key] = []
            
            self.chunk_storage[file_key].append({
                "idx": chunk.idx,
                "content": chunk.content,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            # Extract file information
            file_extension = chunk.path.split('.')[-1] if '.' in chunk.path else ''
            
            # Use existing MCP server tools for processing
            # This integrates with your existing indexing_tools.py
            result = {
                "file_path": chunk.path,
                "chunk_index": chunk.idx,
                "file_extension": file_extension,
                "content_length": len(chunk.content),
                "lines_count": len(chunk.content.split('\n')),
                "processed_at": datetime.utcnow().isoformat()
            }
            
            # If this is a Python file, we could use your existing tools
            if file_extension == 'py':
                # You could call your existing indexing tools here
                # For example: index_file_tool(chunk.path)
                result["language"] = "python"
                result["analysis"] = "Python file processed"
            elif file_extension in ['ts', 'js']:
                result["language"] = "typescript/javascript"
                result["analysis"] = "TypeScript/JavaScript file processed"
            else:
                result["language"] = "generic"
                result["analysis"] = "Generic file processed"
            
            logger.info(f"Successfully processed chunk {chunk.idx} from {chunk.path}")
            return result
            
        except Exception as e:
            logger.error(f"Error in _process_chunk: {e}")
            raise


def add_vscode_integration(mcp_server, auth_manager=None):
    """
    Add VS Code integration to an existing MCP server.
    
    Args:
        mcp_server: The FastMCP server instance
        auth_manager: Optional authentication manager
    """
    integration = VSCodeIntegration(mcp_server, auth_manager)
    integration.register_endpoints()
    
    logger.info("VS Code integration endpoints registered:")
    logger.info("  - POST /index/chunk (receive code chunks)")
    logger.info("  - GET /index/status (indexing status)")
    
    return integration


# Example usage for your server.py:
"""
To integrate this with your existing server.py, add this to the main() function:

# After registering existing tools
logger.info("Registering MCP tools...")
register_existing_tools()

# Add VS Code integration
from vscode_integration import add_vscode_integration
vscode_integration = add_vscode_integration(mcp, auth_manager)
logger.info("VS Code integration added")
"""
