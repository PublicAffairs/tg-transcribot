// lib/core.js
// Unified Core Engine for Telegram Voice Transcribot

import { isAdtsAac, wrapAacInM4a } from './aac-to-m4a.js';
import { getTranslation } from './localize.js';

// File size limits in bytes
const MAX_MB = 20;
const MAX_FILE_SIZE = MAX_MB * 1024 * 1024;

// Cache for bot information to avoid duplicate getMe calls
let botId = null;
let botUsername = null;

/**
 * Helper to fetch a header case-insensitively from a plain headers object.
 */
function getHeader(headers, name) {
  if (!headers) return undefined;
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}

/**
 * Compute SHA-256 hash using web crypto API.
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Get cached or fresh bot username and ID.
 */
async function getBotInfo(token) {
  if (botUsername && botId) return { username: botUsername, id: botId };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) {
      botUsername = data.result.username;
      botId = data.result.id;
      return { username: botUsername, id: botId };
    }
  } catch (e) {
    console.error('getMe failed in getBotInfo:', e);
  }
  return null;
}

/**
 * Check if the message contains an explicit mention of the bot.
 */
function hasBotMention(message, botUser) {
  const text = message.text || message.caption || '';
  const entities = message.entities || message.caption_entities || [];
  
  for (const entity of entities) {
    if (entity.type === 'mention') {
      const mentionText = text.substring(entity.offset, entity.offset + entity.length);
      if (mentionText.toLowerCase() === `@${botUser.toLowerCase()}`) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a message is directed to the bot.
 */
async function isMessageDirectedToBot(message, token, isBusiness = false) {
  if (!message) return false;
  
  // 1. Private chat: always directed to the bot (unless in business mode)
  if (!isBusiness && message.chat.type === 'private') return true;
  
  // 2. Group chat or Business mode: check for mention or reply
  const botInfo = await getBotInfo(token);
  if (botInfo) {
    if (hasBotMention(message, botInfo.username)) return true;
    if (message.reply_to_message?.from?.id === botInfo.id) return true;
  }
  
  return false;
}

/**
 * Send alert to the bot owner.
 */
async function notifyOwner(text, token, ownerId) {
  if (!ownerId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ownerId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    const data = await res.json();
    console.log('Owner notification response:', data);
  } catch (e) {
    console.error('Failed to notify owner:', e);
  }
}

/**
 * Export group invite link.
 */
async function getGroupInviteLink(chatId, token) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/exportChatInviteLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId })
    });
    const data = await res.json();
    if (data.ok) {
      return data.result;
    }
  } catch (e) {
    console.error('Failed to export chat invite link:', e);
  }
  return null;
}

/**
 * HTML escape helper.
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Transcribe the audio file via Groq/OpenAI Whisper API.
 */
