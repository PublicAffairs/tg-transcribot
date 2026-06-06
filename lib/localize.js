// lib/localize.js
// Standard translation dictionary for Telegram Voice Transcribot

export const translations = {
  en: {
    noAudio: "⚠️ <b>No audio or voice message found in the reply.</b>",
    help: "Hello! I am a transcription bot. Send or forward a voice message or audio file to me, and I will transcribe it into text.",
    helpTitle: "Help",
    transcription: "🎤 <b>Transcription:</b>",
    error: "⚠️ <b>Transcription error:</b>",
    fileTooLarge: "⚠️ <b>File is too large.</b> The Telegram Bot API restricts downloads to a maximum of {max_mb} MB."
  },
  ru: {
    noAudio: "⚠️ <b>Аудио или голосовое сообщение не найдено в цитате.</b>",
    help: "Привет! Я — бот-транскрибатор. Отправьте или перешлите мне голосовое сообщение либо аудиофайл, и я расшифрую его в текст.",
    helpTitle: "Справка",
    transcription: "🎤 <b>Транскрипция:</b>",
    error: "⚠️ <b>Ошибка транскрибации:</b>",
    fileTooLarge: "⚠️ <b>Файл слишком большой.</b> Telegram Bot API ограничивает загрузку файлов максимум до {max_mb} МБ."
  },
  de: {
    noAudio: "⚠️ <b>In der Antwort wurde keine Audio- oder Sprachnachricht gefunden.</b>",
    help: "Hallo! Ich bin ein Transkriptions-Bot. Senden oder leiten Sie mir eine Sprachnachricht oder eine Audiodatei weiter, und ich werde sie in Text umwandeln.",
    helpTitle: "Hilfe",
    transcription: "🎤 <b>Transkription:</b>",
    error: "⚠️ <b>Transkriptionsfehler:</b>",
    fileTooLarge: "⚠️ <b>Die Datei ist zu groß.</b> Die Telegram-Bot-API beschränkt Downloads auf maximal {max_mb} MB."
  },
  ukr: {
    noAudio: "⚠️ <b>Аудіо або голосове повідомлення не знайдено в цитаті.</b>",
    help: "Привіт! Я — бот-транскрибатор. Надішліть або перешліть мені голосове повідомлення або аудіофайл, и я розшифрую його в текст.",
    helpTitle: "Довідка",
    transcription: "🎤 <b>Транскрипція:</b>",
    error: "⚠️ <b>Помилка транскрибації:</b>",
    fileTooLarge: "⚠️ <b>Файл занадто великий.</b> Telegram Bot API обмежує завантаження файлів максимум до {max_mb} МБ."
  }
};

/**
 * Retrieve translation by language code and key.
 *
 * @param {string} langCode - Telegram user language code
 * @param {string} key - Translation key
 * @param {Object} [params] - Key-value parameters for interpolation
 * @returns {string} Interpolated translation string
 */
export function getTranslation(langCode, key, params = {}) {
  let lang = 'en';
  if (langCode) {
    const cleanLang = langCode.toLowerCase().split('-')[0];
    if (cleanLang === 'ru') lang = 'ru';
    else if (cleanLang === 'de') lang = 'de';
    else if (cleanLang === 'uk' || cleanLang === 'ukr') lang = 'ukr';
  }
  
  let text = translations[lang]?.[key] || translations['en']?.[key] || '';
  
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
  }
  
  return text;
}
