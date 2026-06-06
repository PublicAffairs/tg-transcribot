// lib/commands.js
// Interactive commands and stateless settings manager for Telegram Voice Transcribot

import { getTranslation, translations, getMarkdown, REPO_URL, getUserLang } from './localize.js';
import { callTelegram, isOwner, escapeMarkdownV2, toMarkdownV2, stripMarkdown } from './utils.js';
import { getWebhookConfig, updateWebhookConfig } from './webhook-settings.js';
import { openMenu } from './framework/menu.js';
import { COMMAND_REGISTRY, registerCommand } from './framework/router.js';

const README_FETCH_TIMEOUT = 5000;
const HEALTH_CHECK_TIMEOUT = 5000;

export const BOT_COMMANDS = new Proxy(COMMAND_REGISTRY, { 
  get(target, prop) { 
    const arr = target.filter(c => c.descriptionKey && !c.hidden).sort((a, b) => a.command.localeCompare(b.command));
    if (prop === 'length') return arr.length; 
    return typeof arr[prop] === 'function' ? arr[prop].bind(arr) : arr[prop]; 
  }
});



async function handleHelpCommand(message, ctx) {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  const responseText = generateHelpText(ctx.isMsgFromOwner, lang, ctx.config);
  
  await setupBotCommands(ctx.token, ctx.chatId, ctx.isMsgFromOwner, lang).catch(console.error);
  
  const res = await callTelegram(ctx.token, 'sendMessage', {
    chat_id: ctx.chatId,
    text: responseText,
    parse_mode: 'MarkdownV2'
  });
  if (!res.ok) throw new Error(`Failed to send help message: ${res.description || 'Unknown error'}`);
  return true;
}


// Register basic commands
registerCommand('help', handleHelpCommand, { priority: 100, isAdmin: false, descriptionKey: 'cmdHelp' });
registerCommand('start', handleHelpCommand, { priority: 100, isAdmin: false });


