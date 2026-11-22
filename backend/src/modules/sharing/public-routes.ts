import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { AppError, notFound } from '../../errors.js';
import { FailureLimiter } from '../../lib/failure-limiter.js';
import { mayChangeLock, requireLink } from '../notes/access.js';
import { NoteTypeSchema, ShareRoleSchema, ToggleItemSchema, UpdateNoteSchema } from '../notes/schemas.js';
import { applyNoteUpdate, applyToggleItem, versionConflict } from '../notes/service.js';

const TokenParamsSchema = z.object({ token: z.string().min(20).max(64) });

const SharedNoteSchema = z.object({
  note: z.object({
    id: z.string(),
    title: z.string(),
    type: NoteTypeSchema,
    locked: z.boolean().describe('NOTE-17: content is encrypted; the visitor needs the password'),
    content: z.string(),
    version: z.number().int(),
    updatedAt: z.string(),
  }),
  role: ShareRoleSchema,
  owner: z.object({ username: z.string() }),
});

/** What someone holding a link sees: no categories, no member list (CAT-4). */
async function sharedView(db: Db, link: { id: string; noteId: string; role: string }) {
  const note = await db.note.findUnique({
    where: { id: link.noteId },
    include: { members: { where: { role: 'owner' }, select: { user: { select: { username: true } } } } },
  });
  if (!note) throw notFound('Link not found.');
  return {
    note: {
      id: note.id,
      title: note.title,
      type: note.type,
      locked: note.locked,
      content: note.content,
      version: note.version,
      updatedAt: note.updatedAt.toISOString(),
    },
    role: link.role === 'editor' ? ('editor' as const) : ('viewer' as const),
    owner: { username: note.members[0]?.user.username ?? '' },
  };
}

/** Access through a share link, without an account (SHARE-8, SHARE-10). */
export const publicShareRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma } = app;
  const tags = ['shared'];
  const config = { rateLimit: { max: 60, timeWindow: '1 minute' } };
  // NFR-3: an IP that keeps asking for unknown links is blocked for a while, valid links included.
  const guesses = new FailureLimiter(app.config.shareLinkMaxFailures, app.config.shareLinkBlockSec * 1000);

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', 'noindex');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  async function useLink(request: FastifyRequest, reply: FastifyReply, token: string, min: 'viewer' | 'editor') {
    const wait = guesses.retryAfterSec(request.ip);
    if (wait > 0) {
      reply.header('Retry-After', String(wait));
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many unknown links from this address. Try again later.', {
        retryAfterSec: wait,
      });
    }
    let link;
    try {
      link = await requireLink(prisma, token, min);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) guesses.fail(request.ip);
      throw err;
    }
    await prisma.shareLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } });
    return link;
  }

  app.get(
    '/shared/:token',
    {
      config,
      schema: {
        tags,
        summary: 'Open a note through a share link (no account needed)',
        security: [],
        params: TokenParamsSchema,
        response: { 200: SharedNoteSchema },
      },
    },
    async (request, reply) => sharedView(prisma, await useLink(request, reply, request.params.token, 'viewer')),
  );

  app.patch(
    '/shared/:token',
    {
      config,
      schema: {
        tags,
        summary: 'Edit a note through an editor link. 409 NOTE_VERSION_CONFLICT if outdated.',
        security: [],
        params: TokenParamsSchema,
        body: UpdateNoteSchema,
        response: { 200: SharedNoteSchema },
      },
    },
    async (request, reply) => {
      const link = await useLink(request, reply, request.params.token, 'editor');
      if (!(await applyNoteUpdate(prisma, link.noteId, null, request.body, { mayChangeLock: mayChangeLock('link') }))) {
        throw versionConflict(await sharedView(prisma, link));
      }
      return sharedView(prisma, link);
    },
  );

  app.post(
    '/shared/:token/items/toggle',
    {
      config,
      schema: {
        tags,
        summary: 'Check or uncheck a list item through an editor link',
        security: [],
        params: TokenParamsSchema,
        body: ToggleItemSchema,
        response: { 200: SharedNoteSchema },
      },
    },
    async (request, reply) => {
      const link = await useLink(request, reply, request.params.token, 'editor');
      await applyToggleItem(prisma, link.noteId, null, request.body);
      return sharedView(prisma, link);
    },
  );
};
