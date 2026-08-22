// ---------------------------------------------------------------------------
// Prompt template construction for LLM queries
// ---------------------------------------------------------------------------
//
// Formats session events and user questions into the OpenAI Chat Completions
// message format. Model-agnostic in content, OpenAI-specific in structure
// (system/user roles).

/**
 * System prompt — instructs the LLM how to behave.
 */
const SYSTEM_PROMPT = `You are a coding session memory assistant. You answer questions about a developer's recent work based on their logged session events.

Session events include:
- [terminal] commands the developer ran in their shell
- [file] files that were saved/modified in their editor
- [browser] web pages visited (if available)

Rules:
- Answer ONLY from the provided session events. Do not guess, infer, or hallucinate information not present in the events.
- If the events don't contain enough information to answer the question, say so explicitly — do not fabricate an answer.
- Be specific: name exact commands, files, error messages, and timestamps when relevant.
- Be concise. Don't repeat the raw events back to the user unless they ask to see them.
- When referencing times, use natural language relative to the user ("around 9am", "about 2 hours ago") rather than raw UTC timestamps.`;

/**
 * Format a single event as a log line for the prompt.
 * @param {object} event
 * @returns {string}
 */
function formatEvent(event) {
  // Shorten timestamp: "2026-08-22T09:30:00.000Z" → "2026-08-22 09:30Z"
  const ts = event.timestamp
    .replace('T', ' ')
    .replace(/:\d{2}\.\d+Z$/, 'Z')
    .replace(/:\d{2}Z$/, 'Z');
  const tag = event.source.padEnd(8);
  return `[${ts}] [${tag}] ${event.content}`;
}

/**
 * Estimate token count for a string (rough heuristic: ~4 chars per token).
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Build the messages array for the OpenAI Chat Completions API.
 *
 * @param {object} options
 * @param {string} options.question          — the user's question
 * @param {Array}  options.events            — array of event objects
 * @param {boolean} [options.hasMore=false]  — whether more events exist beyond what's shown
 * @param {{ startTime: string, endTime: string } | null} [options.timeRange] — resolved time window
 * @param {number} [options.tokenBudget=12000] — max tokens for the events context
 * @returns {{ messages: Array<{role: string, content: string}>, eventCount: number, truncatedFromBudget: boolean }}
 */
export function buildPrompt({ question, events, hasMore = false, timeRange, tokenBudget = 12000 }) {
  // Format all events as log lines
  let eventLines = events.map(formatEvent);
  let truncatedFromBudget = false;

  // Token budget enforcement: if events exceed budget, truncate oldest
  const fullContext = eventLines.join('\n');
  if (estimateTokens(fullContext) > tokenBudget && eventLines.length > 1) {
    truncatedFromBudget = true;
    // Remove from the beginning (oldest) until we're under budget
    while (eventLines.length > 1 && estimateTokens(eventLines.join('\n')) > tokenBudget) {
      eventLines.shift();
    }
  }

  // Build the user message
  let userContent = '';

  // Time range header
  if (timeRange) {
    userContent += `Here are the session events from ${timeRange.startTime} to ${timeRange.endTime}:\n\n`;
  } else {
    userContent += 'Here are the recent session events:\n\n';
  }

  // Events
  if (eventLines.length === 0) {
    userContent += '(No events found for this time period.)\n';
  } else {
    userContent += eventLines.join('\n') + '\n';
  }

  // Truncation notices
  if (truncatedFromBudget) {
    userContent += `\n(Note: Events were truncated to fit context limits. Only the ${eventLines.length} most recent events are shown.)\n`;
  }
  if (hasMore) {
    userContent += '\n(Note: More events exist beyond what is shown here.)\n';
  }

  // Question
  userContent += `\nQuestion: ${question}`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  return {
    messages,
    eventCount: eventLines.length,
    truncatedFromBudget,
  };
}
