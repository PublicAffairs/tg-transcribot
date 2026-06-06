# Serverless Telegram Bot Framework 🚀🤖

A lightweight, database-less, cross-platform framework for building Telegram bots on serverless runtimes.
It is designed to work seamlessly on **Vercel Functions, Netlify Functions, Cloudflare Workers, Deno Deploy, and Val Town**.

---

## 📌 Core Features

1. **Stateless Configuration**: No database required.
   Botstate, owner settings, and preferences are serialized directly into the Telegram webhook URL query parameters.
2. **Unified Platform Adapters**: Write once, deploy anywhere.
   Normalizes HTTP request/response payloads across Node.js (Vercel, Netlify) and Web standard runtimes (Cloudflare Workers, Deno, Val Town).
3. **Advanced Command Router**:
   Register text commands with priorities, role-based checks (owner vs. public), and custom condition gates.
4. **Interactive Keyboard Menu Engine**:
   Easily build nested settings menus with inline keyboards, state navigation, and automatic callback-query processing.
5. **Localization Engine**:
   Safe templating, placeholder interpolation, and language auto-detection from Telegram update headers.
6. **Robustness & Rate-Limiting**: 
   * Automatic **FIFO deduplication cache** for Telegram `update_id` retries.
   * Smart **429 Too Many Requests retry-and-bypass policies**.
   * Network timeout boundaries on all external fetches.
7. **Interactive Dashboard**:
   A beautiful, parameterized web configuration panel that checks bot configuration sanity,
   updates webhook parameters, and manages bot owner resets.

---

## 🏗️ Architecture & Serverless Compensations

Serverless hosting environments impose strict limits (cold starts, execution timeouts, ephemeral filesystems).
This framework employs specific strategies to address these limitations:

### 1. Database-less State (Stateless Webhook parameters)
Instead of storing configuration state (e.g., target language, features active, transcription model) in a database,
the framework serializes this state directly into the Telegram Webhook URL:
```
https://your-bot.example.com/api/webhook?groups=on&langbot=auto&model=whisper-large-v3&owner=12345
```
When an update arrives, the router deserializes the parameters, making them instantly available to handlers.

### 2. Ephemeral Deduplication Cache
Telegram retries sending updates if the server doesn't respond quickly.
In serverless instances, memory resets on cold starts, but warm instances preserve memory.
The framework maintains a lightweight in-memory FIFO set (`processedUpdates`) to filter out rapid duplicate `update_id` payloads.

### 3. Background Processing & `waitUntil`
Free-tier serverless environments enforce strict execution timeouts (often 10s).
If bot tasks (such as calling transcription APIs or downloading files) exceed this limit, the platform kills the function.

* **Immediate Acknowledgment**: The adapter returns `200 OK` to Telegram immediately to prevent webhook retries.
* **Background Tasks**: Where supported (Cloudflare Workers, Netlify, Vercel Edge),
  it uses `ctx.waitUntil(promise)` to instruct the runtime to keep the container active while the task runs in the background.
* **Synchronous Fallback**: For environments where background processing is suspended immediately after returning the response
  (like standard Vercel Node.js Serverless Containers), the framework falls back to awaiting the task before responding.

### 4. Rate-Limit Handling (429) & Abort Timers
* **429 Protection**: The built-in HTTP client (`callTelegram`) checks for `429 Too Many Requests`.
  If the suggested `retry_after` is $\le 5$ seconds, it waits and retries.
  Otherwise, it skips the request and fires an alert notification to the bot owner to bypass blocking of the serverless execution loop.
* **Abort Signals**: Enforces network timeout thresholds (e.g. 10s for Telegram API, 30s for asset downloads) to prevent execution hanging.

### 5. Dynamic Version Propagation
The framework supports propagating the version dynamically from `package.json` to diagnostic health endpoints across different runtime environments:
* **Node.js**: Statically uses `require` to read and expose version string.
* **Cloudflare Workers (Wrangler compile-time)**: Statically imports `package.json` at build time.
* **Deno / Val Town (runtime try-import)**: Dynamically resolves `package.json` using a `try/catch` block with standard import attributes:
  ```javascript
  try {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    botVersion = pkg.default?.version || botVersion;
  } catch (e) {}
  ```

