import { existsSync, readFileSync } from 'node:fs';
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

/**
 * Locate the built web UI (web/dist) from any module, in both dev (tsx
 * runs src/) and production (node runs dist/src/) layouts, by walking up
 * from the calling module. Returns null when the UI hasn't been built —
 * the server then simply serves the API without a frontend.
 */
export function webDistDir(moduleUrl: string): string | null {
  let dir = dirname(fileURLToPath(moduleUrl));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'web', 'dist');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return null;
}

/**
 * Version from the nearest package.json above the calling module — works
 * in both dev (src/) and production (dist/src/) layouts, same approach as
 * migrationsDir(). Keeps /api/health honest instead of hardcoding a string
 * that drifts from the real release version.
 */
export function packageVersion(moduleUrl: string): string {
  let dir = dirname(fileURLToPath(moduleUrl));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
      return pkg.version ?? '0.0.0';
    }
    dir = dirname(dir);
  }
  return '0.0.0';
}
