/**
 * ops_set_webhook.js
 * Category: Operations / Admin Tool
 * 
 * Registers or updates the Telegram Bot Webhook URL with Telegram's Bot API.
 * Computes and attaches the required X-Telegram-Bot-API-Secret-Token header.
 * 
 * Usage:
 *   npm run set-webhook -- <your_webhook_url>
 */

const fs = require('fs');
const path = require('path');


// Simple function to load env files
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
      break; // Stop at the first found env file to maintain priority
    }
  }
}

loadEnv();

const crypto = require('crypto');
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is not defined in .env files or environment');
  process.exit(1);
}

const webhookSecret = crypto.createHash('sha256').update(token).digest('hex');

// Get webhook URL from CLI arguments
const urlArg = process.argv[2];
if (!urlArg) {
  console.error('❌ Error: Webhook URL is required.');
  console.log('\nUsage: npm run set-webhook -- <your_webhook_url>');
  console.log('Example: npm run set-webhook -- https://my-bot.vercel.app/api/webhook');
  console.log('Example for local tunnel: npm run set-webhook -- https://neat-cats-run.loca.lt');
  process.exit(1);
}

// Ensure the URL is fully formed with protocol and endpoint
let webhookUrl = urlArg;
if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
  webhookUrl = 'https://' + webhookUrl;
}
if (!webhookUrl.endsWith('/api/webhook')) {
  webhookUrl = webhookUrl.replace(/\/$/, '') + '/api/webhook';
}

try {
  const parsed = new URL(webhookUrl);
  const isHttps = parsed.protocol === 'https:';
  const port = parsed.port;
  const isValidPort = !port || ['80', '88', '443', '8443'].includes(port);
  if (!isHttps || !isValidPort) {
    console.warn('\n⚠️  WARNING: Telegram requires secure HTTPS and only supports ports: 80, 88, 443, or 8443.');
    console.warn(`   Your target URL is: ${webhookUrl}`);
    console.warn('   This registration will likely fail or Telegram won\'t send updates to this address.\n');
  }
} catch {
  // Ignore malformed URL errors here, fetch catch block will handle request issues
}

console.log(`Fetching existing webhook settings to preserve options...`);

fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
  .then(res => res.json())
  .then(infoData => {
    let queryParams = '';
    if (infoData.ok && infoData.result?.url && infoData.result.url.includes('?')) {
      queryParams = '?' + infoData.result.url.split('?')[1];
      console.log(`Preserving existing options: ${queryParams}`);
    }
    
    const finalWebhookUrl = webhookUrl + queryParams;
    console.log(`Registering webhook: ${finalWebhookUrl}`);
    
    const payload = {
      url: finalWebhookUrl,
      allowed_updates: [
        'message',
        'business_connection',
        'business_message',
        'edited_business_message',
        'guest_message',
        'my_chat_member'
      ]
    };
    
    if (webhookSecret) {
      payload.secret_token = webhookSecret;
    }
    
    return fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  })
  .then(res => res.json())
  .then(data => {
    if (data.ok) {
      console.log('✅ Webhook successfully registered!');
      console.log(data);
    } else {
      console.error('❌ Failed to register webhook:', data.description);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('❌ Request error:', err);
    process.exit(1);
  });
