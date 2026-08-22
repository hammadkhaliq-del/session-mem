/**
 * M8 Verification — CLI Packaging & Frictionless Onboarding
 *
 * Tests:
 *  1. checkNodeVersion() verifies Node.js version >= 22.13.0
 *  2. checkDatabase() detects database presence and counts events
 *  3. checkQueue() inspects queue file state
 *  4. checkApiKey() checks API key presence and masks secrets
 *  5. checkPowerShellHook() checks $PROFILE configuration
 *  6. CLI --version flag outputs version from package.json
 *  7. CLI --help flag displays all registered subcommands
 *  8. CLI doctor command runs without errors
 *  9. CLI executes cleanly when spawned from an external working directory
 */

import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const REPO_ROOT = join(__dirname, '..');
const BIN_PATH = join(REPO_ROOT, 'bin', 'sessionmem.js');

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'));

const {
  checkNodeVersion,
  checkDatabase,
  checkQueue,
  checkApiKey,
  checkPowerShellHook,
  runDoctor,
} = await import('../src/utils/doctor.js');

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

console.log('\n🔧 M8 Verification — CLI Packaging & Frictionless Onboarding\n');

// ---------------------------------------------------------------------------
// Test 1: Node Version Diagnostic
// ---------------------------------------------------------------------------
console.log('Test 1: checkNodeVersion()');
{
  const res = checkNodeVersion();
  assert(res.ok === true, `Node runtime check passed: ${res.message}`);
}

// ---------------------------------------------------------------------------
// Test 2: Database Diagnostic
// ---------------------------------------------------------------------------
console.log('\nTest 2: checkDatabase()');
{
  const res = checkDatabase();
  assert(typeof res.ok === 'boolean', 'Database check returns boolean ok');
  assert(typeof res.eventCount === 'number', `Database event count: ${res.eventCount}`);
}

// ---------------------------------------------------------------------------
// Test 3: Queue Diagnostic
// ---------------------------------------------------------------------------
console.log('\nTest 3: checkQueue()');
{
  const res = checkQueue();
  assert(res.ok === true, `Queue check status: ${res.message}`);
}

// ---------------------------------------------------------------------------
// Test 4: API Key Diagnostic
// ---------------------------------------------------------------------------
console.log('\nTest 4: checkApiKey()');
{
  const res = checkApiKey();
  assert(typeof res.ok === 'boolean', 'API key check returns boolean ok');
  assert(typeof res.model === 'string', `Model identified: ${res.model}`);
  assert(!res.message.includes('sk-proj-aw9NlIge'), 'API key is properly masked in doctor message');
}

// ---------------------------------------------------------------------------
// Test 5: PowerShell Hook Diagnostic
// ---------------------------------------------------------------------------
console.log('\nTest 5: checkPowerShellHook()');
{
  const res = checkPowerShellHook();
  assert(typeof res.ok === 'boolean', `PowerShell hook status: ${res.message}`);
}

// ---------------------------------------------------------------------------
// Test 6: CLI --version
// ---------------------------------------------------------------------------
console.log('\nTest 6: sessionmem --version');
{
  const output = execSync(`node "${BIN_PATH}" --version`, { encoding: 'utf-8' }).trim();
  assert(output === `sessionmem v${pkg.version}`, `Version matched: "${output}"`);

  const shortOutput = execSync(`node "${BIN_PATH}" -v`, { encoding: 'utf-8' }).trim();
  assert(shortOutput === `sessionmem v${pkg.version}`, `-v short flag matched: "${shortOutput}"`);
}

// ---------------------------------------------------------------------------
// Test 7: CLI --help Contains Subcommands
// ---------------------------------------------------------------------------
console.log('\nTest 7: sessionmem --help lists all commands');
{
  const output = execSync(`node "${BIN_PATH}" --help`, { encoding: 'utf-8' });
  const requiredSubcommands = ['init-db', 'doctor', 'flush', 'watch', 'hook', 'context', 'ask', '--version'];
  for (const cmd of requiredSubcommands) {
    assert(output.includes(cmd), `Help mentions "${cmd}"`);
  }
}

// ---------------------------------------------------------------------------
// Test 8: CLI doctor Subcommand Execution
// ---------------------------------------------------------------------------
console.log('\nTest 8: sessionmem doctor executes cleanly');
{
  const output = execSync(`node "${BIN_PATH}" doctor`, { encoding: 'utf-8' });
  assert(output.includes('sessionmem Doctor'), 'Outputs doctor header');
  assert(output.includes('Node.js Runtime'), 'Includes Node.js check');
  assert(output.includes('SQLite Database'), 'Includes Database check');
}

// ---------------------------------------------------------------------------
// Test 9: External Working Directory Invocation
// ---------------------------------------------------------------------------
console.log('\nTest 9: External directory execution');
{
  const externalDir = join(tmpdir(), `sessionmem-m8-ext-${Date.now()}`);
  mkdirSync(externalDir, { recursive: true });

  try {
    const output = execSync(`node "${BIN_PATH}" doctor`, {
      cwd: externalDir,
      encoding: 'utf-8',
    });
    assert(output.includes('sessionmem Doctor'), 'CLI executed successfully from outside repository cwd');
  } finally {
    rmSync(externalDir, { recursive: true, force: true });
  }
}

console.log('\n' + '─'.repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('─'.repeat(40) + '\n');

if (failed > 0) process.exit(1);
