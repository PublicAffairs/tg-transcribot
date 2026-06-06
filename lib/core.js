// lib/core.js
// Core Engine for Telegram Voice Transcribot

import { isAdtsAac } from './wav-wrapper.js';
import { getTranslation, getMarkdown, getUserLang } from './localize.js';
import { sha256, getHeader, callTelegram, setDebugOwnerId, escapeMarkdownV2, escapeMarkdownV2Code, buildTranscriptionMessages } from './utils.js';
import { transcribeAudio, isUnsupportedVideoFile, DEFAULT_API_BASE } from './transcriber.js';
import { parseWebhookConfig, buildWebhookSetup, getWebhookConfig, updateWebhookConfig } from './webhook-settings.js';
import { handleCommand, setupBotProfile, setupBotAvatar } from './commands.js';
import { openMenu, configureMenuFramework, handleCallbackQuery } from './framework/menu.js';
import { getAvailableModels } from './menus.js';
import './dashboard.js';
import { registerHttpRoute } from './framework/router.js';
import { configureConfigBuilder } from './framework/adapters.js';

configureMenuFramework({
  loadSettings: getWebhookConfig,
  saveSettings: updateWebhookConfig,
  getUserLang,
  getTranslation
});

configureConfigBuilder(createConfig);

registerHttpRoute('/api/health', handleHealthCheck);
registerHttpRoute('/health', handleHealthCheck);
registerHttpRoute('/api/webhook', handleWebhook);
registerHttpRoute('/webhook', handleWebhook);
registerHttpRoute('/api/setup', handleSetup);
registerHttpRoute('/setup', handleSetup);

// File size limits in bytes
const MAX_MB = 20;
const MAX_FILE_SIZE = MAX_MB * 1024 * 1024;


// Cache for bot information to avoid duplicate getMe calls
let botId = null;
let botUsername = null;

// Default Webhook Settings
const DEFAULT_WEBHOOK_SETTINGS = {
  groups: true,
  guest: true,
  secretary: true,
  lang: 'auto',
  langbot: 'auto',
  model: '',
  notify_add: true,
  notify_conn: true,
  notify_err: true,
  verbose: false,
  prompt: '',
  owner: ''
};


/**
 * Get cached or fresh bot username and ID.
 */
