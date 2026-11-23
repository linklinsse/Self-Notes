import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError, badRequest, notFound } from '../../errors.js';
import { randomToken } from '../../lib/tokens.js';
import { authOf } from '../../plugins/auth.js';
import { UsernameSchema } from '../users/schemas.js';
import { activeLinkWhere, byRoleDesc, requireMemberRole } from '../notes/access.js';
import { IdParamsSchema, RoleSchema, ShareRoleSchema } from '../notes/schemas.js';

const MemberSchema = z.object({
  user: z.object({ id: z.string(), username: z.string() }),
  role: RoleSchema,
});

const LinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  token: z.string(),
  role: ShareRoleSchema,
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

const MemberParamsSchema = z.object({
  id: z.uuid(),
  userId: z.union([z.literal('me'), z.uuid()]).describe('"me" to leave the note'),
});

export const sharingRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma, config } = app;
  app.addHook('onRequest', app.authenticate);
  const tags = ['sharing'];

  const memberInclude = { user: { select: { id: true, username: true } } } as const;
  const linkUrl = (token: string) => `${config.publicUrl}/s/${token}`;
  const toLink = (l: {
    id: string;
    token: string;
    role: 'owner' | 'editor' | 'viewer';
    expiresAt: Date | null;
    createdAt: Date;
    lastUsedAt: Date | null;
  }) => ({
    id: l.id,
    url: linkUrl(l.token),
    token: l.token,
    role: l.role === 'editor' ? ('editor' as const) : ('viewer' as const),
    expiresAt: l.expiresAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    lastUsedAt: l.lastUsedAt?.toISOString() ?? null,
  });

  // ---- Members (SHARE-1 … SHARE-5) ----

  app.get(
    '/notes/:id/members',
    {
      schema: {
        tags,
        summary: 'Who has access to the note',
        params: IdParamsSchema,
        response: { 200: z.array(MemberSchema) },
      },
    },
    async (request) => {
      await requireMemberRole(prisma, request.params.id, authOf(request).userId, 'viewer');
      const members = await prisma.noteMember.findMany({
        where: { noteId: request.params.id },
        include: memberInclude,
        orderBy: { createdAt: 'asc' },
      });
      return members.sort(byRoleDesc); // stable: oldest first within a role
    },
  );

  app.post(
    '/notes/:id/members',
    {
      schema: {
        tags,
        summary: 'Share with a user by username (owner)',
        params: IdParamsSchema,
        body: z.object({ username: UsernameSchema, role: ShareRoleSchema }),
        response: { 201: MemberSchema },
      },
    },
    async (request, reply) => {
      const noteId = request.params.id;
      await requireMemberRole(prisma, noteId, authOf(request).userId, 'owner');
      const user = await prisma.user.findUnique({ where: { username: request.body.username }, select: { id: true } });
      if (!user) throw notFound('No account has this username.');
      const existing = await prisma.noteMember.findUnique({
        where: { noteId_userId: { noteId, userId: user.id } },
        select: { role: true },
      });
      if (existing) throw new AppError(409, 'ALREADY_MEMBER', 'This user already has access to the note.');
      const member = await prisma.noteMember.create({
        data: { noteId, userId: user.id, role: request.body.role },
        include: memberInclude,
      });
      return reply.status(201).send(member);
    },
  );

  app.patch(
    '/notes/:id/members/:userId',
    {
      schema: {
        tags,
        summary: "Change a member's role (owner)",
        params: z.object({ id: z.uuid(), userId: z.uuid() }),
        body: z.object({ role: ShareRoleSchema }),
        response: { 200: MemberSchema },
      },
    },
    async (request) => {
      const { id: noteId, userId } = request.params;
      await requireMemberRole(prisma, noteId, authOf(request).userId, 'owner');
      const target = await prisma.noteMember.findUnique({ where: { noteId_userId: { noteId, userId } } });
      if (!target) throw notFound('Member not found.');
      if (target.role === 'owner') throw badRequest("The owner's role cannot be changed.");
      return prisma.noteMember.update({
        where: { noteId_userId: { noteId, userId } },
        data: { role: request.body.role },
        include: memberInclude,
      });
    },
  );

  app.delete(
    '/notes/:id/members/:userId',
    {
      schema: {
        tags,
        summary: 'Remove a member (owner) or leave the note (userId = "me")',
        params: MemberParamsSchema,
      },
    },
    async (request, reply) => {
      const caller = authOf(request).userId;
      const noteId = request.params.id;
      const target = request.params.userId === 'me' ? caller : request.params.userId;
      const callerRole = await requireMemberRole(prisma, noteId, caller, 'viewer');
      if (target === caller) {
        if (callerRole === 'owner') throw badRequest('The owner cannot leave their own note; delete it instead.');
      } else {
        await requireMemberRole(prisma, noteId, caller, 'owner');
        const member = await prisma.noteMember.findUnique({ where: { noteId_userId: { noteId, userId: target } } });
        if (!member) throw notFound('Member not found.');
      }
      await prisma.$transaction([
        prisma.noteCategory.deleteMany({ where: { noteId, category: { userId: target } } }),
        prisma.noteMember.delete({ where: { noteId_userId: { noteId, userId: target } } }),
      ]);
      return reply.status(204).send();
    },
  );

  // ---- Share links (SHARE-6 … SHARE-9) ----

  app.get(
    '/notes/:id/links',
    {
      schema: {
        tags,
        summary: 'Active share links (owner)',
        params: IdParamsSchema,
        response: { 200: z.array(LinkSchema) },
      },
    },
    async (request) => {
      await requireMemberRole(prisma, request.params.id, authOf(request).userId, 'owner');
      const links = await prisma.shareLink.findMany({
        where: { noteId: request.params.id, ...activeLinkWhere() },
        orderBy: { createdAt: 'asc' },
      });
      return links.map(toLink);
    },
  );

  app.post(
    '/notes/:id/links',
    {
      schema: {
        tags,
        summary: 'Create a share link (owner)',
        params: IdParamsSchema,
        body: z.object({ role: ShareRoleSchema, expiresAt: z.iso.datetime({ offset: true }).optional() }),
        response: { 201: LinkSchema },
      },
    },
    async (request, reply) => {
      const { userId } = authOf(request);
      await requireMemberRole(prisma, request.params.id, userId, 'owner');
      const expiresAt = request.body.expiresAt ? new Date(request.body.expiresAt) : null;
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw badRequest('The expiry date must be in the future.', 'VALIDATION_ERROR');
      }
      const link = await prisma.shareLink.create({
        data: {
          noteId: request.params.id,
          token: randomToken(),
          role: request.body.role,
          expiresAt,
          createdById: userId,
        },
      });
      return reply.status(201).send(toLink(link));
    },
  );

  app.delete(
    '/notes/:id/links/:linkId',
    {
      schema: {
        tags,
        summary: 'Revoke a share link (owner)',
        params: z.object({ id: z.uuid(), linkId: z.uuid() }),
      },
    },
    async (request, reply) => {
      await requireMemberRole(prisma, request.params.id, authOf(request).userId, 'owner');
      const revoked = await prisma.shareLink.updateMany({
        where: { id: request.params.linkId, noteId: request.params.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) throw notFound('Link not found.');
      return reply.status(204).send();
    },
  );
};