---

## 🛠️ Framework API Reference

### 1. HTTP Router & Entry Point
The router matches incoming HTTP endpoints (like `/api/webhook` or `/`) to registered handlers.

```javascript
import { registerHttpRoute, dispatchHttpRoute } from './framework/router.js';

// Register routes
registerHttpRoute('/api/webhook', handleWebhook);
registerHttpRoute('/api/health', handleHealthCheck);
```

To bind this router to a serverless platform, register a **Config Builder** and import the platform adapters in your entrypoints:

```javascript
// Register config parser
import { configureConfigBuilder } from './framework/adapters.js';
configureConfigBuilder((env) => ({
  telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  ownerChatId: env.OWNER_CHAT_ID
}));
```

Then in your platforms:
* **Cloudflare Workers / Deno / Val Town**:
  ```javascript
  import { handleWebRequest } from './lib/framework/adapters.js';
  export default {
    async fetch(req, env, ctx) {
      return await handleWebRequest(req, env, ctx);
    }
  }
  ```
* **Vercel Functions**:
  ```javascript
  import { handleVercelRequest } from '../lib/framework/adapters.js';
  module.exports = async (req, res) => {
    return handleVercelRequest(req, res);
  };
  ```

---

### 2. Command Router
Register bot commands with priority sorting and conditional authorization filters:

```javascript
import { registerCommand } from './framework/router.js';

registerCommand('start', async (message, context) => {
  const { token, chatId } = context;
  await callTelegram(token, 'sendMessage', {
    chat_id: chatId,
    text: "Welcome!"
  });
}, { priority: 200 });

// Scoped command only accessible to the bot owner
registerCommand('settings', handleSettings, {
  priority: 100,
  condition: (message, isOwner) => isOwner
});
```

* **Command Menu Formatting (setMyCommands)**:
  Telegram's client-side popup command list (registered via `setMyCommands` API) accepts strictly plain text (maximum 256 characters)
  and does not support Markdown formatting or links.
  Any formatting syntax will fail API submission or render raw characters.
  To handle this, the framework expects descriptions to be parsed with a utility like `stripMarkdown` to extract clean plain text anchors.
* **Dynamic `/help` Text Formatting**:
  Unlike client-side menus, inline command lists (e.g. `/help` responses) support full MarkdownV2 features.
  To keep inline links clickable without triggering strict parsing exceptions,
  description parsers should separate text sections from link sections and escape only the plain text segments.

---

### 3. Interactive Keyboards Menu Engine
Define state-based menus where changes automatically update the inline keyboard:

```javascript
import { registerMenu, openMenu } from './framework/menu.js';

registerMenu('main', {
  title: (settings, extraCtx) => `*Settings Menu*\nActive Model: ${settings.model || 'Default'}`,
  buttons: (settings, extraCtx) => [
    [
      { 
        text: 'Toggle Verbose Mode', 
        callback_data: 'toggle:verbose' 
      }
    ],
    [
      { 
        text: 'Select Model', 
        callback_data: 'submenu:models' 
      }
    ]
  ],
  onAction: async (action, value, settings, extraCtx) => {
    if (action === 'toggle' && value === 'verbose') {
      settings.verbose = !settings.verbose;
      return { refresh: true, alert: "Verbose mode toggled!" };
    }
    return { refresh: false };
  }
});
```

To display a menu or handle incoming clicks (`callback_query`):
```javascript
// Open the menu
await openMenu(token, chatId, 'main', settings, extraCtx);

// Pass callback queries to the engine
import { handleCallbackQuery } from './framework/menu.js';
await handleCallbackQuery(token, callbackQuery, settings, extraCtx);
```

---

### 4. Parameterized Admin Dashboard
Expose a beautiful status-check and configuration page by instantiating the generic dashboard:

