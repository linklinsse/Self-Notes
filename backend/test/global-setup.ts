import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { TEST_DATABASE_URL, TEST_DB_FILE } from './test-db.js';

/** Start from a fresh database file, then apply the migrations once before the test run. */
export default function setup(): void {
  if (!process.env.TEST_DATABASE_URL) {
    mkdirSync(dirname(TEST_DB_FILE), { recursive: true });
    for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
