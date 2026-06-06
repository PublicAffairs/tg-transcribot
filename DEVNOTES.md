# DEVNOTES: Architecture, Configuration, and Integration 🛠️⚙️

This document describes the core architecture, configuration parameters, localization mechanics, and reliability policies of the **Telegram Voice Transcribot** bot.

For details on the underlying database-less, cross-platform serverless engine (request adapters, command routing, interactive menus, generic dashboard, 429 rate limit protection, and markdown engines), see the [Serverless Telegram Bot Framework Documentation](lib/framework/README.md).

For specific details regarding audio formats, see `FORMATS.md`.

---

## ⚠️ Core Documentation Rule
**DEVNOTES answers "WHY", not "HOW EXACTLY".** 
To prevent creating a second source of truth that drifts from the codebase, detailed mechanics, edge-cases, and behavioral specifications MUST be maintained within the automated test suites (`tests/*.mjs`), which are all executed together via `npm run test`. This document should only outline high-level architecture, design rationale, and references to those tests. For instructions on how to run tests, configure local dev servers, or use debugging tools, refer to TESTING.md.

**All notes, architecture guides, API references, and documentation regarding the generic serverless framework (adapters, routing, keyboard menus, markdown escaper, localization engine, and dashboard) MUST be kept in the [Serverless Telegram Bot Framework Documentation](lib/framework/README.md) rather than in this file.**

---

## Part I: Core Bot Configuration & Routing

### 1. Stateless Configuration Parameters

All runtime configurations and user settings for Transcribot are stored directly inside the registered Telegram webhook URL as query parameters.

#### Webhook URL Format

```
https://your-bot.example.com/api/webhook?groups=off&lang=ru&model=whisper-large-v3&verbose=on&...
```

#### Parameters and Their Meaning

| Parameter | Values | Default | Description |
|---|---|---|---|
| `owner` | Telegram Chat ID | (empty) | Owner's Telegram chat ID for authorization, setup, and notifications. |
| `groups` | `on` / `off` | `on` (absent = `on`) | Controls whether the bot processes audio/video messages in groups. |
| `lang` | ISO code or `auto` | `auto` | Target transcription language for the Whisper API. |
| `langbot` | `en`, `ru`, `de`, `uk`, or `auto` | `auto` | Bot UI language (fallback for system messages and keyboards). |
| `autodetect` | `on` / `off` | `on` (absent = `on`) | Toggles automatic interface language detection for the bot's UI. |
| `model` | Model name string | First in `WHISPER_MODELS` | The Whisper model string sent to the transcription API. |
| `notify_add` | `on` / `off` | `on` (absent = `on`) | Sends owner an alert when the bot is added to new group chats. |
| `notify_conn` | `on` / `off` | `on` (absent = `on`) | Sends owner an alert on Telegram Business connection changes. |
| `notify_err` | `on` / `off` | `on` (absent = `on`) | Sends owner an alert if any transcription request fails. |
| `verbose` | `on` / `off` | `off` | Appends technical file details to transcription replies. |
| `prompt` | URL-encoded string | (absent = uses `WHISPER_PROMPT` env, or no prompt) | [Custom][Whisper prompting guide] [Whisper] prompt (max ~224 tokens). Empty (`prompt=`) disables prompt. Note: When saved in the webhook URL, the prompt is truncated from the left (keeping the end) to fit within the [~224][OpenAI Speech to Text Guide] tokens limit. |
| `OWNER` | User ID or Username | (empty) | Pre-configured owner ID/username (env variable `OWNER`) to restrict dynamic registration hijacking. |

[Whisper]: https://openai.com/index/whisper/
[Whisper prompting guide]: https://developers.openai.com/cookbook/examples/whisper_prompting_guide
[OpenAI Speech to Text Guide]: https://developers.openai.com/api/docs/guides/speech-to-text

*Detailed edge cases for settings parameters are verified in `tests/units.mjs` and `tests/scenarios.mjs`.*

#### Key Parameter Details & Policies

The detailed edge cases and exact implementation policies for the following features are codified as executable specifications in the automated test suite (`tests/units.mjs`, `tests/scenarios.mjs`, and `tests/whitebox.mjs`). Please refer to the tests as the primary source of truth for:

