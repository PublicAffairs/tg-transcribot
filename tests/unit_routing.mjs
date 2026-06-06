/**
 * tests/unit_routing.mjs
 * Category D: Routing, API Controllers, Adapters & Commands Tests
 */

import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { handleSetup, handleMessageUpdate } from '../lib/core.js';
import { handleDashboard } from '../lib/dashboard.js';
import { handleWebRequest, handleVercelRequest, handleNetlifyRequest } from '../lib/framework/adapters.js';
import { dispatchHttpRoute as dispatchRoute } from '../lib/framework/router.js';
import { setupBotProfile, setupBotAvatar, handleCommand } from '../lib/commands.js';
import { handleCallbackQuery, LAST_MENU_MESSAGE } from '../lib/framework/menu.js';
import { 
  recordedCalls, 
  installMockFetch, 
  restoreFetch, 
  mkJson,
  MOCK_TOKEN, 
  MOCK_CONFIG
} from './whitebox_helper.mjs';

// ----------------------------------------------------
// 1. Bot Profile and Avatar setup automation
// ----------------------------------------------------
async function testBotProfileAndAvatar() {
  console.log('\n--- 1. Testing Bot Profile & Avatar Setup Automation ---');
  
  const originalFetch = globalThis.fetch;
  const callCounts = {
    setMyCommands: 0,
    setMyName: 0,
    setMyDescription: 0,
    setMyShortDescription: 0
  };

  globalThis.fetch = async (url, _options) => {
    const urlStr = url.toString();
    if (urlStr.includes('/setMyCommands')) callCounts.setMyCommands++;
    else if (urlStr.includes('/setMyName')) callCounts.setMyName++;
    else if (urlStr.includes('/setMyDescription')) callCounts.setMyDescription++;
    else if (urlStr.includes('/setMyShortDescription')) callCounts.setMyShortDescription++;

    return {
      status: 200,
      ok: true,
      json: async () => ({ ok: true, result: true })
    };
  };

  await setupBotProfile('mock_token');
  
  assert.strictEqual(callCounts.setMyCommands, 5, 'setMyCommands called for 5 languages');
  assert.strictEqual(callCounts.setMyName, 2, 'setMyName fallback called');
  assert.strictEqual(callCounts.setMyDescription, 2);
  assert.strictEqual(callCounts.setMyShortDescription, 2);

  // Avatar Upload Test
  const avatarPath = path.join(process.cwd(), 'avatar.jpg');
  let avatarUploaded = false;
  
  try {
    fs.writeFileSync(avatarPath, 'mock_image_data');
    
    globalThis.fetch = async (url, options) => {
      if (url.toString().includes('/setMyProfilePhoto')) {
        avatarUploaded = true;
        assert.ok(options.body && typeof options.body.append === 'function', 'avatar body should be FormData');
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
    };
    
    await setupBotAvatar('mock_token');
    assert.ok(avatarUploaded, 'avatar file uploaded successfully');
  } finally {
    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }
    globalThis.fetch = originalFetch;
  }

  console.log('✅ Profile & Avatar: commands templates, names and photos uploads parsed');
}

// ----------------------------------------------------
// 2. handleSetup() endpoint (auth, registration, reset)
// ----------------------------------------------------
async function testHandleSetup() {
  console.log('\n--- 2. Testing handleSetup() ---');

  // A. Reject unauthorized requests (wrong/missing token)
  const badReq = { query: { token: 'invalid_token' }, headers: {} };
  const res1 = await handleSetup(badReq, MOCK_CONFIG);
  assert.strictEqual(res1.status, 403);
  assert.strictEqual(res1.body.ok, false);

  const noTokenReq = { query: {}, headers: {} };
  const res2 = await handleSetup(noTokenReq, MOCK_CONFIG);
  assert.strictEqual(res2.status, 403);

  // B. Standard setup flow: setWebhook ok
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/setWebhook': () => mkJson({ ok: true, result: true }),
    '/setMyCommands': () => mkJson({ ok: true, result: true }),
    '/setMyName': () => mkJson({ ok: true, result: true }),
    '/setMyDescription': () => mkJson({ ok: true, result: true }),
    '/setMyShortDescription': () => mkJson({ ok: true, result: true })
  });

  const okReq = { query: { token: MOCK_TOKEN }, headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' } };
  const res3 = await handleSetup(okReq, MOCK_CONFIG);
  assert.strictEqual(res3.status, 200);
  assert.strictEqual(res3.body.ok, true);

  // C. Setup flow: setWebhook fails
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: '' } }),
    '/setWebhook': () => mkJson({ ok: false, error_code: 400, description: 'Telegram error description' })
  });
  const failReq = { query: { token: MOCK_TOKEN }, headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' } };
  const res4 = await handleSetup(failReq, MOCK_CONFIG);
  assert.strictEqual(res4.status, 400);
  assert.strictEqual(res4.body.ok, false);

  // D. Reset owner action
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/setWebhook': () => mkJson({ ok: true, result: true })
  });
  const resetReq = {
    query: { token: MOCK_TOKEN, action: 'reset_owner' },
    headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' }
  };
  recordedCalls.length = 0;
  const res5 = await handleSetup(resetReq, MOCK_CONFIG);
  assert.strictEqual(res5.status, 200);
  assert.strictEqual(res5.body.ok, true);
  
  const lastSetWebhook = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.ok(lastSetWebhook);
  assert.strictEqual(new URL(lastSetWebhook.json.url).searchParams.get('owner'), null, 'owner cleared from webhook query params');

  restoreFetch();
  console.log('✅ handleSetup: token checking, registration cascade and ownership reset checks passed');
}

