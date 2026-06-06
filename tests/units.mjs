/**
 * tests/units.mjs
 * Entry point for Core Library Unit Tests (Category A & B)
 */

import { run as runUtils } from './unit_utils.mjs';
import { run as runMarkdown } from './unit_markdown.mjs';

async function main() {
  console.log('🏁 Starting Core Library Unit Tests...');
  await runUtils();
  await runMarkdown();
  console.log('\n🎉 All Core Library Unit Tests completed successfully!');
}

main().catch(err => {
  console.error('\n❌ Core Library Unit Tests Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