registerCommand('readme', async (message, ctx) => {
  const readmeUrl = `${REPO_URL}/raw/master/README.md`;
  try {
    const res = await fetch(readmeUrl, { signal: AbortSignal.timeout(README_FETCH_TIMEOUT) });
    if (!res.ok) {
      throw new Error(`Failed to fetch README from GitHub: ${res.statusText}`);
    }
    const readmeText = await res.text();
    const blob = new Blob([readmeText], { type: 'text/markdown' });
    const formData = new FormData();
    formData.append('chat_id', ctx.chatId);
    formData.append('document', blob, 'README.md');
    formData.append('caption', REPO_URL);

    const callRes = await fetch(`https://api.telegram.org/bot${ctx.token}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    
    const data = await callRes.json();
    if (!data.ok) {
      throw new Error(`Telegram API sendDocument failed: ${data.description}`);
    }
  } catch (e) {
    console.error('Failed to send README as attachment:', e);
    const fallbackRes = await callTelegram(ctx.token, 'sendMessage', {
      text: `⚠️ *Failed to send README\\.md attachment*:\n${escapeMarkdownV2(e.message || String(e))}\n\nYou can read the README directly on GitHub:\n${escapeMarkdownV2(REPO_URL)}`,
      parse_mode: 'MarkdownV2'
    });
    if (!fallbackRes.ok) {
      throw new Error(`Failed to send readme fallback message: ${fallbackRes.description || 'Unknown error'}`, { cause: e });
    }
  }
  return true;
}, { isAdmin: false, descriptionKey: 'cmdReadme' });

registerCommand('process', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  const res = await callTelegram(ctx.token, 'sendMessage', {
    chat_id: ctx.chatId,
    text: getMarkdown(lang, 'noAudio'),
    parse_mode: 'MarkdownV2'
  });
  if (!res.ok) throw new Error(`Failed to send noAudio warning: ${res.description || 'Unknown error'}`);
  return true;
}, { isAdmin: false, descriptionKey: 'cmdProcess' });


// User prompt command (media transcription fallback) - priority 100
registerCommand('prompt', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  const res = await callTelegram(ctx.token, 'sendMessage', {
    chat_id: ctx.chatId,
    text: getMarkdown(lang, 'noAudio'),
    parse_mode: 'MarkdownV2'
  });
  if (!res.ok) throw new Error(`Failed to send noAudio warning: ${res.description || 'Unknown error'}`);
  return true;
}, { priority: 100, isAdmin: false, descriptionKey: 'cmdPromptUser' });


registerCommand('webhook', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  const commandArg = ctx.commandArg;
  const token = ctx.token;
  const chatId = ctx.chatId;

  if (commandArg) {
    let newBase;
    let overrideParams = {};
    try {
      const parsedArg = new URL(commandArg);
      newBase = parsedArg.origin;
      parsedArg.searchParams.forEach((v, k) => { overrideParams[k] = v; });
    } catch {
      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: getMarkdown(lang, 'webhookHealthFail', { url: commandArg, error: 'Invalid URL format' }),
        parse_mode: 'MarkdownV2'
      });
      return true;
    }

    await callTelegram(token, 'sendMessage', {
      chat_id: chatId,
      text: getMarkdown(lang, 'webhookHealthChecking'),
      parse_mode: 'MarkdownV2'
    });

    const healthUrl = `${newBase}/api/health`;
    let healthOk = false;
    let healthError = '';
    try {
      const hRes = await fetch(healthUrl, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT) });
      if (hRes.ok || hRes.status === 200) {
        healthOk = true;
      } else {
        healthError = `HTTP ${hRes.status}`;
      }
    } catch (e) {
      healthError = e.message || String(e);
    }

    if (!healthOk) {
      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: getMarkdown(lang, 'webhookHealthFail', { url: healthUrl, error: healthError }),
        parse_mode: 'MarkdownV2'
      });
      return true;
    }

    const mergedSettings = { ...settings, ...overrideParams };
    const res = await updateWebhookConfig(token, newBase, mergedSettings);
    if (res.ok) {
      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: getMarkdown(lang, 'webhookHealthOk', { url: `${newBase}/api/webhook` }),
        parse_mode: 'MarkdownV2'
      });
    } else {
      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: getMarkdown(lang, 'webhookUpdateFailed', { error: res.error || JSON.stringify(res) }),
        parse_mode: 'MarkdownV2'
      });
    }
  } else {
    const { openMenu } = await import('./framework/menu.js');
    await openMenu('webhook', token, chatId, settings, lang, ctx);
  }
  return true;
}, { condition: (message, isMsgFromOwner) => isMsgFromOwner, isAdmin: true, descriptionKey: 'cmdWebhook' });

registerCommand('setbotinfo', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  await setupBotProfile(ctx.token);
  await setupBotAvatar(ctx.token);
  await callTelegram(ctx.token, 'sendMessage', {
    chat_id: ctx.chatId,
    text: getMarkdown(lang, 'botInfoSuccess'),
    parse_mode: 'MarkdownV2'
  });
  return true;
}, { condition: (message, isMsgFromOwner) => isMsgFromOwner, isAdmin: true, descriptionKey: 'cmdSetbotinfo' });


/**
 * Main handler for text commands.
 */
export async function handleCommand(message, config, baseUrl) {
  const token = config.telegramBotToken;
  const ownerId = config.ownerChatId;
  const chatId = message.chat.id;

  // Intercept ForceReply answers
  if (message.reply_to_message) {
    const replyText = message.reply_to_message.text || '';
    if (replyText.includes('(Ref: lang)') || replyText.includes('(Ref: prompt)')) {
      const { LAST_MENU_MESSAGE, updateMenu } = await import('./framework/menu.js');
      const settings = await getWebhookConfig(token);
      const userLangCode = message.from?.language_code;
      const lang = getUserLang(settings, userLangCode);
      const menuMessageId = LAST_MENU_MESSAGE.get(chatId);

      const val = (message.text || '').trim();
      
      if (replyText.includes('(Ref: lang)')) {
        const cleanVal = val.toLowerCase();
        if (cleanVal === 'auto' || /^[a-z]{2,3}$/.test(cleanVal)) {
          settings.lang = cleanVal;
          await updateWebhookConfig(token, baseUrl, settings);
          if (menuMessageId) {
            await updateMenu('lang', token, menuMessageId, chatId, settings, lang, { token, baseUrl, config });
          }
        }
      } else if (replyText.includes('(Ref: prompt)')) {
        let cleanVal;
        if (val.toLowerCase() === 'default') {
          cleanVal = undefined;
        } else if (val.toLowerCase() === 'empty' || val === '-') {
          cleanVal = '';
        } else {
          cleanVal = val;
        }
        settings.prompt = cleanVal;
        await updateWebhookConfig(token, baseUrl, settings);
        if (menuMessageId) {
          await updateMenu('prompt', token, menuMessageId, chatId, settings, lang, { token, baseUrl, config });
        }
      }

      // Cleanup: delete both the bot's ForceReply prompt and the user's text reply
      await callTelegram(token, 'deleteMessage', { chat_id: chatId, message_id: message.reply_to_message.message_id }).catch(console.error);
      await callTelegram(token, 'deleteMessage', { chat_id: chatId, message_id: message.message_id }).catch(console.error);
      return true;
    }
  }

  let text = (message.text || '').trim();

  // If the command is sent via inline query completion, it starts with @username /command...
  // e.g. @botusername /lang fr -> strip the @botusername prefix so it parses correctly
  if (text.startsWith('@')) {
    const spaceIdx = text.indexOf(' ');
    if (spaceIdx !== -1) {
      const firstWord = text.substring(0, spaceIdx);
      if (!firstWord.includes('/')) {
        const rest = text.substring(spaceIdx + 1).trim();
        if (rest.startsWith('/')) {
          text = rest;
        }
      }
    }
  }

  const userId = message.from?.id;
  const isMsgFromOwner = isOwner(userId, ownerId);
  const userLangCode = message.from?.language_code;

  const cmdMatch = text.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]*))?$/);
  const matchedCmd = cmdMatch ? cmdMatch[1].toLowerCase() : null;
  const commandArg = cmdMatch ? (cmdMatch[2] || '').trim() : '';

  if (!ownerId) {
    throw new Error('Owner Chat ID is not set in configuration');
  }

  if (matchedCmd) {
    const handlers = COMMAND_REGISTRY.filter(h => h.command === matchedCmd);
    for (const h of handlers) {
      if (h.condition(message, isMsgFromOwner)) {
        const res = await h.handler(message, {
          token,
          ownerId,
          chatId,
          commandArg,
          isMsgFromOwner,
          userLangCode,
          config,
          baseUrl
        });
        if (res !== false) {
          return true;
        }
      }
    }
    if (!isMsgFromOwner && COMMAND_REGISTRY.some(c => c.command === matchedCmd && c.isAdmin)) {
      console.warn(`Non-owner ${userId} tried to execute command /${matchedCmd}`);
      return true;
    }
  }

  // Fallback for private chats or owner
  if (message.chat.type === 'private' || isMsgFromOwner) {
    const settings = await getWebhookConfig(token);
    const lang = getUserLang(settings, userLangCode);
    let helpText = generateHelpText(isMsgFromOwner, lang, config, true);
    
    await callTelegram(token, 'sendMessage', {
      chat_id: chatId,
      text: helpText,
      parse_mode: 'MarkdownV2',
      reply_to_message_id: message.message_id
    });
    return true;
  }

  return false;
}




/**
 * Dynamically compile the help text based on registered commands.
 */
export function generateHelpText(isMsgFromOwner, lang, config, isUnsolicited = false) {
  const greetingMarkdown = getMarkdown(lang, 'help');
  
  const userCmds = BOT_COMMANDS
    .filter(cmd => !cmd.isAdmin)
    .sort((a, b) => a.command.localeCompare(b.command));

  let cmdsList = '';
  for (const cmd of userCmds) {
    const desc = getTranslation(lang, cmd.descriptionKey) || cmd.command;
    cmdsList += `\n/${cmd.command} \\- ${toMarkdownV2(desc)}`;
  }

  if (isMsgFromOwner) {
    const settingsTitle = getMarkdown(lang, 'settingsTitle');
    cmdsList += `\n\n${settingsTitle}`;
    
    const adminCmds = BOT_COMMANDS
      .filter(cmd => cmd.isAdmin)
      .sort((a, b) => a.command.localeCompare(b.command));
      
    for (const cmd of adminCmds) {
      const desc = getTranslation(lang, cmd.descriptionKey) || cmd.command;
      cmdsList += `\n/${cmd.command} \\- ${toMarkdownV2(desc)}`;
    }
  }

  cmdsList = cmdsList.trim();
  let responseText = greetingMarkdown + '\n\n';

  if (isUnsolicited) {
    const lines = cmdsList.split('\n');
    responseText += '**>' + lines.join('\n>') + '||';
  } else {
    responseText += cmdsList;
    const versionStr = getMarkdown(lang, 'botVersion', { val: config.version || '0.0.0' });
    if (versionStr) {
      responseText += `\n\n${versionStr}`;
    }
  }

  return responseText;
}

/**
 * Configure the bot's command menu.
 */
export function getPublicCommands(langCode) {
  return BOT_COMMANDS
    .filter(cmd => !cmd.isAdmin)
    .map(cmd => {
      const rawDesc = getTranslation(langCode, cmd.descriptionKey) || cmd.command;
      return {
        command: cmd.command,
        description: stripMarkdown(rawDesc)
      };
    })
    .sort((a, b) => a.command.localeCompare(b.command));
}

/**
 * Get admin commands list.
 */
export function getAdminCommands(langCode) {
  const commandMap = new Map();
  for (const cmd of BOT_COMMANDS) {
    const existing = commandMap.get(cmd.command);
    if (!existing || cmd.isAdmin) {
      commandMap.set(cmd.command, cmd);
    }
  }
  return Array.from(commandMap.values())
    .map(cmd => {
      const rawDesc = getTranslation(langCode, cmd.descriptionKey) || cmd.command;
      return {
        command: cmd.command,
        description: stripMarkdown(rawDesc)
      };
    })
    .sort((a, b) => a.command.localeCompare(b.command));
}

/**
 * Configure the bot's command menu.
 */
export async function setupBotCommands(token, chatId, isMsgFromOwner, langCode = 'en') {
  const commands = isMsgFromOwner ? getAdminCommands(langCode) : getPublicCommands(langCode);

  const res = await callTelegram(token, 'setMyCommands', {
    commands,
    language_code: langCode,
    scope: {
      type: 'chat',
      chat_id: Number(chatId)
    }
  });
  if (!res.ok) {
    console.error(`Failed to set bot commands for chat ${chatId}:`, res);
  } else {
    console.log(`Bot commands updated successfully for chat ${chatId}.`);
  }
}

/**
 * Automate bot profile configuration (Name, Description, Short Description, and Commands)
 * for all supported languages and the global fallback default.
 */
export async function setupBotProfile(token) {
  const langs = ['', 'en', 'ru', 'de', 'uk'];
  const settings = await getWebhookConfig(token);
  const ownerChatId = settings.owner;
  
  for (const lang of langs) {
    const translationLang = lang || 'en';
    
    // Register public commands globally
    const publicCommands = getPublicCommands(translationLang);
    
    const payloadPublic = { commands: publicCommands };
    if (lang) {
      payloadPublic.language_code = lang;
    }
    await callTelegram(token, 'setMyCommands', payloadPublic);

    // Register full command suite for the owner chat specifically if owner exists
    if (ownerChatId) {
      const adminCommands = getAdminCommands(translationLang);

      const payloadAdmin = {
        commands: adminCommands,
        scope: {
          type: 'chat',
          chat_id: Number(ownerChatId)
        }
      };
      if (lang) {
        payloadAdmin.language_code = lang;
      }
      await callTelegram(token, 'setMyCommands', payloadAdmin);
    }
    
    // 2. Set profile metadata only if defined specifically for this language
    const profileLang = lang || 'en';
    
    const botName = translations[profileLang]?.botName;
    if (botName) {
      const payloadName = { name: botName };
      if (lang) payloadName.language_code = lang;
      await callTelegram(token, 'setMyName', payloadName);
    }
    
    const botDescription = translations[profileLang]?.botDescription;
    if (botDescription) {
      const payloadDesc = { description: botDescription };
      if (lang) payloadDesc.language_code = lang;
      await callTelegram(token, 'setMyDescription', payloadDesc);
    }
    
    const botShortDescription = translations[profileLang]?.botShortDescription;
    if (botShortDescription) {
      const payloadShort = { short_description: botShortDescription };
      if (lang) payloadShort.language_code = lang;
      await callTelegram(token, 'setMyShortDescription', payloadShort);
    }
  }
  console.log('Bot profile automated configuration completed.');
}

/**
 * Try to upload bot profile photo from local files (avatar.jpg, avatar.png, avatar.jpeg)
 * if they exist in the root of the project.
 */
export async function setupBotAvatar(token) {
  try {
    let fileData = null;
    let fileName = '';
    
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const possiblePaths = [
        path.join(process.cwd(), 'avatar.jpg'),
        path.join(process.cwd(), 'avatar.png'),
        path.join(process.cwd(), 'avatar.jpeg')
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          fileData = fs.readFileSync(p);
          fileName = path.basename(p);
          break;
        }
      }
    } else if (typeof Deno !== 'undefined') {
      const possiblePaths = ['avatar.jpg', 'avatar.png', 'avatar.jpeg'];
      for (const p of possiblePaths) {
        try {
          fileData = await Deno.readFile(p);
          fileName = p;
          break;
        } catch {
          // Ignore and check next
        }
      }
    }
    
    if (!fileData) {
      console.log('No avatar file (avatar.jpg/png/jpeg) found in project root. Skipping bot profile photo setup.');
      return;
    }
    
    console.log(`Found avatar file: ${fileName}. Uploading to Telegram...`);
    const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const blob = new Blob([fileData], { type: mimeType });
    const formData = new FormData();
    formData.append('photo', blob, fileName);
    
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, {
      method: 'POST',
      body: formData
    });
    const resData = await res.json();
    if (resData.ok) {
      console.log('Bot profile photo updated successfully.');
    } else {
      console.error('Failed to set bot profile photo:', resData.description);
    }
  } catch (err) {
    console.error('Error in setupBotAvatar:', err);
  }
}

export function makeMenuCommandHandler(menuId) {
  return async (message, ctx) => {
    const settings = await getWebhookConfig(ctx.token);
    const lang = getUserLang(settings, ctx.userLangCode);
    const botInfoRes = await callTelegram(ctx.token, 'getMe', {});
    ctx.botInfo = botInfoRes.ok ? botInfoRes.result : null;
    const webhookInfoRes = await callTelegram(ctx.token, 'getWebhookInfo', {});
    ctx.webhookUrl = webhookInfoRes.ok ? (webhookInfoRes.result?.url || '—') : '—';
    const { getAvailableModels } = await import('./menus.js');
    ctx.availableModels = getAvailableModels(ctx.config);
    ctx.lang = lang;
    
    if (ctx.commandArg) {
      const { LAST_MENU_MESSAGE, updateMenu, openMenu } = await import('./framework/menu.js');
      const repliedMenuId = message.reply_to_message?.message_id;
      const cachedMenuId = LAST_MENU_MESSAGE.get(ctx.chatId);
      const menuMessageId = repliedMenuId || cachedMenuId;

      if (menuId === 'lang') {
        const val = ctx.commandArg.toLowerCase();
        const { TRANSCRIPTION_LANGUAGES } = await import('./menus.js');
        if (val === 'auto' || /^[a-z]{2,3}$/.test(val)) {
          settings.lang = val;
          await updateWebhookConfig(ctx.token, ctx.baseUrl, settings);
          const langName = val === 'auto' ? getTranslation(lang, 'langAuto') : (TRANSCRIPTION_LANGUAGES[val] || val.toUpperCase());
          
          if (menuMessageId) {
            await updateMenu('lang', ctx.token, menuMessageId, ctx.chatId, settings, lang, ctx);
            await callTelegram(ctx.token, 'deleteMessage', { chat_id: ctx.chatId, message_id: message.message_id }).catch(console.error);
          } else {
            await callTelegram(ctx.token, 'sendMessage', {
              chat_id: ctx.chatId,
              text: `✅ *Language:* ${langName}`,
              parse_mode: 'MarkdownV2'
            });
            await openMenu('lang', ctx.token, ctx.chatId, settings, lang, ctx);
          }
          return true;
        }
      } else if (menuId === 'prompt') {
        const val = ctx.commandArg;
        if (val.toLowerCase() === 'default') {
          settings.prompt = undefined;
        } else if (val.toLowerCase() === 'empty' || val === '-') {
          settings.prompt = '';
        } else {
          settings.prompt = val;
        }
        await updateWebhookConfig(ctx.token, ctx.baseUrl, settings);
        const displayVal = settings.prompt === undefined ? 'default' : (settings.prompt === '' ? 'empty' : `"${settings.prompt}"`);
        
        if (menuMessageId) {
          await updateMenu('prompt', ctx.token, menuMessageId, ctx.chatId, settings, lang, ctx);
          await callTelegram(ctx.token, 'deleteMessage', { chat_id: ctx.chatId, message_id: message.message_id }).catch(console.error);
        } else {
          await callTelegram(ctx.token, 'sendMessage', {
            chat_id: ctx.chatId,
            text: `✅ *Whisper Prompt:* \`${displayVal}\``,
            parse_mode: 'MarkdownV2'
          });
          await openMenu('prompt', ctx.token, ctx.chatId, settings, lang, ctx);
        }
        return true;
      }
    }
    
    await openMenu(menuId, ctx.token, ctx.chatId, settings, lang, ctx);
    return true;
  };
}

