import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isUniqueViolation } from '../../db.js';
import { AppError, notFound, usernameTaken } from '../../errors.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';
import { authOf } from '../../plugins/auth.js';
import {
  PasswordSchema,
  PreferencesInputSchema,
  PreferencesSchema,
  UserSchema,
  UsernameSchema,
  toUser,
} from './schemas.js';

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma } = app;
  app.addHook('onRequest', app.authenticate);

  async function currentUser(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('User not found.');
    return user;
  }

  app.get(
    '/me',
    { schema: { tags: ['users'], summary: 'Current user', response: { 200: UserSchema } } },
    async (request) => toUser(await currentUser(authOf(request).userId)),
  );

  app.patch(
    '/me',
    {
      schema: {
        tags: ['users'],
        summary: 'Change the username (AUTH-5) and/or preferences (merged key by key)',
        body: z.object({ username: UsernameSchema.optional(), preferences: PreferencesInputSchema.optional() }),
        response: { 200: UserSchema },
      },
    },
    async (request) => {
      const user = await currentUser(authOf(request).userId);
      const { username, preferences } = request.body;
      const stored = PreferencesSchema.safeParse(user.preferences);
      try {
        const updated = await prisma.user.update({
          where: { id: user.id },
          data: {
            ...(username !== undefined ? { username } : {}),
            ...(preferences !== undefined
              ? { preferences: { ...(stored.success ? stored.data : {}), ...preferences } }
              : {}),
          },
        });
        return toUser(updated);
      } catch (err) {
        if (isUniqueViolation(err)) throw usernameTaken();
        throw err;
      }
    },
  );

  app.put(
    '/me/password',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['users'],
        summary: 'Change password; revokes all other sessions (AUTH-5)',
        body: z.object({ currentPassword: z.string().min(1).max(200), newPassword: PasswordSchema }),
      },
    },
    async (request, reply) => {
      const auth = authOf(request);
      const user = await currentUser(auth.userId);
      if (!(await verifyPassword(user.passwordHash, request.body.currentPassword))) {
        throw new AppError(403, 'INVALID_CREDENTIALS', 'Current password is wrong.');
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(request.body.newPassword) },
        }),
        prisma.session.updateMany({
          where: { userId: user.id, familyId: { not: auth.sessionFamilyId }, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      return reply.status(204).send();
    },
  );
};
