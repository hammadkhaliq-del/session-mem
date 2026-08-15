#!/usr/bin/env node

/**
 * scripts/verify-m2.js
 *
 * M2 done-check: Tests the queue file → SQLite flush pipeline.
 * Uses a temp directory for the queue and an in-memory DB.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Setup: We need to mock the DB module since flush.js imports from ../db/index.js
// Instead, we test flushQueue by creating a real temp environment.
// We set SESSIONMEM_DB_PATH to a temp file and SESSIONMEM_QUEUE_DIR to a temp dir.
// ---------------------------------------------------------------------------

const testDir = join(tmpdir(), `sessionmem-test-m2-${Date.now()}`);
const queueDir = join(testDir, 'queue');
const dbPath = join(testDir, 'test.db');

mkdirSync(queueDir, { recursive: true });

// Point the DB and queue to our test locations
process.env.SESSIONMEM_DB_PATH = dbPath;
process.env.SESSIONMEM_QUEUE_DIR = queueDir;

// Now import flush (it will use our env vars)
const { flushQueue } = await import('../src/terminal/flush.js');
const { getDb, getEvents, closeDb } = await import('../src/db/index.js');

// ---------------------------------------------------------------------------
// Helper: write JSONL lines to the queue file
// ---------------------------------------------------------------------------

function writeQueue(lines) {
  const queuePath = join(queueDir, 'queue.jsonl');
  writeFileSync(queuePath, lines.join('\n') + '\n', 'utf-8');
}

function makeEvent(content, index) {
  return JSON.stringify({
    timestamp: `2026-08-14T10:${String(index).padStart(2, '0')}:00.000+05:00`,
    source: 'terminal',
    content,
    project_path: 'd:\\session-mem',
  });
}

// ---------------------------------------------------------------------------
// Test 1: Write 10 events → flush → query all back
// ---------------------------------------------------------------------------

console.log('\n🔧 M2 Verification — Queue Flush Pipeline\n');
console.log('Test 1: Flush 10 events and query them back');

const commands = [
  'echo "hello"',
  'Get-Date',
  'ls',
  'cd ..',
  'cd session-mem',
  'node --version',
  'npm --version',
  'git status',
  'git log -1',
  'Get-Process | Select-Object -First 3',
];

writeQueue(commands.map((cmd, i) => makeEvent(cmd, i)));

const result1 = flushQueue(queueDir);
assert('Flushed 10 events', result1.flushed === 10);
assert('Skipped 0', result1.skipped === 0);

const events = getEvents({ source: 'terminal' });
assert('10 events in DB', events.length === 10);
assert('First event content matches', events[0].content === 'echo "hello"');
assert('Last event content matches', events[9].content === 'Get-Process | Select-Object -First 3');
assert('All have source=terminal', events.every((e) => e.source === 'terminal'));
assert('All have project_path', events.every((e) => e.project_path === 'd:\\session-mem'));
assert('Timestamps are in order', events.every((e, i) => i === 0 || e.timestamp >= events[i - 1].timestamp));

// Queue file should be gone after flush
assert('queue.jsonl deleted after flush', !existsSync(join(queueDir, 'queue.jsonl')));
assert('queue.processing.jsonl deleted after flush', !existsSync(join(queueDir, 'queue.processing.jsonl')));

// ---------------------------------------------------------------------------
// Test 2: Empty/missing queue — no crash
// ---------------------------------------------------------------------------

console.log('\nTest 2: Empty and missing queue files');

const result2 = flushQueue(queueDir);
assert('Missing queue returns flushed=0', result2.flushed === 0);
assert('Missing queue returns skipped=0', result2.skipped === 0);

// Empty file
writeFileSync(join(queueDir, 'queue.jsonl'), '   \n  \n', 'utf-8');
const result2b = flushQueue(queueDir);
assert('Empty queue returns flushed=0', result2b.flushed === 0);

// ---------------------------------------------------------------------------
// Test 3: Malformed lines — skip bad, keep good
// ---------------------------------------------------------------------------

console.log('\nTest 3: Malformed JSON lines');

const mixedLines = [
  makeEvent('valid-command-1', 20),
  'this is not json at all',
  '{"timestamp":"2026-08-14T10:22:00Z","source":"terminal"}',  // missing content + project_path
  makeEvent('valid-command-2', 23),
  '{broken json',
];
writeQueue(mixedLines);

// Suppress stderr noise from expected warnings
const origStderr = console.error;
const stderrMessages = [];
console.error = (msg) => stderrMessages.push(msg);

const result3 = flushQueue(queueDir);

console.error = origStderr;

assert('Flushed 2 valid events', result3.flushed === 2);
assert('Skipped 3 invalid lines', result3.skipped === 3);

// Verify the valid ones made it
const afterMixed = getEvents({ source: 'terminal' });
const validCmds = afterMixed.filter((e) => e.content.startsWith('valid-command'));
assert('Both valid commands are in DB', validCmds.length === 2);

// ---------------------------------------------------------------------------
// Test 4: Crash recovery — queue.processing.jsonl exists from interrupted flush
// ---------------------------------------------------------------------------

console.log('\nTest 4: Crash recovery (interrupted flush)');

// Simulate a crash: leave a queue.processing.jsonl behind
writeFileSync(
  join(queueDir, 'queue.processing.jsonl'),
  makeEvent('recovered-from-crash', 30) + '\n',
  'utf-8'
);
// Also have a current queue
writeQueue([makeEvent('new-after-crash', 31)]);

const result4 = flushQueue(queueDir);
assert('Recovered + new = 2 flushed', result4.flushed === 2);

const recovered = getEvents({ source: 'terminal' });
const crashEvent = recovered.find((e) => e.content === 'recovered-from-crash');
const newEvent = recovered.find((e) => e.content === 'new-after-crash');
assert('Recovered event exists in DB', !!crashEvent);
assert('New event also exists in DB', !!newEvent);

// ---------------------------------------------------------------------------
// Test 5: Double flush is a no-op
// ---------------------------------------------------------------------------

console.log('\nTest 5: Double flush is a no-op');

const countBefore = getEvents({ source: 'terminal' }).length;
const result5 = flushQueue(queueDir);
const countAfter = getEvents({ source: 'terminal' }).length;

assert('Second flush returns flushed=0', result5.flushed === 0);
assert('DB count unchanged', countBefore === countAfter);

// ---------------------------------------------------------------------------
// Test 6: Sequential flushes accumulate
// ---------------------------------------------------------------------------

console.log('\nTest 6: Sequential flushes accumulate');

const countBeforeSeq = getEvents({ source: 'terminal' }).length;

writeQueue([makeEvent('batch-A-1', 40), makeEvent('batch-A-2', 41)]);
flushQueue(queueDir);

writeQueue([makeEvent('batch-B-1', 42), makeEvent('batch-B-2', 43)]);
flushQueue(queueDir);

const countAfterSeq = getEvents({ source: 'terminal' }).length;
assert('4 new events added across 2 flushes', countAfterSeq - countBeforeSeq === 4);

// ---------------------------------------------------------------------------
// Cleanup and results
// ---------------------------------------------------------------------------

closeDb();
rmSync(testDir, { recursive: true, force: true });

// Clean env vars
delete process.env.SESSIONMEM_DB_PATH;
delete process.env.SESSIONMEM_QUEUE_DIR;

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'─'.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
