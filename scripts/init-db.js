#!/usr/bin/env node

/**
 * scripts/init-db.js
 * Creates the sessionmem database at the default location (~/.sessionmem/session.db)
 * or at the path specified by SESSIONMEM_DB_PATH.
 */

import { getDb, closeDb } from '../src/db/index.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dbPath = process.env.SESSIONMEM_DB_PATH || join(homedir(), '.sessionmem', 'session.db');

console.log(`Initializing sessionmem database...`);
console.log(`  Path: ${dbPath}`);

try {
  const db = getDb(dbPath);
  console.log(`\n✅ Database created and schema applied successfully.`);
  console.log(`   Table: events (id, timestamp, source, content, project_path)`);
  console.log(`   Indexes: idx_events_timestamp, idx_events_source, idx_events_project`);
  closeDb();
} catch (err) {
  console.error(`\n❌ Failed to initialize database: ${err.message}`);
  process.exit(1);
}
