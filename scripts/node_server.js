const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple function to load env files
function loadEnv() {
  const envFiles = ['.env.local', '.env.production', '.env'];
  for (const file of envFiles) {
    const envPath = path.join(__dirname, file);
    if (fs.existsSync(envPath)) {
      console.log(`Loading environment variables from: ${file}`);
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        if (line.trim().startsWith('#') || !line.trim()) return;
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = match[2] || '';
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
          } else if (val.startsWith("'") && val.endsWith("'")) {
            val = val.substring(1, val.length - 1);
          }
          process.env[key] = val;
        }
      });
      break;
    }
  }
}

loadEnv();

const WHISPER_API_KEY = process.env.WHISPER_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.API_KEY || 'test_key';

// Import logic from webhook.js and setup.js
const webhookHandler = require('../api/webhook.js');
const setupHandler = require('../api/setup.js');

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  
  if (req.method === 'POST' && parsedUrl.pathname === '/api/webhook') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const parsedBody = JSON.parse(body);
        
        const vercelReq = {
          method: 'POST',
          body: parsedBody,
          headers: req.headers,
          url: req.url
        };
        
        const vercelRes = {
          status: (code) => {
            res.writeHead(code, { 'Content-Type': 'text/plain' });
            return vercelRes;
          },
          send: (data) => {
            res.end(data);
          }
        };
        
        webhookHandler(vercelReq, vercelRes);
      } catch (error) {
        console.error('Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else if (parsedUrl.pathname === '/api/setup') {
    // Parse query parameters
    const query = {};
    parsedUrl.searchParams.forEach((val, key) => {
      query[key] = val;
    });

    const vercelReq = {
      method: req.method,
      query: query,
      headers: req.headers,
      url: req.url
    };

    const vercelRes = {
      status: (code) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        return vercelRes;
      },
      json: (data) => {
        res.end(JSON.stringify(data));
      }
    };

    setupHandler(vercelReq, vercelRes);
  } else if (parsedUrl.pathname === '/api/health' || parsedUrl.pathname === '/health') {
    const vercelReq = {
      method: req.method,
      headers: req.headers,
      url: req.url
    };

    const vercelRes = {
      status: (code) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        return vercelRes;
      },
      send: (data) => {
        res.end(typeof data === 'object' ? JSON.stringify(data) : data);
      }
    };

    webhookHandler(vercelReq, vercelRes);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/api/webhook`);
  console.log(`Setup endpoint:   http://localhost:${PORT}/api/setup`);
  console.log('\nEnvironment variables:');
  console.log(`TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? '✓ Set' : '✗ Not set'}`);
  console.log(`WHISPER_API_KEY:    ${(process.env.WHISPER_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.API_KEY) ? '✓ Set' : '✗ Not set'}`);
});