async function transcribeAudio(fileId, config) {
  const token = config.telegramBotToken;
  const apiKey = config.whisperApiKey;
  const apiBase = config.whisperApiBase || 'https://api.groq.com/openai/v1';
  const whisperModel = config.whisperModel || 'whisper-large-v3';
  const whisperLanguage = config.whisperLanguage;
  const whisperPrompt = config.whisperPrompt !== undefined
    ? config.whisperPrompt
    : 'Hello! How are you doing? Привет! Как дела? Hallo! Wie geht\'s? Привіт! Як справи? This is a multilingual recording.';

  try {
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok) {
      return { ok: false, error: `Telegram getFile API error: ${JSON.stringify(fileInfo)}` };
    }

    const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;
    const audioRes = await fetch(fileUrl);
    if (!audioRes.ok) {
      return { ok: false, error: `Telegram file download HTTP status ${audioRes.status}` };
    }
    const audioBuffer = new Uint8Array(await audioRes.arrayBuffer());

    const formData = new FormData();
    const filePath = fileInfo.result.file_path || '';
    let ext = filePath.split('.').pop() || 'ogg';
    if (ext === 'oga') ext = 'ogg';

    let finalAudioData = audioBuffer;
    if (isAdtsAac(audioBuffer)) {
      console.log(`Detected raw ADTS-AAC stream (ext: .${ext}), re-wrapping in M4A container...`);
      try {
        finalAudioData = await wrapAacInM4a(audioBuffer);
        ext = 'm4a';
        console.log(`Re-wrapped AAC → M4A, new size: ${finalAudioData.byteLength} bytes`);
      } catch (wrapErr) {
        console.error('Failed to re-wrap AAC in M4A, sending original:', wrapErr.message);
      }
    }

    const mimeType = ext === 'mp3' ? 'audio/mpeg' : (ext === 'm4a' || ext === 'mp4' ? 'audio/mp4' : 'audio/ogg');

    // Create a Web standard Blob
    const fileBlob = new Blob([finalAudioData], { type: mimeType });
    formData.append('file', fileBlob, `audio.${ext}`);
    formData.append('model', whisperModel);
    formData.append('response_format', 'json');

    if (whisperLanguage && whisperLanguage !== 'auto') {
      formData.append('language', whisperLanguage);
    }
    if (whisperPrompt) {
      formData.append('prompt', whisperPrompt);
    }

    const transcriptionUrl = apiBase.endsWith('/audio/transcriptions')
      ? apiBase
      : `${apiBase.replace(/\/$/, '')}/audio/transcriptions`;

    const apiRes = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      return { ok: false, error: `Transcription API HTTP ${apiRes.status}: ${errorText}` };
    }

    const transcription = await apiRes.json();
    if (!transcription.text) {
      return { ok: false, error: `Transcription API returned empty response: ${JSON.stringify(transcription)}` };
    }

    return { ok: true, text: transcription.text.trim() };
  } catch (e) {
    return { ok: false, error: `Internal transcription exception: ${e.message || e}` };
  }
}

/**
 * Normalized Telegram Webhook Handler.
 */
