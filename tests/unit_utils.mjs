/**
 * tests/unit_utils.mjs
 * Category A: Core Utilities & Config Parsing Unit Tests
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getHeader, sha256, callTelegram, setDebugOwnerId, estimateTokens, MAX_PROMPT_TOKENS, truncateTokensFromLeft, isOwner } from '../lib/utils.js';
import { getAvailableModels } from '../lib/menus.js';
import { createConfig } from '../lib/core.js';
import { isAdtsAac, wrapAacInWav, wrapCafInWav, wrapRawAudioInWav, detectAudioFormat } from '../lib/wav-wrapper.js';
import { parseWebhookConfig, buildWebhookSetup } from '../lib/webhook-settings.js';

// ----------------------------------------------------
// 1. getHeader() tests
// ----------------------------------------------------
function testGetHeader() {
  console.log('\n--- 1. Testing getHeader() ---');

  // Case insensitive lookups
  const h = { 'Content-Type': 'application/json', 'X-Custom': 'VALUE' };
  assert.strictEqual(getHeader(h, 'content-type'), 'application/json', 'lowercase lookup must work');
  assert.strictEqual(getHeader(h, 'CONTENT-TYPE'), 'application/json', 'UPPERCASE lookup must work');
  assert.strictEqual(getHeader(h, 'x-custom'), 'VALUE', 'mixed-case lookup must work');
  assert.strictEqual(getHeader(h, 'x-missing'), null, 'missing key must return null');
  assert.strictEqual(getHeader(null, 'x-foo'), null, 'null headers must return null');
  assert.strictEqual(getHeader(undefined, 'x-foo'), null, 'undefined headers must return null');
  assert.strictEqual(getHeader({}, 'x-foo'), null, 'empty headers must return null');
  assert.strictEqual(getHeader('not-an-object', 'content-type'), null, 'getHeader must return null for non-object headers');

  console.log('✅ getHeader: case-insensitivity and boundary checks passed');
}

// ----------------------------------------------------
// 2. sha256() tests
// ----------------------------------------------------
async function testSha256() {
  console.log('\n--- 2. Testing sha256() ---');

  // Standard SHA-256 test vectors
  const h = await sha256('abc');
  assert.strictEqual(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256("abc") must produce known digest');

  const empty = await sha256('');
  assert.strictEqual(empty, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'sha256("") must produce known digest');

  // Unicode check
  const unicodeHash = await sha256('Привет, мир! 🌍');
  assert.strictEqual(typeof unicodeHash, 'string', 'SHA-256 hash must be a string');
  assert.strictEqual(unicodeHash.length, 64, 'SHA-256 hash must be 64 characters long');

  // Determinism check
  const repeat1 = await sha256('hello world');
  const repeat2 = await sha256('hello world');
  assert.strictEqual(repeat1, repeat2, 'sha256 must be deterministic');

  console.log('✅ sha256: known vectors, unicode and determinism checked');
}

// ----------------------------------------------------
// 3. isAdtsAac() & wrapAacInM4a() tests
// ----------------------------------------------------
async function testAacProcessing() {
  console.log('\n--- 3. Testing ADTS-AAC, CAF, and Raw Audio Detection & Wrapping ---');

  // isAdtsAac null / empty / short
  assert.strictEqual(isAdtsAac(null), false);
  assert.strictEqual(isAdtsAac(undefined), false);
  assert.strictEqual(isAdtsAac(new Uint8Array([])), false);
  assert.strictEqual(isAdtsAac(new Uint8Array([0xFF])), false);

  // isAdtsAac valid syncword (12 bits: 0xFFF) - second byte upper nibble must be 0xF
  for (let nibble = 0x00; nibble <= 0x0F; nibble++) {
    const buf = new Uint8Array([0xFF, 0xF0 | nibble]);
    assert.strictEqual(isAdtsAac(buf), true, `0xFF 0x${(0xF0 | nibble).toString(16).toUpperCase()} should be ADTS-AAC`);
  }

  // isAdtsAac invalid
  assert.strictEqual(isAdtsAac(new Uint8Array([0xFF, 0xE1])), false);
  assert.strictEqual(isAdtsAac(new Uint8Array([0xFE, 0xF1])), false);
  assert.strictEqual(isAdtsAac(new Uint8Array([0x4F, 0x67, 0x67, 0x53])), false, 'OGG header is NOT ADTS');

  // detectAudioFormat checks
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x23, 0x21, 0x41, 0x4D, 0x52, 0x0A])), 'amr-nb');
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x23, 0x21, 0x41, 0x4D, 0x52, 0x2D, 0x57, 0x42, 0x0A])), 'amr-wb');
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x63, 0x61, 0x66, 0x66])), 'caf');
  assert.strictEqual(detectAudioFormat(new Uint8Array([0xFF, 0xF1, 0x00, 0x00])), 'aac');
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x52, 0x49, 0x46, 0x46])), null);
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x49, 0x44, 0x33])), null);
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x4F, 0x67, 0x67, 0x53])), null);
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x66, 0x4C, 0x61, 0x43])), null);
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x1A, 0x45, 0xDF, 0xA3])), null);
  
  // Extension fallbacks
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x20, 0x00, 0x00, 0x00]), 'voice.gsm'), 'gsm');
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 'voice.al'), 'alaw');
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 'voice.ulaw'), 'mulaw');
  assert.strictEqual(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 'voice.bin'), null);

  // wrapAacInWav check
  // Create a minimal valid 7-byte ADTS header
  // Profile = 1 (AAC-LC), sampleRateIndex = 4 (44100 Hz), channels = 2
  const mockAac = new Uint8Array([
    0xFF, 0xF1, // Sync & protection absent
    0x50,       // Profile (01) | sampleRateIndex (0100) | channels (0)
    0x80,       // channels (10) | length upper bits (0)
    0x07,       // length (7 bytes total)
    0x1F, 0xFC  // buffer fullness
  ]);
  const wav = wrapAacInWav(mockAac);
  assert.strictEqual(wav.length, 46 + mockAac.length);
  // Verify format tag is 0x1600 (little endian: 0x00, 0x16 at offset 20, 21)
  assert.strictEqual(wav[20], 0x00);
  assert.strictEqual(wav[21], 0x16);
  // Verify channels is 2 (at offset 22)
  assert.strictEqual(wav[22], 2);
  // Verify sample rate is 44100 (little endian: 0x44, 0xAC, 0x00, 0x00 = 44100 at offset 24)
  assert.strictEqual(wav[24] | (wav[25] << 8) | (wav[26] << 16) | (wav[27] << 24), 44100);

  // wrapAacInWav error path on invalid data
  try {
    wrapAacInWav(new Uint8Array([0x00, 0x00, 0x00, 0x00]));
    assert.fail('Should have failed to wrap invalid AAC buffer');
  } catch (err) {
    assert.ok(err.message.includes('valid ADTS-AAC stream'), 'Should error on invalid AAC data');
  }

  // wrapCafInWav error path on invalid data
  try {
    wrapCafInWav(new Uint8Array([0x00, 0x00, 0x00, 0x00]));
    assert.fail('Should have failed to wrap invalid CAF buffer');
  } catch (err) {
    assert.ok(err.message.includes('CAF buffer') || err.message.includes('valid CAF file'), 'Should error on invalid CAF data');
  }

  // Successful wrapCafInWav test
  const descChunkData = new Uint8Array(32);
  const descView = new DataView(descChunkData.buffer);
  descView.setFloat64(0, 16000, false); // mSampleRate (16000)
  descChunkData[8] = 0x61; descChunkData[9] = 0x61; descChunkData[10] = 0x63; descChunkData[11] = 0x20; // mFormatID = 'aac '
  descView.setUint32(24, 1, false); // mChannelsPerFrame (1)

  const paktChunkData = new Uint8Array(25);
  const paktView = new DataView(paktChunkData.buffer);
  paktView.setBigInt64(0, 1n, false); // mNumberPackets
  paktView.setBigInt64(8, 1024n, false); // mNumberValidFrames
  paktChunkData[24] = 4; // Packet 0 size (4 bytes)

  const dataChunkData = new Uint8Array(8);
  dataChunkData.set([1, 2, 3, 4], 4); // 4 bytes of dummy payload

  const cafHeader = new Uint8Array([0x63, 0x61, 0x66, 0x66, 0, 1, 0, 0]); // 'caff'

  function makeCafChunk(type, data) {
    const chunk = new Uint8Array(12 + data.length);
    for (let i = 0; i < 4; i++) chunk[i] = type.charCodeAt(i);
    const view = new DataView(chunk.buffer);
    view.setBigInt64(4, BigInt(data.length), false);
    chunk.set(data, 12);
    return chunk;
  }

  const descChunk = makeCafChunk('desc', descChunkData);
  const paktChunk = makeCafChunk('pakt', paktChunkData);
  const dataChunk = makeCafChunk('data', dataChunkData);

  const buildCaf = (chunksList) => {
    const totalLen = cafHeader.length + chunksList.reduce((acc, c) => acc + c.length, 0);
    const out = new Uint8Array(totalLen);
    out.set(cafHeader, 0);
    let offset = cafHeader.length;
    for (const c of chunksList) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  };

  const validCaf = buildCaf([descChunk, paktChunk, dataChunk]);
  const cafWav = wrapCafInWav(validCaf);
  assert.strictEqual(cafWav[20], 0x00);
  assert.strictEqual(cafWav[21], 0x16);
  assert.strictEqual(cafWav[24] | (cafWav[25] << 8) | (cafWav[26] << 16) | (cafWav[27] << 24), 16000);

  // wrapCafInWav missing desc chunk
  try {
    wrapCafInWav(buildCaf([paktChunk, dataChunk]));
    assert.fail('Should fail without desc chunk');
  } catch (err) {
    assert.ok(err.message.includes('Missing desc chunk'), 'Should throw missing desc error');
  }

  // wrapCafInWav unsupported format ID
  const badDescData = new Uint8Array(descChunkData);
  badDescData[8] = 0x6D; badDescData[9] = 0x70; badDescData[10] = 0x33; badDescData[11] = 0x20; // 'mp3 '
  try {
    wrapCafInWav(buildCaf([makeCafChunk('desc', badDescData), paktChunk, dataChunk]));
    assert.fail('Should fail with non-aac format');
  } catch (err) {
    assert.ok(err.message.includes('Unsupported CAF codec'), 'Should throw unsupported codec error');
  }

  // wrapCafInWav missing pakt chunk
  try {
    wrapCafInWav(buildCaf([descChunk, dataChunk]));
    assert.fail('Should fail without pakt chunk');
  } catch (err) {
    assert.ok(err.message.includes('Missing pakt chunk'), 'Should throw missing pakt error');
  }

  // wrapCafInWav missing data chunk
  try {
    wrapCafInWav(buildCaf([descChunk, paktChunk]));
    assert.fail('Should fail without data chunk');
  } catch (err) {
    assert.ok(err.message.includes('Missing data chunk'), 'Should throw missing data error');
  }


  // wrapRawAudioInWav checks
  const rawData = new Uint8Array([1, 2, 3, 4]);
  const amrWav = wrapRawAudioInWav(rawData, 'amr-nb');
  assert.strictEqual(amrWav[20], 0x57); // WAVE_FORMAT_AMR_NB tag = 0x0057
  assert.strictEqual(amrWav[21], 0x00);

  const amrWbWav = wrapRawAudioInWav(rawData, 'amr-wb');
  assert.strictEqual(amrWbWav[20], 0x58); // WAVE_FORMAT_AMR_WB tag = 0x0058
  assert.strictEqual(amrWbWav[21], 0x00);

  const gsmWav = wrapRawAudioInWav(rawData, 'gsm');
  assert.strictEqual(gsmWav[20], 0x31); // WAVE_FORMAT_GSM610 tag = 0x0031
  assert.strictEqual(gsmWav[21], 0x00);

  const alawWav = wrapRawAudioInWav(rawData, 'alaw');
  assert.strictEqual(alawWav[20], 0x06); // WAVE_FORMAT_ALAW tag = 0x0006
  assert.strictEqual(alawWav[21], 0x00);

  const mulawWav = wrapRawAudioInWav(rawData, 'mulaw');
  assert.strictEqual(mulawWav[20], 0x07); // WAVE_FORMAT_MULAW tag = 0x0007
  assert.strictEqual(mulawWav[21], 0x00);

  // wrapRawAudioInWav error path
  try {
    wrapRawAudioInWav(rawData, 'invalid-codec');
    assert.fail('Should fail on unsupported raw format');
  } catch (err) {
    assert.ok(err.message.includes('Unsupported raw format'), 'Should throw format error');
  }

  console.log('✅ AAC, CAF and raw audio wrapping tests passed');
}

// ----------------------------------------------------
// 4. parseWebhookConfig() & buildWebhookSetup() tests
// ----------------------------------------------------
function testWebhookSettings() {
  console.log('\n--- 4. Testing Webhook Settings Configs ---');

  // Basic Parsing
  const mockWebhookInfo = {
    url: 'https://my-bot.vercel.app/api/webhook?owner=12345&lang=ru&verbose=on&groups=off',
    allowed_updates: ['message', 'business_message']
  };
  const config = parseWebhookConfig(mockWebhookInfo);
  assert.strictEqual(config.owner, '12345');
  assert.strictEqual(config.lang, 'ru');
  assert.strictEqual(config.verbose, true);
  assert.strictEqual(config.groups, false);
  assert.strictEqual(config.secretary, true);
  assert.strictEqual(config.guest, false);

  // Parsing edge cases
  const empty = parseWebhookConfig({});
  assert.strictEqual(empty.groups, true, 'groups must default to true');
  assert.strictEqual(empty.guest, false, 'guest must default to false');
  assert.strictEqual(empty.secretary, false, 'secretary must default to false');
  assert.strictEqual(empty.verbose, false, 'verbose must default to false');
  assert.strictEqual(empty.lang, 'auto', 'lang must default to auto');
  assert.strictEqual(empty.langbot, 'en', 'langbot must default to en');
  assert.strictEqual(empty.owner, '', 'owner must default to empty string');

  const emptyPrompt = parseWebhookConfig({ url: 'https://example.com/api/webhook?prompt=' });
  assert.strictEqual(emptyPrompt.prompt, '', 'empty prompt query param');

  const encodedPrompt = parseWebhookConfig({ url: 'https://example.com/api/webhook?prompt=Hello%20World' });
  assert.strictEqual(encodedPrompt.prompt, 'Hello World', 'URL-encoded prompt decoding');

  assert.ok(typeof parseWebhookConfig({ url: '???????????' }) === 'object', 'Malformed URL fallback');

  // Basic Setup Building
  const setupConfig = {
    owner: '12345',
    lang: 'de',
    verbose: false,
    groups: true,
    secretary: true,
    guest: false
  };
  const setup = buildWebhookSetup('https://my-bot.vercel.app', 'mock_token', setupConfig, 'mock_secret_token');
  const setupUrl = new URL(setup.url);
  assert.strictEqual(setupUrl.origin, 'https://my-bot.vercel.app');
  assert.strictEqual(setupUrl.searchParams.get('owner'), '12345');
  assert.strictEqual(setupUrl.searchParams.get('lang'), 'de');
  assert.strictEqual(setup.secret_token, 'mock_secret_token');
  assert.deepStrictEqual(
    setup.allowed_updates, 
    ['message', 'my_chat_member', 'callback_query', 'business_connection', 'business_message', 'edited_business_message']
  );

  // Setup Building edge cases
  const withSlash = buildWebhookSetup('https://example.com/', 'token', {}, 'secret');
  assert.ok(!withSlash.url.includes('//api'), 'Trailing slash stripped');

  const allDefault = buildWebhookSetup('https://example.com', 'token', {
    groups: true,
    verbose: false,
    notify_add: true,
    notify_conn: true,
    notify_err: true,
    lang: 'auto',
    langbot: 'en',
    autodetect: true,
    prompt: undefined,
    owner: '',
  }, 'secret');
  assert.strictEqual(new URL(allDefault.url).search, '', 'All-default config must produce clean URL');

  const withGuest = buildWebhookSetup('https://example.com', 'token', { guest: true }, 'secret');
  assert.ok(withGuest.allowed_updates.includes('guest_message'));

  // Prompt round-trip
  const specialPrompt = 'Привет! Hello, world. Test: 100%';
  const withPrompt = buildWebhookSetup('https://example.com', 'token', { prompt: specialPrompt }, 'secret');
  const parsedBack = parseWebhookConfig(withPrompt);
  assert.strictEqual(parsedBack.prompt, specialPrompt, 'Prompt survives build-parse round-trip');

  // Long prompt limit (MAX_PROMPT_TOKENS) - truncates from the left
  const suffix = 'A'.repeat(MAX_PROMPT_TOKENS * 4); // 224 tokens
  const longPrompt = 'B'.repeat(100) + suffix;
  const withLongPrompt = buildWebhookSetup('https://example.com', 'token', { prompt: longPrompt }, 'secret');
  const decodedVal = decodeURIComponent(new URL(withLongPrompt.url).searchParams.get('prompt'));
  assert.strictEqual(decodedVal, suffix, 'Prompt truncated from the left to MAX_PROMPT_TOKENS tokens');

  console.log('✅ Webhook settings: parsing, building and limit checks passed');
}

// ----------------------------------------------------
// 5. getAvailableModels() & isOwner() tests
// ----------------------------------------------------
function testCommandMetaHelpers() {
  console.log('\n--- 5. Testing Models and Owner resolution ---');

  // getAvailableModels defaults
  const defaults = getAvailableModels({});
  assert.ok(Array.isArray(defaults) && defaults.length > 0);
  assert.ok(defaults.every(m => typeof m === 'string' && m.length > 0));

  // getAvailableModels custom
  assert.deepStrictEqual(getAvailableModels({ whisperModels: 'model-a, model-b ,model-c ' }), ['model-a', 'model-b', 'model-c']);
  assert.deepStrictEqual(getAvailableModels({ whisperModels: 'whisper-1' }), ['whisper-1']);
  assert.deepStrictEqual(getAvailableModels({ whisperModels: 'a,b,' }), ['a', 'b']);
  assert.ok(getAvailableModels({ whisperModels: '' }).length > 0);

  // isOwner
  assert.strictEqual(isOwner(12345, '12345'), true);
  assert.strictEqual(isOwner('12345', 12345), true);
  assert.strictEqual(isOwner(12345, 12345), true);
  assert.strictEqual(isOwner('12345', '12345'), true);
  assert.strictEqual(isOwner(99999, '12345'), false);
  assert.strictEqual(isOwner(0, '0'), true);
  assert.strictEqual(isOwner(12345, null), false);
  assert.strictEqual(isOwner(12345, undefined), false);
  assert.strictEqual(isOwner(12345, ''), false);

  console.log('✅ Models and Owners: resolved models and owners flags successfully');
}

// ----------------------------------------------------
// 6. createConfig() (Category A Config Generation)
// ----------------------------------------------------
function testConfigGeneration() {
  console.log('\n--- 6. Testing Config Generation ---');

  const emptyConfig = createConfig({});
  assert.strictEqual(emptyConfig.version, '0.0.0', 'Fallback to 0.0.0');

  const envConfig = createConfig({ BOT_VERSION: '1.2.3', TELEGRAM_BOT_TOKEN: 'token' });
  assert.strictEqual(envConfig.version, '1.2.3', 'Inherits version');

  console.log('✅ createConfig: verified configuration values propagation');
}

// ----------------------------------------------------
// 7. Rate Limiting retries & exceptions in callTelegram
// ----------------------------------------------------
async function testRateLimitingAndExceptions() {
  console.log('\n--- 7. Testing Rate Limiting (429) & Fetch Exceptions ---');

  const originalFetch = globalThis.fetch;
  let fetchAttempts = 0;
  
  // Test Case A: Wait <= 5s (Should Auto-Retry and Succeed)
  globalThis.fetch = async (_url, _options) => {
    fetchAttempts++;
    if (fetchAttempts === 1) {
      return {
        status: 429,
        ok: false,
        json: async () => ({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests',
          parameters: { retry_after: 1 }
        })
      };
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 8888 } })
    };
  };

  const start = Date.now();
  const resA = await callTelegram('mock_token', 'sendMessage', { chat_id: 123, text: 'test' });
  const duration = Date.now() - start;

  assert.strictEqual(fetchAttempts, 2);
  assert.strictEqual(resA.ok, true);
  assert.strictEqual(resA.result.message_id, 8888);
  assert.ok(duration >= 1000);

  // Test Case B: Wait > 5s (Should Skip Retry)
  fetchAttempts = 0;
  globalThis.fetch = async () => {
    fetchAttempts++;
    return {
      status: 429,
      ok: false,
      json: async () => ({
        ok: false,
        error_code: 429,
        parameters: { retry_after: 6 } // > 5s threshold
      })
    };
  };

  const resB = await callTelegram('mock_token', 'sendMessage', { chat_id: 123, text: 'test' });
  assert.strictEqual(fetchAttempts, 1);
  assert.strictEqual(resB.ok, false);

  // Test Case C: Fetch Exception Handling
  globalThis.fetch = async () => {
    throw new Error('Connection refused');
  };

  const resC = await callTelegram('token', 'sendMessage', { chat_id: 123, text: 'hi' });
  assert.strictEqual(resC.ok, false);
  assert.ok(resC.error.includes('Connection refused'));

  // Test Case D: Owner Alert on skipped 429
  let notifyCall = null;
  let callsCount = 0;
  globalThis.fetch = async (url, options) => {
    callsCount++;
    const pathName = new URL(url).pathname;
    if (pathName.includes('sendMessage') && callsCount > 1) {
      notifyCall = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return {
      status: 429,
      ok: false,
      json: async () => ({
        ok: false,
        error_code: 429,
        parameters: { retry_after: 10 }
      })
    };
  };

  setDebugOwnerId(99999);
  await callTelegram('token', 'sendMessage', { chat_id: 123, text: 'hi' });
  assert.ok(notifyCall);
  assert.strictEqual(notifyCall.chat_id, 99999);
  assert.ok(notifyCall.text.includes('Rate Limit'));
  setDebugOwnerId(null);

  globalThis.fetch = originalFetch;
  console.log('✅ callTelegram: verified 429 retries, skipping and notification loops');
}

// ----------------------------------------------------
// 8. Deno & NPM package sync script checks
// ----------------------------------------------------
function testDenoPackageSync() {
  console.log('\n--- 8. Testing Deno and NPM Script Synchronization ---');
  
  const pkgPath = path.join(process.cwd(), 'package.json');
  const denoPath = path.join(process.cwd(), 'deno.json');
  
  if (!fs.existsSync(pkgPath) || !fs.existsSync(denoPath)) {
    console.warn('⚠️ testDenoPackageSync skipped: package.json or deno.json not found locally.');
    return;
  }
  
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deno = JSON.parse(fs.readFileSync(denoPath, 'utf8'));
  
  assert.ok(pkg.scripts);
  assert.ok(deno.tasks);
  
  const ignoreScripts = ['postinstall', 'check', 'lint'];
  
  for (const scriptName of Object.keys(pkg.scripts)) {
    if (ignoreScripts.includes(scriptName)) continue;
    assert.ok(deno.tasks[scriptName], `deno.json tasks must synchronize npm scripts for: ${scriptName}`);
  }
  console.log('✅ deno.json & package.json scripts synchronization verified');
}

// ----------------------------------------------------
// 8. estimateTokens() tests
// ----------------------------------------------------
function testEstimateTokens() {
  console.log('\n--- 8. Testing estimateTokens() ---');

  // Empty / falsy
  assert.strictEqual(estimateTokens(''), 0, 'empty string = 0 tokens');
  assert.strictEqual(estimateTokens(null), 0, 'null = 0 tokens');

  // Pure ASCII: 4 chars = 1 token
  assert.strictEqual(estimateTokens('AAAA'), 1, '4 ASCII chars = 1 token');
  assert.strictEqual(estimateTokens('A'.repeat(8)), 2, '8 ASCII chars = 2 tokens');
  assert.strictEqual(estimateTokens('A'.repeat(MAX_PROMPT_TOKENS * 4)), MAX_PROMPT_TOKENS, `${MAX_PROMPT_TOKENS * 4} ASCII chars = ${MAX_PROMPT_TOKENS} tokens (max)`);

  // (MAX_PROMPT_TOKENS * 4 + 1) ASCII chars exceeds limit
  assert.ok(estimateTokens('A'.repeat(MAX_PROMPT_TOKENS * 4 + 1)) > MAX_PROMPT_TOKENS, `ASCII chars exceeds ${MAX_PROMPT_TOKENS}-token limit`);

  // Pure Cyrillic: 2 chars = 1 token
  assert.strictEqual(estimateTokens('АА'), 1, '2 Cyrillic chars = 1 token');
  assert.strictEqual(estimateTokens('А'.repeat(4)), 2, '4 Cyrillic chars = 2 tokens');
  assert.strictEqual(estimateTokens('А'.repeat(MAX_PROMPT_TOKENS * 2)), MAX_PROMPT_TOKENS, `${MAX_PROMPT_TOKENS * 2} Cyrillic chars = ${MAX_PROMPT_TOKENS} tokens (max)`);

  // (MAX_PROMPT_TOKENS * 2 + 1) Cyrillic chars exceeds limit
  assert.ok(estimateTokens('А'.repeat(MAX_PROMPT_TOKENS * 2 + 1)) > MAX_PROMPT_TOKENS, `Cyrillic chars exceeds ${MAX_PROMPT_TOKENS}-token limit`);

  // Test truncateTokensFromLeft
  assert.strictEqual(truncateTokensFromLeft('Hello world', 2), 'lo world', 'Truncates from left to 2 tokens');
  assert.strictEqual(truncateTokensFromLeft('Привет мир', 2), ' мир', 'Truncates Cyrillic from left to 2 tokens');
  assert.strictEqual(truncateTokensFromLeft('A', 5), 'A', 'Short string not truncated');

  console.log('✅ estimateTokens & truncateTokensFromLeft: all boundary checks passed');
}

export async function run() {
  testGetHeader();
  await testSha256();
  await testAacProcessing();
  testWebhookSettings();
  testCommandMetaHelpers();
  testConfigGeneration();
  await testRateLimitingAndExceptions();
  testDenoPackageSync();
  testEstimateTokens();
}
