// scripts/run_all_tests.mjs
// Category: Quality Assurance / Test Runner
//
// Sequentially executes all test suites (Lint/Check, Localization, Unit, Scenarios, and Whitebox)
// in a single execution flow for Node.js and Deno environments.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const isDeno = typeof Deno !== 'undefined';
const runtime = isDeno ? 'deno' : 'node';

const tests = [
  { name: 'Localization Checks', file: 'tests/localization.mjs', args: isDeno ? ['--allow-read'] : [] },
  { name: 'Unit Tests', file: 'tests/units.mjs', args: isDeno ? ['--allow-read', '--allow-write', '--allow-env'] : [] },
  { name: 'Webhook Scenario Tests', file: 'tests/scenarios.mjs', args: isDeno ? ['--allow-read'] : [] },
  { name: 'Whitebox Unit Tests', file: 'tests/whitebox.mjs', args: isDeno ? ['--allow-read', '--allow-env'] : [] },
  { name: 'Fork Sync Workflows', file: 'tests/github_fork_sync.mjs', args: isDeno ? ['--allow-read', '--allow-env', '--allow-run'] : [] }
];

console.log(`🚀 Running all tests under ${runtime.toUpperCase()} runtime...`);

// 1. Run Linter / Deno Type Check
if (!isDeno) {
  console.log('\n🔍 Running Linter (ESLint)...');
  const lintRes = spawnSync('npm', ['run', 'lint'], { stdio: 'inherit', shell: true, cwd: rootDir });
  if (lintRes.status !== 0) {
    console.error('❌ ESLint failed!');
    process.exit(1);
  }
  console.log('✅ ESLint passed.');
} else {
  console.log('\n🔍 Running Deno check...');
  const checkRes = spawnSync('deno', ['task', 'check'], { stdio: 'inherit', shell: true, cwd: rootDir });
  if (checkRes.status !== 0) {
    console.error('❌ Deno check failed!');
    process.exit(1);
  }
  console.log('✅ Deno check passed.');
}

// 2. Run sequential test scripts
for (const test of tests) {
  console.log(`\n🏃 Running ${test.name}...`);
  const absolutePath = path.join(rootDir, test.file);
  
  let cmd, args;
  if (isDeno) {
    cmd = 'deno';
    args = ['run', ...test.args, absolutePath];
  } else {
    cmd = 'node';
    args = [absolutePath];
  }
  
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: rootDir });
  if (res.status !== 0) {
    console.error(`❌ ${test.name} failed!`);
    process.exit(1);
  }
  console.log(`✅ ${test.name} passed.`);
}

console.log('\n🎉 All test suites completed successfully!');
process.exit(0);
