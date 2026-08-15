/**
 * M3 Verification — File Watcher + Project Root Resolution
 *
 * Tests:
 *  1. resolveProjectRoot finds .git walking up from subdirectory
 *  2. resolveProjectRoot returns startDir when no .git exists
 *  3. Watcher logs file creates/modifies with correct fields
 *  4. Ignored directories (.git, node_modules) produce no events
 *  5. Debounce: rapid writes → single event
 *  6. Flush file events → verify in SQLite with source='file'
 *  7. Watcher handles file deletion without crashing
 */

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Test infra
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Setup: create temp directories for isolated testing
// ---------------------------------------------------------------------------

const TEST_ROOT = join(tmpdir(), `sessionmem-m3-test-${Date.now()}`);
const FAKE_PROJECT = join(TEST_ROOT, 'fake-project');
const FAKE_SUBDIR = join(FAKE_PROJECT, 'src', 'utils');
const QUEUE_DIR = join(TEST_ROOT, 'queue');
const DB_DIR = join(TEST_ROOT, 'db');
const DB_PATH = join(DB_DIR, 'test-m3.db');

// Create structure
mkdirSync(FAKE_SUBDIR, { recursive: true });
mkdirSync(join(FAKE_PROJECT, '.git'), { recursive: true }); // fake .git
mkdirSync(join(FAKE_PROJECT, 'node_modules', 'some-pkg'), { recursive: true });
mkdirSync(join(FAKE_PROJECT, '.git', 'objects'), { recursive: true });
mkdirSync(QUEUE_DIR, { recursive: true });
mkdirSync(DB_DIR, { recursive: true });

// Set env vars for test isolation
process.env.SESSIONMEM_DB_PATH = DB_PATH;
process.env.SESSIONMEM_QUEUE_DIR = QUEUE_DIR;

// Import modules after setting env vars
const { resolveProjectRoot } = await import('../src/utils/project-root.js');
const { startWatcher, shouldIgnore, DEBOUNCE_MS } = await import('../src/watcher/watch.js');
const { flushQueue } = await import('../src/terminal/flush.js');
const { getDb, getEvents, closeDb } = await import('../src/db/index.js');

// Initialize test DB
getDb(DB_PATH);

console.log('\n🔧 M3 Verification — File Watcher + Project Root Resolution\n');

// ---------------------------------------------------------------------------
// Test 1: resolveProjectRoot finds .git walking up
// ---------------------------------------------------------------------------

console.log('Test 1: resolveProjectRoot finds .git from subdirectory');
{
  const root = resolveProjectRoot(FAKE_SUBDIR);
  assert(root === FAKE_PROJECT, `Resolved to project root: ${root}`);

  const rootFromProject = resolveProjectRoot(FAKE_PROJECT);
  assert(rootFromProject === FAKE_PROJECT, `Resolved from project dir itself: ${rootFromProject}`);
}

// ---------------------------------------------------------------------------
// Test 2: resolveProjectRoot fallback when no .git
// ---------------------------------------------------------------------------

console.log('\nTest 2: resolveProjectRoot returns startDir when no .git');
{
  const noGitDir = join(TEST_ROOT, 'no-git-dir');
  mkdirSync(noGitDir, { recursive: true });
  const root = resolveProjectRoot(noGitDir);
  assert(root === noGitDir, `Fell back to startDir: ${root}`);
}

// ---------------------------------------------------------------------------
// Test 3: Watcher logs file events with correct fields
// ---------------------------------------------------------------------------

console.log('\nTest 3: Watcher logs file creates/modifies');
{
  const queueFile = join(QUEUE_DIR, 'queue.jsonl');
  if (existsSync(queueFile)) unlinkSync(queueFile);

  const events = [];
  const watcher = startWatcher(FAKE_PROJECT, {
    queueDir: QUEUE_DIR,
    silent: true,
    onEvent: (e) => events.push(e),
  });

  // Let watcher stabilize — fs.watch may fire initial events for existing files
  await sleep(DEBOUNCE_MS + 300);
  events.length = 0; // clear any setup noise
  if (existsSync(queueFile)) unlinkSync(queueFile); // clear queue too

  // Create 3 files
  writeFileSync(join(FAKE_PROJECT, 'file1.txt'), 'hello');
  writeFileSync(join(FAKE_SUBDIR, 'helper.js'), 'export default {}');
  writeFileSync(join(FAKE_PROJECT, 'README.md'), '# Test');

  // Wait for debounce to fire
  await sleep(DEBOUNCE_MS + 300);

  watcher.close();

  assert(events.length === 3, `Logged ${events.length} events (expected 3)`);
  assert(events.every(e => e.source === 'file'), 'All events have source=file');
  assert(events.every(e => e.project_path === FAKE_PROJECT), `All events have project_path=${FAKE_PROJECT}`);
  assert(events.every(e => e.timestamp), 'All events have timestamps');
  assert(events.some(e => e.content === 'file1.txt'), 'file1.txt logged');
  assert(events.some(e => e.content === 'src/utils/helper.js'), 'src/utils/helper.js logged with relative path');

  // Verify queue file exists with correct JSONL content
  assert(existsSync(queueFile), 'queue.jsonl created');
  const lines = readFileSync(queueFile, 'utf-8').trim().split('\n');
  assert(lines.length === 3, `Queue has ${lines.length} lines (expected 3)`);
}

// ---------------------------------------------------------------------------
// Test 4: Ignored directories produce no events
// ---------------------------------------------------------------------------

