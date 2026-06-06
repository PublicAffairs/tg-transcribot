/**
 * tests/unit_webhook.mjs
 * Category C: Webhook Update Filtering & Deduplication Tests
 */

import assert from 'node:assert';
import { handleWebhook } from '../lib/core.js';
import { 
  recordedCalls, 
  installMockFetch, 
  restoreFetch, 
  makeReq, 
  mkJson,
  MOCK_CONFIG, 
  MOCK_CTX,
  assertMessageSent,
  assertNoMessageSent
} from './whitebox_helper.mjs';

// ----------------------------------------------------
// 1. Webhook Update Deduplication (FIFO cache)
// ----------------------------------------------------
async function testWebhookDeduplication() {
  console.log('\n--- 1. Testing Webhook Deduplication FIFO Eviction ---');
  installMockFetch();

  const config = { telegramBotToken: MOCK_CONFIG.telegramBotToken };

  const originalLog = console.log;
  let loggedDeduplications = [];
  console.log = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('[Deduplicator]')) {
      loggedDeduplications.push(msg);
    }
  };

  try {
    // A. Webhook FIFO cache limits (inserting 1001 unique updates triggers eviction of the 1st)
    // Cache limit is 1000.
    // Pushing 1001 updates means update_id 1 should be evicted when 1001 is added.
    for (let i = 1; i <= 1001; i++) {
      const req = makeReq({ update_id: i }, { owner: '99999' });
      await handleWebhook(req, config, MOCK_CTX);
    }

    // Clear logged output from initial inserts
    loggedDeduplications = [];

    // Now try processing update_id 2 first. It was the 2nd oldest, so it should NOT have been evicted yet.
    // It should be ignored as a duplicate.
    const req2 = makeReq({ update_id: 2 }, { owner: '99999' });
    await handleWebhook(req2, config, MOCK_CTX);
    assert.ok(
      loggedDeduplications.some(m => m.includes('Ignoring duplicate update_id: 2')),
      'update_id 2 should be ignored as a duplicate'
    );

    // Clear logs again
    loggedDeduplications = [];

    // Now try processing update_id 1. It was the oldest, so it should have been evicted.
    // If it was evicted, it should NOT print a deduplicator warning and will process again.
    const req1 = makeReq({ update_id: 1 }, { owner: '99999' });
    await handleWebhook(req1, config, MOCK_CTX);
    assert.strictEqual(loggedDeduplications.length, 0, 'update_id 1 should have been evicted and processed again');
  } finally {
    console.log = originalLog;
  }

  // B. Calling duplicate update_id twice to make sure only one message goes out
  recordedCalls.length = 0;
  const dedupUpdate = {
    update_id: 90001,
    message: {
      message_id: 901,
      chat: { id: 99999, type: 'private' },
      from: { id: 99999 },
      voice: { file_id: 'dedup_voice', file_size: 100, duration: 3 },
    },
  };
  const reqDedup = makeReq(dedupUpdate, { owner: '99999' });

  // First call — must process
  await handleWebhook(reqDedup, MOCK_CONFIG, MOCK_CTX);
  const firstCallCount = recordedCalls.filter(c => c.url.includes('/sendMessage')).length;

  // Second call with the same update_id — must be a no-op
  recordedCalls.length = 0;
  await handleWebhook(reqDedup, MOCK_CONFIG, MOCK_CTX);
  const secondCallCount = recordedCalls.filter(c => c.url.includes('/sendMessage')).length;

  assert.strictEqual(firstCallCount, 1, 'First update should trigger exactly one sendMessage');
  assert.strictEqual(secondCallCount, 0, 'Duplicate update_id must not trigger any sendMessage');

  restoreFetch();
  console.log('✅ Webhook Deduplication: verified cache limits and duplicate ignore flows');
}

// ----------------------------------------------------
// 2. Webhook secret validation (403 vs 200)
// ----------------------------------------------------
async function testWebhookSecretValidation() {
  console.log('\n--- 2. Testing Webhook secret validation ---');
  installMockFetch();

  const update = { update_id: 90002, message: { message_id: 902, chat: { id: 99999, type: 'private' }, from: { id: 99999 }, text: 'hi' } };

  // Wrong secret → 403 Forbidden
  const badReq = {
    headers: { 'x-telegram-bot-api-secret-token': 'completely_wrong_secret' },
    body: update,
    query: { owner: '99999' },
  };
  const badRes = await handleWebhook(badReq, MOCK_CONFIG, MOCK_CTX);
  assert.strictEqual(badRes.status, 403, 'Wrong secret must return 403 Forbidden');

  // Missing secret → 403 Forbidden
  const noSecretReq = { headers: {}, body: update, query: { owner: '99999' } };
  const noSecretRes = await handleWebhook(noSecretReq, MOCK_CONFIG, MOCK_CTX);
  assert.strictEqual(noSecretRes.status, 403, 'Missing secret must return 403 Forbidden');

  // Empty / no update body → 200 OK (even with correct secret)
  const emptyBodyReq = makeReq(null, { owner: '99999' });
  const emptyBodyRes = await handleWebhook(emptyBodyReq, MOCK_CONFIG, MOCK_CTX);
  assert.strictEqual(emptyBodyRes.status, 200, 'Empty body must return 200 OK');

  // Update without update_id → 200 OK
  const noIdReq = makeReq({ some: 'data' }, { owner: '99999' });
  const noIdRes = await handleWebhook(noIdReq, MOCK_CONFIG, MOCK_CTX);
  assert.strictEqual(noIdRes.status, 200, 'Update without update_id must return 200 OK');

  restoreFetch();
  console.log('✅ Webhook Secret: blocked wrong/missing secrets, tolerated empty request structures');
}

