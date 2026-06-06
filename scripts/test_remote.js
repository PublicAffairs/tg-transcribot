// scripts/test_remote.js
// Script to run remote and local integration checks against transcribot deployments

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load env variables to retrieve bot token for signing webhook payloads
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    });
  }
}
loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.warn("⚠️ Warning: TELEGRAM_BOT_TOKEN is not set in environment or .env.local.");
  console.warn("   Webhook POST signatures will be generated using a mock secret and may fail 403 Forbidden checks.");
}

const secretToken = token ? crypto.createHash('sha256').update(token).digest('hex') : 'dummy_secret';

// Parse deployment endpoints from CLI arguments or environment variables
const targets = {};
const envMap = {
  vercel: process.env.TEST_VERCEL_URL,
  cloudflare: process.env.TEST_CLOUDFLARE_URL,
  netlify: process.env.TEST_NETLIFY_URL,
  deno: process.env.TEST_DENO_URL,
  valtown: process.env.TEST_VAL_TOWN_URL,
  local: process.env.TEST_LOCAL_URL || 'http://localhost:3000'
};

// Merge environment defaults
Object.entries(envMap).forEach(([name, url]) => {
  if (url) targets[name] = url;
});

// Override or append via CLI args (e.g. vercel=https://example.com)
process.argv.slice(2).forEach(arg => {
  const match = arg.match(/^(\w+)=(https?:\/\/.+)$/);
  if (match) {
    targets[match[1].toLowerCase()] = match[2];
  } else if (arg.startsWith('http')) {
    targets['custom'] = arg;
  }
});

if (Object.keys(targets).length === 0) {
  console.log("No test targets configured.");
  console.log("Please specify target URLs as arguments, for example:");
  console.log("  node scripts/test_remote.js vercel=https://mybot.vercel.app local=http://localhost:3000\n");
  console.log("Or set environment variables: TEST_VERCEL_URL, TEST_CLOUDFLARE_URL, TEST_NETLIFY_URL, TEST_DENO_URL, TEST_VAL_TOWN_URL");
  process.exit(0);
}

const mockUpdate = {
  update_id: 999999,
  message: {
    message_id: 999,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 12345, type: 'private' },
    text: '/health_test',
    from: { id: 12345, is_bot: false, first_name: 'Tester', language_code: 'en' }
  }
};

async function testTarget(name, baseUrl) {
  // Strip trailing slash
  const urlBase = baseUrl.replace(/\/$/, '');
  console.log(`\nTesting target [${name}] -> ${urlBase}`);
  
  const result = {
    name,
    url: urlBase,
    healthCheck: 'FAIL',
    healthStatus: 'unknown',
    runtime: 'unknown',
    webhookCheck: 'FAIL',
    webhookStatus: 'unknown',
    errors: []
  };

  // 1. Query Health Check (checks GET /api/health and GET /health, or GET /)
  const healthEndpoints = [`${urlBase}/api/health`, `${urlBase}/health`, urlBase];
  let healthRes = null;

  for (const hUrl of healthEndpoints) {
    try {
      const res = await fetch(hUrl);
      if (res.status === 200 || res.status === 500) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          if (json.version && json.runtime) {
            healthRes = { status: res.status, data: json };
            break;
          }
        } catch (e) {
          // Continue trying other endpoints
        }
      }
    } catch (err) {
      // Continue
    }
  }

  if (healthRes) {
    result.healthCheck = 'PASS';
    result.healthStatus = `${healthRes.status} (${healthRes.data.status})`;
    result.runtime = healthRes.data.runtime;
    console.log(`✅ Health check passed: status ${healthRes.status}, runtime: ${healthRes.data.runtime}`);
    console.log("   Config Checklist:");
    Object.entries(healthRes.data.config_checks || {}).forEach(([key, val]) => {
      console.log(`     - ${key}: ${val ? '✓ Set' : '✗ Unset'}`);
    });
    console.log("   Self-Tests:");
    Object.entries(healthRes.data.tests || {}).forEach(([key, val]) => {
      console.log(`     - ${key}: ${val.ok ? '✅ OK' : '❌ FAILED (' + (val.error || 'unknown') + ')'}`);
    });
  } else {
    console.log(`❌ Health check failed or endpoint not found.`);
    result.errors.push("Health check endpoint did not return standard health report.");
  }

  // 2. Query Webhook verification (checks POST /api/webhook and POST /webhook, or POST /)
  const webhookEndpoints = [`${urlBase}/api/webhook`, `${urlBase}/webhook`, urlBase];
  let webhookRes = null;

  for (const wUrl of webhookEndpoints) {
    try {
      const res = await fetch(wUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': secretToken
        },
        body: JSON.stringify(mockUpdate)
      });
      if (res.status === 200) {
        const text = await res.text();
        if (text === 'OK') {
          webhookRes = { status: res.status, text };
          break;
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  if (webhookRes) {
    result.webhookCheck = 'PASS';
    result.webhookStatus = `${webhookRes.status} (${webhookRes.text})`;
    console.log(`✅ Webhook signature verification passed: returned 200 OK.`);
  } else {
    console.log(`❌ Webhook signature verification failed.`);
    result.errors.push("Webhook did not respond with 200 OK to mock Telegram payload.");
  }

  return result;
}

async function runAll() {
  const results = [];
  for (const [name, url] of Object.entries(targets)) {
    try {
      const res = await testTarget(name, url);
      results.push(res);
    } catch (e) {
      console.error(`Unexpected error testing platform "${name}":`, e.message || e);
    }
  }

  console.log("\n=================== TEST RUN CONSOLIDATED REPORT ===================");
  console.table(results.map(r => ({
    Platform: r.name,
    URL: r.url,
    Runtime: r.runtime,
    Health: r.healthStatus,
    Webhook: r.webhookCheck,
    Errors: r.errors.join(' | ') || 'None'
  })));
  console.log("====================================================================");
}

runAll();
