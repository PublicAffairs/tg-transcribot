/**
 * lib/wav-wrapper.js
 *
 * Handles audio format detection,
 * ADTS-AAC parsing, Apple CAF parsing/re-wrapping, and wrapping raw audio streams
 * (AMR-NB, AMR-WB, GSM 06.10, A-law, U-law) into RIFF-WAV containers.
 */

const SAMPLING_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000,
  24000, 22050, 16000, 12000, 11025, 8000, 7350
];

/**
 * Returns true if the buffer starts with the ADTS sync-word (0xFF, 0xFx).
 *
 * @param {Uint8Array} buffer
 * @returns {boolean}
 */
export function isAdtsAac(buffer) {
  if (!buffer || buffer.length < 2) return false;
  return buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0;
}

/**
 * Detects the format of the audio buffer by examining its magic bytes and filename.
 *
 * @param {Uint8Array} buffer
 * @param {string} [filename]
 * @returns {string|null} Format ID or null if unknown
 */
export function detectAudioFormat(buffer, filename = '') {
  if (!buffer || buffer.length < 3) return null;

  // 1. AMR-NB: "#!AMR\n"
  if (buffer[0] === 0x23 && buffer[1] === 0x21 && buffer[2] === 0x41 && buffer[3] === 0x4D && buffer[4] === 0x52 && buffer[5] === 0x0A) {
    return 'amr-nb';
  }
  // 2. AMR-WB: "#!AMR-WB\n"
  if (buffer[0] === 0x23 && buffer[1] === 0x21 && buffer[2] === 0x41 && buffer[3] === 0x4D && buffer[4] === 0x52 && buffer[5] === 0x2D && buffer[6] === 0x57 && buffer[7] === 0x42 && buffer[8] === 0x0A) {
    return 'amr-wb';
  }
  // 3. Apple CAF: "caff"
  if (buffer[0] === 0x63 && buffer[1] === 0x61 && buffer[2] === 0x66 && buffer[3] === 0x66) {
    return 'caf';
  }
  // 4. ADTS-AAC: sync-word 0xFFF
  if (buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0) {
    return 'aac';
  }

  // Extension-based fallbacks for raw formats
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext === 'gsm') {
    if ((buffer[0] & 0xF0) === 0x20) {
      return 'gsm';
    }
  }
  if (ext === 'al' || ext === 'alaw') {
    return 'alaw';
  }
  if (ext === 'ul' || ext === 'ulaw' || ext === 'mulaw') {
    return 'mulaw';
  }

  return null;
}

/**
 * Parses ADTS header to extract sampling rate and number of channels.
 *
 * @param {Uint8Array} buffer
 * @returns {{sampleRate: number, channels: number}}
 */
export function parseAdtsHeader(buffer) {
  if (buffer.length < 7) {
    throw new Error('ADTS buffer is too short to parse header');
  }
  if (buffer[0] !== 0xFF || (buffer[1] & 0xF0) !== 0xF0) {
    throw new Error('Invalid ADTS syncword');
  }

  const samplingFrequencyIndex = (buffer[2] & 0x3C) >> 2;
  const sampleRate = SAMPLING_RATES[samplingFrequencyIndex] || 44100;

  const channelConfig = ((buffer[2] & 0x01) << 2) | ((buffer[3] & 0xC0) >> 6);
  const channels = channelConfig || 2;

  return { sampleRate, channels };
}

/**
 * Creates a 46-byte WAV header for ADTS-AAC stream (wFormatTag = 0x1600).
 *
 * @param {number} audioDataSize
 * @param {number} sampleRate
 * @param {number} channels
 * @returns {Uint8Array}
 */
