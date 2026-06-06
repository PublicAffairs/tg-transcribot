// lib/utils.js
// Bot-specific formatting, text processing and utilities, re-exporting framework engines

import {
  escapeMarkdownV2,
  getMarkdownV2RenderedLength,
  findSplitIndex
} from './framework/markdown.js';

export {
  callTelegram,
  sha256,
  getHeader,
  isOwner,
  _debugOwnerId,
  setDebugOwnerId
} from './framework/utils.js';

export {
  escapeMarkdownV2,
  escapeMarkdownV2Code,
  escapeMarkdownV2Link,
  htmlToMarkdownV2,
  toMarkdownV2,
  stripMarkdown,
  getMarkdownV2RenderedLength,
  findSplitIndex
} from './framework/markdown.js';

export const MAX_PROMPT_TOKENS = 224;

/**
 * Roughly estimate the number of Whisper/GPT-2 tokens in a string (no dependencies).
 * ASCII characters count as ~0.25 tokens (4 chars/token);
 * non-ASCII (Cyrillic, CJK, etc.) count as ~0.5 tokens (2 chars/token).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    tokens += char.codePointAt(0) > 127 ? 0.5 : 0.25;
  }
  return Math.ceil(tokens);
}

/**
 * Truncate estimated Whisper tokens from the left (keeping the end of the prompt).
 * Whisper only uses the last 224 tokens of the prompt.
 * Reference: https://developers.openai.com/api/docs/guides/speech-to-text
 */
export function truncateTokensFromLeft(text, maxTokens) {
  if (!text) return '';
  let tokens = 0;
  let cutIdx = text.length;
  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i];
    const charTokens = char.codePointAt(0) > 127 ? 0.5 : 0.25;
    if (tokens + charTokens > maxTokens) {
      break;
    }
    tokens += charTokens;
    cutIdx = i;
  }
  return text.substring(cutIdx);
}

/**
 * Converts a plain-text multi-line footer into italic MarkdownV2.
 */
function plainToMdV2Italic(plain) {
  return plain.trim().split('\n').map(line => {
    const match = line.match(/^(\S+\s?)(.*)/s);
    if (!match) return `_${escapeMarkdownV2(line)}_`;
    const [, emoji, content] = match;
    return `${emoji}_${escapeMarkdownV2(content)}_`;
  }).join('\n');
}

function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  const rem = String(s % 60).padStart(2, '0');
  return `${m}:${rem}`;
}

function getVerboseFooterPlain(options) {
  const { fileType, fileSize, fileDuration, durationSec, actualFormat, signatureFormat, whisperDuration } = options;
  const format = actualFormat || fileType;
  let formatStr = format;
  if (signatureFormat && signatureFormat !== format) {
    formatStr += ` (${signatureFormat})`;
  }
  let footer = `⚙️ Info: ${formatStr}, ${formatDuration(fileDuration)}, ${(fileSize / 1024).toFixed(1)}KB\n⏱ Time: ${durationSec}s total`;
  if (whisperDuration) footer += `, ${whisperDuration}s API`;
  return footer;
}

function getGuestWarningPlain() {
  return `⚠️ Truncated: Start bot in private chat to receive long transcriptions`;
}

export function splitTranscriptionText(text, options = {}) {
  const { header, isGuest, verbose } = options;
  
  const verboseFooterPlain = verbose ? getVerboseFooterPlain(options) : "";
  const guestWarningPlain = getGuestWarningPlain();

  const singleHeaderRenderedLen = getMarkdownV2RenderedLength(header);
  const singleFooterRenderedLen = verbose ? getMarkdownV2RenderedLength(verboseFooterPlain) : 0;
  const singleTotalOverhead = singleHeaderRenderedLen + 2 + singleFooterRenderedLen;

  if (text.length + singleTotalOverhead <= 4096) {
    return [text];
  }

  const paginationOverhead = 10;
  const chunks = [];
  let remaining = text.trim();
  
  while (remaining.length > 0) {
    const isFirstChunk = chunks.length === 0;
    let footerLen = 0;
    if (isGuest && isFirstChunk) {
      footerLen = getMarkdownV2RenderedLength(guestWarningPlain);
    }
    
    const headerLen = getMarkdownV2RenderedLength(header) + paginationOverhead;
    const maxChunkLen = 4096 - headerLen - 2 - footerLen;
    
    let lastFooterLen = verbose ? getMarkdownV2RenderedLength(verboseFooterPlain) : 0;
    const lastMaxChunkLen = 4096 - headerLen - 2 - lastFooterLen;
    
    if (remaining.length <= lastMaxChunkLen) {
      chunks.push(remaining);
      break;
    }
    
    let splitIdx = findSplitIndex(remaining, maxChunkLen);
    if (splitIdx <= 0) splitIdx = 1;
    
    chunks.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }
  
  return chunks;
}

export function buildTranscriptionMessages(text, options = {}) {
  const chunks = splitTranscriptionText(text, options);
  const { header, isGuest, verbose } = options;
  
  return chunks.map((chunk, i) => {
    let chunkHeader = header;
    if (chunks.length > 1) {
      chunkHeader = `${header} _\\[${i + 1}/${chunks.length}\\]_`;
    }
    
    let chunkResponseText = `${chunkHeader}\n\n${escapeMarkdownV2(chunk)}`;
    
    if (isGuest && chunks.length > 1 && i === 0) {
      chunkResponseText += `\n\n⚠️ _${escapeMarkdownV2(getGuestWarningPlain().replace(/^⚠️\s?/, ''))}_`;
    }
    
    if (verbose && i === chunks.length - 1) {
      chunkResponseText += `\n\n${plainToMdV2Italic(getVerboseFooterPlain(options))}`;
    }
    
    return chunkResponseText;
  });
}
