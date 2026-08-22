// ---------------------------------------------------------------------------
// System Doctor & Diagnostic Engine for sessionmem
// ---------------------------------------------------------------------------
//
// Performs health checks on the local environment to ensure sessionmem is
// ready for active logging, querying, and global CLI invocation.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { getEvents } from '../db/index.js';

/**
 * Check Node.js version requirement (>= 22.13.0 for built-in node:sqlite).
 * @returns {{ ok: boolean, version: string, message: string }}
 */
export function checkNodeVersion() {
  const version = process.version; // e.g. "v22.18.0"
  const clean = version.replace(/^v/, '');
  const [major, minor, patch] = clean.split('.').map(Number);

  const ok = major > 22 || (major === 22 && minor >= 13);
  return {
    ok,
    version,
    message: ok
      ? `Node.js ${version} (meets >= 22.13.0 requirement)`
      : `Node.js ${version} is below 22.13.0. Please upgrade Node.js for built-in SQLite support.`,
  };
}

/**
 * Check database file existence, connectivity, and schema.
 * @param {string} [dbPath]
 * @returns {{ ok: boolean, path: string, eventCount: number, message: string }}
 */
export function checkDatabase(dbPath) {
  const targetPath = dbPath || process.env.SESSIONMEM_DB_PATH || join(homedir(), '.sessionmem', 'session.db');

  if (!existsSync(targetPath)) {
    return {
      ok: false,
      path: targetPath,
      eventCount: 0,
      message: `Database not found at ${targetPath}. Run \`sessionmem init-db\` to create it.`,
    };
  }

  try {
    const db = new DatabaseSync(targetPath);
    const countRow = db.prepare('SELECT COUNT(*) as count FROM events').get();
    db.close();

    const eventCount = Number(countRow?.count || 0);
    return {
      ok: true,
      path: targetPath,
      eventCount,
      message: `Database connected (${eventCount} total logged events)`,
    };
  } catch (err) {
    return {
      ok: false,
      path: targetPath,
      eventCount: 0,
      message: `Database error: ${err.message}`,
    };
  }
}

/**
 * Check transient queue file status.
 * @param {string} [queueDir]
 * @returns {{ ok: boolean, path: string, pendingLines: number, message: string }}
 */
export function checkQueue(queueDir) {
  const dir = queueDir || process.env.SESSIONMEM_QUEUE_DIR || join(homedir(), '.sessionmem');
  const queuePath = join(dir, 'queue.jsonl');

  if (!existsSync(queuePath)) {
    return {
      ok: true,
      path: queuePath,
      pendingLines: 0,
      message: `Queue ready (empty, waiting for events)`,
    };
  }

  try {
    const content = readFileSync(queuePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    return {
      ok: true,
      path: queuePath,
      pendingLines: lines.length,
      message: lines.length > 0
        ? `Queue has ${lines.length} un-flushed event(s). Run \`sessionmem flush\` to persist them.`
        : `Queue ready (empty)`,
    };
  } catch (err) {
    return {
      ok: false,
      path: queuePath,
      pendingLines: 0,
      message: `Queue read error: ${err.message}`,
    };
  }
}

/**
 * Check OpenAI API key status.
 * @returns {{ ok: boolean, model: string, message: string }}
 */
export function checkApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.SESSIONMEM_MODEL || 'gpt-4o-mini';

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_API_KEY') || apiKey.includes('your_openai_api_key_here')) {
    return {
      ok: false,
      model,
      message: `OPENAI_API_KEY not configured. Set it in .env or via $env:OPENAI_API_KEY.`,
    };
  }

  const masked = apiKey.length > 10 ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : '***';
  return {
    ok: true,
    model,
    message: `API Key active (${masked}) · Model: ${model}`,
  };
}

/**
 * Check PowerShell profile hook installation status.
 * @returns {{ ok: boolean, profilePath: string | null, message: string }}
 */
export function checkPowerShellHook() {
  // Check Windows PowerShell & PowerShell Core profile paths
  const userProfile = process.env.USERPROFILE || homedir();
  const candidateProfiles = [
    join(userProfile, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    join(userProfile, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    join(userProfile, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1'),
  ];

  let foundInstalled = false;
  let activeProfile = null;

  for (const prof of candidateProfiles) {
    if (existsSync(prof)) {
      activeProfile = prof;
      try {
        const content = readFileSync(prof, 'utf-8');
        if (content.includes('sessionmem') || content.includes('__sessionmem_queue')) {
          foundInstalled = true;
          break;
        }
      } catch {}
    }
  }

  if (foundInstalled) {
    return {
      ok: true,
      profilePath: activeProfile,
      message: `PowerShell prompt hook is active in ${activeProfile}`,
    };
  }

  return {
    ok: false,
    profilePath: activeProfile,
    message: `PowerShell hook not found in $PROFILE. Run \`sessionmem hook show\` for setup instructions.`,
  };
}

/**
 * Run full diagnostic checks and print a formatted summary report.
 * @returns {boolean} true if all essential checks passed
 */
export function runDoctor() {
  const node = checkNodeVersion();
  const db = checkDatabase();
  const queue = checkQueue();
  const api = checkApiKey();
  const hook = checkPowerShellHook();

  console.log('\n🩺 sessionmem Doctor — System Diagnostic');
  console.log('═'.repeat(65));

  const printItem = (label, result) => {
    const icon = result.ok ? '✅ PASS' : '⚠️ WARN';
    console.log(`[${icon}] ${label.padEnd(16)}: ${result.message}`);
  };

  printItem('Node.js Runtime', node);
  printItem('SQLite Database', db);
  printItem('Event Queue', queue);
  printItem('OpenAI API Key', api);
  printItem('Shell Hook', hook);

  console.log('═'.repeat(65));

  const allOk = node.ok && db.ok && api.ok;
  if (allOk) {
    console.log('✨ All essential components are healthy and ready to use.\n');
  } else {
    console.log('💡 Follow the warnings above to finish your setup.\n');
  }

  return allOk;
}
