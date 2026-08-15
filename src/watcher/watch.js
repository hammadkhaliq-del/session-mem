import { watch } from 'node:fs';
import { appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { resolveProjectRoot } from '../utils/project-root.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 500;
const QUEUE_FILENAME = 'queue.jsonl';

/**
 * Patterns to ignore. Matched against the relative path from the watched root.
 * Each entry is tested with startsWith (for directories) or exact match / endsWith.
 */
const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.sessionmem',
  'dist',
  'build',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
]);

const IGNORE_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
]);

const IGNORE_EXTENSIONS = new Set([
  '.db',
  '.db-journal',
  '.db-wal',
  '.db-shm',
  '.swp',
  '.swo',
  '.tmp',
  '.log',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a relative path should be ignored.
 * @param {string} relativePath — forward-slash normalized relative path
 * @returns {boolean}
 */
function shouldIgnore(relativePath) {
  // Normalize to forward slashes for consistent matching
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/');

  // Check if any directory segment is in the ignore list
  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) return true;
  }

  // Check the filename itself
  const filename = parts[parts.length - 1];
  if (IGNORE_FILES.has(filename)) return true;

  // Check extension
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx !== -1) {
    const ext = filename.slice(dotIdx);
    if (IGNORE_EXTENSIONS.has(ext)) return true;
  }

  return false;
}

/**
 * Resolve the queue file path.
 * Overridable via SESSIONMEM_QUEUE_DIR env var.
 * @returns {string}
 */
function getQueuePath() {
  const dir = process.env.SESSIONMEM_QUEUE_DIR || join(homedir(), '.sessionmem');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, QUEUE_FILENAME);
}

// ---------------------------------------------------------------------------
// Watcher
// ---------------------------------------------------------------------------

/**
 * Start watching a directory for file changes.
 * Appends events to the sessionmem queue (same queue.jsonl used by the terminal hook).
 *
 * @param {string} targetDir — directory to watch
 * @param {object} [options]
 * @param {string} [options.queueDir] — override queue directory (for tests)
 * @param {function} [options.onEvent] — callback for each logged event (for CLI output / tests)
 * @param {boolean} [options.silent] — suppress console output (for tests)
 * @returns {{ close: () => void, eventCount: number }}
 */
export function startWatcher(targetDir, options = {}) {
  const resolvedDir = resolve(targetDir);
  const projectRoot = resolveProjectRoot(resolvedDir);
  const queuePath = options.queueDir
    ? join(options.queueDir, QUEUE_FILENAME)
    : getQueuePath();

  // Ensure queue directory exists
  const queueDir = join(queuePath, '..');
  if (!existsSync(resolve(queueDir))) {
    mkdirSync(resolve(queueDir), { recursive: true });
  }

  /** @type {Map<string, NodeJS.Timeout>} */
  const debounceTimers = new Map();
  let eventCount = 0;
  let closed = false;

  const watcher = watch(resolvedDir, { recursive: true }, (eventType, filename) => {
    if (closed || !filename) return;

    // Compute relative path from the watched directory
    const relativePath = filename;

    // Filter out ignored paths
    if (shouldIgnore(relativePath)) return;

    // Debounce: if we already have a timer for this file, reset it
    const existing = debounceTimers.get(relativePath);
    if (existing) {
      clearTimeout(existing);
    }

    debounceTimers.set(
      relativePath,
      setTimeout(() => {
        debounceTimers.delete(relativePath);

        // Skip directories — on Windows, fs.watch fires change events for
        // directories when their contents change (new file created inside).
        // Also skip if the file was deleted (existsSync returns false).
        const fullPath = join(resolvedDir, relativePath);
        try {
          if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) return;
        } catch {
          return; // file disappeared between event and stat — skip
        }

        // Build the queue entry
        const entry = {
          timestamp: new Date().toISOString(),
          source: 'file',
          content: relativePath.replace(/\\/g, '/'),
          project_path: projectRoot,
        };

        try {
          appendFileSync(queuePath, JSON.stringify(entry) + '\n');
          eventCount++;

          if (options.onEvent) {
            options.onEvent(entry);
          }
          if (!options.silent) {
            console.log(`📝 ${entry.content}`);
          }
        } catch (err) {
          if (!options.silent) {
            console.error(`[sessionmem] Failed to write queue entry: ${err.message}`);
          }
        }
      }, DEBOUNCE_MS)
    );
  });

  watcher.on('error', (err) => {
    if (!options.silent) {
      console.error(`[sessionmem] Watcher error: ${err.message}`);
    }
  });

  return {
    close() {
      closed = true;
      watcher.close();
      // Clear any pending debounce timers
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
    },
    get eventCount() {
      return eventCount;
    },
  };
}

export { shouldIgnore, DEBOUNCE_MS };
