// ---------------------------------------------------------------------------
// Evaluation Runner for sessionmem
// ---------------------------------------------------------------------------
//
// Seeds an isolated SQLite database, runs queries through M5 retrieval and M6 LLM,
// validates the generated answers against ground-truth criteria, and computes metrics.

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SEED_EVENTS, EVAL_CASES, EVAL_NOW } from './dataset.js';
import { getContext, extractTimeHint } from '../src/retrieval/index.js';
import { buildPrompt, callLLM } from '../src/llm/index.js';
import { getDb, insertEvent, closeDb } from '../src/db/index.js';

/**
 * Validate an LLM answer against expected criteria.
 *
 * @param {string} answer
 * @param {object} testCase
 * @returns {{ passed: boolean, reasons: string[] }}
 */
export function validateAnswer(answer, testCase) {
  const lowerAnswer = answer.toLowerCase();
  const reasons = [];

  // 1. Check mustInclude (all must be present, case-insensitive)
  if (testCase.mustInclude) {
    for (const phrase of testCase.mustInclude) {
      if (!lowerAnswer.includes(phrase.toLowerCase())) {
        reasons.push(`Missing expected phrase: "${phrase}"`);
      }
    }
  }

  // 2. Check mustNotInclude (none must be present, case-insensitive)
  if (testCase.mustNotInclude) {
    for (const phrase of testCase.mustNotInclude) {
      if (lowerAnswer.includes(phrase.toLowerCase())) {
        reasons.push(`Contained forbidden phrase / hallucination: "${phrase}"`);
      }
    }
  }

  // 3. Custom validator (if defined)
  if (testCase.customValidator) {
    try {
      if (!testCase.customValidator(answer)) {
        reasons.push(`Failed custom validation rule`);
      }
    } catch (err) {
      reasons.push(`Custom validator threw error: ${err.message}`);
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

/**
 * Run the entire evaluation benchmark suite.
 *
 * @param {object} [options]
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @param {function} [options.onProgress]
 * @returns {Promise<object>}
 */
export async function runEvaluation(options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to run the evaluation suite.');
  }

  const model = options.model || process.env.SESSIONMEM_MODEL || 'gpt-4o-mini';

  // Setup isolated temporary database for eval
  const testRoot = join(tmpdir(), `sessionmem-eval-${Date.now()}`);
  const dbDir = join(testRoot, 'db');
  const dbPath = join(dbDir, 'eval.db');
  mkdirSync(dbDir, { recursive: true });

  const oldDbPath = process.env.SESSIONMEM_DB_PATH;
  process.env.SESSIONMEM_DB_PATH = dbPath;

  // Initialize DB and seed events
  getDb(dbPath);
  for (const event of SEED_EVENTS) {
    insertEvent({
      timestamp: event.timestamp,
      source: event.source,
      content: event.content,
      projectPath: event.projectPath,
    });
  }

  const results = [];
  const startTime = Date.now();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  try {
    for (let i = 0; i < EVAL_CASES.length; i++) {
      const testCase = EVAL_CASES[i];
      const caseStart = Date.now();

      // Extract time hint if not explicitly set
      let effectiveTimeHint = testCase.timeHint;
      let effectiveQuestion = testCase.question;

      if (!effectiveTimeHint) {
        const extracted = extractTimeHint(testCase.question);
        if (extracted) {
          effectiveTimeHint = extracted.hint;
          effectiveQuestion = extracted.cleanedQuestion;
        }
      }

      // Step 1: Retrieval
      const contextResult = getContext({
        timeHint: effectiveTimeHint,
        now: EVAL_NOW,
        limit: 100,
      });

      // Step 2: Prompt Building
      const { messages, eventCount } = buildPrompt({
        question: effectiveQuestion,
        events: contextResult.events,
        hasMore: contextResult.hasMore,
        timeRange: contextResult.timeRange,
        timeHint: effectiveTimeHint,
      });

      // Step 3: LLM Inference
      let answer = '';
      let usage = null;
      let error = null;

      try {
        const llmResult = await callLLM({
          messages,
          model,
          apiKey,
        });
        answer = llmResult.answer;
        usage = llmResult.usage;
        if (usage) {
          totalPromptTokens += usage.prompt || 0;
          totalCompletionTokens += usage.completion || 0;
        }
      } catch (err) {
        error = err.message;
      }

      const durationMs = Date.now() - caseStart;

      // Step 4: Validation
      let validation = { passed: false, reasons: [`Error during LLM call: ${error}`] };
      if (!error) {
        validation = validateAnswer(answer, testCase);
      }

      const caseResult = {
        id: testCase.id,
        category: testCase.category,
        question: testCase.question,
        timeHint: effectiveTimeHint,
        retrievedEventsCount: eventCount,
        passed: validation.passed,
        reasons: validation.reasons,
        answer,
        durationMs,
        usage,
        error,
      };

      results.push(caseResult);

      if (options.onProgress) {
        options.onProgress(caseResult, i + 1, EVAL_CASES.length);
      }
    }
  } finally {
    closeDb();
    if (oldDbPath) {
      process.env.SESSIONMEM_DB_PATH = oldDbPath;
    } else {
      delete process.env.SESSIONMEM_DB_PATH;
    }
    rmSync(testRoot, { recursive: true, force: true });
  }

  const totalDurationMs = Date.now() - startTime;
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const passRate = totalCount > 0 ? (passedCount / totalCount) * 100 : 0;

  return {
    summary: {
      total: totalCount,
      passed: passedCount,
      failed: totalCount - passedCount,
      passRate: Number(passRate.toFixed(1)),
      model,
      totalDurationMs,
      avgDurationMs: Math.round(totalDurationMs / totalCount),
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
    cases: results,
  };
}