// ----------------------------------------------------
// 3. Bot Addressing & Mention Detection
// ----------------------------------------------------
async function testBotAddressingAndMentions() {
  console.log('\n--- 3. Testing Bot Mentions & Addressing ---');
  installMockFetch();

  // A. Group voice WITHOUT mention must still be transcribed (voice is always processed in groups)
  const noMentionVoiceUpdate = {
    update_id: 90010,
    message: {
      message_id: 910,
      chat: { id: -11111, type: 'group' },
      from: { id: 55555 },
      voice: { file_id: 'grp_voice', file_size: 100, duration: 2 },
    },
  };
  await handleWebhook(makeReq(noMentionVoiceUpdate, { owner: '99999', groups: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));
  const sentVoiceNoMention = recordedCalls.filter(c => c.url.includes('/sendMessage'));
  assert.ok(sentVoiceNoMention.length > 0, 'Group voice without bot mention is processed');

  // B. Text message in group with NO mention must be ignored (no sendMessage)
  recordedCalls.length = 0;
  const textNoMentionUpdate = {
    update_id: 90011,
    message: {
      message_id: 911,
      chat: { id: -11111, type: 'group' },
      from: { id: 55555 },
      text: 'Hello everyone in the group',
    },
  };
  await handleWebhook(makeReq(textNoMentionUpdate, { owner: '99999', groups: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));
  const textNoMentionSent = recordedCalls.filter(c => c.url.includes('/sendMessage'));
  assert.strictEqual(textNoMentionSent.length, 0, 'Text message in group without mention ignored');

  // C. Text message with bot mention in group from owner triggers handleCommand
  recordedCalls.length = 0;
  const textWithMentionUpdate = {
    update_id: 90012,
    message: {
      message_id: 912,
      chat: { id: -11111, type: 'group' },
      from: { id: 99999 },
      text: '@mybot help',
      entities: [{ type: 'mention', offset: 0, length: 6 }],
    },
  };
  await handleWebhook(makeReq(textWithMentionUpdate, { owner: '99999', groups: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));
  const textWithMentionSent = recordedCalls.filter(c => c.url.includes('/sendMessage'));
  assert.ok(textWithMentionSent.length > 0, 'Owner mention in group triggers command dispatcher');

  // D. Voice message in group with groups=off is ignored completely
  recordedCalls.length = 0;
  const voiceGroupsOffUpdate = {
    update_id: 90013,
    message: {
      message_id: 913,
      chat: { id: -22222, type: 'group' },
      from: { id: 55555 },
      voice: { file_id: 'grp_voice_off', file_size: 100, duration: 2 },
    },
  };
  await handleWebhook(makeReq(voiceGroupsOffUpdate, { owner: '99999', groups: 'off' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));
  const voiceGroupsOffSent = recordedCalls.filter(c => c.url.includes('/sendMessage'));
  assert.strictEqual(voiceGroupsOffSent.length, 0, 'Group voice ignored with groups=off');

  // E. /process command replying to a voice message in a group triggers transcription
  recordedCalls.length = 0;
  const processReplyUpdate = {
    update_id: 90014,
    message: {
      message_id: 914,
      chat: { id: -11111, type: 'group' },
      from: { id: 99999 },
      text: '/process',
      reply_to_message: {
        message_id: 100,
        voice: { file_id: 'reply_voice', file_size: 100, duration: 5 },
        from: { id: 55555 },
      },
    },
  };
  await handleWebhook(makeReq(processReplyUpdate, { owner: '99999', groups: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));
  const processReplySent = recordedCalls.filter(c => c.url.includes('/sendMessage'));
  assert.ok(processReplySent.length > 0, '/process cmd replying to group voice translates it');

  restoreFetch();
  console.log('✅ Bot Addressing: text gating, group voice and /process reply cascades verified');
}

// ----------------------------------------------------
// 4. File extension mapping & Document MIME/name filter
// ----------------------------------------------------
async function testDocumentFiltering() {
  console.log('\n--- 4. Testing Document MIME & Extensions Filtering ---');
  installMockFetch();

  const config = { ...MOCK_CONFIG };

  async function sendDocument(mimeType, fileName, update_id, fileSize = 1000, fileIdSuffix = '') {
    recordedCalls.length = 0;
    const update = {
      update_id,
      message: {
        message_id: update_id,
        chat: { id: 99999, type: 'private' },
        from: { id: 99999 },
        document: { file_id: `doc_${update_id}${fileIdSuffix}`, mime_type: mimeType, file_name: fileName, file_size: fileSize },
      },
    };
    await handleWebhook(makeReq(update, { owner: '99999' }), config, MOCK_CTX);
    await new Promise(r => setTimeout(r, 50));
    const transcriptionCalls = recordedCalls.filter(c => c.url.includes('/audio/transcriptions'));
    const sendMessageCalls = recordedCalls.filter(c => c.url.includes('/sendMessage'));
    return { transcriptionCalls, sendMessageCalls };
  }

  // MIME: audio/mpeg (song.mp3) -> Transcribe
  const mp3Result = await sendDocument('audio/mpeg', 'song.mp3', 91001);
  assert.ok(mp3Result.transcriptionCalls.length > 0);

  // MIME: video/mp4 (clip.mp4) -> Transcribe
  const mp4Result = await sendDocument('video/mp4', 'clip.mp4', 91002);
  assert.ok(mp4Result.transcriptionCalls.length > 0);

  // Ext: .webm with generic MIME -> Transcribe
  const webmByExt = await sendDocument('application/octet-stream', 'audio.webm', 91003);
  assert.ok(webmByExt.transcriptionCalls.length > 0);

  // Ext: .m4a with generic MIME -> Transcribe
  const m4aByExt = await sendDocument('application/octet-stream', 'file.m4a', 91004);
  assert.ok(m4aByExt.transcriptionCalls.length > 0);

  // MIME: application/zip (archive.zip) -> Reject with warning
  const zipResult = await sendDocument('application/zip', 'archive.zip', 91005);
  assert.strictEqual(zipResult.transcriptionCalls.length, 0);
  assert.ok(zipResult.sendMessageCalls.find(c => /unsupported/i.test(c.json?.text)));

  // MIME: application/pdf (doc.pdf) -> Reject silently (no warnings for generic docs if secretary/guest, or standard warning)
  const pdfResult = await sendDocument('application/pdf', 'doc.pdf', 91006);
  assert.strictEqual(pdfResult.transcriptionCalls.length, 0);

  // MIME: application/octet-stream, Ext: video.mov -> Reject with unsupported video warning
  const movResult = await sendDocument('application/octet-stream', 'video.mov', 91007);
  assert.strictEqual(movResult.transcriptionCalls.length, 0);
  assert.ok(movResult.sendMessageCalls.find(c => c.json?.text.toLowerCase().includes('video') || c.json?.text.includes('видео') || c.json?.text.includes('не поддерживается')));

  // Ext: .al with generic MIME and size > 5MB -> Range request + Transcribe
  const largeAlResult = await sendDocument('application/octet-stream', 'file.al', 91008, 6 * 1024 * 1024, '_al_large');
  assert.ok(largeAlResult.transcriptionCalls.length > 0);

  // Whisper empty text response -> returns apiError/transcriptionError warning
  installMockFetch({
    '/audio/transcriptions': () => mkJson({ text: '' })
  });
  const emptyWhisperResult = await sendDocument('audio/mpeg', 'song.mp3', 91009);
  assert.ok(emptyWhisperResult.sendMessageCalls.length > 0);
  assert.ok(emptyWhisperResult.sendMessageCalls.some(c => c.json?.text.toLowerCase().includes('error') || c.json?.text.includes('ошибк')));


  restoreFetch();
  console.log('✅ Document Filter: audio/video extensions passed, ZIP/PDF files rejected');
}

// ----------------------------------------------------
// 5. Verbose output formatting
// ----------------------------------------------------
async function testVerboseOutput() {
  console.log('\n--- 5. Testing Verbose Output (Info footer) ---');
  installMockFetch();

  // verbose=on -> reply contains ⚙️ Info line
  const verboseUpdate = {
    update_id: 90030,
    message: {
      message_id: 930,
      chat: { id: 99999, type: 'private' },
      from: { id: 99999 },
      voice: { file_id: 'voice_verbose', file_size: 2048, duration: 10 },
    },
  };
  await handleWebhook(makeReq(verboseUpdate, { owner: '99999', verbose: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));

  const verboseMsg = recordedCalls.find(c =>
    c.url.includes('/sendMessage') &&
    c.json?.chat_id === 99999 &&
    c.json?.text?.includes('Info')
  );
  assert.ok(verboseMsg, 'verbose=on must add Info footer');

  // verbose=off -> no Info line
  recordedCalls.length = 0;
  const quietUpdate = {
    update_id: 90031,
    message: {
      message_id: 931,
      chat: { id: 99999, type: 'private' },
      from: { id: 99999 },
      voice: { file_id: 'voice_quiet', file_size: 2048, duration: 10 },
    },
  };
  await handleWebhook(makeReq(quietUpdate, { owner: '99999' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));

  const quietMsg = recordedCalls.find(c =>
    c.url.includes('/sendMessage') &&
    c.json?.chat_id === 99999 &&
    c.json?.text?.includes('Info')
  );
  assert.ok(!quietMsg, 'verbose=off (default) must NOT add Info footer');

  restoreFetch();
  console.log('✅ Verbose Mode: verbose output settings toggles Info template block');
}

// ----------------------------------------------------
// 6. Business message bot self-skip (anti-loop guard)
// ----------------------------------------------------
async function testBusinessMessageSelfSkip() {
  console.log('\n--- 6. Testing Business Message Anti-Loop Guard ---');

  // If business_message mentions the bot itself -> must skip transcription (no replies)
  installMockFetch({
    '/getMe': () => mkJson({ ok: true, result: { id: 777, username: 'mybot', first_name: 'MyBot' } }),
  });

  const selfMentionUpdate = {
    update_id: 90040,
    business_message: {
      message_id: 940,
      chat: { id: 88888, type: 'private' },
      from: { id: 88888 },
      business_connection_id: 'conn_abc',
      text: '@mybot hello',
      entities: [{ type: 'mention', offset: 0, length: 6 }],
      voice: { file_id: 'biz_voice_self', file_size: 100, duration: 3 },
    },
  };

  await handleWebhook(makeReq(selfMentionUpdate, { owner: '99999', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));

  const sendMsgCalls = recordedCalls.filter(c => c.url.includes('/sendMessage'));
  assert.strictEqual(sendMsgCalls.length, 0, 'Business message mentioning bot ignored to prevent loop');

  restoreFetch();
  console.log('✅ Anti-Loop Guard: business messages with bot mentions skipped successfully');
}

// ----------------------------------------------------
// 7. my_chat_member status transition validations (old_status)
// ----------------------------------------------------
async function testMyChatMemberTransitions() {
  console.log('\n--- 7. Testing my_chat_member transition protections ---');
  installMockFetch();

  // A. Transition: member -> administrator (already in group, promoted) -> SKIPPED
  recordedCalls.length = 0;
  const promoteUpdate = {
    update_id: 90050,
    my_chat_member: {
      chat: { id: -22222, title: 'Test Group', type: 'group' },
      from: { id: 99999 },
      old_chat_member: { status: 'member' },
      new_chat_member: { status: 'administrator' },
    },
  };
  await handleWebhook(makeReq(promoteUpdate, { owner: '99999', notify_add: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));
  assertNoMessageSent();

  // B. Transition: left -> member (fresh add) -> NOTIFY owner
  recordedCalls.length = 0;
  const freshAddUpdate = {
    update_id: 90051,
    my_chat_member: {
      chat: { id: -33333, title: 'New Group', type: 'group' },
      from: { id: 99999 },
      old_chat_member: { status: 'left' },
      new_chat_member: { status: 'member' },
    },
  };
  await handleWebhook(makeReq(freshAddUpdate, { owner: '99999', notify_add: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));
  assertMessageSent('99999', /Added to group/i);

  // C. Transition: kicked -> member (re-add) -> NOTIFY owner
  recordedCalls.length = 0;
  const rebornUpdate = {
    update_id: 90052,
    my_chat_member: {
      chat: { id: -44444, title: 'Re-added Group', type: 'group' },
      from: { id: 99999 },
      old_chat_member: { status: 'kicked' },
      new_chat_member: { status: 'member' },
    },
  };
  await handleWebhook(makeReq(rebornUpdate, { owner: '99999', notify_add: 'on' }), MOCK_CONFIG, MOCK_CTX);
  await new Promise(r => setTimeout(r, 50));
  assertMessageSent('99999', /Added to group/i);

  restoreFetch();
  console.log('✅ my_chat_member: verified old_status transition logic for bot adds');
}

export async function run() {
  await testWebhookDeduplication();
  await testWebhookSecretValidation();
  await testBotAddressingAndMentions();
  await testDocumentFiltering();
  await testVerboseOutput();
  await testBusinessMessageSelfSkip();
  await testMyChatMemberTransitions();
}
