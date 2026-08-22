/**
 * M5 Verification — Time-Windowed Context Retrieval
 *
 * Tests:
 *  1. parseTimeHint("last 2 hours") returns correct UTC boundaries
 *  2. parseTimeHint("today") returns midnight-to-now
 *  3. parseTimeHint("yesterday afternoon") returns 12:00-18:00 yesterday (UTC-converted)
 *  4. parseTimeHint returns null for unrecognized input
 *  5. getContext with time hint returns only matching events
 *  6. getContext with limit correctly sets hasMore: true when more exist
 *  7. getContext with limit returns hasMore: false when all fit
 *  8. getContext without time hint returns all events (up to limit)
 *  9. getContext filters by source correctly
 * 10. getContext filters by project path correctly
 */

import { mkdirSync, rmSync, existsSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// Setup: temp directory + isolated DB
// ---------------------------------------------------------------------------

const TEST_ROOT = join(tmpdir(), `sessionmem-m5-test-${Date.now()}`);
const DB_DIR = join(TEST_ROOT, 'db');
const DB_PATH = join(DB_DIR, 'test-m5.db');

mkdirSync(DB_DIR, { recursive: true });

// Isolate DB before importing modules
process.env.SESSIONMEM_DB_PATH = DB_PATH;

const { parseTimeHint } = await import('../src/retrieval/time-hints.js');
const { getContext } = await import('../src/retrieval/context.js');
const { getDb, insertEvent, closeDb } = await import('../src/db/index.js');

// Initialize test DB
getDb(DB_PATH);

// ---------------------------------------------------------------------------
// Seed test data at known timestamps
// ---------------------------------------------------------------------------

// We'll use a fixed "now" for all tests to make them deterministic.
// "now" = 2026-08-22T10:00:00Z (which is 2026-08-22T15:00:00+05:00 in PKT)
const NOW = new Date('2026-08-22T10:00:00.000Z');

// Seed events across different time ranges
const seedEvents = [
  // Yesterday morning (local PKT: 2026-08-21 08:00 = UTC 03:00)
  { timestamp: '2026-08-21T03:00:00.000Z', source: 'terminal', content: 'npm install express', projectPath: '/project/alpha' },
  // Yesterday afternoon (local PKT: 2026-08-21 14:00 = UTC 09:00)
  { timestamp: '2026-08-21T09:00:00.000Z', source: 'terminal', content: 'npm test', projectPath: '/project/alpha' },
  { timestamp: '2026-08-21T09:30:00.000Z', source: 'file', content: 'src/app.js', projectPath: '/project/alpha' },
  // Yesterday evening (local PKT: 2026-08-21 19:00 = UTC 14:00)
  { timestamp: '2026-08-21T14:00:00.000Z', source: 'terminal', content: 'git commit -m "done"', projectPath: '/project/alpha' },
  // Today morning (local PKT: 2026-08-22 08:00 = UTC 03:00)
  { timestamp: '2026-08-22T03:00:00.000Z', source: 'file', content: 'index.js', projectPath: '/project/beta' },
  // Today — 1 hour ago from NOW (UTC 09:00)
  { timestamp: '2026-08-22T09:00:00.000Z', source: 'terminal', content: 'node server.js', projectPath: '/project/alpha' },
  { timestamp: '2026-08-22T09:15:00.000Z', source: 'file', content: 'server.js', projectPath: '/project/alpha' },
  { timestamp: '2026-08-22T09:30:00.000Z', source: 'terminal', content: 'curl localhost:3000', projectPath: '/project/alpha' },
  // Today — 30 min ago from NOW (UTC 09:30)
  { timestamp: '2026-08-22T09:45:00.000Z', source: 'terminal', content: 'git status', projectPath: '/project/beta' },
];

for (const event of seedEvents) {
  insertEvent({
    timestamp: event.timestamp,
    source: event.source,
    content: event.content,
    projectPath: event.projectPath,
  });
}

console.log(`\n🔧 M5 Verification — Time-Windowed Context Retrieval`);
console.log(`   Seeded ${seedEvents.length} events\n`);

// ---------------------------------------------------------------------------
// Test 1: parseTimeHint("last 2 hours")
// ---------------------------------------------------------------------------

console.log('Test 1: parseTimeHint("last 2 hours")');
{
  const result = parseTimeHint('last 2 hours', NOW);
  assert(result !== null, 'Returns a result (not null)');

  const start = new Date(result.startTime);
  const end = new Date(result.endTime);
  const expectedStart = new Date(NOW.getTime() - 2 * 3600_000);

  assert(
    Math.abs(start.getTime() - expectedStart.getTime()) < 1000,
    `Start is ~2 hours before now: ${result.startTime}`
  );
  assert(
    Math.abs(end.getTime() - NOW.getTime()) < 1000,
    `End is ~now: ${result.endTime}`
  );
  assert(result.startTime.endsWith('Z'), 'Start is UTC (Z-suffix)');
  assert(result.endTime.endsWith('Z'), 'End is UTC (Z-suffix)');
}

// ---------------------------------------------------------------------------
// Test 2: parseTimeHint("today")
// ---------------------------------------------------------------------------

console.log('\nTest 2: parseTimeHint("today")');
{
  const result = parseTimeHint('today', NOW);
  assert(result !== null, 'Returns a result');

  const start = new Date(result.startTime);
  const end = new Date(result.endTime);

  // "today" starts at local midnight. The exact UTC value depends on
  // the machine's timezone, but end should be close to NOW.
  assert(start.getTime() < NOW.getTime(), 'Start is before now');
  assert(
    Math.abs(end.getTime() - NOW.getTime()) < 1000,
    `End is ~now: ${result.endTime}`
  );
  assert(result.startTime.endsWith('Z'), 'Start is UTC (Z-suffix)');
}

// ---------------------------------------------------------------------------
// Test 3: parseTimeHint("yesterday afternoon")
// ---------------------------------------------------------------------------

console.log('\nTest 3: parseTimeHint("yesterday afternoon")');
{
  const result = parseTimeHint('yesterday afternoon', NOW);
  assert(result !== null, 'Returns a result');

  const start = new Date(result.startTime);
  const end = new Date(result.endTime);

  // "yesterday afternoon" = yesterday 12:00-18:00 local time, converted to UTC.
  // We can't assert exact UTC values without knowing the test machine's timezone,
  // but we can verify the window is 6 hours wide and both are in the past.
  const windowHours = (end.getTime() - start.getTime()) / 3600_000;
  assert(windowHours === 6, `Window is 6 hours wide (got ${windowHours})`);
  assert(end.getTime() < NOW.getTime(), 'Entire window is in the past');
  assert(result.startTime.endsWith('Z'), 'Start is UTC');
  assert(result.endTime.endsWith('Z'), 'End is UTC');
}

// ---------------------------------------------------------------------------
// Test 4: parseTimeHint returns null for unrecognized input
// ---------------------------------------------------------------------------

console.log('\nTest 4: parseTimeHint returns null for unrecognized input');
{
  assert(parseTimeHint('gibberish', NOW) === null, '"gibberish" → null');
  assert(parseTimeHint('', NOW) === null, 'empty string → null');
  assert(parseTimeHint(null, NOW) === null, 'null → null');
  assert(parseTimeHint(undefined, NOW) === null, 'undefined → null');
}

// ---------------------------------------------------------------------------
// Test 5: getContext with time hint returns only matching events
// ---------------------------------------------------------------------------

console.log('\nTest 5: getContext with time hint returns matching events');
{
  // "last 2 hours" from NOW (10:00Z) = events from 08:00Z to 10:00Z
  const result = getContext({ timeHint: 'last 2 hours', now: NOW });

  assert(result.timeRange !== null, 'timeRange is set');
  assert(result.events.length > 0, `Got ${result.events.length} events`);

  // All returned events should be within the time window
  const allInRange = result.events.every(e => {
    return e.timestamp >= result.timeRange.startTime &&
           e.timestamp <= result.timeRange.endTime;
  });
  assert(allInRange, 'All events are within the resolved time range');

  // Should include events from 09:00Z-09:45Z but not yesterday's events
  assert(
    result.events.every(e => e.timestamp >= '2026-08-22T08:00:00.000Z'),
    'No events from before the 2-hour window'
  );
}

// ---------------------------------------------------------------------------
// Test 6: getContext with limit → hasMore: true
// ---------------------------------------------------------------------------

console.log('\nTest 6: getContext with small limit → hasMore: true');
{
  // Get all events (no time filter) with limit=3. We seeded 9, so hasMore=true.
  const result = getContext({ limit: 3, now: NOW });

  assert(result.events.length === 3, `Got ${result.events.length} events (expected 3)`);
  assert(result.hasMore === true, 'hasMore is true');
}

// ---------------------------------------------------------------------------
// Test 7: getContext with large limit → hasMore: false
// ---------------------------------------------------------------------------

console.log('\nTest 7: getContext with large limit → hasMore: false');
{
  const result = getContext({ limit: 100, now: NOW });

  assert(result.events.length === seedEvents.length, `Got all ${result.events.length} events`);
  assert(result.hasMore === false, 'hasMore is false');
}

// ---------------------------------------------------------------------------
// Test 8: getContext without time hint returns all events
// ---------------------------------------------------------------------------

console.log('\nTest 8: getContext without time hint returns all events');
{
  const result = getContext({ limit: 200, now: NOW });

  assert(result.events.length === seedEvents.length, `Got ${result.events.length} events (all ${seedEvents.length})`);
  assert(result.timeRange === null, 'timeRange is null (no time hint)');
}

// ---------------------------------------------------------------------------
// Test 9: getContext filters by source
// ---------------------------------------------------------------------------

console.log('\nTest 9: getContext filters by source');
{
  const terminalResult = getContext({ source: 'terminal', limit: 200, now: NOW });
  const fileResult = getContext({ source: 'file', limit: 200, now: NOW });

  const expectedTerminal = seedEvents.filter(e => e.source === 'terminal').length;
  const expectedFile = seedEvents.filter(e => e.source === 'file').length;

  assert(
    terminalResult.events.length === expectedTerminal,
    `Terminal events: ${terminalResult.events.length} (expected ${expectedTerminal})`
  );
  assert(
    fileResult.events.length === expectedFile,
    `File events: ${fileResult.events.length} (expected ${expectedFile})`
  );
  assert(
    terminalResult.events.every(e => e.source === 'terminal'),
    'All terminal results have source=terminal'
  );
  assert(
    fileResult.events.every(e => e.source === 'file'),
    'All file results have source=file'
  );
}

// ---------------------------------------------------------------------------
// Test 10: getContext filters by project path
// ---------------------------------------------------------------------------

console.log('\nTest 10: getContext filters by project path');
{
  const alphaResult = getContext({ projectPath: '/project/alpha', limit: 200, now: NOW });
  const betaResult = getContext({ projectPath: '/project/beta', limit: 200, now: NOW });

  const expectedAlpha = seedEvents.filter(e => e.projectPath === '/project/alpha').length;
  const expectedBeta = seedEvents.filter(e => e.projectPath === '/project/beta').length;

  assert(
    alphaResult.events.length === expectedAlpha,
    `Alpha project events: ${alphaResult.events.length} (expected ${expectedAlpha})`
  );
  assert(
    betaResult.events.length === expectedBeta,
    `Beta project events: ${betaResult.events.length} (expected ${expectedBeta})`
  );
  assert(
    alphaResult.events.every(e => e.project_path === '/project/alpha'),
    'All alpha results have correct project_path'
  );
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
