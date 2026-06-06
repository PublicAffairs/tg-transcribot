/**
 * dev_node_server.js
 * Category: Development / Runner
 * 
 * Local HTTP server that simulates the serverless Vercel function runtime.
 * Mounts the webhook handlers, performs local ngrok tunnel detection, and
 * auto-manages registering/restoring the Telegram webhook during development.
 * 
 * Usage:
 *   npm run dev
 */

const http = require('http');
const fs = require('fs');
const path = require('path');


// Simple function to load env files from the parent project root directory
function loadEnv() {
  const envFiles = ['.env.local', '.env.production', '.env'];
  for (const file of envFiles) {
    const envPath = path.join(__dirname, '..', file);
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

const webhookHandler = require('../api/webhook.js');

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  
  // Parse query parameters
  const query = {};
  parsedUrl.searchParams.forEach((val, key) => {
    query[key] = val;
  });

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    let parsedBody = null;
    if (body) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        // Keep as raw text if not JSON
        parsedBody = body;
      }
    }
    
    const vercelReq = {
      method: req.method,
      body: parsedBody,
      headers: req.headers,
      query: query,
      url: req.url
    };
    
    const vercelRes = {
      status: (code) => {
        res.statusCode = code;
        return vercelRes;
      },
      setHeader: (key, value) => {
        res.setHeader(key, value);
        return vercelRes;
      },
      send: (data) => {
        const responseBody = typeof data === 'object' ? JSON.stringify(data) : data;
        res.end(responseBody);
      }
    };
    
    // Delegate all routing to the core handler
    webhookHandler(vercelReq, vercelRes);
  });
});

const PORT = process.env.PORT || 3000;
const tunnelUrlArg = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;

let oldWebhookInfo = null;
let newWebhookUrl = null;
let restored = false;

async function restoreWebhook() {
  if (restored) return;
  restored = true;
  console.log(`\n\n[Tunnel Cleanup] Restoring original webhook...`);
  
  if (oldWebhookInfo && oldWebhookInfo.url) {
    console.log(`Restoring to: ${oldWebhookInfo.url}`);
    const payload = {
      url: oldWebhookInfo.url,
      has_custom_certificate: oldWebhookInfo.has_custom_certificate,
      max_connections: oldWebhookInfo.max_connections,
      allowed_updates: oldWebhookInfo.allowed_updates,
      ip_address: oldWebhookInfo.ip_address,
    };
    
    const secretToken = crypto.createHash('sha256').update(token).digest('hex');
    payload.secret_token = secretToken;
    
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        console.log(`✅ Original webhook successfully restored!`);
      } else {
        console.error(`❌ Failed to restore original webhook: ${data.description}`);
      }
    } catch (e) {
      console.error(`❌ Error restoring original webhook:`, e.message);
    }
  } else {
    console.log(`Deleting temporary webhook (no original webhook was set)...`);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
      const data = await res.json();
      if (data.ok) {
        console.log(`✅ Webhook deleted successfully.`);
      } else {
        console.error(`❌ Failed to delete webhook: ${data.description}`);
      }
    } catch (e) {
      console.error(`❌ Error deleting webhook:`, e.message);
    }
  }
  process.exit(0);
}

const crypto = require('crypto');

async function detectNgrokTunnel() {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    const data = await res.json();
    if (data && data.tunnels && data.tunnels.length > 0) {
      const httpsTunnel = data.tunnels.find(t => t.proto === 'https' || t.public_url.startsWith('https://'));
      if (httpsTunnel) {
        return httpsTunnel.public_url;
      }
    }
  } catch {
    // Ngrok not running or not accessible
  }
  return null;
}

