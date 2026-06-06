/**
 * ci_test_github_fork_sync.mjs
 * Category: Quality Assurance / Fork Sync Workflow Test
 *
 * Tests all 5 scenarios of the fork sync workflow by invoking the pure
 * decision script (scripts/ci_github_fork_sync.sh) with pre-computed status
 * variables — no real git repositories are created or needed.
 *
 * Scenarios tested:
 *   1. Already up to date          → exit 0, success message
 *   2. New commits, no divergence  → exit 0, synced message
 *   3. Local commits ahead         → exit 0, warning emitted
 *   4. Histories diverged (FF fail) → exit 1, error emitted
 *   5a. Upstream unreachable       → exit 1, error emitted
 *   5b. Upstream branch not found  → exit 1, error emitted
 *
 * Usage:
 *   node scripts/ci_test_github_fork_sync.mjs
 */

import { spawnSync } from 'child_process';
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '../scripts/ci_github_fork_sync.sh');

// ----------------------------------------------------
// Locate bash (cross-platform: Linux/macOS/Git for Windows/WSL)
// ----------------------------------------------------
function findBash() {
  const candidates = [
    'bash',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) && candidate !== 'bash') continue;
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 3000 });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const BASH = findBash();

if (!BASH) {
  console.warn('⚠️  ci_test_github_fork_sync: bash not found on this system. Tests skipped.');
  process.exit(0);
}

// ----------------------------------------------------
// Test Runner Helper
// ----------------------------------------------------
function runLogic(env) {
  const result = spawnSync(BASH, [SCRIPT], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 5000
  });
  return {
    exitCode: result.status,
    stdout: (result.stdout || '') + (result.stderr || '')
  };
}

// ----------------------------------------------------
// Scenario 1: Already up to date
// ----------------------------------------------------
function testScenario1_AlreadyUpToDate() {
  console.log('\n--- Scenario 1: Already up to date ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '1', BEHIND: '0', AHEAD: '0', MERGE_OK: '1'
  });
  assert.strictEqual(exitCode, 0, 'Scenario 1 should exit 0');
  assert.ok(stdout.includes('Already up to date'), 'Should print up-to-date message');
  console.log('✅ Scenario 1 passed: exits 0, prints up-to-date message');
}

// ----------------------------------------------------
// Scenario 2: New commits, no divergence → FF merge succeeds
// ----------------------------------------------------
function testScenario2_FastForwardSuccess() {
  console.log('\n--- Scenario 2: Fast-forward merge success ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '1', BEHIND: '3', AHEAD: '0', MERGE_OK: '1'
  });
  assert.strictEqual(exitCode, 0, 'Scenario 2 should exit 0');
  assert.ok(stdout.includes('successfully synced'), 'Should print sync success message');
  assert.ok(stdout.includes('3 commit(s)'), 'Should mention commit count');
  console.log('✅ Scenario 2 passed: exits 0, prints sync success');
}

// ----------------------------------------------------
// Scenario 3: Local commits ahead → skipped with warning
// ----------------------------------------------------
function testScenario3_LocalAhead() {
  console.log('\n--- Scenario 3: Local commits ahead of upstream ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '1', BEHIND: '2', AHEAD: '4', MERGE_OK: '1'
  });
  assert.strictEqual(exitCode, 0, 'Scenario 3 should exit 0 (warning, not error)');
  assert.ok(stdout.includes('::warning::'), 'Should emit a GitHub Actions warning annotation');
  assert.ok(stdout.includes('4 local commit(s)'), 'Should mention local commit count');
  assert.ok(!stdout.includes('::error::'), 'Should NOT emit an error');
  console.log('✅ Scenario 3 passed: exits 0, emits ::warning:: annotation');
}

// ----------------------------------------------------
// Scenario 4: Histories diverged, FF impossible
// ----------------------------------------------------
function testScenario4_Diverged() {
  console.log('\n--- Scenario 4: Histories diverged (FF impossible) ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '1', BEHIND: '5', AHEAD: '0', MERGE_OK: '0'
  });
  assert.strictEqual(exitCode, 1, 'Scenario 4 should exit 1');
  assert.ok(stdout.includes('::error::'), 'Should emit a GitHub Actions error annotation');
  assert.ok(stdout.includes('diverged'), 'Should mention diverged history');
  assert.ok(stdout.includes('rebase'), 'Should mention rebase as resolution step');
  console.log('✅ Scenario 4 passed: exits 1, emits ::error:: with rebase instructions');
}

// ----------------------------------------------------
// Scenario 5a: Upstream fetch failed
// ----------------------------------------------------
function testScenario5a_FetchFailed() {
  console.log('\n--- Scenario 5a: Upstream unreachable ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '0', BRANCH_OK: '1', BEHIND: '0', AHEAD: '0', MERGE_OK: '1'
  });
  assert.strictEqual(exitCode, 1, 'Scenario 5a should exit 1');
  assert.ok(stdout.includes('::error::'), 'Should emit a GitHub Actions error annotation');
  assert.ok(stdout.includes('Could not fetch'), 'Should mention fetch failure');
  console.log('✅ Scenario 5a passed: exits 1, emits ::error:: for unreachable upstream');
}

// ----------------------------------------------------
// Scenario 5b: Upstream branch not found
// ----------------------------------------------------
function testScenario5b_BranchMissing() {
  console.log('\n--- Scenario 5b: Upstream branch not found ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '0', BEHIND: '0', AHEAD: '0', MERGE_OK: '1',
    DEFAULT_BRANCH: 'main'
  });
  assert.strictEqual(exitCode, 1, 'Scenario 5b should exit 1');
  assert.ok(stdout.includes('::error::'), 'Should emit a GitHub Actions error annotation');
  assert.ok(stdout.includes("'main' was not found"), 'Should mention missing branch name');
  console.log('✅ Scenario 5b passed: exits 1, emits ::error:: for missing upstream branch');
}

// ----------------------------------------------------
// Workflow Guard: fork-only condition in sync.yml
// ----------------------------------------------------
function testWorkflowForkGuard() {
  console.log('\n--- Workflow Guard: fork-only condition ---');
  const syncYmlPath = path.join(__dirname, '..', '.github', 'workflows', 'sync.yml');
  assert.ok(fs.existsSync(syncYmlPath), 'sync.yml must exist');
  const content = fs.readFileSync(syncYmlPath, 'utf8');
  assert.ok(
    content.includes('github.event.repository.fork'),
    'sync.yml must include a fork guard (if: github.event.repository.fork) to prevent running in the upstream repo'
  );
  console.log('✅ Workflow guard passed: sync.yml contains fork-only condition');
}

// ----------------------------------------------------
// Main Runner
// ----------------------------------------------------
function main() {
  console.log(`Using bash: ${BASH}`);
  try {
    testScenario1_AlreadyUpToDate();
    testScenario2_FastForwardSuccess();
    testScenario3_LocalAhead();
    testScenario4_Diverged();
    testScenario5a_FetchFailed();
    testScenario5b_BranchMissing();
    testWorkflowForkGuard();
    console.log('\n🎉 All Fork Sync Workflow tests completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Fork Sync Tests Failed:', err.message);
    process.exit(1);
  }
}

main();
