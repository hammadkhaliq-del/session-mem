#!/usr/bin/env node

// sessionmem CLI entrypoint
// M1: init-db
// M2: flush, hook show
// M3: watch

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { loadEnv } from '../src/utils/env.js';

// Automatically load variables from .env (cwd, parent dirs, ~/.sessionmem/.env)
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const command = process.argv[2];

switch (command) {
  case 'init-db': {
    const { getDb, closeDb } = await import('../src/db/index.js');
    const db = getDb();
    console.log('✅ Database initialized successfully.');
    closeDb();
    break;
  }

  case 'flush': {
    const { flushQueue } = await import('../src/terminal/flush.js');
    const { getDb, getEvents, closeDb } = await import('../src/db/index.js');
    try {
      const result = flushQueue();
      console.log(`✅ Flushed ${result.flushed} events (${result.skipped} skipped, ${result.redacted} redacted).`);

      // Health check: warn if no recent file events exist but terminal events do
      try {
        getDb();
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const recentTerminal = getEvents({ source: 'terminal', startTime: twoHoursAgo, limit: 1 });
        const recentFile = getEvents({ source: 'file', startTime: twoHoursAgo, limit: 1 });

        if (recentTerminal.length > 0 && recentFile.length === 0) {
          console.log('⚠️  No file-change events found for this project. Is `sessionmem watch` running?');
        }
      } catch {
        // Health check is best-effort — don't fail the flush for it
      }

      closeDb();
    } catch (err) {
      console.error(`❌ Flush failed: ${err.message}`);
      const { closeDb: closeDb2 } = await import('../src/db/index.js');
      closeDb2();
      process.exit(1);
    }
    break;
  }

  case 'watch': {
    const { startWatcher } = await import('../src/watcher/watch.js');
    const { resolveProjectRoot } = await import('../src/utils/project-root.js');
    const { resolve } = await import('node:path');

    const targetDir = resolve(process.argv[3] || process.cwd());
    const projectRoot = resolveProjectRoot(targetDir);

    console.log(`👁️  Watching ${projectRoot} for file changes... (Ctrl+C to stop)`);

    const watcher = startWatcher(targetDir);

    // Graceful shutdown
    const shutdown = () => {
      watcher.close();
      console.log(`\nStopped. Logged ${watcher.eventCount} file events.`);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    break;
  }

  case 'hook': {
    const subcommand = process.argv[3];
    if (subcommand === 'show') {
      const shell = process.argv[4] || '--powershell';
      if (shell === '--powershell' || shell === 'powershell') {
        const hookPath = join(__dirname, '..', 'hooks', 'powershell-hook.ps1');
        const hookContent = readFileSync(hookPath, 'utf-8');
        console.log('\nCopy the following block into your $PROFILE:\n');
        console.log('─'.repeat(60));
        console.log(hookContent);
        console.log('─'.repeat(60));
        console.log('\nTo open your profile:  notepad $PROFILE');
        console.log('To reload:             . $PROFILE\n');
      } else {
        console.log(`Shell "${shell}" hooks are not yet available. Currently supported: powershell`);
      }
    } else {
      console.error(`Unknown hook subcommand: "${subcommand}". Usage: sessionmem hook show [--powershell]`);
      process.exit(1);
    }
    break;
  }

  case 'context': {
    const { getContext } = await import('../src/retrieval/index.js');
    const { getDb, closeDb } = await import('../src/db/index.js');
    const { resolve } = await import('node:path');

    // Parse flags: --time "...", --source "...", --project "...", --limit N
    const args = process.argv.slice(3);
    let timeHint = null, source = null, projectPath = null, limit = 50;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--time':    timeHint = args[++i]; break;
        case '--source':  source = args[++i]; break;
        case '--project': projectPath = resolve(args[++i]); break;
        case '--limit':   limit = parseInt(args[++i], 10); break;
      }
    }

    try {
      getDb();
      const result = getContext({ timeHint, source, projectPath, limit });

      if (result.timeRange) {
        console.log(`\n⏰ Time window: ${result.timeRange.startTime} → ${result.timeRange.endTime}`);
      } else if (timeHint) {
        console.log(`\n⚠️  Unrecognized time hint: "${timeHint}" — showing all events (up to ${limit})`);
      }

      console.log(`📊 ${result.events.length} events${result.hasMore ? ' (more available — increase --limit)' : ''}\n`);

      if (result.events.length === 0) {
        console.log('No events found for the given filters.');
      } else {
        for (const e of result.events) {
          const ts = e.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
          const tag = e.source.padEnd(8);
          console.log(`  ${ts}  [${tag}]  ${e.content}`);
        }
      }

      closeDb();
    } catch (err) {
      console.error(`❌ Context retrieval failed: ${err.message}`);
      const { closeDb: closeDb2 } = await import('../src/db/index.js');
      closeDb2();
      process.exit(1);
    }
    break;
  }

  case 'ask': {
    const { getContext, extractTimeHint } = await import('../src/retrieval/index.js');
    const { buildPrompt, callLLM } = await import('../src/llm/index.js');
    const { getDb, closeDb } = await import('../src/db/index.js');
    const { resolve } = await import('node:path');

    // Parse flags and collect the question from positional args
    const args = process.argv.slice(3);
    let timeHint = null, model = null, projectPath = null, verbose = false, limit = 200;
    const questionParts = [];

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--time':    timeHint = args[++i]; break;
        case '--model':   model = args[++i]; break;
        case '--project': projectPath = resolve(args[++i]); break;
        case '--limit':   limit = parseInt(args[++i], 10); break;
        case '--verbose': verbose = true; break;
        default:          questionParts.push(args[i]); break;
      }
    }

    const question = questionParts.join(' ').trim();
    if (!question) {
      console.error('❌ No question provided. Usage: sessionmem ask "<question>"');
      process.exit(1);
    }

    // Check API key early
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not set.');
      console.error('   Run: $env:OPENAI_API_KEY = "sk-..."');
      process.exit(1);
    }

    // Extract time hint from question if no explicit --time flag
    let effectiveQuestion = question;
    if (!timeHint) {
      const extracted = extractTimeHint(question);
      if (extracted) {
        timeHint = extracted.hint;
        effectiveQuestion = extracted.cleanedQuestion;
      }
    }

    try {
      getDb();
      const result = getContext({ timeHint, projectPath, limit });

      if (result.events.length === 0) {
        const hint = timeHint ? ` for "${timeHint}"` : '';
        console.log(`No session events found${hint}. Try a broader time range or run \`sessionmem flush\` first.`);
        closeDb();
        process.exit(0);
      }

      // Build prompt with token budget enforcement
      const { messages, eventCount, truncatedFromBudget } = buildPrompt({
        question: effectiveQuestion,
        events: result.events,
        hasMore: result.hasMore,
        timeRange: result.timeRange,
        timeHint,
      });

      if (truncatedFromBudget) {
        console.error(`⚠️  Context truncated: using ${eventCount} most recent of ${result.events.length} events`);
      }

      closeDb();

      // Stream the LLM response
      const llmResult = await callLLM({
        messages,
        model,
        apiKey,
        onToken: (token) => process.stdout.write(token),
      });

      // Ensure we end on a newline
      process.stdout.write('\n');

      // Verbose metadata footer
      if (verbose) {
        console.log('\n' + '─'.repeat(40));
        const timeDesc = result.timeRange
          ? `"${timeHint}" (${result.timeRange.startTime} → ${result.timeRange.endTime})`
          : 'no time filter';
        console.log(`📊 ${eventCount} events · ${timeDesc}`);
        if (llmResult.usage) {
          const usedModel = model || process.env.SESSIONMEM_MODEL || 'gpt-4o-mini';
          console.log(`🤖 ${usedModel} · ${llmResult.usage.prompt} prompt tokens · ${llmResult.usage.completion} completion tokens`);
        }
      }
    } catch (err) {
      console.error(`\n❌ ${err.message}`);
      try { const { closeDb: c } = await import('../src/db/index.js'); c(); } catch {}
      process.exit(1);
    }
    break;
  }

  case undefined:
  case '--help':
  case '-h':
    console.log(`
sessionmem — session memory agent

Usage:
  sessionmem init-db              Create / initialize the database
  sessionmem flush                Flush queued terminal events to SQLite
  sessionmem watch [directory]    Watch a directory for file changes (default: cwd)
  sessionmem hook show            Print the shell hook for manual installation
  sessionmem context [options]    Retrieve context events (M5)
  sessionmem ask "<question>"     Query your session history
  sessionmem --help               Show this help message

Context options:
  --time "<hint>"       Time window (e.g. "today", "yesterday afternoon", "last 2 hours")
  --source <type>       Filter by source: terminal, file, browser
  --project <path>      Filter by project path
  --limit <n>           Max events to return (default: 50)

Ask options:
  --time "<hint>"       Explicit time window (auto-extracted from question if omitted)
  --model <name>        LLM model (default: gpt-4o-mini, env: SESSIONMEM_MODEL)
  --project <path>      Filter by project path
  --verbose             Show metadata (events used, tokens, model) after the answer
`);
    break;

  default:
    console.error(`Unknown command: "${command}". Run "sessionmem --help" for usage.`);
    process.exit(1);
}
