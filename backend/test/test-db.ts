import { fileURLToPath } from 'node:url';

/**
 * Test database: a SQLite file that global-setup.ts recreates before each run
 * (backend/.test-db/, git-ignored). TEST_DATABASE_URL points the tests elsewhere: every test
 * empties the tables, so never point it at a database you care about.
 */
export const TEST_DB_FILE = fileURLToPath(new URL('../.test-db/test.db', import.meta.url));

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? `file:${TEST_DB_FILE}`;
