// src/deno.js
// Deno Deploy & Val Town Unified Adapter for Telegram Voice Transcribot

import { handleWebRequest } from '../lib/core.js';

// 1. Val Town expects a default function export (e.g. export default handler).
// 2. Deno Deploy (deno serve) expects a default object export containing a `fetch` method.
// We satisfy both by defining a function and attaching a `fetch` method to it.
function handler(request, env, ctx) {
  return handleWebRequest(request, env, ctx);
}

handler.fetch = function(request, env, ctx) {
  return handleWebRequest(request, env, ctx);
};

export default handler;
