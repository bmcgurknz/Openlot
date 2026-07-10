import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locate the repository's /migrations directory from any module, in both
 * dev (tsx runs src/) and production (node runs dist/src/) layouts, by
 * walking up from the calling module until the folder is found.
 */
export function migrationsDir(moduleUrl: string): string {
  let dir = dirname(fileURLToPath(moduleUrl));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'migrations');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error('Could not locate the migrations directory');
}
