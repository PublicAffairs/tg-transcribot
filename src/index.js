// src/index.js
// Cloudflare Workers Default Entry Point for Telegram Voice Transcribot

import { handleWebRequest } from '../lib/framework/adapters.js';
import pkg from '../package.json';

export default {
  async fetch(request, env, ctx) {
    return handleWebRequest(request, { ...env, BOT_VERSION: pkg.version }, ctx);
  }
};
