import { handleCallbackQuery } from '../lib/commands.js';

const MOCK_TOKEN = '111222333:AABBccDDeeffGGHHiijjKK';
const MOCK_CONFIG = {
  telegramBotToken: MOCK_TOKEN,
  whisperApiKey: 'mock_whisper_key',
  whisperApiBase: 'https://api.groq.com/openai/v1',
  ownerChatId: '99999',
};

globalThis.fetch = async (url) => {
  const urlStr = url.toString();
  const method = urlStr.split('/').pop().split('?')[0];
  console.log('FETCH CALLED:', method);
  
  let result;
  if (urlStr.includes('/getWebhookInfo')) {
    result = { ok: true, result: { url: 'https://example.com/api/webhook?owner=99999' } };
  } else if (urlStr.includes('/getMe')) {
    result = { ok: true, result: { id: 777, username: 'mybot', can_join_groups: false } };
  } else {
    result = { ok: true, result: {} };
  }
  
  const response = {
    ok: true,
    status: 200,
    json: () => {
      console.log('JSON CALLED FOR:', method);
      return Promise.resolve(result);
    }
  };
  console.log('FETCH RETURNING:', method);
  return response;
};

console.log('Starting mode:disabled:groups test...');
try {
  const p = handleCallbackQuery({
    id: 'q_disabled_groups',
    from: { id: 99999 },
    message: { chat: { id: 99999, type: 'private' }, message_id: 100 },
    data: 'mode:disabled:groups'
  }, MOCK_CONFIG, 'https://mybot.com');
  
  console.log('handleCallbackQuery called, awaiting...');
  await p;
  console.log('DONE');
} catch (e) {
  console.error('ERROR:', e.message, e.stack);
}
