// lib/framework/menu.js
// Generalized menu system for Telegram bots

import { callTelegram, isOwner } from './utils.js';
import { escapeMarkdownV2 } from './markdown.js';

export const MENU_REGISTRY = {};
export const LAST_MENU_MESSAGE = new Map();

let options = {
  loadSettings: async (_token) => ({}),
  saveSettings: async (_token, _baseUrl, _settings) => ({ ok: true }),
  getUserLang: (_settings, _userLangCode) => 'en',
  getTranslation: (_lang, key, _params) => key
};

export function configureMenuFramework(opts) {
  options = { ...options, ...opts };
}

const UI = {
  CHECK_ON: '✅',
  CHECK_OFF: '❌',
  RADIO_ON: '★',
  RADIO_OFF: '  ',
  STYLE_ACTIVE: { style: 'primary' },
  STYLE_DISABLED: { style: 'danger' }
};

/**
 * Basic button decorator
 */
export function makeBtn(text, callbackData, isActive, isDanger = false, isSuccess = false) {
  return {
    text,
    callback_data: callbackData,
    ...(isDanger ? UI.STYLE_DISABLED : (isSuccess ? { style: 'success' } : (isActive ? UI.STYLE_ACTIVE : {})))
  };
}

/**
 * Radio selection button
 */
export function makeRadioBtn(label, value, activeValue, callbackData) {
  const isActive = value === activeValue;
  return makeBtn(
    `${isActive ? UI.RADIO_ON : UI.RADIO_OFF} ${label}`,
    callbackData,
    isActive
  );
}

/**
 * Checkbox button
 */
export function makeCheckboxBtn(label, isChecked, callbackData, isDanger = false) {
  return makeBtn(
    `${isChecked ? UI.CHECK_ON : UI.CHECK_OFF} ${label}`,
    callbackData,
    isChecked && !isDanger,
    isDanger
  );
}

/**
 * Register a menu
 */
export function registerMenu(id, config) {
  MENU_REGISTRY[id] = config;
}

/**
 * Render the inline keyboard for a given menu.
 */
export function renderMenuKeyboard(menuId, settings, lang, ctx, backMenuId = null) {
  const menu = MENU_REGISTRY[menuId];
  if (!menu) return { inline_keyboard: [] };

  const rawButtons = menu.getButtons ? menu.getButtons(settings, lang, ctx) : [];
  const keyboard = [];

  for (const row of rawButtons) {
    const kbRow = [];
    for (const btn of row) {
      if (btn.type === 'menu') {
        const subMenu = MENU_REGISTRY[btn.menuId];
        let title = btn.text;
        if (!title && subMenu) {
          title = subMenu.getTitle(settings, lang, ctx);
          const value = subMenu.getValue ? subMenu.getValue(settings, lang, ctx) : null;
          if (value) {
            title = `${title}: ${value}`;
          }
        }
        kbRow.push(makeBtn(title || btn.menuId, `nav:${btn.menuId}:${menuId}`, false));
      } else if (btn.type === 'toggle') {
        kbRow.push(makeCheckboxBtn(btn.text, btn.isActive, `${menuId}:${btn.action}:${btn.value}`, btn.isDanger));
      } else if (btn.type === 'radio') {
        kbRow.push(makeRadioBtn(btn.text, btn.value, btn.activeValue, `${menuId}:${btn.action}:${btn.value}`));
      } else { // action
        if (btn.switch_inline_query_current_chat !== undefined) {
          kbRow.push({
            text: btn.text,
            switch_inline_query_current_chat: btn.switch_inline_query_current_chat,
            ...(btn.isActive ? UI.STYLE_ACTIVE : {})
          });
        } else {
          kbRow.push(makeBtn(btn.text, `${menuId}:${btn.action}:${btn.value}`, btn.isActive, btn.isDanger));
        }
      }
    }
    keyboard.push(kbRow);
  }

  if (backMenuId) {
    const backTitle = options.getTranslation(lang, 'btnBack') || '« Back';
    keyboard.push([makeBtn(backTitle, `nav:${backMenuId}:`, false, false, true)]);
  }

  return { inline_keyboard: keyboard };
}

/**
 * Get the text and inline keyboard for a menu.
 */
export async function getMenuTextAndKeyboard(menuId, settings, lang, ctx, backMenuId = null) {
  const menu = MENU_REGISTRY[menuId];
  if (!menu) return null;
  
  if (menu.prepare) {
    await menu.prepare(settings, lang, ctx);
  }

  const title = menu.getTitle(settings, lang, ctx);
  const text = menu.getText ? menu.getText(settings, lang, ctx) : '';
  
  let messageText = `*${escapeMarkdownV2(title.replace(/\*/g, ''))}*`;
  if (text) {
    messageText += `\n\n${text.trimStart()}`;
  }
  
  const replyMarkup = renderMenuKeyboard(menuId, settings, lang, ctx, backMenuId);

  return { text: messageText, replyMarkup };
}

/**
 * Open a menu as a new message.
 */
export async function openMenu(menuId, token, chatId, settings, lang, ctx, backMenuId = null) {
  if (backMenuId === null && menuId !== 'config') {
    backMenuId = 'config';
  }
  const data = await getMenuTextAndKeyboard(menuId, settings, lang, ctx, backMenuId);
  if (!data) return false;

  const res = await callTelegram(token, 'sendMessage', {
    chat_id: chatId,
    text: data.text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    reply_markup: data.replyMarkup
  });
  if (!res.ok) {
    throw new Error(`Telegram API sendMessage failed: ${res.description || 'Unknown error'}`);
  }
  if (res.result?.message_id) {
    LAST_MENU_MESSAGE.set(chatId, res.result.message_id);
  }
  return res;
}

