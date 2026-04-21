import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Reseeds the database. Call from `test.beforeAll()` in any spec that needs
 * a deterministic seed count (e.g. filter tests, list-count assertions).
 * Cost is ~1s per invocation.
 */
export function resetDB() {
  const apiDir = resolve(process.cwd(), '../api');
  execSync('npm run seed', { cwd: apiDir, stdio: 'pipe' });
}
