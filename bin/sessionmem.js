#!/usr/bin/env node

// sessionmem CLI entrypoint
// M1: init-db
// M2: flush, hook show

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
    const { closeDb } = await import('../src/db/index.js');
    try {
      const result = flushQueue();
      console.log(`✅ Flushed ${result.flushed} events (${result.skipped} skipped).`);
      closeDb();
    } catch (err) {
      console.error(`❌ Flush failed: ${err.message}`);
      closeDb();
      process.exit(1);
    }
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
  sessionmem hook show            Print the shell hook for manual installation
  sessionmem ask "<question>"     Query your session history (M6)
  sessionmem --help               Show this help message
`);
    break;

  default:
    console.error(`Unknown command: "${command}". Run "sessionmem --help" for usage.`);
    process.exit(1);
}
