// ---------------------------------------------------------------------------
// Zero-dependency .env loader for sessionmem
// ---------------------------------------------------------------------------
//
// Looks for `.env` files in:
// 1. Current working directory (.env)
// 2. Project root / parent directories (.env)
// 3. Global user configuration directory (~/.sessionmem/.env)
//
// Populates process.env without overriding existing environment variables.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Parse lines of a .env file into key-value pairs.
 * Handles:
 * - Comments (# ...)
 * - Quotes (single, double)
 * - `export KEY=val` syntax
 * - Whitespace trimming
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseEnvContent(content) {
  const result = {};
  const lines = content.split('\n');

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('export ')) {
      line = line.slice(7).trim();
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (key) {
      result[key] = val;
    }
  }

  return result;
}

/**
 * Load .env from a specific file path if it exists.
 *
 * @param {string} filePath
 * @returns {boolean} true if file was found and loaded
 */
export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return false;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseEnvContent(content);
    for (const [key, val] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Automatically load .env from standard locations:
 * 1. Current working directory (.env)
 * 2. Walk up to locate nearest .env (e.g. project root)
 * 3. ~/.sessionmem/.env
 */
export function loadEnv() {
  // 1. Try cwd and walk up
  let current = process.cwd();
  while (true) {
    const candidate = join(current, '.env');
    if (loadEnvFile(candidate)) break;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 2. Try global ~/.sessionmem/.env
  const globalEnv = join(homedir(), '.sessionmem', '.env');
  loadEnvFile(globalEnv);

  // 3. Try package installation directory .env (fallback when linked globally)
  try {
    const pkgRootEnv = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
    loadEnvFile(pkgRootEnv);
  } catch {}
}
