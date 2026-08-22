// ---------------------------------------------------------------------------
// Time hint extraction from natural-language questions
// ---------------------------------------------------------------------------
//
// Scans a question string for known time phrases (the same set that
// parseTimeHint supports) and returns both the extracted hint and the
// question with the hint stripped out.
//
// This is a regex scanner, not NLP. Intentionally conservative — better to
// miss a hint and return too many events than to misparse and return wrong ones.

/**
 * Known time phrase patterns, ordered longest-first to avoid partial matches.
 * Each pattern matches a time phrase that parseTimeHint can resolve.
 */
const TIME_PATTERNS = [
  // "yesterday morning/afternoon/evening" (must come before bare "yesterday")
  /\byesterday\s+(?:morning|afternoon|evening)\b/i,
  // "this morning/afternoon/evening"
  /\bthis\s+(?:morning|afternoon|evening)\b/i,
  // "last N hours/minutes/days/weeks/months"
  /\blast\s+\d+\s+(?:hours?|minutes?|mins?|days?|weeks?|months?)\b/i,
  // "yesterday" (bare)
  /\byesterday\b/i,
  // "today" (bare)
  /\btoday\b/i,
];

/**
 * @typedef {Object} ExtractedHint
 * @property {string} hint           — the extracted time phrase (e.g. "yesterday afternoon")
 * @property {string} cleanedQuestion — the question with the time phrase removed and trimmed
 */

/**
 * Extract a time hint from a natural-language question.
 *
 * @param {string} question — e.g. "what was I debugging yesterday afternoon?"
 * @returns {ExtractedHint | null} — null if no recognized time phrase found
 */
export function extractTimeHint(question) {
  if (!question || typeof question !== 'string') return null;

  for (const pattern of TIME_PATTERNS) {
    const match = question.match(pattern);
    if (match) {
      const hint = match[0].toLowerCase().trim();
      // Remove the matched phrase and clean up extra whitespace
      const cleaned = question
        .replace(match[0], '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return { hint, cleanedQuestion: cleaned };
    }
  }

  return null;
}
