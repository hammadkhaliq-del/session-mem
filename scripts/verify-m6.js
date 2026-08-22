/**
 * M6 Verification — LLM Query CLI
 *
 * Two tiers:
 *   Offline tests (1–8): Always run. Test extraction, prompt construction, error handling.
 *   Online tests (9–10): Only run when OPENAI_API_KEY is set. Test real API calls.
 *
 * Skip-with-warning: When API key is absent, online tests print a loud banner
 * and the summary distinguishes passed/failed/skipped. Exit code reflects
 * offline results only.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Test infra
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;

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
// Setup: temp DB for offline tests
// ---------------------------------------------------------------------------

const TEST_ROOT = join(tmpdir(), `sessionmem-m6-test-${Date.now()}`);
const DB_DIR = join(TEST_ROOT, 'db');
const DB_PATH = join(DB_DIR, 'test-m6.db');

mkdirSync(DB_DIR, { recursive: true });
process.env.SESSIONMEM_DB_PATH = DB_PATH;

const { loadEnv } = await import('../src/utils/env.js');
loadEnv();

const { extractTimeHint } = await import('../src/retrieval/extract-hint.js');
const { buildPrompt, estimateTokens } = await import('../src/llm/prompt.js');
const { callLLM } = await import('../src/llm/llm.js');
const { getContext } = await import('../src/retrieval/context.js');
const { getDb, insertEvent, closeDb } = await import('../src/db/index.js');

// Initialize test DB and seed events
getDb(DB_PATH);

const NOW = new Date('2026-08-22T10:00:00.000Z');
const seedEvents = [
  { timestamp: '2026-08-22T08:00:00.000Z', source: 'terminal', content: 'npm install express', projectPath: '/project/test' },
  { timestamp: '2026-08-22T08:05:00.000Z', source: 'terminal', content: 'npm test', projectPath: '/project/test' },
  { timestamp: '2026-08-22T08:10:00.000Z', source: 'file', content: 'src/server.js', projectPath: '/project/test' },
  { timestamp: '2026-08-22T08:15:00.000Z', source: 'terminal', content: 'node src/server.js', projectPath: '/project/test' },
  { timestamp: '2026-08-22T09:00:00.000Z', source: 'terminal', content: 'git add -A', projectPath: '/project/test' },
  { timestamp: '2026-08-22T09:01:00.000Z', source: 'terminal', content: 'git commit -m "add express server"', projectPath: '/project/test' },
  { timestamp: '2026-08-22T09:30:00.000Z', source: 'file', content: 'README.md', projectPath: '/project/test' },
];

for (const e of seedEvents) {
  insertEvent({ timestamp: e.timestamp, source: e.source, content: e.content, projectPath: e.projectPath });
}

console.log(`\n🔧 M6 Verification — LLM Query CLI`);
console.log(`   Seeded ${seedEvents.length} events\n`);

// ===========================================================================
// OFFLINE TESTS (no API key needed)
// ===========================================================================

// ---------------------------------------------------------------------------
// Test 1: extractTimeHint extracts "yesterday afternoon"
// ---------------------------------------------------------------------------

console.log('Test 1: extractTimeHint("what was I debugging yesterday afternoon?")');
{
  const result = extractTimeHint('what was I debugging yesterday afternoon?');
  assert(result !== null, 'Returns a result');
  assert(result.hint === 'yesterday afternoon', `Extracted hint: "${result.hint}"`);
  assert(
    !result.cleanedQuestion.includes('yesterday afternoon'),
    `Cleaned question: "${result.cleanedQuestion}"`
  );
}

// ---------------------------------------------------------------------------
// Test 2: extractTimeHint returns null for no time phrases
// ---------------------------------------------------------------------------

console.log('\nTest 2: extractTimeHint with no time phrase');
{
  assert(extractTimeHint('what packages are installed?') === null, 'No time phrase → null');
  assert(extractTimeHint('list all files') === null, '"list all files" → null');
  assert(extractTimeHint('') === null, 'empty string → null');
  assert(extractTimeHint(null) === null, 'null → null');
}

// ---------------------------------------------------------------------------
// Test 3: extractTimeHint handles "last 2 hours"
// ---------------------------------------------------------------------------

console.log('\nTest 3: extractTimeHint("what did I do in the last 2 hours?")');
{
  const result = extractTimeHint('what did I do in the last 2 hours?');
  assert(result !== null, 'Returns a result');
  assert(result.hint === 'last 2 hours', `Extracted hint: "${result.hint}"`);
  assert(result.cleanedQuestion.includes('what did I do'), `Cleaned: "${result.cleanedQuestion}"`);
}

// ---------------------------------------------------------------------------
// Test 4: buildPrompt produces valid messages array
// ---------------------------------------------------------------------------

console.log('\nTest 4: buildPrompt produces valid messages');
{
  const events = seedEvents.map((e, i) => ({ id: i + 1, ...e, project_path: e.projectPath }));
  const { messages } = buildPrompt({
    question: 'What package did I install?',
    events,
    hasMore: false,
    timeRange: { startTime: '2026-08-22T08:00:00.000Z', endTime: '2026-08-22T10:00:00.000Z' },
  });

  assert(Array.isArray(messages), 'messages is an array');
  assert(messages.length === 2, `messages has ${messages.length} entries (expected 2)`);
  assert(messages[0].role === 'system', 'First message is system');
  assert(messages[1].role === 'user', 'Second message is user');
}

// ---------------------------------------------------------------------------
// Test 5: buildPrompt includes all events
// ---------------------------------------------------------------------------

console.log('\nTest 5: buildPrompt includes all events in user message');
{
  const events = seedEvents.map((e, i) => ({ id: i + 1, ...e, project_path: e.projectPath }));
  const { messages } = buildPrompt({
    question: 'What did I do?',
    events,
  });

  const userContent = messages[1].content;
  assert(userContent.includes('npm install express'), 'Contains "npm install express"');
  assert(userContent.includes('git commit'), 'Contains "git commit"');
  assert(userContent.includes('src/server.js'), 'Contains "src/server.js"');
}

// ---------------------------------------------------------------------------
// Test 6: buildPrompt includes the question
// ---------------------------------------------------------------------------

console.log('\nTest 6: buildPrompt includes the question');
{
  const { messages } = buildPrompt({
    question: 'What package did I install today?',
    events: [{ id: 1, timestamp: '2026-08-22T08:00:00.000Z', source: 'terminal', content: 'npm install express', project_path: '/test' }],
  });

  assert(messages[1].content.includes('What package did I install today?'), 'User message contains the question');
}

// ---------------------------------------------------------------------------
// Test 7: buildPrompt mentions truncation when hasMore is true
// ---------------------------------------------------------------------------

console.log('\nTest 7: buildPrompt handles hasMore and token budget truncation');
{
  const { messages: messagesMore } = buildPrompt({
    question: 'What did I do?',
    events: [{ id: 1, timestamp: '2026-08-22T08:00:00.000Z', source: 'terminal', content: 'test', project_path: '/test' }],
    hasMore: true,
  });
  assert(messagesMore[1].content.includes('More events exist'), 'hasMore=true noted in prompt');

  // Token budget truncation: create many long events
  const manyEvents = Array.from({ length: 500 }, (_, i) => ({
    id: i,
    timestamp: `2026-08-22T08:${String(i % 60).padStart(2, '0')}:00.000Z`,
    source: 'terminal',
    content: `long-command-${i}-${'x'.repeat(100)}`,
    project_path: '/test',
  }));
  const { truncatedFromBudget, eventCount } = buildPrompt({
    question: 'What happened?',
    events: manyEvents,
    tokenBudget: 2000,
  });
  assert(truncatedFromBudget === true, 'Token budget truncation occurred');
  assert(eventCount < 500, `Truncated to ${eventCount} events (from 500)`);
}

// ---------------------------------------------------------------------------
// Test 8: Missing API key produces clear error
// ---------------------------------------------------------------------------

console.log('\nTest 8: Missing API key error');
{
  try {
    await callLLM({ messages: [{ role: 'user', content: 'test' }], apiKey: '' });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err.message.includes('OPENAI_API_KEY'), `Error mentions API key: "${err.message}"`);
  }

  try {
    await callLLM({ messages: [{ role: 'user', content: 'test' }], apiKey: null });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err.message.includes('OPENAI_API_KEY'), 'Null key error is clear');
  }
}

// ===========================================================================
// ONLINE TESTS (require OPENAI_API_KEY)
// ===========================================================================

const apiKey = process.env.OPENAI_API_KEY;
const ONLINE_TEST_COUNT = 2;

if (!apiKey) {
  // Loud, distinct skip banner
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ⚠️  SKIPPED: 2 online M6 tests — OPENAI_API_KEY not set       ║');
  console.log('║  These tests require a real API key and make billable API calls.║');
  console.log('║  Set $env:OPENAI_API_KEY to run them.                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  skipped = ONLINE_TEST_COUNT;
} else {
  // ---------------------------------------------------------------------------
  // Test 9: End-to-end — getContext → buildPrompt → callLLM → answer
  // ---------------------------------------------------------------------------

  console.log('\nTest 9: End-to-end LLM query (online)');
  {
    const result = getContext({ timeHint: 'last 3 hours', now: NOW });

    const { messages } = buildPrompt({
      question: 'What package did I install?',
      events: result.events,
      hasMore: result.hasMore,
      timeRange: result.timeRange,
    });

    try {
      const llmResult = await callLLM({
        messages,
        apiKey,
        model: 'gpt-4o-mini',
      });

      assert(llmResult.answer.length > 0, `Got an answer (${llmResult.answer.length} chars)`);
      assert(
        llmResult.answer.toLowerCase().includes('express'),
        `Answer mentions "express": "${llmResult.answer.substring(0, 100)}..."`
      );
    } catch (err) {
      assert(false, `LLM call failed: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 10: Streaming — onToken fires at least once
  // ---------------------------------------------------------------------------

  console.log('\nTest 10: Streaming callback fires (online)');
  {
    const { messages } = buildPrompt({
      question: 'What was the last command I ran?',
      events: [{ id: 1, timestamp: '2026-08-22T09:01:00.000Z', source: 'terminal', content: 'git commit -m "add express server"', project_path: '/test' }],
    });

    let tokenCount = 0;
    try {
      await callLLM({
        messages,
        apiKey,
        model: 'gpt-4o-mini',
        onToken: () => tokenCount++,
      });
      assert(tokenCount > 0, `onToken fired ${tokenCount} times`);
    } catch (err) {
      assert(false, `Streaming test failed: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

closeDb();
rmSync(TEST_ROOT, { recursive: true, force: true });

console.log('\n' + '─'.repeat(40));
const parts = [`${passed} passed`, `${failed} failed`];
if (skipped > 0) parts.push(`${skipped} skipped (online)`);
console.log(`Results: ${parts.join(', ')}, ${passed + failed + skipped} total`);
console.log('─'.repeat(40) + '\n');

if (failed > 0) process.exit(1);
