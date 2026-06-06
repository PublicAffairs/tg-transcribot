// lib/transcriber.js
// Audio downloading and Whisper API orchestration

import { detectAudioFormat, wrapAacInWav, wrapCafInWav, wrapRawAudioInWav } from './wav-wrapper.js';
import { callTelegram } from './utils.js';
import { getAvailableModels } from './menus.js';

// Timeouts in milliseconds
export const DOWNLOAD_TIMEOUT = 30000;
export const TRANSCRIBE_TIMEOUT = 30000;

// Default API settings
export const DEFAULT_API_BASE = 'https://api.groq.com/openai/v1';
export const DEFAULT_WHISPER_MODEL = 'whisper-large-v3';

/**
 * Reads the first numBytes of a file using an HTTP Range request or stream read.
 */
export async function readFirstBytes(fileUrl, numBytes = 64) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
  try {
    const res = await fetch(fileUrl, {
      headers: { 'Range': `bytes=0-${numBytes - 1}` },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP status ${res.status}`);
    }
    
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      while (received < numBytes) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
        }
      }
      try { await reader.cancel(); } catch { /* ignore */ }
      controller.abort();
      
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return merged.subarray(0, numBytes);
    } else {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf).subarray(0, numBytes);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Transcribe the audio/video file via Groq/OpenAI Whisper API.
 */
export async function transcribeAudio(fileId, config, settings, overridePrompt) {
  const token = config.telegramBotToken;
  const apiKey = config.whisperApiKey;
  const apiBase = config.whisperApiBase || DEFAULT_API_BASE;
  
  const availableModels = getAvailableModels(config);
  const whisperModel = settings.model || availableModels[0] || DEFAULT_WHISPER_MODEL;
  
  const whisperLanguage = settings.lang;
  const defaultPrompt = config.whisperPrompt || '';
  const whisperPrompt = overridePrompt !== undefined
    ? overridePrompt
    : (settings.prompt !== undefined
      ? settings.prompt
      : defaultPrompt);

  try {
    // 2. Get file info from Telegram
    const fileInfo = await callTelegram(token, 'getFile', { file_id: fileId });
    
    if (!fileInfo.ok) {
      return { ok: false, error: fileInfo.error || 'Failed to get file info' };
    }

    const filePath = fileInfo.result.file_path || '';
    const fileSizeBytes = fileInfo.result.file_size || 0;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    let ext = filePath.split('.').pop() || 'ogg';
    if (ext === 'oga') ext = 'ogg';

    // Check if the extension is an unsupported video format
    if (['mov', 'mkv', 'avi', '3gp', 'flv', 'wmv', 'm4v'].includes(ext.toLowerCase())) {
      return { ok: false, error: 'UNSUPPORTED_VIDEO_FORMAT' };
    }

    // Optimize: range requests for unknown/non-native formats > 5 MB
    const NATIVE_EXTENSIONS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'oga', 'flac'];
    const isNative = NATIVE_EXTENSIONS.includes(ext.toLowerCase());
    if (!isNative && fileSizeBytes > 5 * 1024 * 1024) {
      console.log(`Non-native format extension .${ext} with size ${fileSizeBytes} bytes exceeds 5MB. Performing partial Range request check...`);
      try {
        const firstBytes = await readFirstBytes(fileUrl, 64);
        const detected = detectAudioFormat(firstBytes, filePath);
        if (!detected) {
          console.warn(`Format check failed for .${ext} file. Aborting.`);
          return { ok: false, error: 'UNSUPPORTED_AUDIO_FORMAT' };
        }
        console.log(`Format detected: ${detected}. Proceeding with full download.`);
      } catch (rangeErr) {
        console.error('Failed to perform range check, falling back to full download:', rangeErr.message);
      }
    }

    const audioRes = await fetch(fileUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });
    if (!audioRes.ok) {
      return { ok: false, error: `Telegram file download HTTP status ${audioRes.status}` };
    }
    const audioBuffer = new Uint8Array(await audioRes.arrayBuffer());

    let finalAudioData = audioBuffer;
    const detectedFormat = detectAudioFormat(audioBuffer, filePath);
    let wasConverted = false;

    console.log(`Format detection: ext=.${ext}, sig=${detectedFormat ?? 'none (native container or unknown)'}`);
    
    if (detectedFormat === 'aac') {
      console.log(`Detected raw ADTS-AAC stream (ext: .${ext}), wrapping in WAV (0x1600)...`);
      try {
        finalAudioData = wrapAacInWav(audioBuffer);
        ext = 'wav';
        wasConverted = true;
      } catch (wrapErr) {
        console.error('Failed to wrap AAC in WAV:', wrapErr.message);
      }
    } else if (detectedFormat === 'caf') {
      console.log(`Detected Apple CAF stream (ext: .${ext}), converting to WAV (0x1600)...`);
      try {
        finalAudioData = wrapCafInWav(audioBuffer);
        ext = 'wav';
        wasConverted = true;
      } catch (wrapErr) {
        console.error('Failed to wrap CAF in WAV:', wrapErr.message);
      }
    } else if (detectedFormat === 'amr-nb' || detectedFormat === 'amr-wb') {
      console.log(`Detected AMR stream (format: ${detectedFormat}), wrapping in WAV...`);
      try {
        const headerLen = detectedFormat === 'amr-nb' ? 6 : 9;
        const rawData = audioBuffer.subarray(headerLen);
        finalAudioData = wrapRawAudioInWav(rawData, detectedFormat);
        ext = 'wav';
        wasConverted = true;
      } catch (wrapErr) {
        console.error(`Failed to wrap ${detectedFormat} in WAV:`, wrapErr.message);
      }
    } else if (detectedFormat === 'gsm' || detectedFormat === 'alaw' || detectedFormat === 'mulaw') {
      console.log(`Detected raw audio stream (format: ${detectedFormat}), wrapping in WAV...`);
      try {
        finalAudioData = wrapRawAudioInWav(audioBuffer, detectedFormat);
        ext = 'wav';
        wasConverted = true;
      } catch (wrapErr) {
        console.error(`Failed to wrap ${detectedFormat} in WAV:`, wrapErr.message);
      }
    } else if (!NATIVE_EXTENSIONS.includes(ext.toLowerCase())) {
      console.warn(`Format .${ext} is unsupported and cannot be converted.`);
      return { ok: false, error: 'UNSUPPORTED_AUDIO_FORMAT' };
    }

    // Determine correct MIME type
    let mimeType = 'audio/ogg';
    if (ext === 'mp3' || ext === 'mpeg' || ext === 'mpga') mimeType = 'audio/mpeg';
    else if (ext === 'm4a' || ext === 'mp4') mimeType = 'audio/mp4';
    else if (ext === 'webm') mimeType = 'audio/webm';
    else if (ext === 'wav') mimeType = 'audio/wav';
    else if (ext === 'flac') mimeType = 'audio/flac';

    const formData = new FormData();
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

    const whisperStart = Date.now();
    const apiRes = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT),
    });
    const whisperDurationSec = ((Date.now() - whisperStart) / 1000).toFixed(1);

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      return { ok: false, error: `Transcription API HTTP ${apiRes.status}: ${errorText}` };
    }

    const transcription = await apiRes.json();
    if (!transcription.text) {
      return { ok: false, error: `Transcription API returned empty response: ${JSON.stringify(transcription)}` };
    }

    // Experimental post-processing: replace " — " with "\n— "
    let processedText = transcription.text.trim();
    processedText = processedText.replace(/ — /g, '\n— ');

    // Add newline before each new sentence (supports all languages via Unicode properties)
    processedText = processedText.replace(/([.?!]['"]?)\s+(?=\p{L}|\p{N})/gu, '$1\n');

    return { 
      ok: true, 
      text: processedText, 
      actualFormat: ext,
      signatureFormat: detectedFormat,
      wasConverted,
      whisperDuration: whisperDurationSec
    };
  } catch (e) {
    return { ok: false, error: `Internal transcription exception: ${e.message || e}` };
  }
}

/**
 * Check if the given MIME type and/or filename represents an unsupported video container (MOV, MKV, AVI, etc.)
 */
export function isUnsupportedVideoFile(mime, name) {
  // If it has a video MIME type, it must be either video/mp4 or video/webm.
  // Any other video MIME type (like video/quicktime, video/x-matroska, etc.) is unsupported.
  if (mime && mime.startsWith('video/')) {
    if (mime !== 'video/mp4' && mime !== 'video/webm') {
      return true;
    }
  }

  // If the filename has an extension, and it's one of the known unsupported video formats, reject it.
  if (name) {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['mov', 'mkv', 'avi', '3gp', 'flv', 'wmv', 'm4v'].includes(ext)) {
      return true;
    }
  }

  return false;
}
