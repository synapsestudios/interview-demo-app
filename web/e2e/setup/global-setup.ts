import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Runs once before all tests: reseeds the API's Postgres DB so we start from
 * a deterministic baseline. The seed drops and recreates all data.
 */
export default async function globalSetup() {
  // Playwright runs the config from the web/ directory; the API is its sibling.
  const apiDir = resolve(process.cwd(), '../api');
  execSync('npm run seed', { cwd: apiDir, stdio: 'inherit' });
}
