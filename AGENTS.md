# AGENTS: Agent Instructions & Mandatory Rules 🤖📋

This document outlines strict requirements for AI agents working on the **Telegram Voice Transcribot** codebase. 

### ⚠️ Purpose of this Document
This file serves as a quick overview map and a strict rulebook for AI agents. 
While it contains a high-level map of the directory structure to help agents navigate quickly, **it MUST NOT contain primary documentation of technical behavior** (such as edge-cases, procedural flows, or architectural reasoning). All behavioral and technical documentation must be kept in appropriate places (`README.md`, `DEVNOTES.md`, `TESTING.md`, or automated tests).

---

## 1. Project Directory Structure

```
├── api/
│   ├── setup.js         # Endpoint to configure/set up Telegram webhook URL
│   └── webhook.js       # Main Telegram update and webhook handler
├── lib/
│   ├── framework/
│   │   ├── README.md            # Documentation for the generic framework
│   │   ├── adapters.js          # Generic platform request adapters (Vercel, Netlify, Web Request)
│   │   ├── dashboard.js         # Generic admin settings and webhook setup web page
│   │   ├── localize.js          # Core framework localization setup
│   │   ├── markdown.js          # Generic HTML to MarkdownV2 and symbols escaper
│   │   ├── menu.js              # Generic menu engine and callback queries handler
│   │   ├── router.js            # Generic command and HTTP routes registry and dispatcher
│   │   └── utils.js             # Generic crypto, hash, and header helper utilities
│   ├── wav-wrapper.js   # Utility to detect and wrap ADTS-AAC, CAF, AMR, GSM into WAV container
│   ├── commands.js      # Interactive commands and settings management
│   ├── core.js          # Core update handling and webhook business logic
│   ├── transcriber.js   # Audio downloading and Whisper API orchestration
│   ├── dashboard.js     # Web dashboard / landing page configuration and webhook setup
│   ├── localize.js      # Multi-language translation dictionaries (en, ru, de, ukr)
│   ├── menus.js         # Specific bot menu definitions and settings mappings
│   ├── package.json     # Local library package configuration to enable ESM
│   ├── utils.js         # Transcription text chunking, Whisper token estimation, and re-exports
│   └── webhook-settings.js # Helper functions to parse and build webhook query-string configurations
├── netlify/
│   └── functions/
│       ├── setup.js     # Netlify setup function
│       └── webhook.js   # Netlify webhook function
├── src/
│   ├── deno.js          # Deno Deploy & Val Town entry point
│   └── index.js         # Cloudflare Workers entry point
├── scripts/
│   ├── ci_github_fork_sync.sh   # Pure decision logic for the GitHub fork sync workflow
│   ├── dev_node_server.js       # Local HTTP dev server simulating serverless runtime
│   ├── dev_test_webhook.js      # Helper payload generator to test the webhook locally
│   ├── ops_set_avatar.js        # Script to manually configure the bot profile photo/metadata
│   ├── ops_set_webhook.js       # Script to manually configure the bot webhook via API
│   └── ops_transcribe.sh        # Direct audio transcription CLI helper tool
├── tests/
│   ├── github_fork_sync.mjs     # Tests all 5 fork sync scenarios without a live git repo
│   ├── localization.mjs         # Validates key alignment and scans for unused keys
│   ├── remote.js                # Verifies deployment integration and webhooks
│   ├── run_all.mjs              # Sequentially executes all lints and test suites
│   ├── scenarios.mjs            # Core integration behavior and webhook state tests
│   ├── unit_markdown.mjs        # Markdown formatting and escaping tests
│   ├── unit_routing.mjs         # Commands routing and HTTP endpoint dispatcher tests
│   ├── unit_utils.mjs           # Utilities, chunking and estimation logic tests
│   ├── unit_webhook.mjs         # Webhook parsing and query-string generation tests
│   ├── units.mjs                # Node-compatible unit tests wrapper
│   ├── whitebox.mjs             # Deno-compatible whitebox tests wrapper
│   └── whitebox_helper.mjs      # Test assertion and setup helper utilities
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

### 🔒 F. Git Safety and Clean State Requirement
* Before initiating any potentially destructive, bulk, or recovery operations (such as restoring files from backups, resetting git branches, running file recovery scripts, or performing massive file rewrites), the agent **MUST** check the git status.
* If there are uncommitted local changes, the agent **MUST NOT** proceed with destructive commands until those changes are either committed, stashed, or the user has explicitly confirmed and approved overwriting the uncommitted files.
* When applying edits to files that already contain uncommitted modifications, the agent **MUST** inspect the `git diff` of those files first. You must ensure that new logic or dictionary keys are merged cleanly on top of the user's modifications without creating duplicates, syntax errors, or discarding custom user work.

### 🧪 G. Mandatory Local and Remote Verification
* After making modifications to the executable codebase (JavaScript, JSON, config files, etc.) or performing a deployment, the agent **MUST** execute local and/or remote integration tests.
* If only documentation, markdown files (such as `.md`), or non-executable files were modified without any changes to the code or configurations, the agent **MUST NOT** run the test suite.
* When code changes are present, the agent **MUST** run the test runner script (`npm run test:remote -- local=http://localhost:3000` for local verification, and `npm run test:remote -- <platform>=<url>` for deployed verification).
* The agent **MUST** verify that all tested endpoints (including health check and webhook signature validations) respond with `200 OK` and show no runtime errors before declaring the task complete.

