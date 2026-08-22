// ---------------------------------------------------------------------------
// OpenAI Chat Completions client — streaming via built-in fetch
// ---------------------------------------------------------------------------
//
// Zero dependencies. Uses Node 22's built-in fetch and TextDecoderStream
// to parse Server-Sent Events from the OpenAI streaming API.
//
// Provider decision: OpenAI gpt-4o-mini (documented in SPEC.md Section 4).

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * @typedef {Object} LLMResult
 * @property {string} answer             — the complete response text
 * @property {{ prompt: number, completion: number } | null} usage — token usage (if available)
 */

/**
 * Call the OpenAI Chat Completions API with streaming.
 *
 * @param {object} options
 * @param {Array<{role: string, content: string}>} options.messages — chat messages
 * @param {string} [options.model]    — model name (default: gpt-4o-mini)
 * @param {string} options.apiKey     — OpenAI API key
 * @param {function} [options.onToken] — callback for each streamed token chunk
 * @returns {Promise<LLMResult>}
 */
export async function callLLM({ messages, model, apiKey, onToken }) {
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY not set. Run: $env:OPENAI_API_KEY = "sk-..."'
    );
  }

  const selectedModel = model || process.env.SESSIONMEM_MODEL || DEFAULT_MODEL;

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: selectedModel,
      messages,
      stream: true,
      // stream_options to get usage in the final chunk
      stream_options: { include_usage: true },
    }),
  });

  // Handle HTTP-level errors
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const status = response.status;

    if (status === 401) {
      throw new Error(
        'Invalid API key. Check that OPENAI_API_KEY is correct and active.'
      );
    }
    if (status === 429) {
      throw new Error(
        'Rate limited by OpenAI. Wait a moment and try again.'
      );
    }
    if (status === 404) {
      throw new Error(
        `Model "${selectedModel}" not found. Check the model name or try "gpt-4o-mini".`
      );
    }
    throw new Error(
      `OpenAI API error (HTTP ${status}): ${errorBody.substring(0, 200)}`
    );
  }

  // Parse the SSE stream
  const answer = [];
  let usage = null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split('\n');
    // Keep the last potentially incomplete line in the buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith(':')) continue; // empty or comment
      if (trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmed.slice(6));

          // Extract usage from the final chunk (when stream_options.include_usage is true)
          if (data.usage) {
            usage = {
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            };
          }

          // Extract delta content
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            answer.push(delta);
            if (onToken) onToken(delta);
          }
        } catch {
          // Malformed JSON chunk — skip silently
        }
      }
    }
  }

  return {
    answer: answer.join(''),
    usage,
  };
}
