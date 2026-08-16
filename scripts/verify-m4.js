/**
 * M4 Verification — Secret Filtering
 *
 * Tests:
 *  1.  export API_KEY=sk-abc123 → redacted
 *  2.  Bearer token → redacted
 *  3.  $env:AWS_SECRET → redacted
 *  4.  Connection string password → redacted
 *  5.  Normal command → unchanged (no false positive)
 *  6.  Mentions "key" without value → unchanged
 *  7.  AWS key prefix AKIA → redacted
 *  8.  File source not filtered
 *  9.  End-to-end: queue → flush → DB → redacted
 *  10. Multiple secrets in one command
 *  11. wasRedacted flag from insertEvent
 *  12. Flush result includes redacted count
 *  13. Git SHA not redacted (Tier 2 not active)
 */

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Test infra
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const TEST_ROOT = join(tmpdir(), `sessionmem-m4-test-${Date.now()}`);
const QUEUE_DIR = join(TEST_ROOT, 'queue');
const DB_DIR = join(TEST_ROOT, 'db');
const DB_PATH = join(DB_DIR, 'test-m4.db');

mkdirSync(QUEUE_DIR, { recursive: true });
mkdirSync(DB_DIR, { recursive: true });

process.env.SESSIONMEM_DB_PATH = DB_PATH;
process.env.SESSIONMEM_QUEUE_DIR = QUEUE_DIR;

const { redactSecrets, containsSecrets } = await import('../src/filters/secrets.js');
const { getDb, insertEvent, getEvents, closeDb } = await import('../src/db/index.js');
const { flushQueue } = await import('../src/terminal/flush.js');

getDb(DB_PATH);

console.log('\n🔧 M4 Verification — Secret Filtering\n');

// ---------------------------------------------------------------------------
// Test 1: export API_KEY=sk-abc123
// ---------------------------------------------------------------------------

console.log('Test 1: export API_KEY=value → redacted');
{
  const result = redactSecrets('export API_KEY=sk-proj-abc123def456');
  assert(result.wasRedacted === true, 'wasRedacted is true');
  assert(!result.content.includes('sk-proj-abc123def456'), 'Secret value not in output');
  assert(result.content.includes('API_KEY='), 'Key name preserved');
  assert(result.content.includes('[REDACTED]'), 'Contains [REDACTED]');
}

// ---------------------------------------------------------------------------
// Test 2: Bearer token
// ---------------------------------------------------------------------------

console.log('\nTest 2: Bearer token → redacted');
{
  const result = redactSecrets('curl -H "Authorization: Bearer ghp_abc123def456"');
  assert(result.wasRedacted === true, 'wasRedacted is true');
  assert(!result.content.includes('ghp_abc123def456'), 'Token not in output');
  assert(result.content.includes('Bearer [REDACTED]'), 'Bearer [REDACTED] present');
}

// ---------------------------------------------------------------------------
// Test 3: $env:AWS_SECRET
// ---------------------------------------------------------------------------

console.log('\nTest 3: $env:AWS_SECRET → redacted');
{
  const result = redactSecrets('$env:AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/fake"');
  assert(result.wasRedacted === true, 'wasRedacted is true');
  assert(!result.content.includes('wJalrXUtnFEMI'), 'Secret value not in output');
  assert(result.content.includes('[REDACTED]'), 'Contains [REDACTED]');
}

// ---------------------------------------------------------------------------
// Test 4: Connection string password
// ---------------------------------------------------------------------------

console.log('\nTest 4: Connection string → password redacted');
{
  const result = redactSecrets('psql postgres://admin:s3cretP@ss@localhost:5432/mydb');
  assert(result.wasRedacted === true, 'wasRedacted is true');
  assert(!result.content.includes('s3cretP@ss'), 'Password not in output');
  assert(result.content.includes('://admin:[REDACTED]@'), 'Redacted in connection string');
}

// ---------------------------------------------------------------------------
// Test 5: Normal command → unchanged
// ---------------------------------------------------------------------------

console.log('\nTest 5: Normal command → no false positive');
{
  const commands = [
    'echo hello world',
    'npm install express',
    'git commit -m "update readme"',
    'ls -la',
    'cd src/db',
    'node --version',
  ];
  for (const cmd of commands) {
    const result = redactSecrets(cmd);
    assert(result.wasRedacted === false && result.content === cmd, `"${cmd}" unchanged`);
  }
}

// ---------------------------------------------------------------------------
// Test 6: Mentions "key" without value → unchanged
// ---------------------------------------------------------------------------

console.log('\nTest 6: Mentions "key" without secret value → unchanged');
{
  const commands = [
    'git commit -m "fix API key rotation"',
    'grep -r "secret" src/',
    'echo "update the token handler"',
  ];
  for (const cmd of commands) {
    const result = redactSecrets(cmd);
    assert(result.wasRedacted === false && result.content === cmd, `"${cmd}" unchanged`);
  }
}

// ---------------------------------------------------------------------------
// Test 7: AWS key prefix AKIA
// ---------------------------------------------------------------------------

