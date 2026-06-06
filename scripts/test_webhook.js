#!/usr/bin/env node

// Script to test the webhook with various updates without using actual Telegram servers.

const normalVoiceUpdate = {
  update_id: 100000001,
  message: {
    message_id: 101,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: 123456789,
      type: 'private'
    },
    voice: {
      file_id: 'AwACAgIAAxkBAAI_normal_voice_file_id',
      file_unique_id: 'AQAD_normal_voice_unique_id',
      duration: 5
    }
  }
};

const guestVoiceUpdate = {
  update_id: 100000002,
  guest_message: {
    message_id: 102,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: 987654321,
      type: 'group'
    },
    guest_query_id: 'guest_query_token_abc123',
    voice: {
      file_id: 'AwACAgIAAxkBAAI_guest_voice_file_id',
      file_unique_id: 'AQAD_guest_voice_unique_id',
      duration: 10
    }
  }
};

const businessVoiceUpdate = {
  update_id: 100000003,
  business_message: {
    message_id: 103,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: 1122334455,
      type: 'private'
    },
    business_connection_id: 'business_conn_xyz987',
    voice: {
      file_id: 'AwACAgIAAxkBAAI_business_voice_file_id',
      file_unique_id: 'AQAD_business_voice_unique_id',
      duration: 7
    }
  }
};

console.log('📋 Test Update Payloads Prepared\n');
console.log('To send updates to your local server, run:');
console.log('node test_server.js');
console.log('\nThen in another terminal window, use curl to POST one of the updates:\n');

console.log('1️⃣ NORMAL MODE VOICE UPDATE:');
console.log('curl -X POST http://localhost:3000/api/webhook \\');
console.log('  -H "Content-Type: application/json" \\');
console.log(`  -d '${JSON.stringify(normalVoiceUpdate)}'`);
console.log('\n');

console.log('2️⃣ GUEST MODE VOICE UPDATE:');
console.log('curl -X POST http://localhost:3000/api/webhook \\');
console.log('  -H "Content-Type: application/json" \\');
console.log(`  -d '${JSON.stringify(guestVoiceUpdate)}'`);
console.log('\n');

console.log('3️⃣ SECRETARY MODE (BUSINESS) VOICE UPDATE:');
console.log('curl -X POST http://localhost:3000/api/webhook \\');
console.log('  -H "Content-Type: application/json" \\');
console.log(`  -d '${JSON.stringify(businessVoiceUpdate)}'`);
console.log('\n');
