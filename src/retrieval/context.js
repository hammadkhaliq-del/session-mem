// ---------------------------------------------------------------------------
// Context retrieval — pull a relevant slice of events for a query
// ---------------------------------------------------------------------------
//
// This is the bridge between raw event storage (M1–M4) and the LLM query
// layer (M6). Its only job: given optional filters (time hint, source,
// project), return the right events with pagination metadata.

import { getEvents } from '../db/index.js';
import { parseTimeHint } from './time-hints.js';

/**
 * @typedef {Object} ContextResult
 * @property {Array<{id: number, timestamp: string, source: string, content: string, project_path: string}>} events
 * @property {boolean} hasMore — true if more events exist beyond the limit
 * @property {{ startTime: string, endTime: string } | null} timeRange — resolved time window, or null if none
 */

/**
 * Retrieve context events from the database, optionally filtered by time,
 * source, and project path.
 *
 * @param {object} [options]
 * @param {string} [options.timeHint]    — natural language time reference (e.g. "yesterday afternoon")
 * @param {string} [options.source]      — filter by event source ('terminal' | 'file' | 'browser')
 * @param {string} [options.projectPath] — filter by project path
 * @param {number} [options.limit=200]   — max events to return
 * @param {Date}   [options.now]         — override "now" for testing
 * @returns {ContextResult}
 */
export function getContext(options = {}) {
  const { timeHint, source, projectPath, limit = 200, now } = options;

  // Resolve time hint to UTC boundaries
  let timeRange = null;
  if (timeHint) {
    timeRange = parseTimeHint(timeHint, now);
    // If the hint was provided but unrecognized, timeRange stays null
    // and we query without time bounds — caller gets everything up to limit.
  }

  // Build filter object for getEvents
  const filters = { limit: limit + 1 }; // +1 to detect "has more"

  if (timeRange) {
    filters.startTime = timeRange.startTime;
    filters.endTime = timeRange.endTime;
  }
  if (source) {
    filters.source = source;
  }
  if (projectPath) {
    filters.projectPath = projectPath;
  }

  // Query
  const rows = getEvents(filters);

  // Apply limit+1 trick: if we got more than `limit`, there are more rows
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;

  return { events, hasMore, timeRange };
}
