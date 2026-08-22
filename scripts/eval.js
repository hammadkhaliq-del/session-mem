#!/usr/bin/env node

/**
 * sessionmem — Evaluation Benchmark Runner (Module 7)
 *
 * Runs 10 test cases against a seeded multi-day developer session.
 * Evaluates retrieval precision, time discrimination, hallucination resistance,
 * and secret safety.
 *
 * Usage:
 *   node scripts/eval.js
 *   npm run eval
 *   node scripts/eval.js --verbose
 *   node scripts/eval.js --save-report
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/utils/env.js';
import { runEvaluation } from '../evals/runner.js';

// Automatically load credentials from .env
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const saveReport = args.includes('--save-report');

console.log('\n📊 sessionmem — Evaluation Benchmark Suite (M7)');
console.log('═'.repeat(65));

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ❌ OPENAI_API_KEY is not set.                                  ║');
  console.log('║  Please set your API key in .env or via environment variable.    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  process.exit(1);
}

try {
  const evalReport = await runEvaluation({
    apiKey,
    onProgress: (c, current, total) => {
      const statusIcon = c.passed ? '✅ PASS' : '❌ FAIL';
      const timeStr = `${(c.durationMs / 1000).toFixed(2)}s`;
      console.log(`[${current}/${total}] ${c.id} [${statusIcon}] (${timeStr}) — ${c.question}`);

      if (verbose) {
        console.log(`     Category: ${c.category}`);
        console.log(`     Answer:   ${c.answer.replace(/\n/g, ' ')}`);
        if (!c.passed && c.reasons.length > 0) {
          console.log(`     Reasons:  ${c.reasons.join('; ')}`);
        }
        console.log('');
      } else if (!c.passed) {
        console.log(`     ⚠️ ${c.reasons.join('; ')}`);
      }
    },
  });

  const { summary } = evalReport;

  console.log('\n' + '═'.repeat(65));
  console.log('🏁 EVALUATION SUMMARY');
  console.log('─'.repeat(65));
  console.log(`Model:           ${summary.model}`);
  console.log(`Total Cases:     ${summary.total}`);
  console.log(`Passed:          ${summary.passed} / ${summary.total} (${summary.passRate}%)`);
  console.log(`Failed:          ${summary.failed}`);
  console.log(`Total Duration:  ${(summary.totalDurationMs / 1000).toFixed(2)}s (avg ${(summary.avgDurationMs / 1000).toFixed(2)}s/case)`);
  console.log(`Tokens Used:     ${summary.totalTokens} (${summary.totalPromptTokens} prompt + ${summary.totalCompletionTokens} completion)`);
  console.log('═'.repeat(65));

  if (saveReport) {
    const reportPath = join(__dirname, '..', 'eval-results.json');
    writeFileSync(reportPath, JSON.stringify(evalReport, null, 2), 'utf-8');
    console.log(`\n💾 Saved detailed evaluation report to: ${reportPath}`);
  }

  // Done-check: Pass rate must be >= 80% (8/10) to pass the eval milestone
  if (summary.passRate < 80) {
    console.error(`\n❌ Eval benchmark failed: Pass rate (${summary.passRate}%) is below 80% threshold.`);
    process.exit(1);
  } else {
    console.log(`\n✨ Eval benchmark SUCCESS: ${summary.passed}/${summary.total} passed (${summary.passRate}%). Done-check met!\n`);
  }
} catch (err) {
  console.error(`\n❌ Evaluation suite execution error: ${err.message}`);
  process.exit(1);
}
