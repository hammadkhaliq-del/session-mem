import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walk up from `startDir` looking for a `.git` directory or file.
 * Returns the directory containing `.git`, or `startDir` if none found.
 *
 * Handles:
 *  - Normal repos (.git is a directory)
 *  - Git worktrees / submodules (.git is a file)
 *  - Non-git directories (falls back to startDir)
 *
 * @param {string} startDir — absolute path to start searching from
 * @returns {string} absolute path to the project root
 */
export function resolveProjectRoot(startDir) {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }

    const parent = dirname(current);

    // Reached filesystem root — no .git found anywhere
    if (parent === current) {
      return resolve(startDir);
    }

    current = parent;
  }
}

