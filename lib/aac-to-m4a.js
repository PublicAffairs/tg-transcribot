/**
 * lib/aac-to-m4a.js
 *
 * Detects whether an audio buffer contains a raw AAC (ADTS) stream and,
 * if so, transmuxes it into a standard fragmented-MP4 (M4A) container
 * that Groq / OpenAI Whisper can parse.
 *
 * Background:
 *   Telegram sometimes sends voice/audio as raw AAC-in-ADTS framing even when
 *   the file path ends in `.m4a`. Groq's Whisper rejects these files.
 *   We detect the ADTS sync-word (0xFF 0xFx) and re-wrap using mux.js.
 */

let _muxjs = null;

async function getMuxjs() {
  if (!_muxjs) {
    if (typeof Deno !== 'undefined') {
      // Deno Deploy and Val Town use the npm: prefix to load npm packages
      const m = await import('npm:mux.js');
      _muxjs = m.default || m;
    } else {
      // Node.js and Cloudflare Workers resolve standard package names
      const m = await import('mux.js');
      _muxjs = m.default || m;
    }
  }
  return _muxjs;
}

/**
 * Returns true if the buffer looks like a raw ADTS-framed AAC stream.
 * ADTS sync-word: 12 set bits → first byte 0xFF, upper nibble of second byte 0xF.
 *
 * @param {Uint8Array} buffer
 * @returns {boolean}
 */
export function isAdtsAac(buffer) {
  if (!buffer || buffer.length < 2) return false;
  return buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0;
}

/**
 * Wraps a raw ADTS-AAC buffer in a standard fragmented-MP4 container.
 * Returns a Promise<Uint8Array> with the re-muxed M4A data.
 *
 * @param {Uint8Array} aacBuffer  – raw ADTS AAC bytes
 * @returns {Promise<Uint8Array>}
 */
export async function wrapAacInM4a(aacBuffer) {
  const muxjs = await getMuxjs();
  
  return new Promise((resolve, reject) => {
    try {
      const transmuxer = new muxjs.mp4.Transmuxer({});

      let initSegment = null;
      const dataChunks = [];

      transmuxer.on('data', (segment) => {
        if (segment.initSegment && segment.initSegment.byteLength > 0) {
          initSegment = segment.initSegment;
        }
        if (segment.data && segment.data.byteLength > 0) {
          dataChunks.push(segment.data);
        }
      });

      transmuxer.on('done', () => {
        if (!initSegment || dataChunks.length === 0) {
          return reject(new Error('mux.js produced no output segments'));
        }

        // Concatenate initSegment + all data segments into one Uint8Array
        let totalLength = initSegment.byteLength;
        for (const chunk of dataChunks) totalLength += chunk.byteLength;

        const out = new Uint8Array(totalLength);
        out.set(initSegment, 0);
        let offset = initSegment.byteLength;
        for (const chunk of dataChunks) {
          out.set(chunk, offset);
          offset += chunk.byteLength;
        }

        resolve(out);
      });

      transmuxer.on('error', (err) => {
        reject(new Error(`mux.js transmuxer error: ${err && err.message || err}`));
      });

      transmuxer.push(new Uint8Array(aacBuffer));
      transmuxer.flush();

    } catch (err) {
      reject(err);
    }
  });
}