* **Custom Prompt Constraints & Defaults** (Unit Tests)
* **Bot UI Language Resolution Flow** (Unit Tests)
* **Webhook Parameters & State Management (Guest/Secretary Modes)** (Unit Tests and Scenarios)
* **Audio Format Detection & WAV Wrapping (`detectAudioFormat`, `wrapAacInWav`, `wrapCafInWav`, `wrapRawAudioInWav`)** (Unit Tests)
* **Bot Addressing and Mentions (`hasBotMention` & `isMessageDirectedToBot`)** (Unit Tests)

#### Error Classification and Notification Policy

To maintain a clean user experience while ensuring that administrators are aware of critical system failures, errors are categorized into three levels:

| Category | Description | Examples | Handling Behavior |
|---|---|---|---|
| **Critical Errors** | Severe issues that block core bot operations or message delivery. | Runtime exceptions (`TypeError`), Whisper API failures, or Telegram API message delivery failures (e.g., bad Markdown parsing). | Caught in the deferred tasks handler and logged, and additionally sent directly as a stack-trace notification to the owner's Telegram chat (if `notify_err` is enabled). |
| **User-Facing Warnings** | Expected operational issues that affect the user's current request. | File size limit exceeded (>20MB), unsupported media formats (archives, PDF, etc.), or missing Whisper API keys. | Sent as a user-friendly error message reply in the active chat. Ignored for owner alerts. |
| **Non-Critical Logs** | Standard operational events that do not impact overall health. | Unauthorized command attempts by non-owners, duplicate Telegram `update_id` payloads. | Written strictly to the server's platform console logs (`console.log` / `console.warn`). No message is sent. |

*Verified by Scenario 7 in `tests/scenarios.mjs`.*

---

### 2. HTTP Routing & Platform Entrypoints
The bot registers its handlers on the framework's HTTP router (`lib/framework/router.js`):
* **`/api/webhook`**: Receives updates from Telegram (dispatched to `handleWebhook` in `lib/core.js`).
* **`/api/setup`**: Setup endpoint for webhook registration/reset (dispatched to `handleSetup` in `lib/core.js`).
* **`/api/health`**: Health status and diagnostics checks (dispatched to `handleHealthCheck` in `lib/core.js`).
* **`/`**: Configuration web panel dashboard (dispatched to `handleDashboard` in `lib/dashboard.js`).

Platform-specific redirects (e.g., `vercel.json` and `netlify.toml`) route incoming traffic to these endpoints, which are normalized and handled by `lib/framework/adapters.js`.

---

### 3. Webhook Setup, Registration & Security
* **Dynamic Owner Registration**: To allow a database-less architecture, the bot dynamically assigns its first private-chat user as the owner by updating the webhook URL state. During this "unclaimed" state, group, guest, and secretary events are discarded to prevent security leaks. 
* **Dashboard Pre-flight Security**: The dashboard attempts to automatically register the webhook to simplify deployment. To prevent local dev environments from accidentally overwriting a live production webhook, the dashboard runs a strict validation check on its own URL before communicating with the Telegram API.
* **Owner Reset Mechanics**: The dashboard provides a "Reset Owner" action to allow the bot to be transferred to a new administrator, provided the request is authorized with the secure token.
* **The `/webhook` Command**: Allows the owner to view or migrate the active webhook URL directly from the Telegram interface. To prevent breaking the bot, the command performs pre-flight health checks before migrating, and securely inherits configuration parameters.
* **Manual Webhook Registration**: If auto-registration is not preferred or fails, the webhook can be manually registered:
  1. **CLI Script**:
     ```bash
     npm run set-webhook -- https://your-bot.example.com
     ```
  2. **Setup Endpoint**: Make a `GET` or `POST` request to `/api/setup` with your `token`.

*Verified in `tests/scenarios.mjs`.*

---