export function createAdtsAacWavHeader(audioDataSize, sampleRate, channels) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);

  // 1. RIFF Header
  header[0] = 0x52; header[1] = 0x49; header[2] = 0x46; header[3] = 0x46; // "RIFF"
  view.setUint32(4, 38 + audioDataSize, true); // ChunkSize
  header[8] = 0x57; header[9] = 0x41; header[10] = 0x56; header[11] = 0x45; // "WAVE"

  // 2. fmt Chunk
  header[12] = 0x66; header[13] = 0x6D; header[14] = 0x74; header[15] = 0x20; // "fmt "
  view.setUint32(16, 18, true); // SubChunk1Size (18 for WAVEFORMATEX)
  view.setUint16(20, 0x1600, true); // wFormatTag = 0x1600 (WAVE_FORMAT_MPEG_ADTS_AAC)
  view.setUint16(22, channels, true); // nChannels
  view.setUint32(24, sampleRate, true); // nSamplesPerSec
  view.setUint32(28, sampleRate * channels, true); // nAvgBytesPerSec (estimate)
  view.setUint16(32, 1, true); // nBlockAlign
  view.setUint16(34, 0, true); // wBitsPerSample = 0 for compressed
  view.setUint16(36, 0, true); // cbSize = 0 (no extra bytes)

  // 3. data Chunk
  header[38] = 0x64; header[39] = 0x61; header[40] = 0x74; header[41] = 0x61; // "data"
  view.setUint32(42, audioDataSize, true); // SubChunk2Size

  return header;
}

/**
 * Wraps raw ADTS-AAC buffer in a WAVE_FORMAT_MPEG_ADTS_AAC (0x1600) WAV container.
 *
 * @param {Uint8Array} aacBuffer
 * @returns {Uint8Array} WAV buffer
 */
export function wrapAacInWav(aacBuffer) {
  if (!isAdtsAac(aacBuffer)) {
    throw new Error('Buffer is not a valid ADTS-AAC stream');
  }
  const { sampleRate, channels } = parseAdtsHeader(aacBuffer);
  const wavHeader = createAdtsAacWavHeader(aacBuffer.length, sampleRate, channels);

  const out = new Uint8Array(wavHeader.length + aacBuffer.length);
  out.set(wavHeader, 0);
  out.set(aacBuffer, wavHeader.length);
  return out;
}

/**
 * Generates a 7-byte ADTS header for a raw AAC frame.
 *
 * @param {number} payloadLength
 * @param {number} sampleRateIndex
 * @param {number} channels
 * @returns {Uint8Array}
 */
function makeAdtsHeader(payloadLength, sampleRateIndex, channels) {
  const header = new Uint8Array(7);
  const rle = 7 + payloadLength;

  header[0] = 0xFF; // Syncword
  header[1] = 0xF1; // Syncword (4 bits) | MPEG-4 (0) | Layer (00) | Protection absent (1)

  const profile = 1; // AAC-LC
  header[2] = ((profile & 3) << 6) | ((sampleRateIndex & 0x0F) << 2) | ((channels & 4) >> 2);
  header[3] = ((channels & 3) << 6) | ((rle & 0x1800) >> 11);
  header[4] = (rle & 0x7F8) >> 3;
  header[5] = ((rle & 0x07) << 5) | 0x1F;
  header[6] = 0xFC;

  return header;
}

/**
 * Parses Apple Core Audio Format (CAF) containing 'aac ' format, extracts raw AAC frames,
 * rebuilds ADTS packets and wraps them in a WAVE_FORMAT_MPEG_ADTS_AAC (0x1600) WAV container.
 *
 * @param {Uint8Array} cafBuffer
 * @returns {Uint8Array} WAV buffer
 */