console.log('\nTest 7: AWS key prefix AKIA → redacted');
{
  const result = redactSecrets('aws configure set aws_access_key_id AKIAIOSFODNN7EXAMPLE');
  assert(result.wasRedacted === true, 'wasRedacted is true');
  assert(!result.content.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS key not in output');
}

// ---------------------------------------------------------------------------
// Test 8: File source not filtered
// ---------------------------------------------------------------------------

console.log('\nTest 8: File events bypass filter (source=file)');
{
  const result = insertEvent({
    timestamp: new Date().toISOString(),
    source: 'file',
    content: 'src/config/api-keys.js',
    projectPath: TEST_ROOT,
  });
  assert(result.wasRedacted === false, 'File event not redacted');

  const events = getEvents({ source: 'file' });
  const last = events[events.length - 1];
  assert(last.content === 'src/config/api-keys.js', 'File path unchanged in DB');
}

// ---------------------------------------------------------------------------
// Test 9: End-to-end queue → flush → DB
// ---------------------------------------------------------------------------

console.log('\nTest 9: End-to-end: secret commands → queue → flush → DB → redacted');
{
  const queueFile = join(QUEUE_DIR, 'queue.jsonl');
  const entries = [
    { timestamp: '2026-08-16T10:00:00Z', source: 'terminal', content: 'export SECRET_KEY=mysecretvalue123', project_path: TEST_ROOT },
    { timestamp: '2026-08-16T10:00:01Z', source: 'terminal', content: 'echo safe command', project_path: TEST_ROOT },
    { timestamp: '2026-08-16T10:00:02Z', source: 'terminal', content: 'curl -H "Authorization: Bearer sk-testkey123456789012345"', project_path: TEST_ROOT },
  ];
  writeFileSync(queueFile, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

  const result = flushQueue(QUEUE_DIR);
  assert(result.flushed === 3, `Flushed ${result.flushed} events`);
  assert(result.redacted === 2, `Redacted ${result.redacted} events (expected 2)`);

  const terminal = getEvents({ source: 'terminal' });
  const secretCmd = terminal.find(e => e.content.includes('SECRET_KEY'));
  assert(secretCmd && !secretCmd.content.includes('mysecretvalue123'), 'Secret value not in DB');
  assert(secretCmd && secretCmd.content.includes('[REDACTED]'), 'SECRET_KEY redacted in DB');

  const safeCmd = terminal.find(e => e.content.includes('echo safe'));
  assert(safeCmd && safeCmd.content === 'echo safe command', 'Safe command unchanged in DB');
}

// ---------------------------------------------------------------------------
// Test 10: Multiple secrets in one command
// ---------------------------------------------------------------------------

console.log('\nTest 10: Multiple secrets in one command');
{
  const result = redactSecrets('API_KEY=abc123 SECRET_TOKEN=def456 ./run.sh');
  assert(result.wasRedacted === true, 'wasRedacted is true');
  assert(!result.content.includes('abc123'), 'First secret redacted');
  assert(!result.content.includes('def456'), 'Second secret redacted');
  assert(result.content.includes('API_KEY=[REDACTED]'), 'First key name preserved');
  assert(result.content.includes('SECRET_TOKEN=[REDACTED]'), 'Second key name preserved');
}

// ---------------------------------------------------------------------------
// Test 11: wasRedacted flag from insertEvent
// ---------------------------------------------------------------------------

console.log('\nTest 11: wasRedacted flag from insertEvent');
{
  const r1 = insertEvent({
    timestamp: new Date().toISOString(),
    source: 'terminal',
    content: 'export DB_PASSWORD=hunter2',
    projectPath: TEST_ROOT,
  });
  assert(r1.wasRedacted === true, 'Terminal with secret → wasRedacted=true');

  const r2 = insertEvent({
    timestamp: new Date().toISOString(),
    source: 'terminal',
    content: 'git status',
    projectPath: TEST_ROOT,
  });
  assert(r2.wasRedacted === false, 'Terminal without secret → wasRedacted=false');
}

// ---------------------------------------------------------------------------
// Test 12: Flush result includes redacted count
// ---------------------------------------------------------------------------

console.log('\nTest 12: Flush result includes redacted count');
{
  const queueFile = join(QUEUE_DIR, 'queue.jsonl');
  const entries = [
    { timestamp: '2026-08-16T11:00:00Z', source: 'terminal', content: 'TOKEN=secret123', project_path: TEST_ROOT },
    { timestamp: '2026-08-16T11:00:01Z', source: 'terminal', content: 'ls -la', project_path: TEST_ROOT },
    { timestamp: '2026-08-16T11:00:02Z', source: 'file', content: 'src/app.js', project_path: TEST_ROOT },
  ];
  writeFileSync(queueFile, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

  const result = flushQueue(QUEUE_DIR);
  assert(result.redacted === 1, `Redacted count = ${result.redacted} (expected 1 — only the terminal secret)`);
  assert(result.flushed === 3, `Flushed count = ${result.flushed}`);
}

// ---------------------------------------------------------------------------
// Test 13: Git SHA not redacted (Tier 2 not active)
// ---------------------------------------------------------------------------

console.log('\nTest 13: Git SHA not redacted (no Tier 2)');
{
  const sha = 'git show abc123def456789012345678901234567890abcd';
  const result = redactSecrets(sha);
  assert(result.wasRedacted === false, 'Git SHA-like string not redacted');
  assert(result.content === sha, 'Command unchanged');
}

// ---------------------------------------------------------------------------
// Test 14: containsSecrets helper
// ---------------------------------------------------------------------------

console.log('\nTest 14: containsSecrets identifies unredacted secrets and passes redacted ones');
{
  const raw = 'export API_KEY=sk-test12345678901234567890';
  const redacted = redactSecrets(raw).content;
  assert(containsSecrets(raw) === true, 'containsSecrets returns true on raw secret command');
  assert(containsSecrets(redacted) === false, 'containsSecrets returns false on redacted command');
  assert(containsSecrets('echo safe command') === false, 'containsSecrets returns false on safe command');
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

closeDb();
rmSync(TEST_ROOT, { recursive: true, force: true });

console.log('\n' + '─'.repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('─'.repeat(40) + '\n');

if (failed > 0) process.exit(1);
