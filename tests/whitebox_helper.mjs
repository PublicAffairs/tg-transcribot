/**
 * tests/whitebox_helper.mjs
 * Shared test helpers and Telegram API mocks for Whitebox tests.
 */

import crypto from 'node:crypto';

export const MOCK_TOKEN = '111222333:AABBccDDeeffGGHHiijjKK';
export const MOCK_SECRET = crypto.createHash('sha256').update(MOCK_TOKEN).digest('hex');

export const MOCK_CONFIG = {
  telegramBotToken: MOCK_TOKEN,
  whisperApiKey: 'mock_whisper_key',
  whisperApiBase: 'https://api.groq.com/openai/v1',
  ownerChatId: '99999',
};
export const MOCK_CTX = {};

export const recordedCalls = [];
const originalFetch = globalThis.fetch;

export function clearHistory() {
  recordedCalls.length = 0;
}

/** 
 * Validates that the payload follows Telegram MarkdownV2 rules loosely, 
 * simulating the Bad Request errors for unescaped reserved characters.
 */
export function validateMarkdownV2(text) {
  if (typeof text !== 'string') return;
  
  let stripped = text.replace(/```[\s\S]*?```/g, '');
  stripped = stripped.replace(/`[^`]*`/g, '');
  stripped = stripped.replace(/\[.*?\]\([^)]*\)/g, '');
  stripped = stripped.replace(/\|\|/g, '');
  
  const match = stripped.match(/(?<!\\)[.!+={}#|-]/);
  if (match) {
    console.error('--- MARKDOWN VALIDATION FAILED ---');
    console.error('Text:', text);
    console.error('Stripped:', stripped);
    console.error('Match:', match[0], 'at', match.index);
    throw new Error(`[Mock Telegram API] Bad Request: can't parse entities: Character '${match[0]}' is reserved and must be escaped with the preceding '\\'`);
  }
}

export function mkJson(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}

export function makeReq(body, query = {}) {
  return {
    headers: { 'x-telegram-bot-api-secret-token': MOCK_SECRET },
    body,
    query,
  };
}

/** Replace global fetch with a spy that records every call and returns safe defaults. */
export function installMockFetch(overrides = {}) {
  recordedCalls.length = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const urlStr = url.toString();
    const bodyStr = opts.body && typeof opts.body === 'string' ? opts.body : '[FormData/Blob]';
    const rec = { url: urlStr, opts };
    try { rec.json = JSON.parse(bodyStr); } catch { /* ignore */ }
    recordedCalls.push(rec);

    if (rec.json?.parse_mode === 'MarkdownV2') {
      if (rec.json.text) validateMarkdownV2(rec.json.text);
      if (rec.json.caption) validateMarkdownV2(rec.json.caption);
    }

    for (const [pattern, handler] of Object.entries(overrides)) {
      if (urlStr.includes(pattern)) return handler(urlStr, opts);
    }

    // Safe defaults
    if (urlStr.includes('/getWebhookInfo')) {
      return mkJson({ ok: true, result: { url: `https://example.com/api/webhook?owner=99999`, allowed_updates: ['message'] } });
    }
    if (urlStr.includes('/getFile')) {
      let ext = 'ogg';
      let size = 1000;
      if (rec.json?.file_id) {
        const parts = rec.json.file_id.split('_');
        if (parts.includes('al')) ext = 'al';
        else if (parts.includes('raw')) ext = 'raw';
        else if (parts.includes('mov')) ext = 'mov';
        if (parts.includes('large')) size = 6 * 1024 * 1024;
      }
      return mkJson({ ok: true, result: { file_path: `voice/file.${ext}`, file_size: size } });
    }
    if (urlStr.includes('/voice/file.ogg') || urlStr.includes('/file/bot') || urlStr.includes('/voice/file.al') || urlStr.includes('/voice/file.raw')) {
      const dummyOgg = new Uint8Array([0x4F, 0x67, 0x67, 0x53, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => dummyOgg.buffer,
        body: {
          getReader() {
            let readCount = 0;
            return {
              async read() {
                if (readCount === 0) {
                  readCount++;
                  return { value: dummyOgg, done: false };
                }
                return { value: null, done: true };
              },
              async cancel() {}
            };
          }
        }
      };
    }
    if (urlStr.includes('/audio/transcriptions')) {
      return mkJson({ text: 'hello transcription' });
    }
    if (urlStr.includes('/getMe')) {
      return mkJson({ ok: true, result: { id: 777, username: 'mybot', first_name: 'MyBot' } });
    }
    return mkJson({ ok: true, result: {} });
  };
}

export function restoreFetch() {
  globalThis.fetch = originalFetch;
}

export function hasSentMessage(chatId, pattern) {
  return recordedCalls.some(c =>
    c.url.includes('/sendMessage') &&
    String(c.json?.chat_id) === String(chatId) &&
    (pattern instanceof RegExp ? pattern.test(c.json?.text) : String(c.json?.text).includes(pattern))
  );
}

export function assertMessageSent(chatId, pattern) {
  const sent = recordedCalls.find(call =>
    call.url.includes('/sendMessage') &&
    String(call.json?.chat_id) === String(chatId) &&
    (pattern instanceof RegExp ? pattern.test(call.json?.text) : String(call.json?.text).includes(pattern))
  );
  if (!sent) {
    throw new Error(`Expected message to chat ${chatId} containing "${pattern}" was NOT sent. Recorded calls: ${JSON.stringify(recordedCalls, null, 2)}`);
  }
}

export function assertNoMessageSent() {
  const sent = recordedCalls.find(call => call.url.includes('/sendMessage'));
  if (sent) {
    throw new Error(`Expected NO messages to be sent, but found a sendMessage call: ${JSON.stringify(sent, null, 2)}`);
  }
}