/**
 * Update an existing menu in place.
 */
export async function updateMenu(menuId, token, messageId, chatId, settings, lang, ctx, backMenuId = null) {
  if (backMenuId === null && menuId !== 'config') {
    backMenuId = 'config';
  }
  const data = await getMenuTextAndKeyboard(menuId, settings, lang, ctx, backMenuId);
  if (!data) return false;

  const res = await callTelegram(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: data.text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    reply_markup: data.replyMarkup
  });
  if (!res.ok) {
    if (res.description && res.description.includes('message is not modified')) {
      return { ok: true, result: { message_id: messageId } };
    }
    throw new Error(`Telegram API editMessageText failed: ${res.description || 'Unknown error'}`);
  }
  if (messageId) {
    LAST_MENU_MESSAGE.set(chatId, messageId);
  }
  return res;
}

/**
 * Extract the backMenuId from the current message's inline keyboard to preserve navigation state.
 */
export function getBackMenuId(message) {
  if (!message || !message.reply_markup || !message.reply_markup.inline_keyboard) return null;
  for (const row of message.reply_markup.inline_keyboard) {
    for (const btn of row) {
      if (btn.callback_data && btn.callback_data.startsWith('nav:')) {
        const parts = btn.callback_data.split(':');
        if (parts.length >= 3 && parts[2] === '') {
          return parts[1];
        }
      }
    }
  }
  return null;
}

/**
 * Core handler for menu callbacks.
 */
async function handleMenuCallback(callbackQuery, settings, lang, ctx, baseUrl) {
  const token = ctx.token;
  const callbackQueryId = callbackQuery.id;
  const message = callbackQuery.message;
  const messageId = message.message_id;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('nav:')) {
    const parts = data.split(':');
    const targetMenuId = parts[1];
    // parts[2] === '' means Back was explicitly cleared (top-level nav). Only fall back to
    // getBackMenuId when no backMenuId segment was provided at all (parts.length < 3).
    const backMenuId = parts.length >= 3 ? (parts[2] || null) : (getBackMenuId(message) || null);
    await updateMenu(targetMenuId, token, messageId, chatId, settings, lang, ctx, backMenuId);
    await callTelegram(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId });
    return true;
  }

  const colonIdx = data.indexOf(':');
  if (colonIdx === -1) return false;

  const menuId = data.substring(0, colonIdx);
  const actionValue = data.substring(colonIdx + 1);
  const secondColonIdx = actionValue.indexOf(':');
  if (secondColonIdx === -1) return false;

  const action = actionValue.substring(0, secondColonIdx);
  const value = actionValue.substring(secondColonIdx + 1);

  const menu = MENU_REGISTRY[menuId];
  if (!menu || !menu.handleAction) return false;

  const backMenuId = getBackMenuId(message);

  const res = await menu.handleAction(action, value, settings, ctx);
  if (!res) return false;

  if (res.handled) return true;

  if (res.updated || res.refreshed) {
    if (menu.onUpdated) {
      await menu.onUpdated(settings, ctx);
      lang = ctx.lang || lang;
    }

    if (res.updated) {
      const updateRes = await options.saveSettings(token, baseUrl, settings);
      if (!updateRes.ok) {
        const errorMsg = options.getTranslation(lang, 'webhookUpdateFailed', { error: updateRes.error || JSON.stringify(updateRes) });
        await callTelegram(token, 'answerCallbackQuery', {
          callback_query_id: callbackQueryId
        }).catch(() => {});
        throw new Error(errorMsg);
      }
    }

    await updateMenu(menuId, token, messageId, chatId, settings, lang, ctx, backMenuId);
    
    if (res.updated) {
      await callTelegram(token, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: options.getTranslation(lang, 'settingsUpdated') || 'Updated'
      });
    }
  }

  return true;
}

/**
 * Handle Callback Queries from inline buttons.
 */
export async function handleCallbackQuery(callbackQuery, config, baseUrl, getExtraCtx = null) {
  const token = config.telegramBotToken;
  const callbackQueryId = callbackQuery.id;
  const fromId = callbackQuery.from.id;
  const message = callbackQuery.message;
  
  let settings;
  try {
    settings = await options.loadSettings(token);
  } catch (e) {
    console.error('Failed to load settings in callback query:', e);
    await callTelegram(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId
    }).catch(() => {});
    throw e;
  }

  let lang = options.getUserLang(settings, callbackQuery.from?.language_code);
  const ownerId = config.ownerChatId || settings.owner;

  if (!isOwner(fromId, ownerId)) {
    await callTelegram(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: options.getTranslation(lang, 'unauthorized'),
      show_alert: true
    });
    return true;
  }

  const ctx = {
    token,
    message,
    callbackQueryId,
    lang,
    config,
    ...(getExtraCtx ? getExtraCtx(callbackQuery, settings, lang) : {})
  };

  try {
    return await handleMenuCallback(callbackQuery, settings, lang, ctx, baseUrl);
  } catch (e) {
    console.error('Error handling menu callback:', e);
    await callTelegram(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId
    }).catch(() => {});
    throw e;
  }
}