### 🚫 H. Permission for Documented Behavior Changes
* Before changing any behavior that is explicitly and strictly regulated in the project documentation (such as `DEVNOTES.md`, `TESTING.md`, or `AGENTS.md`), the agent **MUST** explicitly request the user's permission to do so.

### 🔄 I. Deno and NPM Script Synchronization
* The project supports both Deno and Node.js runtimes.
* If the agent modifies, adds, or removes any NPM script within `package.json`, the agent **MUST** immediately update and synchronize the corresponding Deno task inside `deno.json`.

### 🗂️ J. Single Source of Truth for Behavior
* When updating documentation, agents **MUST** ensure that `DEVNOTES.md` answers the question "WHY" a specific technical decision was made, rather than "HOW EXACTLY" it is implemented.
* Explicit procedural details and behavioral edge-cases **MUST** be covered directly by the automated test suite (e.g. `ci_test_units.mjs`, `ci_test_scenarios.mjs`).
* The documentation should simply reference those tests to avoid creating a duplicate, out-of-sync source of truth.

### 🔌 K. Context7 Documentation Queries
* If the user instructions or rules require using the `context7` skill to query documentation, the agent **MUST** use the CLI utility directly via terminal commands (e.g. `npx ctx7@latest library ...` and `npx ctx7@latest docs ...`). 
* Do not rely on Context7 MCP server tools (`resolve-library-id` or `query-docs`) as they might not be connected or available.

**Resolved Library IDs (skip `library` lookup, use directly):**
| Library | Context7 ID |
| :--- | :--- |
| Telegram Bot API (official) | `/websites/core_telegram_bots_api` |

### ✍️ L. Proactive Knowledge Preservation in Skills
* If the agent searches for, extracts, or discovers undocumented API schemas, formatting rules, or implementation patterns (such as those from external documentation or web searches), the agent **MUST** proactively suggest creating a new global/local skill or adding a `references/` subdirectory with this information to preserve knowledge for future agent sessions.

### 📝 M. Clean User-Facing Feature Highlights (README)
* When editing user-facing files like `README.md`, keep feature lists and high-level descriptions strictly focused on core capabilities.
* Do **NOT** clutter these user-facing bullet points with optional settings, environment variables (e.g. `WHISPER_PROMPT`), or command options (e.g. phrases beginning with "Optionally..."). Keep configuration and setup details in technical developer documentation (such as `DEVNOTES.md` or a "Configuration" section).

