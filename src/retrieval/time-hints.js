// ---------------------------------------------------------------------------
// Time hint parser — natural language → UTC ISO 8601 boundaries
// ---------------------------------------------------------------------------
//
// Resolves relative time phrases ("yesterday afternoon", "last 2 hours") to
// { startTime, endTime } pairs where both values are UTC ISO 8601 strings
// (Z-suffixed), ready for direct use in SQLite string comparisons.
//
// Design:
//   - Local time is used to interpret phrases ("this morning" = 6am–12pm in
//     the user's timezone), then converted to UTC via .toISOString().
//   - Returns null for unrecognized input — caller decides fallback behavior.
//   - No external dependencies.

/**
 * @typedef {Object} TimeRange
 * @property {string} startTime — ISO 8601 UTC string (Z-suffix)
 * @property {string} endTime   — ISO 8601 UTC string (Z-suffix)
 */

/**
 * Parse a natural-language time hint into UTC boundaries.
 *
 * @param {string} hint — e.g. "yesterday afternoon", "last 2 hours", "today"
 * @param {Date} [now]  — override "now" for testing (default: new Date())
 * @returns {TimeRange | null} — null if the hint is unrecognized
 */
export function parseTimeHint(hint, now) {
  if (!hint || typeof hint !== 'string') return null;

  const ref = now ?? new Date();
  const normalized = hint.trim().toLowerCase();

  // ── "last N hours/minutes/days/weeks/months" ─────────────────────────────
  const relativeMatch = normalized.match(
    /^last\s+(\d+)\s+(hour|hours|minute|minutes|min|mins|day|days|week|weeks|month|months)$/
  );
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];

    // Months use calendar subtraction (variable-length), everything else is fixed ms
    if (unit.startsWith('month')) {
      const start = new Date(ref);
      start.setMonth(start.getMonth() - amount);
      return {
        startTime: start.toISOString(),
        endTime: ref.toISOString(),
      };
    }

    let ms;
    if (unit.startsWith('min')) ms = amount * 60_000;
    else if (unit.startsWith('day')) ms = amount * 86_400_000;
    else if (unit.startsWith('week')) ms = amount * 7 * 86_400_000;
    else ms = amount * 3_600_000; // hours
    return {
      startTime: new Date(ref.getTime() - ms).toISOString(),
      endTime: ref.toISOString(),
    };
  }

  // ── Helper: build a local Date from year/month/day + hour/minute ────────
  // Uses the Date constructor with individual components so it resolves in
  // the system's local timezone, then .toISOString() converts to UTC.
  const localDate = (y, m, d, h = 0, min = 0, s = 0, ms = 0) =>
    new Date(y, m, d, h, min, s, ms);

  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();

  // ── "today" ─────────────────────────────────────────────────────────────
  if (normalized === 'today') {
    return {
      startTime: localDate(y, m, d).toISOString(),
      endTime: ref.toISOString(),
    };
  }

  // ── "yesterday" ─────────────────────────────────────────────────────────
  if (normalized === 'yesterday') {
    return {
      startTime: localDate(y, m, d - 1).toISOString(),
      endTime: localDate(y, m, d).toISOString(),
    };
  }

  // ── Time-of-day periods ─────────────────────────────────────────────────
  // morning:   06:00 – 12:00
  // afternoon: 12:00 – 18:00
  // evening:   18:00 – 23:59:59.999

  const periods = {
    morning:   { startHour: 6,  endHour: 12 },
    afternoon: { startHour: 12, endHour: 18 },
    evening:   { startHour: 18, endHour: 24 },  // 24 = midnight next day
  };

  // "this morning", "this afternoon", "this evening"
  const thisMatch = normalized.match(/^this\s+(morning|afternoon|evening)$/);
  if (thisMatch) {
    const period = periods[thisMatch[1]];
    const start = localDate(y, m, d, period.startHour);
    // For evening, endHour=24 means midnight, but cap at "now" if we're
    // currently in this period (don't return future end times)
    let end = localDate(y, m, d, period.endHour);
    if (end.getTime() > ref.getTime()) {
      end = ref;
    }
    return {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  }

  // "yesterday morning", "yesterday afternoon", "yesterday evening"
  const yesterdayMatch = normalized.match(
    /^yesterday\s+(morning|afternoon|evening)$/
  );
  if (yesterdayMatch) {
    const period = periods[yesterdayMatch[1]];
    return {
      startTime: localDate(y, m, d - 1, period.startHour).toISOString(),
      endTime: localDate(y, m, d - 1, period.endHour).toISOString(),
    };
  }

  // ── ISO 8601 passthrough ────────────────────────────────────────────────
  // If the hint looks like an ISO date/datetime, try to parse it directly.
  // Supports both "2026-08-20" (whole day) and "2026-08-20T14:00:00Z" (exact).
  const isoDateMatch = normalized.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoDateMatch) {
    // Whole-day range: start of day → end of day (UTC)
    return {
      startTime: `${normalized}T00:00:00.000Z`,
      endTime: `${normalized}T23:59:59.999Z`,
    };
  }

  const isoDateTimeMatch = normalized.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/
  );
  if (isoDateTimeMatch) {
    // Exact datetime — use as both start and end (caller can adjust)
    const parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) {
      return {
        startTime: parsed.toISOString(),
        endTime: ref.toISOString(),
      };
    }
  }

  // ── Unrecognized ────────────────────────────────────────────────────────
  return null;
}
