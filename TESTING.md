# TESTING: Local Webhook Testing and Utilities 🧪💻

To verify the bot's logic without deploying it to live environments or sending actual Telegram updates, you can run and interact with a local test environment.

---

## 1. Local Test Server (`scripts/node_server.js`)

The file [scripts/node_server.js](file:///D:/Dev/val-town/transcribot/scripts/node_server.js) runs a local HTTP server on port `3000`. It emulates the Vercel Functions runtime by loading your environment variables and routing requests directly to the webhook handler.

### Start the Server:
- **Node.js (Vercel Node environment emulation)**:
  ```bash
  npm run dev
  ```
  *(or `node scripts/node_server.js`)*
- **Deno (native Deno HTTP environment)**:
  ```bash
  deno task dev
  ```

The server automatically:
1. Loads environment variables from `.env.local` (or `.env`).
2. Exposes two endpoints:
   * Webhook handler: `http://localhost:3000/api/webhook`
   * Configuration helper: `http://localhost:3000/api/setup`

---

## 2. Emulating Telegram Request Payloads (`scripts/test_webhook.js`)

The script [scripts/test_webhook.js](file:///D:/Dev/val-town/transcribot/scripts/test_webhook.js) generates pre-formatted JSON payloads representing different Telegram events (private chat voice messages, guest queries, and secretary/business messages). You can run it to output the payload and curl command templates:
- **Node.js**: `npm run test:payload`
- **Deno**: `deno task test:payload`

Since the webhook validates the request signature via the `X-Telegram-Bot-API-Secret-Token` header, your curl requests must include it. The header value is the SHA-256 hash of your `TELEGRAM_BOT_TOKEN`.

### Sending a Test Request (PowerShell / cmd / bash):

Replace the `X-Telegram-Bot-API-Secret-Token` value with the SHA-256 hash of your bot token (or temporarily bypass the checks in the code for rapid prototyping).

#### curl template for a standard voice message update:
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-API-Secret-Token: <YOUR_TOKEN_HASH>" \
  -d "{\"update_id\":100000001,\"message\":{\"message_id\":101,\"date\":1780762445,\"chat\":{\"id\":123456789,\"type\":\"private\"},\"voice\":{\"file_id\":\"AwACAgIAAxkBAAI_normal_voice_file_id\",\"file_unique_id\":\"AQAD_normal_voice_unique_id\",\"duration\":5}}}"
```

*(For example, the hash of `6470224827:AAEtPtecEgrdFM8Pe2rVTqdTa1sOcLnQDA8` is `540b02f5a5e8b526b8a2b39e4257691b001c1f55e0b6d3c87c2a27cc63e40f5d`)*

---

## 3. Direct Transcription Test (`transcribe.sh`)

The script [transcribe.sh](file:///D:/Dev/val-town/transcribot/transcribe.sh) allows you to bypass the Telegram flow and directly upload any local audio file to the Groq Whisper API for quick validation.

```bash
# Requires WHISPER_API_KEY (or GROQ_API_KEY) environment variable to be set
./transcribe.sh 96_1780032973604.m4a
```

---

## 4. AAC to M4A Container Conversion Test

To test the transmuxer in isolation (without making any external API calls), you can use the test script from the CLI artifacts scratch folder or execute a similar script:

```javascript
const fs = require('fs');
const { isAdtsAac, wrapAacInM4a } = require('./lib/aac-to-m4a');

const aacBuffer = fs.readFileSync('96_1780032973604.m4a');
console.log('Is raw AAC:', isAdtsAac(aacBuffer));

wrapAacInM4a(aacBuffer)
  .then(m4aBuffer => {
    fs.writeFileSync('output_fixed.m4a', m4aBuffer);
    console.log('Saved converted M4A container!');
  })
  .catch(console.error);
```

---

## 5. Unified Health Checks and Remote Integration Testing 🌐🔍

To simplify remote validation, the bot core exports a unified health check endpoint `/api/health` (or `/health`). 

### Health Check Report
When queried via GET, it returns a detailed JSON report including:
* **`runtime`**: Detected platform runtime (e.g. `vercel/node`, `cloudflare-workers`, `deno-deploy`, `val-town`).
* **`config_checks`**: Verification of environment variable configurations (checks if keys are set without exposing their secrets).
* **`tests`**: Automated self-tests verifying:
  * **`crypto`**: Web Cryptography SHA-256 validation.
  * **`aac_detection`**: AAC to M4A container conversion logic.
  * **`telegram_connectivity`**: A live query to the Telegram API's `getMe` endpoint to verify token validity.

---

### Remote Test Runner (`scripts/test_remote.js`)
You can use the integration runner script to automatically verify all your deployed endpoints at once. The script checks both GET `/api/health` reports and posts mock Telegram update payloads via POST `/api/webhook` to verify signature validation.

#### Run Checks Against a Deployment:
Specify targets as arguments in `<name>=<url>` format:
- **Node.js**:
  ```bash
  npm run test:remote -- vercel=https://mybot.vercel.app cloudflare=https://mybot.workers.dev
  ```
- **Deno**:
  ```bash
  deno task test:remote vercel=https://mybot.vercel.app cloudflare=https://mybot.workers.dev
  ```

#### Run Checks Against Local Server:
Make sure your test server is running, then execute:
- **Node.js**:
  ```bash
  npm run test:remote -- local=http://localhost:3000
  ```
- **Deno**:
  ```bash
  deno task test:remote local=http://localhost:3000
  ```

The script will output detailed diagnostics for each target and print a consolidated status table at the end of the run.

