/**
 * One-time migration: convert existing offset-format timestamps to UTC.
 *
 * Finds all rows where the timestamp contains '+' (offset format like +05:00)
 * and converts them to Z-suffixed UTC using JavaScript's Date parser, which
 * correctly handles ISO 8601 offset strings.
 *
 * Safe to run multiple times — it's a no-op if no offset rows remain.
 */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { homedir } from 'node:os';

const dbPath = process.env.SESSIONMEM_DB_PATH || join(homedir(), '.sessionmem', 'session.db');
const db = new DatabaseSync(dbPath);

const offsetRows = db.prepare("SELECT id, timestamp FROM events WHERE timestamp LIKE '%+%'").all();

if (offsetRows.length === 0) {
  console.log('No offset-format timestamps found. Nothing to migrate.');
  db.close();
  process.exit(0);
}

console.log(`Found ${offsetRows.length} rows with offset-format timestamps. Converting to UTC...`);

const update = db.prepare('UPDATE events SET timestamp = ? WHERE id = ?');

for (const row of offsetRows) {
  const utc = new Date(row.timestamp).toISOString();
  console.log(`  id=${row.id}: ${row.timestamp} → ${utc}`);
  update.run(utc, row.id);
}

console.log('Done. All timestamps are now UTC (Z-suffix).');
db.close();
