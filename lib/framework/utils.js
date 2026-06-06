// lib/framework/utils.js
// Generic Telegram Bot API and HTTP utilities

const TELEGRAM_API_TIMEOUT = 10000;
export let _debugOwnerId = null;

export function setDebugOwnerId(id) {
  _debugOwnerId = id;
}

export function isOwner(userId, ownerId) {
  if (_debugOwnerId !== null) {
    return String(userId) === String(_debugOwnerId);
  }
  return String(userId) === String(ownerId);
}

/**
 * Helper to compute SHA-256 hash.
 */
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper to fetch a header case-insensitively.
 */
export function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

/**
 * Fetch helper to call Telegram Bot API with 429 auto-retry.
 */
export async function callTelegram(token, method, payload, retries = 2) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  let finalPayload = payload;
  if (method === 'sendMessage' || method === 'editMessageText') {
    finalPayload = {
      disable_web_page_preview: true,
      ...payload
    };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload),
      signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT)
    });
    const data = await res.json();
    
    if (!data.ok && data.error_code === 429 && retries > 0) {
      const retryAfter = (data.parameters?.retry_after || 1) * 1000;
      if (retryAfter <= 5000) {
        console.warn(`[429 Too Many Requests] Retrying ${method} after ${retryAfter}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        return await callTelegram(token, method, payload, retries - 1);
      } else {
        console.warn(`[429 Too Many Requests] retry_after ${retryAfter}ms is too long. Skipping retry for ${method}.`);
        if (_debugOwnerId) {
          const { escapeMarkdownV2, escapeMarkdownV2Code } = await import('./markdown.js');
          const escapedTitle = escapeMarkdownV2('Rate Limit (429) Skipped');
          const escapedMethod = escapeMarkdownV2Code(method);
          const timeoutSec = Math.round(retryAfter / 1000);
          
          callTelegram(token, 'sendMessage', {
            chat_id: _debugOwnerId,
            text: `⚠️ *${escapedTitle}*\nMethod: \`${escapedMethod}\`\nTimeout: ${timeoutSec}s`,
            parse_mode: 'MarkdownV2'
          }, 0).catch(() => {});
        }
      }
    }
    return data;
  } catch (err) {
    if (retries > 0) {
      console.warn(`[Telegram API Error] Retrying ${method} due to network error: ${err.message}`);
      return await callTelegram(token, method, payload, retries - 1);
    }
    console.error(`[Telegram API Error] ${method} failed:`, err);
    return { ok: false, error: err.message };
  }
}
