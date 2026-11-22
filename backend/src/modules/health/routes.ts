import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { APP_NAME, APP_VERSION } from '../../version.js';

const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  name: z.string(),
  version: z.string(),
  registration: z.boolean().describe('AUTH-1: false when sign-up is closed (ALLOW_REGISTRATION=false)'),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  const identity = { name: APP_NAME, version: APP_VERSION, registration: app.config.allowRegistration };
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness, server identity and version (used by the login page server check)',
        security: [],
        response: { 200: HealthSchema, 503: HealthSchema },
      },
    },
    async (_request, reply) => {
      try {
        await app.prisma.$queryRaw`SELECT 1`;
        return { status: 'ok' as const, ...identity };
      } catch {
        return reply.status(503).send({ status: 'degraded', ...identity });
      }
    },
  );
};
