#!/usr/bin/env node

// sessionmem CLI entrypoint
// M1: init-db
// M2: flush, hook show
// M3: watch

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

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
      console.log(`✅ Flushed ${result.flushed} events (${result.skipped} skipped).`);

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

  case 'ask':
    console.log('⏳ "sessionmem ask" is not yet implemented (planned for M6).');
    process.exit(0);
    break;

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
  sessionmem ask "<question>"     Query your session history (M6)
  sessionmem --help               Show this help message
`);
    break;

  default:
    console.error(`Unknown command: "${command}". Run "sessionmem --help" for usage.`);
    process.exit(1);
}