async function getBotInfo(token) {
  if (botUsername && botId) return { username: botUsername, id: botId };
  try {
    const data = await callTelegram(token, 'getMe', {});
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
export function hasBotMention(message, botUser) {
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
 * Check if the message is directed to the bot (either via slash command, mention, or reply in group).
 */
export async function isMessageDirectedToBot(message, token, isBusiness = false) {
  if (!message) return false;

  // 1. If it's a private chat, all messages are directed to the bot (unless in business mode)
  if (!isBusiness && message.chat && message.chat.type === 'private') {
    return true;
  }

  const text = message.text || '';

  // 2. Check if the message starts with a command for this bot specifically
  if (text.startsWith('/')) {
    const firstWord = text.split(/\s+/)[0];
    if (firstWord.includes('@')) {
      const botInfo = await getBotInfo(token);
      const botUser = botInfo?.username;
      if (botUser && firstWord.endsWith(`@${botUser}`)) {
        return true;
      }
      return false; // Command for another bot
    }
    return true; // Simple slash command
  }

  // 3. Check for mentions of the bot username or replies
  const botInfo = await getBotInfo(token);
  if (botInfo) {
    if (hasBotMention(message, botInfo.username)) {
      return true;
    }
    if (message.reply_to_message && message.reply_to_message.from && message.reply_to_message.from.id === botInfo.id) {
      return true;
    }
  }

  // 4. Business connections/Secretary mode messages
  // We do not treat generic business connection messages as directed to the bot
  // unless they are explicit commands or mentions (already handled above).
  if (isBusiness) {
    return false;
  }

  return false;
}

/**
 * Send alert to the bot owner.
 */
async function notifyOwner(text, token, ownerId) {
  if (!ownerId) return;
  try {
    const payload = {
      chat_id: ownerId,
      text: text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    };
    let res = await callTelegram(token, 'sendMessage', payload);
    if (!res.ok) {
      const errorText = res.description || res.error || 'Unknown error';
      console.error('Failed to notify owner:', errorText);
      if (payload.parse_mode === 'MarkdownV2' && errorText.toLowerCase().includes("can't parse entities")) {
        console.log('MarkdownV2 parsing failed in notifyOwner. Retrying without parse_mode...');
        delete payload.parse_mode;
        res = await callTelegram(token, 'sendMessage', payload);
      }
    }
  } catch (e) {
    console.error('Failed to notify owner:', e);
  }
}

/**
 * Export group invite link.
 */
async function getGroupInviteLink(chatId, token) {
  try {
    const data = await callTelegram(token, 'exportChatInviteLink', { chat_id: chatId });
    if (data.ok) {
      return data.result;
    }
  } catch (e) {
    console.error('Failed to export chat invite link:', e);
  }
  return null;
}

/**
 * Send response helper.
 */
async function sendReply(token, update, chatMessage, text, replyToMessage) {
  const chatId = chatMessage.chat.id;
  // Quote the file-containing message if provided; otherwise quote the command message itself.
  const messageId = (replyToMessage || chatMessage).message_id;
  const guestQueryId = chatMessage.guest_query_id || update.guest_message?.guest_query_id;
  const businessConnectionId = update.business_message?.business_connection_id;

  let url, payload;
  if (guestQueryId) {
    url = `https://api.telegram.org/bot${token}/answerGuestQuery`;
    payload = {
      guest_query_id: guestQueryId,
      result: {
        type: 'article',
        id: `reply_${messageId}_${Date.now()}`,
        title: 'Response',
        input_message_content: {
          message_text: text,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true
        }
      }
    };
  } else {
    url = `https://api.telegram.org/bot${token}/sendMessage`;
    payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'MarkdownV2',
      reply_to_message_id: messageId,
      disable_web_page_preview: true
    };
    if (businessConnectionId) {
      payload.business_connection_id = businessConnectionId;
    }
  }

  let attempts = 0;
  let response;
  while (attempts < 3) {
    attempts++;
    response = await callTelegram(token, url.split('/').pop(), payload);
    if (response.ok) {
      return response;
    }

    const errorText = response.description || response.error || 'Unknown error';
    console.error(`Failed to sendReply via ${url.split('/').pop()} (attempt ${attempts}):`, errorText);

    // Fallback 2: If it's a MarkdownV2 formatting error, retry as plain text
    if (guestQueryId) {
      if (payload.result.input_message_content.parse_mode === 'MarkdownV2' && errorText.toLowerCase().includes("can't parse entities")) {
        console.log('MarkdownV2 parsing failed in guest query. Retrying without parse_mode...');
        delete payload.result.input_message_content.parse_mode;
        continue;
      }
    } else {
      if (payload.parse_mode === 'MarkdownV2' && errorText.toLowerCase().includes("can't parse entities")) {
        console.log('MarkdownV2 parsing failed. Retrying without parse_mode...');
        delete payload.parse_mode;
        continue;
      }
    }

    // If it's any other error, check if it's systemic or user-space
    const isUserSpace = errorText.toLowerCase().includes("chat not found") || 
                        errorText.toLowerCase().includes("blocked by the user") ||
                        errorText.toLowerCase().includes("user is deactivated") ||
                        errorText.toLowerCase().includes("is not a member of the");
    if (!isUserSpace) {
      throw new Error(`Telegram delivery failed: ${errorText}`);
    }
    
    // For normal user-space errors (blocked/deleted chat), stop retrying and return the failed response
    return response;
  }
  return response;
}

/**
 * Handle initial setup greeting for the owner.
 */
export async function sendOwnerGreeting(token, ownerId, baseUrl, userLangCode) {
  const settings = await getWebhookConfig(token);
  settings.owner = ownerId;
  settings.groups = true;
  settings.guest = true;
  settings.secretary = true;
  
  await updateWebhookConfig(token, baseUrl, settings);

  const lang = getUserLang(settings, userLangCode);
  const welcomeText = getMarkdown(lang, 'welcomeMessage', { dashboard_url: baseUrl });
  
  await callTelegram(token, 'sendMessage', {
    chat_id: ownerId,
    text: welcomeText,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true
  });

  const botInfoRes = await callTelegram(token, 'getMe', {});
  const botInfo = botInfoRes.ok ? botInfoRes.result : null;
  await openMenu('mode', token, ownerId, settings, lang, { token, botInfo });

  await setupBotProfile(token);
  await setupBotAvatar(token);
}

// Keep track of recently processed update IDs to prevent duplicate execution
// during Telegram webhook retries caused by Vercel cold starts or API rate limits.
const processedUpdates = new Set();

export async function handleCallbackQueryUpdate(callbackQuery, ctx) {
  await handleCallbackQuery(callbackQuery, ctx.config, ctx.baseUrl, (cbQuery) => {
    return {
      availableModels: getAvailableModels(ctx.config),
      userLangCode: cbQuery.from?.language_code
    };
  });
  return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
}

export async function handleBusinessConnectionUpdate(conn, ctx) {
  const activeSettings = await getWebhookConfig(ctx.token);
  const activeOwnerId = activeSettings.owner || ctx.ownerId;
  if (!activeOwnerId || !activeSettings.secretary) {
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
  console.log('Business connection update:', conn);
  
  if (activeSettings.notify_conn) {
    const notifyLang = activeSettings.langbot || 'en';
    const key = conn.is_enabled ? 'notifySecConnected' : 'notifySecDisconnected';
    const replyStatusStr = conn.can_reply
      ? getTranslation(notifyLang, 'statusCanReply')
      : getTranslation(notifyLang, 'statusCannotReply');
    const userDisplayName = conn.user.first_name || 'User';
    const text = getMarkdown(notifyLang, key, {
      user: userDisplayName,
      username: conn.user.username || 'none',
      chat_id: String(conn.user_chat_id),
      can_reply: replyStatusStr
    });
    await notifyOwner(text, ctx.token, activeOwnerId);
  }
  return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
}

export async function handleMyChatMemberUpdate(myChatMember, ctx) {
  const { ownerId, settings, token } = ctx;
  if (!ownerId || !settings.groups) {
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
  const chat = myChatMember.chat;
  const newStatus = myChatMember.new_chat_member?.status;
  const oldStatus = myChatMember.old_chat_member?.status;
  
  if ((newStatus === 'member' || newStatus === 'administrator') && oldStatus !== 'member' && oldStatus !== 'administrator') {
    console.log(`Bot added to group (my_chat_member): ${chat.title} (${chat.id})`);
    
    if (settings.notify_add) {
      let linkText = '';
      const notifyLang = settings.langbot || 'en';
      const label = getTranslation(notifyLang, 'inviteLink');
      if (chat.username) {
        linkText = `\n*${escapeMarkdownV2(label)}:* https://t\\.me/${escapeMarkdownV2(chat.username)}`;
      } else {
        const inviteLink = await getGroupInviteLink(chat.id, token);
        if (inviteLink) {
          linkText = `\n*${escapeMarkdownV2(label)}:* ${escapeMarkdownV2(inviteLink)}`;
        }
      }
      const text = getMarkdown(notifyLang, 'notifyAddedGroup', {
        title: chat.title,
        chat_id: String(chat.id),
        link: ''
      }) + linkText;
      await notifyOwner(text, token, ownerId);
    }
  }
  return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
}

export async function handleMessageUpdate(message, ctx) {
  const { update, config, token, baseUrl, executionCtx } = ctx;
  let { ownerId, settings } = ctx;
  const chatId = message.chat.id;
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  const businessConnectionId = update.business_message?.business_connection_id;

  // 6. Enforce OWNER_CHAT_ID security restrictions & dynamic registration
  if (!ownerId) {
    // If owner is not set, reject groups/guest/secretary
    if (isGroup || update.guest_message || businessConnectionId) {
      console.log('Ignoring group/guest/business message because no owner is registered.');
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }
    if (message.chat.type === 'private') {
      if (config.allowedOwner) {
        const allowed = String(config.allowedOwner).trim().toLowerCase().replace(/^@/, '');
        const senderId = String(message.from?.id || '');
        const senderUsername = (message.from?.username || '').toLowerCase();
        
        if (allowed !== senderId && allowed !== senderUsername) {
          console.log(`Ignoring private message from unauthorized user ${senderId} (@${senderUsername}) (allowed owner is ${config.allowedOwner}).`);
          return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
        }
      }

      ownerId = String(chatId);
      config.ownerChatId = ownerId;
      console.log(`Registering chat ${ownerId} as the dynamic owner.`);
      
      const registerOwnerTask = async () => {
        try {
          await sendOwnerGreeting(token, ownerId, baseUrl, message.from?.language_code);
        } catch (e) {
          console.error('Failed to automatically register owner:', e);
        }
      };

      if (executionCtx?.waitUntil) {
        executionCtx.waitUntil(registerOwnerTask());
      } else {
        await registerOwnerTask();
      }
    } else {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }
  } else {
    config.ownerChatId = ownerId;
  }

  // 7. Enforce settings-based restrictions
  if (isGroup && !settings.groups) {
    console.log('Group messages are disabled in settings. Ignoring.');
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  if (businessConnectionId || update.guest_message) {
    settings = await getWebhookConfig(token);
  }

  if (businessConnectionId && !settings.secretary) {
    console.log('Secretary mode is disabled in settings. Ignoring.');
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
  if (update.guest_message && !settings.guest) {
    console.log('Guest mode is disabled in settings. Ignoring.');
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  // Prevent duplicate responses when quoting or mentioning the bot in a business chat
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

  let langCode = message.from?.language_code;

  const isPrivate = message.chat.type === 'private';
  const msgText = message.text || '';
  const msgCaption = message.caption || '';
  const isProcessCmd = /^\/process(?:@\S+)?\s*$/i.test(msgText);

  // /prompt command source rules (3 cases):
  // Case 1: message has no file but replies to one → use only message.text (ignore caption).
  // Case 2: message itself has a file → use message.text OR caption (if not a forwarded message).
  // Case 3: forwarded message → never use caption for commands.
  const hasDirectFile = !!(message.voice || message.audio || message.video_note || message.video || message.document);
  const isForwarded = !!(message.forward_from || message.forward_origin || message.forward_from_chat);
  const cmdSource = (hasDirectFile && !isForwarded) ? (msgText || msgCaption) : msgText;

  const promptMatch = cmdSource.trim().match(/^\/prompt(?:@\S+)?(?:\s+([\s\S]*))?$/i);
  const isPromptCmd = !!promptMatch;
  let overridePrompt;
  if (isPromptCmd) {
    overridePrompt = promptMatch[1] ? promptMatch[1].trim() : '';
  }

  // Business connections require explicit addressing (mention or reply to bot)
  const requiresExplicit = !!businessConnectionId;
  const isExplicit = requiresExplicit ? await isMessageDirectedToBot(message, token, true) : true;

  // Reply audio is picked up in private chats always, or when /process or /prompt is used in non-private chats.
  // Direct (non-reply) audio is always processed regardless.
  const canPickReplyAudio = isPrivate || isProcessCmd || isPromptCmd;

  // In secretary mode (business messages), we ONLY process voice messages and video notes (circles)
  const isBusinessMsg = !!businessConnectionId;

  // Check voice, audio, video_note, video, document.
  // Track which message physically contains the file so we can cite it correctly in the reply.
  const voiceFromReply = canPickReplyAudio && isExplicit ? message.reply_to_message?.voice : null;
  const voiceObj = message.voice || voiceFromReply;
  const audioFromReply = (!isBusinessMsg && canPickReplyAudio && isExplicit) ? message.reply_to_message?.audio : null;
  const audioObj = (!isBusinessMsg && message.audio && (!requiresExplicit || isExplicit)) ? message.audio : audioFromReply;
  const videoNoteFromReply = canPickReplyAudio && isExplicit ? message.reply_to_message?.video_note : null;
  const videoNoteObj = message.video_note || videoNoteFromReply;
  const videoFromReply = (!isBusinessMsg && canPickReplyAudio && isExplicit) ? message.reply_to_message?.video : null;
  const videoObj = (!isBusinessMsg && message.video && (!requiresExplicit || isExplicit)) ? message.video : videoFromReply;
  const documentFromReply = (!isBusinessMsg && canPickReplyAudio && isExplicit) ? message.reply_to_message?.document : null;
  const documentObj = (!isBusinessMsg && message.document && (!requiresExplicit || isExplicit)) ? message.document : documentFromReply;

  // The message that physically contains the file — used as the reply target so the bot cites the audio.
  // Case 1 (reply-to): file is in reply_to_message. Case 2 (direct): file is in message itself.
  const fileSourceMessage = (voiceFromReply || audioFromReply || videoNoteFromReply || videoFromReply || documentFromReply)
    ? message.reply_to_message
    : message;

  let fileId = null;
  let fileSize = 0;
  let fileDuration = 0;
  let fileType = '';
  let isInvalidDocument = false;
  let isUnsupportedVideo = false;

  if (voiceObj) {
    fileId = voiceObj.file_id;
    fileSize = voiceObj.file_size || 0;
    fileDuration = voiceObj.duration || 0;
    fileType = 'voice';
  } else if (audioObj) {
    fileId = audioObj.file_id;
    fileSize = audioObj.file_size || 0;
    fileDuration = audioObj.duration || 0;
    fileType = 'audio';
  } else if (videoNoteObj) {
    fileId = videoNoteObj.file_id;
    fileSize = videoNoteObj.file_size || 0;
    fileDuration = videoNoteObj.duration || 0;
    fileType = 'video_note';
  } else if (videoObj) {
    const mime = videoObj.mime_type || '';
    const name = videoObj.file_name || '';
    if (isUnsupportedVideoFile(mime, name)) {
      isUnsupportedVideo = true;
    } else {
      fileId = videoObj.file_id;
      fileSize = videoObj.file_size || 0;
      fileDuration = videoObj.duration || 0;
      fileType = 'video';
    }
  } else if (documentObj) {
    // Validate document file format
    const mime = documentObj.mime_type || '';
    const name = documentObj.file_name || '';
    const isSupportedMedia = mime.startsWith('audio/') || 
                             mime.startsWith('video/') || 
                             /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|oga|flac|amr|awb|gsm|caf|aac|al|alaw|ul|ulaw|mulaw)$/i.test(name);
    if (isSupportedMedia) {
      if (isUnsupportedVideoFile(mime, name)) {
        isUnsupportedVideo = true;
      } else {
        fileId = documentObj.file_id;
        fileSize = documentObj.file_size || 0;
        fileType = 'document';
      }
    } else {
      isInvalidDocument = true;
    }
  }

  const currentLang = getUserLang(settings, langCode);

  if (isUnsupportedVideo) {
    const errorText = getMarkdown(currentLang, 'unsupportedVideo');
    await sendReply(token, update, message, errorText, fileSourceMessage !== message ? fileSourceMessage : undefined);
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  if (isInvalidDocument) {
    const errorText = getMarkdown(currentLang, 'notAudioFile');
    await sendReply(token, update, message, errorText, fileSourceMessage !== message ? fileSourceMessage : undefined);
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }



  const processTask = async () => {
    try {
      // Immediately show "typing..." status to the user
      callTelegram(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

      if (fileId) {
        let responseText;
        if (!config.whisperApiKey) {
          console.warn('Whisper API key is missing. Skipping transcription.');
          responseText = getMarkdown(currentLang, 'apiKeyMissing');
          await sendReply(token, update, message, responseText, fileSourceMessage !== message ? fileSourceMessage : undefined);
        } else if (fileSize > MAX_FILE_SIZE) {
          console.warn(`File is too large: ${fileSize} bytes. Skipping.`);
          responseText = getMarkdown(currentLang, 'fileTooLarge', { max_mb: MAX_MB });
          await sendReply(token, update, message, responseText, fileSourceMessage !== message ? fileSourceMessage : undefined);
        } else {
          console.log(`Starting transcription for file_id: ${fileId} (type: ${fileType})`);
          const startTime = Date.now();
          const transResult = await transcribeAudio(fileId, config, settings, overridePrompt);
          const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
          
          if (transResult.ok) {
            const isGuest = !!(message.guest_query_id || update.guest_message?.guest_query_id);
            const messages = buildTranscriptionMessages(transResult.text, {
              header: getMarkdown(currentLang, 'transcription'),
              isGuest,
              verbose: settings.verbose,
              fileType,
              fileSize,
              fileDuration,
              durationSec,
              actualFormat: transResult.actualFormat,
              signatureFormat: transResult.signatureFormat,
              wasConverted: transResult.wasConverted,
              whisperDuration: transResult.whisperDuration
            });
            for (let i = 0; i < messages.length; i++) {
              let chunkResponseText = messages[i];
              
              // For subsequent chunks, clear the guest_query_id to send regular messages (as answerGuestQuery can only be called once)
              const currentUpdate = i === 0 ? update : (() => {
                const nextUpdate = { ...update };
                if (nextUpdate.guest_message) {
                  nextUpdate.guest_message = { ...nextUpdate.guest_message };
                  delete nextUpdate.guest_message.guest_query_id;
                }
                return nextUpdate;
              })();
              
              const currentMessage = i === 0 ? message : (() => {
                const nextMessage = { ...message };
                delete nextMessage.guest_query_id;
                return nextMessage;
              })();
              
              await sendReply(token, currentUpdate, currentMessage, chunkResponseText, fileSourceMessage !== message ? fileSourceMessage : undefined);
            }
          } else {
            console.error(`Transcription failed: ${transResult.error}`);
            if (transResult.error === 'UNSUPPORTED_VIDEO_FORMAT') {
              responseText = getMarkdown(currentLang, 'unsupportedVideo');
            } else if (transResult.error === 'UNSUPPORTED_AUDIO_FORMAT') {
              responseText = getMarkdown(currentLang, 'notAudioFile');
            } else {
              const header = getMarkdown(currentLang, 'error');
              responseText = `${header}\n\`\`\`json\n${escapeMarkdownV2Code(transResult.error)}\n\`\`\``;
              
              // Notify owner on transcription error if configured
              if (settings.notify_err) {
                const notifyLang = settings.langbot || 'en';
                const text = getMarkdown(notifyLang, 'notifyTransError', {
                  chat_id: String(chatId),
                  error: transResult.error
                });
                await notifyOwner(text, token, ownerId);
              }
            }
            await sendReply(token, update, message, responseText, fileSourceMessage !== message ? fileSourceMessage : undefined);
          }
        }
      } else {
        // /process was used but no audio found in the replied-to message
        if (isProcessCmd) {
          const currentLang = getUserLang(settings, langCode);
          await sendReply(token, update, message, getMarkdown(currentLang, 'noAudio'));
        } else if (await isMessageDirectedToBot(message, token, !!businessConnectionId)) {
          // Hand off text message to command processor
          await handleCommand(message, config, baseUrl);
        }
      }
    } catch (e) {
      console.error('Error in deferred message update task:', e);
      
      const errorMsg = e.message || String(e);
      const isUserBlocked = errorMsg.toLowerCase().includes("blocked by the user") ||
                            errorMsg.toLowerCase().includes("chat not found") ||
                            errorMsg.toLowerCase().includes("user is deactivated") ||
                            errorMsg.toLowerCase().includes("is not a member of the");
                            
      // 1. Notify the user about the error (sent directly to chat without reply targets)
      if (!isUserBlocked) {
        try {
          const userErrHeader = getMarkdown(currentLang, 'error');
          const errorStack = e.stack || errorMsg;
          const userErrText = `${userErrHeader}\n\`\`\`\n${escapeMarkdownV2Code(errorStack)}\n\`\`\``;
          
          await sendReply(token, update, message, userErrText, undefined).catch(err => {
            console.error('Failed to deliver error message to user:', err.message || err);
          });
        } catch (userErr) {
          console.error('Failed to format error message for user:', userErr);
        }
      }

      // 2. Notify the owner as configured
      try {
        if (settings && settings.notify_err && ownerId) {
          const errorStack = e.stack || errorMsg;
          const text = `⚠️ *Critical Bot Error during update processing:*\n\`\`\`\n${escapeMarkdownV2Code(errorStack)}\n\`\`\``;
          await notifyOwner(text, token, ownerId);
        }
      } catch (err) {
        console.error('Failed to notify owner about critical error:', err);
      }
    }
  };

  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(processTask());
  } else {
    await processTask();
  }

  return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
}

export const UPDATE_ROUTER = {
  callback_query: handleCallbackQueryUpdate,
  business_connection: handleBusinessConnectionUpdate,
  my_chat_member: handleMyChatMemberUpdate,
  message: handleMessageUpdate,
  business_message: handleMessageUpdate,
  guest_message: handleMessageUpdate
};

/**
 * Handle incoming webhook request.
 */
export async function handleWebhook(requestInfo, config, executionCtx) {
  const token = config.telegramBotToken;

  if (!token) {
    console.error('telegramBotToken is missing in config');
    return { status: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Bot token not configured' };
  }

  const headers = requestInfo.headers || {};
  const update = requestInfo.body;

  let settings = null;
  let ownerId = null;

  try {
    // 1. Verify Webhook Secret
    const expectedSecret = await sha256(token);
    const receivedSecret = getHeader(headers, 'x-telegram-bot-api-secret-token');
    if (expectedSecret && receivedSecret !== expectedSecret) {
      console.error('Unauthorized request: webhook secret mismatch');
      return { status: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Forbidden' };
    }

    if (!update || !update.update_id) {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }

    // Deduplicate updates from Telegram
    if (processedUpdates.has(update.update_id)) {
      console.log(`[Deduplicator] Ignoring duplicate update_id: ${update.update_id}`);
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }
    processedUpdates.add(update.update_id);
    if (processedUpdates.size > 1000) {
      const oldest = processedUpdates.values().next().value;
      processedUpdates.delete(oldest);
    }

    console.log('--- UPDATE RECEIVED ---', JSON.stringify(update));

    const proto = getHeader(headers, 'x-forwarded-proto') || 'https';
    const host = getHeader(headers, 'host');
    const baseUrl = config.webhookBaseUrl || `${proto}://${host}`;

    // 2. Parse current settings from the request query string (very fast, offline)
    settings = parseWebhookConfig({ url: '?' + new URLSearchParams(requestInfo.query || {}).toString() });
    ownerId = settings.owner;
    if (ownerId) {
      config.ownerChatId = ownerId;
      setDebugOwnerId(ownerId);
    }

    const ctx = {
      token,
      config,
      baseUrl,
      settings,
      ownerId,
      update,
      executionCtx
    };

    // Route dynamically based on the update keys
    for (const key of Object.keys(update)) {
      const handler = UPDATE_ROUTER[key];
      if (handler) {
        return await handler(update[key], ctx);
      }
    }

    // Unhandled update type
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };

  } catch (error) {
    console.error('ERROR in webhook handler:', error);
    try {
      if (ownerId) {
        const notifyLang = settings?.langbot || 'en';
        const text = getMarkdown(notifyLang, 'notifyCriticalError', {
          error: error.stack || error.message || String(error)
        });
        await notifyOwner(text, token, ownerId);
      }
    } catch { /* ignore */ }
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

  const requestToken = requestInfo.query?.token || requestInfo.body?.token;
  if (!requestToken || requestToken !== token) {
    return {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: 'Forbidden: Invalid or missing token parameter' }
    };
  }

  try {
    const proto = getHeader(requestInfo.headers, 'x-forwarded-proto') || 'https';
    const host = getHeader(requestInfo.headers, 'host');
    const baseUrl = config.webhookBaseUrl || `${proto}://${host}`;
    
    // Fetch current webhook settings to preserve options
    let currentSettings = {};
    try {
      const infoData = await callTelegram(token, 'getWebhookInfo', {});
      if (infoData.ok && infoData.result?.url) {
        currentSettings = parseWebhookConfig(infoData.result);
      }
    } catch (e) {
      console.warn('Failed to retrieve current webhook info:', e);
    }

    const action = requestInfo.query?.action || requestInfo.body?.action;
    if (action === 'reset_owner') {
      currentSettings.owner = '';
      const secretToken = await sha256(token);
      const webhookSetup = buildWebhookSetup(baseUrl, token, currentSettings, secretToken);
      
      const data = await callTelegram(token, 'setWebhook', webhookSetup);
      if (data.ok) {
        return {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: { ok: true, message: 'Owner Chat ID has been successfully reset.' }
        };
      } else {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: { ok: false, error: 'Telegram API error: ' + (data.error || JSON.stringify(data)) }
        };
      }
    }

    // Standard Setup Flow: merge with defaults
    const defaultSettings = { ...DEFAULT_WEBHOOK_SETTINGS };
    // Override defaults with any existing settings
    Object.keys(currentSettings).forEach(k => {
      if (currentSettings[k] !== undefined && currentSettings[k] !== '') {
        defaultSettings[k] = currentSettings[k];
      }
    });
    
    const secretToken = await sha256(token);
    const webhookSetup = buildWebhookSetup(baseUrl, token, defaultSettings, secretToken);
    console.log(`Registering webhook: ${webhookSetup.url}`);

    const data = await callTelegram(token, 'setWebhook', webhookSetup);
    
    if (data.ok) {
      // Also update bot commands menu
      try {
        const { setupBotProfile } = await import('./commands.js');
        await setupBotProfile(token);
      } catch (e) {
        console.error('Failed to setup bot profile during webhook registration:', e);
      }

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          ok: true,
          message: 'Webhook registered successfully',
          webhook_url: webhookSetup.url,
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
        error: `Internal setup exception: ${error.message || error}`
      }
    };
  }
}

/**
 * Create a standard config object.
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
    whisperApiKey: getEnv("WHISPER_API_KEY"),
    whisperApiBase: getEnv("WHISPER_API_BASE"),
    whisperModels: getEnv("WHISPER_MODELS"),
    whisperPrompt: getEnv("WHISPER_PROMPT"),
    ownerChatId: undefined, // Dynamically parsed from webhook URL
    webhookBaseUrl: getEnv("WEBHOOK_BASE_URL"),
    allowedOwner: getEnv("OWNER"),
    version: getEnv("BOT_VERSION") || '0.0.0'
  };
}

/**
 * Unified health check handler.
 */
export async function handleHealthCheck(requestInfo = {}, config = {}) {
  let runtime;
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
  } catch {
    // Ignore error
  }

  // Token authentication check for external health queries
  const requestToken = requestInfo.query?.token;
  const isAuthorized = requestToken && requestToken === config.telegramBotToken;

  let telegramOk = false;
  let botDetails = null;
  let webhookDetails = null;
  let telegramError = null;

  if (isAuthorized) {
    if (config.telegramBotToken) {
      try {
        const [meRes, webhookRes] = await Promise.all([
          callTelegram(config.telegramBotToken, 'getMe', {}),
          callTelegram(config.telegramBotToken, 'getWebhookInfo', {})
        ]);
        
        if (meRes.ok) {
          botDetails = {
            id: meRes.result.id,
            username: meRes.result.username,
            first_name: meRes.result.first_name
          };
        }
        
        if (webhookRes.ok) {
          webhookDetails = {
            url: webhookRes.result.url,
            pending_update_count: webhookRes.result.pending_update_count,
            allowed_updates: webhookRes.result.allowed_updates
          };
          
          // Verify the webhook points to the current application base URL
          const proto = getHeader(requestInfo.headers, 'x-forwarded-proto') || 'https';
          const host = getHeader(requestInfo.headers, 'host');
          const currentBaseUrl = `${proto}://${host}`;
          
          if (webhookDetails.url && webhookDetails.url.startsWith(currentBaseUrl)) {
            telegramOk = meRes.ok;
          } else {
            telegramError = `Webhook URL mismatch. Expected base ${currentBaseUrl}, got ${webhookDetails.url}`;
          }
        } else {
          telegramError = webhookRes.description || 'Failed to get webhook info';
        }
      } catch (e) {
        telegramError = e.message || String(e);
      }
    } else {
      telegramError = "Missing telegramBotToken";
    }
  } else {
    telegramError = "Unverified (token not provided or invalid)";
  }

  const responseBody = {
    status: (cryptoOk && aacOk && (!config.telegramBotToken || (isAuthorized ? telegramOk : true))) ? 'healthy' : 'degraded',
    version: config.version,
    runtime: runtime,
    config_checks: {
      telegramBotToken: !!config.telegramBotToken,
      whisperApiKey: !!config.whisperApiKey,
      ownerChatId: !!config.ownerChatId,
      whisperApiBase: config.whisperApiBase || DEFAULT_API_BASE
    },
    tests: {
      crypto: { ok: cryptoOk, error: cryptoError },
      aac_detection: { ok: aacOk },
      telegram_connectivity: { 
        ok: isAuthorized ? telegramOk : null, 
        bot: botDetails, 
        webhook: webhookDetails,
        status: isAuthorized ? "verified" : "unverified",
        error: telegramError
      }
    }
  };

  return {
    status: responseBody.status === 'healthy' ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
    body: responseBody
  };
}
