// src/deno.js
// Deno Deploy & Val Town Unified Adapter for Telegram Voice Transcribot

import { handleWebRequest } from '../lib/framework/adapters.js';

let botVersion = '0.0.0';
try {
  // Try to load package.json dynamically.
  // Using a dynamic import with import attributes allows Deno to fetch it if available,
  // without triggering a static compilation failure on platforms where it's missing (like single Val files).
  const pkg = await import('../package.json', { with: { type: 'json' } });
  botVersion = pkg.default?.version || botVersion;
} catch {
  // Fail silently and use fallback
}

// 1. Val Town expects a default function export (e.g. export default handler).
// 2. Deno Deploy (deno serve) expects a default object export containing a `fetch` method.
// We satisfy both by defining a function and attaching a `fetch` method to it.
function handler(request, env, ctx) {
  return handleWebRequest(request, { ...env, BOT_VERSION: botVersion }, ctx);
}

handler.fetch = function(request, env, ctx) {
  return handleWebRequest(request, { ...env, BOT_VERSION: botVersion }, ctx);
};

export default handler;
