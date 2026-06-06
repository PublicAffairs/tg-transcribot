/**
 * ci_test_scenarios.mjs
 * Category: Quality Assurance / Scenario Verification Test
 * 
 * Simulates various update scenarios (private chat voice messages, guest messages, group connection
 * settings, and secretary mode generic documents) to verify that the bot responds correctly or
 * stays silent as required. Mocks the global fetch API to assert outbound requests and payloads.
 * 
 * Usage:
 *   node scripts/ci_test_scenarios.mjs
 */

import { handleWebhook, handleSetup } from '../lib/core.js';
import { handleDashboard } from '../lib/dashboard.js';
import assert from 'node:assert';
import crypto from 'node:crypto';

// ----------------------------------------------------
// Mock Environment & Configuration
// ----------------------------------------------------
const MOCK_TOKEN = '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ';
const MOCK_CONFIG = {
  telegramBotToken: MOCK_TOKEN,
  whisperApiKey: 'mock_whisper_key',
  whisperApiBase: 'https://api.groq.com/openai/v1',
  ownerChatId: '12345'
};

const mockSecretToken = crypto.createHash('sha256').update(MOCK_TOKEN).digest('hex');

const MOCK_CTX = {
  waitUntil: (promise) => promise // Execute synchronously in tests
};

// ----------------------------------------------------
// Request Helper
// ----------------------------------------------------
function createReq(body, query = {}) {
  return {
    headers: { 'x-telegram-bot-api-secret-token': mockSecretToken },
    body,
    query
  };
}

// ----------------------------------------------------
// Fetch API Mocking
// ----------------------------------------------------
let recordedCalls = [];

// Save original fetch
const originalFetch = globalThis.fetch;

// Redefine global fetch
globalThis.fetch = async (url, options = {}) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  const body = options.body ? (typeof options.body === 'string' ? options.body : '[FormData/Blob]') : null;
  
  const callRecord = {
    url: urlStr,
    method: options.method || 'GET',
    headers: options.headers || {},
    body
  };
  
  if (options.body && typeof options.body.get === 'function') {
    callRecord.formData = {
      model: options.body.get('model'),
      language: options.body.get('language'),
      prompt: options.body.get('prompt')
    };
  }
  
  // Try to parse JSON body if possible
  if (body && body !== '[FormData/Blob]') {
    try {
      callRecord.json = JSON.parse(body);
    } catch { /* ignore */ }
  }
  
  recordedCalls.push(callRecord);

  // Return mocked responses based on URL match
  if (urlStr.includes('/getWebhookInfo')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          url: 'https://example.com/api/webhook?owner=12345',
          allowed_updates: ['message', 'business_message', 'guest_message', 'my_chat_member']
        }
      })
    };
  }
  if (urlStr.includes('/getFile')) {
    let filePath = 'voice/mock_file.ogg';
    if (body) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.file_id === 'flac_file_id') {
          filePath = 'documents/music.flac';
        } else if (parsed.file_id === 'mov_file_id') {
          filePath = 'documents/video.mov';
        } else if (parsed.file_id === 'mp4_file_id') {
          filePath = 'videos/video.mp4';
        }
      } catch { /* ignore */ }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { file_path: filePath } })
    };
  }
  if (urlStr.includes('/file/bot') || urlStr.includes('/voice/mock_file.ogg')) {
    // Return dummy empty file buffer
    const dummyOgg = new Uint8Array([79, 103, 103, 83, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]); // "OggS" header
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => dummyOgg.buffer
    };
  }
  if (urlStr.includes('/audio/transcriptions')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ text: 'This is a mock voice transcription.' }),
      text: async () => JSON.stringify({ text: 'This is a mock voice transcription.' })
    };
  }
  if (urlStr.includes('/getMe')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: 999999, first_name: 'Transcribot', username: 'tg_transcribot' } })
    };
  }

  // Fallback default response
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: {} })
  };
};

function clearHistory() {
  recordedCalls = [];
}

// Helper to check if a Telegram message was sent with specific text contains
function assertMessageSent(chatId, pattern) {
  const sent = recordedCalls.find(call => {
    if (call.url.includes('/sendMessage')) {
      return String(call.json?.chat_id) === String(chatId) &&
        (pattern instanceof RegExp ? pattern.test(call.json?.text) : call.json?.text.includes(pattern));
    }
    if (call.url.includes('/sendRichMessage')) {
      const text = call.json?.rich_message?.markdown || call.json?.rich_message?.html || '';
      return String(call.json?.chat_id) === String(chatId) &&
        (pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern));
    }
    return false;
  });
  if (!sent) {
    throw new Error(`Expected message to chat ${chatId} containing "${pattern}" was NOT sent. Recorded calls: ${JSON.stringify(recordedCalls, null, 2)}`);
  }
}

function assertNoMessageSent() {
  const sent = recordedCalls.find(call => call.url.includes('/sendMessage'));
  if (sent) {
    throw new Error(`Expected NO messages to be sent, but found a sendMessage call: ${JSON.stringify(sent, null, 2)}`);
  }
}

