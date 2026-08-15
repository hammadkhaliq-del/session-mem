import { readFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { insertEvent, getDb, closeDb } from '../db/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_FILENAME = 'queue.jsonl';
const PROCESSING_FILENAME = 'queue.processing.jsonl';

/**
 * Resolve the sessionmem data directory.
 * Defaults to ~/.sessionmem, overridable via SESSIONMEM_DB_PATH's parent dir.
 */
function getQueueDir() {
  if (process.env.SESSIONMEM_QUEUE_DIR) {
    return process.env.SESSIONMEM_QUEUE_DIR;
  }
  return join(homedir(), '.sessionmem');
}

// ---------------------------------------------------------------------------
// Queue flusher
// ---------------------------------------------------------------------------

/**
 * Flush the event queue file into SQLite.
 *
 * 1. Recover any previously interrupted flush (queue.processing.jsonl)
 * 2. Atomic rename: queue.jsonl → queue.processing.jsonl
 * 3. Parse JSON lines, batch insert into SQLite within a transaction
 * 4. Delete queue.processing.jsonl on success
 *
 * @param {string} [queueDir] — override the queue directory (for tests)
 * @returns {{ flushed: number, skipped: number }}
 */
export function flushQueue(queueDir) {
  const dir = queueDir ?? getQueueDir();
  const queuePath = join(dir, QUEUE_FILENAME);
  const processingPath = join(dir, PROCESSING_FILENAME);

  // Ensure DB is initialized
  getDb();

  let totalFlushed = 0;
  let totalSkipped = 0;

  // Step 1: Recover interrupted flush if queue.processing.jsonl exists
  if (existsSync(processingPath)) {
    const result = processFile(processingPath);
    totalFlushed += result.flushed;
    totalSkipped += result.skipped;
  }

  // Step 2: Atomic rename queue.jsonl → queue.processing.jsonl
  if (!existsSync(queuePath)) {
    return { flushed: totalFlushed, skipped: totalSkipped };
  }

  // Check if queue file is empty
  const stat = readFileSync(queuePath, 'utf-8');
  if (stat.trim().length === 0) {
    unlinkSync(queuePath);
    return { flushed: totalFlushed, skipped: totalSkipped };
  }

  renameSync(queuePath, processingPath);

  // Step 3: Process the renamed file
  const result = processFile(processingPath);
  totalFlushed += result.flushed;
  totalSkipped += result.skipped;

  return { flushed: totalFlushed, skipped: totalSkipped };
}

/**
 * Parse a JSONL file and batch-insert all valid events into SQLite.
 * Deletes the file after successful processing.
 *
 * @param {string} filePath — absolute path to the JSONL file
 * @returns {{ flushed: number, skipped: number }}
 */
function processFile(filePath) {
  let flushed = 0;
  let skipped = 0;

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    unlinkSync(filePath);
    return { flushed, skipped };
  }

  // Parse all lines first, collect valid events
  const events = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      // Validate required fields
      if (!event.timestamp || !event.source || !event.content || !event.project_path) {
        console.error(`[sessionmem] Skipping line — missing required fields: ${line.substring(0, 80)}`);
        skipped++;
        continue;
      }

      events.push(event);
    } catch {
      console.error(`[sessionmem] Skipping malformed JSON line: ${line.substring(0, 80)}`);
      skipped++;
    }
  }

  // Batch insert within a single transaction for performance
  if (events.length > 0) {
    const db = getDb();
    db.exec('BEGIN TRANSACTION');
    try {
      for (const event of events) {
        insertEvent({
          timestamp: event.timestamp,
          source: event.source,
          content: event.content,
          projectPath: event.project_path,
        });
      }
      db.exec('COMMIT');
      flushed = events.length;
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Flush failed during batch insert: ${err.message}`);
    }
  }

  // Step 4: Delete the processed file only after successful insert
  unlinkSync(filePath);

  return { flushed, skipped };
}