// ----------------------------------------------------
// 3. handleDashboard() (UI states & alerts badges)
// ----------------------------------------------------
async function testHandleDashboard() {
  console.log('\n--- 3. Testing handleDashboard() UI states ---');

  // A. Missing TELEGRAM_BOT_TOKEN
  const configNoToken = { ...MOCK_CONFIG, telegramBotToken: undefined };
  const res1 = await handleDashboard({ headers: { host: 'mybot.com' } }, configNoToken);
  assert.strictEqual(res1.status, 200);
  assert.ok(res1.body.includes('CONFIGURATION ERROR'));

  // B. Missing WHISPER_API_KEY
  const configNoWhisper = { ...MOCK_CONFIG, whisperApiKey: undefined };
  const res2 = await handleDashboard({ headers: { host: 'mybot.com' } }, configNoWhisper);
  assert.strictEqual(res2.status, 200);
  assert.ok(res2.body.includes('WHISPER KEY MISSING'));

  // C. Webhook registration fails
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: '' } }),
    '/setWebhook': () => mkJson({ ok: false, error_code: 400, description: 'Telegram error mock' }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } })
  });
  const res3 = await handleDashboard({ headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' } }, MOCK_CONFIG);
  assert.strictEqual(res3.status, 200);
  assert.ok(res3.body.includes('WEBHOOK REGISTRATION FAILED'));
  assert.ok(res3.body.includes('Telegram error mock'));

  // D. Active & Configured bot
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://mybot.com/api/webhook?owner=99999' } }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } })
  });
  const res4 = await handleDashboard({ headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' } }, MOCK_CONFIG);
  assert.strictEqual(res4.status, 200);
  assert.ok(res4.body.includes('BOT ACTIVE'));
  assert.ok(res4.body.includes('Reset Owner Chat'));

  // E. Awaiting owner registration (unclaimed)
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://mybot.com/api/webhook' } }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } })
  });
  const res5 = await handleDashboard({ headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' } }, MOCK_CONFIG);
  assert.strictEqual(res5.status, 200);
  assert.ok(res5.body.includes('AWAITING OWNER REGISTRATION'));

  // F. Webhook URL change: existing URL on different host → should show "Webhook URL Updated"
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://old-deploy.vercel.app/api/webhook?owner=99999' } }),
    '/setWebhook': () => mkJson({ ok: true, result: true }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } })
  });
  const resF = await handleDashboard({ headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' } }, MOCK_CONFIG);
  assert.strictEqual(resF.status, 200);
  assert.ok(resF.body.includes('Webhook URL Updated'), 'shows URL Updated heading when previous URL existed');
  assert.ok(resF.body.includes('old-deploy.vercel.app'), 'shows old webhook URL in transition block');
  assert.ok(resF.body.includes('mybot.com/api/webhook'), 'shows new webhook URL in transition block');

  // G. Fresh registration: no previous webhook → should show "Webhook Registered Successfully"
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: '' } }),
    '/setWebhook': () => mkJson({ ok: true, result: true }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } })
  });
  const resG = await handleDashboard({ headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' } }, MOCK_CONFIG);
  assert.strictEqual(resG.status, 200);
  assert.ok(resG.body.includes('Webhook Registered Successfully'), 'shows Registered heading when no previous URL');
  assert.ok(resG.body.includes('None'), 'shows None as previous webhook');

  restoreFetch();
  console.log('✅ handleDashboard: verified all badges state transformations in Dashboard UI');
}

// ----------------------------------------------------
// 4. Commands settings & Settings button callback queries
// ----------------------------------------------------
async function testCommandsAndCallbacks() {
  console.log('\n--- 4. Testing Settings Commands & Callback Queries ---');



  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999&prompt=%E2%80%94+How+are+you%3F+%E2%80%94+I%27m+fine%2C+thank+you.' } }),
    '/setWebhook': () => mkJson({ ok: true, result: true }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } }),
    '/sendMessage': () => mkJson({ ok: true, result: {} })
  });

  // A. /config command (with special characters in prompt)
  recordedCalls.length = 0;
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/config'
  }, MOCK_CONFIG, 'https://mybot.com');
  const configReply = recordedCalls.find(c => c.url.includes('/sendMessage'));
  assert.ok(configReply, 'config command sends menu message');
  assert.ok(configReply.json.text.includes('— How are you? — I\'m fine, thank you\\.'), 'config text includes escaped prompt value');

  // A2. /prompt command (without args)
  recordedCalls.length = 0;
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/prompt'
  }, MOCK_CONFIG, 'https://mybot.com');
  const promptReply = recordedCalls.find(c => c.url.includes('/sendMessage'));
  assert.ok(promptReply, 'prompt command sends menu message');
  assert.ok(promptReply.json.text.includes('Current prompt'), 'prompt text includes current prompt information');

  // A3. /config text must use single-asterisk MarkdownV2 bold (*label*) and have escaped special chars
  //     (regression: was using invalid **label** and not escaping () in langbot value)
  recordedCalls.length = 0;
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } }),
    '/sendMessage': () => mkJson({ ok: true, result: {} })
  });
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999, language_code: 'en-US' },
    text: '/config'
  }, MOCK_CONFIG, 'https://mybot.com');
  const configTextRaw = recordedCalls.find(c => c.url.includes('/sendMessage')).json?.text || '';
  assert.ok(!configTextRaw.includes('**'), 'config text must NOT contain ** (invalid MarkdownV2 bold)');
  assert.ok(/\*[^*]+\*/.test(configTextRaw), 'config text uses single-asterisk *bold* formatting');
  assert.ok(configTextRaw.includes('example\\.com'), 'webhook domain in config must be escaped');
  assert.ok(configTextRaw.includes('whisper\\-large\\-v3\\-turbo'), 'model name in config must be escaped');
  assert.ok(configTextRaw.includes('[Whisper](https://console.groq.com/docs/speech-to-text#using-the-api) model'), 'Whisper model title is linkified');

  // Verify linkification of mode values and custom prompt prefix when active
  recordedCalls.length = 0;
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: {
      url: 'https://example.com/api/webhook?owner=99999&verbose=on&prompt=hello.world',
      allowed_updates: ['message', 'my_chat_member', 'callback_query', 'guest_message', 'business_message']
    } }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } }),
    '/sendMessage': () => mkJson({ ok: true, result: {} })
  });
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999, language_code: 'en-US' },
    text: '/config'
  }, MOCK_CONFIG, 'https://mybot.com');
  const configTextUpdated = recordedCalls.find(c => c.url.includes('/sendMessage')).json?.text || '';
  assert.ok(configTextUpdated.includes('[Secretary](https://t.me/TelegramTips/567)'), 'Secretary mode value is linkified');
  assert.ok(configTextUpdated.includes('[Guest](https://t.me/TelegramTips/565)'), 'Guest mode value is linkified');
  assert.ok(configTextUpdated.includes('[custom](https://developers.openai.com/cookbook/examples/whisper_prompting_guide): "hello\\.world"'), 'custom prompt is linkified with proper escaping');

  // A4. nav:config: callback (Back from sub-menu) must NOT add a Back button to config (phantom Back regression)
  //     Simulates clicking Back inside lang, which sends nav:config: with empty backMenuId.
  //     The Back button previously inherited from message keyboard via getBackMenuId, creating a self-referencing loop.
  recordedCalls.length = 0;
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot', can_join_groups: true } }),
    '/editMessageText': () => mkJson({ ok: true, result: {} }),
    '/answerCallbackQuery': () => mkJson({ ok: true, result: {} })
  });
  await handleCallbackQuery({
    id: 'q_nav_back_to_config',
    from: { id: 99999 },
    message: {
      chat: { id: 99999, type: 'private' },
      message_id: 101,
      // Keyboard represents lang menu — its Back button is nav:config:
      reply_markup: { inline_keyboard: [
        [{ text: '« Назад', callback_data: 'nav:config:' }]
      ]}
    },
    data: 'nav:config:'
  }, MOCK_CONFIG, 'https://mybot.com');
  const editCall = recordedCalls.find(c => c.url.includes('/editMessageText'));
  assert.ok(editCall, 'nav:config: triggers editMessageText');
  const configKb = editCall.json?.reply_markup?.inline_keyboard || [];
  const flatBtns = configKb.flat();
  const backBtns = flatBtns.filter(b => b.callback_data?.startsWith('nav:') && b.callback_data.split(':')[2] === '');
  assert.strictEqual(backBtns.length, 0, 'config keyboard must have NO Back button after navigating back from sub-menu');

  // B. /lang without args shows inline keyboard
  recordedCalls.length = 0;
  const cmdMsgNoArg = {
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/lang'
  };
  await handleCommand(cmdMsgNoArg, MOCK_CONFIG, 'https://mybot.com');
  const replyNoArg = recordedCalls.find(c => c.url.includes('/sendMessage'));
  assert.ok(replyNoArg.json?.reply_markup?.inline_keyboard);
  const langKb = replyNoArg.json.reply_markup.inline_keyboard;
  const otherRow = langKb[langKb.length - 2];
  const otherBtn = otherRow[otherRow.length - 1];
  assert.strictEqual(otherBtn.text, '🌐 Other…');
  assert.strictEqual(otherBtn.switch_inline_query_current_chat, '/lang ');
  const lastRow = langKb[langKb.length - 1];
  assert.strictEqual(lastRow[0].text, '« Back');

  // B7. Command prefixed with bot username (sent via inline query completion)
  recordedCalls.length = 0;
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '@testbot /lang ja'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallLangUsername = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallLangUsername.json.url).searchParams.get('lang'), 'ja');

  // B2. /langbot shows keyboard with active autodetect and fallback checked simultaneously
  recordedCalls.length = 0;
  const cmdMsgLangbot = {
    chat: { id: 99999, type: 'private' },
    from: { id: 99999, language_code: 'en-US' },
    text: '/langbot'
  };
  await handleCommand(cmdMsgLangbot, MOCK_CONFIG, 'https://mybot.com');
  const replyLangbot = recordedCalls.find(c => c.url.includes('/sendMessage'));
  const langbotKb = replyLangbot.json.reply_markup.inline_keyboard;
  
  // Verify that Auto-detect is checked (✅)
  assert.ok(langbotKb[0][0].text.includes('✅'));
  assert.ok(langbotKb[0][0].text.includes('(en-US)'));
  
  // Verify that English fallback is highlighted (★)
  assert.ok(langbotKb[1][0].text.includes('★'));

  // B3. /webhook without args opens the webhook sub-menu
  recordedCalls.length = 0;
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } }),
    '/sendMessage': () => mkJson({ ok: true, result: {} })
  });
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999, language_code: 'en-US' },
    text: '/webhook'
  }, MOCK_CONFIG, 'https://mybot.com');
  const replyWebhook = recordedCalls.find(c => c.url.includes('/sendMessage'));
  assert.ok(replyWebhook, 'webhook command sends menu message');
  assert.ok(replyWebhook.json?.text.includes('Current URL'), 'webhook text includes menu content');
  const webhookKb = replyWebhook.json?.reply_markup?.inline_keyboard;
  assert.ok(webhookKb, 'webhook menu has inline keyboard');
  assert.strictEqual(webhookKb[0][0].text, '✏️ Change URL…');
  assert.strictEqual(webhookKb[0][0].switch_inline_query_current_chat, '/webhook ');

  // C. Callback queries for settings updates
  // langbot:set:ru
  recordedCalls.length = 0;
  await handleCallbackQuery({
    id: 'q_langbot',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'langbot:set:ru'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallLangbot = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallLangbot.json.url).searchParams.get('langbot'), 'ru');

  // model:set:whisper-large-v3-turbo
  recordedCalls.length = 0;
  await handleCallbackQuery({
    id: 'q_model',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'model:set:whisper-large-v3-turbo'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallModel = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallModel.json.url).searchParams.get('model'), 'whisper-large-v3-turbo');

  // verbose:set:on
  recordedCalls.length = 0;
  await handleCallbackQuery({
    id: 'q_verbose',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'verbose:set:true'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallVerbose = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallVerbose.json.url).searchParams.get('verbose'), 'on');

  // verbose:set:on (Russian language check for dot/reserved char escaping)
  recordedCalls.length = 0;
  await handleCallbackQuery({
    id: 'q_verbose_ru',
    from: { id: 99999, language_code: 'ru' },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'verbose:set:true'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallVerboseRu = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallVerboseRu.json.url).searchParams.get('verbose'), 'on');


  // prompt:set:empty
  recordedCalls.length = 0;
  await handleCallbackQuery({
    id: 'q_prompt',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'prompt:set:empty'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallPrompt = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallPrompt.json.url).searchParams.get('prompt'), '');

  // D. Callback disabled button checks (Groups toggle capacity guard)
  // Case 1: Capability still disabled -> Instruction sent, loader dismissed, keyboard NOT changed
  recordedCalls.length = 0;
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/getMe': () => mkJson({ ok: true, result: { id: 777, username: 'mybot', can_join_groups: false } })
  });
  await handleCallbackQuery({
    id: 'q_disabled_groups',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'mode:disabled:groups'
  }, MOCK_CONFIG, 'https://mybot.com');
  const alert = recordedCalls.find(c => c.url.includes('/answerCallbackQuery'));
  assert.ok(alert && !alert.json?.show_alert);
  assert.ok(recordedCalls.find(c => c.url.includes('/sendMessage')).json?.text.includes('не включён') || recordedCalls.find(c => c.url.includes('/sendMessage')).json?.text.includes('not enabled'));
  assert.ok(!recordedCalls.find(c => c.url.includes('/editMessageText')));

  // Case 2: Capability enabled in BotFather -> Shows alert, does not save webhook, refreshes keyboard
  recordedCalls.length = 0;
  installMockFetch({
    '/getMe': () => mkJson({ ok: true, result: { id: 777, username: 'mybot', can_join_groups: true } }),
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/setWebhook': () => mkJson({ ok: true, result: true })
  });
  await handleCallbackQuery({
    id: 'q_disabled_groups_ok',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'mode:disabled:groups'
  }, MOCK_CONFIG, 'https://mybot.com');
  const alertOutOfSync = recordedCalls.find(c => c.url.includes('/answerCallbackQuery'));
  assert.strictEqual(alertOutOfSync.json?.show_alert, true);
  assert.ok(recordedCalls.find(c => c.url.includes('/editMessageText')));
  assert.ok(!recordedCalls.find(c => c.url.includes('/setWebhook')));

  // Case 3: Normal groups toggle when enabled in BotFather -> calls getMe and saves to webhook
  recordedCalls.length = 0;
  installMockFetch({
    '/getMe': () => mkJson({ ok: true, result: { id: 777, username: 'mybot', can_join_groups: true } }),
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/setWebhook': () => mkJson({ ok: true, result: true })
  });
  await handleCallbackQuery({
    id: 'q_toggle_groups',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'mode:toggle:groups'
  }, MOCK_CONFIG, 'https://mybot.com');
  assert.ok(recordedCalls.find(c => c.url.includes('/setWebhook')));
  assert.ok(recordedCalls.find(c => c.url.includes('/getMe')));
  assert.ok(recordedCalls.find(c => c.url.includes('/editMessageText')));

  // Case 4: Toggle groups when capability was disabled in BotFather -> Alert popup, does not save webhook
  recordedCalls.length = 0;
  installMockFetch({
    '/getMe': () => mkJson({ ok: true, result: { id: 777, username: 'mybot', can_join_groups: false } }),
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } })
  });
  await handleCallbackQuery({
    id: 'q_toggle_groups_disabled',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'mode:toggle:groups'
  }, MOCK_CONFIG, 'https://mybot.com');
  assert.ok(!recordedCalls.find(c => c.url.includes('/setWebhook')));
  assert.strictEqual(recordedCalls.find(c => c.url.includes('/answerCallbackQuery')).json?.show_alert, true);
  assert.ok(recordedCalls.find(c => c.url.includes('/editMessageText')));

  // Case 5: /readme command fetches from github and calls sendDocument
  recordedCalls.length = 0;
  installMockFetch({
    'raw/master/README.md': () => ({
      ok: true,
      status: 200,
      text: async () => 'Mock README contents from GitHub'
    }),
    '/sendDocument': () => mkJson({ ok: true, result: {} }),
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } })
  });
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/readme'
  }, MOCK_CONFIG, 'https://mybot.com');
  const githubFetch = recordedCalls.find(c => c.url.includes('raw/master/README.md'));
  assert.ok(githubFetch, 'fetches readme from github');
  const sendDocCall = recordedCalls.find(c => c.url.includes('/sendDocument'));
  assert.ok(sendDocCall, 'calls sendDocument');

  // Case 6: /readme command fallback when sendDocument fails
  recordedCalls.length = 0;
  installMockFetch({
    'raw/master/README.md': () => ({
      ok: true,
      status: 200,
      text: async () => 'Mock README contents from GitHub'
    }),
    '/sendDocument': () => mkJson({ ok: false, error_code: 400, description: 'API Error' }),
    '/sendMessage': () => mkJson({ ok: true, result: {} }),
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } })
  });
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/readme'
  }, MOCK_CONFIG, 'https://mybot.com');
  const fallbackMessageCall = recordedCalls.find(c => c.url.includes('/sendMessage'));
  assert.ok(fallbackMessageCall, 'falls back to sendMessage');
  assert.ok(fallbackMessageCall.json?.text.includes('Failed to send README.md attachment') || fallbackMessageCall.json?.text.includes('Failed to send README'), 'fallback message has error alert');
  assert.ok(fallbackMessageCall.json?.text.includes('https://github\\.com/PublicAffairs/tg\\-transcribot') || fallbackMessageCall.json?.text.includes('github.com/PublicAffairs/tg-transcribot'), 'fallback message has REPO_URL');

  // Case 7: Commands with arguments (setting values directly)
  // /lang ru
  LAST_MENU_MESSAGE.clear();
  recordedCalls.length = 0;
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/setWebhook': () => mkJson({ ok: true, result: true }),
    '/sendMessage': () => mkJson({ ok: true, result: {} })
  });
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/lang ru'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallLangDirect = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallLangDirect.json.url).searchParams.get('lang'), 'ru');
  assert.ok(recordedCalls.find(c => c.url.includes('/sendMessage')).json?.text.includes('Language') || recordedCalls.find(c => c.url.includes('/sendMessage')).json?.text.includes('Язык'));

  // /prompt default
  recordedCalls.length = 0;
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/prompt default'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallPromptDirectDef = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallPromptDirectDef.json.url).searchParams.get('prompt'), null); // default removes prompt param

  // /prompt empty
  recordedCalls.length = 0;
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/prompt empty'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallPromptDirectEmp = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallPromptDirectEmp.json.url).searchParams.get('prompt'), '');

  // /prompt test val
  recordedCalls.length = 0;
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/prompt test val'
  }, MOCK_CONFIG, 'https://mybot.com');
  const setCallPromptDirectVal = recordedCalls.find(c => c.url.includes('/setWebhook'));
  assert.strictEqual(new URL(setCallPromptDirectVal.json.url).searchParams.get('prompt'), 'test val');

  // Case 8: /process warning fallback when no audio exists
  recordedCalls.length = 0;
  await handleCommand({
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/process'
  }, MOCK_CONFIG, 'https://mybot.com');
  assert.ok(recordedCalls.some(c => c.url.includes('/sendMessage') && c.json.text.includes('No audio')));

  // Case 9: setupBotAvatar failures (API ok=false and catch block)
  const avatarPath = path.join(process.cwd(), 'avatar.jpg');
  try {
    fs.writeFileSync(avatarPath, 'mock_image_data');
    
    // API returns ok: false
    globalThis.fetch = async (_url, _options) => {
      return { ok: true, status: 200, json: async () => ({ ok: false, description: 'Simulated BotPhoto fail' }) };
    };
    await setupBotAvatar('mock_token');

    // JSON throws error (triggers catch block)
    globalThis.fetch = async (_url, _options) => {
      return { ok: true, status: 200, json: async () => { throw new Error('Mock JSON parse exception'); } };
    };
    await setupBotAvatar('mock_token');
  } finally {
    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }
  }

  restoreFetch();
  console.log('✅ Settings Menu: button clicks, capability checks and toggles validation passed');

}