export function wrapCafInWav(cafBuffer) {
  if (cafBuffer.length < 8) {
    throw new Error('CAF buffer is too short');
  }

  // Check header
  const fileType = String.fromCharCode(cafBuffer[0], cafBuffer[1], cafBuffer[2], cafBuffer[3]);
  if (fileType !== 'caff') {
    throw new Error('Not a valid CAF file (fileType !== caff)');
  }

  // Parse chunks
  let offset = 8;
  const chunks = {};
  while (offset < cafBuffer.length) {
    if (offset + 12 > cafBuffer.length) break;
    const chunkType = String.fromCharCode(cafBuffer[offset], cafBuffer[offset+1], cafBuffer[offset+2], cafBuffer[offset+3]);
    const view = new DataView(cafBuffer.buffer, cafBuffer.byteOffset + offset + 4, 8);
    let chunkSize = Number(view.getBigInt64(0, false)); // Big-endian int64

    const chunkHeaderSize = 12;
    const chunkDataOffset = offset + chunkHeaderSize;

    if (chunkSize === -1) {
      // Chunk extends to end of file
      chunkSize = cafBuffer.length - chunkDataOffset;
    }

    chunks[chunkType] = {
      offset: chunkDataOffset,
      size: chunkSize
    };

    offset = chunkDataOffset + chunkSize;
  }

  const descChunk = chunks['desc'];
  if (!descChunk) {
    throw new Error('Missing desc chunk in CAF');
  }

  const descView = new DataView(cafBuffer.buffer, cafBuffer.byteOffset + descChunk.offset, descChunk.size);
  const sampleRate = descView.getFloat64(0, false);
  const formatID = String.fromCharCode(
    cafBuffer[descChunk.offset + 8],
    cafBuffer[descChunk.offset + 9],
    cafBuffer[descChunk.offset + 10],
    cafBuffer[descChunk.offset + 11]
  );
  const channels = descView.getUint32(24, false);

  if (formatID !== 'aac ') {
    throw new Error(`Unsupported CAF codec: ${formatID} (only aac is supported)`);
  }

  const paktChunk = chunks['pakt'];
  if (!paktChunk) {
    throw new Error('Missing pakt chunk for VBR audio in CAF');
  }

  const paktView = new DataView(cafBuffer.buffer, cafBuffer.byteOffset + paktChunk.offset, paktChunk.size);
  // Get number of packets (64-bit int)
  const numPackets = Number(paktView.getBigInt64(0, false));

  // Extract packet sizes from varint format
  let paktOffset = paktChunk.offset + 24;
  const packetSizes = [];
  for (let i = 0; i < numPackets; i++) {
    let val = 0;
    while (true) {
      if (paktOffset >= paktChunk.offset + paktChunk.size) break;
      const byte = cafBuffer[paktOffset++];
      val = (val << 7) | (byte & 0x7F);
      if ((byte & 0x80) === 0) break;
    }
    packetSizes.push(val);
  }

  const dataChunk = chunks['data'];
  if (!dataChunk) {
    throw new Error('Missing data chunk in CAF');
  }

  let dataOffset = dataChunk.offset + 4; // Skip mEditCount (4 bytes)
  const adtsFrames = [];

  // Match sample rate to ADTS index
  let sampleRateIndex = SAMPLING_RATES.indexOf(sampleRate);
  if (sampleRateIndex === -1) {
    let minDiff = Infinity;
    sampleRateIndex = 4; // Default to 44100
    for (let i = 0; i < SAMPLING_RATES.length; i++) {
      const diff = Math.abs(SAMPLING_RATES[i] - sampleRate);
      if (diff < minDiff) {
        minDiff = diff;
        sampleRateIndex = i;
      }
    }
  }

  let totalAdtsLength = 0;
  for (const size of packetSizes) {
    if (dataOffset + size > cafBuffer.length) break;
    const packetPayload = cafBuffer.subarray(dataOffset, dataOffset + size);
    dataOffset += size;

    const adtsHeader = makeAdtsHeader(size, sampleRateIndex, channels);
    const frame = new Uint8Array(7 + size);
    frame.set(adtsHeader, 0);
    frame.set(packetPayload, 7);

    adtsFrames.push(frame);
    totalAdtsLength += frame.length;
  }

  // Concatenate ADTS frames
  const adtsBuffer = new Uint8Array(totalAdtsLength);
  let adtsOffset = 0;
  for (const frame of adtsFrames) {
    adtsBuffer.set(frame, adtsOffset);
    adtsOffset += frame.length;
  }

  // Wrap compiled ADTS-AAC stream in WAV 0x1600
  const wavHeader = createAdtsAacWavHeader(adtsBuffer.length, sampleRate, channels);
  const out = new Uint8Array(wavHeader.length + adtsBuffer.length);
  out.set(wavHeader, 0);
  out.set(adtsBuffer, wavHeader.length);
  return out;
}

