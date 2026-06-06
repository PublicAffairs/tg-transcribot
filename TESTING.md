# TESTING: CI/QA Validation and Development Utilities 🧪💻

This document outlines the testing workflows for **Telegram Voice Transcribot**. 

## 🏗️ Testing Principles & Infrastructure

Our testing philosophy is built on **fast feedback loops** and **zero-dependency local execution**. 
We want developers and agents to run tests constantly without waiting for remote deployments or dealing with live Telegram API rate limits.

* **Unified Test Runner**: All mandatory local checks are bundled into a single command: `npm run test`. You **must** run this after any code modification.
* **Mocked Telegram API**: We use custom payload generators and `fetch` mocks to simulate Telegram webhook updates (Groups, Secretary, Guest modes) entirely locally.
* **Situational Tools**: We separate mandatory CI gates from situational debugging tools (like local web servers or remote integration tests) so you always know what to run.

---

## 🛡️ Part 1: Mandatory CI/QA Checks

These checks run automatically in CI pipelines and **must be executed locally before committing code** to ensure codebase integrity and prevent regressions.

### 🚀 The Global Test Suite
Instead of running individual tests manually, always execute the unified suite:
```bash
npm run test
```
This command runs the following five validation layers sequentially:

#### 1. Codebase Linting (`npm run lint`)
Runs static analysis checks via ESLint to catch syntax errors, undeclared variables, or code style issues.
* **Configured via**: `eslint.config.js` (ignoring `scratch/` directories and backup files).

#### 2. Localization Checker (`npm run test:localization`)
Ensures translation files (`lib/localize.js`) are fully synchronized. Verifies that all required keys exist across all languages (`en`, `ru`, `de`, `uk`) and flags unused keys.

#### 3. Unit Tests (`npm run test:units`)
Validates core application logic and formatting in isolation:
* **Category A (Core Utilities)**: Testing SHA-256 hashing, ADTS-AAC headers detection, config generation, command meta-helpers, and 429 rate-limiting retries.
* **Category B (Markdown & Translations)**: Testing MarkdownV2 escaping rules, Wikipedia paren URLs, HTML tags conversion (`htmlToMarkdownV2`), and context-aware parameterized translation escaping.

#### 4. Local Integration Scenarios (`npm run test:scenarios`)
Validates internal application behavior and state (e.g. business logic, mode toggling, capability checks, owner registration) across 14 simulated webhook payload scenarios without requiring a live Telegram connection.

#### 5. Whitebox Unit Tests (`npm run test:whitebox`)
Validates request processing lifecycles, API endpoints, and platform routers using custom Telegram API mocks:
* **Category C (Webhook Filtering & Deduplication)**: Testing webhook FIFO cache deduplication eviction, `403 Forbidden` secret token verification, bot mentions addressing, document MIME-type gating, and `my_chat_member` transitions.
* **Category D (Routing, Adapters & Commands)**: Testing profile commands templates automation, `/lang` settings inline keyboard callbacks, dashboard state badges, scoped commands lists (owners vs guests), serverless runtimes requests adapters (Vercel, Netlify base64, Workers), and UI components generation.

### 📊 Code Coverage (`npm run coverage`)
Runs the full test suite instrumented with [c8](https://github.com/bcoe/c8) (V8 native coverage) and prints a per-file statement / branch / function report.

* **Node.js**:
  ```bash
  npm run coverage
  ```
* **Deno**:
  ```bash
  deno task coverage
  ```

> [!NOTE]
> The `coverage` task always uses Node.js + `npx c8` under the hood, even when invoked via `deno task`, because Deno's built-in coverage tooling requires a separate two-step flow incompatible with the custom `run_all.mjs` runner.

---

## 🌐 Part 2: Remote Pre-Release Checks

### Remote Integration Test Suite (`npm run test:remote`)
Used situationally to run comprehensive checks against **live deployed endpoints** (Vercel, Cloudflare Workers, Netlify, Deno, Val Town) or the local dev server. It queries `/api/health` self-test status reports and POSTs mock signature-verified Telegram update payloads to verify the real HTTP routing logic.

#### Against a Live Deployment:
Specify target URLs in `<platform>=<url>` format:
* **Node.js**:
  ```bash
  npm run test:remote -- vercel=https://mybot.vercel.app cloudflare=https://mybot.workers.dev
  ```
* **Deno**:
  ```bash
  deno task test:remote vercel=https://mybot.vercel.app cloudflare=https://mybot.workers.dev
  ```

#### Against Local Server:
Ensure your local server is running (`npm run dev`), then execute:
* **Node.js**:
  ```bash
  npm run test:remote -- local=http://localhost:3000
  ```
* **Deno**:
  ```bash
  deno task test:remote local=http://localhost:3000
  ```

---

## 💻 Part 3: Situational Debugging Utilities

These scripts are manual tools used to emulate environments, inspect payloads, and debug issues locally.

### 1. Local Test Server (`npm run dev` / `deno task dev`)
Emulates the Vercel Functions runtime by loading your environment variables and routing HTTP requests directly to the webhook handler.
* **Node.js Command**: `npm run dev` (or `node scripts/dev_node_server.js`)
* **Deno Command**: `deno task dev`
* **Local Endpoints**:
  * Landing Page / Web Setup: `http://localhost:3000/`
  * Webhook Handler: `http://localhost:3000/api/webhook`
  * Health Check Status: `http://localhost:3000/api/health`

> [!TIP]
> **Tunnel Mode**: If ngrok is running locally or a public HTTPS tunnel URL is specified via `TUNNEL_URL` environment variable or command argument (e.g. `npm run dev -- https://your-tunnel.ngrok.io`), the dev server will automatically backup your Telegram webhook, point it to your local machine, and restore your production webhook back to Telegram upon shutdown (`Ctrl+C`).

### 2. Emulating Telegram Request Payloads (`npm run test:payload`)
Generates sample JSON payloads for private chat voice messages, guest queries, and secretary mode updates. Outputs curl command templates to help developers test the webhook signature validation.
* **Node.js Command**: `npm run test:payload`
* **Deno Command**: `deno task test:payload`

### 3. Direct Audio Transcription (`scripts/ops_transcribe.sh`)
Directly uploads a local audio file to the Groq Whisper API for quick validation, bypassing the Telegram webhook flow entirely.
* **Usage**: `./scripts/ops_transcribe.sh path/to/voice_message.m4a`

### 4. Isolated AAC to WAV Container Conversion Test
To test the raw ADTS AAC detection and WAV wrapping logic in isolation, you can manually run:
```javascript
import fs from 'fs';
import { isAdtsAac, wrapAacInWav } from './lib/wav-wrapper.js';

const aacBuffer = fs.readFileSync('path/to/raw_audio.aac');
console.log('Is raw AAC:', isAdtsAac(aacBuffer));

try {
  const wavBuffer = wrapAacInWav(aacBuffer);
  fs.writeFileSync('output_fixed.wav', wavBuffer);
  console.log('Saved converted WAV container!');
} catch (err) {
  console.error(err);
}
```