// ----------------------------------------------------
// 5. HTTP Routers & Serverless Adapters
// ----------------------------------------------------
async function testAdaptersAndRouters() {
  console.log('\n--- 5. Testing HTTP Routers & Serverless Runtime Request Adapters ---');

  // A. dispatchRoute
  const config = { telegramBotToken: 'token', version: '1.0.0' };
  
  const resHealth = await dispatchRoute({ urlPath: '/api/health', method: 'GET' }, config);
  assert.strictEqual(resHealth.status, 200);
  assert.strictEqual(resHealth.body.version, '1.0.0');

  const resSetup = await dispatchRoute({ urlPath: '/api/setup', method: 'GET', query: {} }, config);
  assert.strictEqual(resSetup.status, 403);

  const res404 = await dispatchRoute({ urlPath: '/invalid-path', method: 'GET' }, config);
  assert.strictEqual(res404.status, 404);
  assert.strictEqual(res404.body, 'Not Found');

  // B. handleWebRequest
  if (typeof globalThis.Request !== 'undefined') {
    const request = {
      url: 'https://example.com/api/health?param=val',
      method: 'GET',
      headers: new Map([['host', 'example.com'], ['x-forwarded-proto', 'https']])
    };
    const res = await handleWebRequest(request, { TELEGRAM_BOT_TOKEN: 'token', BOT_VERSION: '2.0.0' });
    assert.ok(res instanceof Response);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.version, '2.0.0');

    // Test malformed JSON body exception handling
    const malformedRequest = {
      url: 'https://example.com/api/health',
      method: 'POST',
      headers: new Map([['host', 'example.com']]),
      json: async () => { throw new Error('Unexpected token x in JSON'); }
    };
    const resMalformed = await handleWebRequest(malformedRequest, { TELEGRAM_BOT_TOKEN: 'token' });
    assert.strictEqual(resMalformed.status, 200);
  }

  // C. handleVercelRequest
  const mockReq = {
    url: '/api/health',
    method: 'GET',
    headers: { host: 'example.com' },
    query: {}
  };
  let statusVal = null;
  let headersSet = {};
  let bodySent = null;
  const mockRes = {
    status: (code) => { statusVal = code; return mockRes; },
    setHeader: (k, v) => { headersSet[k] = v; return mockRes; },
    send: (body) => { bodySent = body; return mockRes; }
  };
  await handleVercelRequest(mockReq, mockRes, { TELEGRAM_BOT_TOKEN: 'token', BOT_VERSION: '2.0.0' });
  assert.strictEqual(statusVal, 200);
  assert.strictEqual(headersSet['Content-Type'], 'application/json');
  const parsed = typeof bodySent === 'string' ? JSON.parse(bodySent) : bodySent;
  assert.strictEqual(parsed.version, '2.0.0');

  // D. handleNetlifyRequest
  const event = {
    httpMethod: 'POST',
    path: '/api/webhook',
    headers: { 'host': 'example.com', 'x-telegram-bot-api-secret-token': 'wrong-secret' },
    body: '{"update_id":123}',
    isBase64Encoded: false
  };
  const resNetlify = await handleNetlifyRequest(event, {}, { TELEGRAM_BOT_TOKEN: 'token', BOT_VERSION: '2.0.0' });
  assert.strictEqual(resNetlify.statusCode, 403);

  // Netlify Base64 decoding
  const base64Event = {
    httpMethod: 'POST',
    path: '/api/webhook',
    headers: { 'host': 'example.com' },
    body: globalThis.Buffer.from('{"update_id":124}').toString('base64'),
    isBase64Encoded: true
  };
  const resBase64 = await handleNetlifyRequest(base64Event, {}, { TELEGRAM_BOT_TOKEN: 'token' });
  assert.strictEqual(resBase64.statusCode, 403);

  // Netlify null body tolerance
  const emptyEvent = {
    httpMethod: 'GET',
    path: '/api/health',
    headers: { host: 'example.com' },
    body: null,
    isBase64Encoded: false
  };
  const resEmpty = await handleNetlifyRequest(emptyEvent, {}, { TELEGRAM_BOT_TOKEN: 'token' });
  assert.strictEqual(resEmpty.statusCode, 200);

  // E. GET / routes to dashboard (regression: missing core.js import caused 404)
  const mockReqDash = {
    url: '/',
    method: 'GET',
    headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' },
    query: {}
  };
  let dashStatus = null;
  let dashHeaders = {};
  let dashBody = null;
  const mockResDash = {
    status: (code) => { dashStatus = code; return mockResDash; },
    setHeader: (k, v) => { dashHeaders[k] = v; return mockResDash; },
    send: (body) => { dashBody = body; return mockResDash; }
  };
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://mybot.com/api/webhook?owner=99999' } }),
    '/getMe': () => mkJson({ ok: true, result: { username: 'testbot', first_name: 'TestBot' } })
  });
  await handleVercelRequest(mockReqDash, mockResDash, { TELEGRAM_BOT_TOKEN: MOCK_TOKEN, BOT_VERSION: '2.0.0' });
  restoreFetch();
  assert.strictEqual(dashStatus, 200, 'GET / must return 200, not 404 (core.js must be imported)');
  assert.ok(typeof dashBody === 'string' && dashBody.includes('<!DOCTYPE html>'), 'GET / must serve dashboard HTML');

  console.log('✅ Adapters: WebRequest, Vercel express-req and Netlify event base64 handlers verified');
}

