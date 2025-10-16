const express = require('express');
const axios = require('axios');
const app = express();

// CORS middleware - MUST be before other middleware
app.use((req, res, next) => {
res.header('Access-Control-Allow-Origin', '*');
res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

// Handle preflight requests
if (req.method === 'OPTIONS') {
    **return res.status(200).end();**

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
    **status: 'running',** 

    **message: 'NVIDIA NIM Proxy Server',**

    **timestamp: new Date().toISOString()**

});
});

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
try {
    **// Extract OpenAI format request**

    **const { model, messages, temperature, max\_tokens, stream } = req.body;**



    **console.log(`Request received for model: ${model}`);**




// Prepare NVIDIA API request - using the correct model ID
    **const nvidiaRequest = {**

      **model: "deepseek-ai/deepseek-r1-0528", // Fixed: added comma and correct model ID**

      **messages: messages,**

      **messages: messages,**

      **temperature: temperature || 1.1,**

      **max\_tokens: max\_tokens || 0,**

      **stream: stream || false**

    **};**



    **// Make request to NVIDIA API**

    **const response = await axios.post(**

      **`${NVIDIA\_BASE\_URL}/chat/completions`,**

      **nvidiaRequest,**

      **{**

        **headers: {**

          **'Authorization': `Bearer ${NVIDIA\_API\_KEY}`,**

          **'Content-Type': 'application/json'**

        **},**

        **responseType: stream ? 'stream' : 'json'**

      **}**

    **);**



    **// Return response in OpenAI format**

    **if (stream) {**

      **res.setHeader('Content-Type', 'text/event-stream');**

      **response.data.pipe(res);**

    **} else {**

      **res.json(response.data);**

    **}**




} catch (error) {
    **console.error('Error:', error.response?.data || error.message);**

    **res.status(error.response?.status || 500).json({**

      **error: {**

        **message: error.response?.data?.message || error.message,**

        **type: 'proxy\_error',**

        **details: error.response?.data || null**

      **}**

    **});**

}
});

// Models endpoint (for compatibility)
app.get('/v1/models', (req, res) => {
res.json({
    **object: 'list',**

    **data: \[**

      **{**

        **id: 'deepseek-r1',**

        **object: 'model',**

        **created: Date.now(),**

        **owned\_by: 'nvidia'**

      **},**

      **{**

        **id: 'deepseek-ai/deepseek-v3.1',**

        **object: 'model',**

        **created: Date.now(),**

        **owned\_by: 'nvidia'**

      **}**

    **]**

});
});

app.listen(PORT, () => {
console.log(`Proxy server running on port ${PORT}`);
console.log(`NVIDIA API Key configured: ${NVIDIA\_API\_KEY ? 'Yes' : 'No'}`);
});

