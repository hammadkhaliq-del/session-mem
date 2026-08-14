import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_SOURCES = new Set(['terminal', 'file', 'browser']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve the default DB path: ~/.sessionmem/session.db
 * Overridable via SESSIONMEM_DB_PATH env var.
 */
function getDefaultDbPath() {
  if (process.env.SESSIONMEM_DB_PATH) {
    return process.env.SESSIONMEM_DB_PATH;
  }
  return join(homedir(), '.sessionmem', 'session.db');
}

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

/** @type {DatabaseSync | null} */
let _db = null;

/**
 * Open (or create) the SQLite database and apply the schema idempotently.
 * Creates the ~/.sessionmem/ directory if it doesn't exist.
 *
 * @param {string} [dbPath] — override the default DB location (useful for tests)
 * @returns {DatabaseSync}
 */
export function getDb(dbPath) {
  if (_db) return _db;

  const resolvedPath = dbPath ?? getDefaultDbPath();

  // Ensure the parent directory exists (mkdir -p equivalent).
  // Critical for first-run on a fresh machine.
  const dir = dirname(resolvedPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  _db = new DatabaseSync(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  _db.exec('PRAGMA journal_mode=WAL');

  // Apply schema (idempotent — CREATE TABLE/INDEX IF NOT EXISTS)
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  _db.exec(schema);

  return _db;
}

/**
 * Close the database connection and reset the singleton.
 */
export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Insert a single event into the events table.
 *
 * @param {object} event
 * @param {string} event.timestamp   — ISO 8601 string
 * @param {string} event.source      — 'terminal' | 'file' | 'browser'
 * @param {string} event.content     — the logged content (command, filename, etc.)
 * @param {string} event.projectPath — absolute path to the project directory
 * @returns {{ id: number }} the inserted row's id
 */
export function insertEvent({ timestamp, source, content, projectPath }) {
  if (!VALID_SOURCES.has(source)) {
    throw new Error(
      `Invalid source "${source}". Must be one of: ${[...VALID_SOURCES].join(', ')}`
    );
  }
  if (!timestamp || !content || !projectPath) {
    throw new Error('timestamp, content, and projectPath are all required.');
  }

  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO events (timestamp, source, content, project_path) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(timestamp, source, content, projectPath);
  return { id: Number(result.lastInsertRowid) };
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Query events with optional filters.
 *
 * @param {object} [filters]
 * @param {string} [filters.startTime]   — ISO 8601 lower bound (inclusive)
 * @param {string} [filters.endTime]     — ISO 8601 upper bound (inclusive)
 * @param {string} [filters.source]      — filter by source type
 * @param {string} [filters.projectPath] — filter by project path
 * @param {number} [filters.limit=200]   — max rows to return
 * @returns {Array<{id: number, timestamp: string, source: string, content: string, project_path: string}>}
 */
export function getEvents(filters = {}) {
  const { startTime, endTime, source, projectPath, limit = 200 } = filters;

  const conditions = [];
  const params = [];

  if (startTime) {
    conditions.push('timestamp >= ?');
    params.push(startTime);
  }
  if (endTime) {
    conditions.push('timestamp <= ?');
    params.push(endTime);
  }
  if (source) {
    if (!VALID_SOURCES.has(source)) {
      throw new Error(
        `Invalid source "${source}". Must be one of: ${[...VALID_SOURCES].join(', ')}`
      );
    }
    conditions.push('source = ?');
    params.push(source);
  }
  if (projectPath) {
    conditions.push('project_path = ?');
    params.push(projectPath);
  }

  let sql = 'SELECT id, timestamp, source, content, project_path FROM events';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY timestamp ASC';
  sql += ` LIMIT ?`;
  params.push(limit);

  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}
