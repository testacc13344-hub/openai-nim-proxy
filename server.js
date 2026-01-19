const express = require('express');
const axios = require('axios');

const app = express();

// Environment variables with validation
const PORT = process.env.PORT || 3000;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// Validate API key on startup
if (!NVIDIA_API_KEY) {
  console.error('ERROR: NVIDIA_API_KEY environment variable is not set');
  process.exit(1);
}

// CORS middleware - MUST be before other middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  res.header('Access-Control-Max-Age', '3600');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Body parser middleware
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'NVIDIA NIM Proxy Server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health endpoint (standard)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    // Extract OpenAI format request
    const { model, messages, temperature, max_tokens, stream, top_p, frequency_penalty, presence_penalty } = req.body;
    
    console.log(`Request received for model: ${model || 'default'}`);
    
    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages field is required and must be a non-empty array',
          type: 'invalid_request_error',
          param: 'messages',
          code: 'invalid_messages'
        }
      });
    }

    // Validate message format
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg.role || !msg.content) {
        return res.status(400).json({
          error: {
            message: `Message at index ${i} must have 'role' and 'content' fields`,
            type: 'invalid_request_error',
            param: `messages[${i}]`
          }
        });
      }
    }
    
    // Prepare NVIDIA API request
    const nvidiaRequest = {
      model: model || 'deepseek-ai/deepseek-r1-0528',
      messages: messages,
      temperature: temperature !== undefined ? temperature : 0.7,
      max_tokens: max_tokens || 4096,
      stream: stream || false
    };

    // Add optional parameters if provided
    if (top_p !== undefined) nvidiaRequest.top_p = top_p;
    if (frequency_penalty !== undefined) nvidiaRequest.frequency_penalty = frequency_penalty;
    if (presence_penalty !== undefined) nvidiaRequest.presence_penalty = presence_penalty;
    
    // Make request to NVIDIA API
    const response = await axios.post(
      `${NVIDIA_BASE_URL}/chat/completions`,
      nvidiaRequest,
      {
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': stream ? 'text/event-stream' : 'application/json'
        },
        responseType: stream ? 'stream' : 'json',
        timeout: 120000, // 2 minutes for longer responses
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      }
    );
    
    // Handle non-2xx responses
    if (response.status >= 400) {
      return res.status(response.status).json(response.data);
    }

    // Return response in OpenAI format
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      
      response.data.pipe(res);
      
      // Handle stream errors
      response.data.on('error', (error) => {
        console.error('Stream error:', error);
        res.end();
      });
    } else {
      res.json(response.data);
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    
    // Handle different error types
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        error: {
          message: 'Request timeout - the API took too long to respond',
          type: 'timeout_error',
          code: 'request_timeout'
        }
      });
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: {
          message: 'Unable to connect to NVIDIA API',
          type: 'connection_error',
          code: 'service_unavailable'
        }
      });
    }
    
    res.status(error.response?.status || 500).json({
      error: {
        message: error.response?.data?.error?.message || error.response?.data?.message || error.message,
        type: error.response?.data?.error?.type || 'proxy_error',
        code: error.response?.data?.error?.code || 'unknown_error',
        details: process.env.NODE_ENV === 'development' ? (error.response?.data || null) : undefined
      }
    });
  }
});

// Models endpoint (for compatibility)
app.get('/v1/models', async (req, res) => {
  try {
    // Optionally fetch real models from NVIDIA API
    const response = await axios.get(`${NVIDIA_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`
      },
      timeout: 10000
    });
    
    res.json(response.data);
  } catch (error) {
    // Fallback to hardcoded models if API call fails
    console.warn('Failed to fetch models from NVIDIA API, using fallback');
    res.json({
      object: 'list',
      data: [
        {
          id: 'deepseek-ai/deepseek-r1-0528',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'nvidia'
        },
        {
          id: 'deepseek-ai/deepseek-v3.1',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'nvidia'
        }
      ]
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      type: 'invalid_request_error',
      code: 'route_not_found'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'server_error',
      code: 'internal_error'
    }
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`✓ Proxy server running on port ${PORT}`);
  console.log(`✓ NVIDIA API Key configured: Yes`);
  console.log(`✓ Base URL: ${NVIDIA_BASE_URL}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
