// lib/framework/localize.js
// Universal dictionary translation and formatting engine

import { escapeMarkdownV2, escapeMarkdownV2Code, escapeMarkdownV2Link, toMarkdownV2 } from './markdown.js';

let translations = {};

export function configureLocalization(data) {
  translations = data;
}

export function hasTranslation(langCode) {
  if (!langCode) return false;
  const cleanLang = langCode.toLowerCase().split('-')[0];
  return Object.prototype.hasOwnProperty.call(translations, cleanLang);
}

export function getUserLang(settings, userLangCode) {
  const autodetect = settings.autodetect !== false;
  const fallback = (settings.langbot && settings.langbot !== 'auto') ? settings.langbot : 'en';
  if (autodetect && userLangCode && hasTranslation(userLangCode)) {
    return userLangCode;
  }
  return fallback;
}

export function getTranslation(langCode, key, params = {}) {
  let lang = 'en';
  if (langCode) {
    const cleanLang = langCode.toLowerCase().split('-')[0];
    if (Object.prototype.hasOwnProperty.call(translations, cleanLang)) {
      lang = cleanLang;
    }
  }
  
  let text = translations[lang]?.[key] || translations['en']?.[key] || '';
  
  for (const [k, v] of Object.entries(params)) {
    const valStr = String(v);
    
    const parts = text.split(`{${k}}`);
    if (parts.length > 1) {
      let newText = parts[0];
      for (let i = 1; i < parts.length; i++) {
        const prevPart = parts[i - 1];
        const nextPart = parts[i];
        
        // Count single backticks in prevPart to check if we are inside inline code
        const backtickCount = (prevPart.match(/`/g) || []).length;
        const isInsideCode = (backtickCount % 2 !== 0);
        
        // Count triple backticks to check if we are inside a code block
        const preCount = (prevPart.match(/```/g) || []).length;
        const isInsidePre = (preCount % 2 !== 0);
        
        // Check if inside link URL: e.g. preceded by `](` and not closed yet
        const isOpenParen = prevPart.endsWith('](');
        
        let escapedVal;
        if (isInsideCode || isInsidePre) {
          escapedVal = escapeMarkdownV2Code(valStr);
        } else if (isOpenParen) {
          escapedVal = escapeMarkdownV2Link(valStr);
        } else {
          escapedVal = escapeMarkdownV2(valStr);
        }
        
        newText += escapedVal + nextPart;
      }
      text = newText;
    }
  }
  
  return text;
}

export function getMarkdown(langCode, key, params = {}) {
  const rawText = getTranslation(langCode, key, params);
  return toMarkdownV2(rawText);
}
