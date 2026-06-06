// src/index.js
// Cloudflare Workers Default Entry Point for Telegram Voice Transcribot

import { handleWebRequest } from '../lib/core.js';

export default {
  async fetch(request, env, ctx) {
    return handleWebRequest(request, env, ctx);
  }
};
