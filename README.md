# Telegram Voice Transcribot 🎤🤖

A high-performance Telegram bot that transcribes voice messages and audio files into clean text
using the **[Whisper](https://github.com/openai/whisper) API**
(by default: free-tier [groq](https://groq.com/) service). 

It is designed to run completely **serverless**, making it fast, free, and incredibly simple to deploy.

---

## ☁️ Serverless!

Deploying this bot on a serverless platform gives you incredible benefits as a bot owner:
- **Zero Cost**: Generous free tiers on Vercel, Cloudflare, and Val Town mean you pay nothing for hosting.
- **Zero Maintenance**: No need to rent a VPS, configure servers, or keep background scripts running 24/7.
- **Always Online**: Your bot wakes up instantly when it receives a message and automatically scales down to zero when idle.

---

## 🌟 Key Features

- **Audio & Video Note (Circles) Transcription**: Transcribes standard voice messages, audio files,
  and Telegram video notes (circles) automatically.
- **Direct Chat**: Send or forward voice messages directly to the bot in a private chat.
- **Group Mode**: Add the bot to any group chat to transcribe voice messages for all members.
- **[Guest](https://t.me/TelegramTips/565) Mode**: Access the bot seamlessly from any chat without adding it.
- **[Secretary](https://t.me/TelegramTips/567) Mode**: Integrates directly with your personal Telegram account to intercept voice messages and post transcriptions on your behalf.
- **Multilingual Transcription**: Powered by the Whisper model with a default multilingual guiding prompt for highly accurate transcription.
- **Owner Notifications**: Instantly notifies you when the bot is added to a new group (with an automatic invite link) or when its Secretary status changes.

---

## 🛠️ Requirements & Setup

To get started, you will need the following accounts and tokens:

### 1. Account Requirements
* **Telegram Account**: To create the bot and receive transcriptions.
* **Groq Account**: To get a free API key for lightning-fast Whisper transcriptions.
  Register at [console.groq.com](https://console.groq.com).  
  Alternatively: use any other provider by specifying the corresponding `WHISPER_API_BASE` variable.
* **Account** on a serverless cloud platform of your choice (see below)!

### 2. Configuration Variables

| Variable | Description | Where to Get |
| :--- | :--- | :--- |
| **`TELEGRAM_BOT_TOKEN`** | The API token for your bot. | Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, and copy the token. |
| **`WHISPER_API_KEY`** | API key to access the Whisper API (with fallbacks: `GROQ_API_KEY`, `OPENAI_API_KEY`, `API_KEY`). | Go to your provider's dashboard (e.g., [console.groq.com/keys](https://console.groq.com/keys) or [platform.openai.com](https://platform.openai.com)). |

<details>
<summary>⚙️ Optional Configuration Variables</summary>

| Variable | Description | Default / Where to Get |
| :--- | :--- | :--- |
| **`OWNER_CHAT_ID`** | Your personal Telegram chat ID to receive owner alerts (e.g. when the bot is added to a new group or its secretary status changes). | **Optional**. Send a message to [@userinfobot](https://t.me/userinfobot) or [@raw_data_bot](https://t.me/raw_data_bot) to get your unique number. |
| **`WHISPER_API_BASE`** | The base URL of the OpenAI-compatible transcription API. | `https://api.groq.com/openai/v1` (e.g. change to use OpenAI or self-hosted servers). |
| **`WHISPER_MODEL`** | The model to use. | `whisper-large-v3` (can be set to `whisper-large-v3-turbo` or `whisper-1`). |
| **`WHISPER_LANGUAGE`** | Forces a specific transcription language (e.g. `ru`, `en`, `de`). | `auto` (leave empty for auto-detection). |
| **`WHISPER_PROMPT`** | Guides spelling, punctuation, and language bias (e.g., to support multilingual messages). | Default: a template showcasing multilingual transcription. |

</details>

---

## 🔒 Recommended Settings & Security

> [!IMPORTANT]
> **Personal Use Disclaimer**: This bot is designed primarily for personal use.
> While you can share it with friends, the free tier limits of the transcription APIs (like Groq) are not infinite.
> To avoid abuse and limit usage, it is recommended to configure your bot's privacy settings via [@BotFather](https://t.me/BotFather) 
> to control who can interact with it.
> Optionally, set `OWNER_CHAT_ID` to receive real-time notifications about bot activity.

<details>

### Restricting Direct Interactions
By default, anyone can start a chat and interact with your bot. To prevent unauthorized usage and protect your API limits, you can restrict access to specific users:
1. Open the [@BotFather](https://t.me/BotFather) Mini App.
2. Select your bot and navigate to **Bot Settings**.
3. Scroll down to the **Access** section at the bottom.
4. Here, you can disable public access and explicitly specify which users are allowed to use your bot.

### Restricting Group Additions
By default, anyone can add your bot to a group chat. You can disable this:
1. Open a chat with [@BotFather](https://t.me/BotFather).
2. Send the `/setjoingroups` command.
3. Select your bot and set it to **Disabled**. Now, only you (the creator) can add it to groups.

### Group Privacy Settings
To control what messages the bot can read when in a group:
1. Message [@BotFather](https://t.me/BotFather) and send `/setprivacy`.
2. Select your bot.
3. Set it to **Enabled** (this is the default).
  In this mode, the bot will only see voice/audio files explicitly sent as replies to it or when it is mentioned.
  If you want the bot to transcribe *every* voice message in the group automatically, set this to **Disabled**
  (which requires the bot to have "Access to Messages" permission).

</details>

---

## 🚀 Multi-Platform Deployment Options

The bot runs using a unified core engine and thin adapters, allowing it to run serverless on almost any modern cloud platform.
Choose your preferred environment below:

> [!IMPORTANT]
> **Environment Variables Setup**:
> For any platform, you must configure the required environment variables (`TELEGRAM_BOT_TOKEN` and `WHISPER_API_KEY`)
> listed in the [Configuration Variables](#2-configuration-variables) section.
> The `OWNER_CHAT_ID` and other parameters are optional and can be configured later.

### Deploy with [Vercel](https://vercel.com)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPublicAffairs%2Ftg-transcribot&env=TELEGRAM_BOT_TOKEN,WHISPER_API_KEY&envDescription=Add%20your%20Telegram%20Bot%20Token%20and%20Whisper%20API%20Key%20to%20setup%20the%20transcription%20service.&project-name=telegram-transcribot)

<details>
<summary>Alternatively: via Vercel CLI</summary>

1. Install CLI: `npm install -g vercel`
2. Log in: `vercel login`
3. Configure environment variables in the Vercel Dashboard, or add them using:
   ```bash
   vercel env add TELEGRAM_BOT_TOKEN production --value "your_telegram_bot_token" --yes
   vercel env add WHISPER_API_KEY production --value "your_whisper_api_key" --yes
   ```
4. Deploy: `vercel --prod --yes`
</details>

---

### Deploy to [Cloudflare](https://www.cloudflare.com/products/workers/)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/PublicAffairs/tg-transcribot)

<details>
<summary>Alternatively: via Wrangler CLI</summary>

1. Deploy directly from the root directory using Wrangler:
   ```bash
   npx wrangler deploy
   ```
2. Set the required variables as secrets in the Cloudflare dashboard or Wrangler CLI:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put WHISPER_API_KEY
   ```
</details>

---

### Deploy to [Netlify](https://www.netlify.com/platform/core/functions/)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/PublicAffairs/tg-transcribot)

<details>
<summary>Alternatively: via Netlify CLI</summary>

1. Build and configure using the Netlify CLI from the root directory:
   ```bash
   npm install -g netlify-cli
   netlify login
   netlify init
   ```
2. Add the required environment variables in your Netlify site settings dashboard.
3. Deploy the site:
   ```bash
   netlify deploy --prod --dir=.
   ```
</details>

---

### Deploy on [Deno](https://deno.com/learn/serverless-functions#deploying-your-serverless-function-to-deno-deploy)

[![Deploy on Deno](https://deno.com/button)](https://console.deno.com/new?clone=https%3A%2F%2Fgithub.com%2FPublicAffairs%2Ftg-transcribot)

<details>
<summary>💻 Deploy via GitHub Integration</summary>

1. Connect your GitHub repository to [Deno Deploy](https://dash.deno.com).
2. Select `src/deno.js` as the entry point (this is automatically configured if Deno Deploy detects the `deno.json` file in the root).
3. Set the required environment variables in the project's settings configuration panel.
</details>

---

### [Val Town](https://www.val.town)
Zero-setup interactive coding environment.

<details>
<summary>💻 Deploy via Forking (Recommended)</summary>

1. Open the template Val at [val.town/v/publicaffairs/transcribot](https://www.val.town/v/publicaffairs/transcribot) (or search for `transcribot` on Val Town).
2. Click **Fork** to create your own copy.
3. Add the required environment variables (`TELEGRAM_BOT_TOKEN`, `WHISPER_API_KEY`) in your Val Town environment settings.
</details>

<details>
<summary>💻 Deploy via Val Town CLI (vt)</summary>

1. Install the CLI using Deno:
   ```bash
   deno install -grAf jsr:@valtown/vt
   ```
2. Run the authentication prompt:
   ```bash
   vt
   ```
3. Sync your local files (including `src/deno.js`) to Val Town:
   ```bash
   vt push
   ```
</details>

---

## 🔗 Hooking Telegram to your Deployment

Once your serverless deployment is live on any of the platforms above (e.g. `https://your-bot.example.com`), register the webhook URL with Telegram:

1. Create or verify a local `.env.local` file containing:
   ```env
   TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
   ```
2. Trigger the setup API by executing the webhook registrar:
   ```bash
   npm run set-webhook -- https://your-bot.example.com
   ```
   *Alternative*: Simply make a GET request to your setup endpoint with the token as a query parameter (useful for browser setup or Deno/Val Town):
   ```
   https://your-bot.example.com/api/setup?token=YOUR_TELEGRAM_BOT_TOKEN
   ```

You are all set! Test the bot by sending it a voice message in Telegram. 🎉

