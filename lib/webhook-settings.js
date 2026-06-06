import { truncateTokensFromLeft, MAX_PROMPT_TOKENS, sha256, callTelegram } from './utils.js';

/**
 * Parse current bot settings from Telegram's WebhookInfo.
 * @param {Object} webhookInfo - Response from getWebhookInfo
 * @returns {Object} Parsed configuration
 */
export function parseWebhookConfig(webhookInfo) {
  const urlStr = webhookInfo?.url || '';
  const query = {};
  
  try {
    if (urlStr.includes('?')) {
      const parts = urlStr.split('?');
      const searchParams = new URLSearchParams(parts[1]);
      searchParams.forEach((val, key) => {
        query[key] = val;
      });
    }
  } catch (e) {
    console.error('Error parsing webhook URL query params:', e);
  }

  const allowedUpdates = webhookInfo?.allowed_updates || [];

  return {
    groups: query.groups !== 'off', // Defaults to true/on
    guest: allowedUpdates.includes('guest_message'),
    secretary: allowedUpdates.includes('business_message'),
    lang: query.lang || 'auto',
    langbot: query.langbot || 'en',
    autodetect: query.autodetect !== 'off', // Defaults to true
    model: query.model || '',
    notify_add: query.notify_add !== 'off', // Defaults to true/on
    notify_conn: query.notify_conn !== 'off', // Defaults to true/on
    notify_err: query.notify_err !== 'off', // Defaults to true/on
    verbose: query.verbose === 'on', // Defaults to false/off
    prompt: query.prompt !== undefined ? query.prompt : undefined,
    owner: query.owner || ''
  };
}

/**
 * Build Webhook payload for Telegram's setWebhook method.
 * @param {string} baseUrl - Base URL of the deployment (e.g. https://domain.com)
 * @param {string} token - Telegram Bot Token
 * @param {Object} currentConfig - Config object containing current state
 * @param {string} secretToken - SHA-256 hash of the bot token
 * @returns {Object} Payload for setWebhook
 */
export function buildWebhookSetup(baseUrl, token, currentConfig, secretToken) {
  const params = new URLSearchParams();
  
  if (!currentConfig.groups) {
    params.set('groups', 'off');
  }
  if (currentConfig.lang && currentConfig.lang !== 'auto') {
    params.set('lang', currentConfig.lang);
  }
  if (currentConfig.langbot && currentConfig.langbot !== 'en') {
    params.set('langbot', currentConfig.langbot);
  }
  if (!currentConfig.autodetect) {
    params.set('autodetect', 'off');
  }
  if (currentConfig.model) {
    params.set('model', currentConfig.model);
  }
  if (!currentConfig.notify_add) {
    params.set('notify_add', 'off');
  }
  if (!currentConfig.notify_conn) {
    params.set('notify_conn', 'off');
  }
  if (!currentConfig.notify_err) {
    params.set('notify_err', 'off');
  }
  if (currentConfig.verbose) {
    params.set('verbose', 'on');
  }
  if (currentConfig.prompt !== undefined) {
    // Truncate from the left to fit within MAX_PROMPT_TOKENS for safety inside the webhook URL.
    // Whisper only uses the last 224 tokens of the prompt: https://developers.openai.com/api/docs/guides/speech-to-text
    const safePrompt = truncateTokensFromLeft(currentConfig.prompt, MAX_PROMPT_TOKENS);
    params.set('prompt', safePrompt);
  }
  if (currentConfig.owner) {
    params.set('owner', currentConfig.owner);
  }

  const cleanBase = baseUrl.replace(/\/$/, '');
  const queryStr = params.toString();
  const webhookUrl = `${cleanBase}/api/webhook${queryStr ? '?' + queryStr : ''}`;

  const allowedUpdates = ['message', 'my_chat_member', 'callback_query'];
  if (currentConfig.guest) {
    allowedUpdates.push('guest_message');
  }
  if (currentConfig.secretary) {
    allowedUpdates.push('business_connection', 'business_message', 'edited_business_message');
  }

  return {
    url: webhookUrl,
    allowed_updates: allowedUpdates,
    secret_token: secretToken
  };
}

/**
 * Retrieve current webhook info and parse its configuration.
 */
export async function getWebhookConfig(token) {
  const res = await callTelegram(token, 'getWebhookInfo', {});
  if (res.ok) {
    return parseWebhookConfig(res.result);
  }
  return parseWebhookConfig({});
}

/**
 * Update the webhook with new settings.
 */
export async function updateWebhookConfig(token, baseUrl, newConfig) {
  const secretToken = await sha256(token);
  const webhookSetup = buildWebhookSetup(baseUrl, token, newConfig, secretToken);
  return await callTelegram(token, 'setWebhook', webhookSetup);
}
