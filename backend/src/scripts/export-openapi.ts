/**
 * Writes the OpenAPI document to a file (default: openapi.json), for the frontend type generation.
 * Usage: npm run openapi   (no database connection is needed)
 */
import { writeFileSync } from 'node:fs';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';

const output = process.argv[2] ?? 'openapi.json';
const config = loadConfig({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://unused@localhost/unused',
  JWT_SECRET: process.env.JWT_SECRET ?? 'openapi-export-only-not-a-real-secret-0000',
  API_DOCS: 'true',
  RATE_LIMIT: 'false',
});
const app = await buildApp(config, { logger: false });
await app.ready();
writeFileSync(output, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
console.log(`OpenAPI document written to ${output}`);