// ----------------------------------------------------
// 6. Direct Handler Invocation (handleMessageUpdate)
// ----------------------------------------------------
async function testDirectHandlerInvocation() {
  console.log('\n--- 6. Testing Direct Handler Invocation (core.js) ---');
  let waitCalled = false;
  installMockFetch();
  
  const mockCtx = {
    token: MOCK_TOKEN,
    config: { ...MOCK_CONFIG, ownerChatId: null },
    baseUrl: 'https://example.com',
    settings: { groups: false },
    ownerId: null,
    update: {},
    executionCtx: {
      waitUntil: (p) => {
        waitCalled = true;
        return p;
      }
    }
  };

  // Group message early return (groups = false, no owner) -> 200 OK
  const groupMessage = { chat: { type: 'group', id: -123 }, from: { language_code: 'en' } };
  const res1 = await handleMessageUpdate(groupMessage, mockCtx);
  assert.strictEqual(res1.status, 200);

  // Private message (no owner) -> dynamically registers owner, calls waitUntil
  const privateMessage = { chat: { type: 'private', id: 999 }, from: { language_code: 'en' } };
  const res2 = await handleMessageUpdate(privateMessage, mockCtx);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(mockCtx.config.ownerChatId, '999');
  assert.strictEqual(waitCalled, true);

  restoreFetch();
  console.log('✅ Core Handlers: early exits and async waitUntil registration checked');
}

