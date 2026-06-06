# AGENTS: Project Structure and Agent Instructions 🤖📦

This document defines the technical structure of the **Telegram Voice Transcribot** project and outlines strict requirements for AI agents working on this codebase.

---

## 1. Project Directory Structure

```
├── api/
│   ├── setup.js         # Endpoint to configure/set up Telegram webhook URL
│   └── webhook.js       # Main Telegram update and webhook handler
├── lib/
│   ├── aac-to-m4a.js    # Utility to detect ADTS-AAC and wrap it in M4A container
│   └── core.js          # Shared unified handlers for all platforms
├── netlify/
│   └── functions/
│       ├── setup.js     # Netlify setup function
│       └── webhook.js   # Netlify webhook function
├── src/
│   ├── deno.js          # Deno Deploy & Val Town entry point
│   └── index.js         # Cloudflare Workers entry point
├── scripts/
│   ├── node_server.js   # Local Node.js test server mimicking Vercel environment
│   ├── postinstall.js   # Patches mux.js issues (runs after npm install)
│   ├── set_webhook.js   # Script to manually configure the bot webhook via API
│   └── test_webhook.js  # Helper payload generator to test the webhook locally
├── wrangler.jsonc       # Cloudflare Wrangler configuration
├── netlify.toml         # Netlify configuration
├── deno.json            # Deno configuration (defines deploy entrypoint)
├── DEVNOTES.md          # Technical notes regarding AAC processing and patches
├── TESTING.md           # Instructions on how to run local testing servers/curl requests
├── README.md            # User-facing project overview, setup, and deployment guides
├── vercel.json          # Vercel configuration & routing rules
├── package.json         # Project manifests and scripts
└── PLAN.md              # [Local Work Plan] Temp roadmap (ignored by Git)
```

---

## 2. Mandatory Agent Guidelines & Requirements

When interacting with this codebase or performing modifications, agents **MUST** follow these rules without exception:

### 📋 A. Preliminary Planning Requirement
* Before making any code changes, creating new files, or invoking modification commands, the agent **MUST** formulate a structured plan.
* **Insufficient Data block:** If the agent lacks the necessary tokens, environment configs, system information, or documentation, and is unable to acquire them autonomously, the agent **MUST NOT** proceed or make assumptions. It must immediately halt execution, report what is missing, and ask the user to decide on the next steps.

### 💻 B. Prefer Native Shell Commands over Scripts
* Always prefer using standard platform/built-in shell commands directly (e.g., `node test_server.js`, `curl.exe`, `npm run ...`) instead of creating or wrapping commands in custom shell scripts (`.sh` or `.ps1` files) unless explicitly asked to do so by the user.

### 🌐 C. English Documentation and Code Language
* **Code & Comments:** All code, inline comments, variable names, and terminal logs **MUST** be written in **English**.
* **Repository Documentation:** All key markdown documents representing the repository state (`README.md`, `TESTING.md`, `DEVNOTES.md`, `AGENTS.md`) **MUST** be written in **English**.
* **Exception:** The `PLAN.md` file (or `implementation_plan.md` artifact) is a transient workspace roadmap and may be written in any language (including Russian), as it is not meant to be persisted or committed into the repository history.

### 📚 D. Documentation Sync
* After making any code changes, the agent **MUST** ensure they match the existing repository documentation. If code modifications impact configurations, setup steps, platform routing, or API behaviors, the agent **MUST** update, correct, or expand the documentation accordingly.

### ❓ E. Ambiguous or Contradictory Instructions
* If the user provides unclear commands, ambiguous instructions, or contradictory requests, the agent **MUST** immediately stop execution, refrain from making arbitrary assumptions, and request clarification from the user before proceeding.