### 4. Network Request Timeouts
To prevent execution hanging, the bot overrides or implements specific timeout boundaries as described in [Framework Abort Timers](lib/framework/README.md#4-rate-limit-handling-429--abort-timers):
* **Telegram API (`callTelegram`)**: Enforced using `TELEGRAM_API_TIMEOUT` in the `lib/framework/utils.js`.
* **Audio Downloads & Whisper API Transcriptions**: Enforced using `DOWNLOAD_TIMEOUT` and `TRANSCRIBE_TIMEOUT` in the `lib/transcriber.js`.
* **Health Checks (`/health`) & README Fetch (`/readme`)**: Enforced using `README_FETCH_TIMEOUT` and `HEALTH_CHECK_TIMEOUT` in the `lib/commands.js`.

---

### 5. Dynamic Versioning
The project propagates its version dynamically across different runtimes (Node.js, Deno, Cloudflare Workers) as detailed in [Dynamic Version Propagation](lib/framework/README.md#5-dynamic-version-propagation).
The configuration builder validates this version propagation and handles missing configuration fallbacks, which is verified by `testConfigGeneration` in `tests/units.mjs`.

---

### 6. Deno Compatibility & Tasks
To ensure first-class support for Deno Deploy, the project includes a `deno.json` configuration file at the root.
* **Task Mapping**: Scripts defined in `package.json` are mirrored as Deno tasks in `deno.json`.
* **Sync Verification**: The consistency between Node NPM scripts and Deno tasks is strictly enforced by the automated unit test `testDenoPackageSync` in `tests/units.mjs`.
* **Sandbox Permissions**: Running the test tasks in Deno requires basic security flags (`--allow-read`, `--allow-write`, `--allow-env`) to access environment configurations, write temporary test assets, and read localized assets.

---

## Part II: Bot Logic & Command Handling

### 7. Profile & Avatar Automation
To claim the bot ownership, the owner starts the bot in a private chat. The bot then auto-configures its own Telegram profile Name, Description, Short Description, and commands menu dynamically:
* **Plain Text Constraint**: Telegram's command registration API accepts strictly plain text. The bot automatically strips formatting and resolves Markdown links to anchors before registering.
* **Scope Isolation**: Admin commands are chat-scoped (`BotCommandScopeChat`) and visible only to the registered owner's chat. Regular users only see public commands in the default scope.
* **Allowed Owner Verification Gate**: If the `OWNER` environment variable (mapped to `config.allowedOwner`) is set, the bot checks the sender's user ID and username against it. Private messages from any other users are discarded, preventing unauthorized claiming of ownership.
* **Avatar Upload**: The bot searches the root directory for `avatar.jpg`, `avatar.png`, or `avatar.jpeg` and automatically uploads it via `multipart/form-data` to set the profile picture.
* **Dynamic Refresh & Cache Bypass**: Because Telegram clients aggressively cache the command list locally, the bot dynamically updates the user's chat-scoped menu on every `/start` or `/help` command. This forces the Telegram server to trigger an immediate menu reload, bypassing the client-side cache and ensuring both guests and owners see their respective menu layouts instantly.
* **Profile Metadata & /setbotinfo**: The profile fields `setMyName`, `setMyDescription`, and `setMyShortDescription` are updated when the owner first claims the bot (`sendOwnerGreeting`). The owner can also refresh/re-apply these settings on-demand at any time by sending the `/setbotinfo` command.
* **Avatar Upload CLI**: In addition to auto-uploading, setting the bot's avatar photo can be triggered manually using the helper script `scripts/ops_set_avatar.js`.

*Codified in `lib/commands.js` and verified by `testBotAvatarAutomation` in `tests/units.mjs` and Test 9b in `tests/scenarios.mjs`.*

---

### 8. `/prompt` Command & Source Parsing
The `/prompt` command is used to inject instruction cues into Whisper. The bot parses commands differently depending on three cases:

| Case | Structure | Command source | Caption used? | Reply cites |
|------|-----------|---------------|---------------|-------------|
| **1** | Message A (text-only) replies to message B (has file) | `message.text` of A | ❌ Never | Message B (the file message) |
| **2** | Message itself contains the file | `message.text` OR `message.caption` | ✅ Only here | Same message |
| **3** | Forwarded message with a file | `message.text` only | ❌ Never | Same message |

#### Design Rationale & Reply Target:
* **Case 1 (reply-to)**: When the user sends `/prompt text` as a reply to a previously sent voice message, the command text lives in `message.text` (no file in the current message). The bot must quote the *original* voice message in its reply — not the command message — so the result is contextually anchored to the audio.
* **Case 2 (inline caption)**: When a file (voice, audio, document) is sent together with a `/prompt text` caption in the same message, the caption is the natural home for the command. This is the only case where `message.caption` is parsed for commands.
* **Case 3 (forwarded)**: A forwarded message's caption belongs to the original sender and must never be treated as a command by the recipient bot. The `forward_from`, `forward_origin`, or `forward_from_chat` fields are used to detect forwards and suppress caption-based command parsing.

*Verified in `tests/scenarios.mjs` (Scenarios 19, 20, 21, 28, 30).*

---

### 9. Secretary Mode (Business Connections)
Intercepts messages in the owner's personal chats via `business_message` updates.
* **Silently Ignores Daily Chat**: To prevent the bot from spamming chat partners with error messages or default greetings, the bot runs silently and only processes voice notes that address the owner or are explicitly directed to the bot.
* **Anti-loop Guard**: Suppresses auto-replies to other bots or non-addressed media notes to prevent loops.

*Verified in `tests/scenarios.mjs`.*

---

## Part III: Content Formatting & Constraints

### 10. Dynamic Transcription Pagination (Chunking)
Telegram enforces a 4096-character limit on message payloads. Transcriptions that exceed this limit are chunked dynamically:
* **Pre-formatting Splitting**: Splitting the raw transcription text *before* applying MarkdownV2 escaping and formatting prevents formatting elements (like `*`, `_`, ```) from being split across chunk boundaries, avoiding malformed entities that trigger Telegram API Bad Request errors.
* **Rendered Length Splitting**: Calculates the exact Markdown length of the header, verbose footer, and pagination digits, subtracts it from 4096, and chunks the transcription text to fit perfectly. It reserves a tiny 10-character buffer for the pagination digits, utilizing over 99.9% of the Telegram limit.
* **Single-Use Guest Query Guard**: For guest message replies, subsequent chunks must be sent as regular messages using the standard `sendMessage` method since `answerGuestQuery` is a one-time API action. If the guest hasn't started the bot in their private chat, subsequent `sendMessage` requests fail with `403 Forbidden`. The bot appends a warning footnote to the first chunk informing the guest how to retrieve full transcripts.
* **Self-Healing Fallbacks & Error Propagation**: If a message send fails due to formatting issues (`can't parse entities`), the bot falls back to retrying the message as plain text (deleting `parse_mode`).

*Verified by Scenarios 33, 34, and 35 in `tests/scenarios.mjs`.*

---

### 11. Localization Mechanics & Multi-Language Support
The bot supports dynamic auto-detection of the owner's Telegram client language, falling back to a statically configured language if auto-detection is unavailable or the user's language is unsupported.

#### Bot UI Language & Fallback Keyboard Rationale:
* **Simultaneous Highlighting**: In the `/langbot` configuration menu, the "Auto-detect" checkmark button (✅/❌) and the selected fallback language radio star button (★) are highlighted **simultaneously**. This is intentional: the owner must always see the status of the auto-detection feature AND which specific language is designated as the fallback.
* **State Separation**: Selecting a specific language button changes the fallback language code (`settings.langbot`), but does NOT automatically disable the dynamic auto-detection flag (`settings.autodetect`), allowing both values to remain configured in the webhook URL query string.
* **Raw Language Code Display**: The "Auto-detect" button displays the raw, unnormalized language code exactly as it is received from Telegram (e.g., `en-US`, `es-ES`, `ru`) in parentheses (e.g., `✅ Auto-detect (en-US)`). This allows the owner to inspect exactly what language code Telegram sends.

---

### 12. File Size Limits & Platform Payloads
* **Telegram Bot API limit**: The standard cloud Telegram Bot API enforces a **20 MB** download limit per file.
* **Serverless incoming payload limits**: Hosts like Vercel (4.5 MB) and Netlify (6 MB) enforce strict payload limits on incoming webhook requests. However, these limits **do not** restrict outgoing HTTP `fetch` requests (such as downloading files from Telegram's servers or uploading to Groq). Therefore, the bot can fully process files up to the 20 MB Telegram limit.
* **Groq Whisper limit**: Cap is 25 MB.
* **Bypassing limits**: Processing files larger than 20 MB requires running a local Bot API server or using MTProto.

---

## Part IV: Operations & CI

### 13. Rate Limit Handling (429 Too Many Requests)
* **API Rate Limits**: Bursts of voice notes or fast keyboard settings toggling can trigger 429 errors.
* **Owner Alerts**: The generic framework retry/bypass boundaries are implemented in `callTelegram`. When a request is skipped due to a long rate limit, the bot fires a failure notification to the owner's chat to ensure transparent operational monitoring.

---

### 14. Fork Sync Workflow
A GitHub Actions workflow (`.github/workflows/sync.yml`) pulls upstream updates into forks weekly. The decision script (`scripts/ci_github_fork_sync.sh`) handles scenarios like fast-forward merges, local commits ahead, and diverged histories, emitting GitHub warning/error annotations.

*Verified by `tests/github_fork_sync.mjs`.*
