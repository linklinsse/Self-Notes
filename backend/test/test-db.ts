/**
 * Test database. CI provides DATABASE_URL; locally use docker-compose.test.yml (port 5433).
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://selfnotes:selfnotes@localhost:5433/selfnotes_test';