// ----------------------------------------------------
// Test Runner
// ----------------------------------------------------
async function runTests() {
  console.log('🏁 Starting Webhook Scenario-based Testing...');

  try {
    // ----------------------------------------------------
    // Scenario 1: Private Chat Voice Message (Should Transcribe)
    // ----------------------------------------------------
    console.log('\nTest 1: Private chat voice message transcribes and replies');
    clearHistory();
    const update1 = {
      update_id: 1001,
      message: {
        message_id: 201,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Tester' },
        voice: { file_id: 'voice_file_123', file_size: 1000, duration: 5 }
      }
    };
    
    const req1 = createReq(update1, { owner: '12345' });

    const res1 = await handleWebhook(req1, MOCK_CONFIG, MOCK_CTX);
    assert.strictEqual(res1.status, 200, 'Webhook response should be 200 OK');
    
    // Allow wait async waitUntil task to finish
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', 'mock voice transcription');
    console.log('✅ Test 1 Passed');

    // ----------------------------------------------------
    // Scenario 2: Private Chat Unsupported Document (Should Warn)
    // ----------------------------------------------------
    console.log('\nTest 2: Private chat zip document replies with Unsupported Format warning');
    clearHistory();
    const update2 = {
      update_id: 1002,
      message: {
        message_id: 202,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        document: { file_id: 'doc_file_123', mime_type: 'application/zip', file_name: 'archive.zip', file_size: 5000 }
      }
    };

    const req2 = createReq(update2, { owner: '12345' });

    await handleWebhook(req2, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', 'Unsupported file format');
    console.log('✅ Test 2 Passed');

    // ----------------------------------------------------
    // Scenario 3: Secretary Mode Voice Message (Should Transcribe)
    // ----------------------------------------------------
    console.log('\nTest 3: Secretary/Business voice message transcribes and replies');
    clearHistory();
    const update3 = {
      update_id: 1003,
      business_message: {
        message_id: 203,
        chat: { id: 98765, type: 'private' }, // Friend's chat ID
        from: { id: 98765, first_name: 'Friend' },
        business_connection_id: 'conn_123',
        voice: { file_id: 'voice_file_987', file_size: 1000, duration: 4 }
      }
    };

    const req3 = createReq(update3, { owner: '12345', secretary: 'on' });

    await handleWebhook(req3, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('98765', 'mock voice transcription');
    console.log('✅ Test 3 Passed');

    // ----------------------------------------------------
    // Scenario 4: Secretary Mode Unsupported Document (Should Ignore Completely)
    // ----------------------------------------------------
    console.log('\nTest 4: Secretary/Business PDF document is ignored completely (no replies)');
    clearHistory();
    const update4 = {
      update_id: 1004,
      business_message: {
        message_id: 204,
        chat: { id: 98765, type: 'private' },
        from: { id: 98765 },
        business_connection_id: 'conn_123',
        document: { file_id: 'pdf_file_987', mime_type: 'application/pdf', file_name: 'document.pdf', file_size: 20000 }
      }
    };

    const req4 = createReq(update4, { owner: '12345', secretary: 'on' });

    const res4 = await handleWebhook(req4, MOCK_CONFIG, MOCK_CTX);
    assert.strictEqual(res4.status, 200, 'Webhook response should be 200 OK');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Assert NO sendMessage calls were recorded
    assertNoMessageSent();
    console.log('✅ Test 4 Passed');

    // ----------------------------------------------------
    // Scenario 5: Group Chat Message without Mention (Should Ignore)
    // ----------------------------------------------------
    console.log('\nTest 5: Group chat text message without bot mention is ignored');
    clearHistory();
    const update5 = {
      update_id: 1005,
      message: {
        message_id: 205,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555 },
        text: 'Hello group'
      }
    };

    const req5 = createReq(update5, { owner: '12345', groups: 'on' });

    await handleWebhook(req5, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertNoMessageSent();
    console.log('✅ Test 5 Passed');

    // ----------------------------------------------------
    // Scenario 6: Group Chat Message with Mention (Should Transcribe)
    // ----------------------------------------------------
    console.log('\nTest 6: Group chat voice message with bot mention gets transcribed');
    clearHistory();
    const update6 = {
      update_id: 1006,
      message: {
        message_id: 206,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555 },
        voice: { file_id: 'voice_file_555', file_size: 1000, duration: 3 },
        entities: [{ type: 'mention', offset: 0, length: 14 }],
        text: '@tg_transcribot' // contains mention
      }
    };

    const req6 = createReq(update6, { owner: '12345', groups: 'on' });

    await handleWebhook(req6, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('-55555', 'mock voice transcription');
    console.log('✅ Test 6 Passed');

    // ----------------------------------------------------
    // Scenario 7: Critical Webhook Handler Exception
    // ----------------------------------------------------
    console.log('\nTest 7: Critical exception in webhook loop is caught and reported');
    clearHistory();
    // Deliberately malformed update to cause a TypeError (missing chat object)
    const update7 = {
      update_id: 1007,
      message: {
        message_id: 207,
        from: { id: 12345 }
        // chat is missing
      }
    };
    const req7 = createReq(update7, { owner: '12345' });
    const res7 = await handleWebhook(req7, MOCK_CONFIG, MOCK_CTX);
    assert.strictEqual(res7.status, 200, 'Webhook response must be 200 OK even on critical internal errors');
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /Critical Bot Error|Cannot read properties/i);
    console.log('✅ Test 7 Passed');

    // ----------------------------------------------------
    // Scenario 8: /webhook <url> command pre-flight check
    // ----------------------------------------------------
    console.log('\nTest 8: /webhook command performs health check and updates webhook');
    clearHistory();
    
    // Override fetch temporarily for healthcheck
    const currentFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr === 'https://new-bot.vercel.app/api/health') {
        return { ok: true, status: 200, text: async () => 'OK' };
      }
      return currentFetch(url, options);
    };

    const update8 = {
      update_id: 1008,
      message: {
        message_id: 208,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        text: '/webhook https://new-bot.vercel.app',
        entities: [{ type: 'bot_command', offset: 0, length: 8 }]
      }
    };
    const req8 = createReq(update8, { owner: '12345', langbot: 'en' });
    await handleWebhook(req8, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Restore fetch inside test context
    globalThis.fetch = currentFetch;

    // Check if setWebhook was called with the new domain and inherited params
    const setWebhookCall = recordedCalls.find(c => c.url.includes('/setWebhook'));
    assert.ok(setWebhookCall, 'setWebhook should have been called');
    const newUrlParams = new URL(setWebhookCall.json.url).searchParams;
    assert.strictEqual(new URL(setWebhookCall.json.url).origin, 'https://new-bot.vercel.app', 'New webhook must point to the new domain');
    assert.strictEqual(newUrlParams.get('owner'), '12345', 'Owner param must be preserved');
    
    // Check reply to owner
    assertMessageSent('12345', /updated successfully/i);
    console.log('✅ Test 8 Passed');

    // ----------------------------------------------------
    // Scenario 9: Dynamic Owner Registration (Fresh Deployment)
    // ----------------------------------------------------
    console.log('\nTest 9: Private message triggers dynamic owner registration when owner is missing');
    clearHistory();
    const update9 = {
      update_id: 1009,
      message: {
        message_id: 209,
        chat: { id: 77777, type: 'private' },
        from: { id: 77777, language_code: 'en' },
        text: 'Hello bot'
      }
    };
    // No owner in query
    const req9 = createReq(update9, {}); 
    await handleWebhook(req9, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('77777', /Welcome/i);
    console.log('✅ Test 9 Passed');

    // ----------------------------------------------------
    // Scenario 9b: Allowed Owner Validation on Dynamic Owner Registration
    // ----------------------------------------------------
    console.log('\nTest 9b: Private message dynamic owner registration constraints (allowedOwner)');
    clearHistory();
    const configWithAllowedId = { ...MOCK_CONFIG, allowedOwner: '99999' };

    // Part 1: Unauthorized user sends a message -> should be ignored
    const update9b_unauth = {
      update_id: 9991,
      message: {
        message_id: 219,
        chat: { id: 77777, type: 'private' },
        from: { id: 77777, username: 'some_user', language_code: 'en' },
        text: 'Hello bot'
      }
    };
    await handleWebhook(createReq(update9b_unauth, {}), configWithAllowedId, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(recordedCalls.length, 0, 'Should not send welcome message to unauthorized ID');

    // Part 2: Authorized user sends a message -> should register
    const update9b_auth = {
      update_id: 9992,
      message: {
        message_id: 220,
        chat: { id: 99999, type: 'private' },
        from: { id: 99999, username: 'allowed_user', language_code: 'en' },
        text: 'Hello bot'
      }
    };
    await handleWebhook(createReq(update9b_auth, {}), configWithAllowedId, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('99999', /Welcome/i);
    clearHistory();

    // Part 3: Configure allowedOwner by username
    const configWithAllowedUser = { ...MOCK_CONFIG, allowedOwner: '@john_doe' };
    const update9b_unauth_username = {
      update_id: 9993,
      message: {
        message_id: 221,
        chat: { id: 77777, type: 'private' },
        from: { id: 77777, username: 'bob', language_code: 'en' },
        text: 'Hello bot'
      }
    };
    await handleWebhook(createReq(update9b_unauth_username, {}), configWithAllowedUser, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(recordedCalls.length, 0, 'Should not register user with unauthorized username');

    // Part 4: Authorized user by username sends a message -> should register
    const update9b_auth_username = {
      update_id: 9994,
      message: {
        message_id: 222,
        chat: { id: 88888, type: 'private' },
        from: { id: 88888, username: 'john_doe', language_code: 'en' },
        text: 'Hello bot'
      }
    };
    await handleWebhook(createReq(update9b_auth_username, {}), configWithAllowedUser, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('88888', /Welcome/i);
    console.log('✅ Test 9b Passed');

    // ----------------------------------------------------
    // Scenario 10: Dashboard Pre-flight URL Validation
    // ----------------------------------------------------
    console.log('\nTest 10: Dashboard blocks registration for invalid protocols, localhost, or unsupported ports');
    clearHistory();
    // Simulate invalid localhost HTTP request
    const req10 = {
      headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' }
    };
    const res10 = await handleDashboard(req10, MOCK_CONFIG);
    assert.ok(res10.body.includes('Telegram requires secure HTTPS.'), 'Must block HTTP');
    
    // Simulate localhost HTTPS request
    const req10b = {
      headers: { host: '127.0.0.1:443', 'x-forwarded-proto': 'https' }
    };
    const res10b = await handleDashboard(req10b, MOCK_CONFIG);
    assert.ok(res10b.body.includes('Localhost address is not reachable.'), 'Must block localhost');
    
    // Simulate valid HTTPS but unsupported port (Telegram only supports 80, 88, 443, 8443)
    const req10c = {
      headers: { host: 'mybot.example.com:8080', 'x-forwarded-proto': 'https' }
    };
    const res10c = await handleDashboard(req10c, MOCK_CONFIG);
    assert.ok(res10c.body.includes('Port 8080 is not supported.'), 'Must block unsupported port');
    
    console.log('✅ Test 10 Passed');

    // ----------------------------------------------------
    // Scenario 11: Reset Owner via handleSetup
    // ----------------------------------------------------
    console.log('\nTest 11: handleSetup clears owner ID via reset_owner action');
    clearHistory();
    const req11 = {
      headers: { host: 'mybot.example.com', 'x-forwarded-proto': 'https' },
      query: { action: 'reset_owner', token: MOCK_TOKEN }
    };
    const res11 = await handleSetup(req11, MOCK_CONFIG);
    assert.strictEqual(res11.status, 200);
    const setWebhookCall11 = recordedCalls.find(c => c.url.includes('/setWebhook'));
    assert.ok(setWebhookCall11, 'setWebhook should be called to clear owner');
    const params11 = new URL(setWebhookCall11.json.url).searchParams;
    assert.ok(!params11.get('owner'), 'Owner parameter must be cleared/omitted');
    console.log('✅ Test 11 Passed');

    // ----------------------------------------------------
    // Scenario 12: Transcription Error triggers notify_err
    // ----------------------------------------------------
    console.log('\nTest 12: Transcription API error sends alert to owner and user');
    clearHistory();
    const currentFetch12 = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/audio/transcriptions')) {
        return { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => 'API is down' };
      }
      return currentFetch12(url, options);
    };

    const update12 = {
      update_id: 1012,
      message: {
        message_id: 212,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_err', file_size: 1000, duration: 5 }
      }
    };
    // User is 12345, owner is 99999
    const req12 = createReq(update12, { owner: '99999', notify_err: 'on' }); 
    await handleWebhook(req12, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    globalThis.fetch = currentFetch12;
    
    // Check reply to user
    assertMessageSent('12345', /API is down/i);
    // Check alert to owner
    assertMessageSent('99999', /Transcription Error/i);
    console.log('✅ Test 12 Passed');

    // ----------------------------------------------------
    // Scenario 13: Group Add triggers notify_add
    // ----------------------------------------------------
    console.log('\nTest 13: Bot added to group triggers notify_add alert to owner');
    clearHistory();
    const update13 = {
      update_id: 1013,
      my_chat_member: {
        chat: { id: -777, title: 'New Group', type: 'group' },
        from: { id: 12345, first_name: 'Tester' },
        new_chat_member: { status: 'member', user: { id: 999999, is_bot: true, username: 'tg_transcribot' } }
      }
    };
    const req13 = createReq(update13, { owner: '99999', notify_add: 'on' });
    await handleWebhook(req13, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('99999', /Added to group.*New Group/i);
    console.log('✅ Test 13 Passed');

    // ----------------------------------------------------
    // Scenario 14: Business Connection triggers notify_conn
    // ----------------------------------------------------
    console.log('\nTest 14: Secretary mode connection triggers notify_conn alert to owner');
    clearHistory();
    const currentFetch14 = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=99999&notify_conn=on', allowed_updates: ['business_connection', 'business_message'] }
          })
        };
      }
      return currentFetch14(url, options);
    };

    const update14 = {
      update_id: 1014,
      business_connection: {
        id: 'conn_123',
        user: { id: 55555, first_name: 'BusinessUser' },
        can_reply: true,
        is_enabled: true
      }
    };
    const req14 = createReq(update14, { owner: '99999', notify_conn: 'on' });
    await handleWebhook(req14, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    globalThis.fetch = currentFetch14;
    assertMessageSent('99999', /Bot is connected as a secretary/i);
    console.log('✅ Test 14 Passed');

    // ----------------------------------------------------
    // Scenario 15: Callback Query from Non-Owner (Should Reject)
    // ----------------------------------------------------
    console.log('\nTest 15: Callback query from non-owner is rejected');
    clearHistory();
    const update15 = {
      update_id: 1015,
      callback_query: {
        id: 'query_15',
        from: { id: 99999, first_name: 'Imposter' }, // Not owner 12345
        message: {
          chat: { id: 12345, type: 'private' },
          message_id: 501,
          text: 'Settings'
        },
        data: 'mode:toggle:groups'
      }
    };
    const req15 = createReq(update15, { owner: '12345' });
    await handleWebhook(req15, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Assert answerCallbackQuery was called with unauthorized alert
    const ansCall = recordedCalls.find(c => c.url.includes('/answerCallbackQuery'));
    assert.ok(ansCall, 'answerCallbackQuery should be called');
    assert.strictEqual(ansCall.json?.callback_query_id, 'query_15');
    assert.ok(ansCall.json?.text.includes('Unauthorized') || ansCall.json?.text.includes('Отказано'), 'Should return unauthorized text');
    assert.strictEqual(ansCall.json?.show_alert, true);
    console.log('✅ Test 15 Passed');

    // ----------------------------------------------------
    // Scenario 16: Callback Query from Owner Toggles Setting
    // ----------------------------------------------------
    console.log('\nTest 16: Callback query from owner toggles groups setting');
    clearHistory();
    
    // Setup fetch mock for getWebhookInfo & setWebhook & answerCallbackQuery
    const currentFetch16 = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=12345&groups=on', allowed_updates: ['message'] }
          })
        };
      }
      return currentFetch16(url, options);
    };

    const update16 = {
      update_id: 1016,
      callback_query: {
        id: 'query_16',
        from: { id: 12345, first_name: 'Owner' }, // Matches owner 12345
        message: {
          chat: { id: 12345, type: 'private' },
          message_id: 502,
          text: 'Settings'
        },
        data: 'mode:toggle:groups'
      }
    };
    
    const req16 = createReq(update16, { owner: '12345' });
    await handleWebhook(req16, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    globalThis.fetch = currentFetch16;

    // 1. Verify setWebhook was called with groups=off
    const setWebhookCall16 = recordedCalls.find(c => c.url.includes('/setWebhook'));
    assert.ok(setWebhookCall16, 'setWebhook should be called to update settings');
    const params16 = new URL(setWebhookCall16.json.url).searchParams;
    assert.strictEqual(params16.get('groups'), 'off', 'Groups setting must be toggled to off');

    // 2. Verify editMessageText was called to refresh layout
    const editMsgCall16 = recordedCalls.find(c => c.url.includes('/editMessageText'));
    assert.ok(editMsgCall16, 'editMessageText should be called');
    assert.strictEqual(String(editMsgCall16.json?.message_id), '502');

    // 3. Verify answerCallbackQuery was called
    const ansCall16 = recordedCalls.find(c => c.url.includes('/answerCallbackQuery'));
    assert.ok(ansCall16, 'answerCallbackQuery should be called to dismiss loader');
    assert.strictEqual(ansCall16.json?.callback_query_id, 'query_16');
    console.log('✅ Test 16 Passed');

    // ----------------------------------------------------
    // Scenario 17: Non-Owner Configuration Command (Should Ignore)
    // ----------------------------------------------------
    console.log('\nTest 17: Configuration command from non-owner is ignored');
    clearHistory();
    const update17 = {
      update_id: 1017,
      message: {
        message_id: 217,
        chat: { id: 12345, type: 'private' },
        from: { id: 99999 }, // Imposter
        text: '/mode',
        entities: [{ type: 'bot_command', offset: 0, length: 5 }]
      }
    };
    const req17 = createReq(update17, { owner: '12345' });
    await handleWebhook(req17, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Assert NO sendMessage calls were recorded
    assertNoMessageSent();
    console.log('✅ Test 17 Passed');

    // ----------------------------------------------------
    // Scenario 18: /settings command displays all current settings to owner
    // ----------------------------------------------------
    console.log('\nTest 18: /settings command displays all current settings to owner');
    clearHistory();
    const update18 = {
      update_id: 1018,
      message: {
        message_id: 218,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        text: '/settings',
        entities: [{ type: 'bot_command', offset: 0, length: 9 }]
      }
    };
    const req18 = createReq(update18, { owner: '12345' });
    await handleWebhook(req18, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify settings message was sent and contains keys and status
    assertMessageSent('12345', /Owner Settings/i);
    assertMessageSent('12345', /Language/i);
    assertMessageSent('12345', /Technical/i);
    assertMessageSent('12345', /Webhook/i);
    assertMessageSent('12345', /Prompt/i);
    console.log('✅ Test 18 Passed');

    // ----------------------------------------------------
    // Scenario 19: /prompt as caption to a voice message — overrides prompt (Case 2: file in same msg)
    // ----------------------------------------------------
    console.log('\nTest 19: /prompt as caption to voice message overrides prompt and transcribes');
    clearHistory();
    const update19 = {
      update_id: 1019,
      message: {
        message_id: 219,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_19', file_size: 1000, duration: 5 },
        caption: '/prompt my custom prompt'
      }
    };
    const req19 = createReq(update19, { owner: '12345' });
    await handleWebhook(req19, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall19 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall19, 'Should have called Groq transcriptions API');
    assert.strictEqual(transcriptionCall19.formData?.prompt, 'my custom prompt', 'Should pass caption prompt override');
    // Case 2: reply cites the same message (219) that contains the file
    const replyCall19 = recordedCalls.find(c => c.url.includes('/sendMessage') && c.json?.reply_to_message_id);
    assert.ok(replyCall19, 'Should have called sendMessage with reply_to_message_id');
    assert.strictEqual(replyCall19.json.reply_to_message_id, 219, 'Bot must cite the voice message itself (case 2)');
    console.log('✅ Test 19 Passed');

    // ----------------------------------------------------
    // Scenario 20: /prompt command (without text) as a reply to a voice message overrides default prompt with empty string
    // ----------------------------------------------------
    console.log('\nTest 20: /prompt command (without text) as a reply to a voice message overrides default prompt with empty string');
    clearHistory();
    const update20 = {
      update_id: 1020,
      message: {
        message_id: 220,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        text: '/prompt',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
        reply_to_message: {
          message_id: 201,
          from: { id: 55555 },
          voice: { file_id: 'voice_file_20', file_size: 1000, duration: 5 }
        }
      }
    };
    const req20 = createReq(update20, { owner: '12345', prompt: 'default_val' });
    await handleWebhook(req20, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify message sent is a transcription
    assertMessageSent('12345', /transcription/i);

    // Verify transcription request had prompt = null or empty
    const transcriptionCall20 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall20, 'Should have called Groq transcriptions API');
    assert.ok(!transcriptionCall20.formData?.prompt, 'Should pass empty prompt override');
    console.log('✅ Test 20 Passed');

    // ----------------------------------------------------
    // Scenario 21: Non-owner uses /prompt as text reply to a voice message (Case 1)
    // Bot must cite the voice message (reply_to_message), not the /prompt command message
    // ----------------------------------------------------
    console.log('\nTest 21: Non-owner /prompt as reply to voice — cites voice message, not command message');
    clearHistory();
    const update21 = {
      update_id: 1021,
      message: {
        message_id: 221,
        chat: { id: 99999, type: 'private' },
        from: { id: 99999 },
        text: '/prompt guest override prompt',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
        reply_to_message: {
          message_id: 201,
          from: { id: 55555 },
          voice: { file_id: 'voice_file_21', file_size: 1000, duration: 5 }
        }
      }
    };
    const req21 = createReq(update21, { owner: '12345', guest: 'on' });
    await handleWebhook(req21, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('99999', /transcription/i);
    const transcriptionCall21 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall21, 'Should have called Groq transcriptions API');
    assert.strictEqual(transcriptionCall21.formData?.prompt, 'guest override prompt', 'Should pass guest override');
    // Case 1: bot must cite the VOICE message (201), not the /prompt command message (221)
    const replyCall21 = recordedCalls.find(c => c.url.includes('/sendMessage') && c.json?.reply_to_message_id);
    assert.ok(replyCall21, 'Should have called sendMessage with reply_to_message_id');
    assert.strictEqual(replyCall21.json.reply_to_message_id, 201, 'Bot must cite the voice message (case 1), not the command message');
    console.log('✅ Test 21 Passed');

    // ----------------------------------------------------
    // Scenario 22: /prompt with text but NO audio — must NOT change settings,
    // must respond with noAudio message and NOT call the transcription API
    // ----------------------------------------------------
    console.log('\nTest 22: /prompt text-only (no audio) responds with noAudio, does not change settings');
    clearHistory();
    const update22 = {
      update_id: 1022,
      message: {
        message_id: 222,
        chat: { id: 99999, type: 'private' },
        from: { id: 99999, language_code: 'en' },
        text: '/prompt this should not change the system prompt',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }]
      }
    };
    const req22 = createReq(update22, { owner: '12345', guest: 'on' });
    await handleWebhook(req22, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Must send a noAudio message (not a settings update)
    assertMessageSent('99999', /No audio/i);
    // Must NOT have called setWebhook (no settings change)
    assert.ok(!recordedCalls.find(c => c.url.includes('/setWebhook')), 'Should NOT call setWebhook');
    // Must NOT have called transcriptions API
    assert.ok(!recordedCalls.find(c => c.url.includes('/audio/transcriptions')), 'Should NOT call transcription API');
    console.log('✅ Test 22 Passed');

    // ----------------------------------------------------
    // Scenario 23: No WHISPER_PROMPT env → settings.prompt=undefined → no prompt field sent to API
    // ----------------------------------------------------
    console.log('\nTest 23: No WHISPER_PROMPT env + settings.prompt=undefined → Whisper called without prompt');
    clearHistory();
    const update23 = {
      update_id: 1023,
      message: {
        message_id: 223,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_23', file_size: 1000, duration: 5 }
      }
    };
    // config without whisperPrompt, settings without prompt (defaults to undefined)
    const configNoEnvPrompt = { ...MOCK_CONFIG, whisperPrompt: undefined };
    const req23 = createReq(update23, { owner: '12345' }); // no prompt= in query → settings.prompt === undefined
    await handleWebhook(req23, configNoEnvPrompt, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall23 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall23, 'Should have called transcription API');
    assert.ok(!transcriptionCall23.formData?.prompt, 'Should NOT send prompt field when no env and no setting');
    console.log('✅ Test 23 Passed');

    // ----------------------------------------------------
    // Scenario 24: WHISPER_PROMPT env set + settings.prompt=undefined → env prompt used as default
    // ----------------------------------------------------
    console.log('\nTest 24: WHISPER_PROMPT env set + settings.prompt=undefined → env prompt is sent to API');
    clearHistory();
    const update24 = {
      update_id: 1024,
      message: {
        message_id: 224,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_24', file_size: 1000, duration: 5 }
      }
    };
    const configWithEnvPrompt = { ...MOCK_CONFIG, whisperPrompt: 'Multilingual: Привет Hello' };
    const req24 = createReq(update24, { owner: '12345' }); // no prompt= in query → settings.prompt === undefined
    await handleWebhook(req24, configWithEnvPrompt, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall24 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall24, 'Should have called transcription API');
    assert.strictEqual(transcriptionCall24.formData?.prompt, 'Multilingual: Привет Hello', 'Should use WHISPER_PROMPT env as default');
    console.log('✅ Test 24 Passed');

    // ----------------------------------------------------
    // Scenario 25: Unsupported Video Container Rejection (Should Warn)
    // ----------------------------------------------------
    console.log('\nTest 25: Private chat unsupported video (MOV document) replies with Unsupported Video format warning');
    clearHistory();
    const update25 = {
      update_id: 1025,
      message: {
        message_id: 225,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        document: { file_id: 'mov_file_id', mime_type: 'video/quicktime', file_name: 'video.mov', file_size: 5000 }
      }
    };
    const req25 = createReq(update25, { owner: '12345' });
    await handleWebhook(req25, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /Unsupported video format/i);
    console.log('✅ Test 25 Passed');

    // ----------------------------------------------------
    // Scenario 26: Supported Video Container Processing (Should Transcribe)
    // ----------------------------------------------------
    console.log('\nTest 26: Private chat supported video (MP4 video) transcribes successfully');
    clearHistory();
    const update26 = {
      update_id: 1026,
      message: {
        message_id: 226,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        video: { file_id: 'mp4_file_id', mime_type: 'video/mp4', file_name: 'video.mp4', file_size: 5000 }
      }
    };
    const req26 = createReq(update26, { owner: '12345' });
    await handleWebhook(req26, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /transcription/i);
    
    // Verify it sent correct audio/mp4 MIME type to transcription API
    const transcriptionCall26 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall26, 'Should have called transcription API');
    console.log('✅ Test 26 Passed');

    // ----------------------------------------------------
    // Scenario 27: Native FLAC Support (Should Transcribe)
    // ----------------------------------------------------
    console.log('\nTest 27: Private chat FLAC document transcribes successfully');
    clearHistory();
    const update27 = {
      update_id: 1027,
      message: {
        message_id: 227,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        document: { file_id: 'flac_file_id', mime_type: 'audio/flac', file_name: 'song.flac', file_size: 5000 }
      }
    };
    const req27 = createReq(update27, { owner: '12345' });
    await handleWebhook(req27, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /transcription/i);
    console.log('✅ Test 27 Passed');

    // ----------------------------------------------------
    // Scenario 28: Forwarded message with /prompt in caption \u2014 caption must be IGNORED (Case 3)
    // The audio still transcribes, but the forwarded caption must not be used as a command
    // ----------------------------------------------------
    console.log('\nTest 28: Forwarded voice with /prompt caption \u2014 caption ignored (Case 3: forwarded)');
    clearHistory();
    const update28 = {
      update_id: 1028,
      message: {
        message_id: 228,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        forward_from: { id: 55555, first_name: 'Someone' },
        voice: { file_id: 'voice_file_28', file_size: 1000, duration: 5 },
        caption: '/prompt forwarded caption prompt'
      }
    };
    const req28 = createReq(update28, { owner: '12345' });
    await handleWebhook(req28, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Voice still transcribes
    assertMessageSent('12345', /transcription/i);
    const transcriptionCall28 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall28, 'Should have called transcription API');
    // Forwarded caption must NOT override the prompt
    assert.ok(
      transcriptionCall28.formData?.prompt !== 'forwarded caption prompt',
      'Forwarded message caption must NOT be used as /prompt command (Case 3)'
    );
    console.log('✅ Test 28 Passed');



    // ----------------------------------------------------
    // Scenario 29: Multiline prompt saved in webhook URL — must NOT be double-encoded,
    // newlines must survive the URLSearchParams round-trip and reach Whisper API intact
    // ----------------------------------------------------
    console.log('\nTest 29: Multiline saved prompt survives URLSearchParams round-trip without double-encoding');
    clearHistory();
    const multilinePromptSaved = 'term one\nterm two\nterm three';
    // Simulate how the webhook URL is built by buildWebhookSetup (URLSearchParams.set encodes once)
    const savedParams = new URLSearchParams();
    savedParams.set('owner', '12345');
    savedParams.set('prompt', multilinePromptSaved);
    const queryStr29 = savedParams.toString(); // prompt=term+one%0Aterm+two%0Aterm+three (single-encoded)

    const update29 = {
      update_id: 1029,
      message: {
        message_id: 229,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_29', file_size: 1000, duration: 5 }
      }
    };
    // Parse the query string the same way parseWebhookConfig does:
    // URLSearchParams.forEach already decodes values once — no decodeURIComponent needed
    const parsedForTest29 = Object.fromEntries(new URLSearchParams(queryStr29));
    assert.strictEqual(
      parsedForTest29.prompt,
      multilinePromptSaved,
      'URLSearchParams round-trip must not double-encode: decoded value must equal original'
    );

    const req29 = createReq(update29, Object.fromEntries(new URLSearchParams(queryStr29)));
    await handleWebhook(req29, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall29 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall29, 'Should have called transcription API');
    assert.strictEqual(
      transcriptionCall29.formData?.prompt,
      multilinePromptSaved,
      'Multiline saved prompt must arrive at Whisper with newlines intact (no %0A literals)'
    );
    console.log('✅ Test 29 Passed');

    // ----------------------------------------------------
    // Scenario 30: Multiline /prompt as a text reply to a voice message
    // — newlines in message.text must reach Whisper API intact
    // ----------------------------------------------------
    console.log('\nTest 30: Multiline /prompt as text reply to voice message preserves newlines to Whisper API');
    clearHistory();
    const multilineReplyPrompt = 'много\nстрочный\nпромпт';
    const update30 = {
      update_id: 1030,
      message: {
        message_id: 230,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        text: `/prompt ${multilineReplyPrompt}`,
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
        reply_to_message: {
          message_id: 201,
          from: { id: 55555 },
          voice: { file_id: 'voice_file_30', file_size: 1000, duration: 5 }
        }
      }
    };
    const req30 = createReq(update30, { owner: '12345' });
    await handleWebhook(req30, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall30 = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall30, 'Should have called transcription API');
    assert.strictEqual(
      transcriptionCall30.formData?.prompt,
      multilineReplyPrompt,
      'Multiline /prompt as reply must reach Whisper API with newlines intact'
    );
    console.log('✅ Test 30 Passed');

    // ----------------------------------------------------
    // Scenario 31: Systemic sendReply MarkdownV2 Formatting Failure (throws and notifies)
    // ----------------------------------------------------
    console.log('\nTest 31: Systemic sendReply MarkdownV2 Formatting Failure triggers owner notification');
    clearHistory();
    
    const originalFetchFor31 = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage') && options.body && options.body.includes('"chat_id":12345') && !options.body.includes('Critical Bot Error')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: false,
            error_code: 400,
            description: "Bad Request: can't parse entities: Character '(' is reserved and must be escaped with the preceding backslash"
          })
        };
      }
      return originalFetchFor31(url, options);
    };

    const update31 = {
      update_id: 1031,
      message: {
        message_id: 231,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_31', file_size: 1000, duration: 5 }
      }
    };

    const req31 = createReq(update31, { owner: '12345', notify_err: 'on' });
    await handleWebhook(req31, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Restore fetch
    globalThis.fetch = originalFetchFor31;

    // Verify that owner notification was sent with the critical error detail
    assertMessageSent('12345', /Critical Bot Error/i);
    assertMessageSent('12345', /Telegram delivery failed/i);
    console.log('✅ Test 31 Passed');

    // ----------------------------------------------------
    // Scenario 32: User-space sendReply Block Failure (silent)
    // ----------------------------------------------------
    console.log('\nTest 32: User-space sendReply Block Failure does not notify owner');
    clearHistory();

    const originalFetchFor32 = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage') && options.body && options.body.includes('"chat_id":12345') && !options.body.includes('Critical Bot Error')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: false,
            error_code: 403,
            description: "Forbidden: bot was blocked by the user"
          })
        };
      }
      return originalFetchFor32(url, options);
    };

    const update32 = {
      update_id: 1032,
      message: {
        message_id: 232,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_32', file_size: 1000, duration: 5 }
      }
    };

    const req32 = createReq(update32, { owner: '12345', notify_err: 'on' });
    await handleWebhook(req32, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Restore fetch
    globalThis.fetch = originalFetchFor32;

    // Verify that NO owner notification was sent (because it's user-space)
    const notifications = recordedCalls.filter(call => 
      call.url.includes('/sendMessage') && 
      call.json?.text && 
      call.json.text.includes('Critical Bot Error')
    );
    assert.strictEqual(notifications.length, 0, 'Should not notify the owner for user-space errors');
    console.log('✅ Test 32 Passed');

    // ----------------------------------------------------
    // Scenario 33: Sequential Chunking for Long Transcriptions (>3000 chars)
    // ----------------------------------------------------
    console.log('\nTest 33: Very long transcription splits into sequential chunks');
    clearHistory();
    
    const longText = 'A'.repeat(3500) + '\n' + 'B'.repeat(1500); // 5001 characters total
    
    const originalFetchFor33 = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/audio/transcriptions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ text: longText }),
          text: async () => JSON.stringify({ text: longText })
        };
      }
      return originalFetchFor33(url, options);
    };

    const update33 = {
      update_id: 1033,
      message: {
        message_id: 233,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_33', file_size: 1000, duration: 5 }
      }
    };

    const req33 = createReq(update33, { owner: '12345', verbose: 'on' });
    await handleWebhook(req33, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Restore fetch
    globalThis.fetch = originalFetchFor33;

    // We expect exactly 2 chunks
    const replies = recordedCalls.filter(call => call.url.includes('/sendMessage') && call.json?.chat_id === 12345);
    assert.strictEqual(replies.length, 2, 'Should send exactly 2 reply messages');

    // Verify Chunk 1 headers & formatting
    const chunk1Text = replies[0].json.text;
    assert.ok(chunk1Text.includes('1/2'), 'Chunk 1 should include 1/2 pagination');
    assert.ok(!chunk1Text.includes('Info: '), 'Chunk 1 should NOT include the verbose info footer');
    assert.ok(chunk1Text.includes('🎤 *Transcription:*'), 'Chunk 1 should have standard header');

    // Verify Chunk 2 headers, formatting & verbose info
    const chunk2Text = replies[1].json.text;
    assert.ok(chunk2Text.includes('2/2'), 'Chunk 2 should include 2/2 pagination');
    assert.ok(chunk2Text.includes('⚙️'), 'Chunk 2 should include the verbose info footer');
    assert.ok(chunk2Text.includes('🎤 *Transcription:*'), 'Chunk 2 should have standard header');

    console.log('✅ Test 33 Passed');

    // ----------------------------------------------------
    // Scenario 34: sendReply Formatting Fallback (recovers as plain text)
    // ----------------------------------------------------
    console.log('\nTest 34: MarkdownV2 formatting error triggers plain-text send fallback');
    clearHistory();
    
    const originalFetchFor34 = globalThis.fetch;
    let sendCount34 = 0;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage')) {
        sendCount34++;
        if (sendCount34 === 1) {
          // Fail first attempt with parse error
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: false,
              error_code: 400,
              description: "Bad Request: can't parse entities: Character '(' is reserved"
            })
          };
        } else {
          // Succeed on fallback (which should have parse_mode deleted)
          const parsed = JSON.parse(options.body);
          assert.strictEqual(parsed.parse_mode, undefined, 'Fallback attempt must NOT include parse_mode');
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { message_id: 888 } })
          };
        }
      }
      return originalFetchFor34(url, options);
    };

    const update34 = {
      update_id: 1034,
      message: {
        message_id: 234,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_34', file_size: 1000, duration: 5 }
      }
    };

    const req34 = createReq(update34, { owner: '12345' });
    await handleWebhook(req34, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Restore fetch
    globalThis.fetch = originalFetchFor34;
    assert.strictEqual(sendCount34, 2, 'Should have retried sending once (2 total sends)');
    console.log('✅ Test 34 Passed');

    // ----------------------------------------------------
    // Scenario 35: Deleted Voice Message Error Propagation (reports error to user)
    // ----------------------------------------------------
    console.log('\nTest 35: Deleted voice message error is caught and reported to the user');
    clearHistory();
    
    const originalFetchFor35 = globalThis.fetch;
    let reportedToUser = false;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage')) {
        const parsed = JSON.parse(options.body);
        if (parsed.reply_to_message_id && !parsed.text.includes('Ошибка') && !parsed.text.includes('Error')) {
          // Fail first send attempt because reply message was deleted
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: false,
              error_code: 400,
              description: "Bad Request: reply message not found"
            })
          };
        } else if (parsed.text.includes('reply message not found')) {
          // The error notification is delivered without reply target
          assert.strictEqual(parsed.reply_to_message_id, undefined, 'User error notification must NOT include reply target');
          reportedToUser = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { message_id: 999 } })
          };
        }
      }
      return originalFetchFor35(url, options);
    };

    const update35 = {
      update_id: 1035,
      message: {
        message_id: 235,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_35', file_size: 1000, duration: 5 }
      }
    };

    const req35 = createReq(update35, { owner: '12345', notify_err: 'on' });
    await handleWebhook(req35, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Restore fetch
    globalThis.fetch = originalFetchFor35;
    assert.ok(reportedToUser, 'Should have reported the "reply message not found" error to the user');
    console.log('✅ Test 35 Passed');

    console.log('\n🎉 All Webhook Scenario tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test Suite Failed:', error.message);
    process.exit(1);
  } finally {
    // Restore global fetch
    globalThis.fetch = originalFetch;
  }
}

runTests();