export async function handleWebhook(requestInfo, config, ctx) {
  const token = config.telegramBotToken;
  const ownerId = config.ownerChatId;

  if (!token) {
    console.error('telegramBotToken is missing in config');
    return { status: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Bot token not configured' };
  }

  const headers = requestInfo.headers || {};
  const update = requestInfo.body;

  try {
    // 1. Verify Webhook Secret
    const expectedSecret = await sha256(token);
    const receivedSecret = getHeader(headers, 'x-telegram-bot-api-secret-token');
    if (expectedSecret && receivedSecret !== expectedSecret) {
      console.error('Unauthorized request: webhook secret mismatch');
      return { status: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Forbidden' };
    }

    if (!update) {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }

    console.log('--- UPDATE RECEIVED ---', JSON.stringify(update));

    // 2. Detect business connection updates
    if (update.business_connection) {
      console.log('Business connection update:', update.business_connection);
      const conn = update.business_connection;
      const statusText = conn.is_enabled ? 'connected' : 'disconnected';
      const replyStatus = conn.can_reply ? 'can reply in chats' : 'cannot reply in chats';
      
      await notifyOwner(
        `👔 <b>Bot is ${statusText} as a secretary!</b>\n\n` +
        `<b>User:</b> ${escapeHtml(conn.user.first_name)} (@${escapeHtml(conn.user.username || 'none')})\n` +
        `<b>Chat ID:</b> <code>${conn.user_chat_id}</code>\n` +
        `<b>Status:</b> ${replyStatus}`,
        token,
        ownerId
      );
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }

    // 3. Detect bot added to a group via my_chat_member
    if (update.my_chat_member) {
      const chat = update.my_chat_member.chat;
      const newStatus = update.my_chat_member.new_chat_member?.status;
      const oldStatus = update.my_chat_member.old_chat_member?.status;
      
      if ((newStatus === 'member' || newStatus === 'administrator') && oldStatus !== 'member' && oldStatus !== 'administrator') {
        console.log(`Bot added to group (my_chat_member): ${chat.title} (${chat.id})`);
        
        let linkText = '';
        if (chat.username) {
          linkText = `\n<b>Link:</b> https://t.me/${chat.username}`;
        } else {
          const inviteLink = await getGroupInviteLink(chat.id, token);
          if (inviteLink) {
            linkText = `\n<b>Link:</b> ${inviteLink}`;
          }
        }

        await notifyOwner(`🤖 Bot added to group: <b>${escapeHtml(chat.title)}</b> (ID: <code>${chat.id}</code>)${linkText}`, token, ownerId);
      }
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }

    // Determine the message object (handles message, business_message, or guest_message)
    const message = update.message || update.business_message || update.guest_message;
    if (!message) {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }

    const chatId = message.chat.id;
    const messageId = message.message_id;
    const guestQueryId = message.guest_query_id;
    const businessConnectionId = update.business_message?.business_connection_id;
    let langCode = message.from?.language_code;

    // Prevent duplicate responses when quoting or mentioning the bot in a business chat.
    if (update.business_message) {
      const botInfo = await getBotInfo(token);
      if (botInfo) {
        const isExplicit = hasBotMention(message, botInfo.username) || message.reply_to_message?.from?.id === botInfo.id;
        if (isExplicit) {
          console.log('Skipping business_message explicitly directed to the bot to prevent duplicate response.');
          return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
        }
      }
    }

    console.log(`Processing message_id ${messageId} in chat ${chatId} (guest_query: ${guestQueryId || 'no'}, business_conn: ${businessConnectionId || 'no'})`);

    let fileId = null;
    let isVoice = false;
    let isVideoNote = false;

    const requiresExplicit = !!businessConnectionId;
    const isExplicit = requiresExplicit ? await isMessageDirectedToBot(message, token, true) : true;

    const voiceObj = message.voice || (isExplicit ? message.reply_to_message?.voice : null);
    const audioObj = message.audio && (!requiresExplicit || isExplicit) ? message.audio : (isExplicit ? message.reply_to_message?.audio : null);
    const videoNoteObj = message.video_note || (isExplicit ? message.reply_to_message?.video_note : null);

    const targetObj = voiceObj || audioObj || videoNoteObj;
    const fileSize = targetObj?.file_size || 0;
    if (voiceObj) {
      fileId = voiceObj.file_id;
      isVoice = true;
    } else if (audioObj) {
      fileId = audioObj.file_id;
      isVoice = false;
    } else if (videoNoteObj) {
      fileId = videoNoteObj.file_id;
      isVoice = false;
      isVideoNote = true;
    }

    if (fileId) {
      let responseText = '';
      if (fileSize > MAX_FILE_SIZE) {
        console.warn(`File is too large: ${fileSize} bytes (limit: ${MAX_FILE_SIZE} bytes). Skipping transcription.`);
        responseText = getTranslation(langCode, 'fileTooLarge', { max_mb: MAX_MB });
      } else {
        console.log(`Starting transcription for file_id: ${fileId} (${isVoice ? 'voice' : (isVideoNote ? 'video_note' : 'audio')}, size: ${fileSize} bytes)`);
        const transResult = await transcribeAudio(fileId, config);
        
        if (transResult.ok) {
          console.log(`Transcription completed successfully: "${transResult.text.substring(0, 100)}..."`);
          const header = getTranslation(langCode, 'transcription');
          responseText = `${header}\n\n${escapeHtml(transResult.text)}`;
        } else {
          console.error(`Transcription failed: ${transResult.error}`);
          const header = getTranslation(langCode, 'error');
          responseText = `${header}\n<pre><code class="language-json">${escapeHtml(transResult.error)}</code></pre>`;
        }
      }

      let mode, url, payload;
      if (guestQueryId) {
        console.log(`Responding via answerGuestQuery (guest_query_id: ${guestQueryId})`);
        mode = 'guest';
        url = `https://api.telegram.org/bot${token}/answerGuestQuery`;
        payload = {
          guest_query_id: guestQueryId,
          result: {
            type: 'article',
            id: `transcription_${messageId}_${Date.now()}`,
            title: transResult.ok ? 'Transcription' : 'Error',
            input_message_content: {
              message_text: responseText,
              parse_mode: 'HTML'
            }
          }
        };
      } else if (businessConnectionId) {
        console.log(`Responding via business_connection_id: ${businessConnectionId}`);
        mode = 'secretary';
        url = `https://api.telegram.org/bot${token}/sendMessage`;
        payload = {
          business_connection_id: businessConnectionId,
          chat_id: chatId,
          text: responseText,
          parse_mode: 'HTML',
          reply_to_message_id: messageId
        };
      } else {
        console.log(`Responding via standard sendMessage to chat ${chatId}`);
        mode = 'normal';
        url = `https://api.telegram.org/bot${token}/sendMessage`;
        payload = {
          chat_id: chatId,
          text: responseText,
          parse_mode: 'HTML',
          reply_to_message_id: messageId
        };
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const respData = await response.json();
      console.log(`sendMessage ${mode} response:`, respData);
    } else {
      if (await isMessageDirectedToBot(message, token, !!businessConnectionId)) {
        console.log(`Responding to text-only directed message in chat ${chatId}`);
        
        const hasReply = !!message.reply_to_message;
        const noAudioHeader = hasReply ? getTranslation(langCode, 'noAudio') + '\n\n' : '';
        const helpText = noAudioHeader + getTranslation(langCode, 'help');
        const helpTitle = getTranslation(langCode, 'helpTitle');

        if (guestQueryId) {
          const payload = {
            guest_query_id: guestQueryId,
            result: {
              type: 'article',
              id: `text_response_${messageId}_${Date.now()}`,
              title: helpTitle,
              input_message_content: {
                message_text: helpText,
                parse_mode: 'HTML'
              }
            }
          };
          await fetch(`https://api.telegram.org/bot${token}/answerGuestQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } else if (businessConnectionId) {
          const payload = {
            business_connection_id: businessConnectionId,
            chat_id: chatId,
            text: helpText,
            parse_mode: 'HTML',
            reply_to_message_id: messageId
          };
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } else {
          const payload = {
            chat_id: chatId,
            text: helpText,
            parse_mode: 'HTML',
            reply_to_message_id: messageId
          };
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      } else {
        console.log('No transcribable media and message not directed to the bot');
      }
    }

    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  } catch (error) {
    console.error('ERROR in webhook handler:', error);
    try {
      let targetChatId = ownerId;
      if (!targetChatId && update) {
        const msg = update.message || update.business_message || update.guest_message;
        if (msg && msg.chat && msg.chat.id) {
          targetChatId = msg.chat.id;
        }
      }
      if (targetChatId) {
        await notifyOwner(`🔥 <b>CRITICAL ERROR in Webhook:</b>\n<pre>${escapeHtml(error.stack || error.message || String(error))}</pre>`, token, targetChatId);
      }
    } catch (e) { /* ignore */ }
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
}

/**
 * Normalized Telegram Webhook Setup Handler.
 */
export async function handleSetup(requestInfo, config) {
  const token = config.telegramBotToken;

  if (!token) {
    console.error('telegramBotToken is not defined in config');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: 'Bot token not configured on server' }
    };
  }

  // Authorize: require the request to pass the active bot token as a query parameter
  const requestToken = requestInfo.query?.token;
  if (!requestToken || requestToken !== token) {
    return {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: 'Forbidden: Invalid or missing token parameter' }
    };
  }

  try {
    // Dynamic determination of the protocol and host from request headers
    const proto = getHeader(requestInfo.headers, 'x-forwarded-proto') || 'https';
    const host = getHeader(requestInfo.headers, 'host');
    
    // Custom domain/base URL fallback
    const baseUrl = config.webhookBaseUrl || `${proto}://${host}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook`;

    // Compute the SHA-256 hash of the bot token to use as x-telegram-bot-api-secret-token
    const webhookSecret = await sha256(token);

    console.log(`Setting up webhook to: ${webhookUrl}`);

    const payload = {
      url: webhookUrl,
      allowed_updates: [
        'message',
        'business_connection',
        'business_message',
        'edited_business_message',
        'guest_message',
        'my_chat_member'
      ],
      secret_token: webhookSecret
    };

    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await telegramRes.json();

    if (data.ok) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          ok: true,
          message: 'Webhook registered successfully',
          webhook_url: webhookUrl,
          telegram_response: data
        }
      };
    } else {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          ok: false,
          error: 'Telegram API returned an error',
          telegram_response: data
        }
      };
    }
  } catch (error) {
    console.error('Error registering webhook:', error);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: {
        ok: false,
        error: `Internal server exception: ${error.message || error}`
      }
    };
  }
}

/**
 * Create a standard config object resolving environment variables across different runtimes.
 */
export function createConfig(env = {}) {
  const getEnv = (key) => {
    if (env && typeof env === 'object' && env[key] !== undefined) return env[key];
    if (typeof Deno !== 'undefined' && Deno.env) return Deno.env.get(key);
    if (typeof process !== 'undefined' && process.env) return process.env[key];
    return undefined;
  };
  return {
    telegramBotToken: getEnv("TELEGRAM_BOT_TOKEN"),
    whisperApiKey: getEnv("WHISPER_API_KEY") || getEnv("GROQ_API_KEY") || getEnv("OPENAI_API_KEY") || getEnv("API_KEY"),
    whisperApiBase: getEnv("WHISPER_API_BASE"),
    whisperModel: getEnv("WHISPER_MODEL"),
    whisperLanguage: getEnv("WHISPER_LANGUAGE"),
    whisperPrompt: getEnv("WHISPER_PROMPT"),
    ownerChatId: getEnv("OWNER_CHAT_ID"),
    webhookBaseUrl: getEnv("WEBHOOK_BASE_URL")
  };
}

/**
 * Unified health check handler verifying runtime, variables configuration, crypto operations, Deno integration, and Telegram API status.
 */
export async function handleHealthCheck(config) {
  let runtime = 'unknown';
  if (typeof Deno !== 'undefined') {
    runtime = (Deno.env && Deno.env.get('VAL_TOWN_API_KEY')) ? 'val-town' : 'deno-deploy';
  } else if (typeof process !== 'undefined' && process.env) {
    runtime = process.env.NETLIFY ? 'netlify' : 'vercel/node';
  } else {
    runtime = 'cloudflare-workers';
  }

  let cryptoOk = false;
  let cryptoError = null;
  try {
    const hash = await sha256("test");
    cryptoOk = (hash === "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
  } catch (e) {
    cryptoError = e.message || String(e);
  }

  let aacOk = false;
  try {
    const dummy = new Uint8Array([0xFF, 0xF1]);
    aacOk = isAdtsAac(dummy);
  } catch (e) {
    // Ignore error
  }

  let telegramOk = false;
  let botDetails = null;
  let telegramError = null;
  if (config.telegramBotToken) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/getMe`);
      const data = await res.json();
      if (data.ok) {
        telegramOk = true;
        botDetails = {
          id: data.result.id,
          username: data.result.username,
          first_name: data.result.first_name
        };
      } else {
        telegramError = `Telegram API returned error: ${JSON.stringify(data)}`;
      }
    } catch (e) {
      telegramError = e.message || String(e);
    }
  } else {
    telegramError = "Missing telegramBotToken";
  }

  const responseBody = {
    status: (cryptoOk && aacOk && telegramOk) ? 'healthy' : 'degraded',
    version: '1.0.0',
    runtime: runtime,
    config_checks: {
      telegramBotToken: !!config.telegramBotToken,
      whisperApiKey: !!config.whisperApiKey,
      ownerChatId: !!config.ownerChatId,
      whisperModel: config.whisperModel || 'whisper-large-v3',
      whisperApiBase: config.whisperApiBase || 'https://api.groq.com/openai/v1'
    },
    tests: {
      crypto: { ok: cryptoOk, error: cryptoError },
      aac_detection: { ok: aacOk },
      telegram_connectivity: { ok: telegramOk, bot: botDetails, error: telegramError }
    }
  };

  return {
    status: responseBody.status === 'healthy' ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
    body: responseBody
  };
}

/**
 * Unified Router to dispatch requests to specific handlers.
 */
export async function dispatchRoute(requestInfo, config, ctx) {
  const pathname = requestInfo.urlPath || '';
  
  if (pathname === '/api/health' || pathname === '/health') {
    return await handleHealthCheck(config);
  } else if (pathname === '/api/webhook' || pathname === '/webhook' || (requestInfo.method === 'POST' && pathname === '/')) {
    return await handleWebhook(requestInfo, config, ctx);
  } else if (pathname === '/api/setup' || pathname === '/setup' || (requestInfo.method === 'GET' && pathname === '/')) {
    if (requestInfo.query && requestInfo.query.token) {
      return await handleSetup(requestInfo, config);
    } else {
      return { 
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Transcribot Setup: Please call this URL with "?token=YOUR_BOT_TOKEN" in the query string to register the webhook.'
      };
    }
  } else {
    return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not Found' };
  }
}

/**
 * Unified request handler for modern standard Web environments (Cloudflare Workers, Deno Deploy, Val Town).
 */
export async function handleWebRequest(request, env = {}, ctx = null) {
  const url = new URL(request.url);
  const config = createConfig(env);

  let body = null;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (e) {
      console.warn('Request body is not JSON or empty:', e.message);
    }
  }

  const query = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const requestInfo = {
    method: request.method,
    headers: headers,
    body: body,
    query: query,
    urlPath: url.pathname
  };

  const responseInfo = await dispatchRoute(requestInfo, config, ctx);

  const responseBody = typeof responseInfo.body === 'object'
    ? JSON.stringify(responseInfo.body)
    : responseInfo.body;

  return new Response(responseBody, {
    status: responseInfo.status,
    headers: responseInfo.headers
  });
}

/**
 * Unified request handler for Node.js Vercel/HTTP style environments.
 */
export async function handleVercelRequest(req, res, env = {}) {
  const config = createConfig(env);
  const urlObj = new URL(req.url, 'http://localhost');
  
  const requestInfo = {
    method: req.method,
    headers: req.headers,
    body: req.body,
    query: req.query,
    urlPath: urlObj.pathname
  };

  const responseInfo = await dispatchRoute(requestInfo, config, null);

  res.status(responseInfo.status);
  if (typeof res.setHeader === 'function') {
    for (const [key, value] of Object.entries(responseInfo.headers || {})) {
      res.setHeader(key, value);
    }
  }
  return res.send(responseInfo.body);
}

/**
 * Unified request handler for Netlify Functions.
 */
export async function handleNetlifyRequest(event, context, env = {}) {
  const config = createConfig(env);

  let body = null;
  if (event.body) {
    try {
      body = event.isBase64Encoded
        ? JSON.parse(globalThis.Buffer.from(event.body, 'base64').toString('utf8'))
        : JSON.parse(event.body);
    } catch (e) {
      console.warn('Failed to parse Netlify body:', e.message);
    }
  }

  const requestInfo = {
    method: event.httpMethod,
    headers: event.headers,
    body: body,
    query: event.queryStringParameters || {},
    urlPath: event.path || ''
  };

  // For Netlify, the context object can be passed as ctx to handle background functions
  const responseInfo = await dispatchRoute(requestInfo, config, context);

  return {
    statusCode: responseInfo.status,
    headers: responseInfo.headers || {},
    body: typeof responseInfo.body === 'object' ? JSON.stringify(responseInfo.body) : responseInfo.body
  };
}

