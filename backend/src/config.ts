import { z } from 'zod';
import { parseDuration } from './lib/tokens.js';

const duration = z.string().regex(/^\d+[smhd]$/, 'expected a duration such as 15m or 30d');
const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters (openssl rand -base64 48)'),
  ACCESS_TOKEN_TTL: duration.default('15m'),
  REFRESH_TOKEN_TTL: duration.default('30d'),
  ALLOW_REGISTRATION: bool.default(true),
  PUBLIC_URL: z.url().default('http://localhost:8080'),
  CORS_ORIGINS: z.string().default('https://localhost,http://localhost'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT: bool.default(true),
  API_DOCS: bool.optional(),
  // Number of reverse proxies in front of the API (nginx "web" = 1). Used to get the client IP.
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  // Brute-force protection of share links (NFR-3): an IP that asks for this many unknown links
  // within SHARE_LINK_BLOCK is blocked for SHARE_LINK_BLOCK. 0 disables it. Always on, even when
  // RATE_LIMIT is false.
  SHARE_LINK_MAX_FAILURES: z.coerce.number().int().min(0).default(10),
  SHARE_LINK_BLOCK: duration.default('15m'),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  allowRegistration: boolean;
  /** Public base URL without trailing slash, used to build share links. */
  publicUrl: string;
  corsOrigins: string[];
  logLevel: string;
  rateLimit: boolean;
  shareLinkMaxFailures: number;
  shareLinkBlockSec: number;
  apiDocs: boolean;
  /** Refresh cookie gets the Secure flag when the app is served over HTTPS. */
  cookieSecure: boolean;
  trustProxy: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const publicUrl = e.PUBLIC_URL.replace(/\/+$/, '');
  const corsOrigins = [
    new URL(publicUrl).origin,
    ...e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  ];
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    accessTokenTtlSec: parseDuration(e.ACCESS_TOKEN_TTL),
    refreshTokenTtlSec: parseDuration(e.REFRESH_TOKEN_TTL),
    allowRegistration: e.ALLOW_REGISTRATION,
    publicUrl,
    corsOrigins: [...new Set(corsOrigins)],
    logLevel: e.LOG_LEVEL,
    rateLimit: e.RATE_LIMIT,
    shareLinkMaxFailures: e.SHARE_LINK_MAX_FAILURES,
    shareLinkBlockSec: parseDuration(e.SHARE_LINK_BLOCK),
    apiDocs: e.API_DOCS ?? e.NODE_ENV === 'development',
    cookieSecure: publicUrl.startsWith('https://'),
    trustProxy: e.TRUST_PROXY,
  };
}
