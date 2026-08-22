// ---------------------------------------------------------------------------
// Evaluation Dataset & Ground-Truth Test Cases for sessionmem
// ---------------------------------------------------------------------------
//
// Represents a realistic developer coding session spanning multiple days,
// containing terminal commands, file edits, git operations, and secret redactions.

/**
 * Anchor reference time for deterministic evaluation.
 * Represents "now" as Saturday, Aug 22, 2026 at 15:00:00 UTC (PKT 20:00:00).
 */
export const EVAL_NOW = new Date('2026-08-22T15:00:00.000Z');

/**
 * Seed dataset of events recorded across 3 distinct time windows:
 * - 2 days ago (Thursday Aug 20): initial project setup
 * - Yesterday (Friday Aug 21): auth & express server implementation
 * - Today (Saturday Aug 22): testing, documentation, and curl endpoint checks
 */
export const SEED_EVENTS = [
  // ── Day 1: Thursday Aug 20, 2026 (Initial scaffolding) ─────────────────
  { timestamp: '2026-08-20T09:00:00.000Z', source: 'terminal', content: 'npm init -y', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-20T09:02:00.000Z', source: 'file', content: 'package.json', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-20T09:05:00.000Z', source: 'terminal', content: 'git init', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-20T09:10:00.000Z', source: 'file', content: 'README.md', projectPath: '/workspace/session-mem' },

  // ── Day 2 Morning: Friday Aug 21, 2026 (Database & Packages) ───────────
  // (08:00 UTC = 13:00 PKT morning/early afternoon session)
  { timestamp: '2026-08-21T03:30:00.000Z', source: 'terminal', content: 'npm install express', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-21T03:35:00.000Z', source: 'file', content: 'src/db/schema.sql', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-21T03:40:00.000Z', source: 'file', content: 'src/db/database.js', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-21T04:00:00.000Z', source: 'terminal', content: 'node scripts/init-db.js', projectPath: '/workspace/session-mem' },

  // ── Day 2 Afternoon: Friday Aug 21, 2026 (Auth & Secrets) ──────────────
  // (09:00 - 12:00 UTC = 14:00 - 17:00 PKT afternoon session)
  { timestamp: '2026-08-21T09:15:00.000Z', source: 'terminal', content: 'export OPENAI_API_KEY=[REDACTED]', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-21T09:20:00.000Z', source: 'file', content: 'src/auth/jwt.js', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-21T09:45:00.000Z', source: 'terminal', content: 'npm test', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-21T10:30:00.000Z', source: 'file', content: 'src/server.js', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-21T11:00:00.000Z', source: 'terminal', content: 'git commit -m "add express server and auth"', projectPath: '/workspace/session-mem' },

  // ── Day 3 Morning: Saturday Aug 22, 2026 (Today) ───────────────────────
  { timestamp: '2026-08-22T04:00:00.000Z', source: 'file', content: 'src/routes/api.js', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-22T04:15:00.000Z', source: 'terminal', content: 'npm test', projectPath: '/workspace/session-mem' },

  // ── Day 3 Recent: Saturday Aug 22, 2026 (~2 hours before EVAL_NOW) ─────
  { timestamp: '2026-08-22T13:10:00.000Z', source: 'terminal', content: 'node src/server.js', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-22T13:20:00.000Z', source: 'terminal', content: 'curl localhost:3000/api/health', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-22T13:45:00.000Z', source: 'file', content: 'docs/API.md', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-22T14:15:00.000Z', source: 'terminal', content: 'npm test', projectPath: '/workspace/session-mem' },
  { timestamp: '2026-08-22T14:30:00.000Z', source: 'terminal', content: 'git commit -m "complete API documentation and health endpoint"', projectPath: '/workspace/session-mem' },
];

/**
 * 10 Evaluation Scenarios testing factual accuracy, time-window filtering,
 * negative assertions, and security guarantees.
 */
export const EVAL_CASES = [
  {
    id: 'E01',
    category: 'Package Installation',
    question: 'What package did I install during my setup?',
    timeHint: null,
    mustInclude: ['express'],
    mustNotInclude: ['react', 'vue', 'django', 'flask'],
    description: 'Verifies exact npm package recall.',
  },
  {
    id: 'E02',
    category: 'File Modification Recall',
    question: 'Which database files were created or edited in the db directory?',
    timeHint: null,
    mustInclude: ['schema.sql', 'database.js'],
    mustNotInclude: ['migration.sql', 'models.py'],
    description: 'Verifies specific path and filename recall.',
  },
  {
    id: 'E03',
    category: 'Time Discrimination (Yesterday Afternoon)',
    question: 'What files or tasks was I working on yesterday afternoon?',
    timeHint: 'yesterday afternoon',
    mustInclude: ['server.js'],
    mustNotInclude: ['init-db.js', 'package.json'],
    description: 'Ensures retrieval filters out morning events when asked about afternoon.',
  },
  {
    id: 'E04',
    category: 'Absence / Anti-Hallucination Check',
    question: 'Did I edit any Python (.py) or CSS (.css) files in this session?',
    timeHint: null,
    mustInclude: ['no'],
    mustNotInclude: ['style.css', 'app.py', 'main.py'],
    customValidator: (answer) => {
      const lower = answer.toLowerCase();
      return (lower.includes('no') || lower.includes('did not') || lower.includes('none')) &&
             !lower.includes('yes');
    },
    description: 'Ensures agent states absence of non-existent files rather than hallucinating.',
  },
  {
    id: 'E05',
    category: 'Exact Command Recall',
    question: 'What was the curl command I ran to test the endpoint?',
    timeHint: null,
    mustInclude: ['curl', 'localhost:3000'],
    mustNotInclude: ['8080', '5000'],
    description: 'Verifies exact command arguments and ports.',
  },
  {
    id: 'E06',
    category: 'Git Commit Message Recall',
    question: 'What was the commit message when I finished the API docs?',
    timeHint: null,
    mustInclude: ['complete API documentation', 'health endpoint'],
    mustNotInclude: [],
    description: 'Verifies exact string extraction from git commit log.',
  },
  {
    id: 'E07',
    category: 'Secret Redaction Integrity',
    question: 'What API key environment variable did I export in the terminal, and is the secret visible?',
    timeHint: null,
    mustInclude: ['OPENAI_API_KEY'],
    mustNotInclude: ['sk-proj-', 'sk-live'],
    customValidator: (answer) => {
      const lower = answer.toLowerCase();
      return lower.includes('redact') || lower.includes('[redacted]') || lower.includes('not visible');
    },
    description: 'Verifies that secrets are identified as redacted without hallucinating raw tokens.',
  },
  {
    id: 'E08',
    category: 'Relative Duration Filtering',
    question: 'What documentation did I write in the last 2 hours?',
    timeHint: 'last 2 hours',
    mustInclude: ['API.md'],
    mustNotInclude: ['schema.sql'],
    description: 'Tests relative duration window retrieval.',
  },
  {
    id: 'E09',
    category: 'Repeated Workflow Identification',
    question: 'What test command did I run multiple times throughout the project?',
    timeHint: null,
    mustInclude: ['npm test'],
    mustNotInclude: ['pytest', 'jest --watch'],
    description: 'Tests recognition of recurring commands across multiple days.',
  },
  {
    id: 'E10',
    category: 'Multi-Source Synthesis',
    question: 'Give a brief summary of how the express server was built and tested.',
    timeHint: null,
    mustInclude: ['express', 'server.js', 'curl'],
    mustNotInclude: [],
    description: 'Synthesizes both terminal execution and file modification into a cohesive story.',
  },
];
