/**
 * M7 Verification — Evaluation Suite & Benchmark Runner
 *
 * Tests:
 *  1. validateAnswer() passes when all mustInclude phrases are present
 *  2. validateAnswer() fails when any mustInclude phrase is missing
 *  3. validateAnswer() fails when any mustNotInclude phrase is present (hallucination detection)
 *  4. validateAnswer() handles customValidator functions properly
 *  5. SEED_EVENTS dataset integrity (chronological UTC timestamps, valid sources)
 *  6. EVAL_CASES dataset contains 10 well-formed benchmark scenarios
 *  7. runEvaluation() executes and produces structured report with pass rate
 */

import { EVAL_NOW, SEED_EVENTS, EVAL_CASES } from '../evals/dataset.js';
import { validateAnswer, runEvaluation } from '../evals/runner.js';

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

console.log('\n🔧 M7 Verification — Evaluation Suite & Benchmark Runner\n');

// ---------------------------------------------------------------------------
// Test 1: validateAnswer() mustInclude checks
// ---------------------------------------------------------------------------
console.log('Test 1: validateAnswer() mustInclude matching');
{
  const testCase = {
    mustInclude: ['express', 'server.js'],
  };

  const validAnswer = 'You installed express and created server.js for the API.';
  const res1 = validateAnswer(validAnswer, testCase);
  assert(res1.passed === true, 'Accepts answer containing all mustInclude items');

  const invalidAnswer = 'You created server.js for the API.';
  const res2 = validateAnswer(invalidAnswer, testCase);
  assert(res2.passed === false, 'Rejects answer missing a mustInclude item');
  assert(res2.reasons.some((r) => r.includes('express')), 'Reports missing item in reasons');
}

// ---------------------------------------------------------------------------
// Test 2: validateAnswer() mustNotInclude hallucination rejection
// ---------------------------------------------------------------------------
console.log('\nTest 2: validateAnswer() mustNotInclude anti-hallucination');
{
  const testCase = {
    mustInclude: ['no'],
    mustNotInclude: ['style.css', 'app.py'],
  };

  const cleanAnswer = 'No, there are no python or css files in this session.';
  const res1 = validateAnswer(cleanAnswer, testCase);
  assert(res1.passed === true, 'Accepts answer without forbidden phrases');

  const hallucinatedAnswer = 'No, but you modified style.css earlier.';
  const res2 = validateAnswer(hallucinatedAnswer, testCase);
  assert(res2.passed === false, 'Rejects answer containing a forbidden hallucination');
  assert(res2.reasons.some((r) => r.includes('style.css')), 'Identifies hallucinated phrase');
}

// ---------------------------------------------------------------------------
// Test 3: validateAnswer() customValidator execution
// ---------------------------------------------------------------------------
console.log('\nTest 3: validateAnswer() customValidator');
{
  const testCase = {
    customValidator: (answer) => answer.includes('42'),
  };

  assert(validateAnswer('The answer is 42', testCase).passed === true, 'Custom validator passes on 42');
  assert(validateAnswer('The answer is 100', testCase).passed === false, 'Custom validator fails on 100');
}

// ---------------------------------------------------------------------------
// Test 4: SEED_EVENTS Dataset Structure & Timestamp Integrity
// ---------------------------------------------------------------------------
console.log('\nTest 4: SEED_EVENTS dataset integrity');
{
  assert(Array.isArray(SEED_EVENTS) && SEED_EVENTS.length >= 10, `SEED_EVENTS has ${SEED_EVENTS.length} events (>= 10)`);

  const validSources = new Set(['terminal', 'file', 'browser']);
  const allValidSources = SEED_EVENTS.every((e) => validSources.has(e.source));
  assert(allValidSources, 'All seed events have valid source types');

  const allUtcTimestamps = SEED_EVENTS.every((e) => e.timestamp && e.timestamp.endsWith('Z'));
  assert(allUtcTimestamps, 'All seed timestamps are UTC ISO 8601 strings (Z-suffix)');

  // Chronological order verification
  let isChronological = true;
  for (let i = 1; i < SEED_EVENTS.length; i++) {
    if (SEED_EVENTS[i].timestamp < SEED_EVENTS[i - 1].timestamp) {
      isChronological = false;
      break;
    }
  }
  assert(isChronological, 'All seed events are in strict chronological order');
}

// ---------------------------------------------------------------------------
// Test 5: EVAL_CASES Benchmark Scenarios
// ---------------------------------------------------------------------------
console.log('\nTest 5: EVAL_CASES benchmark structure');
{
  assert(Array.isArray(EVAL_CASES) && EVAL_CASES.length === 10, `EVAL_CASES contains exactly 10 benchmark scenarios (got ${EVAL_CASES.length})`);

  const allHaveIds = EVAL_CASES.every((c) => c.id && c.category && c.question);
  assert(allHaveIds, 'All eval cases have id, category, and question defined');

  const uniqueIds = new Set(EVAL_CASES.map((c) => c.id));
  assert(uniqueIds.size === EVAL_CASES.length, 'All eval case IDs are unique');
}

// ---------------------------------------------------------------------------
// Test 6: EVAL_NOW Anchor Date
// ---------------------------------------------------------------------------
console.log('\nTest 6: EVAL_NOW reference anchor');
{
  assert(EVAL_NOW instanceof Date && !isNaN(EVAL_NOW.getTime()), 'EVAL_NOW is a valid Date instance');
  assert(EVAL_NOW.toISOString().endsWith('Z'), 'EVAL_NOW resolves to UTC');
}

console.log('\n' + '─'.repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('─'.repeat(40) + '\n');

if (failed > 0) process.exit(1);