registerCommand('config', makeMenuCommandHandler('config'), {
  condition: (message, isMsgFromOwner) => isMsgFromOwner,
  isAdmin: true,
  descriptionKey: 'cmdConfig'
});

registerCommand('settings', makeMenuCommandHandler('config'), {
  condition: (message, isMsgFromOwner) => isMsgFromOwner,
  isAdmin: true,
  descriptionKey: 'cmdSettings'
});

// Admin prompt command (sets settings prompt globally) - priority 200, checks !message.reply_to_message
registerCommand('prompt', makeMenuCommandHandler('prompt'), {
  priority: 200,
  condition: (message, isMsgFromOwner) => isMsgFromOwner && !message.reply_to_message,
  isAdmin: true,
  descriptionKey: 'cmdPromptAdmin'
});

const menuKeys = [
  { key: 'lang', desc: 'cmdLang' },
  { key: 'langbot', desc: 'cmdLangbot' },
  { key: 'mode', desc: 'cmdMode' },
  { key: 'model', desc: 'cmdModel' },
  { key: 'notify', desc: 'cmdNotify' },
  { key: 'verbose', desc: 'cmdVerbose' }
];
for (const item of menuKeys) {
  registerCommand(item.key, makeMenuCommandHandler(item.key), {
    condition: (message, isMsgFromOwner) => isMsgFromOwner,
    isAdmin: true,
    descriptionKey: item.desc
  });
}

