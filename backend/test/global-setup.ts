import { execFileSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './test-db.js';

/** Apply migrations to the test database once before the test run. */
export default function setup(): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