/**
 * Wraps raw audio (AMR, GSM, A-law, U-law) into a RIFF-WAV container with corresponding format tags.
 *
 * @param {Uint8Array} rawAudioData
 * @param {string} format 'amr-nb' | 'amr-wb' | 'gsm' | 'alaw' | 'mulaw'
 * @returns {Uint8Array} WAV buffer
 */
export function wrapRawAudioInWav(rawAudioData, format) {
  let wFormatTag;
  let sampleRate;
  let channels;
  let bitsPerSample;
  let blockAlign;
  let byteRate;
  let extraBytes;

  if (format === 'amr-nb') {
    wFormatTag = 0x0057; // WAVE_FORMAT_AMR_NB
    sampleRate = 8000;
    channels = 1;
    bitsPerSample = 0;
    blockAlign = 1;
    byteRate = 1600; // ~12.2 kbps
    extraBytes = new Uint8Array([0, 0]); // cbSize = 0
  } else if (format === 'amr-wb') {
    wFormatTag = 0x0058; // WAVE_FORMAT_AMR_WB
    sampleRate = 16000;
    channels = 1;
    bitsPerSample = 0;
    blockAlign = 1;
    byteRate = 3200; // ~23.85 kbps
    extraBytes = new Uint8Array([0, 0]); // cbSize = 0
  } else if (format === 'gsm') {
    wFormatTag = 0x0031; // WAVE_FORMAT_GSM610
    sampleRate = 8000;
    channels = 1;
    bitsPerSample = 0;
    blockAlign = 65;
    byteRate = 1625;
    extraBytes = new Uint8Array([2, 0, 0x40, 0x01]); // cbSize = 2, wSamplesPerBlock = 320
  } else if (format === 'alaw') {
    wFormatTag = 0x0006; // WAVE_FORMAT_ALAW
    sampleRate = 8000;
    channels = 1;
    bitsPerSample = 8;
    blockAlign = 1;
    byteRate = 8000;
    extraBytes = new Uint8Array([0, 0]); // cbSize = 0
  } else if (format === 'mulaw') {
    wFormatTag = 0x0007; // WAVE_FORMAT_MULAW
    sampleRate = 8000;
    channels = 1;
    bitsPerSample = 8;
    blockAlign = 1;
    byteRate = 8000;
    extraBytes = new Uint8Array([0, 0]); // cbSize = 0
  } else {
    throw new Error(`Unsupported raw format: ${format}`);
  }

  const extraLen = extraBytes ? extraBytes.length : 0;
  const fmtChunkSize = 16 + extraLen;
  const headerSize = 12 + (8 + fmtChunkSize) + 8;

  const header = new Uint8Array(headerSize);
  const view = new DataView(header.buffer);

  // "RIFF"
  header[0] = 0x52; header[1] = 0x49; header[2] = 0x46; header[3] = 0x46;
  view.setUint32(4, headerSize - 8 + rawAudioData.length, true);
  // "WAVE"
  header[8] = 0x57; header[9] = 0x41; header[10] = 0x56; header[11] = 0x45;

  // "fmt "
  header[12] = 0x66; header[13] = 0x6D; header[14] = 0x74; header[15] = 0x20;
  view.setUint32(16, fmtChunkSize, true);
  view.setUint16(20, wFormatTag, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  if (extraBytes) {
    header.set(extraBytes, 36);
  }

  // "data"
  const dataHeaderOffset = 12 + 8 + fmtChunkSize;
  header[dataHeaderOffset] = 0x64;
  header[dataHeaderOffset + 1] = 0x61;
  header[dataHeaderOffset + 2] = 0x74;
  header[dataHeaderOffset + 3] = 0x61;
  view.setUint32(dataHeaderOffset + 4, rawAudioData.length, true);

  const out = new Uint8Array(headerSize + rawAudioData.length);
  out.set(header, 0);
  out.set(rawAudioData, headerSize);
  return out;
}
