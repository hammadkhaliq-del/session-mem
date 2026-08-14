#!/usr/bin/env node

// sessionmem CLI entrypoint
// M1: only init-db is functional. Other subcommands are stubs for M2–M6.

const command = process.argv[2];

switch (command) {
  case 'init-db': {
    // Dynamic import to keep top-level light
    const { getDb, closeDb } = await import('../src/db/index.js');
    const db = getDb();
    console.log('✅ Database initialized successfully.');
    closeDb();
    break;
  }

  case 'ask':
    console.log('⏳ "sessionmem ask" is not yet implemented (planned for M6).');
    process.exit(0);
    break;

  case 'log':
    console.log('⏳ "sessionmem log" is not yet implemented (planned for M2/M3).');
    process.exit(0);
    break;

  case undefined:
  case '--help':
  case '-h':
    console.log(`
sessionmem — session memory agent

Usage:
  sessionmem init-db          Create / initialize the database
  sessionmem ask "<question>"  Query your session history (M6)
  sessionmem log               View recent logged events (M2/M3)
  sessionmem --help            Show this help message
`);
    break;

  default:
    console.error(`Unknown command: "${command}". Run "sessionmem --help" for usage.`);
    process.exit(1);
}