console.log('\nTest 4: .git and node_modules are ignored');
{
  const queueFile = join(QUEUE_DIR, 'queue.jsonl');
  if (existsSync(queueFile)) unlinkSync(queueFile);

  const events = [];
  const watcher = startWatcher(FAKE_PROJECT, {
    queueDir: QUEUE_DIR,
    silent: true,
    onEvent: (e) => events.push(e),
  });

  // Write to ignored directories
  writeFileSync(join(FAKE_PROJECT, '.git', 'COMMIT_EDITMSG'), 'test commit');
  writeFileSync(join(FAKE_PROJECT, 'node_modules', 'some-pkg', 'index.js'), 'module.exports = {}');

  await sleep(DEBOUNCE_MS + 300);
  watcher.close();

  assert(events.length === 0, `Logged ${events.length} events from ignored dirs (expected 0)`);

  // Also test the shouldIgnore utility directly
  assert(shouldIgnore('.git/COMMIT_EDITMSG') === true, 'shouldIgnore filters .git/');
  assert(shouldIgnore('node_modules/pkg/index.js') === true, 'shouldIgnore filters node_modules/');
  assert(shouldIgnore('src/app.js') === false, 'shouldIgnore allows src/app.js');
  assert(shouldIgnore('test.db') === true, 'shouldIgnore filters .db files');
  assert(shouldIgnore('Thumbs.db') === true, 'shouldIgnore filters Thumbs.db');
}

// ---------------------------------------------------------------------------
// Test 5: Debounce — rapid writes produce single event
// ---------------------------------------------------------------------------

console.log('\nTest 5: Debounce collapses rapid writes');
{
  const queueFile = join(QUEUE_DIR, 'queue.jsonl');
  if (existsSync(queueFile)) unlinkSync(queueFile);

  const events = [];
  const watcher = startWatcher(FAKE_PROJECT, {
    queueDir: QUEUE_DIR,
    silent: true,
    onEvent: (e) => events.push(e),
  });

  // Rapid writes to the same file (5x in 200ms)
  for (let i = 0; i < 5; i++) {
    writeFileSync(join(FAKE_PROJECT, 'rapid.txt'), `version ${i}`);
    await sleep(40);
  }

  // Wait for debounce to fire
  await sleep(DEBOUNCE_MS + 300);
  watcher.close();

  assert(events.length === 1, `Debounced to ${events.length} event (expected 1)`);
  assert(events[0]?.content === 'rapid.txt', 'Debounced event has correct filename');
}

// ---------------------------------------------------------------------------
// Test 6: Flush file events into SQLite
// ---------------------------------------------------------------------------

console.log('\nTest 6: Flush file events → verify in SQLite');
{
  const queueFile = join(QUEUE_DIR, 'queue.jsonl');
  if (existsSync(queueFile)) unlinkSync(queueFile);

  const watcher = startWatcher(FAKE_PROJECT, {
    queueDir: QUEUE_DIR,
    silent: true,
  });

  writeFileSync(join(FAKE_PROJECT, 'flush-test-1.js'), 'const a = 1;');
  writeFileSync(join(FAKE_PROJECT, 'flush-test-2.js'), 'const b = 2;');

  await sleep(DEBOUNCE_MS + 300);
  watcher.close();

  // Flush to SQLite
  const result = flushQueue(QUEUE_DIR);
  assert(result.flushed >= 2, `Flushed ${result.flushed} file events`);
  assert(result.skipped === 0, `Skipped ${result.skipped} (expected 0)`);

  // Query back
  const fileEvents = getEvents({ source: 'file' });
  assert(fileEvents.length >= 2, `${fileEvents.length} file events in DB`);
  assert(fileEvents.every(e => e.source === 'file'), 'All have source=file');
  assert(fileEvents.some(e => e.content === 'flush-test-1.js'), 'flush-test-1.js in DB');
  assert(fileEvents.some(e => e.content === 'flush-test-2.js'), 'flush-test-2.js in DB');
}

// ---------------------------------------------------------------------------
// Test 7: Watcher handles file deletion without crashing
// ---------------------------------------------------------------------------

console.log('\nTest 7: Watcher survives file deletion');
{
  const queueFile = join(QUEUE_DIR, 'queue.jsonl');
  if (existsSync(queueFile)) unlinkSync(queueFile);

  const testFile = join(FAKE_PROJECT, 'delete-me.txt');
  writeFileSync(testFile, 'temporary');

  const events = [];
  const watcher = startWatcher(FAKE_PROJECT, {
    queueDir: QUEUE_DIR,
    silent: true,
    onEvent: (e) => events.push(e),
  });

  // Let watcher stabilize, then clear any residual events
  await sleep(DEBOUNCE_MS + 300);
  events.length = 0;

  // Delete the file — watcher should not crash
  unlinkSync(testFile);

  await sleep(DEBOUNCE_MS + 300);

  // Watcher should still be running — create another file to prove it
  writeFileSync(join(FAKE_PROJECT, 'after-delete.txt'), 'still alive');
  await sleep(DEBOUNCE_MS + 300);

  watcher.close();

  assert(events.some(e => e.content === 'after-delete.txt'), 'Watcher survived deletion and logged subsequent file');
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

closeDb();
rmSync(TEST_ROOT, { recursive: true, force: true });

console.log('\n' + '─'.repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('─'.repeat(40) + '\n');

if (failed > 0) process.exit(1);
