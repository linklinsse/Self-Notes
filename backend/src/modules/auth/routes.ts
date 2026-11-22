import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isUniqueViolation } from '../../db.js';
import { AppError, unauthenticated, usernameTaken } from '../../errors.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/passwords.js';
import {
  UsernameSchema,
  PasswordSchema,
  UserSchema,
  toUser,
} from '../users/schemas.js';
import { type IssuedRefresh, revokeByRefreshToken, rotateRefreshToken, startSession } from './service.js';

export const REFRESH_COOKIE = 'sn_refresh';
const COOKIE_PATH = '/api/v1/auth';

const AuthResponseSchema = z.object({
  user: UserSchema,
  accessToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshToken: z.string().optional().describe('Only with X-Token-Transport: body'),
});

const TokenResponseSchema = AuthResponseSchema.omit({ user: true });

const RefreshBodySchema = z
  .object({ refreshToken: z.string().min(1).optional() })
  .nullish()
  .describe('With X-Token-Transport: body. Web clients use the cookie instead.');

/** Android and cross-origin web clients exchange the refresh token in the JSON body. */
function usesBodyTransport(request: FastifyRequest): boolean {
  return request.headers['x-token-transport'] === 'body';
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { config, prisma } = app;
  const strict = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  function setRefreshCookie(reply: FastifyReply, token: string) {
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      path: COOKIE_PATH,
      maxAge: config.refreshTokenTtlSec,
    });
  }

  async function issueTokens(request: FastifyRequest, reply: FastifyReply, refresh: IssuedRefresh) {
    const access = await app.accessTokens.sign({
      userId: refresh.session.userId,
      sessionFamilyId: refresh.session.familyId,
    });
    const body = usesBodyTransport(request);
    if (!body) setRefreshCookie(reply, refresh.token);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      ...(body ? { refreshToken: refresh.token } : {}),
    };
  }

  function refreshTokenOf(request: FastifyRequest, body?: { refreshToken?: string } | null): string | undefined {
    return body?.refreshToken ?? request.cookies[REFRESH_COOKIE];
  }

  const meta = (request: FastifyRequest) => ({ userAgent: request.headers['user-agent'] });

  app.post(
    '/register',
    {
      config: strict,
      schema: {
        tags: ['auth'],
        summary: 'Create an account (AUTH-1)',
        security: [],
        body: z.object({ username: UsernameSchema, password: PasswordSchema }),
        response: { 201: AuthResponseSchema },
      },
    },
    async (request, reply) => {
      if (!config.allowRegistration) {
        throw new AppError(403, 'REGISTRATION_DISABLED', 'Sign-up is disabled on this server.');
      }
      const { username, password } = request.body;
      if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) throw usernameTaken();
      let user;
      try {
        user = await prisma.user.create({ data: { username, passwordHash: await hashPassword(password) } });
      } catch (err) {
        if (isUniqueViolation(err)) throw usernameTaken();
        throw err;
      }
      const refresh = await startSession(prisma, config.refreshTokenTtlSec, user.id, meta(request));
      const tokens = await issueTokens(request, reply, refresh);
      return reply.status(201).send({ user: toUser(user), ...tokens });
    },
  );

  app.post(
    '/login',
    {
      config: strict,
      schema: {
        tags: ['auth'],
        summary: 'Sign in (AUTH-3)',
        security: [],
        body: z.object({ username: UsernameSchema, password: z.string().min(1).max(200) }),
        response: { 200: AuthResponseSchema },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const user = await prisma.user.findUnique({ where: { username } });
      const valid = user ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password);
      if (!user || !valid) {
        throw unauthenticated('INVALID_CREDENTIALS', 'Wrong username or password.');
      }
      const refresh = await startSession(prisma, config.refreshTokenTtlSec, user.id, meta(request));
      return { user: toUser(user), ...(await issueTokens(request, reply, refresh)) };
    },
  );

  app.post(
    '/refresh',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Exchange the refresh token for new tokens (rotation, 30-day sliding expiry)',
        security: [],
        body: RefreshBodySchema,
        response: { 200: TokenResponseSchema },
      },
    },
    async (request, reply) => {
      const token = refreshTokenOf(request, request.body);
      if (!token) throw unauthenticated('INVALID_REFRESH_TOKEN', 'No refresh token.');
      const refresh = await rotateRefreshToken(prisma, config.refreshTokenTtlSec, token, meta(request));
      return issueTokens(request, reply, refresh);
    },
  );

  app.post(
    '/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Sign out: revokes the session',
        security: [],
        body: RefreshBodySchema,
      },
    },
    async (request, reply) => {
      const token = refreshTokenOf(request, request.body);
      if (token) await revokeByRefreshToken(prisma, token);
      reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      return reply.status(204).send();
    },
  );
};