server.listen(PORT, async () => {
  console.log(`\n🚀 Test server running on http://localhost:${PORT}`);
  console.log(`--------------------------------------------------`);
  console.log(`Dashboard:        http://localhost:${PORT}/`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/api/webhook`);
  console.log(`Setup endpoint:   http://localhost:${PORT}/api/setup`);
  console.log(`Health endpoint:  http://localhost:${PORT}/api/health`);
  console.log(`--------------------------------------------------`);
  
  console.log('\nEnvironment variables check:');
  console.log(`TELEGRAM_BOT_TOKEN: ${token ? '✓ Configured' : '✗ Missing'}`);
  console.log(`WHISPER_API_KEY:    ${process.env.WHISPER_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  
  let tunnelUrl = tunnelUrlArg || process.env.TUNNEL_URL || process.env.DEV_TUNNEL_URL;
  let detectionSource = 'CLI/Env';
  
  if (!tunnelUrl) {
    tunnelUrl = await detectNgrokTunnel();
    if (tunnelUrl) {
      detectionSource = 'Auto-detected ngrok';
    }
  }
  
  if (tunnelUrl) {
    if (!token) {
      console.error('\n❌ Tunnel URL specified/detected but TELEGRAM_BOT_TOKEN is missing. Cannot register webhook.');
      return;
    }
    
    // Pre-validate the tunnel URL format
    let isSupportedByTelegram = false;
    let validationReason = '';
    try {
      const parsedUrl = new URL(tunnelUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const port = parsedUrl.port;
      const isValidPort = !port || ['80', '88', '443', '8443'].includes(port);
      const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';

      if (!isHttps) {
        validationReason = 'Telegram requires secure HTTPS.';
      } else if (!isValidPort) {
        validationReason = `Port ${port} is not supported.`;
      } else if (isLocalhost) {
        validationReason = 'Localhost address is not reachable.';
      } else {
        isSupportedByTelegram = true;
      }
    } catch (e) {
      validationReason = `Invalid URL structure: ${e.message}`;
    }

    if (!isSupportedByTelegram) {
      console.error(`\n[Tunnel Mode] ✗ Invalid tunnel URL: ${tunnelUrl}`);
      console.error(`Reason: ${validationReason}`);
      console.error('Telegram only supports secure HTTPS on ports 80, 88, 443, or 8443.');
      console.error('Please configure a valid public HTTPS tunnel (e.g. npx localtunnel --port 3000).');
      console.log('Webhook will NOT be registered to prevent breaking the bot.\n');
      return;
    }
    
    if (!tunnelUrl.startsWith('http://') && !tunnelUrl.startsWith('https://')) {
      tunnelUrl = 'https://' + tunnelUrl;
    }
    tunnelUrl = tunnelUrl.replace(/\/$/, '');
    newWebhookUrl = `${tunnelUrl}/api/webhook`;
    
    console.log(`\n[Tunnel Mode] (${detectionSource}) Target Webhook: ${newWebhookUrl}`);
    console.log(`[Tunnel Mode] Fetching current webhook from Telegram...`);
    
    try {
      // 1. Get current webhook info
      const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const infoData = await infoRes.json();
      if (infoData.ok && infoData.result) {
        oldWebhookInfo = infoData.result;
        console.log(`[Tunnel Mode] Saved existing webhook URL: ${oldWebhookInfo.url || 'none'}`);
      }
      
      // 2. Set new webhook
      const secretToken = crypto.createHash('sha256').update(token).digest('hex');
      const payload = {
        url: newWebhookUrl,
        allowed_updates: [
          'message',
          'business_connection',
          'business_message',
          'edited_business_message',
          'guest_message',
          'my_chat_member'
        ],
        secret_token: secretToken
      };
      
      const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const setData = await setRes.json();
      if (setData.ok) {
        console.log(`[Tunnel Mode] ✅ Temporary webhook successfully registered!`);
        console.log(`[Tunnel Mode] Original webhook will be restored automatically on Ctrl+C.`);

        // Register exit handlers ONLY if we successfully registered the webhook
        process.on('SIGINT', restoreWebhook);
        process.on('SIGTERM', restoreWebhook);
        process.on('SIGHUP', restoreWebhook);
      } else {
        console.error(`[Tunnel Mode] ❌ Failed to register temporary webhook: ${setData.description}`);
      }
    } catch (err) {
      console.error(`[Tunnel Mode] ❌ Error setting tunnel webhook:`, err.message);
    }
  } else {
    console.log('\n[Tunnel Mode] No tunnel URL provided or detected.');
    console.log('To test real Telegram updates on this local machine:');
    console.log('  Option 1: Run ngrok in another window (it will be auto-detected).');
    console.log('  Option 2: Pass your tunnel URL as an argument: node scripts/node_server.js https://your-tunnel.loca.lt');
    console.log('  Option 3: Set TUNNEL_URL=https://... in your .env.local file.');
    console.log('You can also mock updates without a tunnel using: npm run test:payload\n');
  }
});
