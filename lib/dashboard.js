// lib/dashboard.js
// Dashboard / Landing Page renderer for Telegram Voice Transcribot

import { makeDashboardHandler } from './framework/dashboard.js';
import { registerHttpRoute } from './framework/router.js';

export const handleDashboard = makeDashboardHandler({
  botNameDefault: 'Transcribot',
  botDescriptionDefault: 'I transcribe voice messages, audio files, and video notes (circles) to text using the Whisper API',
  repoUrl: 'https://github.com/PublicAffairs/tg-transcribot',
  repoName: 'tg-transcribot',
  logoSvg: `<svg viewBox="0 0 24 24">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
  </svg>`,
  getSettingsSchema: (oldSettings) => ({
    groups: oldSettings.groups !== undefined ? oldSettings.groups : true,
    guest: oldSettings.guest !== undefined ? oldSettings.guest : true,
    secretary: oldSettings.secretary !== undefined ? oldSettings.secretary : true,
    lang: oldSettings.lang || 'auto',
    langbot: oldSettings.langbot || 'auto',
    model: oldSettings.model || '',
    notify_add: oldSettings.notify_add !== undefined ? oldSettings.notify_add : true,
    notify_conn: oldSettings.notify_conn !== undefined ? oldSettings.notify_conn : true,
    notify_err: oldSettings.notify_err !== undefined ? oldSettings.notify_err : true,
    verbose: oldSettings.verbose !== undefined ? oldSettings.verbose : false,
    prompt: oldSettings.prompt || '',
    owner: oldSettings.owner || ''
  }),
  getChecks: (config) => {
    return [
      { name: 'BOT TOKEN', ok: !!config.telegramBotToken, errorMsg: 'TELEGRAM_BOT_TOKEN is missing!' },
      { name: 'WHISPER KEY', ok: !!config.whisperApiKey, errorMsg: 'WHISPER_API_KEY is not configured!' }
    ];
  }
});

registerHttpRoute('/', handleDashboard);