```javascript
import { makeDashboardHandler } from './framework/dashboard.js';
import { registerHttpRoute } from './framework/router.js';

const handleDashboard = makeDashboardHandler({
  botNameDefault: 'My Custom Bot',
  botDescriptionDefault: 'This bot does amazing things.',
  repoUrl: 'https://github.com/username/my-bot',
  repoName: 'my-bot',
  logoSvg: `<svg viewBox="0 0 24 24">...</svg>`,
  getSettingsSchema: (oldSettings) => ({
    owner: oldSettings.owner || '',
    verbose: oldSettings.verbose !== undefined ? oldSettings.verbose : false,
  }),
  getChecks: (config) => [
    { 
      name: 'BOT TOKEN', 
      ok: !!config.telegramBotToken, 
      errorMsg: 'TELEGRAM_BOT_TOKEN is missing!' 
    }
  ]
});

// Bind to root route
registerHttpRoute('/', handleDashboard);
```

---

### 5. Localization Engine
Define localization rules and query text templates dynamically:

```javascript
import { configureLocalization, getTranslation, getMarkdown } from './framework/localize.js';

const translations = {
  en: {
    welcome: "Hello, {name}!"
  },
  ru: {
    welcome: "Привет, {name}!"
  }
};

configureLocalization(translations);

// Fetch a raw translation string
const greeting = getTranslation('welcome', 'en', { name: 'Alice' }); // "Hello, Alice!"

// Fetch and escape automatically for MarkdownV2 safety
const safeGreeting = getMarkdown('welcome', 'ru', { name: 'Иван' }); // "Привет, Иван\\!"
```

* **Selective Localized Metadata Registration**:
  To keep the Bot API metadata registration clean and prevent empty descriptions or errors,
  the localization framework allows registering command metadata *only* for languages that explicitly define descriptions
  in the translation dictionary.
  If a language lacks keys, registration is skipped for that locale, letting Telegram's default global fallback (English) take over.

---

### 6. MarkdownV2 Escaper & HTML Translator
Telegram's `MarkdownV2` parser is strict. Plain text parameters must have reserved symbols escaped to prevent payload delivery errors (`400 Bad Request`). For the full list of characters requiring escaping, refer to the [Telegram Bot API MarkdownV2 documentation](https://core.telegram.org/bots/api#markdownv2-style).

```javascript
import { escapeMarkdownV2, htmlToMarkdownV2 } from './framework/markdown.js';

const escapedText = escapeMarkdownV2("Version 1.0.0 is out! (Yay)"); 
// "Version 1\\.0\\.0 is out\\! \\(Yay\\)"

const convertedMarkdown = htmlToMarkdownV2("<b>Bold</b> and <i>Italic</i>");
// "*Bold* and _Italic_"
```

* **Codebase Rules**: Always specify `parse_mode: 'MarkdownV2'` and `disable_web_page_preview: true` in Telegram API payload configurations. Use `getMarkdown` for translation templates and `escapeMarkdownV2` for manual variables.

---

### 7. Telegram Rich Messages (Bot API 10.1+)
For highly structured layouts, Telegram Bot API 10.1+ supports **Rich Messages** (enabling lists, tables, and headings) via the `sendRichMessage` method. For details on parameters and schema fields, refer to the [Telegram Bot API Rich Messages documentation](https://core.telegram.org/bots/api#rich-messages).

* **Code Example**:
  ```javascript
  await callTelegram(token, 'sendRichMessage', {
    chat_id: chatId,
    rich_message: {
      markdown: '# Title\n\n- Bullet 1\n- Bullet 2'
    }
  });
  ```
* **Graceful Fallback**: Since Rich Messages are a newly introduced feature, some client versions may not fully support their rendering yet. To ensure maximum compatibility, the framework catches failures and falls back to standard `MarkdownV2` plain messages.

---

## 📋 Developer & Platform Guidelines

When developing bots or adding features using this framework, please adhere to these coding and localization conventions:

1. **Avoid Hardcoding URLs**:
   Do not hardcode external URLs (such as repository links or help guides) directly in localized translation dictionaries.
   Instead, define them as constants in your application core or localization setup and interpolate them dynamically.
2. **Console Logs English Rule**:
   All terminal, debug, and system console logs (`console.log`, `console.warn`, `console.error`) **must always remain in English**
   to facilitate standardized operations and cloud log monitoring (e.g. on Vercel or Netlify logs).
3. **No Dashboard/Setup Localization**:
   Administrative web interfaces (such as the setup page HTML, webhook registration responses, and JSON API error payloads)
   are meant for developers and system operators.
   They do not require multi-language translations and should be written in English.
