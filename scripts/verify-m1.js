#!/usr/bin/env node

/**
 * scripts/verify-m1.js
 *
 * M1 done-check: "Can manually insert a row and query it back via a script."
 * Uses an in-memory database so it never touches the real session.db.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

function assertThrows(label, fn) {
  try {
    fn();
    console.log(`  ❌ ${label} (expected to throw, but did not)`);
    failed++;
  } catch {
    console.log(`  ✅ ${label}`);
    passed++;
  }
}

// ---------------------------------------------------------------------------
// Setup: in-memory DB with schema applied
// ---------------------------------------------------------------------------

console.log('\n🔧 Setting up in-memory test database...\n');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA journal_mode=WAL');

const schemaPath = join(__dirname, '..', 'src', 'db', 'schema.sql');
const schema = readFileSync(schemaPath, 'utf-8');
db.exec(schema);

// ---------------------------------------------------------------------------
// Test 1: Insert one event per source type and query them all back
// ---------------------------------------------------------------------------

console.log('Test 1: Insert and retrieve events');

const events = [
  {
    timestamp: '2026-08-13T10:00:00Z',
    source: 'terminal',
    content: 'npm install express',
    project_path: '/home/user/myproject',
  },
  {
    timestamp: '2026-08-13T10:05:00Z',
    source: 'file',
    content: 'src/index.js saved',
    project_path: '/home/user/myproject',
  },
  {
    timestamp: '2026-08-13T10:10:00Z',
    source: 'browser',
    content: 'MDN Web Docs — Array.prototype.map()',
    project_path: '/home/user/myproject',
  },
];

const insertStmt = db.prepare(
  'INSERT INTO events (timestamp, source, content, project_path) VALUES (?, ?, ?, ?)'
);
for (const e of events) {
  insertStmt.run(e.timestamp, e.source, e.content, e.project_path);
}

const allRows = db.prepare('SELECT * FROM events ORDER BY timestamp ASC').all();

assert('Inserted 3 events, got 3 rows back', allRows.length === 3);
assert('First event is terminal', allRows[0].source === 'terminal');
assert('Second event is file', allRows[1].source === 'file');
assert('Third event is browser', allRows[2].source === 'browser');
assert('Content matches for terminal event', allRows[0].content === 'npm install express');
assert('project_path is correct', allRows[0].project_path === '/home/user/myproject');
assert('Timestamps are in ascending order', allRows[0].timestamp < allRows[1].timestamp && allRows[1].timestamp < allRows[2].timestamp);

// ---------------------------------------------------------------------------
// Test 2: CHECK constraint rejects invalid source
// ---------------------------------------------------------------------------

console.log('\nTest 2: CHECK constraint on source column');

assertThrows('Invalid source "clipboard" is rejected by CHECK constraint', () => {
  db.prepare(
    'INSERT INTO events (timestamp, source, content, project_path) VALUES (?, ?, ?, ?)'
  ).run('2026-08-13T11:00:00Z', 'clipboard', 'test', '/tmp');
});

// ---------------------------------------------------------------------------
// Test 3: Filter by timestamp range
// ---------------------------------------------------------------------------

console.log('\nTest 3: Time-range filtering');

const rangeRows = db
  .prepare('SELECT * FROM events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC')
  .all('2026-08-13T10:00:00Z', '2026-08-13T10:05:00Z');

assert('Time range [10:00, 10:05] returns 2 events', rangeRows.length === 2);
assert('First in range is terminal', rangeRows[0].source === 'terminal');
assert('Second in range is file', rangeRows[1].source === 'file');

// ---------------------------------------------------------------------------
// Test 4: Filter by source
// ---------------------------------------------------------------------------

console.log('\nTest 4: Source filtering');

const terminalRows = db.prepare('SELECT * FROM events WHERE source = ?').all('terminal');
assert('Filtering by source=terminal returns 1 row', terminalRows.length === 1);
assert('That row has the right content', terminalRows[0].content === 'npm install express');

// ---------------------------------------------------------------------------
// Test 5: Auto-increment IDs
// ---------------------------------------------------------------------------

console.log('\nTest 5: Auto-increment IDs');

assert('IDs are sequential: 1, 2, 3', allRows[0].id === 1 && allRows[1].id === 2 && allRows[2].id === 3);

// ---------------------------------------------------------------------------
// Test 6: Indexes exist
// ---------------------------------------------------------------------------

console.log('\nTest 6: Indexes exist');

const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events'").all();
const indexNames = indexes.map((r) => r.name);

assert('idx_events_timestamp exists', indexNames.includes('idx_events_timestamp'));
assert('idx_events_source exists', indexNames.includes('idx_events_source'));
assert('idx_events_project exists', indexNames.includes('idx_events_project'));

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

db.close();

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'─'.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
