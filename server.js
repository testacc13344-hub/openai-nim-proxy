const express = require('express');
const axios = require('axios');
const app = express();
// CORS middleware - MUST be before other middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  res.header('Access-Control-Max-Age', '3600');
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).send();
  }
  next();
});
app.use(express.json());
const PORT = process.env.PORT || 3000;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'NVIDIA NIM Proxy Server',
    timestamp: new Date().toISOString()
  });
});
// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    // Check if API key is configured
    if (!NVIDIA_API_KEY) {
      return res.status(500).json({
        error: {
          message: 'NVIDIA_API_KEY environment variable is not set',
          type: 'configuration_error'
        }
      });
    }

    // Extract OpenAI format request
    const { model, messages, temperature, max_tokens, stream } = req.body;
    console.log(`Request received for model: ${model}`);
    
    // Validate required fields
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          message: 'messages field is required and must be an array',
          type: 'invalid_request_error'
        }
      });
    }

    // Prepare NVIDIA API request
    const nvidiaRequest = {
      model: model || 'deepseek-ai/deepseek-r1-0528',
      messages: messages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 4096,
      stream: stream || false
    };
    // Make request to NVIDIA API
    const response = await axios.post(
      `${NVIDIA_BASE_URL}/chat/completions`,
      nvidiaRequest,
      {
        headers: {
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: stream ? 'stream' : 'json',
        timeout: 30000
      }
    );
    // Return response in OpenAI format
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: {
        message: error.response?.data?.message || error.message,
        type: 'proxy_error',
        details: error.response?.data || null
      }
    });
  }
});
// Models endpoint (for compatibility)
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'deepseek-r1',
        object: 'model',
        created: Date.now(),
        owned_by: 'nvidia'
      },
      {
        id: 'deepseek-ai/deepseek-v3.1',
        object: 'model',
        created: Date.now(),
        owned_by: 'nvidia'
      }
    ]
  });
});
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log(`NVIDIA API Key configured: ${NVIDIA_API_KEY ? 'Yes' : 'No'}`);
});
