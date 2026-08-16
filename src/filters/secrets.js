// ---------------------------------------------------------------------------
// Secret redaction for terminal commands
// ---------------------------------------------------------------------------
//
// Applied inside insertEvent() for source='terminal' only.
// File paths (source='file') are NOT filtered — they're metadata, not values.
//
// Tier 1 only: named patterns with high confidence, low false-positive risk.
// Tier 2 (high-entropy generic detection) deferred — false-positive risk with
// git SHAs, npm hashes, UUIDs.

const REDACTED = '[REDACTED]';

/**
 * Ordered array of secret patterns. More specific patterns first to avoid
 * double-redaction. Each entry: { pattern: RegExp, replace: string|function }
 *
 * Patterns use capture groups to preserve the non-secret context.
 */
const SECRET_PATTERNS = [
  // ── Known key prefixes (most specific — match the prefix itself) ──────────

  // OpenAI keys: sk-proj-..., sk-...
  {
    pattern: /\bsk-[A-Za-z0-9_-]{20,}/g,
    replace: REDACTED,
  },

  // GitHub PATs: ghp_, gho_, ghs_, ghu_, github_pat_
  {
    pattern: /\b(ghp_|gho_|ghs_|ghu_|github_pat_)[A-Za-z0-9_]{10,}/g,
    replace: REDACTED,
  },

  // AWS access key IDs: AKIA...
  {
    pattern: /\bAKIA[A-Z0-9]{12,}/g,
    replace: REDACTED,
  },

  // Slack tokens: xoxb-, xoxp-, xoxa-, xoxs-
  {
    pattern: /\bxox[bpas]-[A-Za-z0-9-]{10,}/g,
    replace: REDACTED,
  },

  // ── Bearer / Basic auth ───────────────────────────────────────────────────

  // Authorization: Bearer <token>  or just  Bearer <token>
  {
    pattern: /(Bearer\s+)\S+/gi,
    replace: `$1${REDACTED}`,
  },

  // Authorization: Basic <base64>
  {
    pattern: /(Basic\s+)\S+/gi,
    replace: `$1${REDACTED}`,
  },

  // ── Connection strings with embedded passwords ────────────────────────────

  // postgres://user:password@host  or  mysql://user:password@host  etc.
  {
    pattern: /(:\/\/[^:\/\s]+:)([^@\s]+)(@)/g,
    replace: `$1${REDACTED}$3`,
  },

  // ── Assignment patterns (_KEY=, _SECRET=, _TOKEN=, _PASSWORD=) ────────────
  // Handles: export VAR=val, set VAR=val, $env:VAR = "val", VAR=val
  //
  // The value runs until whitespace, quote-close, or end of string.

  // PowerShell: $env:*_KEY = "value"  or  $env:*_SECRET = 'value'
  {
    pattern: /(\$env:[A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)\s*=\s*["']?)([^"'\s]+)/gi,
    replace: `$1${REDACTED}`,
  },

  // Shell export / set / bare assignment: *_KEY=value
  // Matches: export API_KEY=xxx, set TOKEN=xxx, API_KEY=xxx, API_KEY="xxx"
  {
    pattern: /([A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)\s*=\s*["']?)([^"'\s]+)/gi,
    replace: `$1${REDACTED}`,
  },

  // ── Passwords in flags ────────────────────────────────────────────────────

  // --password=value, --password value, -p value (only after known flags)
  {
    pattern: /(--password[=\s]+["']?)([^"'\s]+)/gi,
    replace: `$1${REDACTED}`,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Redact secrets from a terminal command string.
 *
 * @param {string} content — the raw command string
 * @returns {{ content: string, wasRedacted: boolean }}
 */
export function redactSecrets(content) {
  let result = content;
  let wasRedacted = false;

  for (const { pattern, replace } of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes (they're stateful)
    pattern.lastIndex = 0;

    if (pattern.test(result)) {
      wasRedacted = true;
      // Reset again — .test() advances lastIndex
      pattern.lastIndex = 0;
      result = result.replace(pattern, replace);
    }
  }

  return { content: result, wasRedacted };
}

/**
 * Check if a string contains any unredacted secret patterns.
 * Useful for testing — returns false when secrets have been successfully redacted.
 *
 * @param {string} content
 * @returns {boolean}
 */
export function containsSecrets(content) {
  const unredactedContent = content.replaceAll(REDACTED, '');
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(unredactedContent)) return true;
  }
  return false;
}
