import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { APP_NAME, APP_VERSION } from '../../version.js';

const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  name: z.string(),
  version: z.string(),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
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
        return { status: 'ok' as const, name: APP_NAME, version: APP_VERSION };
      } catch {
        return reply.status(503).send({ status: 'degraded', name: APP_NAME, version: APP_VERSION });
      }
    },
  );
};