// ----------------------------------------------------
// 7. Scoped Commands registration (Owners vs Guests)
// ----------------------------------------------------
async function testScopedCommandsRegistration() {
  console.log('\n--- 7. Testing Scoped Commands Registration ---');
  
  // Owner start command -> registers commands with 'mode'
  installMockFetch({
    '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } }),
    '/setMyCommands': () => mkJson({ ok: true, result: true }),
    '/sendMessage': () => mkJson({ ok: true, result: true })
  });
  
  recordedCalls.length = 0;
  const ownerMsg = {
    chat: { id: 99999, type: 'private' },
    from: { id: 99999 },
    text: '/start'
  };
  await handleCommand(ownerMsg, MOCK_CONFIG, 'https://mybot.com');
  const ownerCommandsCall = recordedCalls.find(c => c.url.includes('/setMyCommands'));
  assert.ok(ownerCommandsCall);
  assert.strictEqual(ownerCommandsCall.json?.scope?.type, 'chat');
  assert.strictEqual(ownerCommandsCall.json?.scope?.chat_id, 99999);
  assert.ok(ownerCommandsCall.json?.commands.some(cmd => cmd.command === 'mode'), 'owner menu has mode command');

  // Guest start command -> registers commands without 'mode', with 'help'
  recordedCalls.length = 0;
  const guestMsg = {
    chat: { id: 55555, type: 'private' },
    from: { id: 55555 },
    text: '/start'
  };
  await handleCommand(guestMsg, MOCK_CONFIG, 'https://mybot.com');
  const guestCommandsCall = recordedCalls.find(c => c.url.includes('/setMyCommands'));
  assert.ok(guestCommandsCall);
  assert.strictEqual(guestCommandsCall.json?.scope?.type, 'chat');
  assert.strictEqual(guestCommandsCall.json?.scope?.chat_id, 55555);
  assert.ok(!guestCommandsCall.json?.commands.some(cmd => cmd.command === 'mode'), 'guest menu does NOT show mode command');
  assert.ok(guestCommandsCall.json?.commands.some(cmd => cmd.command === 'help'));
  assert.ok(guestCommandsCall.json?.commands.some(cmd => cmd.command === 'readme'), 'guest menu has readme command');
  assert.ok(ownerCommandsCall.json?.commands.some(cmd => cmd.command === 'readme'), 'owner menu has readme command');

  restoreFetch();
  console.log('✅ Scoped Menus: commands list correctly split for owners vs guests');
}

// ----------------------------------------------------


export async function run() {
  await testBotProfileAndAvatar();
  await testHandleSetup();
  await testHandleDashboard();
  await testCommandsAndCallbacks();
  await testAdaptersAndRouters();
  await testDirectHandlerInvocation();
  await testScopedCommandsRegistration();

}
