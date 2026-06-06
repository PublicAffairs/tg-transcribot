/**
 * tests/whitebox.mjs
 * Entry point for API Request & Infrastructure Whitebox Unit Tests (Category C & D)
 */

import { run as runWebhook } from './unit_webhook.mjs';
import { run as runRouting } from './unit_routing.mjs';

async function main() {
  console.log('🏁 Starting API Request & Infrastructure Whitebox Unit Tests...');
  await runWebhook();
  await runRouting();
  console.log('\n🎉 All Whitebox Unit Tests completed successfully!');
}

main().catch(err => {
  console.error('\n❌ Whitebox Unit Tests Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
