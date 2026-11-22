import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyRequest } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { createPrisma } from './db.js';
import { AccessTokens, type AccessClaims } from './lib/tokens.js';
import { authRoutes } from './modules/auth/routes.js';
import { categoryRoutes } from './modules/categories/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { noteRoutes } from './modules/notes/routes.js';
import { publicShareRoutes } from './modules/sharing/public-routes.js';
import { sharingRoutes } from './modules/sharing/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { APP_NAME, APP_VERSION } from './version.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    prisma: PrismaClient;
    accessTokens: AccessTokens;
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AccessClaims | null;
  }
}

export interface BuildOptions {
  /** Reuse an existing client (tests). The app then does not disconnect it on close. */
  prisma?: PrismaClient;
  logger?: boolean;
}

/** Share-link tokens must never reach the logs (docs/data-model.md, share_links). */
export function redactUrl(url: string): string {
  return url.replace(/\/(shared|s)\/[^/?#]+/g, '/$1/[redacted]');
}

export async function buildApp(config: Config, options: BuildOptions = {}) {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            serializers: {
              req: (req: FastifyRequest) => ({
                method: req.method,
                url: redactUrl(req.url),
                remoteAddress: req.ip,
              }),
            },
          },
    bodyLimit: 2 * 1024 * 1024,
    // Trust the first N proxies (nginx "web" = 1) to find the client IP for rate limiting.
    trustProxy: (_address: string, hop: number) => hop < config.trustProxy,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const prisma = options.prisma ?? createPrisma(config.databaseUrl);
  app.decorate('config', config);
  app.decorate('prisma', prisma);
  app.decorate('accessTokens', new AccessTokens(config.jwtSecret, config.accessTokenTtlSec));
  app.addHook('onClose', async () => {
    if (!options.prisma) await prisma.$disconnect();
  });

  registerErrorHandler(app);
  registerAuth(app);

  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Token-Transport'],
    maxAge: 600,
  });
  if (config.rateLimit) {
    await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  }
  if (config.apiDocs) {
    await app.register(swagger, {
      openapi: {
        info: { title: `${APP_NAME} API`, version: APP_VERSION },
        components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
        security: [{ bearer: [] }],
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  }

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(userRoutes);
      await api.register(noteRoutes);
      await api.register(categoryRoutes);
      await api.register(sharingRoutes);
      await api.register(publicShareRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
